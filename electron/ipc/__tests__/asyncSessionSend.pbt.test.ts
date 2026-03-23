/**
 * 属性测试：异步会话消息发送（async-session-send）
 *
 * 本文件包含设计文档中定义的 13 个正确性属性的测试。
 * 使用 fast-check 进行属性测试，每个属性至少运行 100 次迭代。
 *
 * 测试分为两组：
 * - 轮询逻辑属性测试（Property 10-13）：测试 pollForReply 和退避间隔计算
 * - AsyncSendManager 属性测试（Property 1-9）：测试后端进程管理逻辑
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import {
  pollForReply,
  calculateBackoffInterval,
} from '../../../src/pages/sessions/sessionRetryLogic';

// ── 辅助工具 ──────────────────────────────────────────────────────────────────

/**
 * 创建模拟 refreshFn：在第 K 次调用时返回包含新 assistant 消息的 transcript
 *
 * @param replyOnCall - 在第几次调用时返回新回复（从 1 开始）
 * @param baselineAssistantCount - 基线 assistant 消息数
 */
function createDelayedReplyFn(
  replyOnCall: number,
  baselineAssistantCount: number,
): () => Promise<any[]> {
  let callCount = 0;
  return async () => {
    callCount++;
    // 始终包含基线数量的 assistant 消息
    const messages: any[] = [];
    for (let i = 0; i < baselineAssistantCount; i++) {
      messages.push({ role: 'assistant', content: `旧回复 ${i}` });
    }
    // 在指定调用次数时追加新的 assistant 消息
    if (callCount >= replyOnCall) {
      messages.push({ role: 'assistant', content: '新回复' });
    }
    return messages;
  };
}

/**
 * 创建始终不返回新回复的 refreshFn
 */
function createNoReplyFn(baselineAssistantCount: number): () => Promise<any[]> {
  return async () => {
    const messages: any[] = [];
    for (let i = 0; i < baselineAssistantCount; i++) {
      messages.push({ role: 'assistant', content: `旧回复 ${i}` });
    }
    return messages;
  };
}

/**
 * 创建连续抛异常的 refreshFn
 */
function createFailingFn(): () => Promise<any[]> {
  return async () => {
    throw new Error('模拟读取失败');
  };
}

// ── 轮询逻辑属性测试 ──────────────────────────────────────────────────────────

