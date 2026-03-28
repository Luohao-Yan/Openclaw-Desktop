/**
 * 属性测试：HistoryStatsPanel 前端过滤与汇总计算
 * Feature: agent-enhancement-features
 *
 * 使用 fast-check 对 filterStatsByRange 和 computeSummary 进行属性测试，
 * 验证时间范围过滤正确性和汇总指标计算正确性。
 *
 * Property 7: 时间范围过滤正确性（验证: 需求 10.4）
 * Property 8: 汇总指标计算正确性（验证: 需求 10.7）
 */

import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';

import { filterStatsByRange, computeSummary } from '../HistoryStatsPanel';
import type { DailyStats } from '../../types/electron';

// ============================================================================
// 生成器（Arbitraries）
// ============================================================================

/**
 * 日期范围：2024-01-01 到 2026-12-31
 * 使用整数毫秒数确保生成有效日期
 */
const MIN_DATE_MS = new Date('2024-01-01T00:00:00.000Z').getTime();
const MAX_DATE_MS = new Date('2026-12-31T23:59:59.999Z').getTime();

/**
 * 生成 YYYY-MM-DD 格式的日期字符串（2024-01-01 到 2026-12-31 范围内）
 */
const dateStrArb = (): fc.Arbitrary<string> =>
  fc.integer({ min: MIN_DATE_MS, max: MAX_DATE_MS }).map((ms) =>
    new Date(ms).toISOString().slice(0, 10),
  );

/**
 * 生成单条 DailyStats 数据
 * - tokenUsage: 0 ~ 100000
 * - sessionCount: 0 ~ 500
 * - avgResponseMs: 0 ~ 60000
 * - errorRate: 0 ~ 100
 */
const dailyStatsArb = (): fc.Arbitrary<DailyStats> =>
  fc.record({
    date: dateStrArb(),
    tokenUsage: fc.integer({ min: 0, max: 100000 }),
    sessionCount: fc.integer({ min: 0, max: 500 }),
    avgResponseMs: fc.float({ min: 0, max: 60000, noNaN: true }),
    errorRate: fc.float({ min: 0, max: 100, noNaN: true }),
  });

/**
 * 生成 DailyStats 数组（0 ~ 50 条，日期可能重复）
 */
const dailyStatsArrayArb = (): fc.Arbitrary<DailyStats[]> =>
  fc.array(dailyStatsArb(), { minLength: 0, maxLength: 50 });

/**
 * 生成时间范围选项
 */
const timeRangeArb = (): fc.Arbitrary<'7d' | '30d' | 'all'> =>
  fc.constantFrom('7d' as const, '30d' as const, 'all' as const);

// ============================================================================
// Property 7: 时间范围过滤正确性
// Feature: agent-enhancement-features, Property 7: 时间范围过滤正确性
// ============================================================================

