/**
 * Agent 删除 Workspace 清理 — 纯函数逻辑
 *
 * 提取 agents:delete 流程中 workspace 清理的决策逻辑为纯函数，
 * 便于属性测试验证。
 *
 * 已修复版本：当 CLI 成功且 agent 记录存在时，
 * 调用 resolveWorkspacePath 解析路径并返回 shouldCleanWorkspace: true。
 */

// ── 类型定义 ──────────────────────────────────────────────────────

/** Agent 记录，包含 workspace 路径的多种来源 */
export interface AgentRecord {
  id: string;
  name?: string;
  workspace?: string;
  workspaceRoot?: string;
  workspaceDir?: string;
  [key: string]: unknown;
}

/** buildDeleteCleanupPlan 的输入 */
export interface DeleteCleanupInput {
  agentId: string;
  agentRecord: AgentRecord | null;
  cliExitCode: number;
  /** OpenClaw 根目录路径，纯函数不直接调用 getOpenClawRoot()，由调用方传入 */
  openclawRoot?: string;
}

/** buildDeleteCleanupPlan 的输出 */
export interface DeleteCleanupPlan {
  shouldCleanWorkspace: boolean;
  workspacePath?: string;
  reason: string;
}

// ── 纯函数：解析 workspace 路径（不依赖文件系统） ──────────────────

/**
 * 从 agent 记录中解析 workspace 路径（纯函数版本）
 * 模拟 resolveWorkspaceRoot 的路径解析逻辑，但不检查文件系统
 *
 * @param agent - Agent 记录
 * @param openclawRoot - OpenClaw 根目录路径
 * @returns 解析到的 workspace 路径，或 undefined
 */
export function resolveWorkspacePath(
  agent: AgentRecord | null,
  openclawRoot: string,
): string | undefined {
  if (!agent) return undefined;

  // 来源 1：直接路径 workspace-{agentId}
  if (agent.id) {
    const normalizedId = String(agent.id).trim();
    if (normalizedId) {
      return `${openclawRoot}/workspace-${normalizedId}`;
    }
  }

  // 来源 2：配置字段 workspace / workspaceRoot / workspaceDir
  const candidates = [
    agent.workspace,
    agent.workspaceRoot,
    agent.workspaceDir,
  ].filter((v): v is string => typeof v === 'string' && v.trim().length > 0);

  if (candidates.length > 0) {
    return candidates[0].trim();
  }

  return undefined;
}

/**
 * 从 agent 记录中解析嵌套 workspace 路径
 *
 * @param agent - Agent 记录
 * @param openclawRoot - OpenClaw 根目录路径
 * @returns 嵌套 workspace 路径，或 undefined
 */
export function resolveNestedWorkspacePath(
  agent: AgentRecord | null,
  openclawRoot: string,
): string | undefined {
  if (!agent?.id) return undefined;

  const normalizedId = String(agent.id).trim();
  if (!normalizedId) return undefined;

  return `${openclawRoot}/agents/${normalizedId}/workspace-${normalizedId}`;
}

// ── 核心纯函数：构建删除清理计划 ──────────────────────────────────

/** 默认 OpenClaw 根目录路径（当调用方未传入时使用） */
const DEFAULT_OPENCLAW_ROOT = '~/.openclaw';

/**
 * 构建删除清理计划（已修复版本）
 *
 * 当 CLI 成功且 agent 记录存在时，调用 resolveWorkspacePath 解析路径
 * 并返回 shouldCleanWorkspace === true，指示调用方执行 workspace 清理。
 *
 * @param input - 删除操作的输入参数
 * @returns 清理计划
 */
export function buildDeleteCleanupPlan(input: DeleteCleanupInput): DeleteCleanupPlan {
  const { agentId, agentRecord, cliExitCode, openclawRoot } = input;

  // 校验 agent ID
  const trimmedId = (agentId || '').trim();
  if (!trimmedId) {
    return {
      shouldCleanWorkspace: false,
      reason: '智能体 ID 为空，不执行清理',
    };
  }

  // CLI 执行失败时不清理
  if (cliExitCode !== 0) {
    return {
      shouldCleanWorkspace: false,
      reason: `CLI 退出码 ${cliExitCode}，不执行清理`,
    };
  }

  // ── CLI 成功：尝试解析 workspace 路径并标记清理 ──

  // agent 记录不存在时无法解析 workspace 路径
  if (!agentRecord) {
    return {
      shouldCleanWorkspace: false,
      reason: 'agent 记录不存在，无法解析 workspace 路径',
    };
  }

  // 使用 resolveWorkspacePath 解析 workspace 路径
  const root = openclawRoot || DEFAULT_OPENCLAW_ROOT;
  const workspacePath = resolveWorkspacePath(agentRecord, root);

  // 无法解析 workspace 路径时不清理
  if (!workspacePath) {
    return {
      shouldCleanWorkspace: false,
      reason: '无法解析 workspace 路径',
    };
  }

  // CLI 成功且 workspace 路径已解析，标记需要清理
  return {
    shouldCleanWorkspace: true,
    workspacePath,
    reason: `CLI 成功，workspace 路径已解析: ${workspacePath}`,
  };
}
