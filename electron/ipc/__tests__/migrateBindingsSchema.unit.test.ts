/**
 * 单元测试：migrateBindingsSchema() 纯函数
 * 验证 bindings.match schema 迁移逻辑的正确性
 */

import { describe, test, expect, vi } from 'vitest';

// ── Mock 依赖：阻止 electron 和 electron-store 在测试环境中初始化 ──────
vi.mock('electron', () => ({
  default: { ipcMain: { handle: vi.fn() } },
  ipcMain: { handle: vi.fn() },
}));

vi.mock('../settings.js', () => ({
  resolveOpenClawCommand: vi.fn(() => '/usr/local/bin/openclaw'),
  getShellPath: vi.fn(async () => '/usr/local/bin:/usr/bin:/bin'),
  getOpenClawRootDir: vi.fn(() => '/tmp/.openclaw'),
}));

import { migrateBindingsSchema } from '../coreConfig';

describe('migrateBindingsSchema()', () => {

  // ── 移除 peer 空对象 ──

  test('移除 match.peer 空对象 {}', () => {
    const config = {
      bindings: [
        { agentId: 'main', match: { channel: 'telegram', accountId: 'default', peer: {} } },
      ],
    };
    const result = migrateBindingsSchema(config);
    expect(result.bindings[0].match.peer).toBeUndefined();
    expect(result.bindings[0].match.channel).toBe('telegram');
    expect(result.bindings[0].match.accountId).toBe('default');
  });

  test('移除 match.peer 为 null', () => {
    const config = {
      bindings: [
        { agentId: 'main', match: { channel: 'discord', accountId: 'default', peer: null } },
      ],
    };
    const result = migrateBindingsSchema(config);
    expect(result.bindings[0].match.peer).toBeUndefined();
  });

  test('移除 match.peer 为 undefined', () => {
    const config = {
      bindings: [
        { agentId: 'main', match: { channel: 'slack', accountId: 'default', peer: undefined } },
      ],
    };
    const result = migrateBindingsSchema(config);
    expect(result.bindings[0].match.peer).toBeUndefined();
  });

  test('保留非空 peer 对象', () => {
    const config = {
      bindings: [
        { agentId: 'main', match: { channel: 'telegram', accountId: 'default', peer: { id: '123' } } },
      ],
    };
    const result = migrateBindingsSchema(config);
    expect(result.bindings[0].match.peer).toEqual({ id: '123' });
  });

  // ── 移除已废弃字段 ──

  test('移除 match.dmScope 已废弃字段', () => {
    const config = {
      bindings: [
        { agentId: 'main', match: { channel: 'discord', accountId: 'default', dmScope: 'all' } },
      ],
    };
    const result = migrateBindingsSchema(config);
    expect(result.bindings[0].match.dmScope).toBeUndefined();
    expect(result.bindings[0].match.channel).toBe('discord');
  });

  test('移除 match.guildId 已废弃字段', () => {
    const config = {
      bindings: [
        { agentId: 'main', match: { channel: 'discord', accountId: 'default', guildId: 'g123' } },
      ],
    };
    const result = migrateBindingsSchema(config);
    expect(result.bindings[0].match.guildId).toBeUndefined();
  });

  test('移除 match.teamId 已废弃字段', () => {
    const config = {
      bindings: [
        { agentId: 'main', match: { channel: 'slack', accountId: 'default', teamId: 't456' } },
      ],
    };
    const result = migrateBindingsSchema(config);
    expect(result.bindings[0].match.teamId).toBeUndefined();
  });

  test('同时移除多个废弃字段和空 peer', () => {
    const config = {
      bindings: [
        {
          agentId: 'main',
          match: {
            channel: 'discord',
            accountId: 'default',
            peer: {},
            dmScope: 'contacts',
            guildId: 'g789',
            teamId: 't012',
          },
        },
      ],
    };
    const result = migrateBindingsSchema(config);
    const match = result.bindings[0].match;
    expect(match.peer).toBeUndefined();
    expect(match.dmScope).toBeUndefined();
    expect(match.guildId).toBeUndefined();
    expect(match.teamId).toBeUndefined();
    expect(match.channel).toBe('discord');
    expect(match.accountId).toBe('default');
  });

  // ── 保留有效字段 ──

  test('保留 match.channel 和 match.accountId', () => {
    const config = {
      bindings: [
        { agentId: 'bot-1', match: { channel: 'whatsapp', accountId: 'prod' } },
      ],
    };
    const result = migrateBindingsSchema(config);
    expect(result.bindings[0].match.channel).toBe('whatsapp');
    expect(result.bindings[0].match.accountId).toBe('prod');
    expect(result.bindings[0].agentId).toBe('bot-1');
  });

  // ── 纯函数：不修改输入 ──

  test('不修改原始输入对象', () => {
    const config = {
      bindings: [
        { agentId: 'main', match: { channel: 'telegram', accountId: 'default', peer: {} } },
      ],
    };
    const originalJson = JSON.stringify(config);
    migrateBindingsSchema(config);
    expect(JSON.stringify(config)).toBe(originalJson);
  });

  // ── 幂等性 ──

  test('多次调用结果一致（幂等）', () => {
    const config = {
      bindings: [
        { agentId: 'main', match: { channel: 'telegram', accountId: 'default', peer: {}, dmScope: 'all' } },
      ],
    };
    const first = migrateBindingsSchema(config);
    const second = migrateBindingsSchema(first);
    const third = migrateBindingsSchema(second);
    expect(second).toEqual(first);
    expect(third).toEqual(first);
  });

  // ── 边界情况 ──

  test('空配置对象', () => {
    const result = migrateBindingsSchema({});
    expect(result).toEqual({});
  });

  test('bindings 为空数组', () => {
    const config = { bindings: [] };
    const result = migrateBindingsSchema(config);
    expect(result.bindings).toEqual([]);
  });

  test('bindings 不是数组', () => {
    const config = { bindings: 'invalid' };
    const result = migrateBindingsSchema(config);
    expect(result.bindings).toBe('invalid');
  });

  test('binding 没有 match 字段', () => {
    const config = {
      bindings: [{ agentId: 'main' }],
    };
    const result = migrateBindingsSchema(config);
    expect(result.bindings[0]).toEqual({ agentId: 'main' });
  });

  test('保留配置中的其他顶层字段', () => {
    const config = {
      gateway: { port: 8080, mode: 'local' },
      bindings: [
        { agentId: 'main', match: { channel: 'telegram', accountId: 'default', peer: {} } },
      ],
      agents: { list: [{ id: 'main' }] },
    };
    const result = migrateBindingsSchema(config);
    expect(result.gateway).toEqual({ port: 8080, mode: 'local' });
    expect(result.agents).toEqual({ list: [{ id: 'main' }] });
    expect(result.bindings[0].match.peer).toBeUndefined();
  });

  test('处理多个 binding 条目', () => {
    const config = {
      bindings: [
        { agentId: 'main', match: { channel: 'telegram', accountId: 'default', peer: {} } },
        { agentId: 'bot-1', match: { channel: 'discord', accountId: 'prod', dmScope: 'all' } },
        { agentId: 'bot-2', match: { channel: 'slack', accountId: 'test' } },
      ],
    };
    const result = migrateBindingsSchema(config);
    // 第一个：peer 被移除
    expect(result.bindings[0].match.peer).toBeUndefined();
    expect(result.bindings[0].match.channel).toBe('telegram');
    // 第二个：dmScope 被移除
    expect(result.bindings[1].match.dmScope).toBeUndefined();
    expect(result.bindings[1].match.channel).toBe('discord');
    // 第三个：已兼容，不变
    expect(result.bindings[2].match.channel).toBe('slack');
    expect(result.bindings[2].match.accountId).toBe('test');
  });
});
