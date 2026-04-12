/**
 * 远程 Gateway RPC 代理模块
 *
 * 对外提供统一的 `remoteRpc<T>(method, params)` 函数，
 * 所有需要通过 WS RPC 访问远程 Gateway 的模块通过此函数调用，
 * 无需直接依赖 GatewayWsClient。
 *
 * 与 remoteApiProxy.ts 的区别：
 * - remoteApiProxy：基于 HTTP fetch，仅适用于 /v1/models、/status 等 HTTP 端点
 * - remoteRpcProxy：基于 WebSocket RPC，适用于所有控制平面操作
 *
 * 连接参数从 electron-store 中读取（与 remoteApiProxy 共用同一份存储），
 * 首次 RPC 调用时自动建立 WS 连接（懒连接），后续复用已有连接。
 *
 * 官方协议文档：https://docs.openclaw.ai/gateway/protocol
 */

import Store from 'electron-store';
import { GatewayWsClient } from './remoteWsClient.js';
import type { RpcResult } from './remoteWsClient.js';

// ─── 存储类型（与 remoteApiProxy.ts 共用结构） ──────────────────────────────

interface RemoteConnectionStore {
  remoteConnection?: {
    host: string;
    port: number;
    protocol: 'http' | 'https';
    token?: string;
  };
  runMode?: string;
}

const store = new Store<RemoteConnectionStore>();

// ─── 连接建立 ────────────────────────────────────────────────────────────────

/**
 * 将 HTTP/HTTPS 协议转换为对应的 WebSocket 协议
 * - http  → ws
 * - https → wss
 */
function toWsProtocol(protocol: 'http' | 'https'): 'ws' | 'wss' {
  return protocol === 'https' ? 'wss' : 'ws';
}

/**
 * 确保 WS 连接已建立，如未连接则自动发起连接
 *
 * @returns 连接结果
 */
async function ensureConnected(): Promise<{ success: boolean; error?: string }> {
  const client = GatewayWsClient.getInstance();

  if (client.isConnected) {
    return { success: true };
  }

  const connection = store.get('remoteConnection');
  if (!connection) {
    return {
      success: false,
      error: '未配置远程连接信息，请先在设置中配置远程连接',
    };
  }

  const { host, port, protocol, token } = connection;
  const wsProtocol = toWsProtocol(protocol);
  const url = `${wsProtocol}://${host}:${port}`;

  return client.connect({ url, token });
}

// ─── 核心代理函数 ─────────────────────────────────────────────────────────────

/**
 * 向远程 Gateway 发起 WebSocket RPC 调用
 *
 * 此函数是所有远程管理操作的统一入口，自动处理连接建立、
 * 请求发送和响应解析。与 remoteRequest（HTTP）的接口保持一致，
 * 便于上层模块平滑切换。
 *
 * @param method Gateway RPC 方法名（如 "config.get"、"sessions.list"）
 * @param params 方法参数
 * @param timeoutMs 调用超时时间（默认 15 秒）
 * @returns RPC 结果，结构与 RemoteApiResult<T> 兼容
 */
export async function remoteRpc<T = unknown>(
  method: string,
  params: Record<string, unknown> = {},
  timeoutMs?: number,
): Promise<RpcResult<T>> {
  const connResult = await ensureConnected();
  if (!connResult.success) {
    return { success: false, error: connResult.error };
  }

  return GatewayWsClient.getInstance().rpc<T>(method, params, timeoutMs);
}

/**
 * 判断当前是否为远程模式（从 electron-store 读取 runMode）
 * 与 remoteApiProxy.ts 中的 isRemoteMode() 保持一致
 */
export function isRemoteMode(): boolean {
  const runMode = store.get('runMode', 'local');
  return runMode === 'remote';
}

/**
 * 重置 WS 连接（用于切换远程实例或更新连接参数后）
 */
export function resetWsConnection(): void {
  GatewayWsClient.getInstance().disconnect();
}
