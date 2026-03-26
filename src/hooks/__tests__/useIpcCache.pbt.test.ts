/**
 * useIpcCache.pbt.test.ts
 *
 * IPC 缓存 Hook 属性测试
 * 使用 fast-check + @testing-library/react 的 renderHook 验证缓存行为
 *
 * Feature: app-production-optimization
 */

// @vitest-environment jsdom

import { describe, test, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { renderHook, waitFor } from '@testing-library/react';
import { useIpcCache, clearCache, getCacheEntry } from '../useIpcCache';

// ── 每次测试前清空全局缓存 ────────────────────────────────────────

beforeEach(() => {
  clearCache();
  vi.restoreAllMocks();
});

// ── 生成器（Arbitraries）──────────────────────────────────────────

/**
 * 缓存键生成器：生成非空字符串作为缓存键
 * 限制长度避免过长字符串影响测试性能
 */
const cacheKeyArb = fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0);

/**
 * 缓存数据生成器：生成任意 JSON 可序列化的值
 * 包括字符串、数字、布尔值、对象、数组等
 */
const cacheDataArb = fc.oneof(
  fc.string(),
  fc.integer(),
  fc.double({ noNaN: true, noDefaultInfinity: true }),
  fc.boolean(),
  fc.constant(null),
  fc.array(fc.integer(), { maxLength: 5 }),
  fc.dictionary(fc.string({ minLength: 1, maxLength: 10 }), fc.integer(), { maxKeys: 5 }),
);

/**
 * TTL 生成器：生成合理的缓存有效期（1 秒到 60 秒）
 * 确保 TTL 足够长以在测试中验证缓存命中
 */
const ttlArb = fc.integer({ min: 1000, max: 60000 });

// ── Property 4: IPC 缓存命中行为 ─────────────────────────────────

// Feature: app-production-optimization, Property 4: IPC 缓存命中行为
describe('Property 4: IPC 缓存命中行为', () => {
  /**
   * **Validates: Requirements 3.2**
   *
   * 对于任意缓存键和数据，在首次获取后且缓存有效期（TTL）内，
   * 再次请求同一键应直接返回缓存数据，且不应再次调用底层 fetcher 函数。
   */
  test('缓存有效期内再次请求同一键，应直接返回缓存数据且不再调用 fetcher', async () => {
    await fc.assert(
      fc.asyncProperty(cacheKeyArb, cacheDataArb, ttlArb, async (key, data, ttl) => {
        // 为每次迭代使用唯一键，避免跨迭代缓存干扰
        const uniqueKey = `${key}_${Date.now()}_${Math.random()}`;
        // 每次迭代前清空缓存，确保测试隔离
        clearCache();

        // 创建 mock fetcher，首次调用返回数据
        const fetcher = vi.fn().mockResolvedValue(data);

        // ── 第一次渲染：首次获取数据 ──
        const { result, unmount } = renderHook(() =>
          useIpcCache(uniqueKey, fetcher, { ttl, staleWhileRevalidate: false }),
        );

        // 等待首次获取完成
        await waitFor(() => {
          expect(result.current.loading).toBe(false);
        });

        // 验证首次获取成功
        expect(result.current.data).toEqual(data);
        expect(result.current.error).toBeNull();
        expect(fetcher).toHaveBeenCalledTimes(1);

        // 卸载第一个 hook 实例
        unmount();

        // 重置 fetcher 调用计数，以便验证第二次渲染不再调用
        fetcher.mockClear();

        // ── 第二次渲染：缓存有效期内再次请求同一键 ──
        const { result: result2, unmount: unmount2 } = renderHook(() =>
          useIpcCache(uniqueKey, fetcher, { ttl, staleWhileRevalidate: false }),
        );

        // 等待渲染稳定
        await waitFor(() => {
          expect(result2.current.loading).toBe(false);
        });

        // 核心断言：应直接返回缓存数据
        expect(result2.current.data).toEqual(data);
        expect(result2.current.error).toBeNull();
        expect(result2.current.isStale).toBe(false);

        // 核心断言：不应再次调用 fetcher
        expect(fetcher).not.toHaveBeenCalled();

        // 验证缓存条目存在且数据正确
        const entry = getCacheEntry(uniqueKey);
        expect(entry).toBeDefined();
        expect(entry!.data).toEqual(data);

        // 清理
        unmount2();
      }),
      { numRuns: 20 },
    );
  }, 30000);
});

// ── Property 5: Stale-while-revalidate 策略 ──────────────────────

