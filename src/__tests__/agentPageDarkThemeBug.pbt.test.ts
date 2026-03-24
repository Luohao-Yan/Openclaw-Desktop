/**
 * 属性测试：Bug Condition 探索 — Agent 页面暗色主题硬编码颜色值
 * Bugfix: agent-page-dark-theme-fix
 *
 * 本文件编码了修复后的期望行为。在未修复代码上运行时，
 * 测试应失败，从而确认 bug 存在。
 *
 * Property 1: Bug Condition
 * - 浅色主题下 Agent 页面组件使用硬编码暗色值
 * - GlassCard default/elevated variant 使用 rgba(255,255,255,...) 而非 CSS 自定义属性
 * - AgentSkillsPanel 使用 Tailwind dark: 前缀而非 CSS 自定义属性
 * - Agents 页面 toast 使用硬编码颜色值而非 CSS 自定义属性
 * - Agents 页面 AppBadge 使用 rgba(255,255,255,0.08) 而非 CSS 自定义属性
 *
 * 测试策略：直接读取源文件内容，检查是否使用了 CSS 自定义属性。
 * 这是确定性 bug，使用 Scoped PBT 将属性范围限定到具体的失败场景。
 */

import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs';
import * as path from 'path';

// ── 辅助函数 ──────────────────────────────────────────────────────

/** 读取源文件内容 */
function readSourceFile(relativePath: string): string {
  const fullPath = path.resolve(__dirname, '..', '..', relativePath);
  return fs.readFileSync(fullPath, 'utf-8');
}

/**
 * 从 GlassCard.tsx 源码中提取 getInlineStyle 函数体
 * 用于分析 default/elevated variant 的内联样式
 */
function extractGetInlineStyleBody(source: string): string {
  const startMarker = 'const getInlineStyle';
  const startIdx = source.indexOf(startMarker);
  if (startIdx === -1) return '';

  // 找到函数体的起始 {
  let braceStart = source.indexOf('{', startIdx);
  if (braceStart === -1) return '';

  // 匹配大括号，找到函数体结束位置
  let depth = 0;
  let i = braceStart;
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') depth--;
    if (depth === 0) break;
  }

  return source.slice(braceStart, i + 1);
}

/**
 * 从 getInlineStyle 函数体中提取指定 variant 的代码块
 */
function extractVariantBlock(fnBody: string, variant: 'default' | 'elevated'): string {
  const marker = `variant === '${variant}'`;
  const idx = fnBody.indexOf(marker);
  if (idx === -1) return '';

  // 找到该 if 块的 return { ... }
  const returnIdx = fnBody.indexOf('return', idx);
  if (returnIdx === -1) return '';

  const braceStart = fnBody.indexOf('{', returnIdx);
  if (braceStart === -1) return '';

  // 匹配大括号
  let depth = 0;
  let i = braceStart;
  for (; i < fnBody.length; i++) {
    if (fnBody[i] === '{') depth++;
    if (fnBody[i] === '}') depth--;
    if (depth === 0) break;
  }

  return fnBody.slice(braceStart, i + 1);
}

// ── 源文件路径常量 ────────────────────────────────────────────────

const GLASS_CARD_PATH = 'src/components/GlassCard.tsx';
const AGENT_SKILLS_PANEL_PATH = 'src/components/agents/AgentSkillsPanel.tsx';
const AGENTS_PAGE_PATH = 'src/pages/Agents.tsx';

// ── 生成器（Arbitraries）──────────────────────────────────────────

/** 受影响的 GlassCard variant */
const glassCardVariantArb = fc.constantFrom('default' as const, 'elevated' as const);

/** AgentSkillsPanel 中使用 dark: 前缀的样式模式 */
const darkTailwindPatternArb = fc.constantFrom(
  'dark:text-white',
  'dark:text-gray-400',
  'dark:border-gray-700',
  'dark:border-gray-600',
  'dark:bg-gray-800',
  'dark:bg-gray-900',
  'dark:hover:text-white',
  'dark:hover:bg-red-900/30',
  'dark:text-red-300',
  'dark:text-green-300',
  'dark:bg-red-900/20',
  'dark:bg-green-900/20',
  'dark:border-red-800',
  'dark:border-green-800',
);

