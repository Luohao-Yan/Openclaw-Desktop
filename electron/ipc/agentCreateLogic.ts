/**
 * 智能体创建逻辑（纯函数）— 已修复版本
 *
 * 本模块从 agents.ts 的 runAgentCreateCommand 中提取纯逻辑，
 * 便于属性测试（PBT）验证。
 *
 * 修复内容：
 * - buildAgentCreateArgs：正确，无需修改
 * - classifyAgentError：正确，能识别 schema 错误关键词
 * - formatAgentCreateError：已修复！schema 错误返回中文友好提示和修复建议，
 *   非 schema 错误保留原始信息
 */

/** 智能体创建参数 */
export interface AgentCreatePayload {
  /** 智能体名称 */
  name: string;
  /** 工作区路径 */
  workspace: string;
  /** 模型名称（可选） */
  model?: string;
}

/** CLI 错误类型 */
export type AgentErrorType = 'schema' | 'network' | 'permission' | 'reserved' | 'unknown';

/**
 * 构建智能体创建 CLI 参数数组
 *
 * 此函数逻辑正确，无 Bug。
 * 从 agents.ts 的 runAgentCreateCommand 中提取。
 */
export function buildAgentCreateArgs(payload: AgentCreatePayload): string[] {
  const trimmedName = payload.name.trim();
  const trimmedWorkspace = payload.workspace.trim();
  const trimmedModel = payload.model?.trim();

  // 构建基础参数
  const args = [
    'agents',
    'add',
    trimmedName,
    '--workspace',
    trimmedWorkspace,
    '--non-interactive',
    '--json',
  ];

  // 如果提供了模型参数，追加到参数列表
  if (trimmedModel) {
    args.push('--model', trimmedModel);
  }

  return args;
}

/** schema 错误的关键词列表 */
const SCHEMA_ERROR_KEYWORDS = [
  'unrecognized keys',
  'invalid dmScope',
  'invalid_type',
  'unrecognized_keys',
  'schema',
  'validation failed',
  'ZodError',
];

/**
 * 分类 CLI 错误类型
 *
 * 根据 stderr 内容判断错误属于哪种类型。
 * 当前实现能正确识别 schema 错误关键词。
 */
export function classifyAgentError(stderr: string): AgentErrorType {
  const lower = stderr.toLowerCase();

  // 检查是否包含 schema 相关错误关键词
  for (const keyword of SCHEMA_ERROR_KEYWORDS) {
    if (lower.includes(keyword.toLowerCase())) {
      return 'schema';
    }
  }

  // 检查保留名称错误
  if (lower.includes('reserved')) return 'reserved';

  // 检查网络错误
  if (
    lower.includes('network') ||
    lower.includes('econnrefused') ||
    lower.includes('timeout') ||
    lower.includes('enotfound')
  ) {
    return 'network';
  }

  // 检查权限错误
  if (
    lower.includes('permission') ||
    lower.includes('eacces') ||
    lower.includes('eperm')
  ) {
    return 'permission';
  }

  return 'unknown';
}

/**
 * 格式化用户友好的错误信息
 *
 * 已修复：对 schema 错误返回中文友好提示和可操作的修复建议，
 * 不暴露原始 CLI schema 术语；非 schema 错误保留原始信息。
 */
export function formatAgentCreateError(
  stderr: string,
  errorType: string,
): string {
  // schema 错误：返回中文友好提示，包含可操作的修复建议
  if (errorType === 'schema') {
    return '配置文件存在兼容性问题，请尝试运行 `openclaw doctor --fix` 修复，或手动检查 ~/.openclaw/openclaw.json 配置文件。';
  }

  // reserved 错误：返回中文友好提示
  if (errorType === 'reserved') {
    return '智能体名称为系统保留名称，请更换其他名称。';
  }

  // 非 schema/reserved 错误：保留原始 stderr 信息
  return stderr;
}

// ============================================================================
// agentDir 验证与修复逻辑
// ============================================================================

/**
 * 构建最小化的 models.json 内容
 * 当 CLI 创建 agent 后未生成 agentDir 时，用此函数生成默认配置
 * 内容为空 providers 对象，agent 将使用全局默认模型配置
 *
 * @returns models.json 的 JSON 字符串
 */
export function buildMinimalModelsJson(): string {
  return JSON.stringify({ providers: {} }, null, 2);
}

/**
 * 判断 agentDir 是否需要修复
 * 检查 agentDir 路径是否存在且包含 models.json
 *
 * @param agentDir - agent 配置目录路径（如 ~/.openclaw/agents/<id>/agent）
 * @param existsFn - 文件/目录存在性检查函数（注入以便测试）
 * @returns 需要修复时返回 true
 */
export function needsAgentDirRepair(
  agentDir: string | undefined | null,
  existsFn: (path: string) => boolean,
): boolean {
  // 没有 agentDir 配置的 agent（如 main）不需要修复
  if (!agentDir || !agentDir.trim()) return false;

  // 目录不存在 → 需要修复
  if (!existsFn(agentDir)) return true;

  // 目录存在但缺少 models.json → 需要修复
  const modelsPath = agentDir.replace(/\/$/, '') + '/models.json';
  if (!existsFn(modelsPath)) return true;

  return false;
}

/**
 * 计算 agentDir 修复所需的文件操作列表
 * 纯函数，不执行实际 I/O
 *
 * @param agentDir - agent 配置目录路径
 * @returns 需要创建的目录和文件列表
 */
export function planAgentDirRepair(agentDir: string): {
  directoryToCreate: string;
  filesToWrite: Array<{ path: string; content: string }>;
} {
  const normalizedDir = agentDir.replace(/\/$/, '');
  return {
    directoryToCreate: normalizedDir,
    filesToWrite: [
      {
        path: normalizedDir + '/models.json',
        content: buildMinimalModelsJson(),
      },
    ],
  };
}
