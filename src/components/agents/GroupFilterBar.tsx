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
  groups: AgentGroup[];
  mappings: Record<string, string>;
  activeFilter: string | null;
  onFilterChange: (filter: string | null) => void;
  onCreateGroup: () => void;
  onGroupAction: (groupId: string, action: 'edit' | 'export' | 'delete') => void;
}

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

  // hover tooltip 状态（延迟显示"右键管理分组"提示）
  const [tooltip, setTooltip] = useState<{ groupId: string; x: number; y: number } | null>(null);
  const tooltipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showTooltip = useCallback((e: React.MouseEvent, groupId: string) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    tooltipTimer.current = setTimeout(() => {
      setTooltip({ groupId, x: rect.left + rect.width / 2, y: rect.top - 6 });
    }, 500);
  }, []);

  const hideTooltip = useCallback(() => {
    if (tooltipTimer.current) clearTimeout(tooltipTimer.current);
    tooltipTimer.current = null;
    setTooltip(null);
  }, []);

  // 右键菜单状态
  const [contextMenu, setContextMenu] = useState<{
    groupId: string;
    x: number;
    y: number;
  } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, groupId: string) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ groupId, x: e.clientX, y: e.clientY });
    },
    [],
  );

  const handleMenuAction = useCallback(
    (action: 'edit' | 'export' | 'delete') => {
      if (contextMenu) {
        onGroupAction(contextMenu.groupId, action);
      }
      setContextMenu(null);
    },
    [contextMenu, onGroupAction],
  );

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

  const colorWithAlpha = (hex: string | undefined, alpha: number): string => {
    if (!hex) return 'transparent';
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const DEFAULT_TAG_COLOR = '#6366F1';

  const getGroupTagStyle = (group: AgentGroup, isActive: boolean): React.CSSProperties => {
    const tagColor = group.color || DEFAULT_TAG_COLOR;
    if (isActive) {
      return {
        backgroundColor: colorWithAlpha(tagColor, 0.15),
        border: `1px solid ${colorWithAlpha(tagColor, 0.4)}`,
        color: tagColor,
        cursor: 'pointer',
        transition: 'all 200ms',
        whiteSpace: 'nowrap',
        boxShadow: `0 0 0 1px ${colorWithAlpha(tagColor, 0.08)}`,
      };
    }
    return {
      backgroundColor: colorWithAlpha(tagColor, 0.06),
      border: `1px solid ${colorWithAlpha(tagColor, 0.18)}`,
      color: 'var(--app-text-muted)',
      cursor: 'pointer',
      transition: 'all 200ms',
      whiteSpace: 'nowrap',
    };
  };

  const tabBaseStyle: React.CSSProperties = {
    border: '1px solid var(--app-border)',
    color: 'var(--app-text-muted)',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    transition: 'all 200ms',
    whiteSpace: 'nowrap',
  };

  const tabActiveStyle: React.CSSProperties = {
    border: '1px solid var(--app-active-border, var(--app-border))',
    color: 'var(--app-text)',
    backgroundColor: 'var(--app-bg-subtle)',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.06)',
  };

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'thin' }}>
      {/* 「全部」标签 */}
      <button
        type="button"
        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium flex-shrink-0"
        style={activeFilter === null ? { ...tabBaseStyle, ...tabActiveStyle } : tabBaseStyle}
        onClick={() => onFilterChange(null)}
      >
        {t('agentGroups.all' as any)}
      </button>

      {/* 「未分组」标签 */}
      <button
        type="button"
        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium flex-shrink-0"
        style={activeFilter === 'ungrouped' ? { ...tabBaseStyle, ...tabActiveStyle } : tabBaseStyle}
        onClick={() => onFilterChange('ungrouped')}
      >
        {t('agentGroups.ungrouped' as any)}
      </button>

      {/* 分组标签 */}
      {groups.map((group) => {
        const count = countAgentsInGroup(mappings, group.id);
        const isActive = activeFilter === group.id;
        const tagColor = group.color || DEFAULT_TAG_COLOR;

        return (
          <button
            key={group.id}
            type="button"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium flex-shrink-0 hover:opacity-85"
            style={getGroupTagStyle(group, isActive)}
            onClick={() => onFilterChange(group.id)}
            onContextMenu={(e) => { hideTooltip(); handleContextMenu(e, group.id); }}
            onMouseEnter={(e) => showTooltip(e, group.id)}
            onMouseLeave={hideTooltip}
          >
            {group.emoji ? (
              <span className="text-sm leading-none">{group.emoji}</span>
            ) : (
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{
                  backgroundColor: tagColor,
                  boxShadow: isActive ? `0 0 4px ${colorWithAlpha(tagColor, 0.5)}` : 'none',
                }}
              />
            )}
            <span style={{ color: isActive ? tagColor : undefined }}>
              {group.name}
            </span>
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
              style={{
                backgroundColor: isActive ? colorWithAlpha(tagColor, 0.18) : 'var(--app-bg-subtle)',
                color: isActive ? tagColor : 'var(--app-text-muted)',
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
        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium flex-shrink-0 hover:opacity-80"
        style={{
          border: '1px dashed var(--app-border)',
          color: 'var(--app-text-muted)',
          backgroundColor: 'transparent',
          transition: 'all 200ms',
        }}
        onClick={onCreateGroup}
      >
        <Plus size={14} />
        {t('agentGroups.create' as any)}
      </button>

      {/* 自定义 tooltip：hover 分组标签时提示右键操作 */}
      {tooltip && (
        <div
          className="fixed z-[110] px-2.5 py-1.5 rounded-lg text-[11px] font-medium shadow-lg pointer-events-none"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: 'translate(-50%, -100%)',
            backgroundColor: 'var(--app-bg-elevated)',
            border: '1px solid var(--app-border)',
            color: 'var(--app-text-muted)',
            whiteSpace: 'nowrap',
          }}
        >
          右键管理分组
        </div>
      )}

      {/* 右键上下文菜单 */}
      {contextMenu && (
        <div
          ref={menuRef}
          className="fixed z-[100] rounded-xl border py-1.5 px-1 shadow-lg"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
            backgroundColor: 'var(--app-bg-elevated)',
            borderColor: 'var(--app-border)',
            minWidth: 140,
          }}
        >
          <button
            type="button"
            className="w-full flex items-center gap-2 px-3 py-2.5 text-xs rounded-lg hover:bg-black/5 dark:hover:bg-white/5"
            style={{ color: 'var(--app-text)' }}
            onClick={() => handleMenuAction('edit')}
          >
            <Pencil size={14} style={{ color: 'var(--app-text-muted)' }} />
            {t('agentGroups.edit' as any)}
          </button>
          <button
            type="button"
            className="w-full flex items-center gap-2 px-3 py-2.5 text-xs rounded-lg hover:bg-black/5 dark:hover:bg-white/5"
            style={{ color: 'var(--app-text)' }}
            onClick={() => handleMenuAction('export')}
          >
            <Download size={14} style={{ color: 'var(--app-text-muted)' }} />
            {t('agentGroups.exportTitle' as any)}
          </button>
          <div className="my-1 border-t" style={{ borderColor: 'var(--app-border)' }} />
          <button
            type="button"
            className="w-full flex items-center gap-2 px-3 py-2.5 text-xs rounded-lg hover:bg-red-500/8"
            style={{ color: '#F87171' }}
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