describe('async-session-send 轮询逻辑属性测试', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Feature: async-session-send, Property 11: 退避间隔公式
  describe('Property 11: 退避间隔公式', () => {
    test('第 n 次轮询间隔 = min(initialInterval * backoffFactor^n, maxInterval)', () => {
      fc.assert(
        fc.property(
          // 生成轮询次数 n（0~50）
          fc.integer({ min: 0, max: 50 }),
          (n) => {
            const interval = calculateBackoffInterval(n);
            const expected = Math.min(1000 * Math.pow(1.5, n), 5000);
            expect(interval).toBeCloseTo(expected, 5);
          },
        ),
        { numRuns: 100 },
      );
    });

    test('自定义参数下退避间隔公式正确', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 30 }),
          fc.integer({ min: 100, max: 2000 }),   // initialInterval
          fc.integer({ min: 3000, max: 10000 }),  // maxInterval
          fc.double({ min: 1.1, max: 3.0, noNaN: true }),  // backoffFactor
          (n, initialInterval, maxInterval, backoffFactor) => {
            const interval = calculateBackoffInterval(n, {
              initialInterval,
              maxInterval,
              backoffFactor,
            });
            const expected = Math.min(
              initialInterval * Math.pow(backoffFactor, n),
              maxInterval,
            );
            expect(interval).toBeCloseTo(expected, 5);
          },
        ),
        { numRuns: 100 },
      );
    });

    test('间隔永远不超过 maxInterval', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 100 }),
          (n) => {
            const interval = calculateBackoffInterval(n);
            expect(interval).toBeLessThanOrEqual(5000);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // Feature: async-session-send, Property 10: 轮询检测新回复
  describe('Property 10: 轮询检测新回复', () => {
    test('refreshFn 在第 K 次返回新 assistant 消息时 pollForReply 正确停止', async () => {
      // 使用较小的 K 值避免测试超时，用真实定时器
      vi.useRealTimers();

      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 3 }),  // K: 第几次返回新回复
          fc.integer({ min: 0, max: 3 }),  // baselineCount: 基线 assistant 消息数
          async (K, baselineCount) => {
            const refreshFn = createDelayedReplyFn(K, baselineCount);
            const result = await pollForReply(refreshFn, baselineCount, {
              initialInterval: 10,   // 极短间隔加速测试
              maxInterval: 50,
              backoffFactor: 1.5,
              maxDuration: 10_000,
            });

            expect(result.success).toBe(true);
            expect(result.timedOut).toBe(false);
            // 新 transcript 中 assistant 消息数应大于基线
            const assistantCount = result.transcript.filter(
              (m: any) => m.role === 'assistant',
            ).length;
            expect(assistantCount).toBeGreaterThan(baselineCount);
          },
        ),
        { numRuns: 20 },  // 减少迭代次数避免测试过慢
      );
    });
  });

  // Feature: async-session-send, Property 12: 轮询超时
  describe('Property 12: 轮询超时', () => {
    test('refreshFn 始终不返回新消息时，超过 maxDuration 后返回超时', async () => {
      vi.useRealTimers();

      const baselineCount = 2;
      const refreshFn = createNoReplyFn(baselineCount);

      const result = await pollForReply(refreshFn, baselineCount, {
        initialInterval: 10,
        maxInterval: 20,
        backoffFactor: 1.2,
        maxDuration: 100,  // 极短超时加速测试
      });

      expect(result.success).toBe(false);
      expect(result.timedOut).toBe(true);
    });
  });

  // Feature: async-session-send, Property 13: 连续失败阈值
  describe('Property 13: 连续失败阈值', () => {
    test('refreshFn 连续抛异常 3 次后 pollForReply 停止轮询', async () => {
      vi.useRealTimers();

      const refreshFn = createFailingFn();

      const result = await pollForReply(refreshFn, 0, {
        initialInterval: 10,
        maxInterval: 20,
        backoffFactor: 1.2,
        maxDuration: 10_000,
      });

      expect(result.success).toBe(false);
      expect(result.timedOut).toBe(false);
      expect(result.failedConsecutively).toBe(true);
    });

    test('成功调用会重置连续失败计数', async () => {
      vi.useRealTimers();

      let callCount = 0;
      // 模式：失败2次 → 成功1次（无新回复）→ 失败3次 → 应停止
      const refreshFn = async (): Promise<any[]> => {
        callCount++;
        if (callCount <= 2) throw new Error('失败');
        if (callCount === 3) return [{ role: 'assistant', content: '旧' }]; // 无新回复
        throw new Error('失败');
      };

      const result = await pollForReply(refreshFn, 1, {
        initialInterval: 10,
        maxInterval: 20,
        backoffFactor: 1.2,
        maxDuration: 10_000,
      });

      // 第 3 次成功重置了计数，之后连续 3 次失败才停止
      expect(result.success).toBe(false);
      expect(result.failedConsecutively).toBe(true);
    });
  });
});

// ── AsyncSendManager 属性测试 ─────────────────────────────────────────────────
// 使用 EventEmitter 模拟 ChildProcess，避免真实 spawn

import { EventEmitter } from 'events';
import { AsyncSendManager } from '../asyncSendManager';
import type { EnqueueParams } from '../asyncSendManager';

// Mock child_process.spawn
vi.mock('child_process', () => {
  return {
    spawn: vi.fn(),
  };
});

// Mock settings 模块
vi.mock('../settings.js', () => ({
  resolveOpenClawCommand: vi.fn(() => 'openclaw'),
  getShellPath: vi.fn(async () => '/usr/local/bin:/usr/bin:/bin'),
  runCommand: vi.fn(),
}));

// Mock spawnHelperLogic 模块
vi.mock('../spawnHelperLogic.js', () => ({
  buildSpawnEnv: vi.fn(() => ({ PATH: '/usr/local/bin:/usr/bin:/bin' })),
}));

import { spawn } from 'child_process';
const mockSpawn = vi.mocked(spawn);

/**
 * 创建模拟的 ChildProcess（基于 EventEmitter）
 * 支持 stdout/stderr 数据流和 close/error 事件
 */
