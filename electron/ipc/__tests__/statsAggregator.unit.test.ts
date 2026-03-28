/**
 * 单元测试：statsAggregator.ts 统计聚合模块
 *
 * 验证核心纯函数的行为：
 * - aggregateSessionStats：聚合 sessions 目录下所有 JSONL 文件
 * - parseTranscriptFile：解析单个 JSONL 文件
 * - computeDailyMetrics：按日期计算指标
 *
 * 使用真实临时目录和 JSONL 文件进行测试，测试后清理。
 *
 * 验证需求: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import {
  aggregateSessionStats as aggregateRaw,
  parseTranscriptFile,
  computeDailyMetrics,
  type TranscriptEntry,
} from '../statsAggregator';

/** 包装函数：返回 dailyStats 数组，兼容旧测试 */
function aggregateSessionStats(sessionsRoot: string) {
  const result = aggregateRaw(sessionsRoot);
  return result.dailyStats;
}

// ============================================================================
// 辅助函数
// ============================================================================

/** 创建一条标准 JSONL 行 */
function jsonlLine(opts: {
  type?: string;
  role?: string;
  content?: string;
  timestamp?: string;
  totalTokens?: number | null;
}): string {
  const {
    type = 'message',
    role = 'user',
    content = 'hello',
    timestamp = '2025-01-15T10:00:00.000Z',
    totalTokens = null,
  } = opts;

  const obj: Record<string, any> = {
    type,
    message: { role, content },
    timestamp,
  };

  // 仅在 totalTokens 非 null 时添加 usage 字段
  if (totalTokens !== null) {
    obj.usage = { total_tokens: totalTokens };
  }

  return JSON.stringify(obj);
}

// ============================================================================
// 测试用临时目录管理
// ============================================================================

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'stats-test-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// ============================================================================
// 1. 空目录 → 返回 []
// ============================================================================

describe('aggregateSessionStats — 空目录', () => {
  it('目录不存在时返回空数组', () => {
    // 使用一个不存在的路径
    const result = aggregateSessionStats(join(tmpDir, 'nonexistent'));
    expect(result).toEqual([]);
  });

  it('目录存在但无 .jsonl 文件时返回空数组', () => {
    const sessionsDir = join(tmpDir, 'sessions');
    mkdirSync(sessionsDir);
    const result = aggregateSessionStats(sessionsDir);
    expect(result).toEqual([]);
  });

  it('目录中只有非 .jsonl 文件时返回空数组', () => {
    const sessionsDir = join(tmpDir, 'sessions');
    mkdirSync(sessionsDir);
    writeFileSync(join(sessionsDir, 'readme.txt'), 'not a jsonl file');
    writeFileSync(join(sessionsDir, 'data.json'), '{}');
    const result = aggregateSessionStats(sessionsDir);
    expect(result).toEqual([]);
  });
});

// ============================================================================
// 2. 单文件单行 → 正确的 DailyStats
// ============================================================================

describe('aggregateSessionStats — 单文件单行', () => {
  it('单个文件包含一条消息，返回正确的 DailyStats', () => {
    const sessionsDir = join(tmpDir, 'sessions');
    mkdirSync(sessionsDir);

    const line = jsonlLine({
      type: 'message',
      role: 'user',
      content: 'hello world',
      timestamp: '2025-01-15T10:00:00.000Z',
      totalTokens: 100,
    });
    writeFileSync(join(sessionsDir, 'session1.jsonl'), line + '\n');

    const result = aggregateSessionStats(sessionsDir);

    expect(result).toHaveLength(1);
    expect(result[0].date).toBe('2025-01-15');
    expect(result[0].tokenUsage).toBe(100);
    expect(result[0].sessionCount).toBe(1);
    // 只有一条消息，无 user→assistant 对，平均响应时间为 0
    expect(result[0].avgResponseMs).toBe(0);
    // 无错误条目，错误率为 0
    expect(result[0].errorRate).toBe(0);
  });
});

