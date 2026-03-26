/**
 * GroupFilterBar — 分组筛选栏组件
 *
 * 在 Agent 列表上方显示水平滚动的分组标签栏，支持：
 * - 「全部」和「未分组」筛选标签
 * - 各分组标签（显示 Agent 计数、Emoji/颜色指示器）
 * - 「新建分组」按钮
 * - 右键上下文菜单（编辑、批量导出、删除）
 * - CSS 自定义属性主题适配
 * - i18n 国际化
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Plus, Pencil, Download, Trash2 } from 'lucide-react';
import type { AgentGroup } from '../../types/electron';
import { useI18n } from '../../i18n/I18nContext';

interface GroupFilterBarProps {
  /** 所有分组列表 */
  groups: AgentGroup[];
  /** Agent-分组映射（agentId → groupId） */
  mappings: Record<string, string>;
  /** 当前选中的筛选项（null = 全部，'ungrouped' = 未分组，groupId = 指定分组） */
  activeFilter: string | null;
  /** 筛选项变更回调 */
  onFilterChange: (filter: string | null) => void;
  /** 新建分组回调 */
  onCreateGroup: () => void;
  /** 右键菜单操作回调 */
  onGroupAction: (groupId: string, action: 'edit' | 'export' | 'delete') => void;
}

/** 计算每个分组的 Agent 数量 */
function countAgentsInGroup(mappings: Record<string, string>, groupId: string): number {
  return Object.values(mappings).filter((gid) => gid === groupId).length;
}

const GroupFilterBar: React.FC<GroupFilterBarProps> = ({
  groups,
  mappings,
  activeFilter,
  onFilterChange,
  onCreateGroup,
  onGroupAction,
}) => {
  const { t } = useI18n();

  // 右键菜单状态
  const [contextMenu, setContextMenu] = useState<{
    groupId: string;
    x: number;
    y: number;
  } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // 注：实际筛选逻辑和未分组计数由父组件处理

  /** 处理右键菜单 */
  const handleContextMenu = useCallback(
    (e: React.MouseEvent, groupId: string) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ groupId, x: e.clientX, y: e.clientY });
    },
    [],
  );

  /** 处理菜单项点击 */
  const handleMenuAction = useCallback(
    (action: 'edit' | 'export' | 'delete') => {
      if (contextMenu) {
        onGroupAction(contextMenu.groupId, action);
      }
      setContextMenu(null);
    },
    [contextMenu, onGroupAction],
  );

  /** 点击外部关闭菜单 */
  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    window.addEventListener('mousedown', handleClick);
    return () => window.removeEventListener('mousedown', handleClick);
  }, [contextMenu]);

  /** 通用标签样式 */
  const tabBaseStyle: React.CSSProperties = {
    border: '1px solid var(--app-border)',
    color: 'var(--app-text-muted)',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    transition: 'all 200ms',
    whiteSpace: 'nowrap',
  };

  /** 激活标签样式 */
  const tabActiveStyle: React.CSSProperties = {
    border: '1px solid var(--app-active-border, var(--app-border))',
    color: 'var(--app-text)',
    backgroundColor: 'var(--app-bg-subtle)',
  };

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'thin' }}>
      {/* 「全部」标签 */}
      <button
        type="button"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium flex-shrink-0"
        style={activeFilter === null ? { ...tabBaseStyle, ...tabActiveStyle } : tabBaseStyle}
        onClick={() => onFilterChange(null)}
      >
        {t('agentGroups.all' as any)}
      </button>

      {/* 「未分组」标签 */}
      <button
        type="button"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium flex-shrink-0"
        style={activeFilter === 'ungrouped' ? { ...tabBaseStyle, ...tabActiveStyle } : tabBaseStyle}
        onClick={() => onFilterChange('ungrouped')}
      >
        {t('agentGroups.ungrouped' as any)}
      </button>

      {/* 分组标签 */}
      {groups.map((group) => {
        const count = countAgentsInGroup(mappings, group.id);
        const isActive = activeFilter === group.id;

        return (
          <button
            key={group.id}
            type="button"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium flex-shrink-0"
            style={isActive ? { ...tabBaseStyle, ...tabActiveStyle } : tabBaseStyle}
            onClick={() => onFilterChange(group.id)}
            onContextMenu={(e) => handleContextMenu(e, group.id)}
          >
            {/* Emoji 或颜色指示器 */}
            {group.emoji ? (
              <span className="text-sm leading-none">{group.emoji}</span>
            ) : group.color ? (
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: group.color }}
              />
            ) : null}
            <span>{group.name}</span>
            {/* Agent 计数 */}
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full"
              style={{
                backgroundColor: 'var(--app-bg-subtle)',
                color: 'var(--app-text-muted)',
              }}
            >
              {count}
            </span>
          </button>
        );
      })}

      {/* 新建分组按钮 */}
      <button
        type="button"
        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium flex-shrink-0"
        style={{
          border: '1px dashed var(--app-border)',
          color: 'var(--app-text-muted)',
          backgroundColor: 'transparent',
          cursor: 'pointer',
          transition: 'all 200ms',
        }}
        onClick={onCreateGroup}
      >
        <Plus size={14} />
        {t('agentGroups.create' as any)}
      </button>

      {/* 右键上下文菜单 */}
      {contextMenu && (
        <div
          ref={menuRef}
          className="fixed z-[100] rounded-xl border py-1 shadow-lg"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
            backgroundColor: 'var(--app-bg-elevated)',
            borderColor: 'var(--app-border)',
            minWidth: 140,
          }}
        >
          {/* 编辑分组 */}
          <button
            type="button"
            className="w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors"
            style={{ color: 'var(--app-text)' }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--app-bg-subtle)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
            }}
            onClick={() => handleMenuAction('edit')}
          >
            <Pencil size={14} style={{ color: 'var(--app-text-muted)' }} />
            {t('agentGroups.edit' as any)}
          </button>
          {/* 批量导出 */}
          <button
            type="button"
            className="w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors"
            style={{ color: 'var(--app-text)' }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--app-bg-subtle)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
            }}
            onClick={() => handleMenuAction('export')}
          >
            <Download size={14} style={{ color: 'var(--app-text-muted)' }} />
            {t('agentGroups.exportTitle' as any)}
          </button>
          {/* 分隔线 */}
          <div className="my-1 border-t" style={{ borderColor: 'var(--app-border)' }} />
          {/* 删除分组 */}
          <button
            type="button"
            className="w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors"
            style={{ color: '#F87171' }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(239, 68, 68, 0.08)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
            }}
            onClick={() => handleMenuAction('delete')}
          >
            <Trash2 size={14} />
            {t('agentGroups.delete' as any)}
          </button>
        </div>
      )}
    </div>
  );
};

export default GroupFilterBar;
export type { GroupFilterBarProps };
