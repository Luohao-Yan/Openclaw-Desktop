/**
 * 实例注册表纯逻辑模块
 *
 * 将 instanceRegistry.ts 中的核心 CRUD 逻辑提取为纯函数和纯类，
 * 不依赖 Electron、electron-store、safeStorage 等运行时环境，便于属性测试。
 *
 * 所有外部依赖（持久化存储、加密、网络请求）均保留在 instanceRegistry.ts 中，
 * 本模块仅包含可独立测试的纯计算逻辑。
 */

import type { RemoteInstanceConfig } from '../../types/remote.js';

// ─── 常量 ────────────────────────────────────────────────────────────────────

/** 最大支持的实例数量 */
export const MAX_INSTANCES = 10;

// ─── 纯函数：生成实例 ID ────────────────────────────────────────────────────

/**
 * 生成唯一的实例 ID
 *
 * 使用 crypto.randomUUID() 生成标准 UUID v4 格式的 ID。
 * 如果运行环境不支持 crypto.randomUUID，则使用简单的随机字符串。
 *
 * @returns 唯一的实例 ID 字符串
 */
export function generateInstanceId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // 降级方案：生成简单的随机 ID
  const chars = 'abcdef0123456789';
  const segments = [8, 4, 4, 4, 12];
  return segments
    .map((len) =>
      Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join(''),
    )
    .join('-');
}

// ─── 纯函数：加密解密往返验证 ────────────────────────────────────────────────

/**
 * 验证加密/解密函数的往返一致性
 *
 * 对给定的 token 执行加密后再解密，验证结果与原始 token 完全一致。
 * 用于在运行时验证 safeStorage 加密功能是否正常工作。
 *
 * @param encrypt 加密函数（如 safeStorage.encryptString）
 * @param decrypt 解密函数（如 safeStorage.decryptString）
 * @param token 待验证的 token 字符串
 * @returns 往返后的 token 是否与原始值一致
 */
export function encryptDecryptRoundTrip(
  encrypt: (s: string) => Buffer,
  decrypt: (b: Buffer) => string,
  token: string,
): boolean {
  const encrypted = encrypt(token);
  const decrypted = decrypt(encrypted);
  return decrypted === token;
}

// ─── 纯类：实例注册表 CRUD 操作 ──────────────────────────────────────────────

/**
 * 实例注册表纯 CRUD 操作类
 *
 * 在内存中维护实例数组，提供添加、删除、更新、查询等纯操作。
 * 不涉及持久化、加密、网络请求等副作用。
 */
export class InstanceRegistryCRUD {
  /** 内存中的实例数组 */
  private _instances: RemoteInstanceConfig[];

  /**
   * 使用已有实例数组初始化
   *
   * @param instances 初始实例数组
   */
  constructor(instances: RemoteInstanceConfig[]) {
    this._instances = [...instances];
  }

  /**
   * 添加新实例
   *
   * 生成唯一 ID 和创建时间，将新实例追加到数组末尾。
   *
   * @param config 实例配置（不含 id 和 createdAt）
   * @returns 包含更新后数组和新实例 ID 的对象
   */
  add(config: Omit<RemoteInstanceConfig, 'id' | 'createdAt'>): {
    instances: RemoteInstanceConfig[];
    newId: string;
  } {
    const newId = generateInstanceId();
    const newInstance: RemoteInstanceConfig = {
      ...config,
      id: newId,
      createdAt: new Date().toISOString(),
    };
    this._instances = [...this._instances, newInstance];
    return { instances: this._instances, newId };
  }

  /**
   * 删除指定实例
   *
   * 根据实例 ID 从数组中移除对应实例。
   * 如果 ID 不存在，数组不变。
   *
   * @param instanceId 要删除的实例 ID
   * @returns 更新后的实例数组
   */
  remove(instanceId: string): RemoteInstanceConfig[] {
    this._instances = this._instances.filter((i) => i.id !== instanceId);
    return this._instances;
  }

  /**
   * 更新指定实例的配置
   *
   * 根据实例 ID 查找并合并 patch 字段。
   * 如果 ID 不存在，数组不变。
   *
   * @param instanceId 要更新的实例 ID
   * @param patch 要合并的部分配置
   * @returns 更新后的实例数组
   */
  update(
    instanceId: string,
    patch: Partial<RemoteInstanceConfig>,
  ): RemoteInstanceConfig[] {
    this._instances = this._instances.map((i) =>
      i.id === instanceId ? { ...i, ...patch, id: i.id, createdAt: i.createdAt } : i,
    );
    return this._instances;
  }

  /**
   * 获取所有实例
   *
   * @returns 当前实例数组的副本
   */
  getAll(): RemoteInstanceConfig[] {
    return [...this._instances];
  }

  /**
   * 根据 ID 查找实例
   *
   * @param instanceId 实例 ID
   * @returns 匹配的实例，未找到时返回 undefined
   */
  findById(instanceId: string): RemoteInstanceConfig | undefined {
    return this._instances.find((i) => i.id === instanceId);
  }

  /**
   * 获取当前实例数量
   *
   * @returns 实例数量
   */
  getCount(): number {
    return this._instances.length;
  }
}
