/**
 * Openclaw Desktop 应用级日志模块
 *
 * 将桌面端自身的错误、警告、关键事件写入 ~/.openclawdesktop/logs/ 目录，
 * 与 OpenClaw CLI 产生的业务日志（~/.openclaw/logs/）明确区分。
 *
 * 功能特性：
 *   - 按日期滚动日志文件（app-YYYY-MM-DD.log）
 *   - 支持 info / warn / error 三个级别
 *   - 自动清理超过 30 天的旧日志文件
 *   - 同步写入（Electron 主进程中可安全使用）
 *   - 提供 IPC 接口供渲染层查询和清理日志
 */

import { ipcMain } from 'electron';
import { appendFileSync, existsSync, readdirSync, unlinkSync, statSync, readFileSync } from 'fs';
import path from 'path';
import { getDesktopSubDir, ensureDesktopDir } from './desktopDir.js';

// ─── 常量 ─────────────────────────────────────────────────────────────────────

/** 日志文件保留天数，超过此天数的旧日志文件自动清理 */
const LOG_RETENTION_DAYS = 30;

/** 单次 IPC 查询返回的最大日志行数 */
const MAX_LOG_LINES_PER_QUERY = 500;

// ─── 日志级别 ─────────────────────────────────────────────────────────────────

/** 日志级别枚举 */
export type LogLevel = 'info' | 'warn' | 'error';

/** 单条结构化日志记录 */
export interface LogEntry {
  /** ISO 8601 时间戳 */
  timestamp: string;
  /** 日志级别 */
  level: LogLevel;
  /** 日志消息 */
  message: string;
  /** 可选的附加数据（序列化为 JSON） */
  data?: unknown;
}

// ─── 路径工具 ─────────────────────────────────────────────────────────────────

/**
 * 获取当天日志文件路径
 *
 * 文件名格式：app-YYYY-MM-DD.log
 *
 * @returns 当天日志文件的绝对路径
 */
function getTodayLogFilePath(): string {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return path.join(getDesktopSubDir('logs'), `app-${today}.log`);
}

/**
 * 将日志条目序列化为单行文本
 *
 * 格式：[timestamp] [LEVEL] message  {data}
 *
 * @param entry 日志条目
 * @returns 序列化后的单行文本（末尾含换行符）
 */
function serializeEntry(entry: LogEntry): string {
  const levelTag = entry.level.toUpperCase().padEnd(5);
  const dataStr = entry.data !== undefined ? `  ${JSON.stringify(entry.data)}` : '';
  return `[${entry.timestamp}] [${levelTag}] ${entry.message}${dataStr}\n`;
}

// ─── 旧日志清理 ───────────────────────────────────────────────────────────────

/**
 * 清理超过保留期的旧日志文件
 *
 * 扫描 logs/ 目录下所有 app-*.log 文件，删除修改时间超过 LOG_RETENTION_DAYS 天的文件。
 * 清理失败时静默跳过，不影响正常日志写入。
 */
function cleanupOldLogs(): void {
  try {
    const logsDir = getDesktopSubDir('logs');
    if (!existsSync(logsDir)) return;

    const cutoffTime = Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const entries = readdirSync(logsDir);

    for (const filename of entries) {
      if (!filename.startsWith('app-') || !filename.endsWith('.log')) continue;

      const filePath = path.join(logsDir, filename);
      try {
        const stat = statSync(filePath);
        if (stat.mtimeMs < cutoffTime) {
          unlinkSync(filePath);
        }
      } catch {
        // 单个文件删除失败，静默跳过
      }
    }
  } catch {
    // 清理过程异常，静默跳过
  }
}

// ─── AppLogger 类 ─────────────────────────────────────────────────────────────

/**
 * 应用级日志记录器
 *
 * 单例设计，通过 appLogger 导出实例直接使用。
 * 写入策略：同步追加到当天日志文件（适合 Electron 主进程低频写入场景）。
 */
class AppLogger {
  /** 是否已执行过当日的旧日志清理 */
  private _cleanupDone = false;

