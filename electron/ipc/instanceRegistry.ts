/**
 * 实例注册表运行时模块
 *
 * 管理远程实例的连接配置和状态，使用 electron-store 持久化，
 * 使用 Electron safeStorage API 加密 token 字段。
 *
 * 纯 CRUD 逻辑已提取到 instanceRegistryLogic.ts，便于属性测试。
 * 本模块负责持久化、加密、网络请求等运行时副作用。
 */

import Store from 'electron-store';
import { safeStorage } from 'electron';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { remoteRequest } from './remoteApiProxy.js';
import { getDesktopFilePath, ensureDesktopDir } from './desktopDir.js';
import {
  InstanceRegistryCRUD,
  generateInstanceId,
  encryptDecryptRoundTrip,
  MAX_INSTANCES,
} from './instanceRegistryLogic.js';
import type {
  RemoteInstanceConfig,
  InstanceStatus,
  ConnectionStatus,
} from '../../types/remote.js';

// 重新导出纯逻辑，供其他模块使用
export {
  InstanceRegistryCRUD,
  generateInstanceId,
  encryptDecryptRoundTrip,
  MAX_INSTANCES,
} from './instanceRegistryLogic.js';

// ─── electron-store 持久化结构 ───────────────────────────────────────────────

/** 实例注册表持久化配置结构 */
interface InstanceRegistryStore {
  remoteInstances?: Array<{
    id: string;
    alias: string;
    host: string;
    port: number;
    protocol: 'http' | 'https';
    /** 加密后的 token（通过 safeStorage 加密，Base64 编码） */
    encryptedToken?: string;
    createdAt: string;
    lastConnectedAt?: string;
    lastStatus?: ConnectionStatus;
    lastVersion?: string;
  }>;
}

const store = new Store<InstanceRegistryStore>();

// ─── 常量：instances.json 文件路径 ──────────────────────────────────────────

/**
 * 获取 instances.json 文件路径
 *
 * 路径由 desktopDir 模块统一管理（~/.openclawdesktop/instances.json）。
 * 延迟调用以确保 desktopDir 已初始化。
 */
const getInstancesFilePath = () => getDesktopFilePath('instances.json');

// ─── 辅助函数：token 加密/解密 ──────────────────────────────────────────────

/**
 * 加密 token 字符串
 *
 * 使用 Electron safeStorage API 加密，返回 Base64 编码的字符串。
 * 如果 safeStorage 不可用，返回原始 token（开发环境降级）。
 *
 * @param token 明文 token
 * @returns Base64 编码的加密 token
 */
function encryptToken(token: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(token);
    return encrypted.toString('base64');
  }
  // 降级：开发环境或不支持加密时直接返回
  return token;
}

/**
 * 解密 token 字符串
 *
 * 将 Base64 编码的加密 token 解密为明文。
 * 如果 safeStorage 不可用，返回原始字符串（开发环境降级）。
 *
 * @param encryptedToken Base64 编码的加密 token
 * @returns 明文 token
 */
function decryptToken(encryptedToken: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    const buffer = Buffer.from(encryptedToken, 'base64');
    return safeStorage.decryptString(buffer);
  }
  // 降级：开发环境或不支持加密时直接返回
  return encryptedToken;
}

// ─── 辅助函数：instances.json 文件读写（非敏感元数据）───────────────────────

/**
 * instances.json 文件中存储的单条实例结构
 *
 * 仅包含非敏感字段，token 不在此存储。
 */
interface StoredInstanceMeta {
  id: string;
  alias: string;
  host: string;
  port: number;
  protocol: 'http' | 'https';
  createdAt: string;
  lastConnectedAt?: string;
}

/**
 * electron-store 中仅存储加密 token 的精简结构
 *
 * 不包含元数据字段，避免与 instances.json 产生数据冗余。
 */
interface StoredTokenEntry {
  id: string;
  encryptedToken: string;
}

/**
 * 从 ~/.openclawdesktop/instances.json 读取实例元数据列表
 *
 * 文件不存在时静默返回空数组，解析失败时同样返回空数组并打印警告。
 *
 * @returns 实例元数据数组
 */
function readInstancesFile(): StoredInstanceMeta[] {
  const filePath = getInstancesFilePath();
  try {
    if (!existsSync(filePath)) {
      return [];
    }
    const content = readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed)) {
      console.warn('[InstanceRegistry] instances.json 格式异常，期望数组，已忽略');
      return [];
    }
    return parsed as StoredInstanceMeta[];
  } catch (err) {
    console.warn('[InstanceRegistry] 读取 instances.json 失败，已忽略:', err);
    return [];
  }
}

/**
 * 将实例元数据列表写入 ~/.openclawdesktop/instances.json
 *
 * 写入前确保目录存在，使用 JSON.stringify 格式化输出便于用户查阅。
 *
 * @param metas 实例元数据数组
 */
