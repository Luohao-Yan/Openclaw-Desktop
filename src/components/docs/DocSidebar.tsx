/**
 * DocSidebar - 文档目录树导航组件
 * 位于页面左侧，展示文档的层级目录结构
 * 支持最多三级嵌套、折叠/展开、高亮选中项
 * 选中样式对齐主 Sidebar 的渐变高亮风格
 */

import React, { useState } from 'react';
import { ChevronRight, ChevronDown, FileText } from 'lucide-react';
import type { DocRegistryItem } from '../../types/docs';

interface DocSidebarProps {
  /** 文档注册表树形数据 */
  items: DocRegistryItem[];
  /** 当前选中的文档 slug */
  activeSlug: string;
  /** 文档选中回调 */
  onSelect: (slug: string) => void;
}

/** 递归渲染目录树节点 */
function SidebarNode({
  item,
  activeSlug,
  onSelect,
  depth,
  defaultExpanded,
}: {
  item: DocRegistryItem;
  activeSlug: string;
  onSelect: (slug: string) => void;
  depth: number;
  defaultExpanded: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [hovered, setHovered] = useState(false);
  const hasChildren = item.children && item.children.length > 0;
  const isLeaf = !hasChildren;
  const isActive = isLeaf && item.slug === activeSlug;

  const handleClick = () => {
    if (hasChildren) {
      setExpanded(!expanded);
    }
    if (isLeaf) {
      onSelect(item.slug);
    }
  };

  // 选中态：渐变背景 + 边框 + 左侧高亮条，对齐主 Sidebar
  // 悬停态：半透明背景
  const nodeStyle: React.CSSProperties = {
    paddingLeft: `${12 + depth * 16}px`,
    ...(isActive
      ? {
          background: 'var(--app-active-bg)',
          borderColor: 'var(--app-active-border)',
          color: 'var(--app-active-text)',
        }
      : {
          background: hovered ? 'var(--app-hover)' : 'transparent',
          borderColor: 'transparent',
          color: hasChildren ? 'var(--app-text)' : 'var(--app-text-muted)',
        }),
  };

  return (
    <div>
      <button
        onClick={handleClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="w-full relative flex items-center gap-2.5 px-3 py-2 rounded-xl border text-sm transition-all duration-200 text-left cursor-pointer"
        style={nodeStyle}
      >
        {/* 图标 */}
        {hasChildren ? (
          <span className="flex-shrink-0 transition-transform duration-200">
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
        ) : (
          <FileText
            size={14}
            className="flex-shrink-0"
            style={{ color: isActive ? '#00B4FF' : undefined }}
          />
        )}

        {/* 文本 */}
        <span className={`truncate ${hasChildren ? 'font-medium' : ''} ${isActive ? 'font-medium' : ''}`}>
          {item.titleKey}
        </span>
      </button>

      {/* 子节点 */}
      {hasChildren && expanded && (
        <div className="mt-0.5">
          {item.children!.map((child) => (
            <SidebarNode
              key={child.slug}
              item={child}
              activeSlug={activeSlug}
              onSelect={onSelect}
              depth={depth + 1}
              defaultExpanded={false}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const DocSidebar: React.FC<DocSidebarProps> = ({ items, activeSlug, onSelect }) => {
  return (
    <div
      className="w-60 flex-shrink-0 overflow-y-auto py-3 px-2"
      style={{
        backgroundColor: 'var(--app-bg-elevated)',
      }}
    >
      <div className="space-y-0.5">
        {items.map((item) => (
          <SidebarNode
            key={item.slug}
            item={item}
            activeSlug={activeSlug}
            onSelect={onSelect}
            depth={0}
            defaultExpanded={true}
          />
        ))}
      </div>
    </div>
  );
};

export default DocSidebar;
