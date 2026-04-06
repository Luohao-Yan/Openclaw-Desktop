/**
 * 连接管理器纯逻辑模块
 *
 * 将 connectionManager.ts 中的核心逻辑提取为纯函数和纯类，
 * 不依赖 Electron、fetch、electron-store 等运行时环境，便于属性测试。
 *
 * 所有外部依赖（网络请求、IPC 事件、定时器）均保留在 connectionManager.ts 中，
 * 本模块仅包含可独立测试的纯计算逻辑。
 */

import type { ConnectionStatus, ConnectionStatusEvent } from '../../types/remote.js';

// ─── 常量 ────────────────────────────────────────────────────────────────────

/** 心跳间隔（毫秒）：30 秒 */
export const HEARTBEAT_INTERVAL_MS = 30_000;

/** 连续失败次数阈值：3 次失败后标记为 disconnected */
export const MAX_CONSECUTIVE_FAILURES = 3;

// ─── 心跳状态机 ──────────────────────────────────────────────────────────────

/**
 * 心跳状态机
 *
 * 跟踪连续心跳失败次数，决定连接状态转换：
 * - 连续 3 次失败 → disconnected
 * - disconnected 状态下 1 次成功 → connected
 * - 非连续失败（中间有成功）→ 重置失败计数器
 * - 成功始终返回 connected
 */
export class HeartbeatStateMachine {
  /** 当前连接状态 */
  private _status: ConnectionStatus;
  /** 连续失败计数 */
  private _consecutiveFailures: number;

  constructor(initialStatus: ConnectionStatus = 'connected') {
    this._status = initialStatus;
    this._consecutiveFailures = 0;
  }

  /**
   * 处理一次心跳结果，返回新的连接状态
   *
   * @param success 心跳是否成功
   * @returns 新的连接状态
   */
  processHeartbeatResult(success: boolean): ConnectionStatus {
    if (success) {
      // 成功：重置失败计数，状态变为 connected
      this._consecutiveFailures = 0;
      this._status = 'connected';
    } else {
      // 失败：递增失败计数
      this._consecutiveFailures += 1;
      // 连续失败达到阈值 → disconnected
      if (this._consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        this._status = 'disconnected';
      }
    }
    return this._status;
  }

  /** 获取当前连续失败次数 */
  getConsecutiveFailures(): number {
    return this._consecutiveFailures;
  }

  /** 获取当前连接状态 */
  getStatus(): ConnectionStatus {
    return this._status;
  }

  /** 重置状态机到初始状态 */
  reset(): void {
    this._status = 'connected';
    this._consecutiveFailures = 0;
  }
}

// ─── 纯函数：构建状态变更事件 ────────────────────────────────────────────────

/**
 * 构建连接状态变更事件对象
 *
 * @param status 新的连接状态
 * @param instanceId 可选的实例 ID
 * @param latencyMs 可选的延迟（毫秒）
 * @param error 可选的错误信息
 * @returns 连接状态变更事件
 */
export function buildStatusEvent(
  status: ConnectionStatus,
  instanceId?: string,
  latencyMs?: number,
  error?: string,
): ConnectionStatusEvent {
  const event: ConnectionStatusEvent = { status };
  if (instanceId !== undefined) event.instanceId = instanceId;
  if (latencyMs !== undefined) event.latencyMs = latencyMs;
  if (error !== undefined) event.error = error;
  return event;
}

/**
 * 计算延迟（毫秒）
 *
 * @param startTime 请求开始时间戳（Date.now()）
 * @param endTime 请求结束时间戳（Date.now()）
 * @returns 延迟毫秒数，最小为 0
 */
export function calculateLatency(startTime: number, endTime: number): number {
  return Math.max(0, endTime - startTime);
}
