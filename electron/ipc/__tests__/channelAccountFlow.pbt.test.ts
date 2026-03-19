/**
 * 属性测试：渠道账户配置流程 — IPC 层
 * Feature: setup-channel-account-flow
 *
 * 覆盖属性：
 * - P3: CLI 参数构建正确传递 account-id
 * - P5: 绑定写入使用实际 accountId
 * - P7: 渠道配置合并保留已有账户
 * - P8: 渠道配置写入/读取 round-trip
 * - P9: 飞书账户配置构建完整性
 * - P10: 智能 accountId 回退解析
 * - P11: 绑定去重不变量
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// ── Mock 依赖 ──────────────────────────────────────────────────────────────
vi.mock('electron', () => ({
  default: { ipcMain: { handle: vi.fn() } },
  ipcMain: { handle: vi.fn() },
}));

/** 测试用临时目录（每个测试用例独立） */
let testDir = '';

vi.mock('../settings.js', () => ({
  resolveOpenClawCommand: vi.fn(() => '/usr/local/bin/openclaw'),
  getShellPath: vi.fn(async () => '/usr/local/bin:/usr/bin:/bin'),
  getOpenClawRootDir: vi.fn(() => testDir),
}));

// ── 导入被测模块 ──────────────────────────────────────────────────────────
import { buildChannelAddArgs, fieldIdToCliFlag } from '../../../src/utils/channelOps';
import { buildFeishuAccountConfig } from '../../../src/config/channelAccountFields';
import { writeChannelToConfig, writeBindingToConfig } from '../coreConfig';

// ============================================================================
// 生成器
// ============================================================================

/** 合法 accountId */
const validAccountIdArb = fc.stringMatching(/^[a-zA-Z0-9_-]+$/).filter((s) => s.length > 0);

/** 渠道类型 */
const channelTypeArb = fc.constantFrom('feishu', 'telegram', 'discord', 'slack');

/** camelCase 字段 ID（不含 accountId） */
const fieldIdArb = fc.constantFrom('appId', 'appSecret', 'botName', 'dmPolicy', 'allowFrom');

/** 非空字段值 */
const nonEmptyValueArb = fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0);

// ============================================================================
// P3: CLI 参数构建正确传递 account-id（纯函数，无需文件系统）
// ============================================================================

