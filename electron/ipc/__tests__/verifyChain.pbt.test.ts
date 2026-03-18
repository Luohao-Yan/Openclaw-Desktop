/**
 * 属性测试：验证链报告结构完整性
 * Feature: setup-flow-hardening, Property 9: 验证链报告结构完整性
 *
 * 本文件包含 verifyChainLogic.ts 的属性测试。
 * - P9: 验证链报告结构完整性
 *
 * 验证 buildVerifyChainResult 构建的 VerifyChainResult 满足：
 *   (a) steps 包含所有输入步骤
 *   (b) success=true 当且仅当所有步骤 success=true
 *   (c) 失败时 failedStep 指向第一个失败步骤
 */

import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';
import { buildVerifyChainResult } from '../verifyChainLogic';
import type { VerifyStep, VerifyStepResult } from '../verifyChainLogic';

// ── 常量 ─────────────────────────────────────────────────────────────────────

/** 所有合法的验证步骤标识 */
const ALL_VERIFY_STEPS: VerifyStep[] = [
  'doctor_fix',
  'cli_test',
  'gateway_status',
  'gateway_start',
  'final_check',
];

// ── 生成器（Arbitraries）──────────────────────────────────────────────────

/**
 * 生成合法的 VerifyStep 枚举值
 */
const verifyStepArb = (): fc.Arbitrary<VerifyStep> =>
  fc.constantFrom(...ALL_VERIFY_STEPS);

/**
 * 生成单个 VerifyStepResult
 * duration 为非负整数，retryCount 为 0-3 之间的整数
 */
const verifyStepResultArb = (): fc.Arbitrary<VerifyStepResult> =>
  fc.record({
    step: verifyStepArb(),
    success: fc.boolean(),
    message: fc.string({ minLength: 0, maxLength: 50 }),
    duration: fc.nat({ max: 30000 }),
    retryCount: fc.nat({ max: 3 }),
  });

/**
 * 生成所有步骤均成功的 VerifyStepResult 列表（至少 1 个步骤）
 */
const allSuccessStepsArb = (): fc.Arbitrary<VerifyStepResult[]> =>
  fc.array(
    fc.record({
      step: verifyStepArb(),
      success: fc.constant(true as boolean),
      message: fc.string({ minLength: 0, maxLength: 50 }),
      duration: fc.nat({ max: 30000 }),
      retryCount: fc.nat({ max: 3 }),
    }),
    { minLength: 1, maxLength: 10 },
  );

/**
 * 生成至少包含一个失败步骤的 VerifyStepResult 列表
 * 通过在随机位置插入一个 success=false 的步骤来保证
 */
const withFailureStepsArb = (): fc.Arbitrary<VerifyStepResult[]> =>
  fc.tuple(
    fc.array(verifyStepResultArb(), { minLength: 0, maxLength: 5 }),
    fc.record({
      step: verifyStepArb(),
      success: fc.constant(false as boolean),
      message: fc.string({ minLength: 0, maxLength: 50 }),
      duration: fc.nat({ max: 30000 }),
      retryCount: fc.nat({ max: 3 }),
    }),
    fc.array(verifyStepResultArb(), { minLength: 0, maxLength: 5 }),
  ).map(([before, failedStep, after]) => [...before, failedStep, ...after]);

/**
 * 生成任意长度的 VerifyStepResult 列表（可能为空）
 */
const anyStepsArb = (): fc.Arbitrary<VerifyStepResult[]> =>
  fc.array(verifyStepResultArb(), { minLength: 0, maxLength: 10 });

// ============================================================
// Property 9: 验证链报告结构完整性
// Feature: setup-flow-hardening
// ============================================================

