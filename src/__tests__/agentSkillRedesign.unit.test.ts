/**
 * agentSkillRedesign.unit.test.ts
 *
 * 智能体专属技能交互重设计 - 单元测试
 * 覆盖 computeBindingCounts、removeAllBindingsForAgent、removeAllBindingsForSkill 三个纯函数
 */

import { describe, test, expect } from 'vitest';
import type { SkillAgentBinding } from '../../types/electron';
import {
  computeBindingCounts,
  removeAllBindingsForAgent,
  removeAllBindingsForSkill,
} from '../utils/skillBindingUtils';

/** 辅助函数：创建一条绑定记录 */
function makeBinding(
  skillId: string,
  agentId: string,
  bindTime = '2025-01-01T00:00:00Z',
): SkillAgentBinding {
  return { skillId, agentId, bindTime };
}

// ── computeBindingCounts 测试 ──────────────────────────────────────────────

describe('computeBindingCounts', () => {
  test('空绑定数组 → 返回空 Record', () => {
    const result = computeBindingCounts([]);
    expect(result).toEqual({});
  });

  test('单个 Agent 单条绑定 → 返回 { agentId: 1 }', () => {
    const bindings = [makeBinding('skill-1', 'agent-a')];
    const result = computeBindingCounts(bindings);
    expect(result).toEqual({ 'agent-a': 1 });
  });

  test('单个 Agent 多条绑定 → 返回正确计数', () => {
    const bindings = [
      makeBinding('skill-1', 'agent-a'),
      makeBinding('skill-2', 'agent-a'),
      makeBinding('skill-3', 'agent-a'),
    ];
    const result = computeBindingCounts(bindings);
    expect(result).toEqual({ 'agent-a': 3 });
  });

  test('多个 Agent 混合绑定 → 各自返回正确计数', () => {
    const bindings = [
      makeBinding('skill-1', 'agent-a'),
      makeBinding('skill-2', 'agent-a'),
      makeBinding('skill-1', 'agent-b'),
      makeBinding('skill-3', 'agent-c'),
      makeBinding('skill-4', 'agent-c'),
      makeBinding('skill-5', 'agent-c'),
    ];
    const result = computeBindingCounts(bindings);
    expect(result).toEqual({
      'agent-a': 2,
      'agent-b': 1,
      'agent-c': 3,
    });
  });
});

// ── removeAllBindingsForAgent 测试 ─────────────────────────────────────────

describe('removeAllBindingsForAgent', () => {
  test('空数组 → 返回空数组', () => {
    const result = removeAllBindingsForAgent([], 'agent-a');
    expect(result).toEqual([]);
  });

  test('移除存在的 Agent → 正确过滤，其他绑定保留', () => {
    const bindings = [
      makeBinding('skill-1', 'agent-a'),
      makeBinding('skill-2', 'agent-b'),
      makeBinding('skill-3', 'agent-a'),
      makeBinding('skill-4', 'agent-c'),
    ];
    const result = removeAllBindingsForAgent(bindings, 'agent-a');
    // 应仅保留 agent-b 和 agent-c 的绑定
    expect(result).toEqual([
      makeBinding('skill-2', 'agent-b'),
      makeBinding('skill-4', 'agent-c'),
    ]);
  });

  test('移除不存在的 Agent → 返回相同绑定', () => {
    const bindings = [
      makeBinding('skill-1', 'agent-a'),
      makeBinding('skill-2', 'agent-b'),
    ];
    const result = removeAllBindingsForAgent(bindings, 'agent-x');
    expect(result).toEqual(bindings);
  });
});

// ── removeAllBindingsForSkill 测试 ─────────────────────────────────────────

describe('removeAllBindingsForSkill', () => {
  test('空数组 → 返回空数组', () => {
    const result = removeAllBindingsForSkill([], 'skill-1');
    expect(result).toEqual([]);
  });

  test('移除存在的技能 → 正确过滤，其他绑定保留', () => {
    const bindings = [
      makeBinding('skill-1', 'agent-a'),
      makeBinding('skill-2', 'agent-b'),
      makeBinding('skill-1', 'agent-c'),
      makeBinding('skill-3', 'agent-a'),
    ];
    const result = removeAllBindingsForSkill(bindings, 'skill-1');
    // 应仅保留 skill-2 和 skill-3 的绑定
    expect(result).toEqual([
      makeBinding('skill-2', 'agent-b'),
      makeBinding('skill-3', 'agent-a'),
    ]);
  });

  test('移除不存在的技能 → 返回相同绑定', () => {
    const bindings = [
      makeBinding('skill-1', 'agent-a'),
      makeBinding('skill-2', 'agent-b'),
    ];
    const result = removeAllBindingsForSkill(bindings, 'skill-x');
    expect(result).toEqual(bindings);
  });
});