// ============================================================================
// 3. 多文件多日期 → 正确聚合
// ============================================================================

describe('aggregateSessionStats — 多文件多日期', () => {
  it('两个文件分属不同日期，返回两条按日期排序的 DailyStats', () => {
    const sessionsDir = join(tmpDir, 'sessions');
    mkdirSync(sessionsDir);

    // 文件 1：2025-01-15
    const file1Lines = [
      jsonlLine({ timestamp: '2025-01-15T10:00:00.000Z', totalTokens: 50 }),
      jsonlLine({ timestamp: '2025-01-15T10:01:00.000Z', totalTokens: 30 }),
    ].join('\n');
    writeFileSync(join(sessionsDir, 'session1.jsonl'), file1Lines + '\n');

    // 文件 2：2025-01-16
    const file2Lines = [
      jsonlLine({ timestamp: '2025-01-16T08:00:00.000Z', totalTokens: 200 }),
    ].join('\n');
    writeFileSync(join(sessionsDir, 'session2.jsonl'), file2Lines + '\n');

    const result = aggregateSessionStats(sessionsDir);

    expect(result).toHaveLength(2);
    // 按日期升序排列
    expect(result[0].date).toBe('2025-01-15');
    expect(result[1].date).toBe('2025-01-16');
    // 各日期的 token 总量
    expect(result[0].tokenUsage).toBe(80);
    expect(result[1].tokenUsage).toBe(200);
    // 各日期的会话数
    expect(result[0].sessionCount).toBe(1);
    expect(result[1].sessionCount).toBe(1);
  });

  it('两个文件属于同一日期，会话数为 2', () => {
    const sessionsDir = join(tmpDir, 'sessions');
    mkdirSync(sessionsDir);

    const line1 = jsonlLine({ timestamp: '2025-01-15T10:00:00.000Z', totalTokens: 50 });
    const line2 = jsonlLine({ timestamp: '2025-01-15T14:00:00.000Z', totalTokens: 70 });

    writeFileSync(join(sessionsDir, 'session1.jsonl'), line1 + '\n');
    writeFileSync(join(sessionsDir, 'session2.jsonl'), line2 + '\n');

    const result = aggregateSessionStats(sessionsDir);

    expect(result).toHaveLength(1);
    expect(result[0].date).toBe('2025-01-15');
    expect(result[0].tokenUsage).toBe(120);
    expect(result[0].sessionCount).toBe(2);
  });
});

// ============================================================================
// 4. 无效 JSONL 行 → 静默跳过
// ============================================================================

describe('parseTranscriptFile — 无效 JSONL 行', () => {
  it('无效 JSON 行被跳过，有效行正常解析', () => {
    const filePath = join(tmpDir, 'mixed.jsonl');
    const lines = [
      'this is not json',
      jsonlLine({ timestamp: '2025-01-15T10:00:00.000Z', totalTokens: 42 }),
      '{ broken json',
      '',
      jsonlLine({ timestamp: '2025-01-15T10:01:00.000Z', totalTokens: 58 }),
    ].join('\n');
    writeFileSync(filePath, lines);

    const entries = parseTranscriptFile(filePath);

    // 只有 2 条有效行
    expect(entries).toHaveLength(2);
    expect(entries[0].totalTokens).toBe(42);
    expect(entries[1].totalTokens).toBe(58);
  });

  it('全部无效行时返回空数组', () => {
    const filePath = join(tmpDir, 'invalid.jsonl');
    writeFileSync(filePath, 'bad line 1\nbad line 2\n');

    const entries = parseTranscriptFile(filePath);
    expect(entries).toEqual([]);
  });

  it('空文件返回空数组', () => {
    const filePath = join(tmpDir, 'empty.jsonl');
    writeFileSync(filePath, '');

    const entries = parseTranscriptFile(filePath);
    expect(entries).toEqual([]);
  });
});

