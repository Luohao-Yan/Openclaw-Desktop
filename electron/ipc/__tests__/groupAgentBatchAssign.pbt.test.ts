/**
 * 属性测试：分组对话框 Agent 批量选择
 * Feature: group-agent-batch-assign
 *
 * 本文件使用 fast-check 对批量选择相关纯函数进行属性测试，
 * 验证预选初始化、映射差异计算和搜索过滤的正确性属性。
 */

import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  initSelectedAgents,
  computeMappingDiff,
  filterAgentsByName,
} from '../agentGroupLogic';
import type { AgentInfo } from '../agents';

// ============================================================================
// 生成器（Arbitraries）
// ============================================================================

/**
 * 生成随机的 Agent-分组映射（agentId → groupId）
 */
const mappingsArb = fc.dictionary(
  fc.uuid(),
  fc.uuid(),
  { minKeys: 0, maxKeys: 15 },
);

/**
 * 生成随机的 AgentInfo 对象（仅包含测试所需的 id 和 name 字段）
 */
const agentInfoArb: fc.Arbitrary<AgentInfo> = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 32 }),
  workspace: fc.constant('default'),
  model: fc.constant('gpt-4'),
});

/**
 * 生成随机的 AgentInfo 列表（确保 id 唯一）
 */
const agentListArb = fc.array(agentInfoArb, { minLength: 0, maxLength: 10 });

// ============================================================================
// Property 1: 编辑模式预选初始化正确性
// Feature: group-agent-batch-assign, Property 1: 编辑模式预选初始化正确性
// ============================================================================

