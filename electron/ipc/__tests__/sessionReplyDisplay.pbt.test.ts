/**
 * 属性测试：Session 回复显示 Bug 修复
 * Feature: session-reply-display-fix
 *
 * 本文件包含两组测试：
 * - Property 1: Bug Condition 探索测试（修复前预期失败，修复后通过）
 * - Property 2: Preservation 属性测试（修复前后都应通过）
 *
 * 【重要】：Bug Condition 测试在未修复代码（stub 实现）上运行时预期失败，
 * 因为 stub 仅执行单次调用，不包含重试逻辑。
 * Preservation 测试在 stub 和修复后的实现上都应通过。
 */

import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';
import { retryRefreshTranscript } from '../../../src/pages/sessions/sessionRetryLogic';

// ── 辅助工具 ──────────────────────────────────────────────────

/**
 * 创建一个模拟的 refreshFn：前 N-1 次返回空数组，第 N 次返回非空 transcript
 *
 * @param successOnAttempt - 在第几次调用时返回非空结果（从 1 开始计数）
 * @param transcript - 成功时返回的 transcript 数据
 * @returns 模拟的 refreshFn 函数
 */
function createMockRefreshFn(
  successOnAttempt: number,
  transcript: any[],
): () => Promise<any[]> {
  let callCount = 0;
  return async () => {
    callCount++;
    if (callCount >= successOnAttempt) {
      return transcript;
    }
    return [];
  };
}

/**
 * 创建一个始终返回空数组的 refreshFn（模拟全部重试失败的场景）
 *
 * @returns 始终返回空数组的 refreshFn
 */
function createAlwaysEmptyRefreshFn(): () => Promise<any[]> {
  return async () => [];
}

/**
 * 生成非空 transcript 数组的 arbitrary
 * 至少包含一条消息记录
 */
const nonEmptyTranscriptArb = (): fc.Arbitrary<any[]> =>
  fc.array(
    fc.record({
      role: fc.constantFrom('user', 'assistant'),
      content: fc.string({ minLength: 1, maxLength: 100 }),
      timestamp: fc.string({ minLength: 1, maxLength: 30 }),
    }),
    { minLength: 1, maxLength: 10 },
  );

// ============================================================
// Property 1: Bug Condition 探索测试
// Feature: session-reply-display-fix
//
// 验证 retryRefreshTranscript 在 transcript 为空时能通过重试获取 AI 回复。
// 在 stub 实现（无重试）上运行时，测试预期失败——确认 bug 存在。
// ============================================================

describe('Feature: session-reply-display-fix, Property 1: Bug Condition 探索', () => {
  /**
   * Validates: Requirements 1.2, 1.3, 1.4, 2.2, 2.3
   *
   * 属性测试：对任意 N ∈ [1, 4]，当 refreshFn 前 N-1 次返回空、第 N 次返回非空时，
   * retryRefreshTranscript 应在第 N 次成功后返回 { success: true, transcript: 非空, attempts: N }
   *
   * 在 stub 实现上，当 N > 1 时此测试将失败，因为 stub 仅调用一次 refreshFn。
   */
  test('第 N 次重试成功时应返回 success=true 且 attempts=N', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 4 }),
        nonEmptyTranscriptArb(),
        async (successOnAttempt, transcript) => {
          // 创建模拟函数：前 N-1 次返回空，第 N 次返回非空
          const refreshFn = createMockRefreshFn(successOnAttempt, transcript);

          // 调用 retryRefreshTranscript，使用 0ms 延迟加速测试
          const result = await retryRefreshTranscript(refreshFn, {
            maxRetries: 4,
            initialDelay: 0,
          });

          // 断言：应成功获取到 transcript
          expect(result.success).toBe(true);
          // 断言：返回的 transcript 应与预期一致
          expect(result.transcript).toEqual(transcript);
          // 断言：尝试次数应等于 N
          expect(result.attempts).toBe(successOnAttempt);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 1.2, 1.4, 2.4
   *
   * 属性测试：当 refreshFn 4 次全部返回空时，
   * retryRefreshTranscript 应返回 { success: false, transcript: [], attempts: 4 }
   *
   * 在 stub 实现上此测试将失败，因为 stub 仅调用一次，attempts 为 1 而非 4。
   */
  test('全部重试失败时应返回 success=false 且 attempts=4', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant(null), // 使用 constant 以保持 fc.assert 结构
        async () => {
          // 创建始终返回空的模拟函数
          const refreshFn = createAlwaysEmptyRefreshFn();

          // 调用 retryRefreshTranscript，使用 0ms 延迟加速测试
          const result = await retryRefreshTranscript(refreshFn, {
            maxRetries: 4,
            initialDelay: 0,
          });

          // 断言：应返回失败
          expect(result.success).toBe(false);
          // 断言：transcript 应为空数组
          expect(result.transcript).toEqual([]);
          // 断言：应尝试了 4 次（最大重试次数）
          expect(result.attempts).toBe(4);
        },
      ),
      { numRuns: 50 },
    );
  });
});


