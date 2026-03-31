/**
 * TocNav - 页内锚点导航组件（On This Page）
 * 位于页面右侧，展示当前文档的 h2/h3 标题层级
 * 使用 IntersectionObserver 监听标题可见性，高亮当前可视区域对应的标题项
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useI18n } from '../../i18n/I18nContext';
import type { HeadingItem } from '../../types/docs';

interface TocNavProps {
  /** 从 DocContent 提取的标题列表 */
  headings: HeadingItem[];
  /** 当前高亮的标题 ID */
  activeId: string | null;
  /** 内容区域滚动容器 ref，用于平滑滚动 */
  scrollRef: React.RefObject<HTMLDivElement | null>;
}

const TocNav: React.FC<TocNavProps> = ({ headings, activeId: externalActiveId, scrollRef }) => {
  const { t } = useI18n();
  const [activeId, setActiveId] = useState<string | null>(externalActiveId);

  // 同步外部 activeId
  useEffect(() => {
    setActiveId(externalActiveId);
  }, [externalActiveId]);

  // IntersectionObserver 监听标题元素可见性
  useEffect(() => {
    if (!scrollRef.current || headings.length === 0) return;

    const container = scrollRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        }
      },
      {
        root: container,
        rootMargin: '0px 0px -80% 0px',
        threshold: 0,
      },
    );

    // 观察所有标题元素
    for (const heading of headings) {
      const el = container.querySelector(`#${CSS.escape(heading.id)}`);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [headings, scrollRef]);

  /** 点击标题链接，平滑滚动到对应位置 */
  const handleClick = useCallback(
    (id: string) => {
      if (!scrollRef.current) return;
      const el = scrollRef.current.querySelector(`#${CSS.escape(id)}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
        setActiveId(id);
      }
    },
    [scrollRef],
  );

  // 无标题时显示空状态
  if (headings.length === 0) {
    return null;
  }

  return (
    <div
      className="w-[200px] flex-shrink-0 overflow-y-auto py-4 px-3 hidden xl:block"
      style={{ borderColor: 'var(--app-border)' }}
    >
      {/* 标题 */}
      <div
        className="text-xs font-semibold uppercase tracking-wider mb-3 px-2"
        style={{ color: 'var(--app-text-muted)' }}
      >
        {t('docs.onThisPage' as any)}
      </div>

      {/* 导航列表 */}
      <nav>
        <ul className="space-y-0.5">
          {headings.map((heading) => {
            const isActive = activeId === heading.id;
            return (
              <li key={heading.id}>
                <button
                  onClick={() => handleClick(heading.id)}
                  className={`
                    w-full text-left text-xs py-1 px-2 rounded transition-colors cursor-pointer
                    truncate block
                  `}
                  style={{
                    paddingLeft: heading.level === 3 ? '20px' : '8px',
                    color: isActive ? 'var(--app-active-text)' : 'var(--app-text-muted)',
                    backgroundColor: isActive ? 'var(--app-active-bg)' : 'transparent',
                  }}
                  title={heading.text}
                >
                  {heading.text}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
};

export default TocNav;
