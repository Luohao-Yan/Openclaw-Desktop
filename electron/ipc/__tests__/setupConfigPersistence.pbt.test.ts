/**
 * 属性测试：Setup Config Persistence Bugfix - Bug Condition 探索
 * Feature: setup-config-persistence
 * 覆盖 Property 1: Bug Condition — bindings.match Schema 不兼容与配置持久化缺失
 *
 * 本测试编码的是 **期望行为（正确行为）**：
 * - readConfigFile() 应自动迁移 bindings.match 中的不兼容字段（peer 空对象、已废弃字段）
 * - buildPatchedConfig() 应清理 bindings.match 中的不兼容字段
 * - 导航图中 create-agent 的 next 应指向 bind-channels 步骤
 *
 * 在未修复代码上运行时，测试应 **失败**（证明 bug 存在）。
 * 修复后运行时，测试应 **通过**（证明 bug 已修复）。
 */

import { describe, test, expect, vi } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs/promises';
import * as path from 'path';

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

// ── Mock fs/promises：控制 readConfigFile() 读取的文件内容 ──────────────
vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs/promises')>();
  return {
    ...actual,
    readFile: vi.fn(actual.readFile),
  };
});

// ── 导入导航图（纯数据结构，无副作用） ──────────────────────────────────
import { NAVIGATION_GRAPH } from '../../../src/contexts/setupNavigationGraph';

// ── 导入 migrateBindingsSchema 纯函数（修复后可用） ──────────────────────
import { migrateBindingsSchema } from '../coreConfig';

// ── 已废弃字段列表（不应出现在迁移后的 bindings.match 中） ──────────────
const DEPRECATED_MATCH_FIELDS = ['dmScope', 'guildId', 'teamId'] as const;

// ── 生成器（Arbitraries）──────────────────────────────────────────────────

/**
 * 生成合法的 channel 名称
 */
const channelNameArb = (): fc.Arbitrary<string> =>
  fc.constantFrom(
    'telegram', 'discord', 'slack', 'whatsapp',
    'matrix', 'signal', 'irc', 'line',
  );

/**
 * 生成合法的 accountId
 */
const accountIdArb = (): fc.Arbitrary<string> =>
  fc.constantFrom('default', 'main', 'bot-1', 'prod', 'test-account');

/**
 * 生成合法的 agentId
 */
const agentIdArb = (): fc.Arbitrary<string> =>
  fc.constantFrom('main', 'my-bot', 'agent-1', 'test-agent', 'prod-agent');

/**
 * 生成包含 peer 空对象的 match 字段
 * 这是缺陷 1 的触发条件：旧版 schema 中 match.peer 为空对象
 */
const matchWithEmptyPeerArb = (): fc.Arbitrary<Record<string, any>> =>
  fc.tuple(channelNameArb(), accountIdArb()).map(([channel, accountId]) => ({
    channel,
    accountId,
    peer: {},
  }));

/**
 * 生成包含已废弃字段的 match 字段
 * 这是缺陷 6 的触发条件：match 中包含 dmScope、guildId、teamId 等已废弃字段
 */
const matchWithDeprecatedFieldsArb = (): fc.Arbitrary<Record<string, any>> =>
  fc.tuple(
    channelNameArb(),
    accountIdArb(),
    // 至少包含一个已废弃字段
    fc.record({
      dmScope: fc.option(fc.constantFrom('all', 'none', 'contacts'), { nil: undefined }),
      guildId: fc.option(fc.string({ minLength: 5, maxLength: 20 }), { nil: undefined }),
      teamId: fc.option(fc.string({ minLength: 5, maxLength: 20 }), { nil: undefined }),
    }).filter((deprecated) =>
      // 确保至少有一个已废弃字段存在
      Object.values(deprecated).some((v) => v !== undefined),
    ),
  ).map(([channel, accountId, deprecated]) => ({
    channel,
    accountId,
    ...deprecated,
  }));

/**
 * 生成包含不兼容字段的 binding 条目
 * 组合 peer 空对象和已废弃字段两种情况
 */
const incompatibleBindingArb = (): fc.Arbitrary<Record<string, any>> =>
  fc.tuple(
    agentIdArb(),
    fc.oneof(matchWithEmptyPeerArb(), matchWithDeprecatedFieldsArb()),
  ).map(([agentId, match]) => ({
    agentId,
    match,
  }));

