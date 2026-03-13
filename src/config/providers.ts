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
}

/** 所有支持的提供商静态列表（23 个 LLM + 2 个转录） */
export const PROVIDER_LIST: ProviderDefinition[] = [
  // ── LLM 提供商（23 个）
  { id: 'amazon-bedrock',   name: 'Amazon Bedrock',        category: 'llm' },
  { id: 'anthropic',        name: 'Anthropic',             category: 'llm', description: 'API + Claude Code CLI' },
  { id: 'cloudflare-ai',    name: 'Cloudflare AI Gateway', category: 'llm' },
  { id: 'glm',              name: 'GLM models',            category: 'llm' },
  { id: 'huggingface',      name: 'Hugging Face',          category: 'llm', description: 'Inference' },
  { id: 'kilocode',         name: 'Kilocode',              category: 'llm' },
  { id: 'litellm',          name: 'LiteLLM',               category: 'llm', description: 'unified gateway' },
  { id: 'minimax',          name: 'MiniMax',               category: 'llm' },
  { id: 'mistral',          name: 'Mistral',               category: 'llm' },
  { id: 'moonshot',         name: 'Moonshot AI',           category: 'llm', description: 'Kimi + Kimi Coding' },
  { id: 'nvidia',           name: 'NVIDIA',                category: 'llm' },
  { id: 'ollama',           name: 'Ollama',                category: 'llm', description: 'local models' },
  { id: 'openai',           name: 'OpenAI',                category: 'llm', description: 'API + Codex' },
  { id: 'opencode',         name: 'OpenCode',              category: 'llm', description: 'Zen + Go' },
  { id: 'openrouter',       name: 'OpenRouter',            category: 'llm' },
  { id: 'qianfan',          name: 'Qianfan',               category: 'llm' },
  { id: 'qwen',             name: 'Qwen',                  category: 'llm', description: 'OAuth' },
  { id: 'together-ai',      name: 'Together AI',           category: 'llm' },
  { id: 'vercel-ai',        name: 'Vercel AI Gateway',     category: 'llm' },
  { id: 'venice',           name: 'Venice',                category: 'llm', description: 'privacy-focused' },
  { id: 'vllm',             name: 'vLLM',                  category: 'llm', description: 'local models' },
  { id: 'xiaomi',           name: 'Xiaomi',                category: 'llm' },
  { id: 'zai',              name: 'Z.AI',                  category: 'llm' },
  // ── 转录提供商（2 个）
  { id: 'deepgram',         name: 'Deepgram',              category: 'transcription', description: 'audio transcription' },
  { id: 'claude-max-proxy', name: 'Claude Max API Proxy',  category: 'transcription' },
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
