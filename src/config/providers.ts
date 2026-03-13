/** 提供商定义接口 */
export interface ProviderDefinition {
  /** 与 openclaw models status 输出中的 key 对应 */
  id: string;
  /** 显示名称 */
  name: string;
  /** 分类：llm | transcription */
  category: 'llm' | 'transcription';
  /** 简短描述（括号内内容） */
  description?: string;
  /** 认证方式：api-key（环境变量）| oauth（OAuth 登录）| none（无需认证） */
  authType?: 'api-key' | 'oauth' | 'none';
  /** 环境变量名（用于 API Key 认证） */
  envVar?: string;
  /** 是否需要在 models.providers 中配置（自定义提供商） */
  requiresConfig?: boolean;
  /** 默认 Base URL（如果需要配置） */
  defaultBaseUrl?: string;
  /** API 兼容性类型 */
  apiType?: 'openai-completions' | 'anthropic-messages' | 'custom';
}

/** 所有支持的提供商静态列表 */
export const PROVIDER_LIST: ProviderDefinition[] = [
  // ── 内置提供商（pi-ai catalog，无需 models.providers 配置）──────────────
  {
    id: 'openai',
    name: 'OpenAI',
    category: 'llm',
    description: 'GPT-5.1 Codex 等',
    authType: 'api-key',
    envVar: 'OPENAI_API_KEY',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    category: 'llm',
    description: 'Claude Opus 4 等',
    authType: 'api-key',
    envVar: 'ANTHROPIC_API_KEY',
  },
  {
    id: 'openai-codex',
    name: 'OpenAI Codex',
    category: 'llm',
    description: 'OAuth (ChatGPT)',
    authType: 'oauth',
  },
  {
    id: 'opencode',
    name: 'OpenCode Zen',
    category: 'llm',
    description: 'Zen + Go',
    authType: 'api-key',
    envVar: 'OPENCODE_API_KEY',
  },
  {
    id: 'google',
    name: 'Google Gemini',
    category: 'llm',
    description: 'Gemini API Key',
    authType: 'api-key',
    envVar: 'GEMINI_API_KEY',
  },
  {
    id: 'google-vertex',
    name: 'Google Vertex',
    category: 'llm',
    description: 'gcloud ADC 认证',
    authType: 'oauth',
  },
  {
    id: 'google-antigravity',
    name: 'Google Antigravity',
    category: 'llm',
    description: 'OAuth 插件（需启用）',
    authType: 'oauth',
  },
  {
    id: 'google-gemini-cli',
    name: 'Gemini CLI',
    category: 'llm',
    description: 'OAuth 插件（需启用）',
    authType: 'oauth',
  },
  {
    id: 'zai',
    name: 'Z.AI (GLM)',
    category: 'llm',
    description: 'GLM-5 等',
    authType: 'api-key',
    envVar: 'ZAI_API_KEY',
  },
  {
    id: 'vercel-ai-gateway',
    name: 'Vercel AI Gateway',
    category: 'llm',
    authType: 'api-key',
    envVar: 'AI_GATEWAY_API_KEY',
  },
  {
    id: 'kilocode',
    name: 'Kilo Gateway',
    category: 'llm',
    description: 'GLM-5 Free / MiniMax M2.5 Free 等',
    authType: 'api-key',
    envVar: 'KILOCODE_API_KEY',
    defaultBaseUrl: 'https://api.kilo.ai/api/gateway/',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    category: 'llm',
    authType: 'api-key',
    envVar: 'OPENROUTER_API_KEY',
  },
  {
    id: 'xai',
    name: 'xAI',
    category: 'llm',
    authType: 'api-key',
    envVar: 'XAI_API_KEY',
  },
  {
    id: 'mistral',
    name: 'Mistral',
    category: 'llm',
    authType: 'api-key',
    envVar: 'MISTRAL_API_KEY',
  },
  {
    id: 'groq',
    name: 'Groq',
    category: 'llm',
    authType: 'api-key',
    envVar: 'GROQ_API_KEY',
  },
  {
    id: 'cerebras',
    name: 'Cerebras',
    category: 'llm',
    description: 'OpenAI 兼容',
    authType: 'api-key',
    envVar: 'CEREBRAS_API_KEY',
    defaultBaseUrl: 'https://api.cerebras.ai/v1',
  },
  {
    id: 'github-copilot',
    name: 'GitHub Copilot',
    category: 'llm',
    authType: 'api-key',
    envVar: 'COPILOT_GITHUB_TOKEN',
  },
  {
    id: 'huggingface',
    name: 'Hugging Face',
    category: 'llm',
    description: 'Inference',
    authType: 'api-key',
    envVar: 'HUGGINGFACE_HUB_TOKEN',
  },
  {
    id: 'amazon-bedrock',
    name: 'Amazon Bedrock',
    category: 'llm',
    authType: 'oauth',
    description: 'AWS 凭证认证',
  },

  // ── 需要 models.providers 配置的提供商 ──────────────────────────────────
  {
    id: 'moonshot',
    name: 'Moonshot AI (Kimi)',
    category: 'llm',
    description: 'Kimi K2.5 等',
    authType: 'api-key',
    envVar: 'MOONSHOT_API_KEY',
    requiresConfig: true,
    defaultBaseUrl: 'https://api.moonshot.ai/v1',
    apiType: 'openai-completions',
  },
  {
    id: 'kimi-coding',
    name: 'Kimi Coding',
    category: 'llm',
    description: 'Anthropic 兼容',
    authType: 'api-key',
    envVar: 'KIMI_API_KEY',
    requiresConfig: true,
    apiType: 'anthropic-messages',
  },
  {
    id: 'qwen',
    name: 'Qwen (通义千问)',
    category: 'llm',
    description: 'OAuth 免费层',
    authType: 'oauth',
  },
  {
    id: 'volcengine',
    name: '火山引擎 (Doubao)',
    category: 'llm',
    description: 'Doubao Seed 等',
    authType: 'api-key',
    envVar: 'VOLCANO_ENGINE_API_KEY',
  },
  {
    id: 'volcengine-plan',
    name: '火山引擎 Coding',
    category: 'llm',
    description: 'ark-code 等',
    authType: 'api-key',
    envVar: 'VOLCANO_ENGINE_API_KEY',
  },
  {
    id: 'byteplus',
    name: 'BytePlus ARK',
    category: 'llm',
    description: '国际版火山引擎',
    authType: 'api-key',
    envVar: 'BYTEPLUS_API_KEY',
  },
  {
    id: 'byteplus-plan',
    name: 'BytePlus Coding',
    category: 'llm',
    description: '国际版 Coding',
    authType: 'api-key',
    envVar: 'BYTEPLUS_API_KEY',
  },
  {
    id: 'synthetic',
    name: 'Synthetic',
    category: 'llm',
    description: 'Anthropic 兼容',
    authType: 'api-key',
    envVar: 'SYNTHETIC_API_KEY',
    requiresConfig: true,
    defaultBaseUrl: 'https://api.synthetic.new/anthropic',
    apiType: 'anthropic-messages',
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    category: 'llm',
    authType: 'api-key',
    envVar: 'MINIMAX_API_KEY',
    requiresConfig: true,
  },
  {
    id: 'ollama',
    name: 'Ollama',
    category: 'llm',
    description: '本地模型',
    authType: 'none',
    defaultBaseUrl: 'http://127.0.0.1:11434/v1',
    apiType: 'openai-completions',
  },
  {
    id: 'vllm',
    name: 'vLLM',
    category: 'llm',
    description: '本地/自托管',
    authType: 'api-key',
    envVar: 'VLLM_API_KEY',
    defaultBaseUrl: 'http://127.0.0.1:8000/v1',
    apiType: 'openai-completions',
  },
  {
    id: 'litellm',
    name: 'LiteLLM',
    category: 'llm',
    description: '统一网关',
    authType: 'api-key',
    requiresConfig: true,
    apiType: 'openai-completions',
  },

  // ── 转录提供商 ──────────────────────────────────────────────────────────
  {
    id: 'deepgram',
    name: 'Deepgram',
    category: 'transcription',
    description: '语音转录',
    authType: 'api-key',
    envVar: 'DEEPGRAM_API_KEY',
  },
  {
    id: 'claude-max-proxy',
    name: 'Claude Max API Proxy',
    category: 'transcription',
  },
];

/**
 * 将静态提供商列表与运行时认证状态合并
 * @param providers 静态提供商定义列表
 * @param statuses 运行时返回的提供商状态映射
 * @returns 合并后的提供商列表，每项包含 authStatus 字段
 */
export function mergeProviderStatuses(
  providers: ProviderDefinition[],
  statuses: Record<string, string>
) {
  return providers.map(p => ({
    ...p,
    // 若 status 中无对应 key，则标记为 'unknown'
    authStatus: (statuses[p.id] ?? 'unknown') as 'authenticated' | 'unauthenticated' | 'unknown',
  }));
}
