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
import { remoteRequest } from './remoteApiProxy.js';
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

// ─── 辅助函数：持久化格式与内存格式转换 ──────────────────────────────────────

/**
 * 从持久化格式转换为内存格式（解密 token）
 */
function fromStoredInstances(): RemoteInstanceConfig[] {
  const stored = store.get('remoteInstances', []) as InstanceRegistryStore['remoteInstances'];
  if (!stored) return [];

  return stored.map((s) => ({
    id: s.id,
    alias: s.alias,
    host: s.host,
    port: s.port,
    protocol: s.protocol,
    token: s.encryptedToken ? decryptToken(s.encryptedToken) : undefined,
    createdAt: s.createdAt,
    lastConnectedAt: s.lastConnectedAt,
  }));
}

/**
 * 将内存格式转换为持久化格式（加密 token）并保存
 */
function saveInstances(instances: RemoteInstanceConfig[]): void {
  const stored = instances.map((i) => ({
    id: i.id,
    alias: i.alias,
    host: i.host,
    port: i.port,
    protocol: i.protocol,
    encryptedToken: i.token ? encryptToken(i.token) : undefined,
    createdAt: i.createdAt,
    lastConnectedAt: i.lastConnectedAt,
  }));
  store.set('remoteInstances', stored);
}

// ─── InstanceRegistry 类 ────────────────────────────────────────────────────

/** 默认刷新超时时间（毫秒） */
const REFRESH_TIMEOUT_MS = 10_000;

/**
 * 实例注册表
 *
 * 管理远程实例的连接配置和状态。
 * 使用 electron-store 持久化，safeStorage 加密 token。
 * 支持至少 10 个实例。
 */
export class InstanceRegistry {
  /** 内部 CRUD 操作实例 */
  private _crud: InstanceRegistryCRUD;
  /** 各实例的最近状态缓存 */
  private _statuses: Map<string, InstanceStatus> = new Map();

  constructor() {
    // 从 electron-store 加载已有实例
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
