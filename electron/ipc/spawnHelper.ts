/**
 * 统一命令执行入口模块（spawnHelper）
 *
 * 提供 spawnWithShellPath 和 spawnDetached 两个核心函数，
 * 自动注入 Shell PATH、超时保护、结构化错误返回。
 *
 * 核心逻辑（错误分类、结果构建、环境变量构建）委托给 spawnHelperLogic.ts 纯函数，
 * 本模块仅负责 Node.js child_process 调用和事件监听。
 */

import { spawn } from 'child_process';
import { getShellPath } from './settings.js';
import {
  buildSpawnEnv,
  buildSpawnResult,
  classifySpawnError,
  buildEnoentError,
  buildTimeoutError,
} from './spawnHelperLogic.js';

// 重新导出类型，方便消费者直接从 spawnHelper 导入
export type { SpawnOptions, SpawnResult, SpawnErrorCode } from './spawnHelperLogic.js';
export { buildSpawnEnv, buildSpawnResult, classifySpawnError, buildEnoentError, buildTimeoutError } from './spawnHelperLogic.js';

import type { SpawnOptions, SpawnResult } from './spawnHelperLogic.js';

/** 默认超时时间：30 秒 */
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * 统一命令执行入口
 *
 * 自动注入 Shell PATH 到子进程环境变量，提供超时保护和结构化错误返回。
 * Windows 平台默认启用 shell 模式以正确处理 .cmd/.bat 脚本。
 *
 * @param command 要执行的命令
 * @param args 命令参数列表
 * @param options 可选的执行选项
 * @returns 统一的 SpawnResult 结构
 */
export async function spawnWithShellPath(
  command: string,
  args: string[],
  options?: SpawnOptions,
): Promise<SpawnResult> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const useShell = process.platform === 'win32' && (options?.windowsShell !== false);

  // 获取 Shell PATH 并构建环境变量
  const shellPath = await getShellPath();
  const spawnEnv = buildSpawnEnv(shellPath, options?.extraEnv);

  return new Promise<SpawnResult>((resolve) => {
    let settled = false;
    let stdout = '';
    let stderr = '';
    let timer: ReturnType<typeof setTimeout> | null = null;

    const finish = (result: SpawnResult) => {
      if (settled) return;
      settled = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      resolve(result);
    };

    try {
      const child = spawn(command, args, {
        env: { ...process.env, ...spawnEnv },
        shell: useShell,
        detached: options?.detached ?? false,
      });

      // 收集标准输出
      child.stdout?.on('data', (data: Buffer) => {
        const chunk = data.toString();
        stdout += chunk;
        options?.onOutput?.(chunk, false);
      });

      // 收集标准错误
      child.stderr?.on('data', (data: Buffer) => {
        const chunk = data.toString();
        stderr += chunk;
        options?.onOutput?.(chunk, true);
      });

      // 超时保护
      timer = setTimeout(() => {
        try {
          child.kill();
        } catch {
          // 忽略 kill 失败
        }
      }, timeoutMs);

      // 进程错误事件（如 ENOENT）
      child.once('error', (error: Error) => {
        finish(
          buildSpawnResult({
            exitCode: null,
            stdout,
            stderr,
            error,
            killed: child.killed,
            timeoutMs,
            command,
          }),
        );
      });

      // 进程退出事件
      child.once('close', (code: number | null) => {
        finish(
          buildSpawnResult({
            exitCode: code,
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            killed: child.killed,
            timeoutMs,
            command,
          }),
        );
      });
    } catch (error) {
      // spawn 调用本身抛出异常（极端情况）
      finish(
        buildSpawnResult({
          exitCode: null,
          stdout,
          stderr,
          error: error instanceof Error ? error : new Error(String(error)),
          timeoutMs,
          command,
        }),
      );
    }
  });
}

/**
 * 以 detached 模式启动后台进程
 *
 * 监听 'spawn' 事件确认进程创建成功后再调用 unref()，
 * 确保进程确实启动后才脱离父进程。
 * Windows 平台默认启用 shell 模式。
 *
 * @param command 要执行的命令
 * @param args 命令参数列表
 * @param options 可选的执行选项（不含 detached，固定为 true）
 * @returns 启动结果：success 表示进程是否成功创建
 */
export async function spawnDetached(
  command: string,
  args: string[],
  options?: Omit<SpawnOptions, 'detached'>,
): Promise<{ success: boolean; error?: string }> {
  const useShell = process.platform === 'win32' && (options?.windowsShell !== false);

  // 获取 Shell PATH 并构建环境变量
  const shellPath = await getShellPath();
  const spawnEnv = buildSpawnEnv(shellPath, options?.extraEnv);

  return new Promise<{ success: boolean; error?: string }>((resolve) => {
    let settled = false;

    const finish = (result: { success: boolean; error?: string }) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    try {
      const child = spawn(command, args, {
        env: { ...process.env, ...spawnEnv },
        shell: useShell,
        detached: true,
        stdio: 'ignore',
      });

      // 监听 'spawn' 事件确认进程创建成功
      child.once('spawn', () => {
        // 进程已成功创建，脱离父进程
        child.unref();
        finish({ success: true });
      });

      // 监听 'error' 事件处理进程创建失败
      child.once('error', (error: Error) => {
        const errorCode = classifySpawnError({
          code: (error as any).code,
          message: error.message,
        });

        let errorMessage: string;
        if (errorCode === 'ENOENT') {
          errorMessage = buildEnoentError(command, shellPath);
        } else {
          errorMessage = error.message || '进程创建失败';
        }

        finish({ success: false, error: errorMessage });
      });

      // 超时保护：如果 spawn/error 事件都未触发，兜底超时
      const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      setTimeout(() => {
        finish({ success: false, error: `启动命令 '${command}' 超时（${timeoutMs}ms）` });
      }, timeoutMs);
    } catch (error) {
      // spawn 调用本身抛出异常
      finish({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
}
