/**
 * Agent 配置完整性检查逻辑（纯函数模块）
 *
 * 本模块提供 agent 配置完整性检查、修复计划生成、
 * 默认 workspace 文件内容生成和 agent 重命名校验等纯函数。
 * 所有函数无副作用，便于属性测试（PBT）验证。
 */

import { join } from 'path';
import type { AgentInfo } from './agents.js';
import { buildMinimalModelsJson } from './agentCreateLogic.js';

// ── 类型定义 ──────────────────────────────────────────────────────

/** 单项检查状态 */
export type CheckStatus = 'present' | 'missing';

/** 完整性检查报告 */
export interface CompletenessReport {
  /** workspace 根目录是否存在 */
  workspaceDir: CheckStatus;
  /** 各 workspace 核心文件的存在状态映射 */
  workspaceFiles: Record<string, CheckStatus>;
  /** agent 配置目录是否存在 */
  agentConfigDir: CheckStatus;
  /** models.json 文件是否存在 */
  modelsJson: CheckStatus;
}

/** 修复计划中的文件写入项 */
export interface FileWriteItem {
  /** 文件路径 */
  path: string;
  /** 文件内容 */
  content: string;
}

/** 修复计划 */
export interface RepairPlan {
  /** 需要创建的目录路径数组 */
  directoriesToCreate: string[];
  /** 需要写入的文件数组 */
  filesToWrite: FileWriteItem[];
}

/** 文件存在性检查函数类型（依赖注入） */
export type ExistsFn = (path: string) => boolean;

/** Agent 重命名校验结果 */
export interface RenameValidation {
  /** 校验是否通过 */
  valid: boolean;
  /** 校验失败时的错误信息 */
  error?: string;
}

// ── 常量 ──────────────────────────────────────────────────────────

/**
 * Workspace 核心文件列表（与 agents.ts 中 AGENT_WORKSPACE_FILES 保持一致）
 */
export const COMPLETENESS_WORKSPACE_FILES = [
  'AGENTS.md',
  'BOOTSTRAP.md',
  'HEARTBEAT.md',
  'IDENTITY.md',
  'SOUL.md',
  'TOOLS.md',
  'USER.md',
] as const;

// ── 纯函数实现 ────────────────────────────────────────────────────

/**
 * 为缺失的 workspace 文件生成默认内容（纯函数）
 *
 * 根据 fileName 返回对应的 markdown 模板，
 * 所有模板均包含 agentName 以便用户识别。
 *
 * @param fileName - 文件名（如 'AGENTS.md'）
 * @param agentName - 智能体名称
 * @returns 默认 markdown 内容
 */
export function generateDefaultWorkspaceFileContent(
  fileName: string,
  agentName: string,
): string {
  switch (fileName) {
    case 'AGENTS.md':
      return `# ${agentName}\n\n这是 ${agentName} 智能体的描述文件。\n`;
    case 'SOUL.md':
      return `# ${agentName} 行为准则\n\n请在此定义智能体的行为准则和个性特征。\n`;
    case 'TOOLS.md':
      return `# ${agentName} 工具配置\n\n请在此配置智能体可用的工具列表。\n`;
    case 'BOOTSTRAP.md':
      return `# ${agentName} 启动配置\n\n请在此定义智能体的启动流程。\n`;
    case 'HEARTBEAT.md':
      return `# ${agentName} 心跳配置\n\n请在此定义智能体的定时任务。\n`;
    case 'IDENTITY.md':
      return `# ${agentName} 身份配置\n\n请在此定义智能体的身份信息。\n`;
    case 'USER.md':
      return `# ${agentName} 用户配置\n\n请在此定义用户相关的配置信息。\n`;
    default:
      return `# ${fileName}\n\n${agentName} 智能体配置文件。\n`;
  }
}

/**
 * 检查 agent 配置完整性（纯函数）
 *
 * 通过注入的 existsFn 检查 workspace 目录、workspace 文件、
 * agent 配置目录和 models.json 的存在性。
 * 当路径为空/undefined 时，对应项标记为 'missing'。
 *
 * @param agentInfo - agent 信息对象
 * @param existsFn - 文件/目录存在性检查函数（注入以便测试）
 * @returns 完整性检查报告
 */
