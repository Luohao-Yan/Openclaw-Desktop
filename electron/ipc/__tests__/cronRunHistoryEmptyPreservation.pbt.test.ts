/**
 * 属性测试：Cron 运行历史为空 Bugfix - 保留性验证
 * Feature: cron-run-history-empty-fix
 * 覆盖 Property 2: Preservation — normalizeCronRun 已有字段映射保留性
 *
 * 本测试在 **未修复代码** 上运行时必须 **通过**，
 * 确认 normalizeCronRun() 对标准字段的映射行为作为基线，
 * 修复后重新运行以确保无回归。
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
 */

import { describe, test, expect, vi } from 'vitest';
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
  runCommand: vi.fn(async () => ({
    success: true,
    output: '{}',
    error: '',
  })),
}));

// ── 导入被测函数 ──────────────────────────────────────────────────────────
import { normalizeCronRun } from '../cron';

// ============================================================================
// 生成器（Arbitraries）
// ============================================================================

/**
 * 生成非空字符串，用于标准字段值
 */
const nonEmptyStringArb = (): fc.Arbitrary<string> =>
  fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.length > 0);

/**
 * 生成包含所有标准字段的记录对象
 * 字段：id, runId, status, startedAt, finishedAt, summary
 */
const standardFieldsRecordArb = (): fc.Arbitrary<Record<string, unknown>> =>
  fc.record({
    id: nonEmptyStringArb(),
    runId: nonEmptyStringArb(),
    status: nonEmptyStringArb(),
    startedAt: nonEmptyStringArb(),
    finishedAt: nonEmptyStringArb(),
    summary: nonEmptyStringArb(),
  });

/**
 * 生成包含 message 但无 summary 的记录对象
 * 用于验证 message 作为 summary 备选的映射逻辑
 */
const messageOnlyRecordArb = (): fc.Arbitrary<Record<string, unknown>> =>
  fc.record({
    id: nonEmptyStringArb(),
    runId: nonEmptyStringArb(),
    status: nonEmptyStringArb(),
    startedAt: nonEmptyStringArb(),
    finishedAt: nonEmptyStringArb(),
    message: nonEmptyStringArb(),
  });

// ============================================================================
// Property 2: Preservation — normalizeCronRun 已有字段映射保留性
// Feature: cron-run-history-empty-fix
// ============================================================================

describe('Feature: cron-run-history-empty-fix, Property 2: 保留性验证', () => {
  /**
   * Validates: Requirements 3.1, 3.2, 3.3, 3.4
   *
   * 属性：对于任意包含标准字段（id, runId, status, startedAt, finishedAt, summary）的记录，
   * normalizeCronRun() 输出满足：
   * - id === raw.id
   * - runId === raw.runId
   * - status === raw.status
   * - startedAt === raw.startedAt
   * - finishedAt === raw.finishedAt
   * - summary === raw.summary
   * - raw === 原始对象引用
   */
  test('标准字段映射保留：所有标准 string 字段应原样映射', () => {
    fc.assert(
      fc.property(
        standardFieldsRecordArb(),
        (raw) => {
          const result = normalizeCronRun(raw);

          // 验证每个标准字段原样映射
          expect(result.id).toBe(raw.id);
          expect(result.runId).toBe(raw.runId);
          expect(result.status).toBe(raw.status);
          expect(result.startedAt).toBe(raw.startedAt);
          expect(result.finishedAt).toBe(raw.finishedAt);
          expect(result.summary).toBe(raw.summary);

          // 验证 raw 字段保留原始对象引用
          expect(result.raw).toBe(raw);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 3.4
   *
   * 额外属性：对于包含 message(string) 但无 summary 的记录，
   * normalizeCronRun().summary === raw.message
   * 验证 message 作为 summary 备选的映射逻辑保持不变
   */
  test('message 备选映射保留：无 summary 时 message 应映射为 summary', () => {
    fc.assert(
      fc.property(
        messageOnlyRecordArb(),
        (raw) => {
          const result = normalizeCronRun(raw);

          // summary 应等于 message（因为 raw 中无 summary 字段）
          expect(result.summary).toBe(raw.message);

          // 其他标准字段仍应正确映射
          expect(result.id).toBe(raw.id);
          expect(result.runId).toBe(raw.runId);
          expect(result.status).toBe(raw.status);
          expect(result.startedAt).toBe(raw.startedAt);
          expect(result.finishedAt).toBe(raw.finishedAt);

          // raw 字段保留原始对象引用
          expect(result.raw).toBe(raw);
        },
      ),
      { numRuns: 100 },
    );
  });
});
