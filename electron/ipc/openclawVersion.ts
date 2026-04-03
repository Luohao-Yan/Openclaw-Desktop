/**
 * OpenClaw 版本管理 IPC 处理模块
 *
 * 提供版本查询、可用版本列表获取、版本安装/切换、历史记录查询等功能。
 * 遵循现有 IPC 模块模式（settings.ts），导出 setupOpenclawVersionIPC() 函数。
 *
 * 核心纯逻辑委托给 openclawVersionLogic.ts，
 * 本模块负责 IPC 注册、命令执行、网络请求和持久化存储。
 */

import pkg from 'electron';
const { ipcMain } = pkg;
import type { IpcMainInvokeEvent, WebContents } from 'electron';
import Store from 'electron-store';

import { spawnWithShellPath } from './spawnHelper.js';
import {
  sortVersionsDescending,
  addHistoryRecord,
  buildInstallCommand,
  buildSuccessResponse,
  buildErrorResponse,
  hasNewerVersion,
  compareSemver,
  isCacheValid,
} from './openclawVersionLogic.js';
import type {
  VersionHistoryRecord,
  VersionCache,
  GetCurrentVersionResponse,
  ListAvailableVersionsResponse,
  InstallVersionResponse,
  GetVersionHistoryResponse,
} from './openclawVersionLogic.js';
import { SUPPORTED_MANIFEST_VERSIONS } from '../config/manifest-version.js';

// ─── 常量 ────────────────────────────────────────────────────────────────────

/** 安装超时：5 分钟 */
const INSTALL_TIMEOUT_MS = 300_000;

/** electron-store 历史记录键 */
const STORE_KEY_HISTORY = 'openclawVersionHistory';

/** npm registry 查询 URL */
const NPM_REGISTRY_URL = 'https://registry.npmjs.org/openclaw';

/** npm registry 请求超时：10 秒 */
const NPM_FETCH_TIMEOUT_MS = 10_000;

/** 版本列表缓存 TTL：30 分钟 */
const VERSION_CACHE_TTL_MS = 30 * 60 * 1000;

// ─── 模块状态 ────────────────────────────────────────────────────────────────

/** 安装锁，防止并发安装 */
let isInstalling = false;

/** 版本列表内存缓存 */
let versionCache: VersionCache | null = null;

/** electron-store 实例 */
const store = new Store();

// ─── 内部函数：获取当前版本 ──────────────────────────────────────────────────

/**
 * 执行 `openclaw --version` 获取当前安装版本
 *
 * 解析命令输出，提取版本号字符串。
 * 失败时返回错误响应。
 */
async function getCurrentVersion(): Promise<GetCurrentVersionResponse> {
  try {
    const result = await spawnWithShellPath('openclaw', ['--version'], {
      timeoutMs: 10_000,
    });

    if (!result.success) {
      return buildErrorResponse(result.error || '执行 openclaw --version 失败');
    }

    // 从输出中提取版本号（如 "openclaw 3.24.0" → "3.24.0"）
    const output = result.output.trim();
    const versionMatch = /(\d+\.\d+\.\d+)/.exec(output);
    const version = versionMatch ? versionMatch[1] : output;

    return buildSuccessResponse({ version });
  } catch (error) {
    return buildErrorResponse(
      error instanceof Error ? error.message : '获取当前版本时发生未知错误',
    );
  }
}

// ─── 内部函数：从 npm registry 获取可用版本列表 ─────────────────────────────

/**
 * 从 npm registry 获取 openclaw 包的所有已发布版本
 *
 * 仅提取正式版本号（排除 alpha/beta/rc 等预发布标签），
 * 请求失败时返回 null，由调用方降级到本地配置。
 */
async function fetchVersionsFromNpm(): Promise<string[] | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), NPM_FETCH_TIMEOUT_MS);

    const response = await fetch(NPM_REGISTRY_URL, {
      headers: { Accept: 'application/vnd.npm.install-v1+json' },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    const data = await response.json() as { versions?: Record<string, unknown> };
    if (!data.versions) {
      return null;
    }

    // 提取所有版本号，过滤掉预发布版本（含 - 的如 1.0.0-beta.1）
    const allVersions = Object.keys(data.versions)
      .filter((v) => /^\d+\.\d+\.\d+$/.test(v));

    return allVersions.length > 0 ? allVersions : null;
  } catch {
    // 网络错误、超时等，静默返回 null
    return null;
  }
}

/**
 * 获取可用版本列表
 *
 * 优先从 npm registry 动态获取最新版本列表（带内存缓存），
 * 网络不可用时降级到本地 SUPPORTED_MANIFEST_VERSIONS 配置。
 *
 * 缓存策略：
 * - 内存缓存 30 分钟，避免频繁请求 npm registry
 * - 缓存过期后重新请求，请求失败则继续使用过期缓存
 */
