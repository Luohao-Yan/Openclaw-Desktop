/**
 * 属性测试：完成页摘要渲染逻辑
 * Feature: setup-guided-completion, Property 4: 完成页摘要包含所有必要信息
 *
 * 验证：对于任意有效的 SetupSettings 状态（包含运行模式、已添加渠道列表、已创建 Agent 信息的任意组合），
 * 完成页摘要渲染应包含：运行模式文本、每个已添加渠道的名称、已创建 Agent 的名称（如有）。
 *
 * Validates: Requirements 3.1
 */

import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';

// ============================================================
// 纯函数：从 SetupCompletePage 中提取的摘要计算逻辑
// ============================================================

/**
 * 计算运行模式文本。
 * 与 SetupCompletePage 中的渲染逻辑一致：
 *   mode === 'remote' ? '连接远程 OpenClaw' : '本机 OpenClaw'
 */
function getRunModeText(mode: 'local' | 'remote' | null): string {
  return mode === 'remote' ? '连接远程 OpenClaw' : '本机 OpenClaw';
}

/**
 * 计算已添加渠道摘要文本。
 * 与 SetupCompletePage 中的渲染逻辑一致：
 *   空列表 → '未添加渠道'
 *   非空列表 → `${count} 个（${labels}）`
 */
function getChannelsSummaryText(addedChannels: Array<{ key: string; label: string }>): string {
  if (addedChannels.length === 0) return '未添加渠道';
  return `${addedChannels.length} 个（${addedChannels.map((ch) => ch.label).join('、')}）`;
}

/**
 * 计算已创建 Agent 摘要文本。
 * 与 SetupCompletePage 中的渲染逻辑一致：
 *   createdAgent?.name ?? createdAgentName ?? '未创建智能体'
 */
function getAgentSummaryText(
  createdAgent: { id: string; name: string } | null,
  createdAgentName: string | undefined,
): string {
  return createdAgent?.name ?? createdAgentName ?? '未创建智能体';
}

// ============================================================
// 生成器（Arbitraries）
// ============================================================

/** 生成运行模式：'local' | 'remote' | null */
const modeArb = (): fc.Arbitrary<'local' | 'remote' | null> =>
  fc.constantFrom('local' as const, 'remote' as const, null);

/** 生成非空字符串（用于渠道 key 和 label） */
const nonEmptyStringArb = (): fc.Arbitrary<string> =>
  fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0);

/** 生成单个已添加渠道 */
const addedChannelArb = (): fc.Arbitrary<{ key: string; label: string }> =>
  fc.record({
    key: nonEmptyStringArb(),
    label: nonEmptyStringArb(),
  });

/** 生成已添加渠道列表 */
const addedChannelsArb = (): fc.Arbitrary<Array<{ key: string; label: string }>> =>
  fc.array(addedChannelArb(), { minLength: 0, maxLength: 10 });

/** 生成非空已添加渠道列表（至少一个渠道） */
const nonEmptyAddedChannelsArb = (): fc.Arbitrary<Array<{ key: string; label: string }>> =>
  fc.array(addedChannelArb(), { minLength: 1, maxLength: 10 });

/** 生成已创建 Agent 对象 */
const createdAgentArb = (): fc.Arbitrary<{ id: string; name: string }> =>
  fc.record({
    id: nonEmptyStringArb(),
    name: nonEmptyStringArb(),
  });

/** 生成可选的 createdAgentName */
const createdAgentNameArb = (): fc.Arbitrary<string | undefined> =>
  fc.oneof(fc.constant(undefined), nonEmptyStringArb());

// ============================================================
// Property 4: 完成页摘要包含所有必要信息
// Feature: setup-guided-completion, Property 4
// ============================================================

