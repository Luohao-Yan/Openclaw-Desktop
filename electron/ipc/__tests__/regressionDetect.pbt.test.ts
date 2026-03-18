/**
 * 属性测试：修复回归检测
 * Feature: setup-flow-hardening
 *
 * 本文件包含 doctorLogic.ts 中 detectRegression 函数的属性测试。
 * - P17: 修复回归检测
 *
 * 验证修复前后环境快照对比的正确性：
 *   (a) after 出现 before 不存在的问题时 regressionDetected=true
 *   (b) 所有指标不劣于 before 时 regressionDetected=false
 *   (c) newIssues 精确列出 after 中新出现的问题
 */

import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';
import { detectRegression } from '../doctorLogic';
import type { EnvironmentSnapshot } from '../doctorLogic';

// ── 生成器（Arbitraries）──────────────────────────────────────────────────

/**
 * 生成问题描述字符串
 * 使用可打印 ASCII 字符组成的短字符串，模拟真实问题描述
 */
const issueArb = (): fc.Arbitrary<string> =>
  fc.stringMatching(/^[a-zA-Z0-9 _.,-]{1,30}$/);

/**
 * 生成去重的问题列表
 * 确保列表内无重复项，与 Set 语义一致
 */
const uniqueIssuesArb = (maxLen = 8): fc.Arbitrary<string[]> =>
  fc.uniqueArray(issueArb(), { maxLength: maxLen, comparator: 'IsStrictlyEqual' });

/**
 * 生成任意 EnvironmentSnapshot 对象
 */
const snapshotArb = (): fc.Arbitrary<EnvironmentSnapshot> =>
  fc.record({
    nodeAvailable: fc.boolean(),
    clawAvailable: fc.boolean(),
    gatewayRunning: fc.boolean(),
    issues: uniqueIssuesArb(),
  });

/**
 * 生成一对"无回归"的快照对：after 的所有指标均不劣于 before
 * - 布尔指标：before=false 时 after 可为任意值；before=true 时 after 必须为 true
 * - issues：after.issues 是 before.issues 的子集（无新增问题）
 */
const noRegressionPairArb = (): fc.Arbitrary<{ before: EnvironmentSnapshot; after: EnvironmentSnapshot }> =>
  fc.record({
    nodeAvailable: fc.boolean(),
    clawAvailable: fc.boolean(),
    gatewayRunning: fc.boolean(),
    issues: uniqueIssuesArb(),
  }).chain((before) =>
    fc.record({
      // 如果 before 为 true，after 也必须为 true（不劣化）
      // 如果 before 为 false，after 可以为任意值
      nodeAvailable: before.nodeAvailable ? fc.constant(true) : fc.boolean(),
      clawAvailable: before.clawAvailable ? fc.constant(true) : fc.boolean(),
      gatewayRunning: before.gatewayRunning ? fc.constant(true) : fc.boolean(),
      // after.issues 是 before.issues 的子集（随机选取部分）
      issues: fc.shuffledSubarray(before.issues),
    }).map((after) => ({ before, after })),
  );

/**
 * 生成一对"有新增 issues 回归"的快照对：after.issues 包含 before.issues 中不存在的条目
 */
const issueRegressionPairArb = (): fc.Arbitrary<{
  before: EnvironmentSnapshot;
  after: EnvironmentSnapshot;
  expectedNewIssues: string[];
}> =>
  fc.tuple(
    uniqueIssuesArb(5),
    // 生成至少 1 个新问题，确保与 before 不重复
    fc.uniqueArray(
      fc.stringMatching(/^NEW_[a-zA-Z0-9]{1,15}$/),
      { minLength: 1, maxLength: 4, comparator: 'IsStrictlyEqual' },
    ),
  ).map(([beforeIssues, newIssues]) => {
    // 确保 newIssues 与 beforeIssues 无交集
    const beforeSet = new Set(beforeIssues);
    const filteredNew = newIssues.filter((i) => !beforeSet.has(i));
    // 如果过滤后为空（极端情况），添加一个保底新问题
    const effectiveNew = filteredNew.length > 0 ? filteredNew : ['GUARANTEED_NEW_ISSUE'];

    const before: EnvironmentSnapshot = {
      nodeAvailable: true,
      clawAvailable: true,
      gatewayRunning: true,
      issues: beforeIssues,
    };
    const after: EnvironmentSnapshot = {
      nodeAvailable: true,
      clawAvailable: true,
      gatewayRunning: true,
      issues: [...beforeIssues, ...effectiveNew],
    };
    return { before, after, expectedNewIssues: effectiveNew };
  });

/**
 * 生成一对"布尔指标劣化"的快照对：至少一个布尔指标从 true 变为 false
 */
