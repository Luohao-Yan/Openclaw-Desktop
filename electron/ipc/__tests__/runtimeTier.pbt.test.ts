/**
 * 属性测试：运行时层级决策一致性
 * Feature: setup-flow-hardening, Property 4: 运行时层级决策一致性
 *
 * 验证 determineRuntimeTierWithReason 的核心决策逻辑：
 *   (a) 当 bundledNodeAvailable=true 且 bundledNodeExecutable=false 时，结果层级不为 bundled
 *   (b) 当结果层级不为 bundled 时，degradeReason 应为非空字符串
 *
 * Validates: Requirements 2.1, 2.4
 */

import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';
import { determineRuntimeTierWithReason } from '../runtimeLogic';
import type { RuntimeScenario, RuntimeTierResult } from '../runtimeLogic';

// ── 合法层级集合 ──────────────────────────────────────────────────────────

const VALID_TIERS = ['bundled', 'system', 'online', 'missing'] as const;

// ── 生成器（Arbitraries）──────────────────────────────────────────────────

/**
 * 生成任意 RuntimeScenario
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
 * 生成 bundledNodeAvailable=true 且 bundledNodeExecutable=false 的场景
 * 用于验证属性 (a)：此条件下结果层级不为 bundled
 */
const bundledNodeNotExecutableArb = (): fc.Arbitrary<RuntimeScenario> =>
  fc.record({
    bundledNodeAvailable: fc.constant(true),
    bundledNodeExecutable: fc.constant(false),
    bundledClawAvailable: fc.boolean(),
    bundledClawExecutable: fc.boolean(),
    systemNodeAvailable: fc.boolean(),
    systemNodeVersion: fc.integer({ min: 0, max: 30 }),
    systemClawAvailable: fc.boolean(),
    networkAvailable: fc.boolean(),
  });

// ============================================================
// Property 4: 运行时层级决策一致性
// Feature: setup-flow-hardening
// ============================================================

describe('Feature: setup-flow-hardening, Property 4: 运行时层级决策一致性', () => {
  /**
   * Validates: Requirements 2.1, 2.4
   *
   * 属性 (a): 当 bundledNodeAvailable=true 且 bundledNodeExecutable=false 时，
   * 结果层级不为 bundled。
   *
   * 原因：内置 Node.js 文件存在但不可执行（可能损坏或无权限），
   * 不应使用 bundled 层级。
   */
  test('(a) bundledNodeAvailable=true 且 bundledNodeExecutable=false 时，层级不为 bundled', () => {
    fc.assert(
      fc.property(bundledNodeNotExecutableArb(), (scenario) => {
        const result: RuntimeTierResult = determineRuntimeTierWithReason(scenario);

        // 内置 Node.js 不可执行时，决不应返回 bundled 层级
        expect(result.tier).not.toBe('bundled');
        // 返回值仍应是合法层级
        expect(VALID_TIERS).toContain(result.tier);
      }),
      { numRuns: 200 },
    );
  });

  /**
   * Validates: Requirements 2.4
   *
   * 属性 (b): 当结果层级不为 bundled 时，degradeReason 应为非空字符串。
   *
   * 原因：降级到非 bundled 层级时，用户需要知道降级原因以便排查问题。
   */
  test('(b) 非 bundled 层级时，degradeReason 为非空字符串', () => {
    fc.assert(
      fc.property(runtimeScenarioArb(), (scenario) => {
        const result: RuntimeTierResult = determineRuntimeTierWithReason(scenario);

        if (result.tier !== 'bundled') {
          // 非 bundled 层级时，degradeReason 必须存在且为非空字符串
          expect(result.degradeReason).toBeDefined();
          expect(typeof result.degradeReason).toBe('string');
          expect(result.degradeReason!.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 200 },
    );
  });

  /**
   * 综合验证：对任意场景，(a) 和 (b) 同时成立
   *
   * 确保两个子属性在所有输入空间上同时满足。
   */
  test('综合：任意场景下 (a) 和 (b) 同时成立', () => {
    fc.assert(
      fc.property(runtimeScenarioArb(), (scenario) => {
        const result: RuntimeTierResult = determineRuntimeTierWithReason(scenario);

        // 返回值始终是合法层级
        expect(VALID_TIERS).toContain(result.tier);

        // (a) bundledNodeAvailable=true 且 bundledNodeExecutable=false 时不返回 bundled
        if (scenario.bundledNodeAvailable && !scenario.bundledNodeExecutable) {
          expect(result.tier).not.toBe('bundled');
        }

        // (b) 非 bundled 层级时 degradeReason 非空
        if (result.tier !== 'bundled') {
          expect(result.degradeReason).toBeDefined();
          expect(typeof result.degradeReason).toBe('string');
          expect(result.degradeReason!.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 200 },
    );
  });
});
