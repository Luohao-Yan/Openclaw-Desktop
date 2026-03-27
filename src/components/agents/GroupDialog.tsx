/**
 * GroupDialog — 分组新建/编辑对话框
 *
 * 支持：
 * - 输入分组名称（实时校验：非空、不重复）
 * - 可选描述文本域
 * - 预设颜色选择器（6-8 种颜色）
 * - 预设 Emoji 选择器（8-10 个常用 Emoji）
 * - 编辑模式预填已有数据
 * - Batch_Selector：Agent 批量选择列表
 * - 使用 AppModal 保持风格一致
 * - i18n 国际化
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Palette, Smile, Search } from 'lucide-react';
import type { AgentGroup } from '../../types/electron';
import type { AgentInfo } from '../../../types/electron';
import AppModal from '../AppModal';
import AppButton from '../AppButton';
import { useI18n } from '../../i18n/I18nContext';
/**
 * 根据映射和分组 ID 初始化编辑模式下的预选 Agent ID 集合
 * （从 agentGroupLogic.ts 复制的纯函数，避免在渲染进程中引入 node:crypto 依赖）
 */
function initSelectedAgents(
  mappings: Record<string, string>,
  groupId: string,
): Set<string> {
  const result = new Set<string>();
  for (const [agentId, gId] of Object.entries(mappings)) {
    if (gId === groupId) {
      result.add(agentId);
    }
  }
  return result;
}

/**
 * 按名称模糊匹配过滤 Agent 列表
 * （从 agentGroupLogic.ts 复制的纯函数，避免在渲染进程中引入 node:crypto 依赖）
 */
function filterAgentsByName(
  agents: AgentInfo[],
  query: string,
): AgentInfo[] {
  const trimmed = query.trim().toLowerCase();
  if (trimmed.length === 0) return agents;
  return agents.filter((a) =>
    a.name.toLowerCase().includes(trimmed),
  );
}

/** 组件属性接口 */
interface GroupDialogProps {
  /** 是否显示 */
  open: boolean;
  /** 编辑模式时传入已有分组数据 */
  group?: AgentGroup;
  /** 已有分组名称列表（用于重名校验） */
  existingNames: string[];
  /** 所有 Agent 列表 */
  agents: AgentInfo[];
  /** 当前 Agent-分组映射（agentId → groupId） */
  groupMappings: Record<string, string>;
  /** 所有分组列表（用于显示已分配提示） */
  groups: AgentGroup[];
  /** 确认回调，携带分组属性和选中的 Agent ID 列表 */
  onConfirm: (data: {
    name: string;
    description?: string;
    color?: string;
    emoji?: string;
    selectedAgentIds: string[];
  }) => void;
  /** 取消回调 */
  onCancel: () => void;
}

/** 预设颜色列表 */
const PRESET_COLORS = [
  '#818CF8', // 紫
  '#34D399', // 绿
  '#F87171', // 红
  '#FBBF24', // 黄
  '#38BDF8', // 蓝
  '#FB923C', // 橙
  '#A78BFA', // 淡紫
  '#F472B6', // 粉
];

/** 预设 Emoji 列表 */
const PRESET_EMOJIS = [
  '🤖', '🚀', '⭐', '🔥', '💡', '🎯', '🛡️', '📦', '🧪', '🎨',
];

