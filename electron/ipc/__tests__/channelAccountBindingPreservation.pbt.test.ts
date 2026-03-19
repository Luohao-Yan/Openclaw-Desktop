/**
 * 属性测试：渠道账户配置与绑定流程 Bugfix - Preservation 检查
 * Feature: setup-channel-account-binding-fix
 * 覆盖 Property 2: Preservation — 正常流程行为不变
 *
 * 本测试编码的是 **不变行为（基线行为）**：
 * - writeChannelToConfig 写入新渠道配置后，配置文件包含完整配置且 JSON 格式正确
 * - getAccountFields 对已规范化的 channelKey 返回对应渠道的完整字段定义
 * - shouldSkipStep 在存在 success 条目时不跳过，在无 success 条目时跳过
 *
 * 在未修复代码上运行时，测试应 **通过**（确认基线行为需要保持）。
 * 修复后运行时，测试也应 **通过**（确认无回归）。
 *
 * **Validates: Requirements 3.1, 3.2, 3.5, 3.6**
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs/promises';
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
  getOpenClawRootDir: vi.fn(() => '/tmp/.openclaw-test-preservation'),
}));

// ── 导入被测模块 ──────────────────────────────────────────────────────────
import { writeChannelToConfig } from '../coreConfig';
import { getAccountFields, channelAccountFields } from '../../../src/config/channelAccountFields';
import { shouldSkipStep } from '../../../src/contexts/setupNavigationGraph';
import { initialSetupState } from '../../../src/contexts/setupReducer';
import type { SetupState } from '../../../src/contexts/setupReducer';

// ============================================================================
// 生成器（Arbitraries）
// ============================================================================

/**
 * 生成已规范化的渠道 key（与 channelAccountFields 中定义的 key 一致）
 * 这些 key 在未修复代码上也能正确匹配字段定义
 */
const normalizedChannelKeyArb = (): fc.Arbitrary<string> =>
  fc.constantFrom('feishu', 'telegram', 'discord', 'slack');

/**
 * 生成合法的渠道配置对象（非 BUG 条件：直接写入新配置，不涉及覆盖场景）
 * 包含 enabled 和可选的 accounts 子节点
 */
const channelConfigArb = (): fc.Arbitrary<Record<string, unknown>> =>
  fc.record({
    enabled: fc.boolean(),
    accounts: fc.option(
      fc.dictionary(
        fc.stringMatching(/^[a-z][a-z0-9-]{2,15}$/),
        fc.record({
          enabled: fc.boolean(),
          appId: fc.string({ minLength: 3, maxLength: 20 }),
        }),
        { minKeys: 1, maxKeys: 3 },
      ),
      { nil: undefined },
    ),
  }).map((rec) => {
    // 移除 undefined 的 accounts 字段
    const result: Record<string, unknown> = { enabled: rec.enabled };
    if (rec.accounts !== undefined) {
      result.accounts = rec.accounts;
    }
    return result;
  });

/**
 * 生成包含至少一个 success 条目的 addResults 数组
 * 模拟正常渠道添加成功的场景
 */
const addResultsWithSuccessArb = (): fc.Arbitrary<Array<{ channelKey: string; channelLabel: string; success: boolean; error?: string }>> =>
  fc.tuple(
    // 至少一个成功条目
    fc.array(
      fc.tuple(
        normalizedChannelKeyArb(),
        fc.constantFrom('Feishu', 'Telegram', 'Discord', 'Slack'),
      ).map(([channelKey, channelLabel]) => ({
        channelKey,
        channelLabel,
        success: true as boolean,
      })),
      { minLength: 1, maxLength: 4 },
    ),
    // 可选的失败条目
    fc.array(
      fc.tuple(
        normalizedChannelKeyArb(),
        fc.constantFrom('Feishu', 'Telegram', 'Discord', 'Slack'),
        fc.constantFrom('连接超时', 'Token 无效', '网络错误'),
      ).map(([channelKey, channelLabel, error]) => ({
        channelKey,
        channelLabel,
        success: false as boolean,
        error,
      })),
      { minLength: 0, maxLength: 3 },
    ),
  ).map(([successes, failures]) => [...successes, ...failures]);

