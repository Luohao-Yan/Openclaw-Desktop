/**
 * OpenClaw 版本管理纯逻辑模块
 *
 * 将版本排序、缓存判断、历史记录管理、安装命令构建等核心逻辑
 * 提取为纯函数，不依赖 Electron/Node.js API，便于属性测试。
 *
 * 遵循 spawnHelperLogic.ts / clawhubInstallLogic.ts 的模式，
 * 所有外部依赖通过参数注入。
 */

// ─── 类型定义 ────────────────────────────────────────────────────────────────

/** 版本切换历史记录 */
export interface VersionHistoryRecord {
  /** 操作时间戳（ISO 8601） */
  timestamp: string;
  /** 操作前版本 */
  fromVersion: string;
  /** 操作后版本 */
  toVersion: string;
  /** 操作类型 */
  type: 'upgrade' | 'switch';
}

/** 版本列表缓存结构 */
export interface VersionCache {
  /** 缓存的版本列表 */
  versions: string[];
  /** 缓存时间戳（Date.now()） */
  cachedAt: number;
}

/** 获取当前版本的 IPC 响应 */
export interface GetCurrentVersionResponse {
  success: boolean;
  version?: string;
  error?: string;
}

/** 获取可用版本列表的 IPC 响应 */
export interface ListAvailableVersionsResponse {
  success: boolean;
  versions?: string[];
  latest?: string;
  error?: string;
}

/** 安装版本的 IPC 响应 */
export interface InstallVersionResponse {
  success: boolean;
  version?: string;
  error?: string;
}

/** 获取版本历史的 IPC 响应 */
export interface GetVersionHistoryResponse {
  success: boolean;
  history?: VersionHistoryRecord[];
  error?: string;
}

// ─── 纯函数：语义化版本解析 ─────────────────────────────────────────────────

/**
 * 将语义化版本字符串解析为 [major, minor, patch] 数字元组
 *
 * 仅处理 major.minor.patch 格式，不支持预发布标签。
 * 无法解析时返回 [0, 0, 0]。
 *
 * @param version 版本字符串，如 "1.2.3"
 * @returns [major, minor, patch] 数字元组
 */
export function parseSemver(version: string): [number, number, number] {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!match) {
    return [0, 0, 0];
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/**
 * 比较两个语义化版本号
 *
 * @param a 版本字符串 a
 * @param b 版本字符串 b
 * @returns 正数表示 a > b，负数表示 a < b，0 表示相等
 */
export function compareSemver(a: string, b: string): number {
  const [aMajor, aMinor, aPatch] = parseSemver(a);
  const [bMajor, bMinor, bPatch] = parseSemver(b);

  if (aMajor !== bMajor) return aMajor - bMajor;
  if (aMinor !== bMinor) return aMinor - bMinor;
  return aPatch - bPatch;
}

// ─── 纯函数：版本列表降序排列 ───────────────────────────────────────────────

/**
 * 将版本列表按语义化版本号降序排列
 *
 * 不修改原数组，返回新的排序后数组。
 * 最新版本排在最前面。
 *
 * @param versions 版本字符串数组
 * @returns 降序排列后的新数组
 */
export function sortVersionsDescending(versions: string[]): string[] {
  return [...versions].sort((a, b) => compareSemver(b, a));
}

// ─── 纯函数：缓存有效性判断 ─────────────────────────────────────────────────

/**
 * 判断缓存是否仍然有效
 *
 * 当前时间与缓存时间的差值小于 TTL 时，缓存有效。
 * 接受 now 参数而非使用 Date.now()，便于测试。
 *
 * @param cachedAt 缓存创建时间戳（毫秒）
 * @param ttlMs 缓存有效期（毫秒）
 * @param now 当前时间戳（毫秒）
 * @returns 缓存是否有效
 */
export function isCacheValid(cachedAt: number, ttlMs: number, now: number): boolean {
  return (now - cachedAt) < ttlMs;
}

// ─── 纯函数：新版本检测 ─────────────────────────────────────────────────────

/**
 * 检测可用版本列表中是否存在比当前版本更新的版本
 *
 * 遍历 available 列表，只要存在一个版本严格大于 current 即返回 true。
 *
 * @param current 当前安装的版本号
 * @param available 可用版本列表
 * @returns 是否存在更新版本
 */
export function hasNewerVersion(current: string, available: string[]): boolean {
  return available.some((v) => compareSemver(v, current) > 0);
}

// ─── 纯函数：历史记录管理 ───────────────────────────────────────────────────

/**
 * 添加版本切换历史记录（FIFO 策略）
 *
 * 将新记录追加到列表末尾，当超过 maxRecords 时移除最早的记录。
 * 不修改原数组，返回新数组。
 *
 * @param history 现有历史记录列表
 * @param record 新的历史记录
 * @param maxRecords 最大保留条数（默认 20）
 * @returns 更新后的历史记录列表
 */
export function addHistoryRecord(
  history: VersionHistoryRecord[],
  record: VersionHistoryRecord,
  maxRecords: number = 20,
): VersionHistoryRecord[] {
  const updated = [...history, record];
  // 超出上限时，从头部移除最早的记录（FIFO）
  if (updated.length > maxRecords) {
    return updated.slice(updated.length - maxRecords);
  }
  return updated;
}

// ─── 纯函数：跨平台安装命令构建 ─────────────────────────────────────────────

/**
 * 根据平台类型和目标版本构建安装命令
 *
 * - Windows (win32)：使用 PowerShell 执行 install.ps1
 * - macOS/Linux (darwin/linux)：使用 bash 执行 install.sh
 * - 通过 OPENCLAW_VERSION 环境变量传递目标版本号
 *
 * @param platform 运行平台（NodeJS.Platform）
 * @param targetVersion 目标版本号
 * @returns 包含 command 和 shell 的对象
 */
export function buildInstallCommand(
  platform: NodeJS.Platform,
  targetVersion: string,
): { command: string; shell: string } {
  if (platform === 'win32') {
    // Windows：PowerShell 设置环境变量并执行 install.ps1
    return {
      command: `$env:OPENCLAW_VERSION="${targetVersion}"; irm https://raw.githubusercontent.com/nicepkg/openclaw/main/install.ps1 | iex`,
      shell: 'powershell',
    };
  }

  // macOS / Linux：bash 设置环境变量并执行 install.sh
  return {
    command: `OPENCLAW_VERSION="${targetVersion}" bash -c "$(curl -fsSL https://raw.githubusercontent.com/nicepkg/openclaw/main/install.sh)"`,
    shell: 'bash',
  };
}

// ─── 纯函数：统一 IPC 响应构建 ──────────────────────────────────────────────

/**
 * 构建成功的 IPC 响应
 *
 * 将 data 对象展开并附加 success: true 字段。
 *
 * @param data 响应数据
 * @returns 包含 success: true 的响应对象
 */
export function buildSuccessResponse<T extends Record<string, unknown>>(
  data: T,
): { success: true } & T {
  return { success: true as const, ...data };
}

/**
 * 构建失败的 IPC 响应
 *
 * @param error 错误信息字符串
 * @returns 包含 success: false 和 error 的响应对象
 */
export function buildErrorResponse(error: string): { success: false; error: string } {
  return { success: false as const, error };
}
