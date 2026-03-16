/**
 * 远程 OpenClaw 连接模块
 *
 * 实现远程 OpenClaw 服务器的连接测试与连接信息持久化。
 * 通过 IPC 暴露 `remote:testConnection` 和 `remote:saveConnection` handler，
 * 由渲染进程的远程连接配置页面调用。
 */

import pkg from 'electron';
const { ipcMain } = pkg;
import Store from 'electron-store';

// ─── 类型定义（与 src/types/electron.ts 中的类型保持一致）────────────────────

/** 远程 OpenClaw 连接参数 */
interface RemoteOpenClawConnectionPayload {
  host: string;
  port?: number;
  protocol: 'http' | 'https';
  token?: string;
}

/** 远程 OpenClaw 连接测试结果 */
interface RemoteOpenClawTestResult {
  success: boolean;
  error?: string;
  version?: string;
  host?: string;
  port?: number;
  authenticated?: boolean;
}

// ─── electron-store 实例（复用 settings 的 store 结构）─────────────────────

/** 远程连接持久化配置结构 */
interface RemoteConnectionStore {
  remoteConnection?: {
    host: string;
    port: number;
    protocol: 'http' | 'https';
    token?: string;
    lastVerifiedAt?: string;
    version?: string;
  };
  runMode?: 'local' | 'remote';
}

const store = new Store<RemoteConnectionStore>();

// ─── 连接测试 ───────────────────────────────────────────────────────────────

/** 连接超时时间（毫秒） */
const CONNECTION_TIMEOUT_MS = 10_000;

/**
 * 测试远程 OpenClaw 连接
 *
 * 向 `{protocol}://{host}:{port}/api/version` 发送 GET 请求，
 * 携带 `Authorization: Bearer {token}` 头（如果提供了 token）。
 *
 * @param payload 远程连接参数（host、port、protocol、token）
 * @returns 测试结果，包含 success、version、authenticated 等字段
 */
async function testRemoteConnection(
  payload: RemoteOpenClawConnectionPayload,
): Promise<RemoteOpenClawTestResult> {
  const { host, port = 3000, protocol = 'http', token } = payload;
  const url = `${protocol}://${host}:${port}/api/version`;

  try {
    // 构建请求头
    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // 使用 AbortController 实现超时控制
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONNECTION_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    // 处理 HTTP 401/403 认证失败
    if (response.status === 401 || response.status === 403) {
      return {
        success: false,
        error: '认证失败，请检查访问令牌是否正确',
        host,
        port,
      };
    }

    // 处理其他非成功状态码
    if (!response.ok) {
      return {
        success: false,
        error: `服务器返回错误状态码: ${response.status} ${response.statusText}`,
        host,
        port,
      };
    }

    // 解析响应体，提取版本号
    let version = 'unknown';
    try {
      const body = await response.json();
      version = body.version || body.v || body.data?.version || 'unknown';
    } catch {
      // 响应体解析失败时使用默认版本号
    }

    return {
      success: true,
      version,
      authenticated: Boolean(token),
      host,
      port,
    };
  } catch (err: any) {
    // 超时错误处理（AbortController 触发的 AbortError）
    if (err.name === 'AbortError') {
      return {
        success: false,
        error: '连接超时，请检查服务器地址和端口是否正确',
        host,
        port,
      };
    }

    // 网络错误处理（DNS 解析失败、连接拒绝等）
    const errorMessage = mapNetworkError(err);
    return {
      success: false,
      error: errorMessage,
      host,
      port,
    };
  }
}

/**
 * 将底层网络错误映射为用户友好的错误描述
 *
 * @param err 原始错误对象
 * @returns 用户可读的错误描述
 */
function mapNetworkError(err: any): string {
  const code = err.code || err.cause?.code || '';
  const message = err.message || String(err);

  if (code === 'ECONNREFUSED') {
    return '连接被拒绝，请确认服务器正在运行且端口正确';
  }
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    return '无法解析服务器地址，请检查主机名是否正确';
  }
  if (code === 'ECONNRESET') {
    return '连接被重置，请检查网络连接或服务器状态';
  }
  if (code === 'ETIMEDOUT') {
    return '连接超时，请检查服务器地址和端口是否正确';
  }
  if (code === 'CERT_HAS_EXPIRED' || code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
    return 'SSL 证书验证失败，请检查服务器证书配置';
  }
  if (code === 'DEPTH_ZERO_SELF_SIGNED_CERT' || code === 'SELF_SIGNED_CERT_IN_CHAIN') {
    return '服务器使用了自签名证书，请检查证书配置';
  }

  return `网络错误: ${message}`;
}

// ─── 连接保存 ───────────────────────────────────────────────────────────────

/**
 * 保存远程连接信息到 electron-store
 *
 * 将连接参数持久化，同时更新 runMode 为 'remote'，
 * 使后续所有 API 调用通过远程连接转发。
 *
 * @param payload 远程连接参数
 * @returns 保存结果
 */
async function saveRemoteConnection(
  payload: RemoteOpenClawConnectionPayload,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { host, port = 3000, protocol = 'http', token } = payload;

    // 持久化远程连接信息
    store.set('remoteConnection', {
      host,
      port,
      protocol,
      token,
      lastVerifiedAt: new Date().toISOString(),
    });

    // 更新运行模式为远程
    store.set('runMode', 'remote');

    return { success: true };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || String(err),
    };
  }
}

// ─── IPC 注册 ───────────────────────────────────────────────────────────────

/**
 * 注册远程连接相关的 IPC handler
 *
 * - `remote:testConnection` — 测试远程 OpenClaw 连接
 * - `remote:saveConnection` — 保存远程连接信息
 */
export function setupRemoteConnectionIPC(): void {
  ipcMain.handle('remote:testConnection', (_event, payload: RemoteOpenClawConnectionPayload) =>
    testRemoteConnection(payload),
  );

  ipcMain.handle('remote:saveConnection', (_event, payload: RemoteOpenClawConnectionPayload) =>
    saveRemoteConnection(payload),
  );
}
