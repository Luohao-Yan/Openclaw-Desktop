/**
 * skillBindingUtils.ts - 技能绑定纯函数工具模块
 *
 * 提供技能与 Agent 绑定关系的纯函数操作：
 * - 按 agentId 聚合绑定数量
 * - 移除指定 Agent 的所有绑定
 * - 移除指定技能的所有绑定
 *
 * 这些函数不依赖 electron-store，可在渲染进程中直接使用。
 */

import type { SkillAgentBinding } from '../../types/electron';

/**
 * 按 agentId 聚合绑定数量
 * 返回一个 Record，key 为 agentId，value 为该 Agent 的绑定数量
 *
 * @param bindings - 技能绑定关系数组
 * @returns agentId → 绑定数量的映射
 */
export function computeBindingCounts(
  bindings: SkillAgentBinding[],
): Record<string, number> {
  const counts: Record<string, number> = Object.create(null);
  for (const binding of bindings) {
    counts[binding.agentId] = (counts[binding.agentId] ?? 0) + 1;
  }
  return counts;
}

/**
 * 移除指定 Agent 的所有绑定记录
 * 返回过滤后的新数组，不修改原数组
 *
 * @param bindings - 技能绑定关系数组
 * @param agentId - 要移除绑定的 Agent ID
 * @returns 不包含该 agentId 的绑定数组
 */
export function removeAllBindingsForAgent(
  bindings: SkillAgentBinding[],
  agentId: string,
): SkillAgentBinding[] {
  return bindings.filter((b) => b.agentId !== agentId);
}

/**
 * 移除指定技能的所有绑定记录
 * 返回过滤后的新数组，不修改原数组
 *
 * @param bindings - 技能绑定关系数组
 * @param skillId - 要移除绑定的技能 ID
 * @returns 不包含该 skillId 的绑定数组
 */
export function removeAllBindingsForSkill(
  bindings: SkillAgentBinding[],
  skillId: string,
): SkillAgentBinding[] {
  return bindings.filter((b) => b.skillId !== skillId);
}