const GroupDialog: React.FC<GroupDialogProps> = ({
  open,
  group,
  existingNames,
  agents,
  groupMappings,
  groups,
  onConfirm,
  onCancel,
}) => {
  const { t } = useI18n();
  const isEdit = !!group;

  // 表单状态
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState<string | undefined>(undefined);
  const [emoji, setEmoji] = useState<string | undefined>(undefined);

  // Batch_Selector 状态：选中的 Agent ID 集合
  const [selectedAgentIds, setSelectedAgentIds] = useState<Set<string>>(new Set());
  // 搜索关键词
  const [searchQuery, setSearchQuery] = useState('');

  // 编辑模式时预填数据，并初始化预选 Agent
  useEffect(() => {
    if (open && group) {
      // 编辑模式：预填分组属性
      setName(group.name);
      setDescription(group.description || '');
      setColor(group.color);
      setEmoji(group.emoji);
      // 根据映射初始化预选 Agent
      setSelectedAgentIds(initSelectedAgents(groupMappings, group.id));
    } else if (open) {
      // 创建模式：重置所有状态
      setName('');
      setDescription('');
      setColor(undefined);
      setEmoji(undefined);
      setSelectedAgentIds(new Set());
    }
    // 每次打开时重置搜索
    if (open) setSearchQuery('');
  }, [open, group, groupMappings]);

  // 名称校验
  const nameError = useMemo(() => {
    const trimmed = name.trim();
    if (trimmed.length === 0) return t('agentGroups.nameRequired' as any);
    // 编辑模式下排除自身名称
    const filtered = isEdit
      ? existingNames.filter((n) => n !== group?.name)
      : existingNames;
    if (filtered.some((n) => n === trimmed)) return t('agentGroups.nameDuplicate' as any);
    return null;
  }, [name, existingNames, isEdit, group, t]);

  const isValid = name.trim().length > 0 && !nameError;

  // 搜索过滤后的 Agent 列表
  const filteredAgents = useMemo(
    () => filterAgentsByName(agents, searchQuery),
    [agents, searchQuery],
  );

  // 是否显示搜索框（Agent 数量 > 5 时显示）
  const showSearch = agents.length > 5;

  /** 切换 Agent 选中状态 */
  const toggleAgent = (agentId: string) => {
    setSelectedAgentIds((prev) => {
      const next = new Set(prev);
      if (next.has(agentId)) {
        next.delete(agentId);
      } else {
        next.add(agentId);
      }
      return next;
    });
  };

  /**
   * 解析 Agent 已分配到的其他分组名称
   * 如果 Agent 分配到当前编辑的分组或未分配，返回 undefined
   */
  const getOtherGroupName = (agentId: string): string | undefined => {
    const mappedGroupId = groupMappings[agentId];
    if (!mappedGroupId) return undefined;
    // 编辑模式下，如果映射到当前分组则不显示提示
    if (isEdit && mappedGroupId === group?.id) return undefined;
    const mappedGroup = groups.find((g) => g.id === mappedGroupId);
    return mappedGroup?.name;
  };

  /** 提交表单 */
  const handleConfirm = () => {
    if (!isValid) return;
    onConfirm({
      name: name.trim(),
      description: description.trim() || undefined,
      color,
      emoji,
      selectedAgentIds: Array.from(selectedAgentIds),
    });
  };

  const dialogTitle = isEdit
    ? t('agentGroups.edit' as any)
    : t('agentGroups.create' as any);

  return (
    <AppModal
      open={open}
      onClose={onCancel}
      title={dialogTitle}
      icon={<Palette size={20} />}
      variant="default"
      footer={
        <>
          <AppButton variant="secondary" onClick={onCancel}>
            {t('agentGroups.cancel' as any)}
          </AppButton>
          <AppButton variant="primary" onClick={handleConfirm} disabled={!isValid}>
            {t('agentGroups.confirm' as any)}
          </AppButton>
        </>
      }
    >
      <div className="space-y-4">
        {/* 分组名称 */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>
            {t('agentGroups.name' as any)}
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('agentGroups.name' as any)}
            className="w-full rounded-xl px-4 py-2.5 text-sm outline-none transition-colors"
            style={{
              backgroundColor: 'var(--app-bg-subtle)',
              border: `1px solid ${nameError && name.length > 0 ? '#F87171' : 'var(--app-border)'}`,
              color: 'var(--app-text)',
            }}
            autoFocus
          />
          {/* 校验错误提示 */}
          {nameError && name.length > 0 && (
            <p className="text-xs" style={{ color: '#F87171' }}>
              {nameError}
            </p>
          )}
        </div>

        {/* 描述 */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>
            {t('agentGroups.description' as any)}
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('agentGroups.description' as any)}
            rows={2}
            className="w-full rounded-xl px-4 py-2.5 text-sm outline-none transition-colors resize-none"
            style={{
              backgroundColor: 'var(--app-bg-subtle)',
              border: '1px solid var(--app-border)',
              color: 'var(--app-text)',
            }}
          />
        </div>

        {/* 颜色选择器 */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium flex items-center gap-1.5" style={{ color: 'var(--app-text)' }}>
            <Palette size={14} style={{ color: 'var(--app-text-muted)' }} />
            {t('agentGroups.color' as any)}
          </label>
          <div className="flex items-center gap-2 flex-wrap">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className="w-7 h-7 rounded-full flex items-center justify-center transition-transform"
                style={{
                  backgroundColor: c,
                  border: color === c ? '2px solid var(--app-text)' : '2px solid transparent',
                  transform: color === c ? 'scale(1.15)' : 'scale(1)',
                  cursor: 'pointer',
                }}
                onClick={() => setColor(color === c ? undefined : c)}
                aria-label={c}
              />
            ))}
          </div>
        </div>

        {/* Emoji 选择器 */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium flex items-center gap-1.5" style={{ color: 'var(--app-text)' }}>
            <Smile size={14} style={{ color: 'var(--app-text-muted)' }} />
            {t('agentGroups.emoji' as any)}
          </label>
          <div className="flex items-center gap-2 flex-wrap">
            {PRESET_EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-lg transition-all"
                style={{
                  backgroundColor: emoji === e ? 'var(--app-bg-subtle)' : 'transparent',
                  border: emoji === e ? '1px solid var(--app-active-border, var(--app-border))' : '1px solid transparent',
                  cursor: 'pointer',
                  transform: emoji === e ? 'scale(1.15)' : 'scale(1)',
                }}
                onClick={() => setEmoji(emoji === e ? undefined : e)}
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        {/* Batch_Selector：Agent 批量选择区域 */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>
            智能体选择
          </label>

          {/* 搜索框：仅当 Agent 数量 > 5 时显示 */}
          {showSearch && (
            <div className="relative">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: 'var(--app-text-muted)' }}
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索智能体..."
                className="w-full rounded-xl pl-8 pr-4 py-2 text-sm outline-none transition-colors"
                style={{
                  backgroundColor: 'var(--app-bg-subtle)',
                  border: '1px solid var(--app-border)',
                  color: 'var(--app-text)',
                }}
              />
            </div>
          )}

          {/* Agent 多选列表 */}
          <div
            className="rounded-xl overflow-y-auto"
            style={{
              maxHeight: '200px',
              backgroundColor: 'var(--app-bg-subtle)',
              border: '1px solid var(--app-border)',
            }}
          >
            {agents.length === 0 ? (
              /* 空列表占位提示 */
              <div
                className="flex items-center justify-center py-6 text-sm"
                style={{ color: 'var(--app-text-muted)' }}
              >
                暂无可用智能体
              </div>
            ) : filteredAgents.length === 0 ? (
              /* 搜索无匹配结果提示 */
              <div
                className="flex items-center justify-center py-6 text-sm"
                style={{ color: 'var(--app-text-muted)' }}
              >
                无匹配的智能体
              </div>
            ) : (
              /* Agent 列表项 */
              filteredAgents.map((agent) => {
                const isChecked = selectedAgentIds.has(agent.id);
                const otherGroupName = getOtherGroupName(agent.id);
                return (
                  <label
                    key={agent.id}
                    className="flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors hover:opacity-80"
                    style={{
                      borderBottom: '1px solid var(--app-border)',
                      color: 'var(--app-text)',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleAgent(agent.id)}
                      className="accent-blue-500 w-4 h-4 flex-shrink-0"
                    />
                    <span className="text-sm truncate">{agent.name}</span>
                    {/* 已分配到其他分组的提示 */}
                    {otherGroupName && (
                      <span
                        className="text-xs ml-auto flex-shrink-0"
                        style={{ color: 'var(--app-text-muted)' }}
                      >
                        (分组: {otherGroupName})
                      </span>
                    )}
                  </label>
                );
              })
            )}
          </div>
        </div>
      </div>
    </AppModal>
  );
};

export default GroupDialog;
export type { GroupDialogProps };
