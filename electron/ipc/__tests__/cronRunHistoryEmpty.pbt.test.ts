/**
 * 属性测试：Cron 运行历史为空 Bugfix - Bug Condition 探索
 * Feature: cron-run-history-empty-fix
 * 覆盖 Property 1: Bug Condition — JSONL 文件读取与解析
 *
 * 本测试编码的是 **期望行为（正确行为）**：
 * - cronRuns(jobId) 应直接读取 ~/.openclaw/cron/runs/{jobId}.jsonl 文件
 * - 逐行解析 JSONL 内容，正确映射字段为 CronRunRecord
 * - sessionId → id, runAtMs → startedAt (ISO), ts → finishedAt (ISO), status/summary 直接映射
 *
 * 在未修复代码上运行时，测试应 **失败**（证明 bug 存在）：
 * 1. cronRuns() 使用 CLI 命令而非文件读取 — mock fs/promises.readFile 不会影响它
 * 2. normalizeCronRun() 不映射 JSONL 字段（sessionId、runAtMs、ts）
 *
 * **Validates: Requirements 1.1, 2.1**
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

// ── Mock 依赖：阻止 electron 在测试环境中初始化 ──────────────────────────
vi.mock('electron', () => ({
  default: { ipcMain: { handle: vi.fn() } },
  ipcMain: { handle: vi.fn() },
}));

vi.mock('../settings.js', () => ({
  resolveOpenClawCommand: vi.fn(() => '/usr/local/bin/openclaw'),
  getShellPath: vi.fn(async () => '/usr/local/bin:/usr/bin:/bin'),
  getOpenClawRootDir: vi.fn(() => '/tmp/.openclaw-test'),
  // runCommand mock：模拟 CLI 命令返回空结果（当前代码依赖 CLI）
  runCommand: vi.fn(async () => ({
    success: true,
    output: '{}',
    error: '',
  })),
}));

// ── Mock os.homedir() 控制文件路径 ──────────────────────────────────────
vi.mock('os', async (importOriginal) => {
  const original = await importOriginal<typeof import('os')>();
  return {
    ...original,
    default: {
      ...original,
      homedir: vi.fn(() => '/tmp/mock-home-crontest'),
    },
    homedir: vi.fn(() => '/tmp/mock-home-crontest'),
  };
});

// ── Mock fs/promises：返回构造的 JSONL 内容 ─────────────────────────────
// 用变量存储当前测试要返回的 JSONL 内容
let mockJsonlContent = '';

vi.mock('fs/promises', async (importOriginal) => {
  const original = await importOriginal<typeof import('fs/promises')>();
  return {
    ...original,
    default: {
      ...original,
      readFile: vi.fn(async (filePath: string, _encoding?: string) => {
        // 仅拦截 JSONL 文件路径
        if (typeof filePath === 'string' && filePath.endsWith('.jsonl')) {
          return mockJsonlContent;
        }
        return original.readFile(filePath, _encoding as BufferEncoding);
      }),
    },
    readFile: vi.fn(async (filePath: string, _encoding?: string) => {
      // 仅拦截 JSONL 文件路径
      if (typeof filePath === 'string' && filePath.endsWith('.jsonl')) {
        return mockJsonlContent;
      }
      return original.readFile(filePath, _encoding as BufferEncoding);
    }),
  };
});

// ── 导入被测模块 ──────────────────────────────────────────────────────────
import { cronRuns } from '../cron';

// ============================================================================
// 生成器（Arbitraries）
// ============================================================================

/**
 * 生成合法的 jobId 字符串
 */
const jobIdArb = (): fc.Arbitrary<string> =>
  fc.stringMatching(/^[a-z0-9_-]{3,20}$/).filter((s) => s.length >= 3);

/**
 * 生成合法的 sessionId 字符串
 */
const sessionIdArb = (): fc.Arbitrary<string> =>
  fc.stringMatching(/^[a-zA-Z0-9_-]{5,30}$/);

/**
 * 生成合法的 status 字符串
 */
const statusArb = (): fc.Arbitrary<string> =>
  fc.constantFrom('ok', 'error', 'timeout', 'running', 'cancelled');

/**
 * 生成合法的 summary 字符串
 */
const summaryArb = (): fc.Arbitrary<string> =>
  fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0);

/**
 * 生成合理的毫秒时间戳（2020-01-01 到 2030-01-01 之间）
 */
const timestampMsArb = (): fc.Arbitrary<number> =>
  fc.integer({ min: 1577836800000, max: 1893456000000 });

/**
 * 生成合法的 durationMs（0 到 600000 毫秒，即 0 到 10 分钟）
 */
const durationMsArb = (): fc.Arbitrary<number> =>
  fc.integer({ min: 0, max: 600000 });

/**
 * 生成单条 JSONL 行对象，包含 JSONL 文件中的实际字段格式
 * 字段：ts, jobId, sessionId, status, summary, runAtMs, durationMs
 */
