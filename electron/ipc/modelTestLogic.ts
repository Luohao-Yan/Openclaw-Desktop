/**
 * 模型连通性测试 URL 构建逻辑（纯函数）— 已修复版本
 *
 * 本模块从 system.ts 的 testModelConnection 中提取 URL 构建逻辑，
 * 便于属性测试（PBT）验证。
 *
 * 修复后的逻辑：
 * - 当 effectiveBaseUrl 非空时：直接追加 /chat/completions，信任用户提供的完整路径
 * - 无 effectiveBaseUrl 时：使用 endpointMap 查找或默认模式（不变）
 */

/** 已知 provider 到 API 端点的静态映射表 */
const endpointMap: Record<string, string> = {
  openai: 'https://api.openai.com/v1/chat/completions',
  anthropic: 'https://api.anthropic.com/v1/messages',
  google: 'https://generativelanguage.googleapis.com/v1beta/chat/completions',
  moonshot: 'https://api.moonshot.cn/v1/chat/completions',
  deepseek: 'https://api.deepseek.com/v1/chat/completions',
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
  glm: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
  groq: 'https://api.groq.com/openai/v1/chat/completions',
  mistral: 'https://api.mistral.ai/v1/chat/completions',
  xai: 'https://api.x.ai/v1/chat/completions',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
  // 以下为新增的 provider 端点映射
  volcengine: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
  'volcengine-plan': 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
  byteplus: 'https://ark.ap-southeast.bytepluses.com/api/v3/chat/completions',
  'byteplus-plan': 'https://ark.ap-southeast.bytepluses.com/api/v3/chat/completions',
  cerebras: 'https://api.cerebras.ai/v1/chat/completions',
  kilocode: 'https://api.kilo.ai/api/gateway/chat/completions',
  huggingface: 'https://api-inference.huggingface.co/v1/chat/completions',
  zai: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
  minimax: 'https://api.minimax.chat/v1/text/chatcompletion_v2',
};

/** 构建模型连通性测试 URL 的参数 */
export interface BuildModelTestUrlParams {
  /** 用户提供的自定义 Base URL 或本地模型默认 URL（可选） */
  effectiveBaseUrl?: string;
  /** provider 前缀，如 "openai"、"deepseek" 等 */
  providerPrefix: string;
}

/**
 * 去除 URL 尾部斜杠
 */
export function stripTrailingSlash(url: string): string {
  return url.replace(/\/$/, '');
}

/**
 * 构建模型连通性测试的请求 URL
 *
 * 修复后的逻辑：
 * - 有 effectiveBaseUrl 时：去除尾部斜杠后直接追加 /chat/completions
 *   用户提供的 Base URL 已包含完整路径（含版本段），信任用户输入
 * - 无 effectiveBaseUrl 时：从 endpointMap 查找或使用默认模式
 */
export function buildModelTestUrl(params: BuildModelTestUrlParams): string {
  const { effectiveBaseUrl, providerPrefix } = params;

  if (effectiveBaseUrl) {
    const base = stripTrailingSlash(effectiveBaseUrl);
    // 修复：不再插入 /v1，直接追加 /chat/completions
    // 用户提供的 Base URL 已包含完整路径（含版本段），信任用户输入
    return `${base}/chat/completions`;
  }

  // 无自定义 Base URL 时，从 endpointMap 查找或使用默认模式
  return (
    endpointMap[providerPrefix] ??
    `https://api.${providerPrefix}.com/v1/chat/completions`
  );
}

/** 导出 endpointMap 供测试使用 */
export { endpointMap };

/** resolveApiKey 函数的返回类型 */
export type ResolveApiKeyResult = { resolved: string | null; error?: string };

/** 匹配 ${VAR_NAME} 格式的环境变量引用正则 */
const ENV_VAR_PATTERN = /^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/;

/**
 * 解析 API Key 中的环境变量引用
 *
 * - 当 apiKey 为 `${VAR_NAME}` 格式时，按优先级解析：先查 envStore，再查 process.env
 * - 环境变量存在且非空时返回实际值
 * - 环境变量未设置或为空时返回错误信息
 * - 非环境变量引用格式时原样返回
 * - 空值/undefined 时返回 { resolved: null }
 *
 * @param apiKey - API Key 字符串，可能为环境变量引用格式
 * @param envStore - 可选的环境变量存储（来自 openclaw.json 的 env 节点）
 */
export function resolveApiKey(
  apiKey: string | null | undefined,
  envStore?: Record<string, string>,
): ResolveApiKeyResult {
  // 空值/undefined 直接返回 null
  if (apiKey == null) {
    return { resolved: null };
  }

  // 匹配 ${VAR_NAME} 格式
  const match = ENV_VAR_PATTERN.exec(apiKey);
  if (!match) {
    // 非环境变量引用格式，原样返回
    return { resolved: apiKey };
  }

  const varName = match[1];

  // 优先从 envStore（openclaw.json env 节点）查找
  const fromStore = envStore?.[varName];
  if (fromStore != null && fromStore !== '') {
    return { resolved: fromStore };
  }

  // 其次从 process.env 系统环境变量查找
  const fromEnv = process.env[varName];
  if (fromEnv != null && fromEnv !== '') {
    return { resolved: fromEnv };
  }

  // 两处均未找到，返回错误信息
  return { resolved: null, error: `环境变量 ${varName} 未设置` };
}