describe('Feature: setup-channel-account-flow, Property 3: CLI 参数构建正确传递 account-id', () => {
  test('含 accountId 时参数数组应包含 --account-id 且只出现一次', () => {
    fc.assert(
      fc.property(
        channelTypeArb,
        validAccountIdArb,
        fc.dictionary(fieldIdArb, nonEmptyValueArb, { minKeys: 0, maxKeys: 3 }),
        (channelType, accountId, otherFields) => {
          const fieldValues = { ...otherFields, accountId };
          const args = buildChannelAddArgs(channelType, fieldValues);

          // 前缀正确
          expect(args.slice(0, 4)).toEqual(['channels', 'add', '--channel', channelType]);

          // 应包含 --account-id 和对应值
          const aidIdx = args.indexOf('--account-id');
          expect(aidIdx).toBeGreaterThanOrEqual(4);
          expect(args[aidIdx + 1]).toBe(accountId.trim());

          // --account-id 只应出现一次
          const occurrences = args.filter((a) => a === '--account-id').length;
          expect(occurrences).toBe(1);
        },
      ),
      { numRuns: 100 },
    );
  });

  test('不含 accountId 时参数数组不应包含 --account-id', () => {
    fc.assert(
      fc.property(
        channelTypeArb,
        fc.dictionary(fieldIdArb, nonEmptyValueArb, { minKeys: 1, maxKeys: 3 }),
        (channelType, fieldValues) => {
          // 确保没有 accountId 键
          delete (fieldValues as any).accountId;
          const args = buildChannelAddArgs(channelType, fieldValues);
          expect(args.includes('--account-id')).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ============================================================================
// P9: 飞书账户配置构建完整性（纯函数，无需文件系统）
// ============================================================================

describe('Feature: setup-channel-account-flow, Property 9: 飞书账户配置构建完整性', () => {
  test('返回对象应包含所有必需字段，且 appId/appSecret 与输入一致', () => {
    fc.assert(
      fc.property(
        nonEmptyValueArb,
        nonEmptyValueArb,
        fc.option(nonEmptyValueArb, { nil: undefined }),
        (appId, appSecret, botName) => {
          const fieldValues: Record<string, string> = {
            appId,
            appSecret,
            ...(botName ? { botName } : {}),
          };
          const config = buildFeishuAccountConfig(fieldValues);

          // 必需字段存在
          expect(config.enabled).toBe(true);
          expect(config.domain).toBe('feishu');
          expect(config.appId).toBe(appId);
          expect(config.appSecret).toBe(appSecret);
          expect(config.dmPolicy).toBeDefined();
          expect(config.allowFrom).toBeDefined();
          expect(Array.isArray(config.allowFrom)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ============================================================================
// 文件系统测试（P5, P7, P8, P10, P11）
// ============================================================================

describe('文件系统属性测试', () => {
  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openclaw-test-acctflow-'));
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // 清理失败不阻断测试
    }
  });

  /** 写入初始配置文件 */
  async function writeConfig(config: Record<string, unknown>): Promise<void> {
    await fs.writeFile(
      path.join(testDir, 'openclaw.json'),
      JSON.stringify(config, null, 2),
    );
  }

  /** 读取配置文件 */
  async function readConfig(): Promise<Record<string, unknown>> {
    const raw = await fs.readFile(path.join(testDir, 'openclaw.json'), 'utf-8');
    return JSON.parse(raw);
  }

  // ========================================================================
  // P5: 绑定写入使用实际 accountId
  // ========================================================================

  test('Feature: setup-channel-account-flow, Property 5: 传入的 accountId 在渠道配置中存在时应写入该 accountId', async () => {
    // 使用固定种子确保可复现
    const agentIds = ['agent-a', 'agent-b', 'agent-c'];
    const channels = ['feishu', 'telegram', 'discord'];
    const accountIds = ['bot-1', 'bot-2', 'my-account'];

    for (let i = 0; i < agentIds.length; i++) {
      const agentId = agentIds[i];
      const channelKey = channels[i];
      const accountId = accountIds[i];

      await writeConfig({
        channels: {
          [channelKey]: {
            accounts: { [accountId]: { enabled: true } },
          },
        },
        bindings: [],
      });

      const result = await writeBindingToConfig(agentId, channelKey, accountId);
      expect(result.success).toBe(true);

      const config = await readConfig();
      const bindings = config.bindings as any[];
      const found = bindings.find(
        (b) => b.agentId === agentId && b.match?.channel === channelKey,
      );
      expect(found).toBeDefined();
      expect(found.match.accountId).toBe(accountId);
    }
  });


  // ========================================================================
  // P7: 渠道配置合并保留已有账户
  // ========================================================================

  test('Feature: setup-channel-account-flow, Property 7: 写入新账户后已有账户应全部保留', async () => {
    const channelKey = 'feishu';
    const existingIds = ['bot-alpha', 'bot-beta'];
    const newId = 'bot-gamma';

    // 构建已有配置
    const existingAccounts: Record<string, unknown> = {};
    for (const id of existingIds) {
      existingAccounts[id] = { enabled: true, domain: channelKey };
    }

    await writeConfig({
      channels: { [channelKey]: { accounts: existingAccounts } },
      bindings: [],
    });

    // 写入新账户
    await writeChannelToConfig(channelKey, {
      accounts: { [newId]: { enabled: true, domain: channelKey } },
    });

    const config = await readConfig();
    const channelConf = (config.channels as any)?.[channelKey];
    const accounts = channelConf?.accounts || {};

    // 已有账户应全部保留
    for (const id of existingIds) {
      expect(accounts[id]).toBeDefined();
    }
    // 新账户应存在
    expect(accounts[newId]).toBeDefined();
    // 总数应为 existingIds.length + 1
    expect(Object.keys(accounts).length).toBe(existingIds.length + 1);
  });

  // ========================================================================
  // P8: 渠道配置写入/读取 round-trip
  // ========================================================================

  test('Feature: setup-channel-account-flow, Property 8: 写入后读取应产生等价的配置对象', async () => {
    const testCases = [
      { channelKey: 'feishu', accountId: 'my-bot', enabled: true },
      { channelKey: 'telegram', accountId: 'tg-bot-1', enabled: false },
      { channelKey: 'discord', accountId: 'dc-helper', enabled: true },
    ];

    for (const { channelKey, accountId, enabled } of testCases) {
      await writeConfig({ channels: {}, bindings: [] });

      const accountConfig = { enabled, domain: channelKey };
      await writeChannelToConfig(channelKey, {
        accounts: { [accountId]: accountConfig },
      });

      const config = await readConfig();
      const readBack = (config.channels as any)?.[channelKey]?.accounts?.[accountId];
      expect(readBack).toBeDefined();
      expect(readBack.enabled).toBe(enabled);
      expect(readBack.domain).toBe(channelKey);
    }
  });

  // ========================================================================
  // P10: 智能 accountId 回退解析
  // ========================================================================

  test('Feature: setup-channel-account-flow, Property 10: 不存在的 accountId 应回退到第一个可用账户', async () => {
    const channelKey = 'feishu';
    const existingAccountId = 'real-bot';
    const nonExistentId = 'ghost-bot';

    await writeConfig({
      channels: {
        [channelKey]: {
          accounts: { [existingAccountId]: { enabled: true } },
        },
      },
      bindings: [],
    });

    const result = await writeBindingToConfig('agent-x', channelKey, nonExistentId);
    expect(result.success).toBe(true);

    const config = await readConfig();
    const bindings = config.bindings as any[];
    const found = bindings.find((b) => b.agentId === 'agent-x');
    expect(found).toBeDefined();
    // 应回退到第一个可用账户
    expect(found.match.accountId).toBe(existingAccountId);
  });

  // ========================================================================
  // P11: 绑定去重不变量
  // ========================================================================

  test('Feature: setup-channel-account-flow, Property 11: 重复调用相同参数 bindings 无重复', async () => {
    const channelKey = 'telegram';
    const accountId = 'my-tg-bot';
    const agentId = 'agent-dedup';

    await writeConfig({
      channels: {
        [channelKey]: {
          accounts: { [accountId]: { enabled: true } },
        },
      },
      bindings: [],
    });

    // 重复调用 5 次
    for (let i = 0; i < 5; i++) {
      await writeBindingToConfig(agentId, channelKey, accountId);
    }

    const config = await readConfig();
    const bindings = config.bindings as any[];
    const matches = bindings.filter(
      (b) =>
        b.agentId === agentId &&
        b.match?.channel === channelKey &&
        b.match?.accountId === accountId,
    );
    // 该组合应只出现一次
    expect(matches.length).toBe(1);
  });
});