// ============================================================================
// 5. 缺失 usage 字段 → 按 contentLength/3 估算
// ============================================================================

describe('Token 估算 — 缺失 usage 字段', () => {
  it('无 usage 字段时按 Math.ceil(contentLength / 3) 估算 token', () => {
    const sessionsDir = join(tmpDir, 'sessions');
    mkdirSync(sessionsDir);

    // content = 'abcdefghi'，长度 9，估算 token = ceil(9/3) = 3
    const line = jsonlLine({
      content: 'abcdefghi',
      timestamp: '2025-01-15T10:00:00.000Z',
      totalTokens: null,
    });
    writeFileSync(join(sessionsDir, 'session.jsonl'), line + '\n');

    const result = aggregateSessionStats(sessionsDir);

    expect(result).toHaveLength(1);
    expect(result[0].tokenUsage).toBe(3);
  });

  it('有 usage 字段时使用 totalTokens 值', () => {
    const sessionsDir = join(tmpDir, 'sessions');
    mkdirSync(sessionsDir);

    const line = jsonlLine({
      content: 'abcdefghi',
      timestamp: '2025-01-15T10:00:00.000Z',
      totalTokens: 999,
    });
    writeFileSync(join(sessionsDir, 'session.jsonl'), line + '\n');

    const result = aggregateSessionStats(sessionsDir);

    expect(result).toHaveLength(1);
    expect(result[0].tokenUsage).toBe(999);
  });

  it('混合有无 usage 的条目，token 总量正确', () => {
    const sessionsDir = join(tmpDir, 'sessions');
    mkdirSync(sessionsDir);

    // 条目 1：有 usage，totalTokens = 100
    // 条目 2：无 usage，content = 'abc'（长度 3），估算 = ceil(3/3) = 1
    const lines = [
      jsonlLine({ content: 'x', timestamp: '2025-01-15T10:00:00.000Z', totalTokens: 100 }),
      jsonlLine({ content: 'abc', timestamp: '2025-01-15T10:01:00.000Z', totalTokens: null }),
    ].join('\n');
    writeFileSync(join(sessionsDir, 'session.jsonl'), lines + '\n');

    const result = aggregateSessionStats(sessionsDir);

    expect(result).toHaveLength(1);
    // 100 + ceil(3/3) = 101
    expect(result[0].tokenUsage).toBe(101);
  });
});

// ============================================================================
// 6. 无效时间戳格式 → 条目被跳过
// ============================================================================

describe('parseTranscriptFile — 无效时间戳', () => {
  it('时间戳格式无效的条目被跳过', () => {
    const filePath = join(tmpDir, 'bad-ts.jsonl');
    const lines = [
      // 无效时间戳
      JSON.stringify({
        type: 'message',
        message: { role: 'user', content: 'bad' },
        timestamp: 'not-a-date',
      }),
      // 有效时间戳
      jsonlLine({ timestamp: '2025-01-15T10:00:00.000Z' }),
    ].join('\n');
    writeFileSync(filePath, lines);

    const entries = parseTranscriptFile(filePath);
    expect(entries).toHaveLength(1);
    expect(entries[0].timestamp).toBe('2025-01-15T10:00:00.000Z');
  });

  it('缺少 timestamp 字段的条目被跳过', () => {
    const filePath = join(tmpDir, 'no-ts.jsonl');
    const lines = [
      JSON.stringify({ type: 'message', message: { role: 'user', content: 'no ts' } }),
      jsonlLine({ timestamp: '2025-01-15T12:00:00.000Z' }),
    ].join('\n');
    writeFileSync(filePath, lines);

    const entries = parseTranscriptFile(filePath);
    expect(entries).toHaveLength(1);
  });

  it('timestamp 为数字类型的条目被跳过', () => {
    const filePath = join(tmpDir, 'num-ts.jsonl');
    const lines = [
      JSON.stringify({
        type: 'message',
        message: { role: 'user', content: 'num' },
        timestamp: 1234567890,
      }),
      jsonlLine({ timestamp: '2025-01-15T12:00:00.000Z' }),
    ].join('\n');
    writeFileSync(filePath, lines);

    const entries = parseTranscriptFile(filePath);
    expect(entries).toHaveLength(1);
  });
});