function writeInstancesFile(metas: StoredInstanceMeta[]): void {
  try {
    ensureDesktopDir();
    const filePath = getInstancesFilePath();
    writeFileSync(filePath, JSON.stringify(metas, null, 2) + '\n', 'utf8');
  } catch (err) {
    console.error('[InstanceRegistry] 写入 instances.json 失败:', err);
  }
}

// ─── 一次性迁移：从 electron-store 迁移旧数据到 instances.json ─────────────

/**
 * 将旧版本存储在 electron-store 中的实例元数据迁移到 instances.json
 *
 * 迁移策略：
 *   1. 检查 instances.json 是否已存在（存在则跳过，避免重复迁移）
 *   2. 读取 electron-store 中的 remoteInstances
 *   3. 将非敏感字段写入 instances.json
 *   4. 清除 electron-store 中的 remoteInstances 键（token 保留）
 *
 * 此函数在 fromStoredInstances() 首次调用前执行一次。
 */
function migrateFromStoreLegacy(): void {
  const instancesFilePath = getInstancesFilePath();

  // 已存在文件则跳过（迁移过一次即可）
  if (existsSync(instancesFilePath)) {
    return;
  }

  const legacyStored = store.get('remoteInstances') as InstanceRegistryStore['remoteInstances'];
  if (!legacyStored || legacyStored.length === 0) {
    return;
  }

  // 只迁移非敏感字段到文件
  const metas: StoredInstanceMeta[] = legacyStored.map((s) => ({
    id: s.id,
    alias: s.alias,
    host: s.host,
    port: s.port,
    protocol: s.protocol,
    createdAt: s.createdAt,
    lastConnectedAt: s.lastConnectedAt,
  }));

  writeInstancesFile(metas);
  console.log(`[InstanceRegistry] 已将 ${metas.length} 条实例元数据迁移到 instances.json`);

  // 将旧格式（含元数据 + token）改写为新格式（仅含 id + encryptedToken）
  // 元数据已迁移到 instances.json， store 中保留的 token 不受影响
  const tokenEntries: StoredTokenEntry[] = legacyStored
    .filter((s) => !!s.encryptedToken)
    .map((s) => ({ id: s.id, encryptedToken: s.encryptedToken! }));
  store.set('remoteInstances', tokenEntries);
}

// ─── 辅助函数：持久化格式与内存格式转换 ──────────────────────────────────────

/**
 * 从持久化存储（instances.json + electron-store token）加载实例
 *
 * 数据分层：
 *   - 非敏感元数据 ← ~/.openclawdesktop/instances.json
 *   - 加密 token  ← electron-store（safeStorage 加密，与系统账户绑定）
 *
 * 首次调用时触发旧版本迁移。
 *
 * @returns 内存中的完整实例配置数组
 */
function fromStoredInstances(): RemoteInstanceConfig[] {
  // 首次调用时尝试迁移旧数据
  migrateFromStoreLegacy();

  const metas = readInstancesFile();
  const tokenEntries = store.get('remoteInstances', []) as StoredTokenEntry[];

  return metas.map((meta) => {
    // 从 store 中按 id 查找对应的加密 token
    const tokenEntry = tokenEntries?.find((s) => s.id === meta.id);
    const encryptedToken = tokenEntry?.encryptedToken;

    return {
      id: meta.id,
      alias: meta.alias,
      host: meta.host,
      port: meta.port,
      protocol: meta.protocol,
      token: encryptedToken ? decryptToken(encryptedToken) : undefined,
      createdAt: meta.createdAt,
      lastConnectedAt: meta.lastConnectedAt,
    };
  });
}

/**
 * 持久化实例列表
 *
 * 数据分层写入：
 *   - 非敏感元数据 → ~/.openclawdesktop/instances.json
 *   - 加密 token  → electron-store（safeStorage 加密）
 *
 * @param instances 完整实例配置数组
 */
function saveInstances(instances: RemoteInstanceConfig[]): void {
  // 写入非敏感元数据到文件
  const metas: StoredInstanceMeta[] = instances.map((i) => ({
    id: i.id,
    alias: i.alias,
    host: i.host,
    port: i.port,
    protocol: i.protocol,
    createdAt: i.createdAt,
    lastConnectedAt: i.lastConnectedAt,
  }));
  writeInstancesFile(metas);

  // 写入加密 token 到 electron-store（仅保存有 token 的实例，只存 id + encryptedToken）
  const tokenEntries: StoredTokenEntry[] = instances
    .filter((i) => i.token)
    .map((i) => ({
      id: i.id,
      encryptedToken: encryptToken(i.token!),
    }));
  store.set('remoteInstances', tokenEntries);
}

// ─── InstanceRegistry 类 ────────────────────────────────────────────────────

/** 默认刷新超时时间（毫秒） */
const REFRESH_TIMEOUT_MS = 10_000;

/**
 * 实例注册表
 *
 * 管理远程实例的连接配置和状态。
 * 分层存储架构：
 *   - 非敏感元数据（alias/host/port 等）持久化到 ~/.openclawdesktop/instances.json
 *   - 加密 token 保留在 electron-store（safeStorage 加密，与系统账户绑定）
 * 支持至少 10 个实例。
 */
