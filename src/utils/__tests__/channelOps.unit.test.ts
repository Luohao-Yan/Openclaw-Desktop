/**
 * 单元测试：渠道操作纯函数模块
 * 验证 channelOps.ts 中所有函数的基本行为和边界情况
 */

import { describe, test, expect } from 'vitest';
import type { OpenClawConfig } from '../bindingOps';
import {
  SUPPORTED_CHANNEL_TYPES,
  addChannelToConfig,
  deleteChannelFromConfig,
  updateChannelConfig,
  addAccountToChannel,
  deleteAccountFromChannel,
  updateAccountConfig,
  isSupportedChannelType,
  isAccountIdDuplicate,
  computeChannelSummary,
  getChannelBindingCount,
} from '../channelOps';

// ============================================================
// 辅助：创建基础配置
// ============================================================

/** 创建空配置 */
function emptyConfig(): OpenClawConfig {
  return { bindings: [], channels: {} };
}

/** 创建包含 feishu 渠道和绑定的配置 */
function sampleConfig(): OpenClawConfig {
  return {
    bindings: [
      { agentId: 'main', match: { channel: 'feishu', accountId: 'default' }, enabled: true },
      { agentId: 'bot2', match: { channel: 'telegram', accountId: 'tg1' }, enabled: true },
      { agentId: 'bot3', match: { channel: 'feishu', accountId: 'rss-bot' }, enabled: false },
    ],
    channels: {
      feishu: {
        enabled: true,
        domain: 'feishu',
        accounts: {
          default: { enabled: true, botName: '主Bot' },
          'rss-bot': { enabled: false, botName: 'RSS' },
        },
      },
      telegram: {
        enabled: false,
        accounts: {},
      },
    },
  };
}

// ============================================================
// SUPPORTED_CHANNEL_TYPES 常量
// ============================================================

describe('SUPPORTED_CHANNEL_TYPES', () => {
  test('包含 22 种渠道类型', () => {
    expect(SUPPORTED_CHANNEL_TYPES).toHaveLength(22);
  });

  test('仅 feishu 的 hasForm 为 true', () => {
    const withForm = SUPPORTED_CHANNEL_TYPES.filter((t) => t.hasForm);
    expect(withForm).toHaveLength(1);
    expect(withForm[0].id).toBe('feishu');
  });

  test('每个条目都有非空的 id 和 name', () => {
    for (const t of SUPPORTED_CHANNEL_TYPES) {
      expect(t.id.length).toBeGreaterThan(0);
      expect(t.name.length).toBeGreaterThan(0);
      expect(typeof t.hasForm).toBe('boolean');
    }
  });
});

// ============================================================
// addChannelToConfig
// ============================================================

describe('addChannelToConfig', () => {
  test('创建初始配置 { enabled: false, accounts: {} }', () => {
    const config = emptyConfig();
    const result = addChannelToConfig(config, 'discord');
    expect(result.channels?.discord).toEqual({ enabled: false, accounts: {} });
  });

  test('不修改原配置对象', () => {
    const config = sampleConfig();
    const original = JSON.parse(JSON.stringify(config));
    addChannelToConfig(config, 'slack');
    expect(config).toEqual(original);
  });

  test('保留已有渠道', () => {
    const config = sampleConfig();
    const result = addChannelToConfig(config, 'slack');
    expect(result.channels?.feishu).toBeDefined();
    expect(result.channels?.telegram).toBeDefined();
    expect(result.channels?.slack).toBeDefined();
  });
});

// ============================================================
// deleteChannelFromConfig
// ============================================================

describe('deleteChannelFromConfig', () => {
  test('移除指定渠道', () => {
    const config = sampleConfig();
    const result = deleteChannelFromConfig(config, 'feishu');
    expect(result.channels?.feishu).toBeUndefined();
  });

  test('同时清理关联的绑定记录', () => {
    const config = sampleConfig();
    const result = deleteChannelFromConfig(config, 'feishu');
    const feishuBindings = result.bindings.filter((b) => b.match.channel === 'feishu');
    expect(feishuBindings).toHaveLength(0);
  });

  test('保留其他渠道和绑定', () => {
    const config = sampleConfig();
    const result = deleteChannelFromConfig(config, 'feishu');
    expect(result.channels?.telegram).toBeDefined();
    const tgBindings = result.bindings.filter((b) => b.match.channel === 'telegram');
    expect(tgBindings).toHaveLength(1);
  });

  test('不修改原配置对象', () => {
    const config = sampleConfig();
    const original = JSON.parse(JSON.stringify(config));
    deleteChannelFromConfig(config, 'feishu');
    expect(config).toEqual(original);
  });
});

// ============================================================
// updateChannelConfig
// ============================================================

