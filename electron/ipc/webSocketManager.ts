/**
 * WebSocket 管理器运行时模块
 *
 * 管理与远程 Gateway 的 WebSocket 实时通信连接。
 * 纯逻辑函数已提取到 webSocketManagerLogic.ts，便于属性测试。
 *
 * 依赖 ws 库建立 WebSocket 连接，依赖 Electron BrowserWindow
 * 通过 IPC 事件将 WebSocket 消息推送到渲染进程。
 */

import WebSocket from 'ws';
import { BrowserWindow } from 'electron';
import {
  ReconnectStateMachine,
  RECONNECT_DELAY_MS,
  WS_EVENT_TYPES,
  buildAuthMessage,
} from './webSocketManagerLogic.js';
import type { WsConnectionConfig, WsEventType } from '../../types/remote.js';

// 重新导出纯逻辑，供其他模块使用
export {
  ReconnectStateMachine,
  MAX_RECONNECT_ATTEMPTS,
  RECONNECT_DELAY_MS,
  WS_EVENT_TYPES,
  buildAuthMessage,
} from './webSocketManagerLogic.js';

// ─── 事件回调类型 ────────────────────────────────────────────────────────────

type WsEventCallback = (data: unknown) => void;

// ─── WebSocketManager ────────────────────────────────────────────────────────

/**
 * WebSocket 实时通信管理器
 *
 * 负责建立、维护和管理与远程 Gateway 的 WebSocket 连接。
 * 支持自动重连、认证、事件订阅和资源释放。
 */
export class WebSocketManager {
  /** WebSocket 实例 */
  private _ws: WebSocket | null = null;
  /** 当前连接配置 */
  private _config: WsConnectionConfig | null = null;
  /** 重连状态机 */
  private _reconnectSM: ReconnectStateMachine;
  /** 重连定时器 ID */
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  /** 是否主动断开（主动断开时不触发重连） */
  private _intentionalClose: boolean = false;
  /** 事件监听器映射 */
  private _listeners: Map<WsEventType, WsEventCallback[]> = new Map();

  constructor() {
    this._reconnectSM = new ReconnectStateMachine();
  }

  /**
   * 建立 WebSocket 连接并完成认证
   *
   * @param config WebSocket 连接配置（host、port、protocol、token）
   */
  async connect(config: WsConnectionConfig): Promise<void> {
    // 先关闭已有连接
    this._cleanupConnection();
    this._config = config;
    this._intentionalClose = false;
    this._reconnectSM.reset();

    return this._establishConnection();
  }

  /**
   * 主动关闭连接并释放资源
   */
  disconnect(): void {
    this._intentionalClose = true;
    this._clearReconnectTimer();
    this._cleanupConnection();
    this._config = null;
    this._reconnectSM.reset();
  }

  /**
   * 发送 JSON-RPC 消息
   *
   * @param method 方法名
   * @param params 可选参数
   */
  send(method: string, params?: unknown): void {
    if (!this._ws || this._ws.readyState !== WebSocket.OPEN) {
      return;
    }
    const message = JSON.stringify({ method, params });
    this._ws.send(message);
  }

  /**
   * 注册事件监听
   *
   * @param event WebSocket 事件类型
   * @param callback 回调函数
   * @returns 取消注册的函数
   */
  on(event: WsEventType, callback: WsEventCallback): () => void {
    const listeners = this._listeners.get(event) ?? [];
    listeners.push(callback);
    this._listeners.set(event, listeners);

    return () => {
      const current = this._listeners.get(event) ?? [];
      this._listeners.set(
        event,
        current.filter((cb) => cb !== callback),
      );
    };
  }

  /**
   * 获取连接状态
   */
  isConnected(): boolean {
    return this._ws !== null && this._ws.readyState === WebSocket.OPEN;
  }

  // ─── 内部方法 ──────────────────────────────────────────────────────────

