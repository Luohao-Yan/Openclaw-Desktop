/**
 * useIpcCache.ts
 *
 * IPC 数据缓存 Hook —— 提供内存级缓存、TTL 过期、stale-while-revalidate、
 * 请求去重和超时处理能力，减少重复 IPC 调用，提升页面加载性能。
 *
 * 需求引用: 3.2（缓存命中）、3.3（stale-while-revalidate）、
 *          3.7（5 秒超时）、3.8（请求去重）
 */

import { useState, useEffect, useCallback, useRef } from 'react';

// ── 类型定义 ──────────────────────────────────────────────────────

/** 缓存条目：存储数据及其写入时间戳 */
interface CacheEntry<T = unknown> {
  data: T;
  timestamp: number;
}

/** useIpcCache 配置选项 */
export interface UseIpcCacheOptions {
  /** 缓存有效期（毫秒），默认 30000ms */
  ttl?: number;
  /** 是否启用 stale-while-revalidate 策略，默认 true */
  staleWhileRevalidate?: boolean;
  /** 请求超时时间（毫秒），默认 5000ms */
  timeout?: number;
}

/** useIpcCache 返回值 */
export interface UseIpcCacheResult<T> {
  /** 缓存或最新数据，未获取时为 null */
  data: T | null;
  /** 是否正在加载中 */
  loading: boolean;
  /** 请求错误信息 */
  error: Error | null;
  /** 手动刷新函数，可用于超时后重试 */
  refresh: () => Promise<void>;
  /** 当前返回的数据是否为过期缓存 */
  isStale: boolean;
}

// ── 默认常量 ──────────────────────────────────────────────────────

/** 默认缓存有效期：30 秒 */
const DEFAULT_TTL = 30000;

/** 请求超时时间：5 秒 */
const REQUEST_TIMEOUT = 5000;

// ── 全局缓存存储 ──────────────────────────────────────────────────

/** 全局缓存 Map：key -> CacheEntry */
const cacheStore = new Map<string, CacheEntry>();

/** 进行中的请求 Map：用于请求去重，同一 key 共享同一 Promise */
const pendingRequests = new Map<string, Promise<unknown>>();

// ── 辅助函数 ──────────────────────────────────────────────────────

/**
 * 判断缓存条目是否在 TTL 有效期内
 * @param entry - 缓存条目
 * @param ttl - 有效期（毫秒）
 * @returns 是否有效
 */
function isCacheValid<T>(entry: CacheEntry<T>, ttl: number): boolean {
  return Date.now() - entry.timestamp < ttl;
}

/**
 * 为 fetcher 添加超时控制，超过指定时间后 reject
 * @param fetcher - 原始数据获取函数
 * @param timeoutMs - 超时时间（毫秒）
 * @returns 带超时控制的 Promise
 */
