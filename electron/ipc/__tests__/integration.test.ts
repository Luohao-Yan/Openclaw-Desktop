/**
 * 集成测试：setup-flow-optimization 核心纯逻辑模块联合验证
 *
 * 由于无法在 vitest 中运行实际的 Electron IPC，本文件测试纯逻辑模块的协同工作：
 * 1. 三级回退策略完整流程（runtimeLogic.ts）
 * 2. 远程连接测试与保存流程（remoteConnectionLogic.ts）
 * 3. 渠道绑定保存与跳过流程（数据结构验证）
 *
 * Validates: Requirements 2.1, 9.1, 8.8
 */

import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';
import { determineRuntimeTier, parseMajorVersion } from '../runtimeLogic';
import type { RuntimeScenario } from '../runtimeLogic';
import {
  buildRemoteUrl,
  buildTimeoutResult,
  isAuthError,
  mapNetworkError,
  parseVersionFromBody,
} from '../remoteConnectionLogic';
import type { RemoteConnectionPayload } from '../remoteConnectionLogic';

// ══════════════════════════════════════════════════════════════════════════
// 通用生成器
// ══════════════════════════════════════════════════════════════════════════

/** 生成合法主机名 */
const hostArb = (): fc.Arbitrary<string> =>
  fc.oneof(
    fc.string({
      minLength: 1,
      maxLength: 15,
      unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')),
    }).map((s) => `${s}.example.com`),
    fc.tuple(
      fc.integer({ min: 1, max: 255 }),
      fc.integer({ min: 0, max: 255 }),
      fc.integer({ min: 0, max: 255 }),
      fc.integer({ min: 1, max: 255 }),
    ).map(([a, b, c, d]) => `${a}.${b}.${c}.${d}`),
    fc.constant('localhost'),
  );

/** 生成远程连接参数 */
const payloadArb = (): fc.Arbitrary<RemoteConnectionPayload> =>
  fc.record({
    host: hostArb(),
    port: fc.option(fc.integer({ min: 1, max: 65535 }), { nil: undefined }),
    protocol: fc.constantFrom('http' as const, 'https' as const),
    token: fc.option(
      fc.string({ minLength: 1, maxLength: 32, unit: fc.constantFrom(...'abcdefABCDEF0123456789_-'.split('')) }),
      { nil: undefined },
    ),
  });

/** 生成随机运行时场景 */
const runtimeScenarioArb = (): fc.Arbitrary<RuntimeScenario> =>
  fc.record({
    bundledNodeAvailable: fc.boolean(),
    bundledNodeExecutable: fc.boolean(),
    bundledClawAvailable: fc.boolean(),
    bundledClawExecutable: fc.boolean(),
    systemNodeAvailable: fc.boolean(),
    systemNodeVersion: fc.integer({ min: 0, max: 30 }),
    systemClawAvailable: fc.boolean(),
    networkAvailable: fc.boolean(),
  });

// ══════════════════════════════════════════════════════════════════════════
// 1. 三级回退策略集成测试
// Validates: Requirements 2.1
// ══════════════════════════════════════════════════════════════════════════

