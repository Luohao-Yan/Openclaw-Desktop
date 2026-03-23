/**
 * AsyncSendManager — 异步会话消息发送管理器
 *
 * 管理所有异步 CLI 发送进程的生命周期：
 * - 通过 child_process.spawn() 启动 CLI 子进程，立即返回不等待完成
 * - 同一 session 的请求排队执行（FIFO），同时最多一个活跃进程
 * - 180 秒超时自动终止子进程
 * - 已完成/失败状态保留 30 秒后自动清理
 * - 应用退出时终止所有活跃进程
 */

import { spawn, type ChildProcess } from 'child_process';
import { resolveOpenClawCommand } from './settings.js';
import { buildSpawnEnv } from './spawnHelperLogic.js';
import { getShellPath } from './settings.js';

// ── 类型定义 ──────────────────────────────────────────────────────────────────

/** 异步发送状态枚举 */
export type AsyncSendStatus = 'processing' | 'completed' | 'error' | 'timeout';

/** 单个异步发送任务的状态记录 */
export interface AsyncSendEntry {
  /** session UUID（用于 CLI --session-id） */
  sessionId: string;
  /** session key（如 agent:main:main，用于 Map key） */
  sessionKey: string;
  /** 子进程 PID */
  pid: number;
  /** 启动时间戳（ms） */
  startedAt: number;
  /** 当前状态 */
  status: AsyncSendStatus;
  /** 失败时的错误信息 */
  error?: string;
  /** 子进程引用（用于 kill） */
  processRef: ChildProcess;
  /** 超时定时器引用 */
  timeoutTimer?: ReturnType<typeof setTimeout>;
  /** 清理定时器引用（状态保留 30 秒后自动清理） */
  cleanupTimer?: ReturnType<typeof setTimeout>;
}

/** 排队中的发送请求 */
export interface QueuedRequest {
  sessionId: string;
  sessionKey: string;
  message: string;
  agentId: string;
  /** 请求完成时的回调 */
  resolve: (result: { success: boolean; pending?: boolean; error?: string }) => void;
}

/** getStatus 返回的状态结构 */
export interface SendStatusResult {
  status: 'idle' | 'processing' | 'completed' | 'error' | 'timeout';
  startedAt?: number;
  error?: string;
}

/** enqueue 的入参 */
export interface EnqueueParams {
  sessionId: string;
  sessionKey: string;
  message: string;
  agentId: string;
}

/** enqueue 的返回值 */
export interface EnqueueResult {
  success: boolean;
  pending?: boolean;
  error?: string;
}

// ── 常量 ──────────────────────────────────────────────────────────────────────

/** 子进程超时时间（ms） */
const TIMEOUT_MS = 180_000;

/** 已完成/失败状态保留时间（ms），供前端查询 */
const CLEANUP_DELAY_MS = 30_000;

/** 同一 session 的最大排队数 */
const MAX_QUEUE_SIZE = 3;

// ── AsyncSendManager 类 ──────────────────────────────────────────────────────

export class AsyncSendManager {
  /** 正在执行或已完成的任务 Map<sessionKey, AsyncSendEntry> */
  private active: Map<string, AsyncSendEntry> = new Map();

  /** 排队等待的请求 Map<sessionKey, QueuedRequest[]> */
  private queue: Map<string, QueuedRequest[]> = new Map();

  /** 超时时间（ms），默认 180_000，可通过构造函数覆盖（便于测试） */
  private timeoutMs: number;

  constructor(options?: { timeoutMs?: number }) {
    this.timeoutMs = options?.timeoutMs ?? TIMEOUT_MS;
  }

  /**
   * 提交发送请求
   *
   * 若该 session 已有进行中任务则排队等待（队列上限 3）；
   * 否则立即 spawn CLI 子进程。
   * spawn 成功后立即返回 { success: true, pending: true }，不等待进程完成。
   */
  async enqueue(params: EnqueueParams): Promise<EnqueueResult> {
    const { sessionKey } = params;
    const existing = this.active.get(sessionKey);

    // 若该 session 有活跃的 processing 状态进程，排队等待
    if (existing && existing.status === 'processing') {
      return this.addToQueue(params);
    }

    // 若有已完成/失败的旧记录，先清理
    if (existing) {
      this.clearEntry(sessionKey);
    }

    // 立即启动子进程
    return this.startProcess(params);
  }