describe('updateChannelConfig', () => {
  test('更新顶层字段', () => {
    const config = sampleConfig();
    const result = updateChannelConfig(config, 'feishu', { enabled: false, domain: 'lark' });
    expect(result.channels?.feishu?.enabled).toBe(false);
    expect(result.channels?.feishu?.domain).toBe('lark');
  });

  test('保留 accounts 子对象不变', () => {
    const config = sampleConfig();
    const result = updateChannelConfig(config, 'feishu', { enabled: false });
    expect(result.channels?.feishu?.accounts).toEqual(config.channels?.feishu?.accounts);
  });

  test('即使 updates 中包含 accounts 也不覆盖', () => {
    const config = sampleConfig();
    const result = updateChannelConfig(config, 'feishu', {
      accounts: { hacked: {} },
    });
    expect(result.channels?.feishu?.accounts).toEqual(config.channels?.feishu?.accounts);
  });

  test('其他渠道不受影响', () => {
    const config = sampleConfig();
    const result = updateChannelConfig(config, 'feishu', { enabled: false });
    expect(result.channels?.telegram).toEqual(config.channels?.telegram);
  });
});

// ============================================================
// 账号管理函数
// ============================================================

describe('addAccountToChannel', () => {
  test('创建新账号条目', () => {
    const config = sampleConfig();
    const result = addAccountToChannel(config, 'feishu', 'new-bot', { botName: '新Bot' });
    expect(result.channels?.feishu?.accounts?.['new-bot']).toEqual({ botName: '新Bot' });
  });

  test('不提供 initialConfig 时创建空对象', () => {
    const config = sampleConfig();
    const result = addAccountToChannel(config, 'telegram', 'tg-bot');
    expect(result.channels?.telegram?.accounts?.['tg-bot']).toEqual({});
  });

  test('保留已有账号', () => {
    const config = sampleConfig();
    const result = addAccountToChannel(config, 'feishu', 'new-bot');
    expect(result.channels?.feishu?.accounts?.default).toBeDefined();
    expect(result.channels?.feishu?.accounts?.['rss-bot']).toBeDefined();
  });
});

describe('deleteAccountFromChannel', () => {
  test('移除指定账号', () => {
    const config = sampleConfig();
    const result = deleteAccountFromChannel(config, 'feishu', 'rss-bot');
    expect(result.channels?.feishu?.accounts?.['rss-bot']).toBeUndefined();
  });

  test('保留其他账号', () => {
    const config = sampleConfig();
    const result = deleteAccountFromChannel(config, 'feishu', 'rss-bot');
    expect(result.channels?.feishu?.accounts?.default).toBeDefined();
  });
});

describe('updateAccountConfig', () => {
  test('合并更新账号配置', () => {
    const config = sampleConfig();
    const result = updateAccountConfig(config, 'feishu', 'default', { botName: '更新Bot', streaming: true });
    expect(result.channels?.feishu?.accounts?.default?.botName).toBe('更新Bot');
    expect(result.channels?.feishu?.accounts?.default?.streaming).toBe(true);
    // 保留原有字段
    expect(result.channels?.feishu?.accounts?.default?.enabled).toBe(true);
  });
});

// ============================================================
// 辅助函数
// ============================================================

describe('isSupportedChannelType', () => {
  test('支持的渠道类型返回 true', () => {
    expect(isSupportedChannelType('feishu')).toBe(true);
    expect(isSupportedChannelType('telegram')).toBe(true);
    expect(isSupportedChannelType('discord')).toBe(true);
  });

  test('不支持的渠道类型返回 false', () => {
    expect(isSupportedChannelType('unknown')).toBe(false);
    expect(isSupportedChannelType('')).toBe(false);
  });
});

describe('isAccountIdDuplicate', () => {
  test('已存在的账号 ID 返回 true', () => {
    const config = sampleConfig();
    expect(isAccountIdDuplicate(config, 'feishu', 'default')).toBe(true);
  });

  test('不存在的账号 ID 返回 false', () => {
    const config = sampleConfig();
    expect(isAccountIdDuplicate(config, 'feishu', 'nonexistent')).toBe(false);
  });

  test('渠道不存在时返回 false', () => {
    const config = sampleConfig();
    expect(isAccountIdDuplicate(config, 'unknown', 'default')).toBe(false);
  });
});

describe('computeChannelSummary', () => {
  test('正确计算摘要', () => {
    const config = sampleConfig();
    const summary = computeChannelSummary(config);
    expect(summary.totalChannels).toBe(2);
    expect(summary.enabledChannels).toBe(1); // 仅 feishu enabled
    expect(summary.totalAccounts).toBe(2); // feishu 有 2 个账号
    expect(summary.totalBindings).toBe(3);
  });

  test('空配置返回全零', () => {
    const summary = computeChannelSummary(emptyConfig());
    expect(summary).toEqual({
      totalChannels: 0,
      enabledChannels: 0,
      totalAccounts: 0,
      totalBindings: 0,
    });
  });
});

describe('getChannelBindingCount', () => {
  test('返回指定渠道的绑定数量', () => {
    const config = sampleConfig();
    expect(getChannelBindingCount(config, 'feishu')).toBe(2);
    expect(getChannelBindingCount(config, 'telegram')).toBe(1);
  });

  test('不存在的渠道返回 0', () => {
    const config = sampleConfig();
    expect(getChannelBindingCount(config, 'unknown')).toBe(0);
  });
});