function withTimeout<T>(fetcher: () => Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    /** 超时定时器 ID */
    const timer = setTimeout(() => {
      reject(new Error(`IPC 请求超时（${timeoutMs}ms）`));
    }, timeoutMs);

    fetcher()
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

// ── Hook 主体 ─────────────────────────────────────────────────────

/**
 * IPC 数据缓存 Hook
 *
 * 核心行为：
 * - 首次调用：发起 IPC 请求，缓存结果
 * - 缓存有效期内：直接返回缓存数据，不再调用 fetcher
 * - 缓存过期（stale-while-revalidate）：先返回旧数据（isStale=true），后台刷新
 * - 请求去重：同一 key 的并发请求共享同一 Promise
 * - 5 秒超时：超时后设置错误状态，提供 refresh 重试
 * - 组件卸载时取消订阅缓存更新
 *
 * @param key - 缓存键，用于标识不同的 IPC 请求
 * @param fetcher - 数据获取函数，返回 Promise
 * @param options - 可选配置
 * @returns 缓存状态和控制函数
 */
export function useIpcCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  options?: UseIpcCacheOptions,
): UseIpcCacheResult<T> {
  const ttl = options?.ttl ?? DEFAULT_TTL;
  const staleWhileRevalidate = options?.staleWhileRevalidate ?? true;
  const timeout = options?.timeout ?? REQUEST_TIMEOUT;

  // ── 状态 ────────────────────────────────────────────────────────
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [isStale, setIsStale] = useState<boolean>(false);

  /** 标记组件是否已卸载，防止卸载后更新状态 */
  const cancelledRef = useRef(false);

  /** 保存最新的 fetcher 引用，避免闭包陈旧问题 */
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  /** 保存最新的 key 引用 */
  const keyRef = useRef(key);
  keyRef.current = key;

  /** 保存最新的超时时间引用 */
  const timeoutRef = useRef(timeout);
  timeoutRef.current = timeout;

  // ── 核心获取逻辑 ────────────────────────────────────────────────

  /**
   * 执行数据获取（带去重和超时控制）
   * 同一 key 的并发请求会共享同一个 Promise，避免重复调用 fetcher
   */
  const executeFetch = useCallback(async (): Promise<T> => {
    const currentKey = keyRef.current;

    // 请求去重：如果已有进行中的请求，直接复用
    const existing = pendingRequests.get(currentKey);
    if (existing) {
      return existing as Promise<T>;
    }

    // 创建带超时控制的请求（使用可配置的超时时间）
    const request = withTimeout(() => fetcherRef.current(), timeoutRef.current)
      .then((result) => {
        // 请求成功：更新全局缓存
        cacheStore.set(currentKey, {
          data: result,
          timestamp: Date.now(),
        });
        return result;
      })
      .finally(() => {
        // 无论成功失败，清除进行中的请求记录
        pendingRequests.delete(currentKey);
      });

    // 注册为进行中的请求
    pendingRequests.set(currentKey, request);

    return request;
  }, []);

  // ── 数据加载逻辑 ────────────────────────────────────────────────

  /**
   * 加载数据：检查缓存 -> 决定是否发起请求
   * @param isRefresh - 是否为手动刷新（跳过缓存检查）
   */
  const loadData = useCallback(
    async (isRefresh = false) => {
      const currentKey = keyRef.current;

      // 检查全局缓存
      const cached = cacheStore.get(currentKey) as CacheEntry<T> | undefined;

      if (cached && !isRefresh) {
        if (isCacheValid(cached, ttl)) {
          // 缓存有效：直接返回缓存数据，不发起请求
          if (!cancelledRef.current) {
            setData(cached.data);
            setLoading(false);
            setError(null);
            setIsStale(false);
          }
          return;
        }

        // 缓存过期 + stale-while-revalidate 启用：先返回旧数据
        if (staleWhileRevalidate) {
          if (!cancelledRef.current) {
            setData(cached.data);
            setIsStale(true);
            setLoading(true);
            setError(null);
          }
        }
      }

      // 无缓存或缓存过期：设置加载状态
      if (!cached || !staleWhileRevalidate || isRefresh) {
        if (!cancelledRef.current) {
          setLoading(true);
          setError(null);
        }
      }

      try {
        const result = await executeFetch();

        // 组件未卸载且 key 未变化时才更新状态
        if (!cancelledRef.current && keyRef.current === currentKey) {
          setData(result);
          setLoading(false);
          setError(null);
          setIsStale(false);
        }
      } catch (err) {
        // 请求失败：设置错误状态，不污染缓存
        if (!cancelledRef.current && keyRef.current === currentKey) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setLoading(false);
          // stale-while-revalidate 模式下保留旧数据
          if (!staleWhileRevalidate || !cached) {
            setData(null);
          }
        }
      }
    },
    [ttl, staleWhileRevalidate, executeFetch],
  );

  // ── 手动刷新 ────────────────────────────────────────────────────

  /** 手动刷新：强制重新获取数据，可用于超时后重试 */
  const refresh = useCallback(async (): Promise<void> => {
    await loadData(true);
  }, [loadData]);

  // ── 副作用：初始加载 & key 变化时重新加载 ───────────────────────

  useEffect(() => {
    // 重置取消标记
    cancelledRef.current = false;

    // 发起数据加载
    loadData();

    // 组件卸载时取消订阅缓存更新
    return () => {
      cancelledRef.current = true;
    };
  }, [key, loadData]);

  return { data, loading, error, refresh, isStale };
}

// ── 导出工具函数（供测试使用）─────────────────────────────────────

/** 清空全局缓存（仅供测试使用） */
export function clearCache(): void {
  cacheStore.clear();
  pendingRequests.clear();
}

/** 获取缓存条目（仅供测试使用） */
export function getCacheEntry<T>(key: string): CacheEntry<T> | undefined {
  return cacheStore.get(key) as CacheEntry<T> | undefined;
}

/** 获取进行中的请求数量（仅供测试使用） */
export function getPendingRequestCount(): number {
  return pendingRequests.size;
}

export default useIpcCache;