  /**
   * 查询指定 session 的发送状态
   *
   * - 无记录 → { status: 'idle' }
   * - 有活跃进程 → { status: 'processing', startedAt }
   * - 已完成 → { status: 'completed' }
   * - 失败/超时 → { status: 'error' | 'timeout', error }
   */
  getStatus(sessionKey: string): SendStatusResult {
    const entry = this.active.get(sessionKey);
    if (!entry) {
      return { status: 'idle' };
    }

    switch (entry.status) {
      case 'processing':
        return { status: 'processing', startedAt: entry.startedAt };
      case 'completed':
        return { status: 'completed' };
      case 'error':
        return { status: 'error', error: entry.error };
      case 'timeout':
        return { status: 'timeout', error: entry.error };
      default:
        return { status: 'idle' };
    }
  }

  /**
   * 终止所有正在运行的进程（应用退出时调用）
   *
   * 遍历 active Map，对所有 processing 状态的进程调用 kill()，
   * 清空队列，清理所有定时器。
   */
  killAll(): void {
    // 终止所有活跃进程
    for (const [key, entry] of this.active) {
      // 清理定时器
      if (entry.timeoutTimer) clearTimeout(entry.timeoutTimer);
      if (entry.cleanupTimer) clearTimeout(entry.cleanupTimer);

      // 终止 processing 状态的进程
      if (entry.status === 'processing') {
        try {
          entry.processRef.kill();
        } catch {
          // 忽略 kill 失败（进程可能已退出）
        }
        entry.status = 'error';
        entry.error = '应用退出，进程被终止';
      }
    }

    // 清空所有排队请求，通知调用方
    for (const [, requests] of this.queue) {
      for (const req of requests) {
        req.resolve({ success: false, error: '应用退出，请求被取消' });
      }
    }
    this.queue.clear();
  }

  // ── 内部方法 ────────────────────────────────────────────────────────────────

  /**
   * 将请求加入排队队列
   * 队列上限为 MAX_QUEUE_SIZE，超出时拒绝
   */
  private addToQueue(params: EnqueueParams): Promise<EnqueueResult> {
    const { sessionKey } = params;
    const currentQueue = this.queue.get(sessionKey) || [];

    // 检查队列上限
    if (currentQueue.length >= MAX_QUEUE_SIZE) {
      return Promise.resolve({
        success: false,
        error: `该会话排队已满（上限 ${MAX_QUEUE_SIZE}），请稍后重试`,
      });
    }

    // 创建 Promise 用于异步返回结果
    return new Promise<EnqueueResult>((resolve) => {
      currentQueue.push({
        sessionId: params.sessionId,
        sessionKey: params.sessionKey,
        message: params.message,
        agentId: params.agentId,
        resolve,
      });
      this.queue.set(sessionKey, currentQueue);
    });
  }