export class InstanceRegistry {
  /** 内部 CRUD 操作实例 */
  private _crud: InstanceRegistryCRUD;
  /** 各实例的最近状态缓存 */
  private _statuses: Map<string, InstanceStatus> = new Map();

  constructor() {
    // 从分层存储加载已有实例（instances.json + electron-store token）
    const instances = fromStoredInstances();
    this._crud = new InstanceRegistryCRUD(instances);
  }

  /**
   * 获取所有已注册实例
   *
   * @returns 实例配置数组
   */
  getAll(): RemoteInstanceConfig[] {
    return this._crud.getAll();
  }

  /**
   * 添加新实例
   *
   * 先通过 GET /status 测试连接，通过后持久化到 electron-store。
   *
   * @param config 实例配置（不含 id 和 createdAt）
   * @returns 操作结果
   */
  async add(
    config: Omit<RemoteInstanceConfig, 'id' | 'createdAt'>,
  ): Promise<{ success: boolean; id?: string; error?: string }> {
    // 检查实例数量上限
    if (this._crud.getCount() >= MAX_INSTANCES) {
      return {
        success: false,
        error: `已达到最大实例数量限制（${MAX_INSTANCES}），请先删除不需要的实例`,
      };
    }

    // 先测试连接：向目标实例发送 GET /status
    try {
      const baseUrl = `${config.protocol}://${config.host}:${config.port}`;
      const headers: Record<string, string> = {
        Accept: 'application/json',
      };
      if (config.token) {
        headers['Authorization'] = `Bearer ${config.token}`;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REFRESH_TIMEOUT_MS);

      try {
        const response = await fetch(`${baseUrl}/status`, {
          method: 'GET',
          headers,
          signal: controller.signal,
        });

        if (!response.ok) {
          return {
            success: false,
            error: `连接测试失败：远程服务器返回状态码 ${response.status}`,
          };
        }
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return { success: false, error: '连接测试超时，请检查远程服务器是否可达' };
      }
      return { success: false, error: `连接测试失败：${err.message || '网络错误'}` };
    }

    // 连接测试通过，添加实例
    const { instances, newId } = this._crud.add(config);
    saveInstances(instances);

    return { success: true, id: newId };
  }

  /**
   * 删除实例
   *
   * 从 store 移除并清除状态缓存。
   *
   * @param instanceId 要删除的实例 ID
   */
  remove(instanceId: string): void {
    const instances = this._crud.remove(instanceId);
    saveInstances(instances);
    this._statuses.delete(instanceId);
  }

  /**
   * 更新实例配置
   *
   * @param instanceId 要更新的实例 ID
   * @param patch 要合并的部分配置
   */
  update(instanceId: string, patch: Partial<RemoteInstanceConfig>): void {
    const instances = this._crud.update(instanceId, patch);
    saveInstances(instances);
  }

  /**
   * 获取所有实例的状态
   *
   * @returns 实例状态数组
   */
  getStatuses(): InstanceStatus[] {
    return Array.from(this._statuses.values());
  }

  /**
   * 并行刷新所有实例状态
   *
   * 向所有已注册实例发送 GET /status，10 秒超时。
   * 未响应的实例标记为 disconnected。
   *
   * @returns 所有实例的最新状态
   */
  async refreshAll(): Promise<InstanceStatus[]> {
    const instances = this._crud.getAll();

    const statusPromises = instances.map(async (instance): Promise<InstanceStatus> => {
      const startTime = Date.now();
      try {
        const baseUrl = `${instance.protocol}://${instance.host}:${instance.port}`;
        const headers: Record<string, string> = {
          Accept: 'application/json',
        };
        if (instance.token) {
          headers['Authorization'] = `Bearer ${instance.token}`;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REFRESH_TIMEOUT_MS);

        try {
          const response = await fetch(`${baseUrl}/status`, {
            method: 'GET',
            headers,
            signal: controller.signal,
          });

          const endTime = Date.now();
          const latencyMs = endTime - startTime;

          if (response.ok) {
            let version: string | undefined;
            try {
              const data = await response.json();
              version = data?.version;
            } catch {
              // 忽略 JSON 解析错误
            }

            const status: InstanceStatus = {
              id: instance.id,
              status: 'connected',
              version,
              latencyMs,
              lastCheckedAt: new Date().toISOString(),
            };
            this._statuses.set(instance.id, status);
            return status;
          }

          // 非 2xx 响应
          const status: InstanceStatus = {
            id: instance.id,
            status: 'error',
            latencyMs,
            lastCheckedAt: new Date().toISOString(),
          };
          this._statuses.set(instance.id, status);
          return status;
        } finally {
          clearTimeout(timeoutId);
        }
      } catch {
        // 超时或网络错误
        const status: InstanceStatus = {
          id: instance.id,
          status: 'disconnected',
          lastCheckedAt: new Date().toISOString(),
        };
        this._statuses.set(instance.id, status);
        return status;
      }
    });

    return Promise.all(statusPromises);
  }
}