// Feature: app-production-optimization, Property 5: Stale-while-revalidate 策略
describe('Property 5: Stale-while-revalidate 策略', () => {
  /**
   * **Validates: Requirements 3.3**
   *
   * 对于任意已缓存但已过期的数据条目，请求该键时应立即返回过期的缓存数据
   * （isStale=true），同时在后台发起新的 fetcher 调用。当新数据返回后，
   * 缓存和返回值应更新为最新数据。
   */
  test('缓存过期时应立即返回旧数据（isStale=true），后台刷新后更新为新值', async () => {
    await fc.assert(
      fc.asyncProperty(
        cacheKeyArb,
        cacheDataArb,
        cacheDataArb,
        async (key, oldData, newData) => {
          // 为每次迭代使用唯一键，避免跨迭代缓存干扰
          const uniqueKey = `swr_${key}_${Date.now()}_${Math.random()}`;
          // 每次迭代前清空缓存，确保测试隔离
          clearCache();

          // 使用较短的 TTL（50ms），便于快速过期
          const shortTtl = 50;

          // 创建可控的 fetcher：
          // - 第一次调用返回 oldData（初始填充缓存）
          // - 第二次调用返回 newData（后台刷新时返回新数据）
          let resolveSecondCall: ((value: unknown) => void) | null = null;
          const fetcher = vi.fn()
            .mockResolvedValueOnce(oldData)
            .mockImplementationOnce(() => {
              // 第二次调用返回一个可控的 Promise，便于验证中间状态
              return new Promise((resolve) => {
                resolveSecondCall = resolve;
              });
            });

          // ── 第一次渲染：首次获取数据，填充缓存 ──
          const { result: result1, unmount: unmount1 } = renderHook(() =>
            useIpcCache(uniqueKey, fetcher, { ttl: shortTtl, staleWhileRevalidate: true }),
          );

          // 等待首次获取完成
          await waitFor(() => {
            expect(result1.current.loading).toBe(false);
          });

          // 验证首次获取成功
          expect(result1.current.data).toEqual(oldData);
          expect(result1.current.isStale).toBe(false);
          expect(fetcher).toHaveBeenCalledTimes(1);

          // 卸载第一个 hook 实例
          unmount1();

          // ── 等待 TTL 过期 ──
          // 将缓存条目的时间戳回退，使其超过 TTL
          const entry = getCacheEntry(uniqueKey);
          expect(entry).toBeDefined();
          // 手动将时间戳设置为过去，确保缓存已过期
          (entry as { data: unknown; timestamp: number }).timestamp = Date.now() - shortTtl - 10;

          // ── 第二次渲染：缓存已过期，应触发 stale-while-revalidate ──
          const { result: result2, unmount: unmount2 } = renderHook(() =>
            useIpcCache(uniqueKey, fetcher, { ttl: shortTtl, staleWhileRevalidate: true }),
          );

          // 核心断言 1：应立即返回过期的旧数据，且标记为 stale
          await waitFor(() => {
            expect(result2.current.data).toEqual(oldData);
            expect(result2.current.isStale).toBe(true);
          });

          // 核心断言 2：应在后台发起新的 fetcher 调用
          expect(fetcher).toHaveBeenCalledTimes(2);

          // ── 模拟后台刷新完成：resolve 第二次 fetcher 调用 ──
          expect(resolveSecondCall).not.toBeNull();
          resolveSecondCall!(newData);

          // 核心断言 3：后台刷新完成后，数据应更新为新值，isStale 变为 false
          await waitFor(() => {
            expect(result2.current.isStale).toBe(false);
            expect(result2.current.loading).toBe(false);
          });

          expect(result2.current.data).toEqual(newData);
          expect(result2.current.error).toBeNull();

          // 验证缓存条目已更新为新数据
          const updatedEntry = getCacheEntry(uniqueKey);
          expect(updatedEntry).toBeDefined();
          expect(updatedEntry!.data).toEqual(newData);

          // 清理
          unmount2();
        },
      ),
      { numRuns: 20 },
    );
  }, 30000);
});


// ── Property 6: IPC 请求超时处理 ─────────────────────────────────