  /**
   * 启动 CLI 子进程
   *
   * 使用 child_process.spawn() + resolveOpenClawCommand() 启动，
   * 注入 Shell PATH 环境变量。
   */
  private async startProcess(params: EnqueueParams): Promise<EnqueueResult> {
    const { sessionId, sessionKey, message, agentId } = params;
    const command = resolveOpenClawCommand();
    const args = ['agent', '--session-id', sessionId, '--message', message, '--json'];

    try {
      // 获取 Shell PATH 并构建环境变量
      const shellPath = await getShellPath();
      const spawnEnv = buildSpawnEnv(shellPath);
      const useShell = process.platform === 'win32';

      const child = spawn(command, args, {
        env: { ...process.env, ...spawnEnv },
        shell: useShell,
      });

      // 收集 stderr 用于错误报告
      let stderr = '';
      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      const now = Date.now();
      const pid = child.pid ?? 0;

      // 创建状态记录
      const entry: AsyncSendEntry = {
        sessionId,
        sessionKey,
        pid,
        startedAt: now,
        status: 'processing',
        processRef: child,
      };

      // 设置超时定时器
      entry.timeoutTimer = setTimeout(() => {
        if (entry.status === 'processing') {
          try {
            child.kill();
          } catch {
            // 忽略 kill 失败
          }
          entry.status = 'timeout';
          entry.error = `CLI 进程超时（${this.timeoutMs / 1000}秒）`;
          console.error(`[AsyncSendManager] 超时: sessionKey=${sessionKey}, pid=${pid}`);
          this.scheduleCleanup(sessionKey);
          this.processQueue(sessionKey);
        }
      }, this.timeoutMs);

      // 监听子进程退出事件
      child.once('close', (code: number | null) => {
        // 超时已处理的情况，跳过
        if (entry.status === 'timeout') return;

        // 清理超时定时器
        if (entry.timeoutTimer) {
          clearTimeout(entry.timeoutTimer);
          entry.timeoutTimer = undefined;
        }

        if (code === 0) {
          // 正常完成
          entry.status = 'completed';
          console.log(`[AsyncSendManager] 完成: sessionKey=${sessionKey}, pid=${pid}`);
        } else {
          // 异常退出
          entry.status = 'error';
          entry.error = stderr.trim() || `CLI 进程异常退出（退出码: ${code}）`;
          console.error(`[AsyncSendManager] 错误: sessionKey=${sessionKey}, pid=${pid}, code=${code}`);
        }

        // 安排清理并处理队列
        this.scheduleCleanup(sessionKey);
        this.processQueue(sessionKey);
      });

      // 监听 spawn 错误（如 ENOENT）
      child.once('error', (error: Error) => {
        if (entry.status !== 'processing') return;

        // 清理超时定时器
        if (entry.timeoutTimer) {
          clearTimeout(entry.timeoutTimer);
          entry.timeoutTimer = undefined;
        }

        entry.status = 'error';
        entry.error = error.message || '子进程启动失败';
        console.error(`[AsyncSendManager] spawn 错误: sessionKey=${sessionKey}`, error.message);

        this.scheduleCleanup(sessionKey);
        this.processQueue(sessionKey);
      });

      // 保存状态记录
      this.active.set(sessionKey, entry);

      // 立即返回，不等待进程完成
      return { success: true, pending: true };
    } catch (error) {
      // spawn 调用本身抛出异常（极端情况）
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error(`[AsyncSendManager] 启动失败: sessionKey=${sessionKey}`, errMsg);
      return { success: false, error: errMsg };
    }
  }

  /**
   * 安排清理：已完成/失败的状态保留 30 秒后自动移除
   */
  private scheduleCleanup(sessionKey: string): void {
    const entry = this.active.get(sessionKey);
    if (!entry) return;

    // 清理旧的清理定时器
    if (entry.cleanupTimer) {
      clearTimeout(entry.cleanupTimer);
    }

    entry.cleanupTimer = setTimeout(() => {
      this.clearEntry(sessionKey);
    }, CLEANUP_DELAY_MS);
  }

  /**
   * 清理指定 session 的状态记录
   */
  private clearEntry(sessionKey: string): void {
    const entry = this.active.get(sessionKey);
    if (entry) {
      if (entry.timeoutTimer) clearTimeout(entry.timeoutTimer);
      if (entry.cleanupTimer) clearTimeout(entry.cleanupTimer);
      this.active.delete(sessionKey);
    }
  }

  /**
   * 处理排队请求：当前进程完成后，按 FIFO 顺序启动下一个
   */
  private processQueue(sessionKey: string): void {
    const pendingQueue = this.queue.get(sessionKey);
    if (!pendingQueue || pendingQueue.length === 0) return;

    // 取出队首请求
    const next = pendingQueue.shift()!;
    if (pendingQueue.length === 0) {
      this.queue.delete(sessionKey);
    }

    // 启动下一个进程
    void this.startProcess({
      sessionId: next.sessionId,
      sessionKey: next.sessionKey,
      message: next.message,
      agentId: next.agentId,
    }).then((result) => {
      next.resolve(result);
    });
  }
}

// ── 模块级单例 ────────────────────────────────────────────────────────────────

/** 全局唯一的 AsyncSendManager 实例 */
export const asyncSendManager = new AsyncSendManager();
