/**
 * agentSkillRedesign.pbt.test.ts
 *
 * 智能体专属技能交互重设计 - 属性测试
 * 使用 fast-check 对 skillBindingUtils 中的纯函数进行属性验证
 */

import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';
import type { SkillAgentBinding } from '../../types/electron';
import {
  computeBindingCounts,
  removeAllBindingsForAgent,
  removeAllBindingsForSkill,
} from '../utils/skillBindingUtils';

// ── 生成器（Arbitraries）──────────────────────────────────────────

/**
 * 生成随机的 SkillAgentBinding 记录
 * skillId 和 agentId 从有限集合中选取，以增加重复概率，便于测试聚合逻辑
 */
const skillAgentBindingArb: fc.Arbitrary<SkillAgentBinding> = fc.record({
  skillId: fc.constantFrom('skill-a', 'skill-b', 'skill-c', 'skill-d', 'skill-e'),
  agentId: fc.constantFrom('agent-x', 'agent-y', 'agent-z', 'agent-w'),
  bindTime: fc.integer({ min: 946684800000, max: 4102444800000 }).map((ts) => new Date(ts).toISOString()),
  bindUserId: fc.option(fc.string({ minLength: 1, maxLength: 16 }), { nil: undefined }),
});

/**
 * 生成随机的 SkillAgentBinding 数组
 */
const bindingsArb = fc.array(skillAgentBindingArb, { minLength: 0, maxLength: 50 });

// ── 属性 1：绑定数量聚合正确性 ────────────────────────────────────

// Feature: agent-skill-redesign, Property 1: 绑定数量聚合正确性
describe('属性 1：绑定数量聚合正确性', () => {
  /**
   * **Validates: Requirements 3.1**
   *
   * 对于任意 agentId，computeBindingCounts 返回的计数
   * 应等于该 agentId 在绑定数组中通过 filter 手动计算的出现次数
   */
  test('对于任意绑定数组和 agentId，聚合计数应等于手动 filter+length 的结果', () => {
    fc.assert(
      fc.property(
        bindingsArb,
        fc.string({ minLength: 1, maxLength: 8 }),
        (bindings, agentId) => {
          const counts = computeBindingCounts(bindings);

          // 手动计算该 agentId 的出现次数
          const expected = bindings.filter((b) => b.agentId === agentId).length;

          // 聚合结果应与手动计算一致（不存在时为 0）
          const actual = counts[agentId] ?? 0;
          expect(actual).toBe(expected);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 3.1**
   *
   * 所有 agentId 的聚合计数之和应等于绑定数组的总长度
   */
  test('所有 agentId 的计数之和应等于绑定总数', () => {
    fc.assert(
      fc.property(bindingsArb, (bindings) => {
        const counts = computeBindingCounts(bindings);

        // 计算所有计数之和
        const totalCount = Object.values(counts).reduce((sum, n) => sum + n, 0);

        expect(totalCount).toBe(bindings.length);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 3.1**
   *
   * 绑定数组中出现的每个 agentId 都应作为 key 出现在聚合结果中
   */
  test('绑定数组中每个 agentId 都应出现在聚合结果的 key 中', () => {
    fc.assert(
      fc.property(bindingsArb, (bindings) => {
        const counts = computeBindingCounts(bindings);

        // 收集绑定数组中所有唯一的 agentId
        const uniqueAgentIds = new Set(bindings.map((b) => b.agentId));

        // 每个 agentId 都应存在于结果中
        for (const agentId of uniqueAgentIds) {
          expect(counts).toHaveProperty(agentId);
          expect(counts[agentId]).toBeGreaterThan(0);
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ── 属性 2：删除 Agent 后绑定清除 ─────────────────────────────────

// Feature: agent-skill-redesign, Property 2: 删除 Agent 后绑定清除
describe('属性 2：删除 Agent 后绑定清除', () => {
  /**
   * **Validates: Requirements 4.4**
   *
   * 对于任意绑定数组和任意 agentId，调用 removeAllBindingsForAgent 后，
   * 结果中不应包含任何 agentId 等于该值的记录
   */
  test('移除指定 agentId 后，结果中不应包含该 agentId 的绑定', () => {
    fc.assert(
      fc.property(
        bindingsArb,
        fc.constantFrom('agent-x', 'agent-y', 'agent-z', 'agent-w'),
        (bindings, agentId) => {
          const result = removeAllBindingsForAgent(bindings, agentId);

          // 结果中不应存在被移除的 agentId
          const hasRemovedAgent = result.some((b) => b.agentId === agentId);
          expect(hasRemovedAgent).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 4.4**
   *
   * 对于任意绑定数组和任意 agentId，调用 removeAllBindingsForAgent 后，
   * 其他 Agent 的绑定记录应保持不变
   */
  test('移除指定 agentId 后，其他 Agent 的绑定应保持不变', () => {
    fc.assert(
      fc.property(
        bindingsArb,
        fc.constantFrom('agent-x', 'agent-y', 'agent-z', 'agent-w'),
        (bindings, agentId) => {
          const result = removeAllBindingsForAgent(bindings, agentId);

          // 手动过滤出不属于该 agentId 的绑定
          const expectedOtherBindings = bindings.filter((b) => b.agentId !== agentId);

          // 结果应与手动过滤的结果完全一致
          expect(result).toEqual(expectedOtherBindings);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ── 属性 3：删除技能后绑定清除 ─────────────────────────────────────

// Feature: agent-skill-redesign, Property 3: 删除技能后绑定清除
describe('属性 3：删除技能后绑定清除', () => {
  /**
   * **Validates: Requirements 4.5**
   *
   * 对于任意绑定数组和任意 skillId，调用 removeAllBindingsForSkill 后，
   * 结果中不应包含任何 skillId 等于该值的记录
   */
  test('移除指定 skillId 后，结果中不应包含该 skillId 的绑定', () => {
    fc.assert(
      fc.property(
        bindingsArb,
        fc.constantFrom('skill-a', 'skill-b', 'skill-c', 'skill-d', 'skill-e'),
        (bindings, skillId) => {
          const result = removeAllBindingsForSkill(bindings, skillId);

          // 结果中不应存在被移除的 skillId
          const hasRemovedSkill = result.some((b) => b.skillId === skillId);
          expect(hasRemovedSkill).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 4.5**
   *
   * 对于任意绑定数组和任意 skillId，调用 removeAllBindingsForSkill 后，
   * 其他技能的绑定记录应保持不变
   */
  test('移除指定 skillId 后，其他技能的绑定应保持不变', () => {
    fc.assert(
      fc.property(
        bindingsArb,
        fc.constantFrom('skill-a', 'skill-b', 'skill-c', 'skill-d', 'skill-e'),
        (bindings, skillId) => {
          const result = removeAllBindingsForSkill(bindings, skillId);

          // 手动过滤出不属于该 skillId 的绑定
          const expectedOtherBindings = bindings.filter((b) => b.skillId !== skillId);

          // 结果应与手动过滤的结果完全一致
          expect(result).toEqual(expectedOtherBindings);
        },
      ),
      { numRuns: 100 },
    );
  });
});
