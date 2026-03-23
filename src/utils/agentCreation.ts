/**
 * agentCreation.ts - Agent 创建向导的纯函数工具集
 * 提取自 CreateAgentWizard 组件，便于单元测试和属性测试
 */

/** 智能体名称正则：仅允许 ASCII 字母、数字、连字符、下划线 */
export const AGENT_NAME_REGEX = /^[a-zA-Z0-9_-]+$/;

/** CLI 保留的智能体名称列表（不区分大小写），这些名称不允许用户创建 */
export const RESERVED_AGENT_NAMES = ['main'];

/** 默认勾选的核心文件列表 */
const DEFAULT_SELECTED_FILES = ['AGENTS.md', 'SOUL.md', 'TOOLS.md'];

/**
 * 校验基础信息步骤，返回字段 → 错误消息的映射
 * 空映射表示校验通过
 * t 参数接受宽松的 string 类型，兼容测试中的 mockT 和严格类型的 useI18n().t
 */
export function validateBasicInfo(
  data: { name: string; workspace: string },
  t: (key: string) => string,
): Record<string, string> {
  const errors: Record<string, string> = {};
  const trimmedName = data.name.trim();

  if (!trimmedName) {
    errors.name = t('agent.nameRequired');
  } else if (!AGENT_NAME_REGEX.test(trimmedName)) {
    errors.name = t('agent.nameInvalid');
  } else if (RESERVED_AGENT_NAMES.includes(trimmedName.toLowerCase())) {
    // 检查是否为系统保留名称（不区分大小写）
    errors.name = t('agent.nameReserved');
  }

  if (!data.workspace.trim()) {
    errors.workspace = t('agent.workspaceRequired');
  }

  return errors;
}

/**
 * 根据 Agent 名称自动生成 workspace 路径
 */
export function generateWorkspacePath(name: string): string {
  return `~/.openclaw/workspace-${name}`;
}

/**
 * 计算步骤指示器中某个步骤的状态
 * @param stepIndex 步骤索引（0-based）
 * @param currentStep 当前所在步骤索引
 */
export function getStepStatus(
  stepIndex: number,
  currentStep: number,
): 'completed' | 'current' | 'upcoming' {
  if (stepIndex < currentStep) return 'completed';
  if (stepIndex === currentStep) return 'current';
  return 'upcoming';
}

/**
 * 获取模板复制时默认勾选的核心文件列表
 */
export function getDefaultSelectedFiles(): string[] {
  return [...DEFAULT_SELECTED_FILES];
}

/**
 * 过滤 Identity 配置中的空值字段，仅保留有实际内容的字段
 */
export function filterEmptyIdentityFields(
  identity: { name?: string; theme?: string; emoji?: string; avatar?: string },
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(identity)) {
    if (value && value.trim()) {
      result[key] = value.trim();
    }
  }
  return result;
}

/**
 * 判断是否应跳过 Identity 写入（所有字段均为空时跳过）
 */
export function shouldSkipIdentityWrite(
  identity: { name?: string; theme?: string; emoji?: string; avatar?: string },
): boolean {
  return Object.keys(filterEmptyIdentityFields(identity)).length === 0;
}
