/**
 * 组件相关单元测试
 * Feature: help-docs-viewer
 *
 * 验证 DocContent 和 TocNav 的关键逻辑行为
 * 注意：项目未配置 jsdom 环境，此处仅验证组件依赖的数据逻辑
 */

import { describe, test, expect } from 'vitest';
import { extractHeadings } from '../../../utils/docUtils';

describe('DocContent - 错误状态逻辑', () => {
  test('空内容时 extractHeadings 返回空数组（组件应显示错误提示）', () => {
    const headings = extractHeadings('');
    expect(headings).toEqual([]);
  });

  test('无效 Markdown 内容时 extractHeadings 返回空数组', () => {
    const headings = extractHeadings('这是一段没有标题的纯文本');
    expect(headings).toEqual([]);
  });
});

describe('TocNav - 空状态逻辑', () => {
  test('无标题时 headings 为空数组（组件不应渲染导航列表）', () => {
    const headings = extractHeadings('# 只有一级标题\n普通段落');
    // h1 不被提取，所以 headings 为空
    expect(headings).toHaveLength(0);
  });

  test('有 h2/h3 标题时 headings 非空（组件应渲染导航列表）', () => {
    const headings = extractHeadings('## 二级标题\n### 三级标题');
    expect(headings).toHaveLength(2);
    expect(headings[0].level).toBe(2);
    expect(headings[1].level).toBe(3);
  });
});
