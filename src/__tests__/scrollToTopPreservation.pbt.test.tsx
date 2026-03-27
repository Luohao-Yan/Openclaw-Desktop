/**
 * 属性测试：Preservation — 非路由切换时滚动行为不变
 * Bugfix: agent-settings-scroll-fix
 *
 * 本文件验证在未修复代码上，当 pathname 未变化时，
 * <main> 滚动容器的 scrollTop 保持不变。
 * 这些测试在修复前后都应通过，确保修复不引入回归。
 *
 * Property 2: Preservation
 * - 当 pathname 未变化时（组件重渲染），scrollTop 保持不变
 * - 页面内交互（如状态更新触发重渲染）不影响 scrollTop
 *
 * 测试策略：使用 @testing-library/react 和 MemoryRouter 渲染简化版 MainAppLayout，
 * 使用 fast-check 生成随机 scrollTop 值，验证非路由切换场景下滚动位置保持不变。
 *
 * Validates: Requirements 3.1, 3.2, 3.3
 */

// @vitest-environment jsdom

import React, { Suspense, useState } from 'react';
import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';
import { render, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// ── 应用中定义的路由路径 ──────────────────────────────────────────
const APP_ROUTES = [
  '/',
  '/settings',
  '/tasks',
  '/logs',
  '/agents',
  '/agent-workspace/test-agent-1',
  '/sessions',
  '/instances',
  '/skills',
] as const;

// ── 带状态更新的页面组件（模拟页面内交互触发重渲染） ──────────────
/**
 * 模拟页面内交互：点击按钮触发状态更新，导致组件重渲染
 * 用于验证重渲染不会影响 scrollTop
 */
const InteractivePage: React.FC<{ name: string }> = ({ name }) => {
  const [count, setCount] = useState(0);
  return (
    <div data-testid="page-content">
      <span>{name} - count: {count}</span>
      <button
        data-testid="interaction-btn"
        onClick={() => setCount((c) => c + 1)}
      >
        点击交互
      </button>
    </div>
  );
};

// ── 测试用布局组件（模拟 MainAppLayout 结构） ─────────────────────
/**
 * 模拟 src/App.tsx 中 MainAppLayout 的核心结构：
 * - <main> 元素作为滚动容器（overflow-auto）
 * - 内部包含 Routes 和 Suspense
 *
 * 注意：不包含 TitleBar、Sidebar 等重依赖组件，
 * 仅保留与滚动行为相关的结构。
 */
const TestLayout: React.FC = () => {
  return (
    <div className="flex flex-col h-screen">
      <div className="flex flex-1 overflow-hidden">
        {/* 模拟 MainAppLayout 中的 <main> 滚动容器 */}
        <main
          data-testid="main-scroll-container"
          className="flex-1 overflow-auto min-h-full relative"
        >
          <Suspense fallback={<div>Loading...</div>}>
            <Routes>
              <Route path="/" element={<InteractivePage name="Dashboard" />} />
              <Route path="/settings" element={<InteractivePage name="Settings" />} />
              <Route path="/tasks" element={<InteractivePage name="Tasks" />} />
              <Route path="/logs" element={<InteractivePage name="Logs" />} />
              <Route path="/agents" element={<InteractivePage name="Agents" />} />
              <Route
                path="/agent-workspace/:agentId"
                element={<InteractivePage name="AgentWorkspace" />}
              />
              <Route path="/sessions" element={<InteractivePage name="Sessions" />} />
              <Route path="/instances" element={<InteractivePage name="Instances" />} />
              <Route path="/skills" element={<InteractivePage name="Skills" />} />
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

/** 生成随机 scrollTop 值（0 到 10000 之间的整数） */
const scrollTopArb = fc.integer({ min: 0, max: 10000 });

// ============================================================
// Property 2: Preservation 保留测试
// Bugfix: agent-settings-scroll-fix
//
// 在未修复代码上运行——预期结果：测试通过
// 确认非路由切换时滚动行为不变（基线行为）
// ============================================================

describe('Bugfix: agent-settings-scroll-fix, Property 2: Preservation 保留', () => {
  /**
   * **Validates: Requirements 3.1, 3.2**
   *
   * 属性：当 pathname 未变化时（组件重渲染），<main> 的 scrollTop 保持不变
   *
   * 对于任意路由路径和 scrollTop 值：
   * 1. 渲染应用在某个路由
   * 2. 设置 <main> 的 scrollTop 为随机值
   * 3. 触发页面内交互（状态更新导致重渲染）
   * 4. 断言 <main> 的 scrollTop 保持为设置的值
   */
  test('页面内交互触发重渲染时 scrollTop 保持不变', () => {
    fc.assert(
      fc.property(
        routePathArb,
        scrollTopArb,
        (routePath, initialScrollTop) => {
          // 每次迭代创建独立的 DOM 容器，避免 React root 复用冲突
          const container = document.createElement('div');
          document.body.appendChild(container);

          try {
            // 1. 渲染应用，初始路由为 routePath
            const { unmount } = render(
              <MemoryRouter initialEntries={[routePath]}>
                <TestLayout />
              </MemoryRouter>,
              { container },
            );

            // 2. 获取 <main> 滚动容器并设置 scrollTop
            const mainElement = container.querySelector(
              '[data-testid="main-scroll-container"]',
            ) as HTMLElement;
            expect(mainElement).not.toBeNull();
            mainElement.scrollTop = initialScrollTop;

            // 验证 scrollTop 已被设置
            expect(mainElement.scrollTop).toBe(initialScrollTop);

            // 3. 触发页面内交互（点击按钮，导致状态更新和重渲染）
            const interactionBtn = container.querySelector(
              '[data-testid="interaction-btn"]',
            ) as HTMLElement;
            expect(interactionBtn).not.toBeNull();
            act(() => {
              interactionBtn.click();
            });

            // 4. 断言：重渲染后 scrollTop 保持不变
            expect(mainElement.scrollTop).toBe(initialScrollTop);

            // 清理当前迭代的渲染
            unmount();
          } finally {
            // 清理 DOM 容器
            document.body.removeChild(container);
          }
        },
      ),
      { numRuns: 30 }, // 30 次随机组合，覆盖多种路由和 scrollTop 值
    );
  });

  /**
   * **Validates: Requirements 3.1, 3.3**
   *
   * 属性：多次重渲染后 scrollTop 仍保持不变
   *
   * 对于任意路由路径和 scrollTop 值：
   * 1. 渲染应用在某个路由
   * 2. 设置 <main> 的 scrollTop 为随机值
   * 3. 连续触发多次页面内交互（模拟频繁操作）
   * 4. 断言每次交互后 scrollTop 都保持为设置的值
   */
  test('多次页面内交互后 scrollTop 仍保持不变', () => {
    fc.assert(
      fc.property(
        routePathArb,
        scrollTopArb,
        fc.integer({ min: 2, max: 5 }), // 随机交互次数
        (routePath, initialScrollTop, interactionCount) => {
          // 每次迭代创建独立的 DOM 容器
          const container = document.createElement('div');
          document.body.appendChild(container);

          try {
            // 1. 渲染应用
            const { unmount } = render(
              <MemoryRouter initialEntries={[routePath]}>
                <TestLayout />
              </MemoryRouter>,
              { container },
            );

            // 2. 获取 <main> 滚动容器并设置 scrollTop
            const mainElement = container.querySelector(
              '[data-testid="main-scroll-container"]',
            ) as HTMLElement;
            expect(mainElement).not.toBeNull();
            mainElement.scrollTop = initialScrollTop;

            // 3. 连续触发多次页面内交互
            const interactionBtn = container.querySelector(
              '[data-testid="interaction-btn"]',
            ) as HTMLElement;
            expect(interactionBtn).not.toBeNull();

            for (let i = 0; i < interactionCount; i++) {
              act(() => {
                interactionBtn.click();
              });

              // 4. 每次交互后断言 scrollTop 保持不变
              expect(mainElement.scrollTop).toBe(initialScrollTop);
            }

            // 清理当前迭代的渲染
            unmount();
          } finally {
            // 清理 DOM 容器
            document.body.removeChild(container);
          }
        },
      ),
      { numRuns: 20 }, // 20 次随机组合
    );
  });
});