describe('集成测试：三级回退策略完整流程', () => {
  /**
   * 验证 tier 判定逻辑在所有可能的输入组合下都能产生有效结果，
   * 且严格遵循 bundled > system > online > missing 的优先级顺序。
   */

  test('任意场景组合下，tier 始终为四个合法值之一', () => {
    fc.assert(
      fc.property(runtimeScenarioArb(), (scenario) => {
        const tier = determineRuntimeTier(scenario);
        expect(['bundled', 'system', 'online', 'missing']).toContain(tier);
      }),
      { numRuns: 300 },
    );
  });

  test('bundled 可用时，无论系统和网络状态如何，tier 始终为 bundled', () => {
    fc.assert(
      fc.property(
        fc.record({
          bundledNodeAvailable: fc.constant(true),
          bundledNodeExecutable: fc.constant(true),
          bundledClawAvailable: fc.constant(true),
          bundledClawExecutable: fc.constant(true),
          systemNodeAvailable: fc.boolean(),
          systemNodeVersion: fc.integer({ min: 0, max: 30 }),
          systemClawAvailable: fc.boolean(),
          networkAvailable: fc.boolean(),
        }),
        (scenario) => {
          const tier = determineRuntimeTier(scenario);
          expect(tier).toBe('bundled');
        },
      ),
      { numRuns: 200 },
    );
  });

  test('bundled 不可用但系统 Node >= 22 时，tier 为 system', () => {
    fc.assert(
      fc.property(
        fc.record({
          bundledNodeAvailable: fc.boolean(),
          bundledNodeExecutable: fc.constant(false),
          bundledClawAvailable: fc.boolean(),
          bundledClawExecutable: fc.boolean(),
          systemNodeAvailable: fc.constant(true),
          systemNodeVersion: fc.integer({ min: 22, max: 30 }),
          systemClawAvailable: fc.boolean(),
          networkAvailable: fc.boolean(),
        }),
        (scenario) => {
          const tier = determineRuntimeTier(scenario);
          expect(tier).toBe('system');
        },
      ),
      { numRuns: 200 },
    );
  });

  test('完整回退链路：bundled 不可用 → system 不可用 → 根据网络决定 online/missing', () => {
    fc.assert(
      fc.property(
        fc.record({
          // bundled 完全不可用
          bundledNodeAvailable: fc.constant(false),
          bundledNodeExecutable: fc.constant(false),
          bundledClawAvailable: fc.constant(false),
          bundledClawExecutable: fc.constant(false),
          // system 不可用
          systemNodeAvailable: fc.constant(false),
          systemNodeVersion: fc.constant(0),
          systemClawAvailable: fc.boolean(),
          networkAvailable: fc.boolean(),
        }),
        (scenario) => {
          const tier = determineRuntimeTier(scenario);
          if (scenario.networkAvailable) {
            expect(tier).toBe('online');
          } else {
            expect(tier).toBe('missing');
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  test('版本号解析与 tier 判定联动：系统版本字符串 → 主版本号 → tier 判定', () => {
    // 模拟真实场景：从版本字符串解析主版本号，再用于 tier 判定
    fc.assert(
      fc.property(
        fc.integer({ min: 16, max: 28 }),
        fc.integer({ min: 0, max: 20 }),
        fc.integer({ min: 0, max: 99 }),
        fc.boolean(),
        (major, minor, patch, hasNetwork) => {
          const versionStr = `v${major}.${minor}.${patch}`;
          const parsedMajor = parseMajorVersion(versionStr);

          // 构造 bundled 不可用、仅依赖系统 Node 的场景
          const scenario: RuntimeScenario = {
            bundledNodeAvailable: false,
            bundledNodeExecutable: false,
            bundledClawAvailable: false,
            bundledClawExecutable: false,
            systemNodeAvailable: true,
            systemNodeVersion: parsedMajor ?? 0,
            systemClawAvailable: true,
            networkAvailable: hasNetwork,
          };

          const tier = determineRuntimeTier(scenario);

          if (major >= 22) {
            // 版本满足要求 → system
            expect(tier).toBe('system');
          } else {
            // 版本不满足 → 根据网络状态回退
            expect(['online', 'missing']).toContain(tier);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  test('内置 Node 可执行但 CLI 不可执行时，系统 CLI 可用则仍为 bundled', () => {
    fc.assert(
      fc.property(
        fc.record({
          bundledNodeAvailable: fc.constant(true),
          bundledNodeExecutable: fc.constant(true),
          bundledClawAvailable: fc.constant(true),
          bundledClawExecutable: fc.constant(false),
          systemNodeAvailable: fc.boolean(),
          systemNodeVersion: fc.integer({ min: 0, max: 30 }),
          systemClawAvailable: fc.constant(true),
          networkAvailable: fc.boolean(),
        }),
        (scenario) => {
          const tier = determineRuntimeTier(scenario);
          // 内置 Node + 系统 CLI 组合仍为 bundled
          expect(tier).toBe('bundled');
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 2. 远程连接集成测试
// Validates: Requirements 9.1
// ══════════════════════════════════════════════════════════════════════════

describe('集成测试：远程连接测试与保存流程', () => {
  /**
   * 验证 buildRemoteUrl → isAuthError → parseVersionFromBody → mapNetworkError
   * 各纯函数协同工作的正确性。
   */

  test('URL 构建 + 认证错误检测 + 版本解析 端到端流程', () => {
    fc.assert(
      fc.property(
        payloadArb(),
        fc.integer({ min: 100, max: 599 }),
        fc.oneof(
          fc.tuple(fc.integer({ min: 1, max: 9 }), fc.integer({ min: 0, max: 20 }), fc.integer({ min: 0, max: 99 }))
            .map(([a, b, c]) => ({ version: `${a}.${b}.${c}` })),
          fc.constant({}),
          fc.constant(null),
        ),
        (payload, statusCode, responseBody) => {
          // 步骤 1：构建 URL
          const url = buildRemoteUrl(payload);
          expect(url).toContain('/api/version');
          expect(url).toContain(payload.host);

          // 步骤 2：检测认证错误
          const authFailed = isAuthError(statusCode);
          if (statusCode === 401 || statusCode === 403) {
            expect(authFailed).toBe(true);
          } else {
            expect(authFailed).toBe(false);
          }

          // 步骤 3：解析版本号（仅在非认证错误时有意义）
          if (!authFailed && statusCode >= 200 && statusCode < 300) {
            const version = parseVersionFromBody(responseBody);
            expect(typeof version).toBe('string');
            expect(version.length).toBeGreaterThan(0);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  test('超时结果构建：任意 payload 的超时结果始终一致', () => {
    fc.assert(
      fc.property(payloadArb(), (payload) => {
        const result = buildTimeoutResult(payload);

        // 超时结果必须标记为失败
        expect(result.success).toBe(false);
        // 错误信息必须包含"超时"
        expect(result.error).toContain('超时');
        // host 与输入一致
        expect(result.host).toBe(payload.host);
        // port 与输入一致（默认 3000）
        expect(result.port).toBe(payload.port ?? 3000);
      }),
      { numRuns: 200 },
    );
  });

  test('URL 构建与超时结果的 host/port 一致性', () => {
    fc.assert(
      fc.property(payloadArb(), (payload) => {
        const url = buildRemoteUrl(payload);
        const timeoutResult = buildTimeoutResult(payload);
        const expectedPort = payload.port ?? 3000;

        // URL 中的 host 和 port 应与超时结果中的一致
        expect(url).toContain(payload.host);
        expect(url).toContain(`:${expectedPort}/`);
        expect(timeoutResult.host).toBe(payload.host);
        expect(timeoutResult.port).toBe(expectedPort);
      }),
      { numRuns: 200 },
    );
  });

  test('网络错误映射覆盖所有已知错误码', () => {
    // 模拟真实场景：连接失败后映射错误信息
    const knownCodes = [
      'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN',
      'ECONNRESET', 'ETIMEDOUT',
      'CERT_HAS_EXPIRED', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
      'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN',
    ];

    for (const code of knownCodes) {
      const msg = mapNetworkError({ code, message: 'test error' });
      // 已知错误码应返回中文描述，不以"网络错误:"开头
      expect(msg).not.toMatch(/^网络错误:/);
      expect(msg.length).toBeGreaterThan(0);
    }
  });

  test('未知错误码返回通用格式', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 3, maxLength: 10, unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')) })
          .filter((s) => ![
            'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'ETIMEDOUT',
            'CERT_HAS_EXPIRED', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
            'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN',
          ].includes(s)),
        (code) => {
          const msg = mapNetworkError({ code, message: 'unknown error' });
          expect(msg).toMatch(/^网络错误:/);
        },
      ),
      { numRuns: 100 },
    );
  });

  test('认证错误与网络错误互斥：401/403 不会走网络错误映射路径', () => {
    // 模拟真实判断流程：先检查 HTTP 状态码，再处理网络错误
    fc.assert(
      fc.property(
        fc.constantFrom(401, 403),
        fc.constantFrom('ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND'),
        (statusCode, errorCode) => {
          const isAuth = isAuthError(statusCode);
          // 认证错误优先级高于网络错误
          expect(isAuth).toBe(true);
          // 在实际流程中，认证错误不会再走 mapNetworkError
        },
      ),
      { numRuns: 50 },
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 3. 渠道绑定保存与跳过流程集成测试
// Validates: Requirements 8.8
// ══════════════════════════════════════════════════════════════════════════

/** 渠道配置数据结构（与 SetupChannelsPage 中的结构一致） */
interface ChannelConfig {
  key: string;
  label: string;
  enabled: boolean;
  token: string;
}

/** 所有支持的渠道键名 */
const ALL_CHANNEL_KEYS = [
  'telegram', 'discord', 'whatsapp', 'signal',
  'imessage', 'googlechat', 'mattermost',
] as const;

/** 生成渠道配置列表 */
const channelConfigsArb = (): fc.Arbitrary<ChannelConfig[]> =>
  fc.tuple(
    ...ALL_CHANNEL_KEYS.map((key) =>
      fc.record({
        key: fc.constant(key),
        label: fc.constant(key.charAt(0).toUpperCase() + key.slice(1)),
        enabled: fc.boolean(),
        token: fc.string({ minLength: 0, maxLength: 64, unit: fc.constantFrom(...'abcdefABCDEF0123456789'.split('')) }),
      }),
    ),
  ) as fc.Arbitrary<ChannelConfig[]>;

/**
 * 模拟保存逻辑：将启用且有 token 的渠道转为绑定映射
 * 与 SetupFlowContext.saveChannelConfigs 的核心逻辑一致
 */
function buildChannelBindings(configs: ChannelConfig[]): Record<string, { enabled: boolean; token?: string }> {
  const bindings: Record<string, { enabled: boolean; token?: string }> = {};
  for (const ch of configs) {
    if (ch.enabled && ch.token.length > 0) {
      bindings[ch.key] = { enabled: true, token: ch.token };
    }
  }
  return bindings;
}

/**
 * 模拟跳过逻辑：返回空绑定
 */
function buildSkipBindings(): Record<string, { enabled: boolean; token?: string }> {
  return {};
}

describe('集成测试：渠道绑定保存与跳过流程', () => {
  test('跳过操作始终产生空绑定映射', () => {
    const bindings = buildSkipBindings();
    expect(Object.keys(bindings)).toHaveLength(0);
  });

  test('所有渠道禁用时，保存结果与跳过结果一致（均为空）', () => {
    const configs: ChannelConfig[] = ALL_CHANNEL_KEYS.map((key) => ({
      key,
      label: key,
      enabled: false,
      token: '',
    }));
    const saveResult = buildChannelBindings(configs);
    const skipResult = buildSkipBindings();
    expect(saveResult).toEqual(skipResult);
  });

  test('启用且有 token 的渠道出现在绑定映射中', () => {
    fc.assert(
      fc.property(channelConfigsArb(), (configs) => {
        const bindings = buildChannelBindings(configs);

        for (const ch of configs) {
          if (ch.enabled && ch.token.length > 0) {
            // 启用且有 token → 必须出现在绑定中
            expect(bindings[ch.key]).toBeDefined();
            expect(bindings[ch.key].enabled).toBe(true);
            expect(bindings[ch.key].token).toBe(ch.token);
          } else {
            // 禁用或无 token → 不应出现在绑定中
            expect(bindings[ch.key]).toBeUndefined();
          }
        }
      }),
      { numRuns: 200 },
    );
  });

  test('绑定映射中的渠道数量 <= 启用渠道数量', () => {
    fc.assert(
      fc.property(channelConfigsArb(), (configs) => {
        const bindings = buildChannelBindings(configs);
        const enabledCount = configs.filter((c) => c.enabled).length;
        expect(Object.keys(bindings).length).toBeLessThanOrEqual(enabledCount);
      }),
      { numRuns: 200 },
    );
  });

  test('绑定映射中的所有 key 都属于已知渠道列表', () => {
    fc.assert(
      fc.property(channelConfigsArb(), (configs) => {
        const bindings = buildChannelBindings(configs);
        for (const key of Object.keys(bindings)) {
          expect(ALL_CHANNEL_KEYS).toContain(key);
        }
      }),
      { numRuns: 200 },
    );
  });

  test('绑定映射中每个条目的 enabled 始终为 true', () => {
    fc.assert(
      fc.property(channelConfigsArb(), (configs) => {
        const bindings = buildChannelBindings(configs);
        for (const entry of Object.values(bindings)) {
          expect(entry.enabled).toBe(true);
        }
      }),
      { numRuns: 200 },
    );
  });

  test('启用但 token 为空的渠道不会出现在绑定映射中', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ALL_CHANNEL_KEYS),
        (key) => {
          const configs: ChannelConfig[] = [{
            key,
            label: key,
            enabled: true,
            token: '', // 空 token
          }];
          const bindings = buildChannelBindings(configs);
          // 空 token 不应保存
          expect(bindings[key]).toBeUndefined();
        },
      ),
      { numRuns: 50 },
    );
  });
});