// ============================================================================
// 7. 响应时间计算：仅 user→assistant 对，0 < diff < 300000ms
// ============================================================================

describe('computeDailyMetrics — 响应时间计算', () => {
  it('有效的 user→assistant 对计算平均响应时间', () => {
    // user 在 T+0s，assistant 在 T+5s → diff = 5000ms
    const entries: TranscriptEntry[] = [
      {
        type: 'message',
        role: 'user',
        content: 'hi',
        timestamp: '2025-01-15T10:00:00.000Z',
        totalTokens: 10,
        contentLength: 2,
      },
      {
        type: 'message',
        role: 'assistant',
        content: 'hello',
        timestamp: '2025-01-15T10:00:05.000Z',
        totalTokens: 20,
        contentLength: 5,
      },
    ];

    const metrics = computeDailyMetrics(entries, 1);
    expect(metrics.avgResponseMs).toBe(5000);
  });

  it('时间差 <= 0 的消息对不参与计算', () => {
    // assistant 时间戳早于 user → diff < 0，应被排除
    const entries: TranscriptEntry[] = [
      {
        type: 'message',
        role: 'user',
        content: 'hi',
        timestamp: '2025-01-15T10:00:10.000Z',
        totalTokens: 10,
        contentLength: 2,
      },
      {
        type: 'message',
        role: 'assistant',
        content: 'hello',
        timestamp: '2025-01-15T10:00:05.000Z',
        totalTokens: 20,
        contentLength: 5,
      },
    ];

    const metrics = computeDailyMetrics(entries, 1);
    // 无有效响应时间对，平均为 0
    expect(metrics.avgResponseMs).toBe(0);
  });

  it('时间差 >= 300000ms 的消息对不参与计算', () => {
    // diff = 300000ms（恰好等于 300 秒），应被排除
    const entries: TranscriptEntry[] = [
      {
        type: 'message',
        role: 'user',
        content: 'hi',
        timestamp: '2025-01-15T10:00:00.000Z',
        totalTokens: 10,
        contentLength: 2,
      },
      {
        type: 'message',
        role: 'assistant',
        content: 'hello',
        timestamp: '2025-01-15T10:05:00.000Z',
        totalTokens: 20,
        contentLength: 5,
      },
    ];

    const metrics = computeDailyMetrics(entries, 1);
    // 300000ms 不满足 < 300000 条件，应被排除
    expect(metrics.avgResponseMs).toBe(0);
  });

  it('多个有效 user→assistant 对取平均值', () => {
    // 对 1：diff = 2000ms，对 2：diff = 4000ms → 平均 = 3000ms
    const entries: TranscriptEntry[] = [
      {
        type: 'message', role: 'user', content: 'q1',
        timestamp: '2025-01-15T10:00:00.000Z', totalTokens: 10, contentLength: 2,
      },
      {
        type: 'message', role: 'assistant', content: 'a1',
        timestamp: '2025-01-15T10:00:02.000Z', totalTokens: 20, contentLength: 2,
      },
      {
        type: 'message', role: 'user', content: 'q2',
        timestamp: '2025-01-15T10:00:10.000Z', totalTokens: 10, contentLength: 2,
      },
      {
        type: 'message', role: 'assistant', content: 'a2',
        timestamp: '2025-01-15T10:00:14.000Z', totalTokens: 20, contentLength: 2,
      },
    ];

    const metrics = computeDailyMetrics(entries, 1);
    expect(metrics.avgResponseMs).toBe(3000);
  });

  it('非 user→assistant 连续对不参与响应时间计算', () => {
    // user→user 和 assistant→assistant 不算有效对
    const entries: TranscriptEntry[] = [
      {
        type: 'message', role: 'user', content: 'q1',
        timestamp: '2025-01-15T10:00:00.000Z', totalTokens: 10, contentLength: 2,
      },
      {
        type: 'message', role: 'user', content: 'q2',
        timestamp: '2025-01-15T10:00:05.000Z', totalTokens: 10, contentLength: 2,
      },
      {
        type: 'message', role: 'assistant', content: 'a1',
        timestamp: '2025-01-15T10:00:10.000Z', totalTokens: 20, contentLength: 2,
      },
    ];

    const metrics = computeDailyMetrics(entries, 1);
    // 只有 entries[1](user) → entries[2](assistant) 是有效对，diff = 5000ms
    expect(metrics.avgResponseMs).toBe(5000);
  });

  it('无 user→assistant 对时平均响应时间为 0', () => {
    const entries: TranscriptEntry[] = [
      {
        type: 'message', role: 'system', content: 'init',
        timestamp: '2025-01-15T10:00:00.000Z', totalTokens: 5, contentLength: 4,
      },
    ];

    const metrics = computeDailyMetrics(entries, 1);
    expect(metrics.avgResponseMs).toBe(0);
  });
});