  /**
   * 写入一条日志
   *
   * @param level 日志级别
   * @param message 日志消息
   * @param data 可选附加数据
   */
  private write(level: LogLevel, message: string, data?: unknown): void {
    try {
      // 确保目录存在
      ensureDesktopDir();

      // 首次写入时触发旧日志清理（每次启动清理一次）
      if (!this._cleanupDone) {
        this._cleanupDone = true;
        cleanupOldLogs();
      }

      const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level,
        message,
        data,
      };

      const filePath = getTodayLogFilePath();
      appendFileSync(filePath, serializeEntry(entry), 'utf8');
    } catch {
      // 日志写入失败不应影响业务逻辑，静默吞掉
    }
  }

  /**
   * 记录信息级别日志
   *
   * @param message 日志消息
   * @param data 可选附加数据
   */
  info(message: string, data?: unknown): void {
    this.write('info', message, data);
  }

  /**
   * 记录警告级别日志
   *
   * @param message 日志消息
   * @param data 可选附加数据
   */
  warn(message: string, data?: unknown): void {
    this.write('warn', message, data);
  }

  /**
   * 记录错误级别日志
   *
   * @param message 日志消息
   * @param data 可选附加数据
   */
  error(message: string, data?: unknown): void {
    this.write('error', message, data);
  }

  /**
   * 读取最近 N 行日志（仅读当天日志文件）
   *
   * @param maxLines 最多返回行数，默认 100，上限 500
   * @returns 原始日志行数组（最新行在末尾）
   */
  readRecentLines(maxLines = 100): string[] {
    try {
      const limit = Math.min(maxLines, MAX_LOG_LINES_PER_QUERY);
      const filePath = getTodayLogFilePath();
      if (!existsSync(filePath)) return [];

      const content = readFileSync(filePath, 'utf8');
      const lines = content.split('\n').filter((l) => l.trim().length > 0);
      return lines.slice(-limit);
    } catch {
      return [];
    }
  }

  /**
   * 获取所有日志文件列表（文件名 + 大小）
   *
   * @returns 日志文件信息数组，按文件名倒序排列（最新在前）
   */
  listLogFiles(): Array<{ filename: string; size: number; path: string }> {
    try {
      const logsDir = getDesktopSubDir('logs');
      if (!existsSync(logsDir)) return [];

      return readdirSync(logsDir)
        .filter((f) => f.startsWith('app-') && f.endsWith('.log'))
        .sort((a, b) => b.localeCompare(a)) // 最新日期在前
        .map((filename) => {
          const filePath = path.join(logsDir, filename);
          try {
            const stat = statSync(filePath);
            return { filename, size: stat.size, path: filePath };
          } catch {
            return { filename, size: 0, path: filePath };
          }
        });
    } catch {
      return [];
    }
  }

  /**
   * 清除所有日志文件
   *
   * @returns 成功删除的文件数量
   */
  clearAllLogs(): number {
    let count = 0;
    try {
      const logsDir = getDesktopSubDir('logs');
      if (!existsSync(logsDir)) return 0;

      for (const filename of readdirSync(logsDir)) {
        if (!filename.startsWith('app-') || !filename.endsWith('.log')) continue;
        try {
          unlinkSync(path.join(logsDir, filename));
          count++;
        } catch {
          // 单个删除失败，继续
        }
      }
    } catch {
      // 静默
    }
    return count;
  }
}

/** 全局单例日志记录器 */
export const appLogger = new AppLogger();

// ─── IPC 处理器 ───────────────────────────────────────────────────────────────

/**
 * 注册应用日志相关的 IPC 处理器
 *
 * 供设置页面查看日志文件列表、读取最近日志、清除日志。
 */
export function setupAppLoggerIPC(): void {
  /** 获取最近 N 行日志 */
  ipcMain.handle('appLogger:getRecentLines', async (_event, maxLines?: number) => {
    try {
      const lines = appLogger.readRecentLines(maxLines);
      return { success: true, lines };
    } catch (error) {
      return { success: false, error: String(error), lines: [] };
    }
  });

  /** 获取日志文件列表 */
  ipcMain.handle('appLogger:listFiles', async () => {
    try {
      const files = appLogger.listLogFiles();
      return { success: true, files };
    } catch (error) {
      return { success: false, error: String(error), files: [] };
    }
  });

  /** 清除所有日志文件 */
  ipcMain.handle('appLogger:clearAll', async () => {
    try {
      const count = appLogger.clearAllLogs();
      return { success: true, deletedCount: count };
    } catch (error) {
      return { success: false, error: String(error), deletedCount: 0 };
    }
  });
}
