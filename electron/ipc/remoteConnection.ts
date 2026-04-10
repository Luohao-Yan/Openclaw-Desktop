/**
 * 远程 OpenClaw 连接模块
 *
 * 实现远程 OpenClaw 服务器的连接测试与连接信息持久化。
 * 通过 IPC 暴露 `remote:testConnection` 和 `remote:saveConnection` handler，
 * 由渲染进程的远程连接配置页面调用。
 *
 * 核心逻辑（错误分类、URL 构建、版本解析等）委托给 remoteConnectionLogic.ts 纯函数模块。
 */

import pkg from 'electron';
const { ipcMain } = pkg;
import Store from 'electron-store';
import {
  mapNetworkError,
  isSelfSignedCertError,
  buildCertErrorMessage,
  parseVersionFromBody,
  isAuthError,
  buildProbeUrls,
} from './remoteConnectionLogic.js';

// ─── 类型定义（与 src/types/electron.ts 中的类型保持一致）────────────────────

/** 远程 OpenClaw 连接参数 */
interface RemoteOpenClawConnectionPayload {
  host: string;
  port?: number;
  protocol: 'http' | 'https';
  token?: string;
  /** 是否跳过 SSL 证书验证（自签名证书场景） */
  skipCertVerification?: boolean;
}

/** 远程 OpenClaw 连接测试结果 */
interface RemoteOpenClawTestResult {
  success: boolean;
  error?: string;
  version?: string;
  host?: string;
  port?: number;
  authenticated?: boolean;
  /** 是否为自签名证书错误 */
  isSelfSignedCertError?: boolean;
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
 * 按优先级依次向以下路径发送 GET 请求，遇到首个有效响应即终止：
 *   1. /status        — OpenClaw 4.5+ 标准路径（v2026.3.28 起主用）
 *   2. /api/status    — 反向代理部署常见路径
 *   3. /api/version   — 旧版兼容路径
 *
 * 携带 `Authorization: Bearer {token}` 头（如果提供了 token）。
 * 支持 skipCertVerification 选项以允许自签名证书。
 *
 * @param payload 远程连接参数（host、port、protocol、token、skipCertVerification）
 * @returns 测试结果，包含 success、version、authenticated、isSelfSignedCertError 等字段
 */
async function testRemoteConnection(
  payload: RemoteOpenClawConnectionPayload,
): Promise<RemoteOpenClawTestResult> {
  const { host, port = 3000, protocol = 'http', token, skipCertVerification } = payload;

  // 构建请求头
  const headers: Record<string, string> = {
    'Accept': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // 临时禁用 TLS 证书验证（自签名证书场景）
  if (skipCertVerification) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  }

  try {
    // 获取按优先级排列的探测 URL 列表
    const probeUrls = buildProbeUrls({ host, port, protocol });
    let lastError: string = '路径探测失败，请确认远程 Gateway 已启动且地址/端口正确';

    for (const url of probeUrls) {
      // 每个路径独立使用 AbortController 控制超时
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CONNECTION_TIMEOUT_MS);

      try {
        const response = await fetch(url, {
          method: 'GET',
          headers,
          signal: controller.signal,
        });

        // 认证失败（401/403）：说明服务器可达，直接返回认证错误，无需继续探测
        if (isAuthError(response.status)) {
          return {
            success: false,
            error: '认证失败，请检查访问令牌是否正确',
            host,
            port,
            authenticated: false,
          };
        }

        // 当前路径返回 404 或其他非 2xx：记录错误并尝试下一路径
        if (!response.ok) {
          lastError = `服务器返回错误状态码: ${response.status} ${response.statusText}`;
          continue;
        }

        // 成功：解析响应体，提取版本号
        let version = 'unknown';
        try {
          const body = await response.json();
          version = parseVersionFromBody(body);
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
        // 超时：记录并尝试下一路径
        if (err.name === 'AbortError') {
          lastError = '连接超时，请检查服务器地址和端口是否正确';
          continue;
        }

        // 自签名证书错误：直接返回，无需继续探测
        if (isSelfSignedCertError(err)) {
          return {
            success: false,
            error: buildCertErrorMessage(err),
            host,
            port,
            isSelfSignedCertError: true,
          };
        }

        // 网络层错误（ECONNREFUSED / ENOTFOUND 等）：直接返回，无需继续探测
        return {
          success: false,
          error: mapNetworkError(err),
          host,
          port,
        };
      } finally {
        clearTimeout(timeoutId);
      }
    }

    // 所有候选路径均未返回成功响应
    return {
      success: false,
      error: lastError,
      host,
      port,
    };
  } finally {
    // 无论结果如何，都恢复 TLS 验证设置
    if (skipCertVerification) {
      delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    }
  }
}

// ─── 连接保存 ───────────────────────────────────────────────────────────────

/**
 * 保存远程连接信息到 electron-store
 *
 * 保存前先通过 testRemoteConnection 验证 token 有效性，
 * 若认证失败则拒绝保存。验证通过后将连接参数持久化，
 * 同时更新 runMode 为 'remote'。
 *
 * @param payload 远程连接参数
 * @returns 保存结果
 */
async function saveRemoteConnection(
  payload: RemoteOpenClawConnectionPayload,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { host, port = 3000, protocol = 'http', token, skipCertVerification } = payload;

    // 当提供了 token 时，先通过 API 调用验证 token 有效性
    if (token) {
      const testResult = await testRemoteConnection(payload);
      // 认证失败时拒绝保存
      if (!testResult.success && testResult.authenticated === false) {
        return {
          success: false,
          error: testResult.error || '认证失败，无法保存连接信息',
        };
      }
      // 自签名证书错误时也拒绝保存（除非启用了跳过验证）
      if (!testResult.success && testResult.isSelfSignedCertError && !skipCertVerification) {
        return {
          success: false,
          error: testResult.error || '证书验证失败，无法保存连接信息',
        };
      }
      // 其他连接错误也拒绝保存
      if (!testResult.success) {
        return {
          success: false,
          error: testResult.error || '连接测试失败，无法保存连接信息',
        };
      }
    }

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
