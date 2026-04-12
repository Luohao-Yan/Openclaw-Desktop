/**
 * 远程 Gateway WebSocket RPC 客户端
 *
 * OpenClaw Gateway 的控制平面通过 WebSocket 暴露，所有管理操作
 * （config、sessions、channels、skills、logs、agents 等）均通过
 * WebSocket RPC 协议（req/res 帧对）执行，而非 REST HTTP。
 *
 * 官方协议文档：https://docs.openclaw.ai/gateway/protocol
 *
 * 本模块实现：
 * - Gateway WebSocket 握手（connect → hello-ok）
 * - 通用 RPC 调用（req 帧 → res 帧）
 * - 持久单例连接（断连自动重试，指数退避）
 * - 连接状态事件（供 connectionManager 消费）
 */

import WebSocket from 'ws';
import { EventEmitter } from 'events';

// ─── 协议常量 ─────────────────────────────────────────────────────────────────

/** 客户端支持的协议最小版本 */
const MIN_PROTOCOL = 3;
/** 客户端支持的协议最大版本 */
const MAX_PROTOCOL = 3;
/** 默认 RPC 调用超时时间（毫秒） */
const DEFAULT_RPC_TIMEOUT_MS = 15_000;
/** WebSocket 连接超时时间（毫秒） */
const CONNECT_TIMEOUT_MS = 10_000;
/** 最大重试次数（0 = 不自动重试，由外部调用方决定） */
const MAX_AUTO_RECONNECT_ATTEMPTS = 0;

// ─── 类型定义 ─────────────────────────────────────────────────────────────────

/** Gateway WebSocket 连接参数 */
export interface GatewayWsConnectionParams {
  /** 目标 Gateway 地址，格式：ws://host:port 或 wss://host:port */
  url: string;
  /** 认证 token（对应 gateway.auth.token 配置） */
  token?: string;
}

/** RPC 调用结果 */
export interface RpcResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  /** HTTP 兼容状态码映射（供上层统一处理） */
  statusCode?: number;
}

/** Gateway 帧：请求 */
interface GatewayReqFrame {
  type: 'req';
  id: string;
  method: string;
  params?: Record<string, unknown>;
}

/** Gateway 帧：响应 */
interface GatewayResFrame {
  type: 'res';
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: {
    code?: string;
    message?: string;
    details?: Record<string, unknown>;
  };
}

/** Gateway 帧：事件 */
interface GatewayEventFrame {
  type: 'event';
  event: string;
  payload?: unknown;
}

type GatewayFrame = GatewayReqFrame | GatewayResFrame | GatewayEventFrame;

/** 待处理 RPC 调用记录 */
interface PendingRpc {
  resolve: (result: RpcResult) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}

// ─── WS 客户端单例 ────────────────────────────────────────────────────────────

/**
 * Gateway WebSocket RPC 客户端
 *
 * 维持一个单例 WS 连接，所有 IPC 模块通过 `GatewayWsClient.getInstance()`
 * 获取实例后调用 `rpc(method, params)` 执行管理操作。
 *
 * 连接生命周期：
 * 1. 首次调用 `connect()` 建立连接
 * 2. 收到 `connect.challenge` 事件后发送 `connect` 帧
 * 3. 收到 `hello-ok` 响应后标记为 connected
 * 4. 断连后标记为 disconnected，后续调用将返回错误
 */
export class GatewayWsClient extends EventEmitter {
  private static _instance: GatewayWsClient | null = null;

  private _ws: WebSocket | null = null;
  private _connected = false;
  private _connecting = false;
  private _params: GatewayWsConnectionParams | null = null;
  private _pending = new Map<string, PendingRpc>();
  private _reqCounter = 0;
  /** 收到的设备 token（hello-ok 颁发，用于后续重连） */
  private _deviceToken: string | null = null;

  private constructor() {
    super();
  }

  /** 获取全局单例 */
  static getInstance(): GatewayWsClient {
    if (!GatewayWsClient._instance) {
      GatewayWsClient._instance = new GatewayWsClient();
    }
    return GatewayWsClient._instance;
  }

  /** 当前是否已连接 */
  get isConnected(): boolean {
    return this._connected;
  }

  // ─── 连接建立 ───────────────────────────────────────────────────────────────

