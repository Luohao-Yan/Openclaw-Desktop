/**
 * 远程响应格式化纯函数模块
 *
 * 将远程 Gateway API 的 JSON 响应映射为与本地 IPC 返回值相同结构的对象。
 * 所有函数均为纯函数，不依赖 Electron、fetch、electron-store 等运行时环境，
 * 便于属性测试和单元测试。
 *
 * 对于无效 JSON 输入，统一返回 { success: false, error: "响应格式错误" }。
 */

// ─── 通用工具函数 ────────────────────────────────────────────────────────────

/**
 * 解析远程 JSON 响应字符串
 *
 * 尝试将字符串解析为 JSON 对象。解析失败时返回标准化的错误结果。
 *
 * @param raw 原始 JSON 字符串
 * @returns 解析成功返回 { success: true, data }，失败返回 { success: false, error: "响应格式错误" }
 */
export function parseRemoteJson(raw: string): { success: true; data: unknown } | { success: false; error: string } {
  try {
    const data = JSON.parse(raw);
    return { success: true, data };
  } catch {
    return { success: false, error: '响应格式错误' };
  }
}

/**
 * JSON 往返一致性验证
 *
 * 验证 JSON.parse(JSON.stringify(data)) 是否与原始数据深度相等。
 * 用于确保数据在序列化/反序列化过程中不丢失信息。
 *
 * @param data 待验证的数据对象
 * @returns 往返一致时返回 true
 */
export function validateJsonRoundTrip(data: unknown): boolean {
  try {
    const serialized = JSON.stringify(data);
    const deserialized = JSON.parse(serialized);
    return JSON.stringify(deserialized) === serialized;
  } catch {
    return false;
  }
}

/**
 * 过滤远程响应中本地接口未定义的额外字段
 *
 * 仅保留 allowedKeys 中列出的字段，其余字段被丢弃。
 * 保留字段的值与原始对象中的值相同（浅拷贝）。
 *
 * @param data 原始数据对象
 * @param allowedKeys 允许保留的字段名列表
 * @returns 仅包含允许字段的新对象
 */
export function stripExtraFields<T = Record<string, unknown>>(data: unknown, allowedKeys: string[]): T {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return {} as T;
  }
  const result: Record<string, unknown> = {};
  const allowedSet = new Set(allowedKeys);
  for (const key of Object.keys(data as Record<string, unknown>)) {
    if (allowedSet.has(key)) {
      result[key] = (data as Record<string, unknown>)[key];
    }
  }
  return result as T;
}


// ─── Gateway 状态映射 ────────────────────────────────────────────────────────

/** Gateway 状态必需字段 */
const GATEWAY_STATUS_FIELDS = ['status', 'version', 'uptime'] as const;

/**
 * 将远程 GET /status 响应映射为 GatewayStatus 结构
 *
 * 远程 API 返回的字段可能与本地接口不完全一致，
 * 此函数负责提取和规范化必需字段。
 *
 * @param remoteData 远程 API 响应数据（已解析的 JSON 对象）
 * @returns 标准化的 GatewayStatus 对象
 */
export function mapGatewayStatus(remoteData: unknown): {
  status: string;
  version?: string;
  uptime?: string;
  host?: string;
  port?: number;
  error?: string;
} {
  if (!remoteData || typeof remoteData !== 'object') {
    return { status: 'error', error: '响应格式错误' };
  }
  const data = remoteData as Record<string, unknown>;
  return {
    status: typeof data.status === 'string' ? data.status : 'unknown',
    version: typeof data.version === 'string' ? data.version : undefined,
    uptime: typeof data.uptime === 'string' ? data.uptime : undefined,
    host: typeof data.host === 'string' ? data.host : undefined,
    port: typeof data.port === 'number' ? data.port : undefined,
  };
}

// ─── Session 列表映射 ────────────────────────────────────────────────────────

/**
 * 将远程 GET /v1/sessions 响应映射为本地 session 列表结构
 *
 * @param remoteData 远程 API 响应数据
 * @returns 标准化的 session 列表结果
 */
export function mapSessionsList(remoteData: unknown): {
  success: boolean;
  sessions: any[];
  error?: string;
} {
  if (!remoteData || typeof remoteData !== 'object') {
    return { success: false, sessions: [], error: '响应格式错误' };
  }
  const data = remoteData as Record<string, unknown>;
  // 远程 API 可能返回 { sessions: [...] } 或直接返回数组
  const sessions = Array.isArray(data.sessions)
    ? data.sessions
    : Array.isArray(remoteData)
      ? remoteData as any[]
      : [];
  return { success: true, sessions };
}

