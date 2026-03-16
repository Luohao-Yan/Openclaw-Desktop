/**
 * 属性测试：Runtime Resolver 三级回退优先级一致性
 * Feature: setup-flow-optimization
 * 覆盖 Property 1: 三级回退优先级一致性
 *
 * 由于 resolveRuntime() 依赖 Electron 环境和文件系统，无法直接在 vitest 中运行。
 * 因此提取纯函数 determineRuntimeTier(scenario) 封装核心决策逻辑，
 * 使用 fast-check 生成随机的运行时状态组合来验证解析逻辑的一致性。
 */

import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';
import { determineRuntimeTier, parseMajorVersion } from '../runtimeLogic';
import type { RuntimeScenario } from '../runtimeLogic';

// ── 有效的运行时层级集合 ──────────────────────────────────────────────────

/** 所有合法的 RuntimeTier 值 */
const VALID_TIERS = ['bundled', 'system', 'online', 'missing'] as const;

// ── 生成器（Arbitraries）──────────────────────────────────────────────────

/**
 * 生成随机的运行时场景
 * 覆盖所有布尔组合和不同的系统 Node.js 版本号
 */
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

/**
 * 生成 bundled 完整可用的场景（内置 Node.js 和 CLI 均存在且可执行）
 */
const bundledAvailableScenarioArb = (): fc.Arbitrary<RuntimeScenario> =>
  fc.record({
    bundledNodeAvailable: fc.constant(true),
    bundledNodeExecutable: fc.constant(true),
    bundledClawAvailable: fc.constant(true),
    bundledClawExecutable: fc.constant(true),
    // 以下字段随机，不影响 bundled 优先级
    systemNodeAvailable: fc.boolean(),
    systemNodeVersion: fc.integer({ min: 0, max: 30 }),
    systemClawAvailable: fc.boolean(),
    networkAvailable: fc.boolean(),
  });

/**
 * 生成 bundled 不完整但系统 Node.js >= 22 的场景
 */
const systemAvailableScenarioArb = (): fc.Arbitrary<RuntimeScenario> =>
  fc.record({
    // bundled 不完整：至少有一个条件不满足
    bundledNodeAvailable: fc.boolean(),
    bundledNodeExecutable: fc.constant(false), // 确保 bundled 路径不会命中
    bundledClawAvailable: fc.boolean(),
    bundledClawExecutable: fc.boolean(),
    // 系统 Node.js 可用且版本 >= 22
    systemNodeAvailable: fc.constant(true),
    systemNodeVersion: fc.integer({ min: 22, max: 30 }),
    systemClawAvailable: fc.boolean(),
    networkAvailable: fc.boolean(),
  });

// ============================================================
// Property 1: 三级回退优先级一致性
// Feature: setup-flow-optimization
// ============================================================