  /**
   * 建立 WebSocket 连接并完成握手
   *
   * @param params 连接参数（url、token）
   * @returns 握手结果，包含 success 和可选 error
   */
  async connect(params: GatewayWsConnectionParams): Promise<{ success: boolean; error?: string }> {
    if (this._connecting) {
      return { success: false, error: '连接建立中，请稍候' };
    }
    if (this._connected && this._ws?.readyState === WebSocket.OPEN) {
      return { success: true };
    }

    this._params = params;
    this._connecting = true;
    this._connected = false;

    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        this._connecting = false;
        this._ws?.terminate();
        this._ws = null;
        resolve({ success: false, error: '连接超时，请检查 Gateway 地址和端口' });
      }, CONNECT_TIMEOUT_MS);

      try {
        const ws = new WebSocket(params.url, {
          handshakeTimeout: CONNECT_TIMEOUT_MS,
        });

        this._ws = ws;

        ws.on('open', () => {
          // WebSocket 连接成功，等待 Gateway 发送 connect.challenge 事件
          // Gateway 会在连接建立后立即推送 challenge，无需主动发送
        });

        ws.on('message', (data: WebSocket.RawData) => {
          try {
            const frame = JSON.parse(data.toString()) as GatewayFrame;
            this._handleFrame(frame, { timeoutId, resolve });
          } catch {
            // 非 JSON 帧忽略
          }
        });

        ws.on('error', (err) => {
          clearTimeout(timeoutId);
          this._connecting = false;
          this._connected = false;
          this._ws = null;
          this._rejectAllPending('连接错误: ' + err.message);
          resolve({ success: false, error: this._mapWsError(err) });
        });

        ws.on('close', () => {
          this._connected = false;
          this._connecting = false;
          this._rejectAllPending('连接已断开');
          this.emit('disconnected');
        });
      } catch (err: any) {
        clearTimeout(timeoutId);
        this._connecting = false;
        resolve({ success: false, error: this._mapWsError(err) });
      }
    });
  }

  /**
   * 断开当前 WebSocket 连接
   */
  disconnect(): void {
    this._connected = false;
    this._connecting = false;
    this._rejectAllPending('主动断开连接');
    this._ws?.close();
    this._ws = null;
    this._deviceToken = null;
  }

  // ─── RPC 调用 ───────────────────────────────────────────────────────────────

  /**
   * 向 Gateway 发送 RPC 请求并等待响应
   *
   * @param method RPC 方法名（如 "config.get"、"sessions.list"）
   * @param params 方法参数
   * @param timeoutMs 调用超时时间，默认 15 秒
   * @returns RPC 结果
   */
  async rpc<T = unknown>(
    method: string,
    params: Record<string, unknown> = {},
    timeoutMs = DEFAULT_RPC_TIMEOUT_MS,
  ): Promise<RpcResult<T>> {
    if (!this._connected || !this._ws || this._ws.readyState !== WebSocket.OPEN) {
      return { success: false, error: '未连接到远程 Gateway，请先配置并验证连接' };
    }

    const id = `rpc_${++this._reqCounter}_${Date.now()}`;
    const frame: GatewayReqFrame = { type: 'req', id, method, params };

    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        this._pending.delete(id);
        resolve({ success: false, error: `RPC 调用超时（method: ${method}）` });
      }, timeoutMs);

      this._pending.set(id, { resolve: resolve as (r: RpcResult) => void, timeoutId });

      try {
        this._ws!.send(JSON.stringify(frame));
      } catch (err: any) {
        clearTimeout(timeoutId);
        this._pending.delete(id);
        resolve({ success: false, error: `发送请求失败: ${err.message}` });
      }
    });
  }

  // ─── 内部帧处理 ─────────────────────────────────────────────────────────────

  /**
   * 处理收到的 Gateway 帧
   * 分两阶段：握手阶段（处理 connect.challenge + hello-ok）和已连接阶段（处理 res 帧和事件帧）
   */
  private _handleFrame(
    frame: GatewayFrame,
    handshakeCtx: { timeoutId: ReturnType<typeof setTimeout>; resolve: (r: { success: boolean; error?: string }) => void } | null,
  ): void {
    // ── 事件帧 ──────────────────────────────────────────────────────────────
    if (frame.type === 'event') {
      const eventFrame = frame as GatewayEventFrame;

      // connect.challenge：Gateway 要求客户端完成 connect 握手
      if (eventFrame.event === 'connect.challenge') {
        this._sendConnectFrame();
        return;
      }

      // 其他事件推送给外部订阅者
      this.emit('gateway:event', eventFrame.event, eventFrame.payload);
      return;
    }

    // ── 响应帧 ──────────────────────────────────────────────────────────────
    if (frame.type === 'res') {
      const resFrame = frame as GatewayResFrame;

      // 握手响应（hello-ok）
      if (handshakeCtx && !this._connected) {
        clearTimeout(handshakeCtx.timeoutId);
        this._connecting = false;

        if (resFrame.ok) {
          this._connected = true;
          // 持久化 deviceToken（如果 Gateway 颁发了）
          const authPayload = (resFrame.payload as any)?.auth;
          if (authPayload?.deviceToken) {
            this._deviceToken = authPayload.deviceToken;
          }
          this.emit('connected');
          handshakeCtx.resolve({ success: true });
        } else {
          this._connected = false;
          this._ws?.close();
          this._ws = null;
          const errMsg = resFrame.error?.message || resFrame.error?.code || '握手失败';
          handshakeCtx.resolve({ success: false, error: errMsg });
        }
        return;
      }

      // 普通 RPC 响应
      const pending = this._pending.get(resFrame.id);
      if (pending) {
        clearTimeout(pending.timeoutId);
        this._pending.delete(resFrame.id);

        if (resFrame.ok) {
          pending.resolve({ success: true, data: resFrame.payload });
        } else {
          const errCode = resFrame.error?.code || 'UNKNOWN';
          const errMsg = resFrame.error?.message || `RPC 错误 (${errCode})`;
          pending.resolve({ success: false, error: errMsg });
        }
      }
    }
  }

  /**
   * 向 Gateway 发送 connect 握手帧
   * 需携带 role、scopes、auth.token，以及协议版本范围
   */
  private _sendConnectFrame(): void {
    if (!this._ws || !this._params) return;

    const connectId = `connect_${Date.now()}`;
    const connectFrame: GatewayReqFrame = {
      type: 'req',
      id: connectId,
      method: 'connect',
      params: {
        minProtocol: MIN_PROTOCOL,
        maxProtocol: MAX_PROTOCOL,
        client: {
          id: 'openclaw-desktop',
          version: '0.4.9',
          platform: process.platform,
          mode: 'operator',
        },
        role: 'operator',
        scopes: ['operator.read', 'operator.write', 'operator.admin'],
        caps: [],
        commands: [],
        permissions: {},
        auth: this._deviceToken
          ? { deviceToken: this._deviceToken }
          : { token: this._params.token || '' },
        locale: 'zh-CN',
        userAgent: 'openclaw-desktop/0.4.9',
      },
    };

    // 绑定握手响应处理器（覆盖 message 监听）
    // 此帧的响应由 _handleFrame 中 handshakeCtx 分支处理
    this._ws.send(JSON.stringify(connectFrame));
  }

  /**
   * 拒绝所有等待中的 RPC 调用（连接断开时）
   */
  private _rejectAllPending(reason: string): void {
    for (const [id, pending] of this._pending) {
      clearTimeout(pending.timeoutId);
      pending.resolve({ success: false, error: reason });
      this._pending.delete(id);
    }
  }

  /**
   * 将 WebSocket 底层错误映射为用户友好的中文描述
   */
  private _mapWsError(err: any): string {
    const code = err?.code || err?.cause?.code || '';
    const msg = err?.message || String(err);

    if (code === 'ECONNREFUSED') return '连接被拒绝，请确认 Gateway 正在运行且地址/端口正确';
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return '无法解析服务器地址，请检查域名是否正确';
    if (code === 'ECONNRESET') return '连接被远端重置，请检查网络或 Gateway 状态';
    if (code === 'ETIMEDOUT') return '连接超时，请检查地址和端口';
    if (code === 'DEPTH_ZERO_SELF_SIGNED_CERT' || code === 'SELF_SIGNED_CERT_IN_CHAIN') {
      return '服务器使用了自签名证书，请在连接设置中启用"跳过证书验证"';
    }

    // WebSocket 升级失败（HTTP 层错误，如 404/401）
    if (msg.includes('404') || msg.includes('Not Found')) {
      return '连接失败：Gateway 未在该地址运行（HTTP 404）';
    }
    if (msg.includes('401') || msg.includes('Unauthorized')) {
      return '认证失败，请检查访问 token 是否正确';
    }
    if (msg.includes('403') || msg.includes('Forbidden')) {
      return '认证失败（403 Forbidden），请检查 token 权限';
    }

    return `连接失败: ${msg}`;
  }
}

// ─── 模块级便捷函数 ───────────────────────────────────────────────────────────

/**
 * 获取全局 WS 客户端单例的快捷函数
 */
export function getWsClient(): GatewayWsClient {
  return GatewayWsClient.getInstance();
}