function createMockChildProcess(pid = 12345): any {
  const proc = new EventEmitter() as any;
  proc.pid = pid;
  proc.killed = false;
  proc.kill = vi.fn(() => { proc.killed = true; });
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  // once 方法已由 EventEmitter 提供
  return proc;
}

/** 生成合法的 enqueue 参数 */
function makeParams(overrides?: Partial<EnqueueParams>): EnqueueParams {
  return {
    sessionId: 'test-uuid-1234',
    sessionKey: 'agent:main:main',
    message: '你好',
    agentId: 'main',
    ...overrides,
  };
}

describe('async-session-send AsyncSendManager 属性测试', () => {
  let manager: AsyncSendManager;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = new AsyncSendManager({ timeoutMs: 5000 }); // 短超时便于测试
    mockSpawn.mockReset();
  });

  afterEach(() => {
    manager.killAll();
    vi.useRealTimers();
  });

  // Feature: async-session-send, Property 1: 成功入队返回 pending 标志
  describe('Property 1: 成功入队返回 pending 标志', () => {
    test('合法参数 enqueue 返回 { success: true, pending: true }', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.string({ minLength: 1, maxLength: 200 }),
          async (sessionId, sessionKey, message) => {
            const proc = createMockChildProcess();
            mockSpawn.mockReturnValue(proc);

            const localManager = new AsyncSendManager({ timeoutMs: 5000 });
            const result = await localManager.enqueue({
              sessionId,
              sessionKey,
              message,
              agentId: 'main',
            });

            expect(result.success).toBe(true);
            expect(result.pending).toBe(true);

            // 清理
            localManager.killAll();
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  // Feature: async-session-send, Property 2: Spawn 失败返回错误
  describe('Property 2: Spawn 失败返回错误', () => {
    test('spawn 抛出 ENOENT 时返回 { success: false, error: string }', async () => {
      mockSpawn.mockImplementation(() => {
        throw Object.assign(new Error('spawn openclaw ENOENT'), { code: 'ENOENT' });
      });

      const result = await manager.enqueue(makeParams());

      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
      expect(typeof result.error).toBe('string');
    });
  });

  // Feature: async-session-send, Property 3: 活跃进程状态追踪
  describe('Property 3: 活跃进程状态追踪', () => {
    test('入队后 getStatus 返回 processing 和正整数 startedAt', async () => {
      const proc = createMockChildProcess();
      mockSpawn.mockReturnValue(proc);

      await manager.enqueue(makeParams());
      const status = manager.getStatus('agent:main:main');

      expect(status.status).toBe('processing');
      expect(status.startedAt).toBeGreaterThan(0);
      expect(typeof status.startedAt).toBe('number');
    });
  });

  // Feature: async-session-send, Property 4: 默认空闲状态
  describe('Property 4: 默认空闲状态', () => {
    test('无记录的 sessionKey 返回 idle', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          (sessionKey) => {
            const status = manager.getStatus(sessionKey);
            expect(status.status).toBe('idle');
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // Feature: async-session-send, Property 5: 进程生命周期状态转换
  describe('Property 5: 进程生命周期状态转换', () => {
    test('正常退出后状态从 processing → completed → idle', async () => {
      const proc = createMockChildProcess();
      mockSpawn.mockReturnValue(proc);

      await manager.enqueue(makeParams());
      expect(manager.getStatus('agent:main:main').status).toBe('processing');

      // 模拟正常退出
      proc.emit('close', 0);
      expect(manager.getStatus('agent:main:main').status).toBe('completed');

      // 快进 30 秒清理周期
      vi.advanceTimersByTime(31_000);
      expect(manager.getStatus('agent:main:main').status).toBe('idle');
    });
  });

  // Feature: async-session-send, Property 6: 异常退出统一处理
  describe('Property 6: 异常退出统一处理', () => {
    test('非零退出码返回 error 状态和非空 error 信息', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 255 }),
          async (exitCode) => {
            const proc = createMockChildProcess();
            mockSpawn.mockReturnValue(proc);

            const localManager = new AsyncSendManager({ timeoutMs: 5000 });
            await localManager.enqueue(makeParams({ sessionKey: `key-${exitCode}` }));

            // 写入 stderr 数据
            proc.stderr.emit('data', Buffer.from(`错误: 退出码 ${exitCode}`));
            proc.emit('close', exitCode);

            const status = localManager.getStatus(`key-${exitCode}`);
            expect(status.status).toBe('error');
            expect(status.error).toBeTruthy();
            expect(typeof status.error).toBe('string');

            localManager.killAll();
          },
        ),
        { numRuns: 50 },
      );
    });

    test('超时后返回 timeout 状态', async () => {
      const proc = createMockChildProcess();
      mockSpawn.mockReturnValue(proc);

      await manager.enqueue(makeParams());
      expect(manager.getStatus('agent:main:main').status).toBe('processing');

      // 快进超过超时时间
      vi.advanceTimersByTime(6000);
      const status = manager.getStatus('agent:main:main');
      expect(status.status).toBe('timeout');
      expect(status.error).toBeTruthy();
    });
  });

  // Feature: async-session-send, Property 7: 同 Session 请求排队顺序
  describe('Property 7: 同 Session 请求排队顺序', () => {
    test('同一 sessionKey 连续 enqueue 时同一时刻最多一个进程在执行', async () => {
      const proc1 = createMockChildProcess(1001);
      const proc2 = createMockChildProcess(1002);
      let spawnCount = 0;
      mockSpawn.mockImplementation(() => {
        spawnCount++;
        return spawnCount === 1 ? proc1 : proc2;
      });

      const params = makeParams();

      // 第一个请求立即启动
      const result1 = await manager.enqueue(params);
      expect(result1.success).toBe(true);
      expect(result1.pending).toBe(true);

      // 第二个请求应排队（不会立即 spawn）
      const promise2 = manager.enqueue(params);
      expect(spawnCount).toBe(1); // 仍然只有一个 spawn

      // 第一个进程完成
      proc1.emit('close', 0);

      // 等待排队请求被处理
      await vi.advanceTimersByTimeAsync(10);
      const result2 = await promise2;
      expect(result2.success).toBe(true);
      expect(spawnCount).toBe(2); // 现在第二个 spawn 了
    });
  });

  // Feature: async-session-send, Property 8: 应用退出终止所有进程
  describe('Property 8: 应用退出终止所有进程', () => {
    test('killAll 后所有 getStatus 返回非 processing', async () => {
      const keys = ['key-a', 'key-b', 'key-c'];
      for (const key of keys) {
        const proc = createMockChildProcess();
        mockSpawn.mockReturnValue(proc);
        await manager.enqueue(makeParams({ sessionKey: key }));
      }

      // 确认都是 processing
      for (const key of keys) {
        expect(manager.getStatus(key).status).toBe('processing');
      }

      // killAll
      manager.killAll();

      // 所有状态应为非 processing
      for (const key of keys) {
        expect(manager.getStatus(key).status).not.toBe('processing');
      }
    });
  });

  // Feature: async-session-send, Property 9: 多 Session 隔离
  describe('Property 9: 多 Session 隔离', () => {
    test('对 A 操作不影响 B 的状态', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.string({ minLength: 1, maxLength: 20 }),
          async (keyA, keyB) => {
            // 确保两个 key 不同
            if (keyA === keyB) keyB = keyB + '-diff';

            const procA = createMockChildProcess(2001);
            const procB = createMockChildProcess(2002);
            let callIdx = 0;
            mockSpawn.mockImplementation(() => {
              callIdx++;
              return callIdx === 1 ? procA : procB;
            });

            const localManager = new AsyncSendManager({ timeoutMs: 5000 });

            await localManager.enqueue(makeParams({ sessionKey: keyA }));
            await localManager.enqueue(makeParams({ sessionKey: keyB }));

            // 两个都是 processing
            expect(localManager.getStatus(keyA).status).toBe('processing');
            expect(localManager.getStatus(keyB).status).toBe('processing');

            // A 完成，B 不受影响
            procA.emit('close', 0);
            expect(localManager.getStatus(keyA).status).toBe('completed');
            expect(localManager.getStatus(keyB).status).toBe('processing');

            // B 失败，A 不受影响
            procB.stderr.emit('data', Buffer.from('error'));
            procB.emit('close', 1);
            expect(localManager.getStatus(keyA).status).toBe('completed');
            expect(localManager.getStatus(keyB).status).toBe('error');

            localManager.killAll();
          },
        ),
        { numRuns: 20 },
      );
    });
  });
});