// ============================================================================
// 8. 错误率计算：type === 'error' 的条目
// ============================================================================

describe('computeDailyMetrics — 错误率计算', () => {
  it('无错误条目时错误率为 0', () => {
    const entries: TranscriptEntry[] = [
      {
        type: 'message', role: 'user', content: 'hi',
        timestamp: '2025-01-15T10:00:00.000Z', totalTokens: 10, contentLength: 2,
      },
      {
        type: 'message', role: 'assistant', content: 'hello',
        timestamp: '2025-01-15T10:00:05.000Z', totalTokens: 20, contentLength: 5,
      },
    ];

    const metrics = computeDailyMetrics(entries, 1);
    expect(metrics.errorRate).toBe(0);
  });

  it('全部为错误条目时错误率为 100', () => {
    const entries: TranscriptEntry[] = [
      {
        type: 'error', role: 'system', content: 'err1',
        timestamp: '2025-01-15T10:00:00.000Z', totalTokens: null, contentLength: 4,
      },
      {
        type: 'error', role: 'system', content: 'err2',
        timestamp: '2025-01-15T10:00:01.000Z', totalTokens: null, contentLength: 4,
      },
    ];

    const metrics = computeDailyMetrics(entries, 1);
    expect(metrics.errorRate).toBe(100);
  });

  it('部分错误条目时错误率正确计算', () => {
    // 4 条中 1 条 error → 25%
    const entries: TranscriptEntry[] = [
      {
        type: 'message', role: 'user', content: 'q',
        timestamp: '2025-01-15T10:00:00.000Z', totalTokens: 10, contentLength: 1,
      },
      {
        type: 'message', role: 'assistant', content: 'a',
        timestamp: '2025-01-15T10:00:01.000Z', totalTokens: 10, contentLength: 1,
      },
      {
        type: 'error', role: 'system', content: 'oops',
        timestamp: '2025-01-15T10:00:02.000Z', totalTokens: null, contentLength: 4,
      },
      {
        type: 'message', role: 'user', content: 'q2',
        timestamp: '2025-01-15T10:00:03.000Z', totalTokens: 10, contentLength: 2,
      },
    ];

    const metrics = computeDailyMetrics(entries, 1);
    expect(metrics.errorRate).toBe(25);
  });

  it('空条目数组时错误率为 0（不会除以零）', () => {
    const metrics = computeDailyMetrics([], 0);
    expect(metrics.errorRate).toBe(0);
  });
});

// ============================================================================
// 9. 会话数量：每个 .jsonl 文件 = 1 个会话
// ============================================================================

