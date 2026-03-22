/**
 * CreateSkillDialog — 创建自定义技能对话框
 *
 * 使用 AppModal 统一弹窗结构，包含：
 * - 技能名称输入框（实时 kebab-case 转换预览）
 * - 描述输入框
 * - Emoji 选择器（常用 emoji 网格）
 * - 名称冲突时显示错误提示
 * - 确认后调用 skillsCreate 并触发列表刷新
 */

import React, { useState, useCallback, useEffect } from 'react';
import { Plus, AlertTriangle, RefreshCw } from 'lucide-react';
import AppButton from '../AppButton';
import AppModal from '../AppModal';

/** 常用 emoji 列表 */
const COMMON_EMOJIS = [
  '🔧', '🎯', '📦', '🚀', '💡', '🤖', '🔍', '📝',
  '🛡️', '⚡', '🎨', '🔗', '📊', '🌐', '💻', '🎮',
  '📱', '🔔', '🎵', '🎬',
];

interface CreateSkillDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

/**
 * 将任意字符串转换为 kebab-case 格式
 */
function toKebabCase(input: string): string {
  const result = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
  return result || 'skill';
}

const CreateSkillDialog: React.FC<CreateSkillDialogProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [rawName, setRawName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedEmoji, setSelectedEmoji] = useState('🔧');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  const kebabName = rawName.trim() ? toKebabCase(rawName) : '';
  const nameConverted = rawName.trim() !== '' && rawName.trim() !== kebabName;
  const canSubmit = kebabName.length > 0 && description.trim().length > 0 && !creating;

  // 对话框打开时重置状态
  useEffect(() => {
    if (isOpen) {
      setRawName('');
      setDescription('');
      setSelectedEmoji('🔧');
      setError('');
      setCreating(false);
    }
  }, [isOpen]);

  const handleCreate = useCallback(async () => {
    if (!canSubmit) return;
    setError('');
    setCreating(true);
    try {
      const result = await window.electronAPI.skillsCreate({
        name: kebabName,
        description: description.trim(),
        emoji: selectedEmoji,
      });
      if (result.success) {
        onSuccess?.();
        onClose();
      } else {
        setError(result.error || '创建失败');
      }
    } catch (err: unknown) {
      setError(`创建异常: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setCreating(false);
    }
  }, [canSubmit, kebabName, description, selectedEmoji, onSuccess, onClose]);

  return (
    <AppModal
      open={isOpen}
      onClose={onClose}
      title="创建自定义技能"
      variant="default"
      icon={<span className="text-lg">{selectedEmoji}</span>}
      disableClose={creating}
      footer={
        <>
          <AppButton variant="secondary" onClick={onClose} disabled={creating}>
            取消
          </AppButton>
          {/* loading 时自动显示 spinner，无需手动切换图标 */}
          <AppButton
            variant="primary"
            onClick={() => void handleCreate()}
            disabled={!canSubmit}
            loading={creating}
            icon={<Plus className="w-4 h-4" />}
          >
            创建
          </AppButton>
        </>
      }
    >
      <div className="space-y-4">
        {/* 技能名称 */}
        <div className="space-y-2">
          <label className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>
            技能名称 <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={rawName}
            onChange={(e) => { setRawName(e.target.value); if (error) setError(''); }}
            placeholder="例如: my-awesome-skill"
            className="w-full rounded-xl px-4 py-2.5 text-sm outline-none transition-colors"
            style={{
              backgroundColor: 'var(--app-bg-subtle)',
              border: error ? '1px solid rgba(239,68,68,0.5)' : '1px solid var(--app-border)',
              color: 'var(--app-text)',
            }}
            autoFocus
            disabled={creating}
          />
          {/* kebab-case 转换预览 */}
          {nameConverted && kebabName && (
            <p className="text-xs flex items-center gap-1" style={{ color: 'var(--app-text-muted)' }}>
              <RefreshCw className="w-3 h-3" />
              将转换为: <span className="font-mono font-medium" style={{ color: 'var(--app-text)' }}>{kebabName}</span>
            </p>
          )}
        </div>

        {/* 技能描述 */}
        <div className="space-y-2">
          <label className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>
            描述 <span className="text-red-400">*</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="简要描述这个技能的功能..."
            rows={3}
            className="w-full rounded-xl px-4 py-2.5 text-sm outline-none transition-colors resize-none"
            style={{
              backgroundColor: 'var(--app-bg-subtle)',
              border: '1px solid var(--app-border)',
              color: 'var(--app-text)',
            }}
            disabled={creating}
          />
        </div>

        {/* Emoji 选择器 */}
        <div className="space-y-2">
          <label className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>图标</label>
          <div className="flex flex-wrap gap-1.5">
            {COMMON_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => setSelectedEmoji(emoji)}
                className="w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-all cursor-pointer"
                style={{
                  backgroundColor: selectedEmoji === emoji ? 'rgba(168,85,247,0.2)' : 'var(--app-bg-subtle)',
                  border: selectedEmoji === emoji ? '2px solid rgba(168,85,247,0.5)' : '1px solid var(--app-border)',
                  transform: selectedEmoji === emoji ? 'scale(1.1)' : 'scale(1)',
                }}
                disabled={creating}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>

        {/* 错误提示 */}
        {error && (
          <div
            className="rounded-xl border px-4 py-3 text-xs flex items-start gap-2"
            style={{
              backgroundColor: 'rgba(239,68,68,0.08)',
              borderColor: 'rgba(239,68,68,0.22)',
              color: '#FCA5A5',
            }}
          >
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
      </div>
    </AppModal>
  );
};

export default CreateSkillDialog;
