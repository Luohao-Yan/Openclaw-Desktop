/**
 * skillAgentBinding.ts - Agent专属技能绑定管理
 *
 * 提供技能与Agent的绑定关系管理功能：
 * - 绑定/解绑技能到Agent
 * - 查询技能绑定的Agent列表
 * - 查询Agent的专属技能列表
 * - 权限校验
 */

import Store from 'electron-store';
import type { SkillAgentBinding, AgentSkillInfo } from '../../types/electron.js';
import type { SkillInfo } from '../../types/electron.js';
import type { AgentInfo } from '../../types/electron.js';

// 创建独立的 store 用于存储技能绑定关系
const bindingStore = new Store<{ skillAgentBindings: SkillAgentBinding[] }>({
  name: 'skill-agent-bindings',
  defaults: {
    skillAgentBindings: [],
  },
});

/**
 * 获取所有绑定关系
 */
export function getAllBindings(): SkillAgentBinding[] {
  return bindingStore.get('skillAgentBindings', []);
}

/**
 * 保存绑定关系
 */
function setBindings(bindings: SkillAgentBinding[]): void {
  bindingStore.set('skillAgentBindings', bindings);
}

/**
 * 将技能绑定到一个或多个Agent
 */
export function bindSkillToAgents(skillId: string, agentIds: string[]): void {
  if (!skillId) {
    throw new Error('技能ID不能为空');
  }
  if (!agentIds || agentIds.length === 0) {
    throw new Error('Agent ID列表不能为空');
  }

  const bindings = getAllBindings();
  const now = new Date().toISOString();
  const newBindings: SkillAgentBinding[] = [];

  for (const agentId of agentIds) {
    // 检查是否已存在绑定关系
    const exists = bindings.some(
      (b) => b.skillId === skillId && b.agentId === agentId
    );
    if (!exists) {
      newBindings.push({
        skillId,
        agentId,
        bindTime: now,
      });
    }
  }

  if (newBindings.length > 0) {
    setBindings([...bindings, ...newBindings]);
  }
}

/**
 * 从一个或多个Agent解绑技能
 */
export function unbindSkillFromAgents(skillId: string, agentIds: string[]): void {
  if (!skillId) {
    throw new Error('技能ID不能为空');
  }
  if (!agentIds || agentIds.length === 0) {
    throw new Error('Agent ID列表不能为空');
  }

  const bindings = getAllBindings();
  const filtered = bindings.filter(
    (b) =>
      !(b.skillId === skillId && agentIds.includes(b.agentId))
  );
  setBindings(filtered);
}

/**
 * 获取技能绑定的所有Agent列表
 */
export function getBoundAgents(skillId: string): SkillAgentBinding[] {
  if (!skillId) {
    throw new Error('技能ID不能为空');
  }

  const bindings = getAllBindings();
  return bindings.filter((b) => b.skillId === skillId);
}

/**
 * 删除Agent的所有绑定关系（Agent被删除时调用）
 */
export function removeAllBindingsForAgent(agentId: string): void {
  if (!agentId) {
    throw new Error('Agent ID不能为空');
  }

  const bindings = getAllBindings();
  const filtered = bindings.filter((b) => b.agentId !== agentId);
  setBindings(filtered);
}

/**
 * 删除技能的所有绑定关系（技能被删除时调用）
 */
export function removeAllBindingsForSkill(skillId: string): void {
  if (!skillId) {
    throw new Error('技能ID不能为空');
  }

  const bindings = getAllBindings();
  const filtered = bindings.filter((b) => b.skillId !== skillId);
  setBindings(filtered);
}

/**
 * 计算Agent的专属技能信息（全局技能 + 专属技能）
 * 注意：这个函数需要传入完整的技能列表和Agent列表
 */
export function getAgentSkills(
  agentId: string,
  allSkills: SkillInfo[],
  allAgents: AgentInfo[]
): AgentSkillInfo {
  if (!agentId) {
    throw new Error('Agent ID不能为空');
  }

  const agent = allAgents.find((a) => a.id === agentId);
  if (!agent) {
    throw new Error(`Agent ${agentId} 不存在`);
  }

  const bindings = getAllBindings();
  const agentBindings = bindings.filter((b) => b.agentId === agentId);
  const boundSkillIds = new Set(agentBindings.map((b) => b.skillId));

  // 全局技能：所有技能（当前阶段假设所有技能都是全局的）
  // TODO: 后续可以根据技能的 scope 字段区分全局/专属
  const globalSkills = allSkills.filter((s) => !boundSkillIds.has(s.id));

  // 专属技能：绑定到该Agent的技能
  const exclusiveSkills = allSkills.filter((s) => boundSkillIds.has(s.id));

  return {
    agentId,
    globalSkills,
    exclusiveSkills,
  };
}

/**
 * 检查Agent是否有权限调用指定技能
 */
export function checkSkillPermission(
  agentId: string,
  skillId: string
): { allowed: boolean; reason?: string } {
  if (!agentId) {
    throw new Error('Agent ID不能为空');
  }
  if (!skillId) {
    throw new Error('技能ID不能为空');
  }

  // 当前阶段：假设所有技能都是全局的，所有Agent都可以调用
  // TODO: 后续根据技能的 scope 字段进行权限校验

  const bindings = getAllBindings();
  const isBound = bindings.some(
    (b) => b.skillId === skillId && b.agentId === agentId
  );

  // 如果技能绑定了该Agent，则允许调用（专属技能）
  if (isBound) {
    return { allowed: true };
  }

  // 否则，检查技能是否为全局技能
  // TODO: 后续需要从技能元数据中读取 scope 字段
  // 暂时假设所有技能都是全局的
  return {
    allowed: true,
    reason: '该技能为全局技能，所有Agent均可调用',
  };
}