async function listAvailableVersions(): Promise<ListAvailableVersionsResponse> {
  try {
    const now = Date.now();

    // 检查内存缓存是否有效
    if (versionCache && isCacheValid(versionCache.cachedAt, VERSION_CACHE_TTL_MS, now)) {
      const sorted = sortVersionsDescending(versionCache.versions);
      return buildSuccessResponse({
        versions: sorted,
        latest: sorted[0],
      });
    }

    // 缓存过期或不存在，从 npm registry 获取
    const npmVersions = await fetchVersionsFromNpm();

    if (npmVersions && npmVersions.length > 0) {
      // npm 获取成功，更新缓存
      versionCache = { versions: npmVersions, cachedAt: now };
      const sorted = sortVersionsDescending(npmVersions);
      return buildSuccessResponse({
        versions: sorted,
        latest: sorted[0],
      });
    }

    // npm 获取失败，尝试使用过期缓存
    if (versionCache && versionCache.versions.length > 0) {
      const sorted = sortVersionsDescending(versionCache.versions);
      return buildSuccessResponse({
        versions: sorted,
        latest: sorted[0],
      });
    }

    // 完全无缓存且网络不可用，降级到本地配置
    const localVersions = [...SUPPORTED_MANIFEST_VERSIONS].map(v => `2026.${v}`);
    const sorted = sortVersionsDescending(localVersions);
    return buildSuccessResponse({
      versions: sorted,
      latest: sorted[0],
    });
  } catch (error) {
    return buildErrorResponse(
      error instanceof Error ? error.message : '获取可用版本列表时发生未知错误',
    );
  }
}

// ─── 内部函数：安装指定版本 ──────────────────────────────────────────────────

/**
 * 安装指定版本的 OpenClaw
 *
 * 使用 buildInstallCommand 构建跨平台安装命令，
 * 通过 spawnWithShellPath 执行，实时推送安装日志到渲染进程。
 * 安装完成后重新检测版本并写入历史记录。
 *
 * @param sender WebContents 实例，用于推送实时日志
 * @param targetVersion 目标版本号
 */
async function installVersion(
  sender: WebContents,
  targetVersion: string,
): Promise<InstallVersionResponse> {
  // 并发安装锁检查
  if (isInstalling) {
    return buildErrorResponse('已有安装任务正在执行，请等待完成后再试');
  }

  isInstalling = true;

  try {
    // 获取安装前的当前版本（用于历史记录）
    const beforeResult = await getCurrentVersion();
    const fromVersion = beforeResult.success && beforeResult.version
      ? beforeResult.version
      : 'unknown';

    // 构建安装命令
    const { command, shell } = buildInstallCommand(process.platform, targetVersion);

    // 通过 spawnWithShellPath 执行安装脚本
    const result = await spawnWithShellPath(shell, ['-c', command], {
      timeoutMs: INSTALL_TIMEOUT_MS,
      extraEnv: { OPENCLAW_VERSION: targetVersion },
      onOutput: (data: string, _isError: boolean) => {
        // 实时推送安装日志到渲染进程
        try {
          sender.send('openclaw-version:install-output', data);
        } catch {
          // sender 可能已销毁，忽略错误
        }
      },
    });

    if (!result.success) {
      return buildErrorResponse(result.error || '安装脚本执行失败');
    }

    // 安装完成后重新检测版本
    const afterResult = await getCurrentVersion();
    const installedVersion = afterResult.success && afterResult.version
      ? afterResult.version
      : targetVersion;

    // 写入历史记录
    try {
      const history = (store.get(STORE_KEY_HISTORY) as VersionHistoryRecord[] | undefined) || [];
      const record: VersionHistoryRecord = {
        timestamp: new Date().toISOString(),
        fromVersion,
        toVersion: installedVersion,
        type: fromVersion !== 'unknown' && compareSemver(installedVersion, fromVersion) > 0 ? 'upgrade' : 'switch',
      };
      const updatedHistory = addHistoryRecord(history, record);
      store.set(STORE_KEY_HISTORY, updatedHistory);
    } catch {
      // 历史记录写入失败不阻断核心功能
    }

    return buildSuccessResponse({ version: installedVersion });
  } catch (error) {
    return buildErrorResponse(
      error instanceof Error ? error.message : '安装版本时发生未知错误',
    );
  } finally {
    isInstalling = false;
  }
}

// ─── 内部函数：获取版本历史 ──────────────────────────────────────────────────

/**
 * 从 electron-store 读取版本切换历史记录
 */
async function getVersionHistory(): Promise<GetVersionHistoryResponse> {
  try {
    const history = (store.get(STORE_KEY_HISTORY) as VersionHistoryRecord[] | undefined) || [];
    return buildSuccessResponse({ history });
  } catch (error) {
    return buildErrorResponse(
      error instanceof Error ? error.message : '获取版本历史时发生未知错误',
    );
  }
}

// ─── IPC 注册 ────────────────────────────────────────────────────────────────

/**
 * 注册 OpenClaw 版本管理相关的 IPC 处理器
 *
 * 在 electron/main.ts 中调用，注册以下通道：
 * - openclaw-version:get-current — 获取当前安装版本
 * - openclaw-version:list-available — 获取可用版本列表
 * - openclaw-version:install — 安装指定版本
 * - openclaw-version:get-history — 获取版本切换历史
 */
export function setupOpenclawVersionIPC(): void {
  // 获取当前安装版本
  ipcMain.handle('openclaw-version:get-current', async () => {
    return getCurrentVersion();
  });

  // 获取可用版本列表（含缓存和离线降级）
  ipcMain.handle('openclaw-version:list-available', async () => {
    return listAvailableVersions();
  });

  // 安装指定版本（含实时日志推送和并发锁）
  ipcMain.handle(
    'openclaw-version:install',
    async (event: IpcMainInvokeEvent, version: string) => {
      return installVersion(event.sender, version);
    },
  );

  // 获取版本切换历史记录
  ipcMain.handle('openclaw-version:get-history', async () => {
    return getVersionHistory();
  });
}