describe('Feature: setup-flow-optimization, Property 1: 三级回退优先级一致性', () => {
  /**
   * Validates: Requirements 2.1
   *
   * 对于任意随机生成的运行时场景，验证 determineRuntimeTier 的返回值
   * 始终符合三级回退优先级规则。
   */

  test('tier 值始终是有效的 RuntimeTier（bundled | system | online | missing）', () => {
    fc.assert(
      fc.property(runtimeScenarioArb(), (scenario) => {
        const tier = determineRuntimeTier(scenario);
        // tier 必须是四个合法值之一
        expect(VALID_TIERS).toContain(tier);
      }),
      { numRuns: 200 },
    );
  });

  test('当 bundledNode 和 bundledClaw 都可用且可执行时，tier 始终为 bundled', () => {
    fc.assert(
      fc.property(bundledAvailableScenarioArb(), (scenario) => {
        const tier = determineRuntimeTier(scenario);
        // 无论系统环境和网络状态如何，bundled 完整可用时 tier 必须是 bundled
        expect(tier).toBe('bundled');
      }),
      { numRuns: 200 },
    );
  });

  test('当 bundled 不可用但系统 Node.js >= 22 时，tier 为 system', () => {
    fc.assert(
      fc.property(systemAvailableScenarioArb(), (scenario) => {
        const tier = determineRuntimeTier(scenario);
        // bundled 路径不可用（Node.js 不可执行），系统 Node.js >= 22 时 tier 必须是 system
        expect(tier).toBe('system');
      }),
      { numRuns: 200 },
    );
  });

  test('当 bundled 和 system 都不可用时，tier 为 online 或 missing', () => {
    fc.assert(
      fc.property(
        fc.record({
          // bundled 不可用
          bundledNodeAvailable: fc.constant(false),
          bundledNodeExecutable: fc.constant(false),
          bundledClawAvailable: fc.constant(false),
          bundledClawExecutable: fc.constant(false),
          // 系统 Node.js 不可用
          systemNodeAvailable: fc.constant(false),
          systemNodeVersion: fc.integer({ min: 0, max: 30 }),
          systemClawAvailable: fc.boolean(),
          networkAvailable: fc.boolean(),
        }),
        (scenario) => {
          const tier = determineRuntimeTier(scenario);
          // 只能是 online 或 missing
          expect(['online', 'missing']).toContain(tier);
          // 具体取决于网络状态
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

  test('bundled 优先级始终高于 system：bundled 可用时不会返回 system', () => {
    fc.assert(
      fc.property(
        fc.record({
          bundledNodeAvailable: fc.constant(true),
          bundledNodeExecutable: fc.constant(true),
          bundledClawAvailable: fc.constant(true),
          bundledClawExecutable: fc.constant(true),
          // 系统也可用
          systemNodeAvailable: fc.constant(true),
          systemNodeVersion: fc.integer({ min: 22, max: 30 }),
          systemClawAvailable: fc.constant(true),
          networkAvailable: fc.boolean(),
        }),
        (scenario) => {
          const tier = determineRuntimeTier(scenario);
          // bundled 和 system 同时可用时，必须选择 bundled
          expect(tier).toBe('bundled');
        },
      ),
      { numRuns: 200 },
    );
  });

  test('系统 Node.js 版本低于 22 时不会返回 system', () => {
    fc.assert(
      fc.property(
        fc.record({
          bundledNodeAvailable: fc.constant(false),
          bundledNodeExecutable: fc.constant(false),
          bundledClawAvailable: fc.constant(false),
          bundledClawExecutable: fc.constant(false),
          systemNodeAvailable: fc.constant(true),
          systemNodeVersion: fc.integer({ min: 0, max: 21 }),
          systemClawAvailable: fc.boolean(),
          networkAvailable: fc.boolean(),
        }),
        (scenario) => {
          const tier = determineRuntimeTier(scenario);
          // 版本低于 22 时不应返回 system
          expect(tier).not.toBe('system');
        },
      ),
      { numRuns: 200 },
    );
  });

  test('内置 Node.js 可执行但 CLI 不可执行时，若系统 CLI 可用则仍为 bundled', () => {
    fc.assert(
      fc.property(
        fc.record({
          bundledNodeAvailable: fc.constant(true),
          bundledNodeExecutable: fc.constant(true),
          bundledClawAvailable: fc.constant(true),
          bundledClawExecutable: fc.constant(false), // CLI 不可执行
          systemNodeAvailable: fc.boolean(),
          systemNodeVersion: fc.integer({ min: 0, max: 30 }),
          systemClawAvailable: fc.constant(true), // 系统 CLI 可用作补充
          networkAvailable: fc.boolean(),
        }),
        (scenario) => {
          const tier = determineRuntimeTier(scenario);
          // 内置 Node.js + 系统 CLI 组合仍为 bundled
          expect(tier).toBe('bundled');
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ============================================================
// 辅助函数测试：parseMajorVersion
// ============================================================

describe('parseMajorVersion 版本号解析', () => {
  test('对于任意正整数版本号字符串，解析结果等于该整数', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 0, max: 99 }),
        fc.integer({ min: 0, max: 99 }),
        (major, minor, patch) => {
          const versionStr = `v${major}.${minor}.${patch}`;
          const result = parseMajorVersion(versionStr);
          expect(result).toBe(major);
        },
      ),
      { numRuns: 100 },
    );
  });

  test('不带 v 前缀的版本号同样能正确解析', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 0, max: 99 }),
        fc.integer({ min: 0, max: 99 }),
        (major, minor, patch) => {
          const versionStr = `${major}.${minor}.${patch}`;
          const result = parseMajorVersion(versionStr);
          expect(result).toBe(major);
        },
      ),
      { numRuns: 100 },
    );
  });

  test('空字符串和 undefined 返回 null', () => {
    expect(parseMajorVersion(undefined)).toBeNull();
    expect(parseMajorVersion('')).toBeNull();
  });
});