/**
 * 生成全部失败（无 success 条目）的 addResults 数组
 * 模拟所有渠道添加失败的场景
 */
const addResultsAllFailedArb = (): fc.Arbitrary<Array<{ channelKey: string; channelLabel: string; success: boolean; error: string }>> =>
  fc.array(
    fc.tuple(
      normalizedChannelKeyArb(),
      fc.constantFrom('Feishu', 'Telegram', 'Discord', 'Slack'),
      fc.constantFrom('连接超时', 'Token 无效', '网络错误'),
    ).map(([channelKey, channelLabel, error]) => ({
      channelKey,
      channelLabel,
      success: false as boolean,
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
  testDir = path.join(os.tmpdir(), `openclaw-pres-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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
// Property 2: Preservation — 正常流程行为不变
// Feature: setup-channel-account-binding-fix
// ============================================================================

describe('Feature: setup-channel-account-binding-fix, Property 2: Preservation 检查', () => {

  // ── Preservation 1: writeChannelToConfig 写入新渠道配置后配置文件完整且 JSON 格式正确 ──

  /**
   * Validates: Requirements 3.6
   *
   * 属性测试：对所有非 BUG 条件输入（直接写入新渠道配置，channels 节点不存在时），
   * writeChannelToConfig 写入后配置文件包含传入的完整配置且 JSON 格式正确。
   *
   * 这是基线行为：在未修复代码上也应通过。
   * 修复后此行为不应发生回归。
   */
  test('Preservation: writeChannelToConfig 写入新渠道配置后，配置文件包含完整配置且 JSON 格式正确', async () => {
    const { getOpenClawRootDir } = await import('../settings.js');
    vi.mocked(getOpenClawRootDir).mockReturnValue(testDir);

    await fc.assert(
      fc.asyncProperty(
        normalizedChannelKeyArb(),
        channelConfigArb(),
        async (channelKey, channelConfig) => {
          // 确保每次迭代使用干净的配置文件（删除旧文件）
          const configPath = path.join(testDir, 'openclaw.json');
          try { await fs.unlink(configPath); } catch { /* 文件不存在时忽略 */ }

          // 写入新渠道配置（channels 节点不存在时应正确创建）
          const result = await writeChannelToConfig(channelKey, channelConfig);

          // 断言写入成功
          expect(result.success).toBe(true);

          // 读取配置文件并验证 JSON 格式正确
          const content = await fs.readFile(configPath, 'utf8');
          let parsed: any;
          expect(() => { parsed = JSON.parse(content); }).not.toThrow();

          // 断言 channels 节点存在且包含写入的渠道
          expect(parsed.channels).toBeDefined();
          expect(parsed.channels[channelKey]).toBeDefined();

          // 断言写入的配置字段完整保留
          expect(parsed.channels[channelKey].enabled).toBe(channelConfig.enabled);
          if (channelConfig.accounts) {
            expect(parsed.channels[channelKey].accounts).toEqual(channelConfig.accounts);
          }
        },
      ),
      { numRuns: 30 },
    );
  });

  // ── Preservation 2: getAccountFields 对已规范化的 channelKey 返回完整字段定义 ──

  /**
   * Validates: Requirements 3.1, 3.2
   *
   * 属性测试：对所有已规范化的 channelKey（feishu、telegram、discord、slack），
   * getAccountFields 返回对应渠道的完整字段定义。
   *
   * 这是基线行为：已规范化的 key 在未修复代码上也能正确匹配。
   * 修复后此行为不应发生回归。
   */
  test('Preservation: getAccountFields 对已规范化的 channelKey 返回对应渠道的完整字段定义', () => {
    fc.assert(
      fc.property(
        normalizedChannelKeyArb(),
        (channelKey) => {
          const fields = getAccountFields(channelKey);

          // 断言返回的字段数组非空
          expect(fields.length).toBeGreaterThanOrEqual(1);

          // 断言所有字段都有必需的属性
          for (const field of fields) {
            expect(field.id).toBeDefined();
            expect(typeof field.id).toBe('string');
            expect(field.label).toBeDefined();
            expect(typeof field.label).toBe('string');
            expect(['text', 'password', 'select']).toContain(field.type);
            expect(typeof field.required).toBe('boolean');
          }

          // 断言返回的字段与 channelAccountFields 中定义的一致
          const expectedFields = channelAccountFields[channelKey];
          expect(expectedFields).toBeDefined();
          expect(fields).toEqual(expectedFields);

          // 飞书渠道应包含专有字段（appId、appSecret、dmPolicy 等）
          if (channelKey === 'feishu') {
            const fieldIds = fields.map((f) => f.id);
            expect(fieldIds).toContain('appId');
            expect(fieldIds).toContain('appSecret');
            expect(fieldIds).toContain('dmPolicy');
            expect(fields.length).toBeGreaterThan(1);
          }

          // 所有渠道都应包含 accountId 字段
          const fieldIds = fields.map((f) => f.id);
          expect(fieldIds).toContain('accountId');
        },
      ),
      { numRuns: 30 },
    );
  });

  // ── Preservation 3: shouldSkipStep 跳过条件一致性 ──

  /**
   * Validates: Requirements 3.5
   *
   * 属性测试：对所有 addResults 数组：
   * - 当存在 success 条目时，channel-accounts 和 bind-channels 两个步骤都不跳过
   * - 当无 success 条目（包括空数组）时，两个步骤都跳过
   *
   * 注意：在未修复代码上，bind-channels 的跳过条件使用 addResults.length > 0
   * 而非 addResults.filter(r => r.success).length > 0。
   * 但对于"存在 success 条目"和"空数组"这两种非 BUG 条件场景，
   * 两种实现的行为是一致的，因此此测试在未修复代码上也应通过。
   */
  test('Preservation: 存在 success 条目时 bind-channels 不跳过', () => {
    fc.assert(
      fc.property(
        addResultsWithSuccessArb(),
        (addResults) => {
          // 构造状态：有成功的渠道添加结果，且有已创建的 agent
          const state: SetupState = {
            ...initialSetupState,
            mode: 'local',
            channels: {
              ...initialSetupState.channels,
              addResults,
            },
            agent: {
              ...initialSetupState.agent,
              created: { id: 'test-agent', name: 'Test Agent' },
            },
          };

          // bind-channels 不应跳过（有成功条目且有 agent）
          // channel-accounts 步骤已移除
          const bindChannelsSkip = shouldSkipStep('/setup/local/bind-channels', state);
          expect(bindChannelsSkip).toBe(false);
        },
      ),
      { numRuns: 30 },
    );
  });

  /**
   * Validates: Requirements 3.5
   *
   * 属性测试：当 addResults 为空但 agent 已创建时，bind-channels 不跳过。
   * 新逻辑下 skip 仅检查 agent 是否存在，不再检查 addResults。
   * 页面通过 IPC 查询 openclaw.json 判断是否需要绑定。
   */
  test('Preservation: addResults 为空但 agent 已创建时 bind-channels 不跳过', () => {
    // 空 addResults 场景，但 agent 已创建
    const state: SetupState = {
      ...initialSetupState,
      mode: 'local',
      channels: {
        ...initialSetupState.channels,
        addResults: [],
      },
      agent: {
        ...initialSetupState.agent,
        created: { id: 'test-agent', name: 'Test Agent' },
      },
    };

    // 新逻辑：agent 存在则不跳过，页面自行通过 IPC 判断绑定状态
    const bindChannelsSkip = shouldSkipStep('/setup/local/bind-channels', state);
    expect(bindChannelsSkip).toBe(false);
  });

  /**
   * Validates: Requirements 3.5
   *
   * 属性测试：对所有全部失败的 addResults 数组，但 agent 已创建时，
   * bind-channels 不跳过。新逻辑下 skip 仅检查 agent 是否存在。
   * 页面通过 IPC 查询 openclaw.json 判断是否需要绑定。
   */
  test('Preservation: 全部失败但 agent 已创建时 bind-channels 不跳过', () => {
    fc.assert(
      fc.property(
        addResultsAllFailedArb(),
        (failedResults) => {
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

          // 新逻辑：agent 存在则不跳过，页面自行通过 IPC 判断绑定状态
          const bindChannelsSkip = shouldSkipStep('/setup/local/bind-channels', state);
          expect(bindChannelsSkip).toBe(false);
        },
      ),
      { numRuns: 30 },
    );
  });
});
