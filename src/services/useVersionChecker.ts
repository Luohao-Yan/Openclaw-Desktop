/**
 * 版本检查自定义 Hook
 *
 * 封装版本检查逻辑：定期调用 IPC 获取当前版本和可用版本列表，
 * 使用 hasNewerVersion 比较版本，返回版本状态和手动检查能力。
 *
 * 行为：
 * - 组件挂载时立即执行一次版本检查
 * - 每 30 分钟（默认）自动执行一次检查
 * - IPC 调用失败时静默处理，保持上一次结果不变
 * - 组件卸载时清理定时器
 */

import { useState, useEffect, useCallback, useRef } from 'react';

// ── 内联版本比较纯函数（复用 openclawVersionLogic.ts 的逻辑） ──────────────

/**
 * 解析语义化版本号为 [major, minor, patch] 数字元组
 * 无法解析时返回 [0, 0, 0]
 */
function parseSemver(version: string): [number, number, number] {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!match) return [0, 0, 0];
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/**
 * 比较两个语义化版本号
 * @returns 正数表示 a > b，负数表示 a < b，0 表示相等
 */
function compareSemver(a: string, b: string): number {
  const [aMajor, aMinor, aPatch] = parseSemver(a);
  const [bMajor, bMinor, bPatch] = parseSemver(b);
  if (aMajor !== bMajor) return aMajor - bMajor;
  if (aMinor !== bMinor) return aMinor - bMinor;
  return aPatch - bPatch;
}

/**
 * 检测可用版本列表中是否存在比当前版本更新的版本
 */
export function hasNewerVersion(current: string, available: string[]): boolean {
  return available.some((v) => compareSemver(v, current) > 0);
}

/** 默认轮询间隔：30 分钟（毫秒） */
const DEFAULT_INTERVAL_MS = 30 * 60 * 1000;

/** 版本检查状态接口 */
export interface VersionCheckState {
  /** 是否有新版本可用 */
  hasUpdate: boolean;
  /** 当前安装版本 */
  currentVersion: string | null;
  /** 最新可用版本 */
  latestVersion: string | null;
  /** 是否正在检查中 */
  isChecking: boolean;
  /** 手动触发版本检查 */
  checkNow: () => Promise<void>;
}

/**
 * 版本检查纯逻辑函数（可独立测试）
 *
 * 调用 IPC 获取当前版本和可用版本列表，比较后返回新状态。
 * 任一 IPC 调用失败时返回 null，表示应保持上一次状态不变。
 *
 * @param getCurrent 获取当前版本的函数
 * @param listAvailable 获取可用版本列表的函数
 * @returns 新的版本检查状态，或 null（表示调用失败，应保持原状态）
 */
export async function checkVersion(
  getCurrent: () => Promise<{ success: boolean; version?: string; error?: string }>,
  listAvailable: () => Promise<{ success: boolean; versions?: string[]; latest?: string; error?: string }>,
): Promise<{ hasUpdate: boolean; currentVersion: string; latestVersion: string } | null> {
  try {
    // 并行调用两个 IPC 通道
    const [currentRes, availableRes] = await Promise.all([
      getCurrent(),
      listAvailable(),
    ]);

    // 任一调用返回失败，静默保持上一次状态
    if (!currentRes.success || !availableRes.success) {
      return null;
    }

    const current = currentRes.version;
    const versions = availableRes.versions;
    const latest = availableRes.latest;

    // 缺少必要数据时，静默保持上一次状态
    if (!current || !versions || versions.length === 0) {
      return null;
    }

    // 使用 hasNewerVersion 纯函数比较版本
    const update = hasNewerVersion(current, versions);

    return {
      hasUpdate: update,
      currentVersion: current,
      latestVersion: latest || versions[0] || current,
    };
  } catch {
    // IPC 调用抛出异常时，静默保持上一次状态
    return null;
  }
}

/**
 * 版本检查自定义 Hook
 *
 * @param intervalMs 轮询间隔（毫秒），默认 30 分钟
 * @returns 版本检查状态
 */
export function useVersionChecker(intervalMs: number = DEFAULT_INTERVAL_MS): VersionCheckState {
  const [hasUpdate, setHasUpdate] = useState(false);
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  /** 使用 ref 防止并发检查 */
  const checkingRef = useRef(false);

  /** 执行版本检查 */
  const performCheck = useCallback(async () => {
    // 防止并发检查
    if (checkingRef.current) return;
    checkingRef.current = true;
    setIsChecking(true);

    try {
      const result = await checkVersion(
        () => window.electronAPI.openclawVersionGetCurrent(),
        () => window.electronAPI.openclawVersionListAvailable(),
      );

      // result 为 null 表示调用失败，保持上一次状态不变
      if (result !== null) {
        setHasUpdate(result.hasUpdate);
        setCurrentVersion(result.currentVersion);
        setLatestVersion(result.latestVersion);
      }
    } finally {
      checkingRef.current = false;
      setIsChecking(false);
    }
  }, []);

  /** 组件挂载时立即检查一次，之后按间隔定时检查 */
  useEffect(() => {
    // 立即执行一次检查
    performCheck();

    // 设置定时轮询
    const timer = setInterval(performCheck, intervalMs);

    // 组件卸载时清理定时器
    return () => {
      clearInterval(timer);
    };
  }, [performCheck, intervalMs]);

  return {
    hasUpdate,
    currentVersion,
    latestVersion,
    isChecking,
    checkNow: performCheck,
  };
}

export default useVersionChecker;
