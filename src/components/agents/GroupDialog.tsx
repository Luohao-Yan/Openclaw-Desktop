/**
 * GroupDialog — 分组新建/编辑对话框
 *
 * 支持：
 * - 输入分组名称（实时校验：非空、不重复）
 * - 可选描述文本域
 * - 预设颜色选择器（6-8 种颜色）
 * - 预设 Emoji 选择器（8-10 个常用 Emoji）
 * - 编辑模式预填已有数据
 * - 使用 AppModal 保持风格一致
 * - i18n 国际化
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Palette, Smile } from 'lucide-react';
import type { AgentGroup } from '../../types/electron';
import AppModal from '../AppModal';
import AppButton from '../AppButton';
import { useI18n } from '../../i18n/I18nContext';

interface GroupDialogProps {
  /** 是否显示 */
  open: boolean;
  /** 编辑模式时传入已有分组数据 */
  group?: AgentGroup;
  /** 已有分组名称列表（用于重名校验） */
  existingNames: string[];
  /** 确认回调 */
  onConfirm: (data: { name: string; description?: string; color?: string; emoji?: string }) => void;
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

  // 编辑模式时预填数据
  useEffect(() => {
    if (open && group) {
      setName(group.name);
      setDescription(group.description || '');
      setColor(group.color);
      setEmoji(group.emoji);
    } else if (open) {
      setName('');
      setDescription('');
      setColor(undefined);
      setEmoji(undefined);
    }
  }, [open, group]);

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

  /** 提交表单 */
  const handleConfirm = () => {
    if (!isValid) return;
    onConfirm({
      name: name.trim(),
      description: description.trim() || undefined,
      color,
      emoji,
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
      </div>
    </AppModal>
  );
};

export default GroupDialog;
export type { GroupDialogProps };
