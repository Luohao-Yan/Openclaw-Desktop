/**
 * glassCard.pbt.test.ts
 *
 * GlassCard 玻璃质感卡片 - 属性测试
 * 使用 fast-check 验证 CSS 自定义属性中 GlassCard 变体的 alpha 值范围
 */

import { describe, test, expect, beforeAll } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs';
import * as path from 'path';

// ── 辅助函数 ──────────────────────────────────────────────────────

/**
 * 从 CSS 文件内容中提取指定作用域下某个 CSS 自定义属性的 rgba() 值
 * @param css - CSS 文件完整内容
 * @param scope - 作用域选择器，如 ':root' 或 '[data-theme="light"]'
 * @param varName - CSS 自定义属性名，如 '--app-glass-bg'
 * @returns 解析后的 { r, g, b, a } 对象，未找到时返回 null
 */
function extractRgbaFromScope(
  css: string,
  scope: string,
  varName: string,
): { r: number; g: number; b: number; a: number } | null {
  // 转义 scope 中的特殊正则字符（如方括号、引号等）
  const escapedScope = scope.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // 匹配指定作用域的整个块内容（支持嵌套大括号）
  const scopeRegex = new RegExp(`${escapedScope}\\s*\\{([^}]*(?:\\{[^}]*\\}[^}]*)*)\\}`, 'g');
  let match: RegExpExecArray | null;

  while ((match = scopeRegex.exec(css)) !== null) {
    const blockContent = match[1];

    // 在块内容中查找指定变量的 rgba() 值
    const varRegex = new RegExp(
      `${varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:\\s*rgba\\(\\s*(\\d+)\\s*,\\s*(\\d+)\\s*,\\s*(\\d+)\\s*,\\s*([\\d.]+)\\s*\\)`,
    );
    const varMatch = varRegex.exec(blockContent);

    if (varMatch) {
      return {
        r: parseInt(varMatch[1], 10),
        g: parseInt(varMatch[2], 10),
        b: parseInt(varMatch[3], 10),
        a: parseFloat(varMatch[4]),
      };
    }
  }

  return null;
}

// ── 测试数据准备 ──────────────────────────────────────────────────

/** CSS 文件内容（测试开始前读取一次） */
let cssContent: string;

/** 深色模式（:root）下的 GlassCard 变量值 */
let darkDefaultAlpha: number;
let darkElevatedAlpha: number;

/** 浅色模式（[data-theme="light"]）下的 GlassCard 变量值 */
let lightDefaultAlpha: number;
let lightElevatedAlpha: number;

beforeAll(() => {
  // 读取 src/index.css 文件
  const cssPath = path.resolve(__dirname, '..', 'index.css');
  cssContent = fs.readFileSync(cssPath, 'utf-8');

  // 解析深色模式下的 alpha 值
  const darkDefault = extractRgbaFromScope(cssContent, ':root', '--app-glass-bg');
  const darkElevated = extractRgbaFromScope(cssContent, ':root', '--app-glass-elevated-bg');

  // 解析浅色模式下的 alpha 值
  const lightDefault = extractRgbaFromScope(
    cssContent,
    '[data-theme="light"]',
    '--app-glass-bg',
  );
  const lightElevated = extractRgbaFromScope(
    cssContent,
    '[data-theme="light"]',
    '--app-glass-elevated-bg',
  );

  // 确保所有变量都已正确解析
  expect(darkDefault).not.toBeNull();
  expect(darkElevated).not.toBeNull();
  expect(lightDefault).not.toBeNull();
  expect(lightElevated).not.toBeNull();

  darkDefaultAlpha = darkDefault!.a;
  darkElevatedAlpha = darkElevated!.a;
  lightDefaultAlpha = lightDefault!.a;
  lightElevatedAlpha = lightElevated!.a;
});

// ── 生成器（Arbitraries）──────────────────────────────────────────

/** GlassCard 变体类型 */
type GlassVariant = 'default' | 'elevated';

/** 主题类型 */
type ThemeMode = 'dark' | 'light';

/** 变体生成器 */
const variantArb: fc.Arbitrary<GlassVariant> = fc.constantFrom('default', 'elevated');

/** 主题生成器 */
const themeModeArb: fc.Arbitrary<ThemeMode> = fc.constantFrom('dark', 'light');

/**
 * 根据变体和主题获取对应的 alpha 值
 */
function getAlphaForVariantAndTheme(variant: GlassVariant, theme: ThemeMode): number {
  if (theme === 'dark') {
    return variant === 'default' ? darkDefaultAlpha : darkElevatedAlpha;
  }
  return variant === 'default' ? lightDefaultAlpha : lightElevatedAlpha;
}