describe('aggregateSessionStats — 会话数量', () => {
  it('3 个 .jsonl 文件同一天 → sessionCount = 3', () => {
    const sessionsDir = join(tmpDir, 'sessions');
    mkdirSync(sessionsDir);

    for (let i = 1; i <= 3; i++) {
      const line = jsonlLine({
        timestamp: `2025-01-15T${String(8 + i).padStart(2, '0')}:00:00.000Z`,
        totalTokens: 10,
      });
      writeFileSync(join(sessionsDir, `session${i}.jsonl`), line + '\n');
    }

    const result = aggregateSessionStats(sessionsDir);

    expect(result).toHaveLength(1);
    expect(result[0].sessionCount).toBe(3);
  });

  it('跨日期的文件在各日期分别计数', () => {
    const sessionsDir = join(tmpDir, 'sessions');
    mkdirSync(sessionsDir);

    // 文件 1 包含两个日期的条目
    const file1Lines = [
      jsonlLine({ timestamp: '2025-01-15T23:59:00.000Z', totalTokens: 10 }),
      jsonlLine({ timestamp: '2025-01-16T00:01:00.000Z', totalTokens: 20 }),
    ].join('\n');
    writeFileSync(join(sessionsDir, 'session1.jsonl'), file1Lines + '\n');

    const result = aggregateSessionStats(sessionsDir);

    expect(result).toHaveLength(2);
    // 文件 1 跨两天，每天各贡献 1 个会话
    expect(result[0].date).toBe('2025-01-15');
    expect(result[0].sessionCount).toBe(1);
    expect(result[1].date).toBe('2025-01-16');
    expect(result[1].sessionCount).toBe(1);
  });
});

// ============================================================================
// 端到端综合场景
// ============================================================================

describe('aggregateSessionStats — 综合场景', () => {
  it('混合有效/无效行、有/无 usage、错误条目的完整场景', () => {
    const sessionsDir = join(tmpDir, 'sessions');
    mkdirSync(sessionsDir);

    // 文件 1：2025-01-15，包含有效行和无效行
    const file1Lines = [
      'invalid json line',
      jsonlLine({
        role: 'user', content: 'question',
        timestamp: '2025-01-15T10:00:00.000Z', totalTokens: 50,
      }),
      jsonlLine({
        role: 'assistant', content: 'answer',
        timestamp: '2025-01-15T10:00:03.000Z', totalTokens: 80,
      }),
      // 错误条目
      jsonlLine({
        type: 'error', role: 'system', content: 'timeout',
        timestamp: '2025-01-15T10:00:05.000Z', totalTokens: null,
      }),
    ].join('\n');
    writeFileSync(join(sessionsDir, 'session1.jsonl'), file1Lines + '\n');

    // 文件 2：2025-01-15，无 usage 字段
    const file2Lines = [
      jsonlLine({
        role: 'user', content: 'hello world!',
        timestamp: '2025-01-15T14:00:00.000Z', totalTokens: null,
      }),
    ].join('\n');
    writeFileSync(join(sessionsDir, 'session2.jsonl'), file2Lines + '\n');

    const result = aggregateSessionStats(sessionsDir);

    expect(result).toHaveLength(1);
    expect(result[0].date).toBe('2025-01-15');
    // 会话数：2 个文件
    expect(result[0].sessionCount).toBe(2);
    // Token：50 + 80 + ceil('timeout'.length/3) + ceil('hello world!'.length/3)
    // = 50 + 80 + ceil(7/3) + ceil(12/3) = 50 + 80 + 3 + 4 = 137
    expect(result[0].tokenUsage).toBe(137);
    // 错误率：1 error / 4 total = 25%
    expect(result[0].errorRate).toBe(25);
    // 响应时间：只有 file1 的 user→assistant 对，diff = 3000ms
    expect(result[0].avgResponseMs).toBe(3000);
  });
});