describe('Property 4: 完成页摘要包含所有必要信息', () => {

  /**
   * Validates: Requirements 3.1
   *
   * 子属性 1：getRunModeText 始终返回非空字符串，且包含"远程"或"本机"
   */
  test('getRunModeText 始终返回包含"远程"或"本机"的非空字符串', () => {
    fc.assert(
      fc.property(modeArb(), (mode) => {
        const text = getRunModeText(mode);

        // 结果非空
        expect(text.length).toBeGreaterThan(0);

        // 包含"远程"或"本机"之一
        const containsRemote = text.includes('远程');
        const containsLocal = text.includes('本机');
        expect(containsRemote || containsLocal).toBe(true);

        // mode === 'remote' 时包含"远程"，否则包含"本机"
        if (mode === 'remote') {
          expect(containsRemote).toBe(true);
        } else {
          expect(containsLocal).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 3.1
   *
   * 子属性 2：getChannelsSummaryText 对非空渠道列表，输出包含每个渠道的 label
   */
  test('getChannelsSummaryText 非空渠道列表包含每个渠道 label', () => {
    fc.assert(
      fc.property(nonEmptyAddedChannelsArb(), (channels) => {
        const text = getChannelsSummaryText(channels);

        // 每个渠道的 label 都应出现在输出中
        for (const ch of channels) {
          expect(text).toContain(ch.label);
        }

        // 输出应包含渠道数量
        expect(text).toContain(`${channels.length}`);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 3.1
   *
   * 子属性 3：getChannelsSummaryText 对空渠道列表返回"未添加渠道"
   */
  test('getChannelsSummaryText 空渠道列表返回"未添加渠道"', () => {
    // 空列表是确定性的，无需属性测试，但为保持一致性仍使用 fc.assert
    fc.assert(
      fc.property(
        fc.constant([] as Array<{ key: string; label: string }>),
        (emptyChannels) => {
          const text = getChannelsSummaryText(emptyChannels);
          expect(text).toBe('未添加渠道');
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 3.1
   *
   * 子属性 4：getAgentSummaryText 有 createdAgent 时返回 agent name
   */
  test('getAgentSummaryText 有 createdAgent 时返回 agent name', () => {
    fc.assert(
      fc.property(
        createdAgentArb(),
        createdAgentNameArb(),
        (agent, agentName) => {
          const text = getAgentSummaryText(agent, agentName);

          // 有 createdAgent 时，始终返回 createdAgent.name
          expect(text).toBe(agent.name);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 3.1
   *
   * 子属性 5：getAgentSummaryText 无 agent 时返回"未创建智能体"
   */
  test('getAgentSummaryText 无 agent 且无 agentName 时返回"未创建智能体"', () => {
    fc.assert(
      fc.property(fc.constant(null), fc.constant(undefined), (agent, agentName) => {
        const text = getAgentSummaryText(agent, agentName);
        expect(text).toBe('未创建智能体');
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 3.1
   *
   * 子属性 5b：getAgentSummaryText 无 createdAgent 但有 createdAgentName 时返回 agentName
   */
  test('getAgentSummaryText 无 createdAgent 但有 createdAgentName 时返回 agentName', () => {
    fc.assert(
      fc.property(nonEmptyStringArb(), (agentName) => {
        const text = getAgentSummaryText(null, agentName);
        expect(text).toBe(agentName);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 3.1
   *
   * 子属性 6：完整摘要始终包含三部分信息（运行模式、渠道、Agent）
   */
  test('完整摘要始终包含运行模式、渠道和 Agent 三部分信息', () => {
    fc.assert(
      fc.property(
        modeArb(),
        addedChannelsArb(),
        fc.option(createdAgentArb(), { nil: null }),
        createdAgentNameArb(),
        (mode, channels, agent, agentName) => {
          // 模拟完成页摘要的三部分计算
          const modeText = getRunModeText(mode);
          const channelsText = getChannelsSummaryText(channels);
          const agentText = getAgentSummaryText(agent, agentName);

          // 三部分都应为非空字符串
          expect(modeText.length).toBeGreaterThan(0);
          expect(channelsText.length).toBeGreaterThan(0);
          expect(agentText.length).toBeGreaterThan(0);

          // 三部分组合后的摘要包含所有必要信息
          const fullSummary = `${modeText}\n${channelsText}\n${agentText}`;

          // 运行模式部分：包含"远程"或"本机"
          expect(fullSummary.includes('远程') || fullSummary.includes('本机')).toBe(true);

          // 渠道部分：空列表显示"未添加渠道"，非空列表包含每个渠道 label
          if (channels.length === 0) {
            expect(fullSummary).toContain('未添加渠道');
          } else {
            for (const ch of channels) {
              expect(fullSummary).toContain(ch.label);
            }
          }

          // Agent 部分：有 agent 显示名称，无 agent 显示"未创建智能体"
          if (agent) {
            expect(fullSummary).toContain(agent.name);
          } else if (agentName) {
            expect(fullSummary).toContain(agentName);
          } else {
            expect(fullSummary).toContain('未创建智能体');
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