/**
 * 获取变体在指定主题下的 alpha 值范围
 * 深色模式：
 *   - default: [0.02, 0.12]（需求 1.1）
 *   - elevated: [0.04, 0.16]（需求 1.2）
 * 浅色模式：
 *   - default: [0.60, 0.80]（需求 1.4，浅色模式使用更高的 alpha 值）
 *   - elevated: [0.60, 0.80]（需求 1.4，浅色模式使用更高的 alpha 值）
 */
function getAlphaRange(variant: GlassVariant, theme: ThemeMode): { min: number; max: number } {
  if (theme === 'dark') {
    if (variant === 'default') {
      return { min: 0.02, max: 0.12 };
    }
    return { min: 0.04, max: 0.16 };
  }
  // 浅色模式下 default 和 elevated 都在 [0.60, 0.80] 范围内（需求 1.4）
  return { min: 0.60, max: 0.80 };
}

// ── Property 1: GlassCard 变体背景 alpha 值范围 ───────────────────

// Feature: app-production-optimization, Property 1: GlassCard 变体背景 alpha 值范围
describe('Property 1: GlassCard 变体背景 alpha 值范围', () => {
  /**
   * **Validates: Requirements 1.1, 1.2**
   *
   * 对于任意 GlassCard 变体（default 或 elevated）和任意主题（dark 或 light），
   * 其 CSS 自定义属性中的 alpha 通道值应在该变体的指定范围内：
   * - default: [0.02, 0.12]
   * - elevated: [0.04, 0.16]
   */
  test('任意变体和主题组合下，alpha 值应在指定范围内', () => {
    fc.assert(
      fc.property(variantArb, themeModeArb, (variant, theme) => {
        const alpha = getAlphaForVariantAndTheme(variant, theme);
        const range = getAlphaRange(variant, theme);

        // alpha 值应在指定范围内
        expect(alpha).toBeGreaterThanOrEqual(range.min);
        expect(alpha).toBeLessThanOrEqual(range.max);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 1.1, 1.2**
   *
   * 对于任意主题（dark 或 light），elevated 变体的 alpha 值
   * 应始终大于等于 default 变体的 alpha 值
   */
  test('任意主题下，elevated 变体的 alpha 值应 >= default 变体', () => {
    fc.assert(
      fc.property(themeModeArb, (theme) => {
        const defaultAlpha = getAlphaForVariantAndTheme('default', theme);
        const elevatedAlpha = getAlphaForVariantAndTheme('elevated', theme);

        // elevated 的 alpha 应大于等于 default
        expect(elevatedAlpha).toBeGreaterThanOrEqual(defaultAlpha);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 1.6**
   *
   * 对于任意变体（default 或 elevated）和任意主题（dark 或 light），
   * CSS 自定义属性值应为 rgba() 格式（非 linear-gradient 等其他格式）
   */
  test('任意变体和主题组合下，CSS 变量值应为 rgba() 格式', () => {
    fc.assert(
      fc.property(variantArb, themeModeArb, (variant, theme) => {
        const scope = theme === 'dark' ? ':root' : '[data-theme="light"]';
        const varName =
          variant === 'default' ? '--app-glass-bg' : '--app-glass-elevated-bg';

        // 提取 rgba 值应成功（非 null 表示格式正确）
        const rgba = extractRgbaFromScope(cssContent, scope, varName);
        expect(rgba).not.toBeNull();

        // 额外验证 RGB 通道为有效值
        expect(rgba!.r).toBeGreaterThanOrEqual(0);
        expect(rgba!.r).toBeLessThanOrEqual(255);
        expect(rgba!.g).toBeGreaterThanOrEqual(0);
        expect(rgba!.g).toBeLessThanOrEqual(255);
        expect(rgba!.b).toBeGreaterThanOrEqual(0);
        expect(rgba!.b).toBeLessThanOrEqual(255);
      }),
      { numRuns: 100 },
    );
  });
});

// ── Property 2: 主题切换时玻璃背景属性自动适配 ─────────────────────

/**
 * 深色/浅色主题下 --app-glass-bg 和 --app-glass-elevated-bg 的期望 rgba() 值映射
 * 深色模式: rgba(255, 255, 255, 0.04) / rgba(255, 255, 255, 0.08)
 * 浅色模式: rgba(255, 255, 255, 0.70) / rgba(255, 255, 255, 0.80)
 */
const expectedThemeValues: Record<
  ThemeMode,
  { glassBg: { r: number; g: number; b: number; a: number }; glassElevatedBg: { r: number; g: number; b: number; a: number } }
> = {
  dark: {
    glassBg: { r: 255, g: 255, b: 255, a: 0.04 },
    glassElevatedBg: { r: 255, g: 255, b: 255, a: 0.08 },
  },
  light: {
    glassBg: { r: 255, g: 255, b: 255, a: 0.70 },
    glassElevatedBg: { r: 255, g: 255, b: 255, a: 0.80 },
  },
};

/** 玻璃背景 CSS 变量名生成器 */
type GlassVarName = '--app-glass-bg' | '--app-glass-elevated-bg';
const glassVarNameArb: fc.Arbitrary<GlassVarName> = fc.constantFrom(
  '--app-glass-bg',
  '--app-glass-elevated-bg',
);

/**
 * 根据主题和变量名获取期望的 rgba 值
 */
function getExpectedRgba(
  theme: ThemeMode,
  varName: GlassVarName,
): { r: number; g: number; b: number; a: number } {
  if (varName === '--app-glass-bg') {
    return expectedThemeValues[theme].glassBg;
  }
  return expectedThemeValues[theme].glassElevatedBg;
}

// Feature: app-production-optimization, Property 2: 主题切换时玻璃背景属性自动适配
describe('Property 2: 主题切换时玻璃背景属性自动适配', () => {
  /**
   * **Validates: Requirements 1.5**
   *
   * 对于任意主题（dark 或 light）和任意玻璃背景变量（--app-glass-bg 或 --app-glass-elevated-bg），
   * 该变量在对应主题作用域下应解析为正确的 rgba() 值。
   * 深色模式使用 rgba(255,255,255,alpha) 且 alpha 较低（0.04 / 0.08），
   * 浅色模式使用 rgba(255,255,255,alpha) 且 alpha 较高（0.70 / 0.80）。
   */
  test('任意主题和玻璃变量组合下，应解析为对应主题的正确 rgba() 值', () => {
    fc.assert(
      fc.property(themeModeArb, glassVarNameArb, (theme, varName) => {
        const scope = theme === 'dark' ? ':root' : '[data-theme="light"]';
        const actual = extractRgbaFromScope(cssContent, scope, varName);
        const expected = getExpectedRgba(theme, varName);

        // 变量应成功解析为 rgba() 格式
        expect(actual).not.toBeNull();

        // RGB 通道应为 255（白色基底）
        expect(actual!.r).toBe(expected.r);
        expect(actual!.g).toBe(expected.g);
        expect(actual!.b).toBe(expected.b);

        // alpha 通道应与期望值精确匹配
        expect(actual!.a).toBeCloseTo(expected.a, 2);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 1.5**
   *
   * 对于任意玻璃背景变量（--app-glass-bg 或 --app-glass-elevated-bg），
   * 深色模式下的 alpha 值应严格小于浅色模式下的 alpha 值，
   * 确保主题切换时透明度自动适配。
   */
  test('任意玻璃变量下，深色模式 alpha 应严格小于浅色模式 alpha', () => {
    fc.assert(
      fc.property(glassVarNameArb, (varName) => {
        const scope_dark = ':root';
        const scope_light = '[data-theme="light"]';

        const darkRgba = extractRgbaFromScope(cssContent, scope_dark, varName);
        const lightRgba = extractRgbaFromScope(cssContent, scope_light, varName);

        // 两个主题下都应成功解析
        expect(darkRgba).not.toBeNull();
        expect(lightRgba).not.toBeNull();

        // 深色模式 alpha 应严格小于浅色模式 alpha（深色更透明）
        expect(darkRgba!.a).toBeLessThan(lightRgba!.a);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 1.5**
   *
   * 对于任意主题（dark 或 light），--app-glass-bg 和 --app-glass-elevated-bg
   * 都应使用相同的 RGB 基色（255, 255, 255），仅通过 alpha 通道区分层级。
   */
  test('任意主题下，两个玻璃变量应使用相同的 RGB 基色', () => {
    fc.assert(
      fc.property(themeModeArb, (theme) => {
        const scope = theme === 'dark' ? ':root' : '[data-theme="light"]';

        const glassBg = extractRgbaFromScope(cssContent, scope, '--app-glass-bg');
        const glassElevatedBg = extractRgbaFromScope(cssContent, scope, '--app-glass-elevated-bg');

        // 两个变量都应成功解析
        expect(glassBg).not.toBeNull();
        expect(glassElevatedBg).not.toBeNull();

        // RGB 基色应一致（均为白色 255, 255, 255）
        expect(glassBg!.r).toBe(glassElevatedBg!.r);
        expect(glassBg!.g).toBe(glassElevatedBg!.g);
        expect(glassBg!.b).toBe(glassElevatedBg!.b);

        // 且均为白色基底
        expect(glassBg!.r).toBe(255);
        expect(glassBg!.g).toBe(255);
        expect(glassBg!.b).toBe(255);
      }),
      { numRuns: 100 },
    );
  });
});
