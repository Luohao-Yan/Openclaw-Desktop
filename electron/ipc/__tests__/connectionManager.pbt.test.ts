/**
 * 属性测试：ConnectionManager 心跳状态机纯逻辑
 * Feature: remote-management-enhancement
 *
 * 覆盖设计文档中的以下正确性属性：
 * - Property 4: 心跳状态机 — HeartbeatStateMachine 状态转换逻辑
 *
 * 由于 ConnectionManager 依赖 Electron 和 fetch，
 * 本测试仅验证已提取的纯逻辑类 HeartbeatStateMachine。
 * 使用 fast-check 库，每个属性测试至少运行 100 次迭代。
 */

import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  HeartbeatStateMachine,
  MAX_CONSECUTIVE_FAILURES,
  buildStatusEvent,
  calculateLatency,
} from '../connectionManagerLogic';

// ── 生成器（Arbitraries）──────────────────────────────────────────────────

/**
 * 生成心跳结果序列（true = 成功，false = 失败）
 */
const heartbeatSequenceArb = (): fc.Arbitrary<boolean[]> =>
  fc.array(fc.boolean(), { minLength: 1, maxLength: 50 });

/**
 * 生成至少包含 3 个连续 false 的心跳序列
 * 用于确保触发 disconnected 状态
 */
const sequenceWithConsecutiveFailuresArb = (): fc.Arbitrary<boolean[]> =>
  fc.tuple(
    fc.array(fc.boolean(), { minLength: 0, maxLength: 10 }),
    fc.array(fc.boolean(), { minLength: 0, maxLength: 10 }),
  ).map(([prefix, suffix]) => {
    // 在 prefix 末尾确保以 true 结尾（如果非空），然后插入 3 个 false
    const cleanPrefix = prefix.length > 0 ? [...prefix, true] : [];
    return [...cleanPrefix, false, false, false, ...suffix];
  });

/**
 * 生成初始连接状态
 */
const initialStatusArb = (): fc.Arbitrary<'connected' | 'disconnected'> =>
  fc.constantFrom('connected' as const, 'disconnected' as const);

// ============================================================
// Property 4: 心跳状态机
// Feature: remote-management-enhancement
// ============================================================

