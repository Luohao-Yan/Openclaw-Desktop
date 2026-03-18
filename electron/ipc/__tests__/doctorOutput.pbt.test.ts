/**
 * 属性测试：Doctor 输出解析
 * Feature: setup-flow-hardening
 *
 * 本文件包含 doctorLogic.ts 的属性测试。
 * - P8: Doctor 输出解析完整性
 * - P16: Doctor 修复升级判断（后续任务 4.3 追加）
 */

import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  parseDoctorOutput,
  shouldEscalateToRepair,
  DEFAULT_MAX_RETRY,
} from '../doctorLogic';
import type { DoctorFixResult } from '../doctorLogic';

// ── 生成器（Arbitraries）──────────────────────────────────────────────────

/**
 * 生成问题描述字符串
 * 模拟真实 doctor 输出中的问题描述：可打印字符组成的单词，用空格连接。
 * 生成后已 trim，确保与实现的 trim() 行为一致。
 */
const issueDescriptionArb = (): fc.Arbitrary<string> =>
  fc.array(
    fc.stringMatching(/^[a-zA-Z0-9_.,-]{1,12}$/),
    { minLength: 1, maxLength: 6 },
  ).map((words) => words.join(' '));

/** Doctor 输出行的类型标记 */
type LineType = 'fixed' | 'failed' | 'remaining' | 'noise';

/** 带类型标记的行结构，用于验证解析结果 */
interface TaggedLine {
  type: LineType;
  description: string;
  raw: string;
}

/**
 * 生成一条 "✓ Fixed: <描述>" 行
 */
const fixedLineArb = (): fc.Arbitrary<TaggedLine> =>
  fc.tuple(
    issueDescriptionArb(),
    fc.boolean(), // 是否使用大写 Fixed
  ).map(([desc, upper]) => ({
    type: 'fixed' as const,
    description: desc,
    raw: `✓ ${upper ? 'Fixed' : 'fixed'}: ${desc}`,
  }));

/**
 * 生成一条 "✗ Failed: <描述>" 行
 */
const failedLineArb = (): fc.Arbitrary<TaggedLine> =>
  fc.tuple(
    issueDescriptionArb(),
    fc.boolean(), // 是否使用大写 Failed
  ).map(([desc, upper]) => ({
    type: 'failed' as const,
    description: desc,
    raw: `✗ ${upper ? 'Failed' : 'failed'}: ${desc}`,
  }));

/**
 * 生成一条 "⚠ Remaining: <描述>" 行
 */
const remainingLineArb = (): fc.Arbitrary<TaggedLine> =>
  fc.tuple(
    issueDescriptionArb(),
    fc.boolean(), // 是否使用大写 Remaining
  ).map(([desc, upper]) => ({
    type: 'remaining' as const,
    description: desc,
    raw: `⚠ ${upper ? 'Remaining' : 'remaining'}: ${desc}`,
  }));

/**
 * 生成一条噪声行（不匹配任何已知前缀）
 * 模拟 doctor 输出中的日志、进度信息等
 */
const noiseLineArb = (): fc.Arbitrary<TaggedLine> =>
  fc.oneof(
    fc.constant('Running doctor --fix...'),
    fc.constant('Checking configuration...'),
    fc.constant('Done.'),
    fc.constant(''),
    fc.stringMatching(/^[a-zA-Z0-9 ]{0,40}$/),
  ).map((raw) => ({
    type: 'noise' as const,
    description: '',
    raw,
  }));

/**
 * 生成任意一条 doctor 输出行（含类型标记）
 */
const taggedLineArb = (): fc.Arbitrary<TaggedLine> =>
  fc.oneof(
    fixedLineArb(),
    failedLineArb(),
    remainingLineArb(),
    noiseLineArb(),
  );

/**
 * 生成完整的 doctor 输出（多行，含类型标记数组）
 * 返回 [原始输出字符串, 带标记的行数组]
 */
const doctorOutputArb = (): fc.Arbitrary<{ output: string; lines: TaggedLine[] }> =>
  fc.array(taggedLineArb(), { minLength: 0, maxLength: 20 }).map((lines) => ({
    output: lines.map((l) => l.raw).join('\n'),
    lines,
  }));

// ============================================================
// Property 8: Doctor 输出解析完整性
// Feature: setup-flow-hardening
// ============================================================

