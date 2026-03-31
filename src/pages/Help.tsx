/**
 * DocsViewer - 帮助文档浏览器主页面
 * 三栏布局：左侧 DocSidebar（240px）、中间 DocContent（自适应）、右侧 TocNav（200px）
 * 管理全局状态并协调三个子组件的状态传递
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useI18n } from '../i18n/I18nContext';
import { getDocRegistry, getDocContent, getFirstDocSlug } from '../config/docRegistry';
import DocSidebar from '../components/docs/DocSidebar';
import DocContent from '../components/docs/DocContent';
import TocNav from '../components/docs/TocNav';
import type { HeadingItem } from '../types/docs';

const Help: React.FC = () => {
  const { language } = useI18n();
  const lang = language === 'en' ? 'en' : 'zh';

  // 获取文档注册表
  const registry = getDocRegistry(lang);
  const firstSlug = getFirstDocSlug(registry);

  // 页面状态
  const [activeDocSlug, setActiveDocSlug] = useState<string>(firstSlug || '');
  const [markdownContent, setMarkdownContent] = useState<string>('');
  const [headings, setHeadings] = useState<HeadingItem[]>([]);
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 滚动容器 ref，供 DocContent 和 TocNav 共享
  const scrollRef = useRef<HTMLDivElement>(null);

  // 加载文档内容
  useEffect(() => {
    if (!activeDocSlug) return;

    const content = getDocContent(activeDocSlug, lang);
    if (content) {
      setMarkdownContent(content);
      setError(null);
    } else {
      // 无效 slug，回退到第一个文档
      if (firstSlug && activeDocSlug !== firstSlug) {
        setActiveDocSlug(firstSlug);
      } else {
        setMarkdownContent('');
        setError(null);
      }
    }
  }, [activeDocSlug, lang, firstSlug]);

  // 文档切换时重置滚动位置
  const handleDocSelect = useCallback((slug: string) => {
    setActiveDocSlug(slug);
    setActiveHeadingId(null);
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, []);

  // 标题提取回调
  const handleHeadingsExtracted = useCallback((newHeadings: HeadingItem[]) => {
    setHeadings(newHeadings);
  }, []);

  // 注册表为空时显示提示
  if (registry.length === 0) {
    return (
      <div
        className="h-full flex items-center justify-center"
        style={{ color: 'var(--app-text-muted)' }}
      >
        <p>暂无文档</p>
      </div>
    );
  }

  return (
    <div className="h-full flex" style={{ backgroundColor: 'var(--app-bg)', color: 'var(--app-text)' }}>
      {/* 左侧：文档目录树 */}
      <DocSidebar
        items={registry}
        activeSlug={activeDocSlug}
        onSelect={handleDocSelect}
      />

      {/* 中间：Markdown 内容渲染 */}
      <DocContent
        content={markdownContent}
        onHeadingsExtracted={handleHeadingsExtracted}
        scrollRef={scrollRef}
        error={error}
      />

      {/* 右侧：页内锚点导航 */}
      <TocNav
        headings={headings}
        activeId={activeHeadingId}
        scrollRef={scrollRef}
      />
    </div>
  );
};

export default Help;
