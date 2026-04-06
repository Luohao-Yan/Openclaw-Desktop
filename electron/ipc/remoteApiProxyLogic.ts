/**
 * 远程 API 代理纯逻辑模块
 *
 * 将 remoteApiProxy.ts 中的核心逻辑提取为纯函数，
 * 不依赖 Electron、fetch、electron-store 等运行时环境，便于属性测试。
 *
 * 所有外部依赖（网络请求、持久化存储）均保留在 remoteApiProxy.ts 中，
 * 本模块仅包含可独立测试的纯计算逻辑。
 */

import type {
  RemoteApiResult,
  RemoteCapabilities,
} from '../../types/remote.js';

// ─── 纯函数：构建请求头 ─────────────────────────────────────────────────────

/**
 * 构建 HTTP 请求头，包含可选的 Bearer token 认证
 *
 * 非空 token 时添加 Authorization: Bearer <token> 头；
 * 空字符串或 undefined 时不添加 Authorization 头。
 *
 * @param token 可选的认证令牌
 * @returns 请求头对象
 */
export function buildRequestHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  };
  if (token && token.length > 0) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

// ─── 纯函数：HTTP 错误分类 ──────────────────────────────────────────────────

/**
 * 根据 HTTP 状态码和响应体分类错误
 *
 * - 401/403 → 认证失败（authenticated: false）
 * - 400 → 验证错误，从响应体提取详情
 * - 其他非 2xx → 通用错误，包含状态码
 *
 * @param statusCode HTTP 响应状态码
 * @param responseBody 可选的已解析响应体
 * @returns 分类后的错误结果
 */
export function classifyHttpError(
  statusCode: number,
  responseBody?: any,
): RemoteApiResult<never> {
  // 认证失败：401 Unauthorized / 403 Forbidden
  if (statusCode === 401 || statusCode === 403) {
    return {
      success: false,
      authenticated: false,
      error: '认证失败，请检查访问令牌是否正确',
      statusCode,
    };
  }

  // 验证错误：400 Bad Request
  if (statusCode === 400) {
    const detail =
      responseBody && typeof responseBody === 'object'
        ? responseBody.message || responseBody.error || JSON.stringify(responseBody)
        : '请求参数验证失败';
    return {
      success: false,
      error: `验证错误: ${detail}`,
      statusCode,
    };
  }

  // 其他非 2xx 状态码：通用错误
  return {
    success: false,
    error: `远程服务器返回错误状态码: ${statusCode}`,
    statusCode,
  };
}

// ─── 纯函数：检查运行模式 ───────────────────────────────────────────────────

/**
 * 判断给定的运行模式字符串是否为远程模式
 *
 * @param runMode 运行模式字符串
 * @returns 当 runMode 为 'remote' 时返回 true，否则返回 false
 */
export function checkRunMode(runMode: string): boolean {
  return runMode === 'remote';
}

// ─── 纯函数：远程功能可用性映射 ─────────────────────────────────────────────

/**
 * 获取远程模式下的功能可用性映射
 *
 * 远程模式下，通过官方 API 可用的功能返回 true，
 * 仅限本地的功能（gatewayStartStop、cron、approvals 等）返回 false。
 *
 * @returns 远程功能可用性映射对象
 */
export function getRemoteCapabilities(): RemoteCapabilities {
  return {
    gatewayStatus: true,
    gatewayStartStop: false,
    sessions: true,
    sessionSend: true,
    channels: true,
    channelEnableDisable: true,
    logs: true,
    config: true,
    skills: true,
    skillInstall: true,
    models: true,
    cron: false,
    approvals: false,
    systemStats: false,
    tailscale: false,
    agentCreate: false,
    agentWorkspace: false,
    environmentFix: false,
    customSkills: false,
    openLocalFile: false,
  };
}
