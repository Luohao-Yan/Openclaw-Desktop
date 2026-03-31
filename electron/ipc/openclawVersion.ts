/**
 * OpenClaw 版本管理 IPC 处理模块
 *
 * 提供版本查询、可用版本列表获取、版本安装/切换、历史记录查询等功能。
 * 遵循现有 IPC 模块模式（settings.ts），导出 setupOpenclawVersionIPC() 函数。
 *
 * 核心纯逻辑委托给 openclawVersionLogic.ts，
 * 本模块负责 IPC 注册、命令执行、网络请求和持久化存储。
 */

import https from 'node:https';
import pkg from 'electron';
const { ipcMain } = pkg;
import type { IpcMainInvokeEvent, WebContents } from 'electron';
import Store from 'electron-store';

import { spawnWithShellPath } from './spawnHelper.js';
import {
  sortVersionsDescending,
  isCacheValid,
  addHistoryRecord,
  buildInstallCommand,
  buildSuccessResponse,
  buildErrorResponse,
} from './openclawVersionLogic.js';
import type {
  VersionCache,
  VersionHistoryRecord,
  GetCurrentVersionResponse,
  ListAvailableVersionsResponse,
  InstallVersionResponse,
  GetVersionHistoryResponse,
} from './openclawVersionLogic.js';

// ─── 常量 ────────────────────────────────────────────────────────────────────

/** 缓存有效期：10 分钟 */
const CACHE_TTL_MS = 600_000;

/** 安装超时：5 分钟 */
const INSTALL_TIMEOUT_MS = 300_000;

/** electron-store 缓存键 */
const STORE_KEY_CACHE = 'openclawVersionCache';

/** electron-store 历史记录键 */
const STORE_KEY_HISTORY = 'openclawVersionHistory';

/** npm registry API 地址 */
const NPM_REGISTRY_URL = 'https://registry.npmjs.org/@nicepkg/openclaw';

// ─── 模块状态 ────────────────────────────────────────────────────────────────

/** 安装锁，防止并发安装 */
let isInstalling = false;

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

// ─── 内部函数：HTTPS GET 请求 ────────────────────────────────────────────────

/**
 * 使用 Node.js 内置 https 模块发起 GET 请求
 *
 * @param url 请求地址
 * @returns 响应体字符串
 */
function httpsGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { Accept: 'application/json' } }, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => {
        data += chunk.toString();
      });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
        }
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    // 请求超时 30 秒
    req.setTimeout(30_000, () => {
      req.destroy(new Error('npm registry 请求超时'));
    });
  });
}

// ─── 内部函数：获取可用版本列表 ──────────────────────────────────────────────

/**
 * 从 npm registry 获取可用版本列表
 *
 * 优先使用缓存（TTL 10 分钟），缓存失效时请求 registry。
 * 网络请求失败时降级使用过期缓存。
 */
async function listAvailableVersions(): Promise<ListAvailableVersionsResponse> {
  try {
    // 检查缓存是否有效
    const cached = store.get(STORE_KEY_CACHE) as VersionCache | undefined;
    if (cached && isCacheValid(cached.cachedAt, CACHE_TTL_MS, Date.now())) {
      const sorted = sortVersionsDescending(cached.versions);
      return buildSuccessResponse({
        versions: sorted,
        latest: sorted[0] || undefined,
      });
    }

    // 缓存失效，请求 npm registry
    try {
      const body = await httpsGet(NPM_REGISTRY_URL);
      const json = JSON.parse(body);

      // 从 registry 响应中提取版本列表
      const versions = json.versions ? Object.keys(json.versions) : [];
      const sorted = sortVersionsDescending(versions);

      // 更新缓存
      const newCache: VersionCache = {
        versions: sorted,
        cachedAt: Date.now(),
      };
      store.set(STORE_KEY_CACHE, newCache);

      return buildSuccessResponse({
        versions: sorted,
        latest: sorted[0] || undefined,
      });
    } catch (networkError) {
      // 网络请求失败，降级使用过期缓存
      if (cached && cached.versions.length > 0) {
        const sorted = sortVersionsDescending(cached.versions);
        return buildSuccessResponse({
          versions: sorted,
          latest: sorted[0] || undefined,
        });
      }

      // 无缓存可用，返回错误
      return buildErrorResponse(
        networkError instanceof Error
          ? networkError.message
          : '获取可用版本列表失败',
      );
    }
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
        type: fromVersion !== 'unknown' && installedVersion > fromVersion ? 'upgrade' : 'switch',
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
