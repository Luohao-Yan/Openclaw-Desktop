/**
 * 文档注册表模块
 * 集中管理所有帮助文档的元数据和内容
 * 通过 Vite ?raw 静态导入 Markdown 文件，构建时打包进应用
 */

import type { DocRegistryItem } from '../types/docs';

// 中文文档导入
import userGuideZh from '../help-docs/getting-started/user-guide.md?raw';
import featureListZh from '../help-docs/features/feature-list.md?raw';

// 英文文档导入
import userGuideEn from '../help-docs/getting-started/user-guide.en.md?raw';
import featureListEn from '../help-docs/features/feature-list.en.md?raw';

/** 中文文档内容映射 */
const zhContentMap: Record<string, string> = {
  'user-guide': userGuideZh,
  'feature-list': featureListZh,
};

/** 英文文档内容映射 */
const enContentMap: Record<string, string> = {
  'user-guide': userGuideEn,
  'feature-list': featureListEn,
};

/**
 * 获取文档注册表（根据语言）
 * 返回指定语言的文档注册表树
 */
export function getDocRegistry(lang: 'zh' | 'en'): DocRegistryItem[] {
  const contentMap = lang === 'zh' ? zhContentMap : enContentMap;

  return [
    {
      slug: 'getting-started',
      titleKey: lang === 'zh' ? '快速入门' : 'Getting Started',
      children: [
        {
          slug: 'user-guide',
          titleKey: lang === 'zh' ? '用户指南' : 'User Guide',
          content: contentMap['user-guide'],
        },
      ],
    },
    {
      slug: 'features',
      titleKey: lang === 'zh' ? '功能介绍' : 'Features',
      children: [
        {
          slug: 'feature-list',
          titleKey: lang === 'zh' ? '功能列表' : 'Feature List',
          content: contentMap['feature-list'],
        },
      ],
    },
  ];
}

/**
 * 根据 slug 和语言获取文档内容
 */
export function getDocContent(slug: string, lang: 'zh' | 'en'): string | null {
  const contentMap = lang === 'zh' ? zhContentMap : enContentMap;
  return contentMap[slug] ?? null;
}

/**
 * 获取注册表中深度优先遍历的第一个叶子节点 slug
 * 叶子节点：无 children 或 children 为空的节点
 */
export function getFirstDocSlug(items: DocRegistryItem[]): string | null {
  for (const item of items) {
    if (!item.children || item.children.length === 0) {
      return item.slug;
    }
    const childSlug = getFirstDocSlug(item.children);
    if (childSlug) return childSlug;
  }
  return null;
}
