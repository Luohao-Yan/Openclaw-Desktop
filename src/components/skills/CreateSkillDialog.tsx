/**
 * CreateSkillDialog — 创建自定义技能对话框
 *
 * 使用 AppModal 统一弹窗结构，包含：
 * - 技能名称输入框（实时 kebab-case 转换预览）
 * - 描述输入框
 * - Emoji 选择器（常用 emoji 网格）
 * - 名称冲突时显示错误提示
 * - 确认后调用 skillsCreate 并触发列表刷新
 *
 * 新增功能：
 * - 支持从本地文件安装（.zip 或文件夹）
 * - 安装模式切换（手动创建 / 从文件安装）
 * - 文件选择与验证
 */

import React, { useState, useCallback, useEffect } from 'react';
import { Plus, AlertTriangle, RefreshCw, Upload, FileArchive, Folder } from 'lucide-react';
import AppButton from '../AppButton';
import AppModal from '../AppModal';

/** 常用 emoji 列表 */
const COMMON_EMOJIS = [
  '🔧', '🎯', '📦', '🚀', '💡', '🤖', '🔍', '📝',
  '🛡️', '⚡', '🎨', '🔗', '📊', '🌐', '💻', '🎮',
  '📱', '🔔', '🎵', '🎬',
];

/** 安装模式类型 */
type InstallMode = 'manual' | 'file';

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
  // 安装模式
  const [installMode, setInstallMode] = useState<InstallMode>('manual');

  // 手动创建模式状态
  const [rawName, setRawName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedEmoji, setSelectedEmoji] = useState('🔧');

  // 文件安装模式状态
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectingFile, setSelectingFile] = useState(false);

  // 通用状态
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  const kebabName = rawName.trim() ? toKebabCase(rawName) : '';
  const nameConverted = rawName.trim() !== '' && rawName.trim() !== kebabName;

  // 手动创建模式的验证
  const canSubmitManual = kebabName.length > 0 && description.trim().length > 0 && !creating;
  // 文件安装模式的验证
  const canSubmitFile = selectedFile !== null && !creating;

  // 对话框打开时重置状态
  useEffect(() => {
    if (isOpen) {
      setInstallMode('manual');
      setRawName('');
      setDescription('');
      setSelectedEmoji('🔧');
      setSelectedFile(null);
      setError('');
      setCreating(false);
    }
  }, [isOpen]);

  // 选择本地文件
  const handleSelectFile = useCallback(async () => {
    setError('');
    setSelectingFile(true);
    try {
      const result = await window.electronAPI.skillsInstallFromLocal();
      if (result.success && result.filePath) {
        setSelectedFile(result.filePath);
      } else if (result.canceled) {
        // 用户取消，不显示错误
      } else {
        setError(result.error || '选择文件失败');
      }
    } catch (err: unknown) {
      setError(`选择文件异常: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSelectingFile(false);
    }
  }, []);

  // 手动创建技能
  const handleCreateManual = useCallback(async () => {
    if (!canSubmitManual) return;
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
  }, [canSubmitManual, kebabName, description, selectedEmoji, onSuccess, onClose]);

  // 从文件安装
  const handleInstallFromFile = useCallback(async () => {
    if (!canSubmitFile || !selectedFile) return;
    setError('');
    setCreating(true);
    try {
      const result = await window.electronAPI.skillsInstallLocalFile(selectedFile);
      if (result.success) {
        onSuccess?.();
        onClose();
      } else {
        setError(result.error || '安装失败');
      }
    } catch (err: unknown) {
      setError(`安装异常: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setCreating(false);
    }
  }, [canSubmitFile, selectedFile, onSuccess, onClose]);

  // 提交处理
  const handleSubmit = useCallback(() => {
    if (installMode === 'manual') {
      handleCreateManual();
    } else {
      handleInstallFromFile();
    }
  }, [installMode, handleCreateManual, handleInstallFromFile]);

  return (
    <AppModal
      open={isOpen}
      onClose={onClose}
      title={installMode === 'manual' ? '创建自定义技能' : '从本地文件安装'}
      variant="default"
      icon={installMode === 'manual' ? <span className="text-lg">{selectedEmoji}</span> : <Upload className="w-5 h-5" />}
      disableClose={creating}
      footer={
        <>
          <AppButton variant="secondary" onClick={onClose} disabled={creating}>
            取消
          </AppButton>
          <AppButton
            variant="primary"
            onClick={() => void handleSubmit()}
            disabled={(installMode === 'manual' ? !canSubmitManual : !canSubmitFile)}
            loading={creating}
            icon={<Plus className="w-4 h-4" />}
          >
            {installMode === 'manual' ? '创建' : '安装'}
          </AppButton>
        </>
      }
    >
      <div className="space-y-4">
        {/* 安装模式切换 */}
        <div className="flex gap-2 p-1 rounded-xl" style={{ backgroundColor: 'var(--app-bg-subtle)' }}>
          <button
            type="button"
            onClick={() => { setInstallMode('manual'); setError(''); }}
            className="flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{
              backgroundColor: installMode === 'manual' ? 'var(--app-bg-elevated)' : 'transparent',
              color: installMode === 'manual' ? 'var(--app-text)' : 'var(--app-text-muted)',
              border: installMode === 'manual' ? '1px solid var(--app-border)' : 'none',
            }}
            disabled={creating}
          >
            手动创建
          </button>
          <button
            type="button"
            onClick={() => { setInstallMode('file'); setError(''); }}
            className="flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{
              backgroundColor: installMode === 'file' ? 'var(--app-bg-elevated)' : 'transparent',
              color: installMode === 'file' ? 'var(--app-text)' : 'var(--app-text-muted)',
              border: installMode === 'file' ? '1px solid var(--app-border)' : 'none',
            }}
            disabled={creating}
          >
            从文件安装
          </button>
        </div>

        {/* 手动创建模式表单 */}
        {installMode === 'manual' && (
          <>
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
          </>
        )}

        {/* 文件安装模式表单 */}
        {installMode === 'file' && (
          <div className="space-y-3">
            <div className="rounded-xl border p-4" style={{ backgroundColor: 'var(--app-bg-subtle)', borderColor: 'var(--app-border)' }}>
              <div className="flex items-start gap-3 mb-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-lg" style={{ backgroundColor: 'rgba(59,130,246,0.1)', color: '#3B82F6' }}>
                  <FileArchive className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold" style={{ color: 'var(--app-text)' }}>支持格式</h3>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--app-text-muted)' }}>
                    .zip 压缩包或包含 SKILL.md 的文件夹
                  </p>
                </div>
              </div>
              <div className="text-xs rounded-lg p-3" style={{ backgroundColor: 'rgba(59,130,246,0.05)', color: 'var(--app-text-muted)' }}>
                <strong>文件要求：</strong>
                <ul className="mt-1.5 space-y-0.5 list-disc list-inside">
                  <li>必须包含 SKILL.md 文件</li>
                  <li>SKILL.md 必须包含 name 和 description 字段</li>
                  <li>文件将复制到 workspace/skills 目录</li>
                </ul>
              </div>
            </div>

            {/* 文件选择按钮 */}
            <button
              type="button"
              onClick={() => void handleSelectFile()}
              disabled={selectingFile || creating}
              className="w-full rounded-xl border-2 border-dashed px-4 py-6 text-sm transition-all hover:opacity-80 disabled:opacity-50"
              style={{
                backgroundColor: 'var(--app-bg-subtle)',
                borderColor: selectedFile ? 'rgba(168,85,247,0.4)' : 'var(--app-border)',
                color: selectedFile ? '#A855F7' : 'var(--app-text-muted)',
              }}
            >
              <div className="flex flex-col items-center gap-2">
                {selectedFile ? (
                  <>
                    <Folder className="w-8 h-8" />
                    <div className="text-center">
                      <p className="font-medium truncate max-w-xs">{selectedFile.split('/').pop()}</p>
                      <p className="text-xs mt-0.5 opacity-60 truncate max-w-xs">{selectedFile}</p>
                    </div>
                  </>
                ) : (
                  <>
                    <Upload className="w-8 h-8 opacity-60" />
                    <p>点击选择文件或文件夹</p>
                  </>
                )}
              </div>
            </button>

            {/* 清除选择 */}
            {selectedFile && (
              <button
                type="button"
                onClick={() => setSelectedFile(null)}
                disabled={creating}
                className="text-xs px-1.5 py-1 rounded-lg transition-all hover:opacity-80"
                style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#EF4444' }}
              >
                清除选择
              </button>
            )}
          </div>
        )}

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
