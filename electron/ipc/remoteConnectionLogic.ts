/**
 * 远程连接纯逻辑模块
 *
 * 将 remoteConnection.ts 中的核心逻辑提取为纯函数，
 * 不依赖 Electron、fetch、electron-store 等运行时环境，便于属性测试。
 *
 * 所有外部依赖（网络请求、持久化存储）均保留在 remoteConnection.ts 中，
 * 本模块仅包含可独立测试的纯计算逻辑。
 */

// ─── 类型定义 ────────────────────────────────────────────────────────────────

/** 远程连接参数（与 remoteConnection.ts 中的类型一致） */
export interface RemoteConnectionPayload {
  host: string;
  port?: number;
  protocol: 'http' | 'https';
  token?: string;
}

/** 超时测试结果 */
export interface TimeoutResult {
  success: false;
  error: string;
  host: string;
  port: number;
}

// ─── 纯函数：构建远程连接 URL ────────────────────────────────────────────────

/**
 * 根据连接参数构建完整的 API 版本检测 URL
 *
 * @param payload 远程连接参数
 * @returns 完整的 URL 字符串，格式为 `{protocol}://{host}:{port}/api/version`
 */
export function buildRemoteUrl(payload: RemoteConnectionPayload): string {
  const { host, port = 3000, protocol = 'http' } = payload;
  return `${protocol}://${host}:${port}/api/version`;
}

// ─── 纯函数：映射网络错误 ────────────────────────────────────────────────────

/**
 * 将底层网络错误码映射为用户友好的中文错误描述
 *
 * @param err 原始错误对象，需包含 code 或 cause.code 属性
 * @returns 用户可读的中文错误描述
 */
export function mapNetworkError(err: { code?: string; cause?: { code?: string }; message?: string }): string {
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

// ─── 纯函数：解析响应体中的版本号 ────────────────────────────────────────────

/**
 * 从 API 响应体中提取版本号
 *
 * 按优先级依次尝试 body.version、body.v、body.data.version，
 * 均不存在时返回 'unknown'。
 *
 * @param body 解析后的 JSON 响应体（可能为 null/undefined）
 * @returns 提取到的版本号字符串
 */
export function parseVersionFromBody(body: any): string {
  if (!body || typeof body !== 'object') {
    return 'unknown';
  }
  return body.version || body.v || body.data?.version || 'unknown';
}

// ─── 纯函数：判断认证错误 ────────────────────────────────────────────────────

/**
 * 判断 HTTP 状态码是否表示认证失败
 *
 * @param statusCode HTTP 响应状态码
 * @returns 当状态码为 401 或 403 时返回 true
 */
export function isAuthError(statusCode: number): boolean {
  return statusCode === 401 || statusCode === 403;
}

// ─── 纯函数：构建超时错误结果 ────────────────────────────────────────────────

/**
 * 构建连接超时的标准错误结果
 *
 * 对于任意 host/port 组合，超时后始终返回 `{ success: false }` 且 error 包含"超时"。
 * 此函数封装了超时结果的构建逻辑，确保超时处理的一致性。
 *
 * @param payload 远程连接参数
 * @returns 标准化的超时错误结果
 */
export function buildTimeoutResult(payload: RemoteConnectionPayload): TimeoutResult {
  const { host, port = 3000 } = payload;
  return {
    success: false,
    error: '连接超时，请检查服务器地址和端口是否正确',
    host,
    port,
  };
}
