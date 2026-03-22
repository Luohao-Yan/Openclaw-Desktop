/**
 * DeleteSkillConfirm — 删除技能确认对话框
 *
 * 使用 AppModal 统一弹窗结构，包含：
 * - 不可恢复警告提示
 * - 确认后调用 skillsDeleteCustom 并刷新列表
 */

import React, { useState, useCallback } from 'react';
import { Trash2, AlertTriangle, RefreshCw } from 'lucide-react';
import AppButton from '../AppButton';
import AppModal from '../AppModal';

interface DeleteSkillConfirmProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  skillId: string;
  skillName: string;
}

const DeleteSkillConfirm: React.FC<DeleteSkillConfirmProps> = ({
  isOpen,
  onClose,
  onSuccess,
  skillId,
  skillName,
}) => {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const handleDelete = useCallback(async () => {
    if (deleting || !skillId) return;
    setDeleting(true);
    setError('');
    try {
      const result = await window.electronAPI.skillsDeleteCustom(skillId);
      if (result.success) {
        onSuccess?.();
        onClose();
      } else {
        setError(result.error || '删除失败');
      }
    } catch (err: unknown) {
      setError(`删除异常: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDeleting(false);
    }
  }, [deleting, skillId, onSuccess, onClose]);

  return (
    <AppModal
      open={isOpen}
      onClose={onClose}
      title="删除技能"
      variant="danger"
      size="sm"
      icon={<Trash2 size={20} />}
      disableClose={deleting}
      footer={
        <>
          <AppButton variant="secondary" onClick={onClose} disabled={deleting}>
            取消
          </AppButton>
          <AppButton
            variant="danger"
            onClick={() => void handleDelete()}
            disabled={deleting}
            icon={deleting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          >
            {deleting ? '删除中...' : '确认删除'}
          </AppButton>
        </>
      }
    >
      <div className="space-y-4">
        {/* 警告提示 */}
        <div
          className="rounded-xl border px-4 py-4 flex items-start gap-3"
          style={{
            backgroundColor: 'rgba(239,68,68,0.08)',
            borderColor: 'rgba(239,68,68,0.22)',
          }}
        >
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-red-400" />
          <div className="space-y-1.5">
            <p className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>
              确定要删除技能「<span className="font-semibold">{skillName}</span>」吗？
            </p>
            <p className="text-xs" style={{ color: 'var(--app-text-muted)' }}>
              此操作将删除整个技能目录及其所有内容，且不可恢复。
            </p>
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

export default DeleteSkillConfirm;
