/**
 * 属性测试：Preservation — Agent 页面暗色主题修复的保持性验证
 * Bugfix: agent-page-dark-theme-fix
 *
 * 本文件验证修复不会破坏以下行为：
 * - 暗色主题下 GlassCard default/elevated variant 的视觉效果
 * - GlassCard status variant（green/red/yellow/blue/purple）的彩色渐变背景和装饰光晕
 * - GlassCard gradient variant 的渐变背景和高光叠加层
 *
 * 测试策略：源码分析（读取文件内容），与 bug condition 测试保持一致的方法论。
 * 采用 observation-first 方法：先观察当前（未修复）代码的行为，再编码为属性。
 *
 * **Validates: Requirements 3.1, 3.2, 3.3**
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
 */
function extractGetInlineStyleBody(source: string): string {
  const startMarker = 'const getInlineStyle';
  const startIdx = source.indexOf(startMarker);
  if (startIdx === -1) return '';

  let braceStart = source.indexOf('{', startIdx);
  if (braceStart === -1) return '';

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
function extractVariantBlock(fnBody: string, variant: string): string {
  const marker = `variant === '${variant}'`;
  const idx = fnBody.indexOf(marker);
  if (idx === -1) return '';

  const returnIdx = fnBody.indexOf('return', idx);
  if (returnIdx === -1) return '';

  const braceStart = fnBody.indexOf('{', returnIdx);
  if (braceStart === -1) return '';

  let depth = 0;
  let i = braceStart;
  for (; i < fnBody.length; i++) {
    if (fnBody[i] === '{') depth++;
    if (fnBody[i] === '}') depth--;
    if (depth === 0) break;
  }
  return fnBody.slice(braceStart, i + 1);
}

/**
 * 从源码中提取 statusStyles 对象的指定颜色块
 */
function extractStatusStyleBlock(source: string, color: string): string {
  const marker = `${color}:`;
  // 在 statusStyles 对象内搜索
  const statusStylesStart = source.indexOf('const statusStyles');
  if (statusStylesStart === -1) return '';

  const searchArea = source.slice(statusStylesStart);
  const colorIdx = searchArea.indexOf(marker);
  if (colorIdx === -1) return '';

  const braceStart = searchArea.indexOf('{', colorIdx);
  if (braceStart === -1) return '';

  let depth = 0;
  let i = braceStart;
  for (; i < searchArea.length; i++) {
    if (searchArea[i] === '{') depth++;
    if (searchArea[i] === '}') depth--;
    if (depth === 0) break;
  }
  return searchArea.slice(braceStart, i + 1);
}

// ── 源文件路径常量 ────────────────────────────────────────────────

const GLASS_CARD_PATH = 'src/components/GlassCard.tsx';

// ── 观察记录：修复前的硬编码值 ──────────────────────────────────────
// 以下值通过直接阅读 GlassCard.tsx 源码观察得到

/** status variant 各颜色的期望渐变背景（观察值） */
const STATUS_COLOR_EXPECTED: Record<string, { bgStart: string; bgEnd: string; border: string }> = {
  green: {
    bgStart: 'rgba(52,211,153,0.14)',
    bgEnd: 'rgba(16,185,129,0.08)',
    border: 'rgba(52,211,153,0.22)',
  },
  red: {
    bgStart: 'rgba(239,68,68,0.14)',
    bgEnd: 'rgba(220,38,38,0.08)',
    border: 'rgba(239,68,68,0.22)',
  },
  yellow: {
    bgStart: 'rgba(251,191,36,0.14)',
    bgEnd: 'rgba(245,158,11,0.08)',
    border: 'rgba(251,191,36,0.22)',
  },
  blue: {
    bgStart: 'rgba(96,165,250,0.14)',
    bgEnd: 'rgba(59,130,246,0.08)',
    border: 'rgba(96,165,250,0.22)',
  },
  purple: {
    bgStart: 'rgba(167,139,250,0.14)',
    bgEnd: 'rgba(139,92,246,0.08)',
    border: 'rgba(167,139,250,0.22)',
  },
};

/** 装饰光晕颜色映射（观察值） */
const GLOW_COLORS: Record<string, string> = {
  green: '#34d399',
  red: '#f87171',
  yellow: '#fbbf24',
  blue: '#60a5fa',
  purple: '#a78bfa',
};

// ── 生成器（Arbitraries）──────────────────────────────────────────

/** GlassCard status variant 的所有颜色 */
const statusColorArb = fc.constantFrom(
  'green' as const,
  'red' as const,
  'yellow' as const,
  'blue' as const,
  'purple' as const,
);

/** GlassCard default/elevated variant */
const darkThemeVariantArb = fc.constantFrom('default' as const, 'elevated' as const);

// ============================================================
// Property 2: Preservation — 暗色主题及 status/gradient variant 行为不变
// Bugfix: agent-page-dark-theme-fix
//
// 在未修复代码上运行——预期结果：测试通过
// 测试通过即确认保持性属性成立
// ============================================================

describe('Bugfix: agent-page-dark-theme-fix, Property 2: Preservation', () => {

  /**
   * **Validates: Requirements 3.1, 3.2**
   *
   * 保持性测试 1：暗色主题下 GlassCard default/elevated variant 的硬编码值
   * 在修复后应通过 CSS 自定义属性解析为相同的值。
   *
   * 观察（修复前）：
   * - default variant: background = linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)
   * - elevated variant: background = linear-gradient(135deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.04) 100%)
   *                     border = 1px solid rgba(255,255,255,0.14)
   *
   * 修复后，这些值将通过 var(--app-glass-bg) 等 CSS 自定义属性引用。
   * 在暗色主题（:root）下，CSS 自定义属性的值应与修复前硬编码值一致。
   *
   * 测试方法：检查源码中 default/elevated variant 块是否包含正确的渐变值
   * （直接硬编码或通过 CSS 自定义属性引用均可，只要暗色主题下最终值一致）。
   *
   * 策略：如果源码使用 var(--app-glass-*)，则检查 index.css 中 :root 下的定义值；
   *       如果源码直接硬编码，则检查硬编码值是否与观察值一致。
   */
  test('暗色主题下 GlassCard default/elevated variant 的视觉效果保持不变', () => {
    fc.assert(
      fc.property(
        darkThemeVariantArb,
        (variant) => {
          const source = readSourceFile(GLASS_CARD_PATH);
          const fnBody = extractGetInlineStyleBody(source);
          const variantBlock = extractVariantBlock(fnBody, variant);

          // 确保 variant 块存在
          expect(variantBlock.length).toBeGreaterThan(0);

          if (variant === 'default') {
            // 观察值：default variant 背景渐变
            const expectedBgStart = 'rgba(255,255,255,0.06)';
            const expectedBgEnd = 'rgba(255,255,255,0.02)';

            // 检查方式：源码直接包含硬编码值，或使用 CSS 自定义属性
            const usesHardcoded = variantBlock.includes(expectedBgStart) && variantBlock.includes(expectedBgEnd);
            const usesCSSVar = variantBlock.includes('var(--app-glass-bg)');

            if (usesCSSVar) {
              // 修复后：检查 index.css 中 :root 下的 --app-glass-bg 值
              const cssSource = readSourceFile('src/index.css');
              // 在 :root 块中查找 --app-glass-bg 的定义
              const rootBlock = extractCSSRootBlock(cssSource);
              expect(rootBlock).toContain('--app-glass-bg');
              // 验证 :root 中的值包含原始的暗色渐变值
              expect(rootBlock).toContain(expectedBgStart);
              expect(rootBlock).toContain(expectedBgEnd);
            } else {
              // 未修复：直接验证硬编码值
              expect(usesHardcoded).toBe(true);
            }
          }

          if (variant === 'elevated') {
            // 观察值：elevated variant 背景渐变和边框
            const expectedBgStart = 'rgba(255,255,255,0.10)';
            const expectedBgEnd = 'rgba(255,255,255,0.04)';
            const expectedBorder = 'rgba(255,255,255,0.14)';

            const usesHardcodedBg = variantBlock.includes(expectedBgStart) && variantBlock.includes(expectedBgEnd);
            const usesHardcodedBorder = variantBlock.includes(expectedBorder);
            const usesCSSVarBg = variantBlock.includes('var(--app-glass-elevated-bg)');
            const usesCSSVarBorder = variantBlock.includes('var(--app-glass-elevated-border)');

            if (usesCSSVarBg) {
              // 修复后：检查 index.css 中 :root 下的定义
              const cssSource = readSourceFile('src/index.css');
              const rootBlock = extractCSSRootBlock(cssSource);
              expect(rootBlock).toContain('--app-glass-elevated-bg');
              expect(rootBlock).toContain(expectedBgStart);
              expect(rootBlock).toContain(expectedBgEnd);
            } else {
              expect(usesHardcodedBg).toBe(true);
            }

            if (usesCSSVarBorder) {
              const cssSource = readSourceFile('src/index.css');
              const rootBlock = extractCSSRootBlock(cssSource);
              expect(rootBlock).toContain('--app-glass-elevated-border');
              expect(rootBlock).toContain(expectedBorder);
            } else {
              expect(usesHardcodedBorder).toBe(true);
            }
          }
        },
      ),
      { numRuns: 10 },
    );
  });

  /**
   * **Validates: Requirements 3.3**
   *
   * 保持性测试 2：GlassCard status variant 的彩色渐变背景不受修复影响。
   *
   * 观察（修复前）：
   * - green: linear-gradient(135deg, rgba(52,211,153,0.14) 0%, rgba(16,185,129,0.08) 100%), border rgba(52,211,153,0.22)
   * - red: linear-gradient(135deg, rgba(239,68,68,0.14) 0%, rgba(220,38,38,0.08) 100%), border rgba(239,68,68,0.22)
   * - yellow: linear-gradient(135deg, rgba(251,191,36,0.14) 0%, rgba(245,158,11,0.08) 100%), border rgba(251,191,36,0.22)
   * - blue: linear-gradient(135deg, rgba(96,165,250,0.14) 0%, rgba(59,130,246,0.08) 100%), border rgba(96,165,250,0.22)
   * - purple: linear-gradient(135deg, rgba(167,139,250,0.14) 0%, rgba(139,92,246,0.08) 100%), border rgba(167,139,250,0.22)
   *
   * 这些 status variant 的颜色值不应被修复改变。
   */
  test('GlassCard status variant 的彩色渐变背景和边框保持不变', () => {
    fc.assert(
      fc.property(
        statusColorArb,
        (color) => {
          const source = readSourceFile(GLASS_CARD_PATH);
          const statusBlock = extractStatusStyleBlock(source, color);
          const expected = STATUS_COLOR_EXPECTED[color];

          // 确保 status 颜色块存在
          expect(statusBlock.length).toBeGreaterThan(0);

          // 验证渐变背景起始色
          expect(statusBlock).toContain(expected.bgStart);
          // 验证渐变背景结束色
          expect(statusBlock).toContain(expected.bgEnd);
          // 验证边框颜色
          expect(statusBlock).toContain(expected.border);
        },
      ),
      { numRuns: 20 },
    );
  });

  /**
   * **Validates: Requirements 3.3**
   *
   * 保持性测试 3：GlassCard status variant 的装饰光晕颜色不受修复影响。
   *
   * 观察（修复前）：
   * - 当 variant === 'status' 或 'gradient' 且 statusColor 存在时，
   *   渲染右上角装饰光晕 div，backgroundColor 由 statusColor 决定：
   *   green=#34d399, red=#f87171, yellow=#fbbf24, blue=#60a5fa, purple=#a78bfa
   */
  test('GlassCard status variant 的装饰光晕颜色保持不变', () => {
    fc.assert(
      fc.property(
        statusColorArb,
        (color) => {
          const source = readSourceFile(GLASS_CARD_PATH);
          const expectedGlowColor = GLOW_COLORS[color];

          // 验证源码中包含该光晕颜色值
          expect(source).toContain(expectedGlowColor);

          // 验证光晕渲染条件：(variant === 'status' || variant === 'gradient') && statusColor
          expect(source).toContain("(variant === 'status' || variant === 'gradient') && statusColor");
        },
      ),
      { numRuns: 20 },
    );
  });

  /**
   * **Validates: Requirements 3.3**
   *
   * 保持性测试 4：GlassCard gradient variant 的渐变背景和高光叠加层不受修复影响。
   *
   * 观察（修复前）：
   * - gradient variant 背景: linear-gradient(135deg, rgba(99,102,241,0.14) 0%, rgba(139,92,246,0.08) 100%)
   * - gradient variant 边框: 1px solid rgba(99,102,241,0.22)
   * - 高光叠加层: linear-gradient(135deg, rgba(255,255,255,0.06) 0%, transparent 60%)
   */
  test('GlassCard gradient variant 的渐变背景和高光叠加层保持不变', () => {
    fc.assert(
      fc.property(
        fc.constant('gradient' as const),
        () => {
          const source = readSourceFile(GLASS_CARD_PATH);
          const fnBody = extractGetInlineStyleBody(source);
          const gradientBlock = extractVariantBlock(fnBody, 'gradient');

          // 验证 gradient variant 块存在
          expect(gradientBlock.length).toBeGreaterThan(0);

          // 验证渐变背景值
          expect(gradientBlock).toContain('rgba(99,102,241,0.14)');
          expect(gradientBlock).toContain('rgba(139,92,246,0.08)');
          // 验证边框值
          expect(gradientBlock).toContain('rgba(99,102,241,0.22)');

          // 验证高光叠加层存在
          expect(source).toContain("variant === 'gradient'");
          // 高光叠加层的渐变值
          expect(source).toContain('rgba(255,255,255,0.06) 0%, transparent 60%');
        },
      ),
      { numRuns: 5 },
    );
  });
});

// ── 额外辅助函数 ──────────────────────────────────────────────────

/**
 * 从 CSS 源码中提取 :root 块的内容
 * 用于验证修复后 CSS 自定义属性在暗色主题下的值
 */
function extractCSSRootBlock(cssSource: string): string {
  const rootIdx = cssSource.indexOf(':root');
  if (rootIdx === -1) return '';

  const braceStart = cssSource.indexOf('{', rootIdx);
  if (braceStart === -1) return '';

  let depth = 0;
  let i = braceStart;
  for (; i < cssSource.length; i++) {
    if (cssSource[i] === '{') depth++;
    if (cssSource[i] === '}') depth--;
    if (depth === 0) break;
  }
  return cssSource.slice(braceStart, i + 1);
}
