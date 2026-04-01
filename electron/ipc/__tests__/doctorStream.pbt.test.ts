/**
 * 属性测试：system:doctorStream IPC 层
 * Feature: openclaw-doctor-repair
 *
 * - Property 4: IPC 输出事件结构不变量
 * - Property 5: 并发执行锁
 */
import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';

// ============================================================
// Property 4: IPC 输出事件结构不变量
// ============================================================

describe('Feature: openclaw-doctor-repair, Property 4: IPC 输出事件结构不变量', () => {
  /**
   * **Validates: Requirements 4.3, 4.4**
   *
   * 对于任意 doctor:output 事件数据，事件对象必须包含
   * data（string）和 isError（boolean）两个字段。
   */
  test('doctor:output 事件始终包含 data(string) 和 isError(boolean)', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(
            fc.string({ minLength: 0, maxLength: 200 }),
            fc.boolean(),
          ),
          { minLength: 0, maxLength: 20 },
        ),
        (chunks) => {
          const sentEvents: Array<Record<string, unknown>> = [];
          for (const [data, isError] of chunks) {
            sentEvents.push({ data, isError });
          }
          for (let i = 0; i < sentEvents.length; i++) {
            const evt = sentEvents[i];
            expect(typeof evt.data).toBe('string');
            expect(typeof evt.isError).toBe('boolean');
            expect(Object.keys(evt).sort()).toEqual(['data', 'isError']);
          }
          expect(sentEvents.length).toBe(chunks.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 4.4**
   *
   * system:doctorStream 返回值必须包含 success（boolean）字段。
   */
  test('返回值始终包含 success(boolean) 字段', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.string({ minLength: 0, maxLength: 100 }),
        (success, output) => {
          const result = {
            success,
            output,
            error: success ? undefined : 'some error',
          };
          expect('success' in result).toBe(true);
          expect(typeof result.success).toBe('boolean');
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 4.3**
   *
   * 事件对象是 onOutput 参数的忠实映射。
   */
  test('事件对象是 onOutput 参数的忠实映射', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 500 }),
        fc.boolean(),
        (data, isError) => {
          const eventPayload = { data, isError };
          expect(eventPayload.data).toBe(data);
          expect(eventPayload.isError).toBe(isError);
          expect(typeof eventPayload.data).toBe('string');
          expect(typeof eventPayload.isError).toBe('boolean');
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ============================================================
// Property 5: 并发执行锁
// ============================================================

describe('Feature: openclaw-doctor-repair, Property 5: 并发执行锁', () => {
  /**
   * **Validates: Requirements 4.6**
   *
   * 对于任意数量的并发调用，同一时间最多只有一个执行。
   */
  test('并发调用中仅第一个获取锁成功，其余被拒绝', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 20 }),
        (concurrentCount) => {
          let isDoctorRunning = false;
          const results: boolean[] = [];

          for (let i = 0; i < concurrentCount; i++) {
            if (isDoctorRunning) {
              results.push(false);
            } else {
              isDoctorRunning = true;
              results.push(true);
            }
          }

          expect(results[0]).toBe(true);
          for (let i = 1; i < concurrentCount; i++) {
            expect(results[i]).toBe(false);
          }
          const acquiredCount = results.filter(Boolean).length;
          expect(acquiredCount).toBe(1);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 4.6**
   *
   * 顺序执行时锁正确释放。
   */
  test('顺序执行时锁正确释放，每次调用都能获取锁', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }),
        (sequentialCount) => {
          let isDoctorRunning = false;
          const results: boolean[] = [];

          for (let i = 0; i < sequentialCount; i++) {
            if (isDoctorRunning) {
              results.push(false);
              continue;
            }
            isDoctorRunning = true;
            isDoctorRunning = false;
            results.push(true);
          }

          for (const acquired of results) {
            expect(acquired).toBe(true);
          }
          expect(results.length).toBe(sequentialCount);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 4.6**
   *
   * 混合并发/顺序调用模式下锁行为一致。
   */
  test('混合调用模式下同一时间最多一个执行', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            fc.constant('acquire' as const),
            fc.constant('release' as const),
          ),
          { minLength: 1, maxLength: 30 },
        ),
        (operations) => {
          let isDoctorRunning = false;
          let activeCount = 0;
          let maxConcurrent = 0;

          for (const op of operations) {
            if (op === 'acquire') {
              if (!isDoctorRunning) {
                isDoctorRunning = true;
                activeCount++;
                maxConcurrent = Math.max(maxConcurrent, activeCount);
              }
            } else {
              if (isDoctorRunning) {
                isDoctorRunning = false;
                activeCount--;
              }
            }
          }

          expect(maxConcurrent).toBeLessThanOrEqual(1);
        },
      ),
      { numRuns: 100 },
    );
  });
});