// ─── Session 详情映射 ────────────────────────────────────────────────────────

/**
 * 将远程 GET /v1/sessions/:id 响应映射为本地 session 详情结构
 *
 * @param remoteData 远程 API 响应数据
 * @returns 标准化的 session 详情结果
 */
export function mapSessionDetail(remoteData: unknown): {
  success: boolean;
  session?: any;
  error?: string;
} {
  if (!remoteData || typeof remoteData !== 'object') {
    return { success: false, error: '响应格式错误' };
  }
  return { success: true, session: remoteData };
}

// ─── 渠道列表映射 ────────────────────────────────────────────────────────────

/**
 * 将远程 GET /v1/channels 响应映射为本地渠道列表结构
 *
 * @param remoteData 远程 API 响应数据
 * @returns 标准化的渠道列表结果
 */
export function mapChannelsList(remoteData: unknown): {
  success: boolean;
  output: string;
  error?: string;
} {
  if (!remoteData || typeof remoteData !== 'object') {
    return { success: false, output: '', error: '响应格式错误' };
  }
  // 本地 channelsList 返回 CLI 输出文本，远程模式下将 JSON 序列化为字符串
  const output = typeof (remoteData as any).output === 'string'
    ? (remoteData as any).output
    : JSON.stringify(remoteData);
  return { success: true, output };
}

// ─── 日志映射 ────────────────────────────────────────────────────────────────

/**
 * 将远程 GET /api/v1/logs 响应映射为本地日志条目数组
 *
 * @param remoteData 远程 API 响应数据
 * @returns 标准化的日志结果
 */
export function mapLogs(remoteData: unknown): {
  success: boolean;
  logs: any[];
  error?: string;
} {
  if (!remoteData || typeof remoteData !== 'object') {
    return { success: false, logs: [], error: '响应格式错误' };
  }
  const data = remoteData as Record<string, unknown>;
  const logs = Array.isArray(data.logs)
    ? data.logs
    : Array.isArray(remoteData)
      ? remoteData as any[]
      : [];
  return { success: true, logs };
}

// ─── 配置映射 ────────────────────────────────────────────────────────────────

/**
 * 将远程 GET /api/v1/config 响应映射为本地配置对象
 *
 * @param remoteData 远程 API 响应数据
 * @returns 标准化的配置结果
 */
export function mapConfig(remoteData: unknown): {
  success: boolean;
  config?: any;
  error?: string;
} {
  if (!remoteData || typeof remoteData !== 'object') {
    return { success: false, error: '响应格式错误' };
  }
  return { success: true, config: remoteData };
}

// ─── 技能列表映射 ────────────────────────────────────────────────────────────

/**
 * 将远程 GET /api/v1/skills 响应映射为本地技能列表
 *
 * @param remoteData 远程 API 响应数据
 * @returns 标准化的技能列表结果
 */
export function mapSkillsList(remoteData: unknown): {
  success: boolean;
  skills?: any[];
  error?: string;
} {
  if (!remoteData || typeof remoteData !== 'object') {
    return { success: false, error: '响应格式错误' };
  }
  const data = remoteData as Record<string, unknown>;
  const skills = Array.isArray(data.skills)
    ? data.skills
    : Array.isArray(remoteData)
      ? remoteData as any[]
      : [];
  return { success: true, skills };
}

// ─── 模型列表映射 ────────────────────────────────────────────────────────────

/**
 * 将远程 GET /v1/models 响应映射为本地模型列表
 *
 * @param remoteData 远程 API 响应数据
 * @returns 标准化的模型列表结果
 */
export function mapModelsList(remoteData: unknown): {
  success: boolean;
  providers: Record<string, any>;
  error?: string;
} {
  if (!remoteData || typeof remoteData !== 'object') {
    return { success: false, providers: {}, error: '响应格式错误' };
  }
  const data = remoteData as Record<string, unknown>;
  // 远程 API 可能返回 { data: [...] }（OpenAI 兼容格式）或 { providers: {...} }
  const providers = (typeof data.providers === 'object' && data.providers !== null)
    ? data.providers as Record<string, any>
    : {};
  return { success: true, providers };
}
