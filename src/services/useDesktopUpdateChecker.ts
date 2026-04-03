/**
 * 桌面应用更新检查 Hook
 *
 * 调用 IPC 从 GitHub Releases API 获取最新版本，
 * 与当前桌面应用版本比较，返回更新状态。
 *
 * 行为：
 * - 组件挂载时延迟 5 秒执行首次检查（避免启动时阻塞）
 * - 每 60 分钟自动检查一次
 * - IPC 调用失败时静默处理
 */

import { useState, useEffect, useCallback, useRef } from 'react';

/** 默认轮询间隔：60 分钟 */
const DEFAULT_INTERVAL_MS = 60 * 60 * 1000;

/** 首次检查延迟：5 秒 */
const INITIAL_DELAY_MS = 5_000;

/** 桌面应用更新状态 */
export interface DesktopUpdateState {
  /** 是否有新版本 */
  hasUpdate: boolean;
  /** 当前桌面应用版本 */
  currentVersion: string | null;
  /** 最新版本 */
  latestVersion: string | null;
  /** GitHub Release 页面链接 */
  releaseUrl: string | null;
  /** DMG 下载链接 */
  downloadUrl: string | null;
}

/**
 * 桌面应用更新检查 Hook
 */
export function useDesktopUpdateChecker(intervalMs: number = DEFAULT_INTERVAL_MS): DesktopUpdateState {
  const [state, setState] = useState<DesktopUpdateState>({
    hasUpdate: false,
    currentVersion: null,
    latestVersion: null,
    releaseUrl: null,
    downloadUrl: null,
  });

  const checkingRef = useRef(false);

  const performCheck = useCallback(async () => {
    if (checkingRef.current) return;
    checkingRef.current = true;

    try {
      const result = await window.electronAPI.desktopVersionCheckUpdate();
      if (result.success && result.hasUpdate !== undefined) {
        setState({
          hasUpdate: result.hasUpdate,
          currentVersion: result.currentVersion || null,
          latestVersion: result.latestVersion || null,
          releaseUrl: result.releaseUrl || null,
          downloadUrl: result.downloadUrl || null,
        });
      }
    } catch {
      // 静默处理
    } finally {
      checkingRef.current = false;
    }
  }, []);

  useEffect(() => {
    // 延迟首次检查，避免启动时阻塞
    const initialTimer = setTimeout(performCheck, INITIAL_DELAY_MS);

    // 定时轮询
    const intervalTimer = setInterval(performCheck, intervalMs);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(intervalTimer);
    };
  }, [performCheck, intervalMs]);

  return state;
}

export default useDesktopUpdateChecker;
