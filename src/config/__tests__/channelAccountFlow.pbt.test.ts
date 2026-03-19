/**
 * 属性测试：渠道账户配置流程
 * Feature: setup-channel-account-flow
 *
 * 覆盖属性：
 * - P1: accountId 格式校验的正确性
 * - P2: 账户删除保留最少一个
 * - P4: ChannelAddResult 序列化 round-trip
 * - P6: Reducer 正确存储含 accountId 的绑定
 */

import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';
import { validateAccountId } from '../channelAccountFields';
import { setupReducer, initialSetupState } from '../../contexts/setupReducer';
import type { SetupState } from '../../contexts/setupReducer';
import type { ChannelAddResult } from '../../types/setup';

// ============================================================================
// 生成器（Arbitraries）
// ============================================================================

/** 合法 accountId：仅 ASCII 字母、数字、连字符、下划线，至少 1 字符 */
const validAccountIdArb = fc.stringMatching(/^[a-zA-Z0-9_-]+$/).filter((s) => s.length > 0);

/** 包含非法字符的字符串生成器 */
const invalidAccountIdArb = fc.stringMatching(/^[!@#$%^&*()+={}\[\]|;:'",.<>?/`~ ]+$/).filter((s) => s.length > 0);

/** 随机已有 ID 列表生成器 */
const existingIdsArb = fc.array(validAccountIdArb, { minLength: 0, maxLength: 10 });

// ============================================================================
// P1: accountId 格式校验的正确性
// ============================================================================

describe('Feature: setup-channel-account-flow, Property 1: accountId 格式校验的正确性', () => {
  test('合法的 accountId 应通过校验', () => {
    fc.assert(
      fc.property(validAccountIdArb, (accountId) => {
        const result = validateAccountId(accountId, []);
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      }),
      { numRuns: 100 },
    );
  });

  test('空字符串或纯空白应校验失败', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('', ' ', '  ', '\t', '\n'),
        (accountId) => {
          const result = validateAccountId(accountId, []);
          expect(result.valid).toBe(false);
          expect(result.error).toBeDefined();
        },
      ),
      { numRuns: 20 },
    );
  });

  test('包含非法字符的字符串应校验失败', () => {
    fc.assert(
      fc.property(invalidAccountIdArb, (accountId) => {
        const result = validateAccountId(accountId, []);
        expect(result.valid).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  test('已存在的 accountId 应校验失败（唯一性）', () => {
    fc.assert(
      fc.property(
        validAccountIdArb,
        existingIdsArb,
        (accountId, otherIds) => {
          // 将 accountId 加入已有列表
          const ids = [...otherIds, accountId];
          const result = validateAccountId(accountId, ids);
          expect(result.valid).toBe(false);
          expect(result.error).toContain('已存在');
        },
      ),
      { numRuns: 100 },
    );
  });

  test('不在已有列表中的合法 accountId 应通过校验', () => {
    fc.assert(
      fc.property(
        validAccountIdArb,
        existingIdsArb,
        (accountId, existingIds) => {
          // 确保 accountId 不在列表中
          const filtered = existingIds.filter((id) => id !== accountId);
          const result = validateAccountId(accountId, filtered);
          expect(result.valid).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ============================================================================
// P2: 账户删除保留最少一个
// ============================================================================

describe('Feature: setup-channel-account-flow, Property 2: 账户删除保留最少一个', () => {
  /** 生成包含 N 个账户的初始状态 */
  const stateWithAccounts = (provider: string, count: number): SetupState => {
    const accounts = Array.from({ length: count }, (_, i) => ({
      _stableKey: `test-key-${i}`,
      accountId: `account-${i}`,
      fieldValues: {},
    }));
    return {
      ...initialSetupState,
      channels: {
        ...initialSetupState.channels,
        accounts: { [provider]: accounts },
      },
    };
  };

  test('列表长度 > 1 时删除成功，长度减少 1', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 20 }),
        (count) => {
          const provider = 'feishu';
          const state = stateWithAccounts(provider, count);
          const targetId = `account-0`;
          const newState = setupReducer(state, {
            type: 'REMOVE_CHANNEL_ACCOUNT',
            payload: { provider, accountId: targetId },
          });
          const newAccounts = newState.channels.accounts[provider] || [];
          expect(newAccounts.length).toBe(count - 1);
          expect(newAccounts.find((a) => a.accountId === targetId)).toBeUndefined();
        },
      ),
      { numRuns: 100 },
    );
  });

  test('列表长度 = 1 时删除被拒绝，列表保持不变', () => {
    fc.assert(
      fc.property(
        validAccountIdArb,
        (accountId) => {
          const provider = 'telegram';
          const state: SetupState = {
            ...initialSetupState,
            channels: {
              ...initialSetupState.channels,
              accounts: { [provider]: [{ _stableKey: 'test-key-0', accountId, fieldValues: {} }] },
            },
          };
          const newState = setupReducer(state, {
            type: 'REMOVE_CHANNEL_ACCOUNT',
            payload: { provider, accountId },
          });
          const newAccounts = newState.channels.accounts[provider] || [];
          expect(newAccounts.length).toBe(1);
          expect(newAccounts[0].accountId).toBe(accountId);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ============================================================================
// P4: ChannelAddResult 序列化 round-trip
// ============================================================================

describe('Feature: setup-channel-account-flow, Property 4: ChannelAddResult 序列化 round-trip', () => {
  /** 随机 ChannelAddResult 生成器（含 accountId） */
  const channelAddResultArb: fc.Arbitrary<ChannelAddResult> = fc.record({
    channelKey: fc.stringMatching(/^[a-z_]{1,20}$/).filter((s) => s.length > 0),
    channelLabel: fc.string({ minLength: 1, maxLength: 30 }),
    success: fc.boolean(),
    output: fc.option(fc.string({ maxLength: 200 }), { nil: undefined }),
    error: fc.option(fc.string({ maxLength: 200 }), { nil: undefined }),
    accountId: fc.option(validAccountIdArb, { nil: undefined }),
  });

  test('JSON.parse(JSON.stringify(result)) 应与原始对象深度相等', () => {
    fc.assert(
      fc.property(channelAddResultArb, (result) => {
        const serialized = JSON.stringify(result);
        const deserialized = JSON.parse(serialized) as ChannelAddResult;
        expect(deserialized).toEqual(result);
      }),
      { numRuns: 100 },
    );
  });
});

// ============================================================================
// P6: Reducer 正确存储含 accountId 的绑定
// ============================================================================

describe('Feature: setup-channel-account-flow, Property 6: Reducer 正确存储含 accountId 的绑定', () => {
  /** 随机绑定条目生成器 */
  const bindingArb = fc.record({
    agentId: fc.stringMatching(/^[a-z0-9-]{1,20}$/).filter((s) => s.length > 0),
    channelKey: fc.constantFrom('feishu', 'telegram', 'discord', 'slack'),
    accountId: validAccountIdArb,
  });

  test('dispatch SET_AGENT_CHANNEL_BINDINGS 后 state.agent.bindings 与 payload 一致', () => {
    fc.assert(
      fc.property(
        fc.array(bindingArb, { minLength: 0, maxLength: 10 }),
        (bindings) => {
          const state = setupReducer(initialSetupState, {
            type: 'SET_AGENT_CHANNEL_BINDINGS',
            payload: bindings,
          });
          expect(state.agent.bindings).toEqual(bindings);
        },
      ),
      { numRuns: 100 },
    );
  });
});
