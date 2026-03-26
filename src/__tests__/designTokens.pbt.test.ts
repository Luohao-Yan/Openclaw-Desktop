/**
 * designTokens.pbt.test.ts
 *
 * Design Token 完整性与主题对称性 - 属性测试
 * 使用 fast-check 验证 --space-*、--radius-*、--shadow-*、--transition-*
 * 在 :root 和 [data-theme="light"] 中变量名称集合完全一致
 *
 * Feature: app-production-optimization, Property 8: Design Token 完整性与主题对称性
 */

import { describe, test, expect, beforeAll } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs';
import * as path from 'path';

// ── 辅助函数 ──────────────────────────────────────────────────────

/**
 * 从 CSS 文件内容中提取指定作用域下所有匹配前缀的 CSS 自定义属性名称
 * @param css - CSS 文件完整内容
 * @param scope - 作用域选择器，如 ':root' 或 '[data-theme="light"]'
 * @param prefix - CSS 自定义属性前缀，如 '--space-'
 * @returns 匹配的变量名称集合
 */
function extractVarNamesFromScope(
  css: string,
  scope: string,
  prefix: string,
): Set<string> {
  // 转义 scope 中的特殊正则字符（如方括号、引号等）
  const escapedScope = scope.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // 匹配指定作用域的整个块内容
  const scopeRegex = new RegExp(`${escapedScope}\\s*\\{([^}]*(?:\\{[^}]*\\}[^}]*)*)\\}`, 'g');
  const varNames = new Set<string>();
  let scopeMatch: RegExpExecArray | null;

  // 转义前缀中的特殊正则字符
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // 匹配以指定前缀开头的 CSS 自定义属性声明
  const varRegex = new RegExp(`(${escapedPrefix}[a-zA-Z0-9_-]+)\\s*:`, 'g');

  while ((scopeMatch = scopeRegex.exec(css)) !== null) {
    const blockContent = scopeMatch[1];
    let varMatch: RegExpExecArray | null;

    while ((varMatch = varRegex.exec(blockContent)) !== null) {
      varNames.add(varMatch[1]);
    }
  }

  return varNames;
}

// ── 测试数据准备 ──────────────────────────────────────────────────

/** CSS 文件内容（测试开始前读取一次） */
let cssContent: string;

/** 各 token 类别在 :root 中的变量名称集合 */
let rootTokens: Record<string, Set<string>>;

/** 各 token 类别在 [data-theme="light"] 中的变量名称集合 */
let lightTokens: Record<string, Set<string>>;

/** Design Token 类别及其对应的 CSS 变量前缀 */
const TOKEN_CATEGORIES: Record<string, string> = {
  space: '--space-',
  radius: '--radius-',
  shadow: '--shadow-',
  transition: '--transition-',
};

/** Token 类别名称列表 */
const CATEGORY_NAMES = Object.keys(TOKEN_CATEGORIES);

beforeAll(() => {
  // 读取 src/index.css 文件
  const cssPath = path.resolve(__dirname, '..', 'index.css');
  cssContent = fs.readFileSync(cssPath, 'utf-8');

  // 解析 :root 和 [data-theme="light"] 中各类别的 token 名称
  rootTokens = {};
  lightTokens = {};

  for (const [category, prefix] of Object.entries(TOKEN_CATEGORIES)) {
    rootTokens[category] = extractVarNamesFromScope(cssContent, ':root', prefix);
    lightTokens[category] = extractVarNamesFromScope(cssContent, '[data-theme="light"]', prefix);
  }
});

// ── 生成器（Arbitraries）──────────────────────────────────────────

/** Token 类别生成器：随机选择 space / radius / shadow / transition */
const categoryArb: fc.Arbitrary<string> = fc.constantFrom(...CATEGORY_NAMES);

// ── Property 8: Design Token 完整性与主题对称性 ───────────────────

// Feature: app-production-optimization, Property 8: Design Token 完整性与主题对称性
describe('Property 8: Design Token 完整性与主题对称性', () => {
  /**
   * **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.10**
   *
   * 对于任意 Design Token 类别（space / radius / shadow / transition），
   * 该类别在 :root 中定义的变量名称集合应与 [data-theme="light"] 中的完全一致。
   * 这确保了主题切换时所有 token 都有对应定义，不会出现遗漏。
   */
  test('任意 token 类别下，:root 和 [data-theme="light"] 中的变量名称集合应完全一致', () => {
    fc.assert(
      fc.property(categoryArb, (category) => {
        const rootSet = rootTokens[category];
        const lightSet = lightTokens[category];

        // 两个作用域中该类别的 token 数量应相同
        expect(rootSet.size).toBe(lightSet.size);

        // :root 中的每个 token 都应在 [data-theme="light"] 中存在
        for (const varName of rootSet) {
          expect(lightSet.has(varName)).toBe(true);
        }

        // [data-theme="light"] 中的每个 token 都应在 :root 中存在
        for (const varName of lightSet) {
          expect(rootSet.has(varName)).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 4.1, 4.2, 4.3, 4.4**
   *
   * 对于任意 Design Token 类别，该类别在 :root 中应至少定义一个 token，
   * 确保 token 体系不为空。
   */
  test('任意 token 类别下，:root 中应至少定义一个 token', () => {
    fc.assert(
      fc.property(categoryArb, (category) => {
        const rootSet = rootTokens[category];

        // 每个类别至少应有一个 token 定义
        expect(rootSet.size).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 4.10**
   *
   * 对于任意 Design Token 类别，该类别在 [data-theme="light"] 中应至少定义一个 token，
   * 确保浅色模式下 token 体系不为空。
   */
  test('任意 token 类别下，[data-theme="light"] 中应至少定义一个 token', () => {
    fc.assert(
      fc.property(categoryArb, (category) => {
        const lightSet = lightTokens[category];

        // 每个类别至少应有一个 token 定义
        expect(lightSet.size).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });
});