export function checkAgentCompleteness(
  agentInfo: AgentInfo,
  existsFn: ExistsFn,
): CompletenessReport {
  // 初始化 workspaceFiles 映射
  const workspaceFiles: Record<string, CheckStatus> = {};

  let workspaceDir: CheckStatus;

  // 检查 workspace 相关项
  if (!agentInfo.workspaceRoot) {
    // workspaceRoot 为空/undefined 时，所有 workspace 项标记为 missing
    workspaceDir = 'missing';
    for (const file of COMPLETENESS_WORKSPACE_FILES) {
      workspaceFiles[file] = 'missing';
    }
  } else {
    // 检查 workspace 目录是否存在
    workspaceDir = existsFn(agentInfo.workspaceRoot) ? 'present' : 'missing';
    // 逐个检查 workspace 核心文件
    for (const file of COMPLETENESS_WORKSPACE_FILES) {
      workspaceFiles[file] = existsFn(join(agentInfo.workspaceRoot, file))
        ? 'present'
        : 'missing';
    }
  }

  let agentConfigDir: CheckStatus;
  let modelsJson: CheckStatus;

  // 检查 agent 配置相关项
  if (!agentInfo.agentConfigRoot) {
    // agentConfigRoot 为空/undefined 时，config 项标记为 missing
    agentConfigDir = 'missing';
    modelsJson = 'missing';
  } else {
    // 检查 agent 配置目录是否存在
    agentConfigDir = existsFn(agentInfo.agentConfigRoot) ? 'present' : 'missing';
    // 检查 models.json 是否存在
    modelsJson = existsFn(join(agentInfo.agentConfigRoot, 'models.json'))
      ? 'present'
      : 'missing';
  }

  return { workspaceDir, workspaceFiles, agentConfigDir, modelsJson };
}

/**
 * 根据完整性报告生成修复计划（纯函数）
 *
 * 遍历报告中的每个检查项，对 'missing' 的项生成对应的
 * 目录创建或文件写入操作。路径为空时跳过对应修复项。
 *
 * @param agentInfo - agent 信息对象
 * @param report - 完整性检查报告
 * @returns 修复计划
 */
export function planAgentCompletenessRepair(
  agentInfo: AgentInfo,
  report: CompletenessReport,
): RepairPlan {
  const directoriesToCreate: string[] = [];
  const filesToWrite: FileWriteItem[] = [];

  // 处理 workspace 目录
  if (report.workspaceDir === 'missing' && agentInfo.workspaceRoot) {
    directoriesToCreate.push(agentInfo.workspaceRoot);
  }

  // 处理 workspace 文件
  for (const [fileName, status] of Object.entries(report.workspaceFiles)) {
    if (status === 'missing' && agentInfo.workspaceRoot) {
      filesToWrite.push({
        path: join(agentInfo.workspaceRoot, fileName),
        content: generateDefaultWorkspaceFileContent(fileName, agentInfo.name),
      });
    }
  }

  // 处理 agent 配置目录
  if (report.agentConfigDir === 'missing' && agentInfo.agentConfigRoot) {
    directoriesToCreate.push(agentInfo.agentConfigRoot);
  }

  // 处理 models.json
  if (report.modelsJson === 'missing' && agentInfo.agentConfigRoot) {
    filesToWrite.push({
      path: join(agentInfo.agentConfigRoot, 'models.json'),
      content: buildMinimalModelsJson(),
    });
  }

  return { directoriesToCreate, filesToWrite };
}

/**
 * 校验 agent 重命名的合法性（纯函数）
 *
 * 校验规则：
 * 1. 名称不为空（trim 后）
 * 2. 仅允许 ASCII 字母、数字、连字符和下划线
 * 3. 不与已有 agent 名称冲突（不区分大小写）
 *
 * @param newName - 新名称
 * @param existingNames - 已有 agent 名称列表（用于冲突检测）
 * @returns 校验结果
 */
export function validateAgentRename(
  newName: string,
  existingNames: string[],
): RenameValidation {
  const trimmedName = newName.trim();

  // 校验非空
  if (!trimmedName) {
    return { valid: false, error: '名称不能为空' };
  }

  // 校验字符合法性：仅允许 ASCII 字母、数字、连字符和下划线
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmedName)) {
    return { valid: false, error: '名称仅允许 ASCII 字母、数字、连字符和下划线' };
  }

  // 校验名称冲突（不区分大小写）
  const lowerName = trimmedName.toLowerCase();
  const conflict = existingNames.some(
    (existing) => existing.toLowerCase() === lowerName,
  );
  if (conflict) {
    return { valid: false, error: '该名称已被其他智能体使用' };
  }

  return { valid: true };
}