/** Agents 页面 toast 硬编码颜色 */
const toastColorArb = fc.constantFrom(
  { type: 'success', hardcoded: '#6ee7b7', expected: 'var(--app-toast-success-text)' },
  { type: 'error', hardcoded: '#fca5a5', expected: 'var(--app-toast-error-text)' },
);

// ============================================================
// Property 1: Bug Condition 探索测试
// Bugfix: agent-page-dark-theme-fix
//
// 在未修复代码上运行——预期结果：测试失败
// 测试失败即确认 bug 存在
// ============================================================

describe('Bugfix: agent-page-dark-theme-fix, Property 1: Bug Condition 探索', () => {

  /**
   * **Validates: Requirements 1.2**
   *
   * 测试 1：GlassCard default variant 应使用 CSS 自定义属性 var(--app-glass-bg)
   * 而非硬编码的 rgba(255,255,255,...) 渐变背景。
   *
   * Bug 条件：浅色主题下 GlassCard default variant 背景为
   * linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)
   * 在浅色背景上几乎不可见。
   *
   * 期望行为：背景使用 var(--app-glass-bg) CSS 自定义属性
   * 未修复代码：使用硬编码 rgba(255,255,255,...) 值（测试失败，确认 bug 存在）
   */
  test('GlassCard default variant 背景应使用 var(--app-glass-bg) 而非硬编码 rgba 值', () => {
    fc.assert(
      fc.property(
        fc.constant('default' as const),
        (variant) => {
          const source = readSourceFile(GLASS_CARD_PATH);
          const fnBody = extractGetInlineStyleBody(source);
          const variantBlock = extractVariantBlock(fnBody, variant);

          // 期望行为：default variant 的 background 应使用 CSS 自定义属性
          expect(variantBlock).toContain('var(--app-glass-bg)');

          // 期望行为：不应包含硬编码的 rgba(255,255,255,...) 背景值
          expect(variantBlock).not.toMatch(/rgba\(255,\s*255,\s*255,\s*0\.06\)/);
          expect(variantBlock).not.toMatch(/rgba\(255,\s*255,\s*255,\s*0\.02\)/);
        },
      ),
      { numRuns: 1 },
    );
  });

  /**
   * **Validates: Requirements 1.3**
   *
   * 测试 2：GlassCard elevated variant 的边框应使用
   * var(--app-glass-elevated-border) 而非硬编码 rgba(255,255,255,0.14)。
   *
   * Bug 条件：浅色主题下 elevated variant 边框为 rgba(255,255,255,0.14)，
   * 在浅色背景上完全不可见。
   *
   * 期望行为：边框使用 var(--app-glass-elevated-border) CSS 自定义属性
   * 未修复代码：使用硬编码 rgba(255,255,255,0.14)（测试失败，确认 bug 存在）
   */
  test('GlassCard elevated variant 边框应使用 var(--app-glass-elevated-border) 而非硬编码值', () => {
    fc.assert(
      fc.property(
        fc.constant('elevated' as const),
        (variant) => {
          const source = readSourceFile(GLASS_CARD_PATH);
          const fnBody = extractGetInlineStyleBody(source);
          const variantBlock = extractVariantBlock(fnBody, variant);

          // 期望行为：elevated variant 的 border 应使用 CSS 自定义属性
          expect(variantBlock).toContain('var(--app-glass-elevated-border)');

          // 期望行为：不应包含硬编码的 rgba(255,255,255,0.14) 边框值
          expect(variantBlock).not.toMatch(/rgba\(255,\s*255,\s*255,\s*0\.14\)/);
        },
      ),
      { numRuns: 1 },
    );
  });

  /**
   * **Validates: Requirements 1.1**
   *
   * 测试 3：AgentSkillsPanel 应使用 style={{ color: 'var(--app-text)' }}
   * 而非 Tailwind dark:text-white 类。
   *
   * Bug 条件：AgentSkillsPanel 大量使用 Tailwind dark: 前缀类，
   * 与项目统一的 CSS 自定义属性模式不一致。
   *
   * 期望行为：不包含任何 dark: 前缀的 Tailwind 类
   * 未修复代码：包含 dark:text-white 等类（测试失败，确认 bug 存在）
   */
  test('AgentSkillsPanel 不应包含 Tailwind dark: 前缀类', () => {
    fc.assert(
      fc.property(
        darkTailwindPatternArb,
        (pattern) => {
          const source = readSourceFile(AGENT_SKILLS_PANEL_PATH);

          // 期望行为：源码中不应包含 dark: 前缀的 Tailwind 类
          expect(source).not.toContain(pattern);
        },
      ),
      { numRuns: 50 },
    );
  });

  /**
   * **Validates: Requirements 1.5**
   *
   * 测试 4：Agents 页面 toast 文字颜色应使用 CSS 自定义属性
   * var(--app-toast-success-text) / var(--app-toast-error-text)
   * 而非硬编码 #6ee7b7 / #fca5a5。
   *
   * Bug 条件：toast 文字颜色硬编码为暗色模式下的浅色值，
   * 在浅色背景上对比度不足。
   *
   * 期望行为：使用 CSS 自定义属性
   * 未修复代码：使用硬编码颜色值（测试失败，确认 bug 存在）
   */
  test('Agents 页面 toast 文字颜色应使用 CSS 自定义属性而非硬编码值', () => {
    fc.assert(
      fc.property(
        toastColorArb,
        ({ type, hardcoded, expected }) => {
          const source = readSourceFile(AGENTS_PAGE_PATH);

          // 定位 toast 渲染区域（搜索 toast 相关代码段）
          const toastSectionStart = source.indexOf("toast.type === 'success'");
          expect(toastSectionStart).toBeGreaterThan(-1);

          // 提取 toast 样式区域（向前搜索 style={{ 开始，向后搜索到 }} 结束）
          const styleStart = source.lastIndexOf('style={{', toastSectionStart);
          const styleEnd = source.indexOf('}}', toastSectionStart);
          const toastStyleSection = source.slice(styleStart, styleEnd + 2);

          // 期望行为：toast 样式中应使用 CSS 自定义属性
          expect(toastStyleSection).toContain(expected);

          // 期望行为：不应包含硬编码的颜色值
          expect(toastStyleSection).not.toContain(hardcoded);
        },
      ),
      { numRuns: 10 },
    );
  });

  /**
   * **Validates: Requirements 1.4**
   *
   * 测试 5：Agents 页面顶部 AppBadge 应使用 var(--app-bg-subtle)
   * 而非硬编码 rgba(255,255,255,0.08)。
   *
   * Bug 条件：顶部渐变卡片中的 AppBadge 使用白色半透明背景，
   * 在浅色背景上不可见。
   *
   * 期望行为：使用 var(--app-bg-subtle) CSS 自定义属性
   * 未修复代码：使用 rgba(255,255,255,0.08)（测试失败，确认 bug 存在）
   */
  test('Agents 页面顶部 AppBadge 不应使用硬编码 rgba(255,255,255,0.08) 背景', () => {
    fc.assert(
      fc.property(
        fc.constant('AppBadge'),
        () => {
          const source = readSourceFile(AGENTS_PAGE_PATH);

          // 定位顶部渐变卡片中的 AppBadge 区域
          // 搜索 "Multi-Agent System" 标记附近的 AppBadge
          const badgeMarker = "Multi-Agent System";
          const badgeIdx = source.indexOf(badgeMarker);
          expect(badgeIdx).toBeGreaterThan(-1);

          // 向前搜索该 AppBadge 的 style 属性
          const searchStart = source.lastIndexOf('<AppBadge', badgeIdx);
          const badgeSection = source.slice(searchStart, badgeIdx + badgeMarker.length + 50);

          // 期望行为：AppBadge 不应使用硬编码的 rgba(255,255,255,0.08)
          expect(badgeSection).not.toContain("rgba(255,255,255,0.08)");

          // 期望行为：应使用 var(--app-bg-subtle) CSS 自定义属性
          expect(badgeSection).toContain("var(--app-bg-subtle)");
        },
      ),
      { numRuns: 1 },
    );
  });
});
