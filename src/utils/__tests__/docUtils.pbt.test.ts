/**
 * 属性测试：文档工具函数
 * Feature: help-docs-viewer
 *
 * 使用 fast-check 对 docUtils.ts 中的纯函数进行属性测试，
 * 验证 slugify 幂等性、标题提取完整性、文档查找正确性和首文档选取正确性。
 */

import { describe, test, expect } from 'vitest';
import fc from 'fast-check';
import { slugify, extractHeadings, findDocBySlug } from '../docUtils';
import { getFirstDocSlug } from '../../config/docRegistry';
import type { DocRegistryItem } from '../../types/docs';

// ── 生成器 ──────────────────────────────────────────

/** 生成包含中文、特殊字符、空格的非空字符串 */
const nonEmptyTextArb = (): fc.Arbitrary<string> =>
  fc.array(
    fc.oneof(
      fc.integer({ min: 0x20, max: 0x7e }).map((c) => String.fromCharCode(c)),
      fc.constant(' '),
      fc.constant('-'),
      fc.constant('你'),
      fc.constant('好'),
      fc.constant('世'),
      fc.constant('界'),
    ),
    { minLength: 1, maxLength: 50 },
  ).map((chars) => chars.join(''));

/** 生成随机 Markdown 文本，包含随机数量的 h2/h3 标题 */
const markdownWithHeadingsArb = (): fc.Arbitrary<{ markdown: string; expectedCount: number }> =>
  fc.array(
    fc.oneof(
      // 普通段落
      fc.string({ minLength: 1, maxLength: 30 }).map((s) => ({ line: s.replace(/\n/g, ' '), isHeading: false })),
      // h1 标题（不应被提取）
      fc.string({ minLength: 1, maxLength: 20 }).map((s) => ({
        line: `# ${s.replace(/\n/g, ' ').replace(/^#+/, '')}`,
        isHeading: false,
      })),
      // h2 标题
      fc.string({ minLength: 1, maxLength: 20 }).map((s) => {
        const clean = s.replace(/\n/g, ' ').replace(/^#+/, '').trim();
        return { line: `## ${clean || 'heading'}`, isHeading: true };
      }),
      // h3 标题
      fc.string({ minLength: 1, maxLength: 20 }).map((s) => {
        const clean = s.replace(/\n/g, ' ').replace(/^#+/, '').trim();
        return { line: `### ${clean || 'heading'}`, isHeading: true };
      }),
    ),
    { minLength: 1, maxLength: 20 },
  ).map((items) => ({
    markdown: items.map((i) => i.line).join('\n'),
    expectedCount: items.filter((i) => i.isHeading).length,
  }));


/** 生成随机最多三级嵌套的注册表树 */
const registryTreeArb = (): fc.Arbitrary<DocRegistryItem[]> => {
  const leafArb: fc.Arbitrary<DocRegistryItem> = fc
    .string({ minLength: 1, maxLength: 10 })
    .filter((s) => /[a-z0-9]/.test(s))
    .map((s) => ({
      slug: `leaf-${s.replace(/[^a-z0-9]/g, '')}`,
      titleKey: `title-${s}`,
      content: `# ${s}`,
    }));

  const level2Arb: fc.Arbitrary<DocRegistryItem> = fc
    .tuple(
      fc.string({ minLength: 1, maxLength: 10 }).filter((s) => /[a-z0-9]/.test(s)),
      fc.array(leafArb, { minLength: 1, maxLength: 3 }),
    )
    .map(([s, children]) => ({
      slug: `l2-${s.replace(/[^a-z0-9]/g, '')}`,
      titleKey: `group-${s}`,
      children,
    }));

  const level1Arb: fc.Arbitrary<DocRegistryItem> = fc.oneof(
    leafArb,
    level2Arb,
    fc
      .tuple(
        fc.string({ minLength: 1, maxLength: 10 }).filter((s) => /[a-z0-9]/.test(s)),
        fc.array(fc.oneof(leafArb, level2Arb), { minLength: 1, maxLength: 3 }),
      )
      .map(([s, children]) => ({
        slug: `l1-${s.replace(/[^a-z0-9]/g, '')}`,
        titleKey: `root-${s}`,
        children,
      })),
  );

  return fc.array(level1Arb, { minLength: 1, maxLength: 5 });
};

/** 收集树中所有叶子节点 slug */
function collectLeafSlugs(items: DocRegistryItem[]): string[] {
  const slugs: string[] = [];
  for (const item of items) {
    if (!item.children || item.children.length === 0) {
      slugs.push(item.slug);
    } else {
      slugs.push(...collectLeafSlugs(item.children));
    }
  }
  return slugs;
}

/** 获取深度优先第一个叶子节点 slug */
function dfsFirstLeaf(items: DocRegistryItem[]): string | null {
  for (const item of items) {
    if (!item.children || item.children.length === 0) return item.slug;
    const child = dfsFirstLeaf(item.children);
    if (child) return child;
  }
  return null;
}

// ── 属性测试 ──────────────────────────────────────────

describe('Feature: help-docs-viewer, Property 1: slugify 幂等性', () => {
  test('slugify 应用两次结果与一次相同，且输出仅含小写字母、数字和连字符', () => {
    fc.assert(
      fc.property(nonEmptyTextArb(), (text) => {
        const once = slugify(text);
        const twice = slugify(once);
        // 幂等性
        expect(twice).toBe(once);
        // 输出格式：仅含小写字母、数字、连字符（或空字符串）
        expect(once).toMatch(/^[a-z0-9\u4e00-\u9fff]([a-z0-9\u4e00-\u9fff-]*[a-z0-9\u4e00-\u9fff])?$|^$/);
      }),
      { numRuns: 200 },
    );
  });
});

describe('Feature: help-docs-viewer, Property 2: 标题提取完整性', () => {
  test('extractHeadings 返回的标题满足 level/text/id 约束，数量与 Markdown 中 ##/### 行数一致', () => {
    fc.assert(
      fc.property(markdownWithHeadingsArb(), ({ markdown, expectedCount }) => {
        const headings = extractHeadings(markdown);
        // 数量一致
        expect(headings.length).toBe(expectedCount);
        for (const h of headings) {
          // level 为 2 或 3
          expect([2, 3]).toContain(h.level);
          // text 非空
          expect(h.text.length).toBeGreaterThan(0);
          // id 等于 slugify(text)
          expect(h.id).toBe(slugify(h.text));
        }
      }),
      { numRuns: 200 },
    );
  });
});

describe('Feature: help-docs-viewer, Property 3: 文档查找正确性', () => {
  test('树中存在的叶子节点 slug 能被找到，不存在的 slug 返回 null', () => {
    fc.assert(
      fc.property(registryTreeArb(), (tree) => {
        const leafSlugs = collectLeafSlugs(tree);
        // 每个叶子节点都能被找到
        for (const slug of leafSlugs) {
          const found = findDocBySlug(tree, slug);
          expect(found).not.toBeNull();
          expect(found!.slug).toBe(slug);
        }
        // 不存在的 slug 返回 null
        expect(findDocBySlug(tree, '__nonexistent__')).toBeNull();
      }),
      { numRuns: 200 },
    );
  });
});

describe('Feature: help-docs-viewer, Property 4: 首文档选取正确性', () => {
  test('非空注册表返回深度优先第一个叶子节点 slug，空注册表返回 null', () => {
    fc.assert(
      fc.property(registryTreeArb(), (tree) => {
        const result = getFirstDocSlug(tree);
        const expected = dfsFirstLeaf(tree);
        expect(result).toBe(expected);
      }),
      { numRuns: 200 },
    );
    // 空注册表
    expect(getFirstDocSlug([])).toBeNull();
  });
});


// ── Property 5: 多语言注册表一致性 ──────────────────────

import { getDocRegistry } from '../../config/docRegistry';

/** 收集注册表中所有叶子节点 slug */
function collectRegistryLeafSlugs(items: DocRegistryItem[]): Set<string> {
  const slugs = new Set<string>();
  for (const item of items) {
    if (!item.children || item.children.length === 0) {
      slugs.add(item.slug);
    } else {
      for (const s of collectRegistryLeafSlugs(item.children)) {
        slugs.add(s);
      }
    }
  }
  return slugs;
}

describe('Feature: help-docs-viewer, Property 5: 多语言注册表一致性', () => {
  test('中英文注册表的叶子节点 slug 集合完全一致', () => {
    const zhSlugs = collectRegistryLeafSlugs(getDocRegistry('zh'));
    const enSlugs = collectRegistryLeafSlugs(getDocRegistry('en'));
    expect(zhSlugs).toEqual(enSlugs);
  });
});
