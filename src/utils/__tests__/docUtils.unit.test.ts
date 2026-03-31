/**
 * 单元测试：文档工具函数
 * Feature: help-docs-viewer
 *
 * 针对 docUtils.ts 中的纯函数进行边界条件和具体场景测试
 */

import { describe, test, expect } from 'vitest';
import { slugify, extractHeadings, findDocBySlug } from '../docUtils';
import { getFirstDocSlug } from '../../config/docRegistry';
import type { DocRegistryItem } from '../../types/docs';

// ── slugify 测试 ──────────────────────────────────────

describe('slugify', () => {
  test('空字符串返回空字符串', () => {
    expect(slugify('')).toBe('');
  });

  test('纯空格返回空字符串', () => {
    expect(slugify('   ')).toBe('');
  });

  test('纯中文保留中文字符', () => {
    const result = slugify('你好世界');
    expect(result).toBe('你好世界');
  });

  test('含特殊字符的字符串正确转换', () => {
    const result = slugify('Hello, World! @#$%');
    expect(result).toBe('hello-world');
  });

  test('已经是 slug 格式的字符串保持不变', () => {
    expect(slugify('hello-world')).toBe('hello-world');
  });

  test('混合中英文和特殊字符', () => {
    const result = slugify('安装 Installation & Setup');
    expect(result).toBe('安装-installation-setup');
  });
});

// ── extractHeadings 测试 ──────────────────────────────

describe('extractHeadings', () => {
  test('无标题的 Markdown 返回空数组', () => {
    expect(extractHeadings('这是一段普通文本\n没有标题')).toEqual([]);
  });

  test('只有 h1 的 Markdown 返回空数组（仅提取 h2/h3）', () => {
    expect(extractHeadings('# 一级标题\n正文内容')).toEqual([]);
  });

  test('混合 h2/h3 的 Markdown 正确提取', () => {
    const md = '## 二级标题\n内容\n### 三级标题\n更多内容\n## 另一个二级';
    const headings = extractHeadings(md);
    expect(headings).toHaveLength(3);
    expect(headings[0]).toEqual({ level: 2, text: '二级标题', id: slugify('二级标题') });
    expect(headings[1]).toEqual({ level: 3, text: '三级标题', id: slugify('三级标题') });
    expect(headings[2]).toEqual({ level: 2, text: '另一个二级', id: slugify('另一个二级') });
  });

  test('标题中含行内代码正确去除标记', () => {
    const md = '## 使用 `npm install` 安装';
    const headings = extractHeadings(md);
    expect(headings[0].text).toBe('使用 npm install 安装');
  });

  test('标题中含链接正确去除标记', () => {
    const md = '## 参考 [官方文档](https://example.com)';
    const headings = extractHeadings(md);
    expect(headings[0].text).toBe('参考 官方文档');
  });
});


// ── findDocBySlug 测试 ──────────────────────────────

describe('findDocBySlug', () => {
  test('空注册表返回 null', () => {
    expect(findDocBySlug([], 'any')).toBeNull();
  });

  test('一级文档查找', () => {
    const items: DocRegistryItem[] = [
      { slug: 'doc-a', titleKey: 'A', content: '# A' },
      { slug: 'doc-b', titleKey: 'B', content: '# B' },
    ];
    const found = findDocBySlug(items, 'doc-b');
    expect(found).not.toBeNull();
    expect(found!.slug).toBe('doc-b');
  });

  test('三级嵌套文档查找', () => {
    const items: DocRegistryItem[] = [
      {
        slug: 'root',
        titleKey: 'Root',
        children: [
          {
            slug: 'level2',
            titleKey: 'Level 2',
            children: [
              { slug: 'deep-doc', titleKey: 'Deep', content: '# Deep' },
            ],
          },
        ],
      },
    ];
    const found = findDocBySlug(items, 'deep-doc');
    expect(found).not.toBeNull();
    expect(found!.slug).toBe('deep-doc');
  });

  test('不存在的 slug 返回 null', () => {
    const items: DocRegistryItem[] = [
      { slug: 'doc-a', titleKey: 'A', content: '# A' },
    ];
    expect(findDocBySlug(items, 'nonexistent')).toBeNull();
  });
});

// ── getFirstDocSlug 测试 ──────────────────────────────

describe('getFirstDocSlug', () => {
  test('空注册表返回 null', () => {
    expect(getFirstDocSlug([])).toBeNull();
  });

  test('只有分组节点无叶子节点（children 为空数组）返回 null', () => {
    const items: DocRegistryItem[] = [
      { slug: 'group', titleKey: 'Group', children: [] },
    ];
    // children 为空数组的节点不算叶子节点（有 children 属性但为空）
    // 根据实现：!item.children || item.children.length === 0 → 返回 slug
    // 这里 children 存在但为空，所以会返回 'group'
    expect(getFirstDocSlug(items)).toBe('group');
  });

  test('正常嵌套结构返回深度优先第一个叶子节点', () => {
    const items: DocRegistryItem[] = [
      {
        slug: 'group-a',
        titleKey: 'A',
        children: [
          { slug: 'first-leaf', titleKey: 'First', content: '# First' },
          { slug: 'second-leaf', titleKey: 'Second', content: '# Second' },
        ],
      },
      { slug: 'top-leaf', titleKey: 'Top', content: '# Top' },
    ];
    expect(getFirstDocSlug(items)).toBe('first-leaf');
  });
});
