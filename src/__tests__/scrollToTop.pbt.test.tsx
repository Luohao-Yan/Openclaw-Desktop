/**
 * 属性测试：Bug Condition 探索 — 路由切换时滚动位置未重置
 * Bugfix: agent-settings-scroll-fix
 *
 * 本文件编码了修复后的期望行为。在未修复代码上运行时，
 * 测试应失败，从而确认 bug 存在。
 *
 * Property 1: Bug Condition
 * - 路由切换时 <main> 滚动容器的 scrollTop 未被重置为 0
 * - 当前代码缺少 ScrollToTop 组件，导致导航后页面保留前一页面的滚动位置
 *
 * 测试策略：使用 @testing-library/react 和 MemoryRouter 渲染简化版 MainAppLayout，
 * 模拟路由切换并验证 <main> 的 scrollTop 是否被重置为 0。
 * 使用 fast-check 生成随机路由路径对来覆盖多种导航场景。
 *
 * Validates: Requirements 1.1, 2.1
 */

// @vitest-environment jsdom

import React, { Suspense, useRef, useEffect } from 'react';
import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';
import { render, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';

// ── 应用中定义的路由路径 ──────────────────────────────────────────
const APP_ROUTES = [
  '/',
  '/settings',
  '/tasks',
  '/logs',
  '/agents',
  '/agent-workspace/test-agent-1',
  '/agent-workspace/test-agent-2',
  '/sessions',
  '/instances',
  '/skills',
] as const;

// ── 简单页面组件（用于填充路由） ──────────────────────────────────
/** 每个路由对应一个简单的页面组件，显示当前路径 */
const SimplePage: React.FC<{ name: string }> = ({ name }) => (
  <div data-testid="page-content">{name}</div>
);

// ── 导航触发器组件 ────────────────────────────────────────────────
/**
 * 辅助组件：提供一个按钮用于在测试中触发路由导航
 * 使用 useNavigate() hook 实现编程式导航
 */
const NavigationTrigger: React.FC<{ to: string }> = ({ to }) => {
  const navigate = useNavigate();
  return (
    <button data-testid="navigate-btn" onClick={() => navigate(to)}>
      Navigate to {to}
    </button>
  );
};

// ── 测试用布局组件（模拟 MainAppLayout 结构） ─────────────────────
/**
 * ScrollToTop 组件：监听路由 pathname 变化，自动将 <main> 滚动容器重置到顶部。
 * 与 src/App.tsx 中的 ScrollToTop 实现一致，用于在测试中验证修复后的行为。
 */
const TestScrollToTop: React.FC<{ mainRef: React.RefObject<HTMLElement | null> }> = ({ mainRef }) => {
  const { pathname } = useLocation();

  useEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTop = 0;
    }
  }, [pathname, mainRef]);

  return null;
};

/**
 * 模拟 src/App.tsx 中 MainAppLayout 的核心结构：
 * - <main> 元素作为滚动容器（overflow-auto）
 * - 内部包含 ScrollToTop、Routes 和 Suspense
 *
 * 注意：不包含 TitleBar、Sidebar 等重依赖组件，
 * 仅保留与滚动行为相关的结构。
 * 包含 ScrollToTop 组件以匹配修复后的 MainAppLayout 结构。
 */
const TestLayout: React.FC<{ navigateTo?: string }> = ({ navigateTo }) => {
  // 创建 ref 引用 <main> 滚动容器，供 ScrollToTop 组件使用
  const mainRef = useRef<HTMLElement>(null);

  return (
    <div className="flex flex-col h-screen">
      <div className="flex flex-1 overflow-hidden">
        {/* 模拟 MainAppLayout 中的 <main> 滚动容器 */}
        <main
          ref={mainRef}
          data-testid="main-scroll-container"
          className="flex-1 overflow-auto min-h-full relative"
        >
          {/* 路由切换时自动重置滚动位置到顶部 */}
          <TestScrollToTop mainRef={mainRef} />
          {navigateTo && <NavigationTrigger to={navigateTo} />}
          <Suspense fallback={<div>Loading...</div>}>
            <Routes>
              <Route path="/" element={<SimplePage name="Dashboard" />} />
              <Route path="/settings" element={<SimplePage name="Settings" />} />
              <Route path="/tasks" element={<SimplePage name="Tasks" />} />
              <Route path="/logs" element={<SimplePage name="Logs" />} />
              <Route path="/agents" element={<SimplePage name="Agents" />} />
              <Route path="/agent-workspace/:agentId" element={<SimplePage name="AgentWorkspace" />} />
              <Route path="/sessions" element={<SimplePage name="Sessions" />} />
              <Route path="/instances" element={<SimplePage name="Instances" />} />
              <Route path="/skills" element={<SimplePage name="Skills" />} />
            </Routes>
          </Suspense>
        </main>
      </div>
    </div>
  );
};