describe('Feature: setup-flow-hardening, Property 9: 验证链报告结构完整性', () => {
  /**
   * Validates: Requirements 6.4
   *
   * (a) result.steps 包含所有输入步骤，顺序和内容一致。
   * 构建结果中的 steps 数组应与输入完全匹配。
   */
  test('(a) steps 包含所有输入步骤', () => {
    fc.assert(
      fc.property(anyStepsArb(), (inputSteps) => {
        const result = buildVerifyChainResult(inputSteps);

        // steps 长度应与输入一致
        expect(result.steps).toHaveLength(inputSteps.length);

        // 每个步骤的内容应与输入一致
        for (let i = 0; i < inputSteps.length; i++) {
          expect(result.steps[i].step).toBe(inputSteps[i].step);
          expect(result.steps[i].success).toBe(inputSteps[i].success);
          expect(result.steps[i].message).toBe(inputSteps[i].message);
          expect(result.steps[i].duration).toBe(inputSteps[i].duration);
          expect(result.steps[i].retryCount).toBe(inputSteps[i].retryCount);
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 6.4
   *
   * (b) success=true 当且仅当所有步骤 success=true。
   * 双向蕴含：所有步骤成功 ↔ 整体成功。
   * 空步骤列表视为失败（无步骤可验证）。
   */
  test('(b) success=true 当且仅当所有步骤 success=true', () => {
    fc.assert(
      fc.property(anyStepsArb(), (inputSteps) => {
        const result = buildVerifyChainResult(inputSteps);

        const allStepsSuccess =
          inputSteps.length > 0 && inputSteps.every((s) => s.success);

        // 双向蕴含验证
        expect(result.success).toBe(allStepsSuccess);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 6.4
   *
   * (b-补充) 所有步骤均成功时，success 必须为 true。
   * 使用专门的全成功生成器确保覆盖。
   */
  test('(b-补充) 所有步骤均成功时 success=true', () => {
    fc.assert(
      fc.property(allSuccessStepsArb(), (inputSteps) => {
        const result = buildVerifyChainResult(inputSteps);

        // 所有步骤成功 → 整体成功
        expect(result.success).toBe(true);
        // 无失败步骤
        expect(result.failedStep).toBeUndefined();
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 6.4
   *
   * (b-补充) 存在失败步骤时，success 必须为 false。
   * 使用专门的含失败步骤生成器确保覆盖。
   */
  test('(b-补充) 存在失败步骤时 success=false', () => {
    fc.assert(
      fc.property(withFailureStepsArb(), (inputSteps) => {
        const result = buildVerifyChainResult(inputSteps);

        // 存在失败步骤 → 整体失败
        expect(result.success).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 6.4
   *
   * (c) 当 success=false 时，failedStep 指向第一个失败步骤。
   * failedStep 应等于 steps 中第一个 success=false 的步骤标识。
   */
  test('(c) 失败时 failedStep 指向第一个失败步骤', () => {
    fc.assert(
      fc.property(withFailureStepsArb(), (inputSteps) => {
        const result = buildVerifyChainResult(inputSteps);

        // 找到输入中第一个失败步骤
        const firstFailed = inputSteps.find((s) => !s.success);

        // failedStep 应指向第一个失败步骤
        expect(result.failedStep).toBeDefined();
        expect(result.failedStep).toBe(firstFailed!.step);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 6.4
   *
   * (c-补充) 成功时 failedStep 为 undefined。
   */
  test('(c-补充) 成功时 failedStep 为 undefined', () => {
    fc.assert(
      fc.property(allSuccessStepsArb(), (inputSteps) => {
        const result = buildVerifyChainResult(inputSteps);

        expect(result.failedStep).toBeUndefined();
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 6.4
   *
   * totalDuration 等于所有步骤 duration 之和。
   */
  test('totalDuration 等于所有步骤 duration 之和', () => {
    fc.assert(
      fc.property(anyStepsArb(), (inputSteps) => {
        const result = buildVerifyChainResult(inputSteps);

        const expectedTotal = inputSteps.reduce((sum, s) => sum + s.duration, 0);
        expect(result.totalDuration).toBe(expectedTotal);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 6.4
   *
   * 失败时 suggestion 非空，成功时 suggestion 为 undefined。
   */
  test('失败时 suggestion 非空，成功时 suggestion 为 undefined', () => {
    fc.assert(
      fc.property(anyStepsArb(), (inputSteps) => {
        const result = buildVerifyChainResult(inputSteps);

        if (result.success) {
          expect(result.suggestion).toBeUndefined();
        } else if (result.failedStep) {
          // 有失败步骤时应提供修复建议
          expect(result.suggestion).toBeDefined();
          expect(typeof result.suggestion).toBe('string');
          expect(result.suggestion!.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 6.4
   *
   * 空步骤列表时 success=false，无 failedStep。
   */
  test('空步骤列表时 success=false', () => {
    const result = buildVerifyChainResult([]);

    expect(result.success).toBe(false);
    expect(result.steps).toHaveLength(0);
    expect(result.totalDuration).toBe(0);
    expect(result.failedStep).toBeUndefined();
  });
});
