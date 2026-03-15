/**
 * 单元测试：bindingOps 扩展函数
 * 覆盖 filterBindingsByChannel 和 validateBindingDraft
 */

import { describe, test, expect } from 'vitest';
import {
  filterBindingsByChannel,
  validateBindingDraft,
  type OpenClawConfig,
  type BindingDraft,
} from '../bindingOps';

// ---- filterBindingsByChannel ----

describe('filterBindingsByChannel', () => {
  const makeConfig = (bindings: any[]): OpenClawConfig => ({
    bindings,
    channels: {},
  });

  test('返回匹配指定渠道的绑定记录', () => {
    const config = makeConfig([
      { agentId: 'a1', match: { channel: 'feishu', accountId: 'acc1' }, enabled: true },
      { agentId: 'a2', match: { channel: 'telegram', accountId: 'acc2' }, enabled: true },
      { agentId: 'a3', match: { channel: 'feishu', accountId: 'acc3' }, enabled: false },
    ]);

    const result = filterBindingsByChannel(config, 'feishu');
    expect(result).toHaveLength(2);
    expect(result.every((b) => b.match.channel === 'feishu')).toBe(true);
  });

  test('无匹配时返回空数组', () => {
    const config = makeConfig([
      { agentId: 'a1', match: { channel: 'feishu', accountId: 'acc1' }, enabled: true },
    ]);

    const result = filterBindingsByChannel(config, 'slack');
    expect(result).toHaveLength(0);
  });

  test('空 bindings 数组返回空数组', () => {
    const config = makeConfig([]);
    const result = filterBindingsByChannel(config, 'feishu');
    expect(result).toHaveLength(0);
  });
});

// ---- validateBindingDraft ----

describe('validateBindingDraft', () => {
  const makeDraft = (agentId: string, channel: string): BindingDraft => ({
    binding: {
      agentId,
      match: { channel, accountId: 'default' },
      enabled: true,
    },
    accountConfig: null,
  });

  test('agentId 和 channel 均有效时返回空数组', () => {
    const errors = validateBindingDraft(makeDraft('main', 'feishu'));
    expect(errors).toEqual([]);
  });

  test('agentId 为空字符串时返回错误', () => {
    const errors = validateBindingDraft(makeDraft('', 'feishu'));
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors.some((e) => e.includes('agentId'))).toBe(true);
  });

  test('agentId 为纯空白时返回错误', () => {
    const errors = validateBindingDraft(makeDraft('   ', 'feishu'));
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors.some((e) => e.includes('agentId'))).toBe(true);
  });

  test('channel 为空字符串时返回错误', () => {
    const errors = validateBindingDraft(makeDraft('main', ''));
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors.some((e) => e.includes('channel'))).toBe(true);
  });

  test('channel 为纯空白时返回错误', () => {
    const errors = validateBindingDraft(makeDraft('main', '  \t  '));
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors.some((e) => e.includes('channel'))).toBe(true);
  });

  test('agentId 和 channel 均为空时返回两条错误', () => {
    const errors = validateBindingDraft(makeDraft('', ''));
    expect(errors).toHaveLength(2);
  });
});
