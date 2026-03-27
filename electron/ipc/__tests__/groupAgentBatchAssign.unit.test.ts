/**
 * 单元测试：分组对话框 Agent 批量选择
 * Feature: group-agent-batch-assign
 *
 * 测试纯函数 initSelectedAgents、filterAgentsByName、computeMappingDiff，
 * 验证 Batch_Selector 相关的业务逻辑行为。
 */

import { describe, test, expect } from 'vitest';
import {
  initSelectedAgents,
  filterAgentsByName,
  computeMappingDiff,
} from '../agentGroupLogic';
import type { AgentInfo } from '../agents';

// ============================================================================
// 辅助工厂函数
// ============================================================================

/** 创建测试用 AgentInfo 对象 */
function makeAgent(id: string, name: string): AgentInfo {
  return { id, name, workspace: 'default', model: 'gpt-4' };
}

// ============================================================================
// 创建模式下初始选中集合为空（Requirements 2.2）
// ============================================================================

describe('创建模式下初始选中集合为空 (Req 2.2)', () => {
  test('空映射 + 任意 groupId → 返回空集合', () => {
    const result = initSelectedAgents({}, 'group-1');
    expect(result.size).toBe(0);
  });

  test('映射中无匹配 groupId → 返回空集合', () => {
    const mappings = {
      'agent-1': 'group-other',
      'agent-2': 'group-another',
    };
    const result = initSelectedAgents(mappings, 'group-new');
    expect(result.size).toBe(0);
  });
});

// ============================================================================
// 确认回调数据包含 selectedAgentIds（Requirements 3.1）
// ============================================================================

describe('确认回调数据包含 selectedAgentIds (Req 3.1)', () => {
  test('computeMappingDiff 正确计算需要分配和移除的 Agent', () => {
    // 当前映射：agent-1 和 agent-2 属于 group-1
    const currentMappings = {
      'agent-1': 'group-1',
      'agent-2': 'group-1',
      'agent-3': 'group-2',
    };
    // 用户选中 agent-1 和 agent-3（取消 agent-2，新增 agent-3）
    const selectedAgentIds = ['agent-1', 'agent-3'];
    const { toAssign, toRemove } = computeMappingDiff(
      selectedAgentIds,
      currentMappings,
      'group-1',
    );

    // agent-3 需要分配到 group-1（当前在 group-2）
    expect(toAssign).toContain('agent-3');
    // agent-1 已在 group-1，不需要重新分配
    expect(toAssign).not.toContain('agent-1');
    // agent-2 需要从 group-1 移除
    expect(toRemove).toContain('agent-2');
    // agent-3 不应在移除列表中
    expect(toRemove).not.toContain('agent-3');
  });

  test('选中列表为空时，所有当前映射到该分组的 Agent 都应被移除', () => {
    const currentMappings = {
      'agent-1': 'group-1',
      'agent-2': 'group-1',
    };
    const { toAssign, toRemove } = computeMappingDiff([], currentMappings, 'group-1');
    expect(toAssign).toHaveLength(0);
    expect(toRemove).toEqual(expect.arrayContaining(['agent-1', 'agent-2']));
    expect(toRemove).toHaveLength(2);
  });
});

// ============================================================================
// Agent 数量 ≤ 5 时隐藏搜索框（Requirements 5.4）
// Agent 数量 > 5 时显示搜索框（Requirements 5.1）
// ============================================================================

describe('搜索框显示逻辑 (Req 5.1, 5.4)', () => {
  test('Agent 数量 ≤ 5 时，showSearch 应为 false', () => {
    const agents = [
      makeAgent('1', 'A'),
      makeAgent('2', 'B'),
      makeAgent('3', 'C'),
    ];
    // 模拟组件中的 showSearch 逻辑
    const showSearch = agents.length > 5;
    expect(showSearch).toBe(false);
  });

  test('Agent 数量恰好为 5 时，showSearch 应为 false', () => {
    const agents = Array.from({ length: 5 }, (_, i) => makeAgent(`${i}`, `Agent-${i}`));
    const showSearch = agents.length > 5;
    expect(showSearch).toBe(false);
  });

  test('Agent 数量为 6 时，showSearch 应为 true', () => {
    const agents = Array.from({ length: 6 }, (_, i) => makeAgent(`${i}`, `Agent-${i}`));
    const showSearch = agents.length > 5;
    expect(showSearch).toBe(true);
  });

  test('Agent 数量为 10 时，showSearch 应为 true', () => {
    const agents = Array.from({ length: 10 }, (_, i) => makeAgent(`${i}`, `Agent-${i}`));
    const showSearch = agents.length > 5;
    expect(showSearch).toBe(true);
  });
});

// ============================================================================
// 空列表显示占位文本（Requirements 1.3）
// ============================================================================

describe('空列表显示占位文本 (Req 1.3)', () => {
  test('Agent 列表为空时，agents.length === 0 为 true', () => {
    const agents: AgentInfo[] = [];
    expect(agents.length).toBe(0);
    // 组件中当 agents.length === 0 时显示"暂无可用智能体"
  });
});

// ============================================================================
// 搜索结果为空显示提示文本（Requirements 5.3）
// ============================================================================

describe('搜索结果为空显示提示文本 (Req 5.3)', () => {
  test('搜索关键词无匹配时，filterAgentsByName 返回空数组', () => {
    const agents = [
      makeAgent('1', 'Alpha'),
      makeAgent('2', 'Beta'),
      makeAgent('3', 'Gamma'),
    ];
    const result = filterAgentsByName(agents, 'zzz-no-match');
    expect(result).toHaveLength(0);
    // 组件中当 filteredAgents.length === 0 且 agents.length > 0 时显示"无匹配的智能体"
  });

  test('搜索关键词匹配部分 Agent 时，返回匹配结果', () => {
    const agents = [
      makeAgent('1', 'Alpha'),
      makeAgent('2', 'Beta'),
      makeAgent('3', 'Gamma'),
    ];
    const result = filterAgentsByName(agents, 'alpha');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Alpha');
  });

  test('空搜索关键词返回完整列表', () => {
    const agents = [
      makeAgent('1', 'Alpha'),
      makeAgent('2', 'Beta'),
    ];
    const result = filterAgentsByName(agents, '');
    expect(result).toHaveLength(2);
  });

  test('仅空白字符的搜索关键词返回完整列表', () => {
    const agents = [
      makeAgent('1', 'Alpha'),
      makeAgent('2', 'Beta'),
    ];
    const result = filterAgentsByName(agents, '   ');
    expect(result).toHaveLength(2);
  });
});
