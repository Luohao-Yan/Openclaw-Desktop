/**
 * WebSocket 管理器纯逻辑模块
 *
 * 将 webSocketManager.ts 中的核心逻辑提取为纯函数和纯类，
 * 不依赖 WebSocket、Electron、定时器等运行时环境，便于属性测试。
 *
 * 所有外部依赖（WebSocket 连接、IPC 事件、定时器）均保留在 webSocketManager.ts 中，
 * 本模块仅包含可独立测试的纯计算逻辑。
 */

import type { WsEventType } from '../../types/remote.js';

// ─── 常量 ────────────────────────────────────────────────────────────────────

/** 最大重连尝试次数 */
export const MAX_RECONNECT_ATTEMPTS = 5;

/** 重连延迟（毫秒）：5 秒 */
export const RECONNECT_DELAY_MS = 5_000;

/** 支持的 WebSocket 事件类型列表 */
export const WS_EVENT_TYPES: WsEventType[] = [
  'agent.text',
  'agent.thinking',
  'agent.tool.start',
  'agent.tool.result',
  'agent.done',
  'presence',
  'typing',
  'message',
  'session.created',
  'session.updated',
  'session.pruned',
  'heartbeat',
];

// ─── 重连决策结果 ────────────────────────────────────────────────────────────

/** 重连决策结果 */
export interface ReconnectDecision {
  /** 是否应该尝试重连 */
  shouldReconnect: boolean;
  /** 重连延迟（毫秒），仅在 shouldReconnect 为 true 时有意义 */
  delayMs: number;
}

// ─── 重连状态机 ──────────────────────────────────────────────────────────────

/**
 * 重连状态机
 *
 * 跟踪 WebSocket 重连尝试次数，决定是否继续重连：
 * - 每次断开后返回 shouldReconnect=true 和 5 秒延迟（未超过最大次数时）
 * - 累计重连失败次数不超过 5 次
 * - 第 5 次重连失败后 shouldReconnect 变为 false
 * - 任何一次重连成功重置失败计数器
 * - reset() 恢复初始状态
 */
export class ReconnectStateMachine {
  /** 当前重连尝试次数 */
  private _attempts: number;

  constructor() {
    this._attempts = 0;
  }

  /**
   * 处理一次断开事件，返回重连决策
   *
   * 断开时递增尝试计数器，若未超过最大次数则建议重连。
   *
   * @returns 重连决策（是否重连 + 延迟毫秒数）
   */
  processDisconnect(): ReconnectDecision {
    this._attempts += 1;
    if (this._attempts <= MAX_RECONNECT_ATTEMPTS) {
      return { shouldReconnect: true, delayMs: RECONNECT_DELAY_MS };
    }
    return { shouldReconnect: false, delayMs: 0 };
  }

  /**
   * 处理一次重连成功事件，重置计数器
   */
  processReconnectSuccess(): void {
    this._attempts = 0;
  }

  /**
   * 处理一次重连失败事件，递增计数器并返回重连决策
   *
   * @returns 重连决策（是否继续重连 + 延迟毫秒数）
   */
  processReconnectFailure(): ReconnectDecision {
    this._attempts += 1;
    if (this._attempts <= MAX_RECONNECT_ATTEMPTS) {
      return { shouldReconnect: true, delayMs: RECONNECT_DELAY_MS };
    }
    return { shouldReconnect: false, delayMs: 0 };
  }

  /**
   * 获取当前重连尝试次数
   */
  getAttempts(): number {
    return this._attempts;
  }

  /**
   * 重置状态机到初始状态
   */
  reset(): void {
    this._attempts = 0;
  }
}

// ─── 纯函数：构建认证消息 ────────────────────────────────────────────────────

/**
 * 构建 WebSocket 认证消息
 *
 * @param token 认证令牌
 * @returns JSON-RPC 风格的认证消息对象
 */
export function buildAuthMessage(token: string): { method: string; params: { token: string } } {
  return {
    method: 'auth',
    params: { token },
  };
}