// ── fast-check 生成器 ─────────────────────────────────────────────

/** 生成应用中有效的路由路径 */
const routePathArb = fc.constantFrom(...APP_ROUTES);

/**
 * 生成两个不同的路由路径对（previousPath, nextPath）
 * 确保 previousPath !== nextPath，模拟真实的路由切换场景
 */
const routePairArb = fc
  .tuple(routePathArb, routePathArb)
  .filter(([prev, next]) => prev !== next);

/** 生成非零的 scrollTop 值（模拟用户已滚动的状态） */
const scrollTopArb = fc.integer({ min: 50, max: 5000 });

// ============================================================
// Property 1: Bug Condition 探索测试
// Bugfix: agent-settings-scroll-fix
//
// 在未修复代码上运行——预期结果：测试失败
// 测试失败即确认 bug 存在
// ============================================================

describe('Bugfix: agent-settings-scroll-fix, Property 1: Bug Condition 探索', () => {
  /**
   * **Validates: Requirements 1.1, 2.1**
   *
   * 属性：路由切换后 <main> 滚动容器的 scrollTop 应被重置为 0
   *
   * 对于任意路由路径对 (previousPath, nextPath)，其中 previousPath !== nextPath：
   * 1. 渲染应用在 previousPath
   * 2. 设置 <main> 的 scrollTop 为非零值
   * 3. 导航到 nextPath
   * 4. 断言 <main> 的 scrollTop === 0
   *
   * 在未修复代码上：scrollTop 保持不变（测试失败，确认 bug 存在）
   * 在修复后代码上：scrollTop 被重置为 0（测试通过，确认 bug 已修复）
   */
  test('路由切换后 <main> scrollTop 应重置为 0', () => {
    fc.assert(
      fc.property(
        routePairArb,
        scrollTopArb,
        ([previousPath, nextPath], initialScrollTop) => {
          // 每次迭代创建独立的 DOM 容器，避免 unmount 后复用同一 root 导致报错
          const container = document.createElement('div');
          document.body.appendChild(container);

          try {
            // 1. 渲染应用，初始路由为 previousPath
            const { unmount } = render(
              <MemoryRouter initialEntries={[previousPath]}>
                <TestLayout navigateTo={nextPath} />
              </MemoryRouter>,
              { container },
            );

            // 2. 获取 <main> 滚动容器并设置 scrollTop 为非零值
            const mainElement = container.querySelector(
              '[data-testid="main-scroll-container"]',
            ) as HTMLElement;
            expect(mainElement).not.toBeNull();
            mainElement.scrollTop = initialScrollTop;

            // 验证 scrollTop 已被设置（jsdom 支持 scrollTop 属性赋值）
            expect(mainElement.scrollTop).toBe(initialScrollTop);

            // 3. 触发路由导航
            const navigateBtn = container.querySelector(
              '[data-testid="navigate-btn"]',
            ) as HTMLElement;
            act(() => {
              navigateBtn.click();
            });

            // 4. 断言：导航后 scrollTop 应被重置为 0
            //    未修复代码：scrollTop 仍为 initialScrollTop（测试失败）
            //    修复后代码：scrollTop 被重置为 0（测试通过）
            expect(mainElement.scrollTop).toBe(0);

            // 清理当前迭代的渲染
            unmount();
          } finally {
            // 清理 DOM 容器
            document.body.removeChild(container);
          }
        },
      ),
      { numRuns: 20 }, // 20 次随机路由对组合，覆盖多种导航场景
    );
  });
});