const jsonlLineArb = (jobId: string): fc.Arbitrary<{
  ts: number;
  jobId: string;
  sessionId: string;
  status: string;
  summary: string;
  runAtMs: number;
  durationMs: number;
}> =>
  fc.tuple(
    timestampMsArb(),   // ts（完成时间戳）
    sessionIdArb(),     // sessionId
    statusArb(),        // status
    summaryArb(),       // summary
    timestampMsArb(),   // runAtMs（开始时间戳）
    durationMsArb(),    // durationMs
  ).map(([ts, sessionId, status, summary, runAtMs, durationMs]) => ({
    ts,
    jobId,
    sessionId,
    status,
    summary,
    runAtMs,
    durationMs,
  }));

/**
 * 生成 JSONL 行对象数组（1 到 10 行）
 */
const jsonlLinesArb = (jobId: string): fc.Arbitrary<Array<{
  ts: number;
  jobId: string;
  sessionId: string;
  status: string;
  summary: string;
  runAtMs: number;
  durationMs: number;
}>> =>
  fc.array(jsonlLineArb(jobId), { minLength: 1, maxLength: 10 });

// ============================================================================
// 测试辅助
// ============================================================================

/**
 * 将 JSONL 行对象数组序列化为多行 JSONL 字符串
 */
function toJsonlString(lines: Array<Record<string, unknown>>): string {
  return lines.map((line) => JSON.stringify(line)).join('\n');
}

// ============================================================================
// Property 1: Bug Condition — JSONL 文件读取与解析
// Feature: cron-run-history-empty-fix
// ============================================================================

describe('Feature: cron-run-history-empty-fix, Property 1: Bug Condition 探索', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockJsonlContent = '';
  });

  /**
   * Validates: Requirements 1.1, 2.1
   *
   * 属性测试：生成随机 JSONL 行对象，序列化为 JSONL 字符串，
   * mock fs/promises.readFile 返回该内容，调用 cronRuns(jobId)，
   * 断言返回的 runs 数量等于有效 JSONL 行数，且每条记录字段正确映射。
   *
   * 在未修复代码上：
   * - cronRuns() 使用 CLI 命令（runCommand），不读取文件
   * - mock 的 runCommand 返回 '{}'，tryParseJson 解析为空对象
   * - 空对象不匹配三种解析路径，list 为空数组
   * → 测试失败（runs.length === 0 而非预期的行数）→ 证明 bug 存在
   */
  test('cronRuns 应读取 JSONL 文件并返回正确数量的运行记录', async () => {
    await fc.assert(
      fc.asyncProperty(
        jobIdArb(),
        fc.integer({ min: 1, max: 10 }),
        async (jobId, lineCount) => {
          // 生成指定数量的 JSONL 行
          const lines = await fc.sample(jsonlLineArb(jobId), lineCount);

          // 序列化为 JSONL 字符串并设置 mock 返回值
          mockJsonlContent = toJsonlString(lines);

          // 调用被测函数
          const result = await cronRuns(jobId);

          // 断言：返回成功且 runs 数量等于有效行数
          expect(result.success).toBe(true);
          expect(result.runs.length).toBe(lineCount);
        },
      ),
      { numRuns: 30 },
    );
  });

  /**
   * Validates: Requirements 2.1
   *
   * 属性测试：验证每条 CronRunRecord 的字段正确映射：
   * - id ← sessionId
   * - startedAt ← runAtMs（转为 ISO 字符串）
   * - finishedAt ← ts（转为 ISO 字符串）
   * - status 直接映射
   * - summary 直接映射
   *
   * 在未修复代码上：
   * - 即使能获取到记录，normalizeCronRun() 也不映射 sessionId/runAtMs/ts
   * - id、startedAt、finishedAt 全为 undefined
   * → 测试失败 → 证明 bug 存在
   */
  test('cronRuns 返回的每条记录应正确映射 JSONL 字段', async () => {
    await fc.assert(
      fc.asyncProperty(
        jobIdArb(),
        async (jobId) => {
          // 生成 1-5 条 JSONL 行
          const lines = await fc.sample(jsonlLineArb(jobId), 3);

          // 序列化并设置 mock
          mockJsonlContent = toJsonlString(lines);

          // 调用被测函数
          const result = await cronRuns(jobId);

          // 断言：返回成功
          expect(result.success).toBe(true);
          expect(result.runs.length).toBe(lines.length);

          // 验证每条记录的字段映射
          // 注意：修复后 cronRuns 会按 ts 降序排序，所以需要先排序 lines 再比较
          const sortedLines = [...lines].sort((a, b) => b.ts - a.ts);

          for (let i = 0; i < result.runs.length; i++) {
            const run = result.runs[i];
            const line = sortedLines[i];

            // id ← sessionId
            expect(run.id).toBe(line.sessionId);

            // startedAt ← runAtMs（ISO 字符串）
            expect(run.startedAt).toBe(new Date(line.runAtMs).toISOString());

            // finishedAt ← ts（ISO 字符串）
            expect(run.finishedAt).toBe(new Date(line.ts).toISOString());

            // status 直接映射
            expect(run.status).toBe(line.status);

            // summary 直接映射
            expect(run.summary).toBe(line.summary);
          }
        },
      ),
      { numRuns: 30 },
    );
  });
});