// ============================================================
// Property 2: Preservation 属性测试
// Feature: session-reply-display-fix
//
// 验证在修复前后都不变的基线行为：
// - transcript 非空时立即使用，不触发重试
// - 发送失败（refreshFn 始终返回空）时返回 success=false
// - 全部重试失败时 transcript 为空数组（乐观消息被保留不被覆盖）
//
// 这些测试在 stub 实现和修复后的实现上都应通过。
// ============================================================

describe('Feature: session-reply-display-fix, Property 2: Preservation 属性测试', () => {
  /**
   * Validates: Requirements 3.1
   *
   * 属性测试 1：transcript 非空时立即使用
   *
   * 对任意非空 transcript 数组（长度 ≥ 1），当 refreshFn 第一次调用就返回非空时，
   * retryRefreshTranscript 应立即返回 { success: true, transcript: 非空, attempts: 1 }，
   * 不触发任何重试。
   *
   * 此行为在 stub 和修复后的实现上完全一致。
   */
  test('非空 transcript 首次调用即返回 success=true 且 attempts=1', async () => {
    await fc.assert(
      fc.asyncProperty(
        nonEmptyTranscriptArb(),
        async (transcript) => {
          // 创建一个首次调用就返回非空 transcript 的 refreshFn
          let callCount = 0;
          const refreshFn = async () => {
            callCount++;
            return transcript;
          };

          // 调用 retryRefreshTranscript，使用 0ms 延迟加速测试
          const result = await retryRefreshTranscript(refreshFn, {
            maxRetries: 4,
            initialDelay: 0,
          });

          // 断言：应成功
          expect(result.success).toBe(true);
          // 断言：返回的 transcript 应与输入一致
          expect(result.transcript).toEqual(transcript);
          // 断言：仅调用一次即成功，attempts 应为 1
          expect(result.attempts).toBe(1);
          // 断言：refreshFn 仅被调用一次（无重试）
          expect(callCount).toBe(1);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 3.2
   *
   * 属性测试 2：refreshFn 始终返回空时结果为 success=false
   *
   * 对任意场景，当 refreshFn 始终返回空数组时，
   * retryRefreshTranscript 应返回 success=false。
   *
   * 注意：不断言 attempts 的具体值，因为 stub 返回 attempts=1，
   * 修复后返回 attempts=maxRetries，但 success=false 在两者上都成立。
   */
  test('refreshFn 始终返回空时应返回 success=false', async () => {
    await fc.assert(
      fc.asyncProperty(
        // 生成随机的 maxRetries 值（1-6），验证对任意配置都返回 false
        fc.integer({ min: 1, max: 6 }),
        async (maxRetries) => {
          // 创建始终返回空数组的 refreshFn
          const refreshFn = createAlwaysEmptyRefreshFn();

          // 调用 retryRefreshTranscript
          const result = await retryRefreshTranscript(refreshFn, {
            maxRetries,
            initialDelay: 0,
          });

          // 断言：应返回失败
          expect(result.success).toBe(false);
          // 断言：transcript 应为空数组
          expect(result.transcript).toEqual([]);
        },
      ),
      { numRuns: 50 },
    );
  });

  /**
   * Validates: Requirements 3.5
   *
   * 属性测试 3：全部重试失败时 transcript 为空数组（乐观消息保留）
   *
   * 对任意全部失败的场景（refreshFn 每次都返回空），
   * 返回的 transcript 应为空数组 []，表示不会用空数据覆盖 UI。
   * 调用方（handleSendMessage）收到空 transcript 后会保留乐观消息。
   *
   * 此行为在 stub 和修复后的实现上完全一致。
   */
  test('全部失败时返回空 transcript，不覆盖乐观消息', async () => {
    await fc.assert(
      fc.asyncProperty(
        // 生成随机错误消息字符串，模拟不同的失败场景
        fc.string({ minLength: 0, maxLength: 50 }),
        async (_errorContext) => {
          // 创建始终返回空数组的 refreshFn（模拟后端持续返回空 transcript）
          const refreshFn = createAlwaysEmptyRefreshFn();

          // 调用 retryRefreshTranscript
          const result = await retryRefreshTranscript(refreshFn, {
            maxRetries: 4,
            initialDelay: 0,
          });

          // 断言：应返回失败
          expect(result.success).toBe(false);
          // 断言：transcript 必须为空数组，不能是 undefined 或 null
          expect(Array.isArray(result.transcript)).toBe(true);
          expect(result.transcript).toHaveLength(0);
          // 断言：attempts 至少为 1（至少尝试了一次）
          expect(result.attempts).toBeGreaterThanOrEqual(1);
        },
      ),
      { numRuns: 50 },
    );
  });
});