const boolRegressionPairArb = (): fc.Arbitrary<{
  before: EnvironmentSnapshot;
  after: EnvironmentSnapshot;
  regressedFlags: string[];
}> =>
  fc.record({
    // 至少一个指标为 true（才能劣化）
    nodeRegress: fc.boolean(),
    clawRegress: fc.boolean(),
    gatewayRegress: fc.boolean(),
  })
    .filter((r) => r.nodeRegress || r.clawRegress || r.gatewayRegress)
    .map(({ nodeRegress, clawRegress, gatewayRegress }) => {
      const before: EnvironmentSnapshot = {
        nodeAvailable: nodeRegress ? true : false,
        clawAvailable: clawRegress ? true : false,
        gatewayRunning: gatewayRegress ? true : false,
        issues: [],
      };
      const after: EnvironmentSnapshot = {
        nodeAvailable: nodeRegress ? false : false,
        clawAvailable: clawRegress ? false : false,
        gatewayRunning: gatewayRegress ? false : false,
        issues: [],
      };
      const regressedFlags: string[] = [];
      if (nodeRegress) regressedFlags.push('Node.js 在修复后变为不可用');
      if (clawRegress) regressedFlags.push('OpenClaw CLI 在修复后变为不可用');
      if (gatewayRegress) regressedFlags.push('Gateway 在修复后停止运行');
      return { before, after, regressedFlags };
    });

// ============================================================
// Property 17: 修复回归检测
// Feature: setup-flow-hardening
// ============================================================

describe('Feature: setup-flow-hardening, Property 17: 修复回归检测', () => {
  /**
   * Validates: Requirements 9.5
   *
   * (a) 当 after 中出现 before 中不存在的问题时，regressionDetected 为 true。
   * 通过在 after.issues 中注入 before.issues 不包含的条目来验证。
   */
  test('(a) after 出现 before 不存在的 issues 时 regressionDetected=true', () => {
    fc.assert(
      fc.property(issueRegressionPairArb(), ({ before, after }) => {
        const result = detectRegression(before, after);

        // 有新增问题 → 必须检测到回归
        expect(result.regressionDetected).toBe(true);
        // newIssues 不应为空
        expect(result.newIssues.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 9.5
   *
   * (a-2) 当布尔指标从 true 劣化为 false 时，regressionDetected 为 true。
   * nodeAvailable/clawAvailable/gatewayRunning 从 true → false 视为回归。
   */
  test('(a-2) 布尔指标从 true 劣化为 false 时 regressionDetected=true', () => {
    fc.assert(
      fc.property(boolRegressionPairArb(), ({ before, after, regressedFlags }) => {
        const result = detectRegression(before, after);

        // 有指标劣化 → 必须检测到回归
        expect(result.regressionDetected).toBe(true);
        // newIssues 应包含劣化描述
        for (const flag of regressedFlags) {
          expect(result.newIssues).toContain(flag);
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 9.5
   *
   * (b) 当 after 的所有指标均不劣于 before 时，regressionDetected 为 false。
   * 即：布尔指标不从 true→false，issues 无新增条目。
   */
  test('(b) 所有指标不劣于 before 时 regressionDetected=false', () => {
    fc.assert(
      fc.property(noRegressionPairArb(), ({ before, after }) => {
        const result = detectRegression(before, after);

        // 无回归 → regressionDetected 必须为 false
        expect(result.regressionDetected).toBe(false);
        // newIssues 应为空
        expect(result.newIssues).toEqual([]);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 9.5
   *
   * (c) newIssues 精确列出 after 中新出现的问题（issues 列表部分）。
   * 验证 newIssues 中的 issue 条目与 after.issues \ before.issues 的差集一致。
   */
  test('(c) newIssues 精确包含 after.issues 中新出现的条目', () => {
    fc.assert(
      fc.property(snapshotArb(), snapshotArb(), (before, after) => {
        const result = detectRegression(before, after);

        // 计算预期的新增 issues（after 中有但 before 中没有的）
        const beforeSet = new Set(before.issues);
        const expectedNewFromIssues = after.issues.filter((i) => !beforeSet.has(i));

        // newIssues 应包含所有新增的 issue 条目
        for (const issue of expectedNewFromIssues) {
          expect(result.newIssues).toContain(issue);
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 9.5
   *
   * (c-2) newIssues 精确包含布尔指标劣化产生的描述。
   * 当布尔指标从 true→false 时，对应的中文描述应出现在 newIssues 中。
   */
  test('(c-2) newIssues 包含布尔指标劣化的描述', () => {
    fc.assert(
      fc.property(snapshotArb(), snapshotArb(), (before, after) => {
        const result = detectRegression(before, after);

        // 检查每个布尔指标的劣化是否正确反映在 newIssues 中
        if (before.nodeAvailable && !after.nodeAvailable) {
          expect(result.newIssues).toContain('Node.js 在修复后变为不可用');
        }
        if (before.clawAvailable && !after.clawAvailable) {
          expect(result.newIssues).toContain('OpenClaw CLI 在修复后变为不可用');
        }
        if (before.gatewayRunning && !after.gatewayRunning) {
          expect(result.newIssues).toContain('Gateway 在修复后停止运行');
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 9.5
   *
   * regressionDetected 与 newIssues 一致性：
   * regressionDetected=true 当且仅当 newIssues.length > 0
   */
  test('regressionDetected=true 当且仅当 newIssues 非空', () => {
    fc.assert(
      fc.property(snapshotArb(), snapshotArb(), (before, after) => {
        const result = detectRegression(before, after);

        // 双向蕴含
        expect(result.regressionDetected).toBe(result.newIssues.length > 0);
      }),
      { numRuns: 100 },
    );
  });
});
