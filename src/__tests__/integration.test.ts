/**
 * integration.test.ts
 *
 * 集成测试 — 验证端到端行为
 *
 * 测试 1：主题切换时 GlassCard 样式自动适配（需求 1.5）
 *   - 通过读取 CSS 文件验证 :root 和 [data-theme="light"] 中
 *     --app-glass-bg 和 --app-glass-elevated-bg 均为 rgba() 格式
 *   - 深色模式 alpha 较低，浅色模式 alpha 较高
 *
 * 测试 2：useIpcCache 缓存命中与 stale-while-revalidate 集成行为（需求 3.2, 3.3）
 *   - 多个 hook 实例共享同一缓存
 *
 * Feature: app-production-optimization
 */

// @vitest-environment jsdom

import { describe, test, expect, beforeEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { renderHook, waitFor } from '@testing-library/react';
import { useIpcCache, clearCache, getCacheEntry } from '../hooks/useIpcCache';

// ══════════════════════════════════════════════════════════════════
// 测试 1：主题切换时 GlassCard 样式自动适配
// ══════════════════════════════════════════════════════════════════

describe('集成测试：主题切换时 GlassCard 样式自动适配', () => {
  /** CSS 文件内容 */
  let cssContent: string;

  /**
   * 从 CSS 作用域块中提取指定变量的 rgba() alpha 值
   * @param css - CSS 文件内容
   * @param scope - 作用域选择器
   * @param varName - CSS 自定义属性名
   * @returns alpha 值，未找到返回 null
   */
  function extractAlpha(css: string, scope: string, varName: string): number | null {
    // 转义特殊正则字符
    const esc = scope.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const scopeRe = new RegExp(`${esc}\\s*\\{([^}]*(?:\\{[^}]*\\}[^}]*)*)\\}`, 'g');
    let m: RegExpExecArray | null;
    while ((m = scopeRe.exec(css)) !== null) {
      const varEsc = varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const varRe = new RegExp(
        `${varEsc}\\s*:\\s*rgba\\(\\s*\\d+\\s*,\\s*\\d+\\s*,\\s*\\d+\\s*,\\s*([\\d.]+)\\s*\\)`,
      );
      const vm = varRe.exec(m[1]);
      if (vm) return parseFloat(vm[1]);
    }
    return null;
  }

  beforeEach(() => {
    // 读取 src/index.css
    const cssPath = path.resolve(__dirname, '..', 'index.css');
    cssContent = fs.readFileSync(cssPath, 'utf-8');
  });

  /**
   * 验证: 需求 1.5
   * :root 和 [data-theme="light"] 中 --app-glass-bg 和 --app-glass-elevated-bg
   * 都应为 rgba() 格式
   */
  test(':root 和 [data-theme="light"] 的玻璃变量均为 rgba() 格式', () => {
    const vars = ['--app-glass-bg', '--app-glass-elevated-bg'] as const;
    const scopes = [':root', '[data-theme="light"]'] as const;

    for (const scope of scopes) {
      for (const v of vars) {
        const alpha = extractAlpha(cssContent, scope, v);
        // 能提取到 alpha 值说明是 rgba() 格式
        expect(alpha, `${scope} 中 ${v} 应为 rgba() 格式`).not.toBeNull();
        expect(alpha!, `${scope} 中 ${v} alpha 应为正数`).toBeGreaterThan(0);
      }
    }
  });

  /**
   * 验证: 需求 1.5
   * 深色模式 alpha 较低，浅色模式 alpha 较高
   */
  test('深色模式 alpha 较低，浅色模式 alpha 较高', () => {
    const vars = ['--app-glass-bg', '--app-glass-elevated-bg'] as const;

    for (const v of vars) {
      const darkAlpha = extractAlpha(cssContent, ':root', v);
      const lightAlpha = extractAlpha(cssContent, '[data-theme="light"]', v);

      expect(darkAlpha).not.toBeNull();
      expect(lightAlpha).not.toBeNull();

      // 深色模式 alpha 应严格小于浅色模式 alpha
      expect(
        darkAlpha!,
        `${v}: 深色模式 alpha (${darkAlpha}) 应 < 浅色模式 alpha (${lightAlpha})`,
      ).toBeLessThan(lightAlpha!);
    }
  });

  /**
   * 验证: 需求 1.5
   * elevated 变体 alpha 应 >= default 变体 alpha（两种主题下均成立）
   */
  test('两种主题下 elevated alpha >= default alpha', () => {
    const scopes = [':root', '[data-theme="light"]'] as const;

    for (const scope of scopes) {
      const defaultAlpha = extractAlpha(cssContent, scope, '--app-glass-bg');
      const elevatedAlpha = extractAlpha(cssContent, scope, '--app-glass-elevated-bg');

      expect(defaultAlpha).not.toBeNull();
      expect(elevatedAlpha).not.toBeNull();

      expect(
        elevatedAlpha!,
        `${scope}: elevated alpha (${elevatedAlpha}) 应 >= default alpha (${defaultAlpha})`,
      ).toBeGreaterThanOrEqual(defaultAlpha!);
    }
  });
});

// ══════════════════════════════════════════════════════════════════
// 测试 2：useIpcCache 缓存命中与 stale-while-revalidate 集成
// ══════════════════════════════════════════════════════════════════

describe('集成测试：useIpcCache 多实例共享缓存', () => {
  beforeEach(() => {
    clearCache();
    vi.restoreAllMocks();
  });

  /**
   * 验证: 需求 3.2
   * 多个 hook 实例使用同一 key 时，第一个实例获取数据后，
   * 后续实例应直接命中缓存，不再调用 fetcher
   */
  test('多个 hook 实例共享同一缓存，后续实例命中缓存不调用 fetcher', async () => {
    const key = `integration_shared_${Date.now()}`;
    const data = { status: 'running', agents: 5 };
    const fetcher = vi.fn().mockResolvedValue(data);

    // 第一个实例：首次获取数据
    const { result: r1, unmount: u1 } = renderHook(() =>
      useIpcCache(key, fetcher, { ttl: 30000, staleWhileRevalidate: false }),
    );

    await waitFor(() => {
      expect(r1.current.loading).toBe(false);
    });

    // 验证首次获取成功
    expect(r1.current.data).toEqual(data);
    expect(fetcher).toHaveBeenCalledTimes(1);

    // 重置 fetcher 调用计数
    fetcher.mockClear();

    // 第二个实例：使用同一 key，应命中缓存
    const { result: r2, unmount: u2 } = renderHook(() =>
      useIpcCache(key, fetcher, { ttl: 30000, staleWhileRevalidate: false }),
    );

    await waitFor(() => {
      expect(r2.current.loading).toBe(false);
    });

    // 核心断言：第二个实例直接返回缓存数据
    expect(r2.current.data).toEqual(data);
    expect(r2.current.isStale).toBe(false);
    // 核心断言：fetcher 不应被再次调用
    expect(fetcher).not.toHaveBeenCalled();

    // 第三个实例：同样应命中缓存
    const { result: r3, unmount: u3 } = renderHook(() =>
      useIpcCache(key, fetcher, { ttl: 30000, staleWhileRevalidate: false }),
    );

    await waitFor(() => {
      expect(r3.current.loading).toBe(false);
    });

    expect(r3.current.data).toEqual(data);
    expect(fetcher).not.toHaveBeenCalled();

    // 清理
    u1();
    u2();
    u3();
  });

  /**
   * 验证: 需求 3.2, 3.3
   * 缓存过期后，新实例通过 stale-while-revalidate 先返回旧数据，
   * 后台刷新后所有实例获得新数据
   */
  test('缓存过期后新实例触发 stale-while-revalidate，后台刷新更新数据', async () => {
    const key = `integration_swr_${Date.now()}`;
    const oldData = { version: '1.0', count: 10 };
    const newData = { version: '2.0', count: 20 };
    const shortTtl = 50;

    // 可控 fetcher：第一次返回旧数据，第二次返回可控 Promise
    let resolveRefresh: ((v: unknown) => void) | null = null;
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(oldData)
      .mockImplementationOnce(
        () => new Promise((resolve) => { resolveRefresh = resolve; }),
      );

    // 第一个实例：填充缓存
    const { result: r1, unmount: u1 } = renderHook(() =>
      useIpcCache(key, fetcher, { ttl: shortTtl, staleWhileRevalidate: true }),
    );

    await waitFor(() => {
      expect(r1.current.loading).toBe(false);
    });

    expect(r1.current.data).toEqual(oldData);
    expect(r1.current.isStale).toBe(false);
    u1();

    // 手动使缓存过期
    const entry = getCacheEntry(key);
    expect(entry).toBeDefined();
    (entry as { data: unknown; timestamp: number }).timestamp = Date.now() - shortTtl - 10;

    // 第二个实例：缓存已过期，应触发 stale-while-revalidate
    const { result: r2, unmount: u2 } = renderHook(() =>
      useIpcCache(key, fetcher, { ttl: shortTtl, staleWhileRevalidate: true }),
    );

    // 应立即返回过期的旧数据
    await waitFor(() => {
      expect(r2.current.data).toEqual(oldData);
      expect(r2.current.isStale).toBe(true);
    });

    // 后台刷新应已发起
    expect(fetcher).toHaveBeenCalledTimes(2);

    // 完成后台刷新
    expect(resolveRefresh).not.toBeNull();
    resolveRefresh!(newData);

    // 数据应更新为新值
    await waitFor(() => {
      expect(r2.current.data).toEqual(newData);
      expect(r2.current.isStale).toBe(false);
    });

    // 清理
    u2();
  });
});
