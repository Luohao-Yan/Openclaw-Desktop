/**
 * 远程 API 代理核心模块
 *
 * 提供统一的远程请求方法，自动注入 Bearer token、超时控制、HTTP 错误分类。
 * 纯逻辑函数已提取到 remoteApiProxyLogic.ts，便于属性测试。
 *
 * 依赖 electron-store 读取连接配置和运行模式，依赖 fetch 发送 HTTP 请求。
 * 复用 remoteConnectionLogic.ts 中的 mapNetworkError()、isSelfSignedCertError() 等纯函数。
 */

import Store from 'electron-store';
import { mapNetworkError, isSelfSignedCertError } from './remoteConnectionLogic.js';
import {
  buildRequestHeaders,
  classifyHttpError,
  checkRunMode,
  getRemoteCapabilities,
} from './remoteApiProxyLogic.js';
import type {
  RemoteRequestOptions,
  RemoteApiResult,
  RemoteCapabilities,
} from '../../types/remote.js';

// 重新导出纯函数，供其他模块使用
export {
  buildRequestHeaders,
  classifyHttpError,
  checkRunMode,
  getRemoteCapabilities,
};

// ─── electron-store 实例 ─────────────────────────────────────────────────────

/** 远程连接持久化配置结构 */
interface RemoteProxyStore {
  remoteConnection?: {
    host: string;
    port: number;
    protocol: 'http' | 'https';
    token?: string;
  };
  runMode?: 'local' | 'remote';
}

const store = new Store<RemoteProxyStore>();

/** 默认请求超时时间（毫秒） */
const DEFAULT_TIMEOUT_MS = 15_000;


// ─── 运行时函数：判断当前是否为远程模式 ──────────────────────────────────────

/**
 * 从 electron-store 读取 runMode 判断当前是否处于远程模式
 *
 * @returns 当 runMode 为 'remote' 时返回 true
 */
export function isRemoteMode(): boolean {
  const runMode = store.get('runMode', 'local');
  return checkRunMode(runMode);
}

// ─── 运行时函数：远程 HTTP 请求 ─────────────────────────────────────────────

/**
 * 向远程 Gateway 发送 HTTP 请求
 *
 * - 自动从 electron-store 读取连接配置构建完整 URL
 * - 自动注入 Bearer token（如果已配置）
 * - 使用 AbortController 实现超时控制（默认 15 秒）
 * - 自动分类 HTTP 错误（认证失败、验证错误、通用错误）
 * - 复用 remoteConnectionLogic 中的网络错误映射
 *
 * @param options 请求选项（method、path、body、timeoutMs）
 * @returns 结构化的请求结果
 */
export async function remoteRequest<T>(
  options: RemoteRequestOptions,
): Promise<RemoteApiResult<T>> {
  const { method, path, body, timeoutMs = DEFAULT_TIMEOUT_MS } = options;

  // 从 electron-store 读取连接配置
  const connection = store.get('remoteConnection');
  if (!connection) {
    return {
      success: false,
      error: '未配置远程连接信息，请先在设置中配置远程连接',
    };
  }

  const { host, port, protocol, token } = connection;
  const baseUrl = `${protocol}://${host}:${port}`;
  const url = `${baseUrl}${path}`;

  // 构建请求头（自动注入 Bearer token）
  const headers = buildRequestHeaders(token);

  // 使用 AbortController 实现超时控制
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const fetchOptions: RequestInit = {
      method,
      headers,
      signal: controller.signal,
    };

    // POST/PUT 请求附加请求体
    if (body !== undefined && (method === 'POST' || method === 'PUT')) {
      fetchOptions.body = JSON.stringify(body);
    }

    const response = await fetch(url, fetchOptions);

    // 非 2xx 状态码：分类错误
    if (!response.ok) {
      let responseBody: any;
      try {
        responseBody = await response.json();
      } catch {
        // 响应体解析失败时忽略
      }
      return classifyHttpError(response.status, responseBody);
    }

    // 成功响应：解析 JSON
    let data: T;
    try {
      data = await response.json();
    } catch {
      return {
        success: false,
        error: '响应格式错误',
        statusCode: response.status,
      };
    }

    return {
      success: true,
      data,
      statusCode: response.status,
    };
  } catch (err: any) {
    // 超时错误（AbortController 触发）
    if (err.name === 'AbortError') {
      return {
        success: false,
        error: '请求超时，请检查远程服务器是否可达',
      };
    }

    // 自签名证书错误
    if (isSelfSignedCertError(err)) {
      return {
        success: false,
        error: '服务器使用了自签名证书，请在连接设置中启用"跳过证书验证"选项',
      };
    }

    // 其他网络错误：复用 mapNetworkError 纯函数
    return {
      success: false,
      error: mapNetworkError(err),
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