describe('Property 1: 编辑模式预选初始化正确性', () => {
  /**
   * 对于任意 Agent-分组映射 mappings 和任意分组 ID groupId，
   * initSelectedAgents 返回的集合应恰好等于 mappings 中值等于 groupId 的所有 Agent ID 集合。
   *
   * **Validates: Requirements 2.1**
   */
  test(
    'Feature: group-agent-batch-assign, Property 1: 编辑模式预选初始化正确性',
    () => {
      fc.assert(
        fc.property(
          mappingsArb,
          fc.uuid(),
          (mappings, groupId) => {
            // 执行初始化
            const result = initSelectedAgents(mappings, groupId);

            // 手动计算期望集合：映射中值等于 groupId 的所有 agentId
            const expected = new Set(
              Object.entries(mappings)
                .filter(([_, gId]) => gId === groupId)
                .map(([agentId]) => agentId),
            );

            // 结果集合大小应一致
            expect(result.size).toBe(expected.size);

            // 结果集合中的每个元素都应在期望集合中
            for (const id of result) {
              expect(expected.has(id)).toBe(true);
            }

            // 期望集合中的每个元素都应在结果集合中
            for (const id of expected) {
              expect(result.has(id)).toBe(true);
            }
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});


// ============================================================================
// Property 3: 映射差异计算正确性
// Feature: group-agent-batch-assign, Property 3: 映射差异计算正确性
// ============================================================================

describe('Property 3: 映射差异计算正确性', () => {
  /**
   * 对于任意选中 Agent ID 列表、任意当前映射和任意分组 ID，
   * computeMappingDiff 返回的 toAssign 和 toRemove 应满足：
   * - toAssign 中的每个 Agent 当前映射不指向 groupId
   * - toRemove 中的每个 Agent 当前映射指向 groupId 且不在 selectedAgentIds 中
   * - 应用 toAssign 和 toRemove 后，映射中指向 groupId 的 Agent 集合恰好等于 selectedAgentIds
   *
   * **Validates: Requirements 3.2, 3.3, 4.3**
   */
  test(
    'Feature: group-agent-batch-assign, Property 3: 映射差异计算正确性',
    () => {
      fc.assert(
        fc.property(
          fc.array(fc.uuid(), { minLength: 0, maxLength: 10 }),
          mappingsArb,
          fc.uuid(),
          (selectedAgentIds, currentMappings, groupId) => {
            const { toAssign, toRemove } = computeMappingDiff(
              selectedAgentIds,
              currentMappings,
              groupId,
            );

            // toAssign 中的每个 Agent 当前映射不指向 groupId
            for (const id of toAssign) {
              expect(currentMappings[id]).not.toBe(groupId);
            }

            // toRemove 中的每个 Agent 当前映射指向 groupId 且不在 selectedAgentIds 中
            const selectedSet = new Set(selectedAgentIds);
            for (const id of toRemove) {
              expect(currentMappings[id]).toBe(groupId);
              expect(selectedSet.has(id)).toBe(false);
            }

            // 模拟应用 toAssign 和 toRemove 后的映射状态
            const simulatedMappings = { ...currentMappings };

            // 将 toAssign 中的 Agent 分配到 groupId
            for (const id of toAssign) {
              simulatedMappings[id] = groupId;
            }

            // 将 toRemove 中的 Agent 从映射中移除
            for (const id of toRemove) {
              delete simulatedMappings[id];
            }

            // 应用后，映射中指向 groupId 的 Agent 集合应恰好等于 selectedAgentIds
            const finalGroupAgents = new Set(
              Object.entries(simulatedMappings)
                .filter(([_, gId]) => gId === groupId)
                .map(([agentId]) => agentId),
            );

            // 去重后的 selectedAgentIds
            const expectedSet = new Set(selectedAgentIds);

            expect(finalGroupAgents.size).toBe(expectedSet.size);
            for (const id of expectedSet) {
              expect(finalGroupAgents.has(id)).toBe(true);
            }
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});

// ============================================================================
// Property 5: 搜索过滤正确性
// Feature: group-agent-batch-assign, Property 5: 搜索过滤正确性
// ============================================================================

describe('Property 5: 搜索过滤正确性', () => {
  /**
   * 对于任意 Agent 列表和任意搜索关键词 query，filterAgentsByName 返回的结果应满足：
   * - 结果中每个 Agent 的名称（转小写后）包含 query.trim().toLowerCase()
   * - 原列表中所有名称包含该关键词的 Agent 都在结果中（不遗漏）
   *
   * **Validates: Requirements 5.2**
   */
  test(
    'Feature: group-agent-batch-assign, Property 5: 搜索过滤正确性',
    () => {
      fc.assert(
        fc.property(
          agentListArb,
          fc.string({ minLength: 0, maxLength: 16 }),
          (agents, query) => {
            const result = filterAgentsByName(agents, query);
            const trimmedLower = query.trim().toLowerCase();

            if (trimmedLower.length === 0) {
              // 空查询应返回完整列表
              expect(result.length).toBe(agents.length);
              return;
            }

            // 结果中每个 Agent 的名称应包含搜索关键词
            for (const agent of result) {
              expect(agent.name.toLowerCase().includes(trimmedLower)).toBe(true);
            }

            // 原列表中所有名称包含关键词的 Agent 都应在结果中（不遗漏）
            const resultIds = new Set(result.map((a) => a.id));
            for (const agent of agents) {
              if (agent.name.toLowerCase().includes(trimmedLower)) {
                expect(resultIds.has(agent.id)).toBe(true);
              }
            }
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});

// ============================================================================
// 纯函数：用于属性测试的 toggle 和分组名称解析逻辑
// ============================================================================

/**
 * 切换 Agent 选中状态（纯函数版本）
 *
 * 如果 agentId 在 selectedIds 中，则移除；否则添加。
 * 返回新的 Set，不修改原集合。
 *
 * @param selectedIds - 当前选中的 Agent ID 集合
 * @param agentId - 要切换的 Agent ID
 * @returns 切换后的新集合
 */
function toggleAgentSelection(
  selectedIds: Set<string>,
  agentId: string,
): Set<string> {
  const next = new Set(selectedIds);
  if (next.has(agentId)) {
    next.delete(agentId);
  } else {
    next.add(agentId);
  }
  return next;
}

/**
 * 解析 Agent 已分配到的其他分组名称（纯函数版本）
 *
 * 如果 Agent 分配到当前编辑的分组或未分配，返回 undefined。
 * 否则返回对应分组的名称。
 *
 * @param agentId - Agent ID
 * @param mappings - 当前 Agent-分组映射
 * @param groups - 所有分组列表
 * @param editingGroupId - 当前编辑的分组 ID（可选，编辑模式下传入）
 * @returns 其他分组名称，或 undefined
 */
function getOtherGroupName(
  agentId: string,
  mappings: Record<string, string>,
  groups: { id: string; name: string }[],
  editingGroupId?: string,
): string | undefined {
  const mappedGroupId = mappings[agentId];
  if (!mappedGroupId) return undefined;
  // 编辑模式下，如果映射到当前分组则不显示提示
  if (editingGroupId && mappedGroupId === editingGroupId) return undefined;
  const mappedGroup = groups.find((g) => g.id === mappedGroupId);
  return mappedGroup?.name;
}

// ============================================================================
// 生成器：分组信息
// ============================================================================

/**
 * 生成随机的分组对象（仅包含 id 和 name）
 */
const groupInfoArb = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 20 }),
});

/**
 * 生成随机的分组列表（确保 id 唯一）
 */
const groupListArb = fc.array(groupInfoArb, { minLength: 0, maxLength: 10 });

// ============================================================================
// Property 2: Checkbox toggle 翻转
// Feature: group-agent-batch-assign, Property 2: Checkbox toggle 翻转
// ============================================================================

describe('Property 2: Checkbox toggle 翻转', () => {
  /**
   * 对于任意选中集合 selectedIds 和任意 Agent ID agentId，执行 toggle 操作后：
   * - 若 agentId 原本在 selectedIds 中，则操作后不在集合中
   * - 若 agentId 原本不在 selectedIds 中，则操作后在集合中
   *
   * **Validates: Requirements 2.3, 2.4**
   */
  test(
    'Feature: group-agent-batch-assign, Property 2: Checkbox toggle 翻转',
    () => {
      fc.assert(
        fc.property(
          fc.array(fc.uuid(), { minLength: 0, maxLength: 15 }),
          fc.uuid(),
          (idArray, agentId) => {
            const selectedIds = new Set(idArray);
            const wasMember = selectedIds.has(agentId);

            // 执行 toggle
            const result = toggleAgentSelection(selectedIds, agentId);

            if (wasMember) {
              // 原本在集合中 → toggle 后应不在集合中
              expect(result.has(agentId)).toBe(false);
            } else {
              // 原本不在集合中 → toggle 后应在集合中
              expect(result.has(agentId)).toBe(true);
            }

            // 其他元素不受影响
            for (const id of selectedIds) {
              if (id !== agentId) {
                expect(result.has(id)).toBe(true);
              }
            }
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});

// ============================================================================
// Property 4: 其他分组名称解析
// Feature: group-agent-batch-assign, Property 4: 其他分组名称解析
// ============================================================================

describe('Property 4: 其他分组名称解析', () => {
  /**
   * 对于任意 agentId、映射 mappings 和分组列表 groups：
   * - 若 Agent 映射到某个分组且该分组存在于 groups 中且不是当前编辑分组，则应能解析出分组名称
   * - 若 Agent 未分配或分配到当前编辑分组，则不应显示提示（返回 undefined）
   *
   * **Validates: Requirements 4.1**
   */
  test(
    'Feature: group-agent-batch-assign, Property 4: 其他分组名称解析',
    () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          mappingsArb,
          groupListArb,
          fc.option(fc.uuid(), { nil: undefined }),
          (agentId, mappings, groups, editingGroupId) => {
            const result = getOtherGroupName(agentId, mappings, groups, editingGroupId);
            const mappedGroupId = mappings[agentId];

            if (!mappedGroupId) {
              // Agent 未分配 → 应返回 undefined
              expect(result).toBeUndefined();
            } else if (editingGroupId && mappedGroupId === editingGroupId) {
              // Agent 分配到当前编辑分组 → 应返回 undefined
              expect(result).toBeUndefined();
            } else {
              // Agent 分配到其他分组
              const matchedGroup = groups.find((g) => g.id === mappedGroupId);
              if (matchedGroup) {
                // 分组存在于列表中 → 应返回分组名称
                expect(result).toBe(matchedGroup.name);
              } else {
                // 分组不在列表中 → 应返回 undefined
                expect(result).toBeUndefined();
              }
            }
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});
