/**
 * 文档相关纯工具函数
 * 提供 slug 生成、标题提取、文档查找等功能
 */

import type { DocRegistryItem, HeadingItem } from '../types/docs';

/**
 * 将标题文本转换为 URL 友好的 slug ID
 * 输出仅包含小写字母、数字和连字符
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-') // 非字母数字中文替换为连字符
    .replace(/^-+|-+$/g, '')                    // 去除首尾连字符
    .replace(/-{2,}/g, '-');                     // 合并连续连字符
}

/**
 * 从 Markdown 原始文本中提取 h2/h3 标题列表
 * 仅匹配行首的 ## 和 ### 标题
 */
export function extractHeadings(markdown: string): HeadingItem[] {
  const headings: HeadingItem[] = [];
  const lines = markdown.split('\n');

  for (const line of lines) {
    // 匹配 ## 或 ### 开头的行（不匹配 # 或 ####+）
    const match = line.match(/^(#{2,3})\s+(.+)$/);
    if (match) {
      const level = match[1].length as 2 | 3;
      // 去除行内 Markdown 格式（链接、行内代码等）
      const text = match[2]
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // 移除链接语法，保留文本
        .replace(/`([^`]*)`/g, '$1')              // 移除行内代码标记
        .trim();
      headings.push({
        level,
        text,
        id: slugify(text),
      });
    }
  }

  return headings;
}

/**
 * 在目录树中递归查找指定 slug 的文档节点
 * 支持最多三级嵌套
 */
export function findDocBySlug(
  items: DocRegistryItem[],
  slug: string,
): DocRegistryItem | null {
  for (const item of items) {
    if (item.slug === slug) return item;
    if (item.children) {
      const found = findDocBySlug(item.children, slug);
      if (found) return found;
    }
  }
  return null;
}