describe('Feature: remote-management-enhancement, Property 4: 心跳状态机', () => {
  /**
   * Validates: Requirements 2.3, 2.4
   *
   * 连续 3 次心跳失败 → disconnected
   * disconnected 状态下 1 次成功 → connected
   * 非连续失败（中间有成功）→ 重置失败计数器
   * 成功始终返回 connected
   */

  test('连续 3 次失败后状态变为 disconnected', () => {
    fc.assert(
      fc.property(initialStatusArb(), (initialStatus) => {
        const sm = new HeartbeatStateMachine(initialStatus);

        // 先重置为 connected 状态（通过一次成功）
        sm.processHeartbeatResult(true);
        expect(sm.getStatus()).toBe('connected');

        // 连续 3 次失败
        sm.processHeartbeatResult(false);
        sm.processHeartbeatResult(false);
        const finalStatus = sm.processHeartbeatResult(false);

        // 状态必须变为 disconnected
        expect(finalStatus).toBe('disconnected');
        expect(sm.getStatus()).toBe('disconnected');
        expect(sm.getConsecutiveFailures()).toBe(MAX_CONSECUTIVE_FAILURES);
      }),
      { numRuns: 100 },
    );
  });

  test('disconnected 状态下 1 次成功后状态恢复为 connected', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 20 }),
        (extraFailures) => {
          const sm = new HeartbeatStateMachine('connected');

          // 先触发 disconnected（连续 3 次失败）
          for (let i = 0; i < MAX_CONSECUTIVE_FAILURES; i++) {
            sm.processHeartbeatResult(false);
          }
          expect(sm.getStatus()).toBe('disconnected');

          // 额外的失败不改变 disconnected 状态
          for (let i = 0; i < extraFailures - MAX_CONSECUTIVE_FAILURES; i++) {
            sm.processHeartbeatResult(false);
          }
          expect(sm.getStatus()).toBe('disconnected');

          // 1 次成功 → 恢复为 connected
          const newStatus = sm.processHeartbeatResult(true);
          expect(newStatus).toBe('connected');
          expect(sm.getConsecutiveFailures()).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  test('非连续失败（中间有成功）重置失败计数器', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 2 }),
        fc.integer({ min: 1, max: 2 }),
        (failsBefore, failsAfter) => {
          const sm = new HeartbeatStateMachine('connected');

          // 先失败 failsBefore 次（不足 3 次）
          for (let i = 0; i < failsBefore; i++) {
            sm.processHeartbeatResult(false);
          }
          expect(sm.getConsecutiveFailures()).toBe(failsBefore);
          // 不足 3 次，状态仍为 connected
          expect(sm.getStatus()).toBe('connected');

          // 一次成功 → 重置计数器
          sm.processHeartbeatResult(true);
          expect(sm.getConsecutiveFailures()).toBe(0);
          expect(sm.getStatus()).toBe('connected');

          // 再失败 failsAfter 次（不足 3 次）
          for (let i = 0; i < failsAfter; i++) {
            sm.processHeartbeatResult(false);
          }
          // 计数器从 0 重新开始
          expect(sm.getConsecutiveFailures()).toBe(failsAfter);
          // 不足 3 次，状态仍为 connected
          expect(sm.getStatus()).toBe('connected');
        },
      ),
      { numRuns: 100 },
    );
  });

  test('成功始终返回 connected 状态', () => {
    fc.assert(
      fc.property(
        heartbeatSequenceArb(),
        (sequence) => {
          const sm = new HeartbeatStateMachine('connected');

          // 执行随机序列
          for (const result of sequence) {
            sm.processHeartbeatResult(result);
          }

          // 最后一次成功 → 状态必须为 connected
          const finalStatus = sm.processHeartbeatResult(true);
          expect(finalStatus).toBe('connected');
          expect(sm.getConsecutiveFailures()).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  test('对于任意心跳序列，状态机状态始终一致', () => {
    fc.assert(
      fc.property(
        heartbeatSequenceArb(),
        (sequence) => {
          const sm = new HeartbeatStateMachine('connected');
          let consecutiveFailures = 0;

          for (const success of sequence) {
            if (success) {
              consecutiveFailures = 0;
            } else {
              consecutiveFailures += 1;
            }

            const newStatus = sm.processHeartbeatResult(success);

            // 验证失败计数器一致
            expect(sm.getConsecutiveFailures()).toBe(consecutiveFailures);

            // 验证状态一致性
            if (success) {
              expect(newStatus).toBe('connected');
            } else if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
              expect(newStatus).toBe('disconnected');
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  test('reset() 将状态机恢复到初始状态', () => {
    fc.assert(
      fc.property(
        heartbeatSequenceArb(),
        (sequence) => {
          const sm = new HeartbeatStateMachine('connected');

          // 执行随机序列
          for (const result of sequence) {
            sm.processHeartbeatResult(result);
          }

          // 重置
          sm.reset();

          // 验证重置后的状态
          expect(sm.getStatus()).toBe('connected');
          expect(sm.getConsecutiveFailures()).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  test('少于 3 次连续失败不会触发 disconnected', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 2 }),
        (failCount) => {
          const sm = new HeartbeatStateMachine('connected');

          for (let i = 0; i < failCount; i++) {
            sm.processHeartbeatResult(false);
          }

          // 不足 3 次连续失败，状态仍为 connected
          expect(sm.getStatus()).toBe('connected');
          expect(sm.getConsecutiveFailures()).toBe(failCount);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ============================================================
// 辅助纯函数测试：buildStatusEvent
// ============================================================

describe('buildStatusEvent 状态事件构建', () => {
  test('事件始终包含 status 字段', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('connected', 'disconnected', 'connecting', 'error') as fc.Arbitrary<'connected' | 'disconnected' | 'connecting' | 'error'>,
        (status) => {
          const event = buildStatusEvent(status);
          expect(event.status).toBe(status);
        },
      ),
      { numRuns: 100 },
    );
  });

  test('可选字段仅在提供时出现', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('connected', 'disconnected') as fc.Arbitrary<'connected' | 'disconnected'>,
        fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
        fc.option(fc.integer({ min: 0, max: 5000 }), { nil: undefined }),
        fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
        (status, instanceId, latencyMs, error) => {
          const event = buildStatusEvent(status, instanceId, latencyMs, error);

          expect(event.status).toBe(status);

          if (instanceId !== undefined) {
            expect(event.instanceId).toBe(instanceId);
          } else {
            expect(event).not.toHaveProperty('instanceId');
          }

          if (latencyMs !== undefined) {
            expect(event.latencyMs).toBe(latencyMs);
          } else {
            expect(event).not.toHaveProperty('latencyMs');
          }

          if (error !== undefined) {
            expect(event.error).toBe(error);
          } else {
            expect(event).not.toHaveProperty('error');
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ============================================================
// 辅助纯函数测试：calculateLatency
// ============================================================

describe('calculateLatency 延迟计算', () => {
  test('延迟始终为非负数', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000_000 }),
        fc.integer({ min: 0, max: 1_000_000_000 }),
        (start, end) => {
          const latency = calculateLatency(start, end);
          expect(latency).toBeGreaterThanOrEqual(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  test('endTime >= startTime 时延迟等于差值', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000_000 }),
        fc.integer({ min: 0, max: 10_000 }),
        (start, delta) => {
          const end = start + delta;
          const latency = calculateLatency(start, end);
          expect(latency).toBe(delta);
        },
      ),
      { numRuns: 100 },
    );
  });
});
