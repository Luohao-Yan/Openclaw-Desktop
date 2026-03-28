/**
 * 属性测试：Stats_Aggregator 统计聚合模块
 * Feature: agent-enhancement-features
 *
 * 使用 fast-check 对 aggregateSessionStats 和 computeDailyMetrics 进行属性测试，
 * 验证统计聚合结构不变量、Token 消耗计算规则、响应时间过滤有效性、错误率计算正确性。
 *
 * Property 3: 统计聚合结构不变量（验证: 需求 9.1, 9.2, 9.7）
 * Property 4: Token 消耗计算规则（验证: 需求 9.3）
 * Property 5: 响应时间过滤有效性（验证: 需求 9.4）
 * Property 6: 错误率计算正确性（验证: 需求 9.5）
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import {
  aggregateSessionStats as aggregateRaw,
  computeDailyMetrics,
  type TranscriptEntry,
  type DailyStats,
} from '../statsAggregator';

/** 包装函数：返回 dailyStats 数组，兼容旧测试 */
function aggregateSessionStats(sessionsRoot: string) {
  return aggregateRaw(sessionsRoot).dailyStats;
}

// ============================================================================
// 生成器（Arbitraries）
// ============================================================================

/**
 * 生成有效的 Unix 时间戳范围（2020-01-01 到 2026-12-31 之间的毫秒数）
 */
const MIN_TS = new Date('2020-01-01T00:00:00.000Z').getTime();
const MAX_TS = new Date('2026-12-31T23:59:59.999Z').getTime();

/**
 * 生成有效的 ISO 8601 时间戳字符串
 * 使用整数毫秒数避免 fc.date 可能生成无效日期的问题
 */
const timestampArb = (): fc.Arbitrary<string> =>
  fc.integer({ min: MIN_TS, max: MAX_TS }).map((ms) => new Date(ms).toISOString());

/**
 * 生成指定日期的时间戳（同一天内随机时间）
 */
const timestampForDateArb = (dateStr: string): fc.Arbitrary<string> =>
  fc.integer({ min: 0, max: 86399999 }).map((ms) => {
    const base = new Date(`${dateStr}T00:00:00.000Z`);
    return new Date(base.getTime() + ms).toISOString();
  });

/**
 * 生成 YYYY-MM-DD 格式的日期字符串
 * 使用整数毫秒数确保生成有效日期
 */
const dateStrArb = (): fc.Arbitrary<string> =>
  fc.integer({ min: MIN_TS, max: MAX_TS }).map((ms) => new Date(ms).toISOString().slice(0, 10));

/**
 * 生成消息角色
 */
const roleArb = (): fc.Arbitrary<string> =>
  fc.constantFrom('user', 'assistant', 'system');

/**
 * 生成消息类型
 */
const typeArb = (): fc.Arbitrary<string> =>
  fc.constantFrom('message', 'error');

/**
 * 生成消息内容（非空字符串）
 */
const contentArb = (): fc.Arbitrary<string> =>
  fc.string({ minLength: 1, maxLength: 200 });

/**
 * 生成 totalTokens（可能为 null 或正整数）
 */
const totalTokensArb = (): fc.Arbitrary<number | null> =>
  fc.oneof(
    fc.constant(null),
    fc.integer({ min: 1, max: 10000 }),
  );

/**
 * 生成单条 TranscriptEntry
 */
const transcriptEntryArb = (): fc.Arbitrary<TranscriptEntry> =>
  fc.record({
    type: typeArb(),
    role: roleArb(),
    content: contentArb(),
    timestamp: timestampArb(),
    totalTokens: totalTokensArb(),
  }).map((e) => ({
    ...e,
    contentLength: e.content.length,
  }));

/**
 * 生成指定日期的 TranscriptEntry
 */
const transcriptEntryForDateArb = (dateStr: string): fc.Arbitrary<TranscriptEntry> =>
  fc.record({
    type: typeArb(),
    role: roleArb(),
    content: contentArb(),
    totalTokens: totalTokensArb(),
  }).chain((base) =>
    timestampForDateArb(dateStr).map((ts) => ({
      ...base,
      timestamp: ts,
      contentLength: base.content.length,
    })),
  );

/**
 * 将 TranscriptEntry 转换为 JSONL 行字符串
 */