  /**
   * 建立 WebSocket 连接
   */
  private _establishConnection(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (!this._config) {
        reject(new Error('未设置连接配置'));
        return;
      }

      const { host, port, protocol, token } = this._config;
      const url = `${protocol}://${host}:${port}`;

      try {
        this._ws = new WebSocket(url);
      } catch (err) {
        reject(err);
        return;
      }

      this._ws.on('open', () => {
        // 连接成功，发送认证消息
        if (token) {
          const authMsg = buildAuthMessage(token);
          this._ws?.send(JSON.stringify(authMsg));
        }
        // 重连成功时重置计数器
        this._reconnectSM.processReconnectSuccess();
        resolve();
      });

      this._ws.on('message', (raw: WebSocket.Data) => {
        this._handleMessage(raw);
      });

      this._ws.on('close', () => {
        if (!this._intentionalClose) {
          this._scheduleReconnect();
        }
      });

      this._ws.on('error', (err) => {
        // 如果连接尚未建立，reject promise
        if (this._ws?.readyState === WebSocket.CONNECTING) {
          reject(err);
        }
        // error 事件后通常会触发 close 事件，重连逻辑在 close 中处理
      });
    });
  }

  /**
   * 处理收到的 WebSocket 消息
   */
  private _handleMessage(raw: WebSocket.Data): void {
    try {
      const text = typeof raw === 'string' ? raw : raw.toString();
      const parsed = JSON.parse(text);

      // 提取事件类型和数据
      const eventType = (parsed.type ?? parsed.method) as WsEventType | undefined;
      const eventData = parsed.data ?? parsed.params ?? parsed;

      if (eventType && WS_EVENT_TYPES.includes(eventType)) {
        // 通知本地监听器
        const listeners = this._listeners.get(eventType) ?? [];
        for (const cb of listeners) {
          try {
            cb(eventData);
          } catch {
            // 忽略回调异常
          }
        }

        // 通过 IPC 事件推送到渲染进程
        this._pushToRenderer(eventType, eventData);
      }
    } catch {
      // 忽略无法解析的消息
    }
  }

  /**
   * 将 WebSocket 事件推送到渲染进程
   */
  private _pushToRenderer(type: WsEventType, data: unknown): void {
    try {
      const windows = BrowserWindow.getAllWindows();
      for (const win of windows) {
        if (!win.isDestroyed()) {
          win.webContents.send('remote:ws:event', { type, data });
        }
      }
    } catch {
      // 忽略 IPC 发送异常（可能在测试环境中）
    }
  }

  /**
   * 安排重连
   */
  private _scheduleReconnect(): void {
    const decision = this._reconnectSM.processDisconnect();

    if (!decision.shouldReconnect) {
      // 超过最大重连次数，通知渲染进程连接已断开
      this._notifyDisconnected();
      return;
    }

    this._reconnectTimer = setTimeout(async () => {
      try {
        await this._establishConnection();
      } catch {
        // 重连失败，由 close 事件再次触发 _scheduleReconnect
        // 但如果 _establishConnection 在 open 之前就失败了，需要手动处理
        const failDecision = this._reconnectSM.processReconnectFailure();
        if (!failDecision.shouldReconnect) {
          this._notifyDisconnected();
        } else {
          this._scheduleReconnect();
        }
      }
    }, decision.delayMs);
  }

  /**
   * 通知渲染进程连接已断开（重连耗尽）
   */
  private _notifyDisconnected(): void {
    try {
      const windows = BrowserWindow.getAllWindows();
      for (const win of windows) {
        if (!win.isDestroyed()) {
          win.webContents.send('remote:connectionStatus', {
            status: 'disconnected',
            error: 'WebSocket 重连失败，已达到最大重试次数',
          });
        }
      }
    } catch {
      // 忽略 IPC 发送异常
    }
  }

  /**
   * 清理当前 WebSocket 连接
   */
  private _cleanupConnection(): void {
    if (this._ws) {
      // 移除所有事件监听器，避免触发重连
      this._ws.removeAllListeners();
      if (
        this._ws.readyState === WebSocket.OPEN ||
        this._ws.readyState === WebSocket.CONNECTING
      ) {
        this._ws.close();
      }
      this._ws = null;
    }
  }

  /**
   * 清除重连定时器
   */
  private _clearReconnectTimer(): void {
    if (this._reconnectTimer !== null) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  }
}