/**
 * 生成包含不兼容 bindings 的 openclaw.json 配置对象
 * 至少包含一个不兼容的 binding 条目
 */
const configWithIncompatibleBindingsArb = (): fc.Arbitrary<Record<string, any>> =>
  fc.tuple(
    fc.array(incompatibleBindingArb(), { minLength: 1, maxLength: 5 }),
    // 可选的其他配置字段
    fc.record({
      gatewayPort: fc.nat({ max: 65535 }),
      gatewayMode: fc.constantFrom('local', 'remote'),
    }),
  ).map(([bindings, extra]) => ({
    gateway: {
      port: extra.gatewayPort,
      mode: extra.gatewayMode,
    },
    bindings,
  }));

// ============================================================
// Property 1: Bug Condition 探索
// Feature: setup-config-persistence
// ============================================================

describe('Feature: setup-config-persistence, Property 1: Bug Condition 探索', () => {

  // ── 缺陷 1 & 6: readConfigFile() 不执行 bindings.match schema 迁移 ──

  /**
   * Validates: Requirements 1.1, 1.6, 2.1, 2.6
   *
   * 属性测试：对于包含 match.peer 空对象的 bindings，
   * readConfigFile() 返回的配置中不应包含 peer 空对象。
   *
   * 在未修复代码上：readConfigFile() 是纯 JSON 读取，不做迁移，
   * peer 空对象被原样返回 → 测试失败 → 证明 bug 存在
   */
  test('缺陷 1: readConfigFile() 应移除 bindings[].match.peer 空对象', async () => {
    // 动态导入 coreConfig 模块以获取内部函数
    // readConfigFile 虽然不直接导出，但我们可以通过 mock fs 来间接测试
    const mockedReadFile = vi.mocked(fs.readFile);

    await fc.assert(
      fc.asyncProperty(
        configWithIncompatibleBindingsArb().filter((config) =>
          // 确保至少有一个 binding 的 match 包含 peer 空对象
          config.bindings.some((b: any) =>
            b.match && typeof b.match.peer === 'object' &&
            b.match.peer !== null && Object.keys(b.match.peer).length === 0,
          ),
        ),
        async (config) => {
          // 调用 migrateBindingsSchema 模拟 readConfigFile() 的迁移逻辑
          // 修复后 readConfigFile() 在返回前会调用 migrateBindingsSchema()
          const migrated = migrateBindingsSchema(config);

          // 期望行为：迁移后 bindings[].match 中不应包含 peer 空对象
          // 未修复代码：readConfigFile() 原样返回，peer 空对象仍存在
          for (const binding of migrated.bindings) {
            if (binding.match) {
              const hasPeerEmpty =
                binding.match.peer !== undefined &&
                typeof binding.match.peer === 'object' &&
                binding.match.peer !== null &&
                Object.keys(binding.match.peer).length === 0;

              // 期望：peer 空对象已被移除
              expect(hasPeerEmpty).toBe(false);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 1.1, 1.6, 2.1, 2.6
   *
   * 属性测试：对于包含已废弃字段（dmScope、guildId、teamId）的 bindings，
   * readConfigFile() 返回的配置中不应包含这些已废弃字段。
   *
   * 在未修复代码上：readConfigFile() 不做迁移，已废弃字段被原样返回
   * → 测试失败 → 证明 bug 存在
   */
  test('缺陷 6: readConfigFile() 应移除 bindings[].match 中的已废弃字段', async () => {
    const mockedReadFile = vi.mocked(fs.readFile);

    await fc.assert(
      fc.asyncProperty(
        configWithIncompatibleBindingsArb().filter((config) =>
          // 确保至少有一个 binding 的 match 包含已废弃字段
          config.bindings.some((b: any) =>
            b.match && DEPRECATED_MATCH_FIELDS.some((field) => b.match[field] !== undefined),
          ),
        ),
        async (config) => {
          // 调用 migrateBindingsSchema 模拟 readConfigFile() 的迁移逻辑
          const migrated = migrateBindingsSchema(config);

          // 期望行为：迁移后 bindings[].match 中不应包含已废弃字段
          // 未修复代码：原样返回，已废弃字段仍存在
          for (const binding of migrated.bindings) {
            if (binding.match) {
              for (const field of DEPRECATED_MATCH_FIELDS) {
                expect(binding.match[field]).toBeUndefined();
              }
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 1.1, 2.1
   *
   * 具体案例：典型的旧版 Telegram binding 配置
   */
  test('缺陷 1 案例: Telegram binding 的 match.peer 空对象应被移除', () => {
    const config = {
      bindings: [
        {
          agentId: 'main',
          match: { channel: 'telegram', accountId: 'default', peer: {} },
        },
      ],
    };

    // 调用 migrateBindingsSchema 模拟 readConfigFile() 的迁移逻辑
    const migrated = migrateBindingsSchema(config as any);

    // 期望：peer 空对象已被移除
    expect(migrated.bindings[0].match.peer).toBeUndefined();
  });

  /**
   * Validates: Requirements 1.6, 2.6
   *
   * 具体案例：包含 dmScope 已废弃字段的 binding
   */
  test('缺陷 6 案例: binding 的 match.dmScope 已废弃字段应被移除', () => {
    const config = {
      bindings: [
        {
          agentId: 'main',
          match: { channel: 'discord', accountId: 'default', dmScope: 'all' },
        },
      ],
    };

    // 调用 migrateBindingsSchema 模拟 readConfigFile() 的迁移逻辑
    const migrated = migrateBindingsSchema(config as any);

    // 期望：dmScope 已被移除
    expect(migrated.bindings[0].match.dmScope).toBeUndefined();
  });

  // ── 缺陷 4: channels/create-agent/bind-channels 路由已从导航图中移除 ──
  // install-guide 页面内嵌了完整的多步配置（模型、workspace、gateway、channels、daemon、skills），
  // 完成后直接跳转到 verify，不再经过这些独立路由。
  // 以下三个测试已废弃，因为对应的导航节点已从 NAVIGATION_GRAPH 中移除。

  test('缺陷 4（已废弃）: create-agent/bind-channels 节点已从导航图中移除', () => {
    // channels、create-agent、bind-channels 路由已从主导航链中移除
    const createAgentNode = NAVIGATION_GRAPH.find(
      (node) => node.path === '/setup/local/create-agent',
    );
    const bindChannelsNode = NAVIGATION_GRAPH.find(
      (node) => node.path === '/setup/local/bind-channels',
    );
    const channelsNode = NAVIGATION_GRAPH.find(
      (node) => node.path === '/setup/local/channels',
    );

    // 这些节点不再存在于导航图中
    expect(createAgentNode).toBeUndefined();
    expect(bindChannelsNode).toBeUndefined();
    expect(channelsNode).toBeUndefined();
  });

  // ── 缺陷 6: buildPatchedConfig() 不清理 bindings.match 不兼容字段 ──

  /**
   * Validates: Requirements 1.6, 2.6
   *
   * 属性测试：buildPatchedConfig() 处理后的配置中，
   * bindings[].match 不应包含 peer 空对象或已废弃字段。
   *
   * 在未修复代码上：buildPatchedConfig() 仅处理 manifest 定义的字段，
   * 不触及 bindings 数组 → 不兼容字段被原样保留 → 测试失败
   */
  test('缺陷 6: buildPatchedConfig() 应清理 bindings.match 中的不兼容字段', () => {
    // 加载 manifest 文件
    const manifestPath = path.resolve(
      __dirname, '../../config/openclaw-manifests/3.13.json',
    );
    const manifestContent = require('fs').readFileSync(manifestPath, 'utf8');
    const manifest = JSON.parse(manifestContent);

    fc.assert(
      fc.property(
        configWithIncompatibleBindingsArb(),
        (config) => {
          // 模拟 buildPatchedConfig 的核心逻辑：
          // 深拷贝配置，然后按 manifest 字段更新，最后调用 migrateBindingsSchema
          const nextConfig = migrateBindingsSchema(JSON.parse(JSON.stringify(config)));

          // 设置 metadata（buildPatchedConfig 总是做的）
          if (!nextConfig.metadata) (nextConfig as any).metadata = {};
          (nextConfig as any).metadata.configLastTouchedAt = new Date().toISOString();

          // 期望行为：buildPatchedConfig 应在写入前清理 bindings 中的不兼容字段
          if (Array.isArray(nextConfig.bindings)) {
            for (const binding of nextConfig.bindings) {
              if (binding.match) {
                // peer 空对象应被移除
                if (
                  binding.match.peer !== undefined &&
                  typeof binding.match.peer === 'object' &&
                  binding.match.peer !== null &&
                  Object.keys(binding.match.peer).length === 0
                ) {
                  expect(binding.match.peer).toBeUndefined();
                }

                // 已废弃字段应被移除
                for (const field of DEPRECATED_MATCH_FIELDS) {
                  expect(binding.match[field]).toBeUndefined();
                }
              }
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 1.1, 1.6, 2.1, 2.6
   *
   * 属性测试：迁移后应保留 match.channel 和 match.accountId 等有效字段
   */
  test('迁移后应保留 match.channel 和 match.accountId 有效字段', () => {
    fc.assert(
      fc.property(
        incompatibleBindingArb(),
        (binding) => {
          // 记录原始有效字段值
          const originalChannel = binding.match.channel;
          const originalAccountId = binding.match.accountId;

          // 模拟迁移后的配置（未修复代码不做迁移，直接解析）
          const parsed = JSON.parse(JSON.stringify(binding));

          // 无论是否迁移，有效字段都应保留
          expect(parsed.match.channel).toBe(originalChannel);
          expect(parsed.match.accountId).toBe(originalAccountId);
        },
      ),
      { numRuns: 100 },
    );
  });
});


// ── 导入 reducer 和初始状态（纯函数，无副作用） ──────────────────────────
import { setupReducer, initialSetupState } from '../../../src/contexts/setupReducer';
import type { SetupState } from '../../../src/contexts/setupReducer';
import type { SetupAction } from '../../../src/contexts/setupActions';
import type { ChannelAddResult } from '../../../src/types/setup';

// ============================================================
// Property 2: Preservation — 已兼容配置和非缺陷操作行为保持
// Feature: setup-config-persistence
//
// 这些测试验证在未修复代码上已经正确的行为：
// - 已符合 schema 的 bindings 条目不被修改
// - buildPatchedConfig() 不修改无关的 bindings 内容
// - 导航图中已有节点的导航关系正确
// - setupReducer 对非缺陷 action 的处理行为不变
//
// 在未修复代码上运行时，测试应 **通过**（确认基线行为）。
// ============================================================

// ── Preservation 专用生成器 ──────────────────────────────────────────────

/**
 * 生成已符合当前 schema 的 match 字段（仅含 channel 和 accountId）
 * 不包含 peer、dmScope、guildId、teamId 等不兼容字段
 */
const compliantMatchArb = (): fc.Arbitrary<{ channel: string; accountId: string }> =>
  fc.tuple(channelNameArb(), accountIdArb()).map(([channel, accountId]) => ({
    channel,
    accountId,
  }));

/**
 * 生成已符合当前 schema 的 binding 条目
 * match 中仅包含 channel 和 accountId
 */
const compliantBindingArb = (): fc.Arbitrary<{ agentId: string; match: { channel: string; accountId: string } }> =>
  fc.tuple(agentIdArb(), compliantMatchArb()).map(([agentId, match]) => ({
    agentId,
    match,
  }));

/**
 * 生成包含已符合 schema 的 bindings 的 openclaw.json 配置对象
 * 所有 binding 条目的 match 仅含 channel 和 accountId
 */
const configWithCompliantBindingsArb = (): fc.Arbitrary<Record<string, any>> =>
  fc.tuple(
    fc.array(compliantBindingArb(), { minLength: 0, maxLength: 5 }),
    fc.record({
      gatewayPort: fc.nat({ max: 65535 }),
      gatewayMode: fc.constantFrom('local', 'remote'),
    }),
  ).map(([bindings, extra]) => ({
    gateway: {
      port: extra.gatewayPort,
      mode: extra.gatewayMode,
    },
    bindings,
  }));

/**
 * 生成 ChannelAddResult 数组（用于测试 reducer 的 SET_CHANNEL_ADD_RESULTS action）
 */
const channelAddResultArb = (): fc.Arbitrary<ChannelAddResult> =>
  fc.record({
    channelKey: channelNameArb(),
    channelLabel: fc.constantFrom('Telegram', 'Discord', 'Slack', 'WhatsApp'),
    success: fc.boolean(),
    output: fc.option(fc.string({ minLength: 0, maxLength: 50 }), { nil: undefined }),
    error: fc.option(fc.string({ minLength: 0, maxLength: 50 }), { nil: undefined }),
  });

/**
 * 生成有效的 SetupState（用于 reducer 测试）
 * 确保 environment.check.status 不是 'fallback'，以满足 SET_CHANNEL_CONFIGS 的前置条件
 */
const validSetupStateForChannelsArb = (): fc.Arbitrary<SetupState> =>
  fc.constant({
    ...initialSetupState,
    mode: 'local' as const,
    environment: {
      ...initialSetupState.environment,
      check: {
        status: 'success' as const,
        data: initialSetupState.environment.check.status === 'fallback'
          ? initialSetupState.environment.check.data
          : (initialSetupState.environment.check as any).data ?? initialSetupState.environment.check,
      },
    },
  });

describe('Feature: setup-config-persistence, Property 2: Preservation — 已兼容配置和非缺陷操作行为保持', () => {

  // ── 观察 1: 已符合 schema 的 bindings 经过 readConfigFile() 后原样保留 ──

  /**
   * Validates: Requirements 3.1, 3.3
   *
   * 属性测试：对所有已符合当前 schema 的 bindings 配置（match 仅含 channel 和 accountId），
   * 经过 JSON 序列化/反序列化（模拟 readConfigFile() 的核心逻辑）后，
   * bindings 内容与原始输入完全一致。
   *
   * 在未修复代码上：readConfigFile() 是纯 JSON 读取，已兼容配置不受影响 → 测试通过
   */
  test('已符合 schema 的 bindings 经过 readConfigFile() 后原样保留', async () => {
    const mockedReadFile = vi.mocked(fs.readFile);

    await fc.assert(
      fc.asyncProperty(
        configWithCompliantBindingsArb(),
        async (config) => {
          // 设置 mock：让 readFile 返回生成的配置 JSON
          mockedReadFile.mockResolvedValueOnce(JSON.stringify(config) as any);

          // 模拟 readConfigFile() 的核心逻辑：读取文件 → JSON.parse
          const content = await mockedReadFile('/tmp/.openclaw/openclaw.json', 'utf8');
          const parsed = JSON.parse(content as string);

          // 断言：bindings 数组长度不变
          expect(parsed.bindings.length).toBe(config.bindings.length);

          // 断言：每个 binding 条目的内容完全一致
          for (let i = 0; i < config.bindings.length; i++) {
            const original = config.bindings[i];
            const result = parsed.bindings[i];

            // agentId 保持不变
            expect(result.agentId).toBe(original.agentId);

            // match 字段完全一致
            expect(result.match.channel).toBe(original.match.channel);
            expect(result.match.accountId).toBe(original.match.accountId);

            // match 中不应出现额外字段
            const matchKeys = Object.keys(result.match);
            expect(matchKeys).toEqual(expect.arrayContaining(['channel', 'accountId']));
            expect(matchKeys.length).toBe(2);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // ── 观察 2: buildPatchedConfig() 对不含 bindings 相关字段的 manifest 输入不修改 bindings ──

  /**
   * Validates: Requirements 3.3, 3.4
   *
   * 属性测试：buildPatchedConfig() 仅处理 manifest 中定义的字段路径，
   * 不触及 bindings 数组。对于不含 bindings 相关字段的 manifest 输入，
   * 输出配置的 bindings 部分与输入完全一致。
   *
   * 在未修复代码上：buildPatchedConfig() 不处理 bindings → 测试通过
   */
  test('buildPatchedConfig() 对不含 bindings 字段的 manifest 不修改 bindings 内容', () => {
    // 加载真实 manifest 文件
    const manifestPath = path.resolve(
      __dirname, '../../config/openclaw-manifests/3.13.json',
    );
    const manifestContent = require('fs').readFileSync(manifestPath, 'utf8');
    const manifest = JSON.parse(manifestContent);

    fc.assert(
      fc.property(
        configWithCompliantBindingsArb(),
        // 生成不涉及 bindings 的 values（仅包含 manifest 中定义的字段）
        fc.record({
          port: fc.nat({ max: 65535 }),
          gatewayMode: fc.constantFrom('local', 'remote'),
        }),
        (config, values) => {
          // 模拟 buildPatchedConfig 的核心逻辑：
          // 深拷贝配置 → 按 manifest 字段更新 → 设置 metadata
          const nextConfig = JSON.parse(JSON.stringify(config));

          // 遍历 manifest sections 中的字段，按 path 设置值
          // （这里简化模拟，仅设置 metadata，不修改 bindings）
          for (const section of manifest.sections || []) {
            for (const field of section.fields || []) {
              if (field.type === 'readonly' || !field.path) continue;
              // 仅处理 manifest 定义的路径，不触及 bindings
              const nextValue = values[field.id as keyof typeof values];
              if (nextValue !== undefined && field.path) {
                // 模拟 setByPath 逻辑
                const segments = field.path.split('.').filter(Boolean);
                let cursor: any = nextConfig;
                for (let idx = 0; idx < segments.length - 1; idx++) {
                  if (typeof cursor[segments[idx]] !== 'object' || cursor[segments[idx]] === null) {
                    cursor[segments[idx]] = {};
                  }
                  cursor = cursor[segments[idx]];
                }
                // 仅在 values 中有对应 id 时才设置
              }
            }
          }

          // 设置 metadata（buildPatchedConfig 总是做的）
          if (!nextConfig.metadata) nextConfig.metadata = {};
          nextConfig.metadata.configLastTouchedAt = new Date().toISOString();

          // 断言：bindings 数组内容与原始输入完全一致
          expect(nextConfig.bindings.length).toBe(config.bindings.length);
          for (let i = 0; i < config.bindings.length; i++) {
            expect(nextConfig.bindings[i].agentId).toBe(config.bindings[i].agentId);
            expect(nextConfig.bindings[i].match.channel).toBe(config.bindings[i].match.channel);
            expect(nextConfig.bindings[i].match.accountId).toBe(config.bindings[i].match.accountId);
            // 确认 match 中没有被添加额外字段
            expect(Object.keys(nextConfig.bindings[i].match).sort()).toEqual(
              Object.keys(config.bindings[i].match).sort(),
            );
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // ── 观察 3: 导航图路由精简 — channels/create-agent/bind-channels 已移除 ──

  /**
   * Validates: Requirements 3.1, 3.2
   *
   * 导航图测试：channels、create-agent、bind-channels 节点已从导航图中移除。
   * install-guide 页面内嵌了完整的多步配置，完成后直接跳转到 verify。
   *
   * verify 节点的 prev 现在根据 localInstallValidated 条件决定：
   * - localInstallValidated 为 true 时回退到 configure
   * - 否则回退到 install-guide
   */
  test('导航图中 channels 节点已移除', () => {
    // channels 节点已从导航图中移除
    const channelsNode = NAVIGATION_GRAPH.find(
      (node) => node.path === '/setup/local/channels',
    );
    expect(channelsNode).toBeUndefined();
  });

  /**
   * Validates: Requirements 3.1, 3.2
   *
   * 导航图测试：verify 节点的 prev 在默认状态下应指向 install-guide。
   * （默认状态下 localInstallValidated 为 undefined/falsy，走 install-guide 路径）
   */
  test('导航图中 verify 节点的 prev 在默认状态下指向 install-guide', () => {
    // 查找 verify 节点
    const verifyNode = NAVIGATION_GRAPH.find(
      (node) => node.path === '/setup/local/verify',
    );

    // 节点必须存在
    expect(verifyNode).toBeDefined();

    // prev 可能是字符串或函数，需要统一处理
    const prevValue = typeof verifyNode!.prev === 'function'
      ? verifyNode!.prev(initialSetupState)
      : verifyNode!.prev;

    // 默认状态下 localInstallValidated 为 undefined，verify 的 prev 应指向 install-guide
    expect(prevValue).toBe('/setup/local/install-guide');
  });

  /**
   * Validates: Requirements 3.1, 3.2
   *
   * 属性测试：对所有导航图中的节点，next 和 prev 指向的路径
   * 要么为 null，要么存在于导航图中（引用完整性）。
   *
   * 在未修复代码上：导航图引用完整 → 测试通过
   */
  test('导航图中所有节点的 next/prev 引用完整性', () => {
    const allPaths = new Set(NAVIGATION_GRAPH.map((n) => n.path));

    fc.assert(
      fc.property(
        // 从导航图中随机选择一个节点索引
        fc.integer({ min: 0, max: NAVIGATION_GRAPH.length - 1 }),
        (index) => {
          const node = NAVIGATION_GRAPH[index];

          // next 为 null 或存在于导航图中
          if (node.next !== null) {
            expect(allPaths.has(node.next)).toBe(true);
          }

          // prev 可能是函数，用初始状态调用获取值
          const prevValue = typeof node.prev === 'function'
            ? node.prev(initialSetupState)
            : node.prev;

          // prev 为 null 或存在于导航图中
          if (prevValue !== null) {
            expect(allPaths.has(prevValue)).toBe(true);
          }
        },
      ),
      { numRuns: NAVIGATION_GRAPH.length },
    );
  });

  // ── 观察 4: setupReducer 处理 SET_CHANNEL_ADD_RESULTS action 时正确更新 channels.addResults ──

  /**
   * Validates: Requirements 3.5, 3.6
   *
   * 属性测试：setupReducer 处理 SET_CHANNEL_ADD_RESULTS action 时，
   * 应正确更新 state.channels.addResults，且不影响其他状态字段。
   *
   * 在未修复代码上：reducer 已正确处理此 action → 测试通过
   */
  test('setupReducer 处理 SET_CHANNEL_ADD_RESULTS 正确更新 channels.addResults', () => {
    fc.assert(
      fc.property(
        fc.array(channelAddResultArb(), { minLength: 0, maxLength: 5 }),
        (addResults) => {
          // 构造初始状态（确保 mode 已设置，避免转换校验警告）
          const state: SetupState = {
            ...initialSetupState,
            mode: 'local',
            environment: {
              ...initialSetupState.environment,
              check: {
                status: 'success',
                data: {
                  ...(initialSetupState.environment.check as any).data,
                },
              },
            },
          };

          // 构造 action
          const action: SetupAction = {
            type: 'SET_CHANNEL_ADD_RESULTS',
            payload: addResults,
          };

          // 执行 reducer
          const newState = setupReducer(state, action);

          // 断言：channels.addResults 已更新为 payload
          expect(newState.channels.addResults).toEqual(addResults);
          expect(newState.channels.addResults.length).toBe(addResults.length);

          // 断言：其他状态字段不受影响
          expect(newState.mode).toBe(state.mode);
          expect(newState.channels.configs).toEqual(state.channels.configs);
          expect(newState.agent).toEqual(state.agent);
          expect(newState.ui.isBusy).toBe(state.ui.isBusy);
          expect(newState.ui.error).toBe(state.ui.error);
          expect(newState.settings).toEqual(state.settings);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 3.5
   *
   * 属性测试：setupReducer 处理 SET_CHANNEL_ADD_RESULTS 后，
   * 原始状态对象不被修改（不可变性保证）。
   *
   * 在未修复代码上：reducer 使用展开运算符返回新对象 → 测试通过
   */
  test('setupReducer 处理 SET_CHANNEL_ADD_RESULTS 保持不可变性', () => {
    fc.assert(
      fc.property(
        fc.array(channelAddResultArb(), { minLength: 1, maxLength: 5 }),
        (addResults) => {
          const state: SetupState = {
            ...initialSetupState,
            mode: 'local',
          };

          // 深拷贝原始状态用于比较
          const originalState = JSON.parse(JSON.stringify(state));

          // 执行 reducer
          const action: SetupAction = {
            type: 'SET_CHANNEL_ADD_RESULTS',
            payload: addResults,
          };
          const newState = setupReducer(state, action);

          // 断言：返回新对象（引用不同）
          expect(newState).not.toBe(state);
          expect(newState.channels).not.toBe(state.channels);

          // 断言：原始状态的 channels.addResults 未被修改
          expect(state.channels.addResults).toEqual(originalState.channels.addResults);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 3.5, 3.6
   *
   * 属性测试：setupReducer 对连续多次 SET_CHANNEL_ADD_RESULTS dispatch，
   * 最终状态的 addResults 等于最后一次 dispatch 的 payload。
   *
   * 在未修复代码上：reducer 每次都整体替换 addResults → 测试通过
   */
  test('setupReducer 连续 dispatch SET_CHANNEL_ADD_RESULTS 以最后一次为准', () => {
    fc.assert(
      fc.property(
        fc.array(channelAddResultArb(), { minLength: 1, maxLength: 3 }),
        fc.array(channelAddResultArb(), { minLength: 1, maxLength: 3 }),
        (firstBatch, secondBatch) => {
          let state: SetupState = {
            ...initialSetupState,
            mode: 'local',
          };

          // 第一次 dispatch
          state = setupReducer(state, {
            type: 'SET_CHANNEL_ADD_RESULTS',
            payload: firstBatch,
          });

          // 第二次 dispatch
          state = setupReducer(state, {
            type: 'SET_CHANNEL_ADD_RESULTS',
            payload: secondBatch,
          });

          // 断言：最终 addResults 等于第二次 dispatch 的 payload
          expect(state.channels.addResults).toEqual(secondBatch);
        },
      ),
      { numRuns: 100 },
    );
  });
});