describe('Feature: agent-enhancement-features, Property 7: 时间范围过滤正确性', () => {
  /**
   * **Validates: Requirements 10.4**
   *
   * 对任意 DailyStats 数组和选定的时间范围（7 天、30 天、全部），
   * 过滤后的结果应仅包含日期在指定范围内的条目，且不遗漏任何符合条件的条目。
   */
  test('过滤结果仅包含范围内的条目，且不遗漏任何符合条件的条目', () => {
    fc.assert(
      fc.property(
        dailyStatsArrayArb(),
        timeRangeArb(),
        (stats, range) => {
          const filtered = filterStatsByRange(stats, range);

          if (range === 'all') {
            // 'all' 范围应返回全部数据
            expect(filtered).toEqual(stats);
            return;
          }

          // 计算截止日期字符串，与 filterStatsByRange 实现保持一致
          const now = new Date();
          now.setHours(23, 59, 59, 999);
          const days = range === '7d' ? 7 : 30;
          const cutoff = new Date(now);
          cutoff.setDate(cutoff.getDate() - days);
          const cutoffStr = cutoff.toISOString().slice(0, 10);

          // 验证：过滤结果中的每条数据日期都 >= cutoffStr
          for (const item of filtered) {
            expect(item.date >= cutoffStr).toBe(true);
          }

          // 验证：原始数据中所有日期 >= cutoffStr 的条目都出现在过滤结果中（不遗漏）
          const expectedFiltered = stats.filter((s) => s.date >= cutoffStr);
          expect(filtered).toEqual(expectedFiltered);

          // 验证：过滤结果是原始数组的子集（长度不超过原始数组）
          expect(filtered.length).toBeLessThanOrEqual(stats.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  test('空数组过滤后仍为空数组', () => {
    fc.assert(
      fc.property(
        timeRangeArb(),
        (range) => {
          const filtered = filterStatsByRange([], range);
          expect(filtered).toEqual([]);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ============================================================================
// Property 8: 汇总指标计算正确性
// Feature: agent-enhancement-features, Property 8: 汇总指标计算正确性
// ============================================================================

describe('Feature: agent-enhancement-features, Property 8: 汇总指标计算正确性', () => {
  /**
   * **Validates: Requirements 10.7**
   *
   * 对任意 DailyStats 数组，汇总值应满足：
   * - totalTokens = 所有日期 tokenUsage 之和
   * - totalSessions = 所有日期 sessionCount 之和
   * - avgResponseMs = 按 sessionCount 加权的平均响应时间
   * - avgErrorRate = 所有日期 errorRate 的简单平均（sum / count）
   */
  test('汇总指标满足计算规则：总和、加权平均、简单平均', () => {
    fc.assert(
      fc.property(
        // 至少 1 条数据，避免空数组的特殊情况（单独测试）
        fc.array(dailyStatsArb(), { minLength: 1, maxLength: 50 }),
        (stats) => {
          const summary = computeSummary(stats);

          // totalTokens = 所有 tokenUsage 之和
          const expectedTotalTokens = stats.reduce((sum, s) => sum + s.tokenUsage, 0);
          expect(summary.totalTokens).toBe(expectedTotalTokens);

          // totalSessions = 所有 sessionCount 之和
          const expectedTotalSessions = stats.reduce((sum, s) => sum + s.sessionCount, 0);
          expect(summary.totalSessions).toBe(expectedTotalSessions);

          // avgResponseMs = 按 sessionCount 加权的平均响应时间
          const weightedSum = stats.reduce(
            (sum, s) => sum + s.avgResponseMs * s.sessionCount,
            0,
          );
          const expectedAvgResponseMs =
            expectedTotalSessions > 0 ? weightedSum / expectedTotalSessions : 0;
          // 使用 toBeCloseTo 处理浮点精度问题
          expect(summary.avgResponseMs).toBeCloseTo(expectedAvgResponseMs, 5);

          // avgErrorRate = 所有 errorRate 的简单平均
          const errorRateSum = stats.reduce((sum, s) => sum + s.errorRate, 0);
          const expectedAvgErrorRate = errorRateSum / stats.length;
          expect(summary.avgErrorRate).toBeCloseTo(expectedAvgErrorRate, 5);
        },
      ),
      { numRuns: 100 },
    );
  });

  test('空数组时汇总指标全部为 0', () => {
    fc.assert(
      fc.property(
        fc.constant([] as DailyStats[]),
        (stats) => {
          const summary = computeSummary(stats);
          expect(summary.totalTokens).toBe(0);
          expect(summary.totalSessions).toBe(0);
          expect(summary.avgResponseMs).toBe(0);
          expect(summary.avgErrorRate).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  test('单条数据时汇总指标等于该条数据本身', () => {
    fc.assert(
      fc.property(
        dailyStatsArb(),
        (stat) => {
          const summary = computeSummary([stat]);

          expect(summary.totalTokens).toBe(stat.tokenUsage);
          expect(summary.totalSessions).toBe(stat.sessionCount);

          // 单条数据时，加权平均 = 该条的 avgResponseMs（如果 sessionCount > 0）
          if (stat.sessionCount > 0) {
            expect(summary.avgResponseMs).toBeCloseTo(stat.avgResponseMs, 5);
          } else {
            // sessionCount 为 0 时，加权平均无法计算，应为 0
            expect(summary.avgResponseMs).toBe(0);
          }

          // 单条数据时，简单平均 = 该条的 errorRate
          expect(summary.avgErrorRate).toBeCloseTo(stat.errorRate, 5);
        },
      ),
      { numRuns: 100 },
    );
  });
});