function entryToJsonlLine(entry: TranscriptEntry): string {
  const obj: Record<string, any> = {
    type: entry.type,
    message: { role: entry.role, content: entry.content },
    timestamp: entry.timestamp,
  };
  if (entry.totalTokens !== null) {
    obj.usage = { total_tokens: entry.totalTokens };
  }
  return JSON.stringify(obj);
}

// ============================================================================
// 临时目录管理
// ============================================================================

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'stats-pbt-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// ============================================================================
// Property 3: 统计聚合结构不变量
// Feature: agent-enhancement-features, Property 3: 统计聚合结构不变量
// ============================================================================

describe('Feature: agent-enhancement-features, Property 3: 统计聚合结构不变量', () => {
  /**
   * **Validates: Requirements 9.1, 9.2, 9.7**
   *
   * 对任意包含有效时间戳的 TranscriptEntry 集合，aggregateSessionStats 的输出应满足：
   * (a) 每个唯一日期恰好对应一个 DailyStats 条目
   * (b) 输出数组按日期升序排列
   * (c) 每个 DailyStats 包含 date、tokenUsage、sessionCount、avgResponseMs、errorRate 全部五个字段
   */
  test('聚合结果满足结构不变量：唯一日期、升序排列、完整字段', () => {
    fc.assert(
      fc.property(
        // 生成 1~5 个不同日期，每个日期 1~5 条条目
        fc.array(dateStrArb(), { minLength: 1, maxLength: 5 })
          .chain((dates) => {
            // 去重日期
            const uniqueDates = [...new Set(dates)];
            // 为每个日期生成一组条目
            return fc.tuple(
              ...uniqueDates.map((d) =>
                fc.array(transcriptEntryForDateArb(d), { minLength: 1, maxLength: 5 })
                  .map((entries) => ({ date: d, entries })),
              ),
            );
          }),
        (dateGroups) => {
          // 创建 sessions 目录并写入 JSONL 文件
          const sessionsDir = join(tmpDir, `sessions-${Date.now()}-${Math.random().toString(36).slice(2)}`);
          mkdirSync(sessionsDir, { recursive: true });

          // 每个日期组写入一个 JSONL 文件
          dateGroups.forEach((group, idx) => {
            const lines = group.entries.map(entryToJsonlLine).join('\n');
            writeFileSync(join(sessionsDir, `session-${idx}.jsonl`), lines + '\n');
          });

          const result = aggregateSessionStats(sessionsDir);

          // (a) 每个唯一日期恰好对应一个 DailyStats 条目
          const resultDates = result.map((r) => r.date);
          const uniqueResultDates = new Set(resultDates);
          expect(resultDates.length).toBe(uniqueResultDates.size);

          // 验证所有输入日期都出现在结果中
          const inputDates = new Set(dateGroups.map((g) => g.date));
          for (const d of inputDates) {
            expect(uniqueResultDates.has(d)).toBe(true);
          }

          // (b) 输出数组按日期升序排列
          for (let i = 1; i < result.length; i++) {
            expect(result[i].date >= result[i - 1].date).toBe(true);
          }

          // (c) 每个 DailyStats 包含全部五个字段
          for (const stats of result) {
            expect(typeof stats.date).toBe('string');
            expect(stats.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
            expect(typeof stats.tokenUsage).toBe('number');
            expect(typeof stats.sessionCount).toBe('number');
            expect(typeof stats.avgResponseMs).toBe('number');
            expect(typeof stats.errorRate).toBe('number');
            // 数值合理性检查
            expect(stats.tokenUsage).toBeGreaterThanOrEqual(0);
            expect(stats.sessionCount).toBeGreaterThanOrEqual(1);
            expect(stats.avgResponseMs).toBeGreaterThanOrEqual(0);
            expect(stats.errorRate).toBeGreaterThanOrEqual(0);
            expect(stats.errorRate).toBeLessThanOrEqual(100);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});


// ============================================================================
// Property 4: Token 消耗计算规则
// Feature: agent-enhancement-features, Property 4: Token 消耗计算规则
// ============================================================================

describe('Feature: agent-enhancement-features, Property 4: Token 消耗计算规则', () => {
  /**
   * **Validates: Requirements 9.3**
   *
   * 对任意 TranscriptEntry，若 totalTokens 不为 null，则该条目的 Token 贡献应等于 totalTokens；
   * 若 totalTokens 为 null，则 Token 贡献应等于 Math.ceil(contentLength / 3)。
   * 对于任意一天的 DailyStats，tokenUsage 应等于该日所有条目 Token 贡献之和。
   */
  test('tokenUsage 等于所有条目 Token 贡献之和（优先 totalTokens，否则 ceil(contentLength/3)）', () => {
    fc.assert(
      fc.property(
        // 生成同一天的 1~10 条条目
        dateStrArb().chain((dateStr) =>
          fc.array(transcriptEntryForDateArb(dateStr), { minLength: 1, maxLength: 10 })
            .map((entries) => ({ dateStr, entries })),
        ),
        ({ dateStr, entries }) => {
          // 创建 sessions 目录并写入 JSONL 文件
          const sessionsDir = join(tmpDir, `sessions-tok-${Date.now()}-${Math.random().toString(36).slice(2)}`);
          mkdirSync(sessionsDir, { recursive: true });

          const lines = entries.map(entryToJsonlLine).join('\n');
          writeFileSync(join(sessionsDir, 'session.jsonl'), lines + '\n');

          const result = aggregateSessionStats(sessionsDir);

          // 计算期望的 Token 总量
          let expectedTokens = 0;
          for (const entry of entries) {
            if (entry.totalTokens !== null) {
              expectedTokens += entry.totalTokens;
            } else {
              expectedTokens += Math.ceil(entry.contentLength / 3);
            }
          }

          // 找到对应日期的结果
          const dayResult = result.find((r) => r.date === dateStr);
          expect(dayResult).toBeDefined();
          expect(dayResult!.tokenUsage).toBe(expectedTokens);
        },
      ),
      { numRuns: 100 },
    );
  });

  test('直接调用 computeDailyMetrics 验证单条目 Token 计算规则', () => {
    fc.assert(
      fc.property(
        transcriptEntryArb(),
        (entry) => {
          const metrics = computeDailyMetrics([entry], 1);

          // 计算期望的 Token 贡献
          const expectedTokens =
            entry.totalTokens !== null
              ? entry.totalTokens
              : Math.ceil(entry.contentLength / 3);

          expect(metrics.tokenUsage).toBe(expectedTokens);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ============================================================================
// Property 5: 响应时间过滤有效性
// Feature: agent-enhancement-features, Property 5: 响应时间过滤有效性
// ============================================================================

describe('Feature: agent-enhancement-features, Property 5: 响应时间过滤有效性', () => {
  /**
   * **Validates: Requirements 9.4**
   *
   * 对任意同一会话中的 user→assistant 消息对序列，avgResponseMs 的计算应仅包含
   * 时间差满足 0 < diff < 300000（毫秒）的消息对。
   * 任何时间差 ≤ 0 或 ≥ 300000 的消息对都不应参与平均值计算。
   */
  test('avgResponseMs 仅包含有效范围内的 user→assistant 消息对时间差', () => {
    /**
     * 生成 user→assistant 消息对序列，每对之间的时间差可能有效或无效
     * 通过精确控制时间差来验证过滤逻辑
     */
    const messagePairArb = fc.record({
      // 时间差（毫秒）：包含有效和无效范围
      diffMs: fc.oneof(
        // 有效范围：0 < diff < 300000
        fc.integer({ min: 1, max: 299999 }),
        // 无效：diff <= 0
        fc.integer({ min: -100000, max: 0 }),
        // 无效：diff >= 300000
        fc.integer({ min: 300000, max: 600000 }),
      ),
      userContent: contentArb(),
      assistantContent: contentArb(),
    });

    fc.assert(
      fc.property(
        fc.array(messagePairArb, { minLength: 1, maxLength: 8 }),
        (pairs) => {
          // 构造 TranscriptEntry 数组：交替 user 和 assistant
          const baseTime = new Date('2025-06-01T12:00:00.000Z').getTime();
          const entries: TranscriptEntry[] = [];
          let currentTime = baseTime;

          for (const pair of pairs) {
            // user 消息
            entries.push({
              type: 'message',
              role: 'user',
              content: pair.userContent,
              timestamp: new Date(currentTime).toISOString(),
              totalTokens: 10,
              contentLength: pair.userContent.length,
            });

            // assistant 消息（基于时间差）
            const assistantTime = currentTime + pair.diffMs;
            entries.push({
              type: 'message',
              role: 'assistant',
              content: pair.assistantContent,
              timestamp: new Date(assistantTime).toISOString(),
              totalTokens: 20,
              contentLength: pair.assistantContent.length,
            });

            // 下一对的起始时间（确保不重叠）
            currentTime = Math.max(currentTime, assistantTime) + 1000;
          }

          const metrics = computeDailyMetrics(entries, 1);

          // 手动计算期望的平均响应时间
          const validDiffs: number[] = [];
          for (const pair of pairs) {
            if (pair.diffMs > 0 && pair.diffMs < 300000) {
              validDiffs.push(pair.diffMs);
            }
          }

          if (validDiffs.length === 0) {
            // 无有效消息对时，平均响应时间应为 0
            expect(metrics.avgResponseMs).toBe(0);
          } else {
            const expectedAvg =
              validDiffs.reduce((sum, d) => sum + d, 0) / validDiffs.length;
            // 使用 toBeCloseTo 处理浮点精度
            expect(metrics.avgResponseMs).toBeCloseTo(expectedAvg, 5);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  test('仅包含无效时间差的消息对时，avgResponseMs 为 0', () => {
    fc.assert(
      fc.property(
        // 生成仅包含无效时间差的消息对
        fc.array(
          fc.oneof(
            fc.integer({ min: -100000, max: 0 }),
            fc.integer({ min: 300000, max: 600000 }),
          ),
          { minLength: 1, maxLength: 5 },
        ),
        (invalidDiffs) => {
          const baseTime = new Date('2025-06-01T12:00:00.000Z').getTime();
          const entries: TranscriptEntry[] = [];
          let currentTime = baseTime;

          for (const diff of invalidDiffs) {
            entries.push({
              type: 'message',
              role: 'user',
              content: 'q',
              timestamp: new Date(currentTime).toISOString(),
              totalTokens: 10,
              contentLength: 1,
            });
            entries.push({
              type: 'message',
              role: 'assistant',
              content: 'a',
              timestamp: new Date(currentTime + diff).toISOString(),
              totalTokens: 20,
              contentLength: 1,
            });
            currentTime = Math.max(currentTime, currentTime + diff) + 1000;
          }

          const metrics = computeDailyMetrics(entries, 1);
          expect(metrics.avgResponseMs).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});


// ============================================================================
// Property 6: 错误率计算正确性
// Feature: agent-enhancement-features, Property 6: 错误率计算正确性
// ============================================================================

describe('Feature: agent-enhancement-features, Property 6: 错误率计算正确性', () => {
  /**
   * **Validates: Requirements 9.5**
   *
   * 对任意 TranscriptEntry 集合，错误率应等于 (type === 'error' 的条目数 / 总条目数) * 100。
   * 当总条目数为 0 时，错误率应为 0。
   */
  test('errorRate 等于 (error 条目数 / 总条目数) * 100', () => {
    fc.assert(
      fc.property(
        // 生成 1~20 条条目，type 随机为 'message' 或 'error'
        fc.array(transcriptEntryArb(), { minLength: 1, maxLength: 20 }),
        (entries) => {
          const metrics = computeDailyMetrics(entries, 1);

          // 手动计算期望的错误率
          const errorCount = entries.filter((e) => e.type === 'error').length;
          const expectedErrorRate = (errorCount / entries.length) * 100;

          expect(metrics.errorRate).toBeCloseTo(expectedErrorRate, 10);
        },
      ),
      { numRuns: 100 },
    );
  });

  test('空条目数组时错误率为 0（不会除以零）', () => {
    // 空数组是确定性的，不需要 fc.property，但为保持一致性使用 fc.assert
    fc.assert(
      fc.property(
        fc.constant([] as TranscriptEntry[]),
        (entries) => {
          const metrics = computeDailyMetrics(entries, 0);
          expect(metrics.errorRate).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  test('全部为 error 类型时错误率为 100', () => {
    fc.assert(
      fc.property(
        // 生成 1~10 条全部为 error 类型的条目
        fc.array(
          transcriptEntryArb().map((e) => ({ ...e, type: 'error' })),
          { minLength: 1, maxLength: 10 },
        ),
        (entries) => {
          const metrics = computeDailyMetrics(entries, 1);
          expect(metrics.errorRate).toBe(100);
        },
      ),
      { numRuns: 100 },
    );
  });

  test('全部为 message 类型时错误率为 0', () => {
    fc.assert(
      fc.property(
        // 生成 1~10 条全部为 message 类型的条目
        fc.array(
          transcriptEntryArb().map((e) => ({ ...e, type: 'message' })),
          { minLength: 1, maxLength: 10 },
        ),
        (entries) => {
          const metrics = computeDailyMetrics(entries, 1);
          expect(metrics.errorRate).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});