describe('Feature: setup-flow-hardening, Property 8: Doctor 输出解析完整性', () => {
  /**
   * Validates: Requirements 3.2, 9.3
   *
   * (a) fixedIssues 和 remainingIssues 的并集覆盖输出中所有识别到的问题。
   * 即：所有 fixed 行的描述都在 fixedIssues 中，
   *     所有 failed/remaining 行的描述都在 remainingIssues 中。
   */
  test('(a) fixedIssues 和 remainingIssues 并集覆盖所有识别到的问题', () => {
    fc.assert(
      fc.property(doctorOutputArb(), ({ output, lines }) => {
        const result = parseDoctorOutput(output);

        // 从标记行中提取预期的 fixed 和 remaining 描述
        const expectedFixed = lines
          .filter((l) => l.type === 'fixed')
          .map((l) => l.description);
        const expectedRemaining = lines
          .filter((l) => l.type === 'failed' || l.type === 'remaining')
          .map((l) => l.description);

        // fixedIssues 应包含所有预期的 fixed 描述
        expect(result.fixedIssues).toEqual(expectedFixed);

        // remainingIssues 应包含所有预期的 remaining 描述
        expect(result.remainingIssues).toEqual(expectedRemaining);

        // 并集覆盖所有识别到的问题（非噪声行）
        const allParsed = [...result.fixedIssues, ...result.remainingIssues];
        const allExpected = [...expectedFixed, ...expectedRemaining];
        expect(allParsed.length).toBe(allExpected.length);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 3.2, 9.3
   *
   * (b) fixedIssues 和 remainingIssues 无交集。
   * 由于每行只匹配一个前缀（✓/✗/⚠），解析结果中不应出现同一描述
   * 同时存在于两个列表中。
   */
  test('(b) fixedIssues 和 remainingIssues 无交集', () => {
    fc.assert(
      fc.property(doctorOutputArb(), ({ output }) => {
        const result = parseDoctorOutput(output);

        const fixedSet = new Set(result.fixedIssues);
        const remainingSet = new Set(result.remainingIssues);

        // 检查两个集合无交集
        for (const issue of result.fixedIssues) {
          expect(remainingSet.has(issue)).toBe(false);
        }
        for (const issue of result.remainingIssues) {
          expect(fixedSet.has(issue)).toBe(false);
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 3.2, 9.3
   *
   * (c) needsRepair=true 当且仅当 remainingIssues 非空。
   * 双向蕴含：remainingIssues.length > 0 ↔ needsRepair === true
   */
  test('(c) needsRepair=true 当且仅当 remainingIssues 非空', () => {
    fc.assert(
      fc.property(doctorOutputArb(), ({ output }) => {
        const result = parseDoctorOutput(output);

        if (result.remainingIssues.length > 0) {
          // 有残留问题 → needsRepair 必须为 true
          expect(result.needsRepair).toBe(true);
        } else {
          // 无残留问题 → needsRepair 必须为 false
          expect(result.needsRepair).toBe(false);
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 3.2, 9.3
   *
   * success 字段与 needsRepair 互斥：
   * success=true 当且仅当 needsRepair=false（即 remainingIssues 为空）
   */
  test('success=true 当且仅当 remainingIssues 为空', () => {
    fc.assert(
      fc.property(doctorOutputArb(), ({ output }) => {
        const result = parseDoctorOutput(output);

        expect(result.success).toBe(result.remainingIssues.length === 0);
        expect(result.success).toBe(!result.needsRepair);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 3.2, 9.3
   *
   * 噪声行不影响解析结果：
   * 不匹配已知前缀的行不应出现在 fixedIssues 或 remainingIssues 中。
   */
  test('噪声行不影响解析结果', () => {
    fc.assert(
      fc.property(doctorOutputArb(), ({ output, lines }) => {
        const result = parseDoctorOutput(output);

        // 解析出的问题总数应等于非噪声行数
        const issueLineCount = lines.filter(
          (l) => l.type !== 'noise',
        ).length;
        const parsedCount = result.fixedIssues.length + result.remainingIssues.length;

        expect(parsedCount).toBe(issueLineCount);
      }),
      { numRuns: 100 },
    );
  });
});


// ── P16 生成器（Arbitraries）──────────────────────────────────────────────────

/**
 * 生成任意 DoctorFixResult 对象
 * 保持 success 和 needsRepair 与 remainingIssues 的一致性
 */
const doctorFixResultArb = (): fc.Arbitrary<DoctorFixResult> =>
  fc.tuple(
    fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 5 }),
    fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 5 }),
  ).map(([fixedIssues, remainingIssues]) => ({
    success: remainingIssues.length === 0,
    fixedIssues,
    remainingIssues,
    needsRepair: remainingIssues.length > 0,
    regressionDetected: false,
    newIssues: [],
  }));

/**
 * 生成 remainingIssues 为空的 DoctorFixResult（全部修复成功）
 */
const successFixResultArb = (): fc.Arbitrary<DoctorFixResult> =>
  fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 5 }).map(
    (fixedIssues) => ({
      success: true,
      fixedIssues,
      remainingIssues: [],
      needsRepair: false,
      regressionDetected: false,
      newIssues: [],
    }),
  );

/**
 * 生成 remainingIssues 非空的 DoctorFixResult（仍有残留问题）
 */
const failedFixResultArb = (): fc.Arbitrary<DoctorFixResult> =>
  fc.tuple(
    fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 5 }),
    fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 5 }),
  ).map(([fixedIssues, remainingIssues]) => ({
    success: false,
    fixedIssues,
    remainingIssues,
    needsRepair: true,
    regressionDetected: false,
    newIssues: [],
  }));

// ============================================================
// Property 16: Doctor 修复升级判断
// Feature: setup-flow-hardening
// ============================================================

describe('Feature: setup-flow-hardening, Property 16: Doctor 修复升级判断', () => {
  /**
   * Validates: Requirements 9.1
   *
   * (a) 当 remainingIssues 为空时返回 false（无需升级）。
   * 无论重试次数为多少，只要没有残留问题就不需要升级到 --repair。
   */
  test('(a) remainingIssues 为空时始终返回 false', () => {
    fc.assert(
      fc.property(
        successFixResultArb(),
        fc.nat({ max: 100 }),
        fc.nat({ max: 10 }),
        (fixResult, retryCount, maxRetry) => {
          // 确保 maxRetry 至少为 1，避免边界歧义
          const effectiveMaxRetry = Math.max(maxRetry, 1);
          const result = shouldEscalateToRepair(fixResult, retryCount, effectiveMaxRetry);

          // 无残留问题 → 永远不升级
          expect(result).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 9.1
   *
   * (b) 当重试次数已达上限且仍有残留问题时返回 true。
   * retryCount >= maxRetry 且 remainingIssues 非空 → 必须升级到 --repair。
   */
  test('(b) 重试达上限且有残留问题时返回 true', () => {
    fc.assert(
      fc.property(
        failedFixResultArb(),
        fc.nat({ max: 100 }),
        fc.nat({ max: 10 }),
        (fixResult, extraRetries, maxRetry) => {
          // 确保 maxRetry 至少为 1
          const effectiveMaxRetry = Math.max(maxRetry, 1);
          // retryCount >= effectiveMaxRetry（已达或超过上限）
          const retryCount = effectiveMaxRetry + extraRetries;
          const result = shouldEscalateToRepair(fixResult, retryCount, effectiveMaxRetry);

          // 有残留问题且已达上限 → 必须升级
          expect(result).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 9.1
   *
   * (c) 当 fixedIssues 非空但 remainingIssues 也非空时，未达上限则不升级。
   * 部分修复成功但仍有残留，如果重试次数未达上限，应继续重试 --fix。
   */
  test('(c) 有残留问题但未达重试上限时返回 false', () => {
    fc.assert(
      fc.property(
        failedFixResultArb(),
        fc.nat({ max: 10 }),
        (fixResult, maxRetry) => {
          // 确保 maxRetry >= 2，以便有空间生成 retryCount < maxRetry
          const effectiveMaxRetry = Math.max(maxRetry, 2);
          // retryCount 严格小于 maxRetry
          const retryCount = effectiveMaxRetry - 1;
          const result = shouldEscalateToRepair(fixResult, retryCount, effectiveMaxRetry);

          // 未达上限 → 继续重试，不升级
          expect(result).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 9.1
   *
   * 默认 maxRetry 参数使用 DEFAULT_MAX_RETRY 常量。
   * 验证不传 maxRetry 时使用默认值 2。
   */
  test('默认 maxRetry 使用 DEFAULT_MAX_RETRY 常量', () => {
    fc.assert(
      fc.property(
        failedFixResultArb(),
        fc.nat({ max: 100 }),
        (fixResult, retryCount) => {
          const withDefault = shouldEscalateToRepair(fixResult, retryCount);
          const withExplicit = shouldEscalateToRepair(fixResult, retryCount, DEFAULT_MAX_RETRY);

          // 使用默认参数和显式传入 DEFAULT_MAX_RETRY 结果应一致
          expect(withDefault).toBe(withExplicit);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 9.1
   *
   * 返回值始终为 boolean 类型。
   * 对于任意输入组合，shouldEscalateToRepair 应始终返回 true 或 false。
   */
  test('返回值始终为 boolean', () => {
    fc.assert(
      fc.property(
        doctorFixResultArb(),
        fc.nat({ max: 100 }),
        fc.nat({ max: 10 }),
        (fixResult, retryCount, maxRetry) => {
          const effectiveMaxRetry = Math.max(maxRetry, 1);
          const result = shouldEscalateToRepair(fixResult, retryCount, effectiveMaxRetry);

          expect(typeof result).toBe('boolean');
        },
      ),
      { numRuns: 100 },
    );
  });
});