// Feature: app-production-optimization, Property 6: IPC 请求超时处理
describe('Property 6: IPC 请求超时处理', () => {
  /**
   * **Validates: Requirements 3.7**
   *
   * 对于任意缓存键，如果底层 fetcher 在超时时间内未响应，
   * 缓存 Hook 应将状态转为错误/超时状态，并提供 `refresh` 函数供重试。
   * 使用短超时（50ms）代替 fake timers，避免兼容性问题。
   */
  test('fetcher 超时未响应时应转为错误状态，提供 refresh 重试', async () => {
    await fc.assert(
      fc.asyncProperty(cacheKeyArb, cacheDataArb, async (key, retryData) => {
        const uniqueKey = `timeout_${key}_${Date.now()}_${Math.random()}`;
        clearCache();

        // 使用 50ms 短超时，避免需要 fake timers
        const shortTimeout = 50;

        // 创建一个延迟远超超时时间的 fetcher（模拟超时场景）
        const slowFetcher = vi.fn().mockImplementation(
          () => new Promise<unknown>((resolve) => setTimeout(() => resolve('late'), 10000)),
        );

        const { result, unmount } = renderHook(() =>
          useIpcCache(uniqueKey, slowFetcher, {
            ttl: 30000,
            staleWhileRevalidate: false,
            timeout: shortTimeout,
          }),
        );

        // 等待超时触发
        await waitFor(() => {
          expect(result.current.loading).toBe(false);
        }, { timeout: 3000 });

        // 核心断言：超时后 error 包含超时信息，data 为 null，refresh 可用
        expect(result.current.error).toBeInstanceOf(Error);
        expect(result.current.error!.message).toContain('超时');
        expect(result.current.data).toBeNull();
        expect(typeof result.current.refresh).toBe('function');

        unmount();
      }),
      { numRuns: 20 },
    );
  }, 30000);

  /**
   * **Validates: Requirements 3.7**
   *
   * 超时后通过 refresh 重试应能成功获取数据。
   */
  test('超时后 refresh 重试应能成功获取数据', async () => {
    await fc.assert(
      fc.asyncProperty(cacheKeyArb, cacheDataArb, async (key, retryData) => {
        const uniqueKey = `retry_${key}_${Date.now()}_${Math.random()}`;
        clearCache();

        const shortTimeout = 50;

        // 第一次调用延迟远超超时（触发超时），第二次调用立即返回数据
        const fetcher = vi.fn()
          .mockImplementationOnce(
            () => new Promise<unknown>((resolve) => setTimeout(() => resolve('late'), 10000)),
          )
          .mockResolvedValueOnce(retryData);

        const { result, unmount } = renderHook(() =>
          useIpcCache(uniqueKey, fetcher, {
            ttl: 30000,
            staleWhileRevalidate: false,
            timeout: shortTimeout,
          }),
        );

        // 等待超时触发
        await waitFor(() => {
          expect(result.current.loading).toBe(false);
        }, { timeout: 3000 });

        // 确认已超时
        expect(result.current.error).toBeInstanceOf(Error);

        // 调用 refresh 重试
        await result.current.refresh();

        await waitFor(() => {
          expect(result.current.loading).toBe(false);
          expect(result.current.error).toBeNull();
        });

        // 核心断言：重试后数据应正确返回
        expect(result.current.data).toEqual(retryData);

        unmount();
      }),
      { numRuns: 20 },
    );
  }, 30000);
});


// ── Property 7: IPC 请求去重 ─────────────────────────────────────

// Feature: app-production-optimization, Property 7: IPC 请求去重
describe('Property 7: IPC 请求去重', () => {
  /**
   * **Validates: Requirements 3.8**
   *
   * 对于任意缓存键，如果在同一时刻发起多次并发请求，
   * 底层 fetcher 函数应只被调用一次，所有并发调用者应共享同一个 Promise 结果。
   */
  test('同一时刻多次并发请求只调用一次 fetcher，所有调用者共享结果', async () => {
    await fc.assert(
      fc.asyncProperty(
        cacheKeyArb,
        cacheDataArb,
        // 并发调用者数量：2 到 5 个
        fc.integer({ min: 2, max: 5 }),
        async (key, data, concurrentCount) => {
          // 为每次迭代使用唯一键，避免跨迭代缓存干扰
          const uniqueKey = `dedup_${key}_${Date.now()}_${Math.random()}`;
          // 每次迭代前清空缓存，确保测试隔离
          clearCache();

          // 创建可控的 fetcher：返回一个延迟 Promise，确保所有 hook 实例
          // 在 fetcher 完成前都已发起请求
          let resolveFetcher: ((value: unknown) => void) | null = null;
          const fetcher = vi.fn().mockImplementation(() => {
            return new Promise((resolve) => {
              resolveFetcher = resolve;
            });
          });

          // ── 同时渲染多个使用相同 key 的 hook 实例 ──
          const hooks: Array<{
            result: { current: ReturnType<typeof useIpcCache> };
            unmount: () => void;
          }> = [];

          for (let i = 0; i < concurrentCount; i++) {
            const hook = renderHook(() =>
              useIpcCache(uniqueKey, fetcher, {
                ttl: 30000,
                staleWhileRevalidate: false,
              }),
            );
            hooks.push(hook);
          }

          // 等待所有 hook 实例进入 loading 状态（确保请求已发起）
          for (const hook of hooks) {
            await waitFor(() => {
              expect(hook.result.current.loading).toBe(true);
            });
          }

          // 核心断言 1：fetcher 应只被调用一次（请求去重）
          expect(fetcher).toHaveBeenCalledTimes(1);

          // ── resolve fetcher，模拟数据返回 ──
          expect(resolveFetcher).not.toBeNull();
          resolveFetcher!(data);

          // 等待所有 hook 实例完成加载
          for (const hook of hooks) {
            await waitFor(() => {
              expect(hook.result.current.loading).toBe(false);
            });
          }

          // 核心断言 2：所有调用者应获得相同的数据
          for (const hook of hooks) {
            expect(hook.result.current.data).toEqual(data);
            expect(hook.result.current.error).toBeNull();
          }

          // 核心断言 3：fetcher 仍然只被调用了一次
          expect(fetcher).toHaveBeenCalledTimes(1);

          // 清理所有 hook 实例
          for (const hook of hooks) {
            hook.unmount();
          }
        },
      ),
      { numRuns: 20 },
    );
  }, 30000);
});
