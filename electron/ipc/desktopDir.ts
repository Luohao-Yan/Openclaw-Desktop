/**
 * Openclaw Desktop 本地数据目录管理模块
 *
 * 统一管理 ~/.openclawdesktop/ 目录的路径解析与初始化。
 * 该目录用于存放用户可见、可备份、可移植的桌面端数据：
 *   - instances.json  : 远程实例元数据（非敏感部分）
 *   - logs/           : 桌面端应用日志（按日期滚动）
 *   - cache/          : 版本检查等临时缓存（预留）
 *
 * 加密凭据（token）不存储于此目录，仍由 electron-store + safeStorage 管理。
 *
 * 支持通过环境变量 OPENCLAW_DESKTOP_DIR 自定义目录位置，
 * 便于测试和多环境隔离。
 */

import os from 'os';
import path from 'path';
import { mkdirSync, existsSync } from 'fs';
import { ipcMain, shell } from 'electron';

// ─── 目录路径常量 ─────────────────────────────────────────────────────────────

/** 桌面端数据根目录名称 */
const DESKTOP_DIR_NAME = '.openclawdesktop';

/** 子目录定义，便于统一扩展 */
const SUB_DIRS = ['logs', 'cache'] as const;

/** 子目录类型 */
export type DesktopSubDir = (typeof SUB_DIRS)[number];

// ─── 路径解析 ─────────────────────────────────────────────────────────────────

/**
 * 获取桌面端数据根目录路径
 *
 * 优先使用环境变量 OPENCLAW_DESKTOP_DIR 覆盖，
 * 否则默认为 ~/.openclawdesktop/。
 *
 * @returns 根目录绝对路径
 */
export function getDesktopDir(): string {
  const envOverride = process.env.OPENCLAW_DESKTOP_DIR;
  if (envOverride && envOverride.trim()) {
    return envOverride.trim();
  }
  return path.join(os.homedir(), DESKTOP_DIR_NAME);
}

/**
 * 获取子目录路径
 *
 * @param subDir 子目录名称，如 'logs' | 'cache'
 * @returns 子目录绝对路径
 */
export function getDesktopSubDir(subDir: DesktopSubDir): string {
  return path.join(getDesktopDir(), subDir);
}

/**
 * 组合桌面端数据文件的完整路径
 *
 * @param filename 文件名（相对于根目录）
 * @returns 文件绝对路径
 */
export function getDesktopFilePath(filename: string): string {
  return path.join(getDesktopDir(), filename);
}

/**
 * 组合桌面端子目录下文件的完整路径
 *
 * @param subDir 子目录名称
 * @param filename 文件名（相对于子目录）
 * @returns 文件绝对路径
 */
export function getDesktopSubFilePath(subDir: DesktopSubDir, filename: string): string {
  return path.join(getDesktopDir(), subDir, filename);
}

// ─── 目录初始化 ───────────────────────────────────────────────────────────────

/**
 * 确保桌面端数据目录及所有子目录存在
 *
 * 使用 mkdirSync recursive 幂等创建，多次调用安全。
 * 在 app.whenReady() 阶段调用一次即可。
 *
 * @returns 根目录路径（便于日志输出）
 */
export function ensureDesktopDir(): string {
  const rootDir = getDesktopDir();

  // 创建根目录
  if (!existsSync(rootDir)) {
    mkdirSync(rootDir, { recursive: true });
  }

  // 创建所有子目录
  for (const subDir of SUB_DIRS) {
    const subDirPath = path.join(rootDir, subDir);
    if (!existsSync(subDirPath)) {
      mkdirSync(subDirPath, { recursive: true });
    }
  }

  return rootDir;
}

// ─── IPC 处理器 ───────────────────────────────────────────────────────────────

/**
 * 注册桌面端目录相关的 IPC 处理器
 *
 * 提供给渲染层查询存储路径和在文件管理器中打开目录的能力。
 */
export function setupDesktopDirIPC(): void {
  /** 获取各存储路径信息，供设置页面展示 */
  ipcMain.handle('desktopDir:getPaths', async () => {
    try {
      const desktopDir = getDesktopDir();
      return {
        success: true,
        paths: {
          /** ~/.openclawdesktop/ 根目录 */
          desktopDir,
          /** logs 子目录 */
          logsDir: getDesktopSubDir('logs'),
          /** cache 子目录 */
          cacheDir: getDesktopSubDir('cache'),
          /** instances.json 文件路径 */
          instancesFile: getDesktopFilePath('instances.json'),
        },
      };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  /** 在系统文件管理器中打开桌面端数据目录 */
  ipcMain.handle('desktopDir:openInFinder', async (_event, subPath?: string) => {
    try {
      const targetPath = subPath
        ? path.join(getDesktopDir(), subPath)
        : getDesktopDir();
      await shell.openPath(targetPath);
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });
}
