/**
 * 属性测试：渠道账户配置与绑定流程 Bugfix - Bug Condition 探索
 * Feature: setup-channel-account-binding-fix
 * 覆盖 Property 1: Bug Condition — 渠道配置覆盖与导航数据丢失
 *
 * 本测试编码的是 **期望行为（正确行为）**：
 * - writeChannelToConfig 应深度合并而非整体覆盖，保留已有的 token 等字段
 * - getAccountFields("feishu_bot") 应通过规范化映射返回飞书专有字段
 * - bind-channels 的 shouldSkipStep 应与 channel-accounts 使用一致的跳过条件
 * - writeChannelToConfig 写入前应创建 .bak 备份文件
 *
 * 在未修复代码上运行时，测试应 **失败**（证明 bug 存在）。
 * 修复后运行时，测试应 **通过**（证明 bug 已修复）。
 *
 * **Validates: Requirements 1.1, 1.3, 1.4, 1.5**
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as os from 'os';

// ── Mock 依赖：阻止 electron 和 electron-store 在测试环境中初始化 ──────
vi.mock('electron', () => ({
  default: { ipcMain: { handle: vi.fn() } },
  ipcMain: { handle: vi.fn() },
}));

vi.mock('../settings.js', () => ({
  resolveOpenClawCommand: vi.fn(() => '/usr/local/bin/openclaw'),
  getShellPath: vi.fn(async () => '/usr/local/bin:/usr/bin:/bin'),
  getOpenClawRootDir: vi.fn(() => '/tmp/.openclaw-test-binding'),
}));

// ── 导入被测模块 ──────────────────────────────────────────────────────────
import { writeChannelToConfig } from '../coreConfig';
import { getAccountFields } from '../../../src/config/channelAccountFields';
import { shouldSkipStep } from '../../../src/contexts/setupNavigationGraph';
import { initialSetupState } from '../../../src/contexts/setupReducer';
import type { SetupState } from '../../../src/contexts/setupReducer';

// ============================================================================
// 生成器（Arbitraries）
// ============================================================================

/**
 * 生成合法的渠道名称
 */
const channelKeyArb = (): fc.Arbitrary<string> =>
  fc.constantFrom('feishu', 'telegram', 'discord', 'slack');

/**
 * 生成随机 token 字符串（模拟 CLI 写入的 token）
 */
const tokenArb = (): fc.Arbitrary<string> =>
  fc.string({ minLength: 10, maxLength: 64 }).filter((s) => s.trim().length > 0);

/**
 * 生成随机 webhook URL
 */
const webhookUrlArb = (): fc.Arbitrary<string> =>
  fc.constantFrom(
    'https://hooks.example.com/abc123',
    'https://api.feishu.cn/webhook/v2/xxx',
    'https://discord.com/api/webhooks/123/abc',
  );

/**
 * 生成包含 token 和其他 CLI 写入字段的渠道配置
 * 模拟 addEnabledChannels() 通过 CLI 写入的完整配置
 */
const existingChannelConfigArb = (): fc.Arbitrary<Record<string, unknown>> =>
  fc.tuple(tokenArb(), webhookUrlArb(), fc.boolean()).map(([token, webhookUrl, enabled]) => ({
    enabled,
    token,
    webhookUrl,
    transport: 'websocket',
  }));

/**
 * 生成仅含 accounts 的渠道配置
 * 模拟 saveChannelAccountConfigs() 构建的配置
 */
const accountsOnlyConfigArb = (): fc.Arbitrary<Record<string, unknown>> =>
  fc.tuple(
    fc.constantFrom('my-bot', 'default', 'prod-bot'),
    fc.record({
      appId: fc.string({ minLength: 5, maxLength: 20 }),
      appSecret: fc.string({ minLength: 10, maxLength: 40 }),
    }),
  ).map(([accountId, accountData]) => ({
    enabled: true,
    accounts: {
      [accountId]: {
        enabled: true,
        ...accountData,
      },
    },
  }));

/**
 * 生成带 _bot 后缀的 channelKey（模拟 CLI 返回的 key）
 */
const botSuffixChannelKeyArb = (): fc.Arbitrary<string> =>
  fc.constantFrom('feishu_bot', 'telegram_bot', 'discord_bot', 'slack_bot');

/**
 * 生成 ChannelAddResult 数组，所有条目 success 均为 false
 * 模拟所有渠道添加失败的场景
 */
const allFailedAddResultsArb = (): fc.Arbitrary<Array<{ channelKey: string; channelLabel: string; success: false; error: string }>> =>
  fc.array(
    fc.tuple(
      channelKeyArb(),
      fc.constantFrom('Feishu', 'Telegram', 'Discord', 'Slack'),
      fc.constantFrom('连接超时', 'Token 无效', '网络错误'),
    ).map(([channelKey, channelLabel, error]) => ({
      channelKey,
      channelLabel,
      success: false as const,
      error,
    })),
    { minLength: 1, maxLength: 5 },
  );

// ============================================================================
// 测试辅助
// ============================================================================

/** 测试用临时目录 */
let testDir: string;

beforeEach(async () => {
  // 创建临时测试目录
  testDir = path.join(os.tmpdir(), `openclaw-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await fs.mkdir(testDir, { recursive: true });
});

afterEach(async () => {
  // 清理临时目录
  try {
    await fs.rm(testDir, { recursive: true, force: true });
  } catch {
    // 忽略清理失败
  }
});

// ============================================================================
// Property 1: Bug Condition — 渠道配置覆盖与导航数据丢失
// Feature: setup-channel-account-binding-fix
// ============================================================================

describe('Feature: setup-channel-account-binding-fix, Property 1: Bug Condition 探索', () => {

  // ── Bug 条件 1: writeChannelToConfig 覆盖已有渠道配置 ──────────────────

  /**
   * Validates: Requirements 1.1
   *
   * 属性测试：先写入含 token 的渠道配置，再调用 writeChannelToConfig
   * 写入仅含 accounts 的配置，断言 token 字段应保留。
   *
   * 在未修复代码上：writeChannelToConfig 使用整体赋值
   * config.channels[channelKey] = channelConfig，token 被丢失
   * → 测试失败 → 证明 bug 存在
   */
  test('Bug 条件 1: writeChannelToConfig 应深度合并，保留已有 token 字段', async () => {
    // 使用真实文件系统测试 writeChannelToConfig 的行为
    const { getOpenClawRootDir } = await import('../settings.js');
    vi.mocked(getOpenClawRootDir).mockReturnValue(testDir);

    await fc.assert(
      fc.asyncProperty(
        channelKeyArb(),
        existingChannelConfigArb(),
        accountsOnlyConfigArb(),
        async (channelKey, existingConfig, accountsConfig) => {
          // 步骤 1：先写入含 token 的完整渠道配置（模拟 CLI 写入）
          const firstResult = await writeChannelToConfig(channelKey, existingConfig);
          expect(firstResult.success).toBe(true);

          // 步骤 2：再写入仅含 accounts 的配置（模拟 saveChannelAccountConfigs）
          const secondResult = await writeChannelToConfig(channelKey, accountsConfig);
          expect(secondResult.success).toBe(true);

          // 步骤 3：读取最终配置文件，验证 token 字段是否保留
          const configPath = path.join(testDir, 'openclaw.json');
          const finalContent = await fs.readFile(configPath, 'utf8');
          const finalConfig = JSON.parse(finalContent);

          // 期望行为：token 字段应保留（深度合并）
          // 未修复代码：token 被整体覆盖丢失
          expect(finalConfig.channels[channelKey].token).toBe(existingConfig.token);
          expect(finalConfig.channels[channelKey].webhookUrl).toBe(existingConfig.webhookUrl);

          // accounts 数据也应存在
          expect(finalConfig.channels[channelKey].accounts).toBeDefined();
        },
      ),
      { numRuns: 20 },
    );
  });

  /**
   * Validates: Requirements 1.1
   *
   * 具体案例：飞书渠道 token 被覆盖的典型场景
   */
  test('Bug 条件 1 案例: 飞书渠道 token 在写入 accounts 后应保留', async () => {
    const { getOpenClawRootDir } = await import('../settings.js');
    vi.mocked(getOpenClawRootDir).mockReturnValue(testDir);

    // 步骤 1：CLI 写入含 token 的飞书配置
    const cliConfig = {
      enabled: true,
      token: 'feishu-app-token-xxx-123',
      webhookUrl: 'https://api.feishu.cn/webhook/v2/abc',
      transport: 'websocket',
    };
    await writeChannelToConfig('feishu', cliConfig);

    // 步骤 2：saveChannelAccountConfigs 写入仅含 accounts 的配置
    const accountConfig = {
      enabled: true,
      accounts: {
        'my-bot': {
          enabled: true,
          appId: 'cli_abc123',
          appSecret: 'secret_xyz789',
          dmPolicy: 'open',
        },
      },
    };
    await writeChannelToConfig('feishu', accountConfig);

    // 步骤 3：验证 token 是否保留
    const configPath = path.join(testDir, 'openclaw.json');
    const content = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(content);

    // 期望：token 和 webhookUrl 应保留
    expect(config.channels.feishu.token).toBe('feishu-app-token-xxx-123');
    expect(config.channels.feishu.webhookUrl).toBe('https://api.feishu.cn/webhook/v2/abc');
    // accounts 也应存在
    expect(config.channels.feishu.accounts['my-bot'].appId).toBe('cli_abc123');
  });

  // ── Bug 条件 3: channelKey 不匹配字段定义 ──────────────────────────────

  /**
   * Validates: Requirements 1.3
   *
   * 属性测试：使用带 _bot 后缀的 channelKey 调用 getAccountFields，
   * 断言应返回对应渠道的专有字段而非默认的仅含 accountId 的字段。
   *
   * 在未修复代码上：getAccountFields("feishu_bot") 在 channelAccountFields
   * 中找不到 "feishu_bot" key，走默认分支返回仅含 accountId 的字段
   * → 测试失败 → 证明 bug 存在
   */
  test('Bug 条件 3: getAccountFields 应对 _bot 后缀的 channelKey 返回专有字段', () => {
    fc.assert(
      fc.property(
        botSuffixChannelKeyArb(),
        (botKey) => {
          // 获取带 _bot 后缀的 key 对应的字段
          const fields = getAccountFields(botKey);

          // 期望行为：应返回对应渠道的专有字段（不仅仅是默认的 accountId）
          // 对于 feishu_bot，应返回 appId、appSecret 等飞书专有字段
          // 未修复代码：返回默认的仅含 accountId 的字段
          const baseKey = botKey.replace(/_bot$/, '');

          if (baseKey === 'feishu') {
            // 飞书应有 appId、appSecret 等专有字段
            const fieldIds = fields.map((f) => f.id);
            expect(fieldIds).toContain('appId');
            expect(fieldIds).toContain('appSecret');
            expect(fields.length).toBeGreaterThan(1);
          } else {
            // 其他渠道至少应有 accountId 字段
            expect(fields.length).toBeGreaterThanOrEqual(1);
          }
        },
      ),
      { numRuns: 20 },
    );
  });

  /**
   * Validates: Requirements 1.3
   *
   * 具体案例：feishu_bot 应返回飞书专有字段
   */
  test('Bug 条件 3 案例: feishu_bot 应返回飞书专有字段而非默认字段', () => {
    const fields = getAccountFields('feishu_bot');
    const fieldIds = fields.map((f) => f.id);

    // 期望：应包含飞书专有字段
    expect(fieldIds).toContain('appId');
    expect(fieldIds).toContain('appSecret');
    expect(fieldIds).toContain('dmPolicy');

    // 不应仅有一个默认的 accountId 字段
    expect(fields.length).toBeGreaterThan(1);
  });

  // ── Bug 条件 4: 导航图跳过条件不一致 ──────────────────────────────────

  /**
   * Validates: Requirements 1.4
   *
   * 属性测试：构造所有渠道添加失败的状态（addResults 有记录但 success 均为 false），
   * 但 agent 已创建。新逻辑下 bind-channels 的 skip 仅检查 agent 是否存在，
   * 不再检查 addResults。agent 存在时不跳过，由页面通过 IPC 查询绑定状态。
   */
  test('Bug 条件 4: agent 已创建时 bind-channels 不跳过（页面通过 IPC 判断绑定状态）', () => {
    fc.assert(
      fc.property(
        allFailedAddResultsArb(),
        (failedResults) => {
          // 构造状态：addResults 有记录但 success 均为 false，agent 已创建
          const state: SetupState = {
            ...initialSetupState,
            mode: 'local',
            channels: {
              ...initialSetupState.channels,
              addResults: failedResults,
            },
            agent: {
              ...initialSetupState.agent,
              created: { id: 'test-agent', name: 'Test Agent' },
            },
          };

          // 新逻辑：skip 仅检查 agent 是否存在，agent 存在则不跳过
          // 页面自身通过 IPC 查询 openclaw.json 判断是否需要绑定
          const bindChannelsSkip = shouldSkipStep('/setup/local/bind-channels', state);
          expect(bindChannelsSkip).toBe(false);
        },
      ),
      { numRuns: 20 },
    );
  });

  /**
   * Validates: Requirements 1.4
   *
   * 具体案例：3 个渠道全部失败但 agent 已创建时，bind-channels 不跳过
   * 页面通过 IPC 查询 openclaw.json 判断是否需要绑定
   */
  test('Bug 条件 4 案例: agent 已创建时即使渠道全部失败 bind-channels 也不跳过', () => {
    const state: SetupState = {
      ...initialSetupState,
      mode: 'local',
      channels: {
        ...initialSetupState.channels,
        addResults: [
          { channelKey: 'feishu', channelLabel: 'Feishu', success: false, error: 'Token 无效' },
          { channelKey: 'telegram', channelLabel: 'Telegram', success: false, error: '连接超时' },
          { channelKey: 'discord', channelLabel: 'Discord', success: false, error: '网络错误' },
        ],
      },
      agent: {
        ...initialSetupState.agent,
        created: { id: 'main', name: 'Main Agent' },
      },
    };

    // 新逻辑：agent 存在则不跳过，页面自行通过 IPC 判断绑定状态
    expect(shouldSkipStep('/setup/local/bind-channels', state)).toBe(false);
  });

  // ── Bug 条件 5: 配置写入无备份机制 ──────────────────────────────────────

  /**
   * Validates: Requirements 1.5
   *
   * 属性测试：调用 writeChannelToConfig 写入配置后，
   * 断言写入前应创建 .bak 备份文件。
   *
   * 在未修复代码上：writeChannelToConfig 直接写入，无备份机制
   * → 测试失败 → 证明 bug 存在
   */
  test('Bug 条件 5: writeChannelToConfig 写入前应创建 .bak 备份文件', async () => {
    const { getOpenClawRootDir } = await import('../settings.js');
    vi.mocked(getOpenClawRootDir).mockReturnValue(testDir);

    await fc.assert(
      fc.asyncProperty(
        channelKeyArb(),
        existingChannelConfigArb(),
        accountsOnlyConfigArb(),
        async (channelKey, existingConfig, accountsConfig) => {
          // 步骤 1：先写入初始配置
          await writeChannelToConfig(channelKey, existingConfig);

          // 步骤 2：再次写入（此时应创建备份）
          await writeChannelToConfig(channelKey, accountsConfig);

          // 步骤 3：检查 .bak 备份文件是否存在
          const configPath = path.join(testDir, 'openclaw.json');
          const backupPath = `${configPath}.bak`;

          // 期望行为：备份文件应存在
          // 未修复代码：无备份机制，.bak 文件不存在
          let backupExists = false;
          try {
            await fs.access(backupPath);
            backupExists = true;
          } catch {
            backupExists = false;
          }

          expect(backupExists).toBe(true);

          // 备份文件内容应是写入前的配置
          if (backupExists) {
            const backupContent = await fs.readFile(backupPath, 'utf8');
            const backupConfig = JSON.parse(backupContent);
            // 备份应包含第一次写入的 token
            expect(backupConfig.channels[channelKey].token).toBe(existingConfig.token);
          }
        },
      ),
      { numRuns: 10 },
    );
  });

  /**
   * Validates: Requirements 1.5
   *
   * 具体案例：写入飞书配置后应存在 .bak 备份
   */
  test('Bug 条件 5 案例: 写入飞书配置后应存在 openclaw.json.bak 备份', async () => {
    const { getOpenClawRootDir } = await import('../settings.js');
    vi.mocked(getOpenClawRootDir).mockReturnValue(testDir);

    // 先写入初始配置
    await writeChannelToConfig('feishu', {
      enabled: true,
      token: 'original-token-123',
    });

    // 再次写入（应触发备份）
    await writeChannelToConfig('feishu', {
      enabled: true,
      accounts: { 'my-bot': { enabled: true, appId: 'app123' } },
    });

    // 检查备份文件
    const configPath = path.join(testDir, 'openclaw.json');
    const backupPath = `${configPath}.bak`;

    let backupExists = false;
    try {
      await fs.access(backupPath);
      backupExists = true;
    } catch {
      backupExists = false;
    }

    // 期望：备份文件应存在
    expect(backupExists).toBe(true);
  });
});
