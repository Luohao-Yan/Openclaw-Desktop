/**
 * 添加账号 Modal 弹窗
 * 用于在指定渠道下创建新的账号，包含 ID 输入和校验逻辑
 */
import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import AppButton from '../../components/AppButton';
import { useI18n } from '../../i18n/I18nContext';

/** 组件 Props */
interface AddAccountModalProps {
  /** 是否显示 */
  open: boolean;
  /** 关闭回调 */
  onClose: () => void;
  /** 当前渠道类型 */
  channelType: string;
  /** 当前渠道下已有的账号 ID 列表（用于重复校验） */
  existingAccountIds: string[];
  /** 确认添加回调 */
  onConfirm: (accountId: string) => void;
}

/** 账号 ID 校验正则：仅允许字母、数字、连字符、下划线 */
const ACCOUNT_ID_REGEX = /^[a-zA-Z0-9_-]+$/;

const AddAccountModal: React.FC<AddAccountModalProps> = ({
  open,
  onClose,
  channelType: _channelType,
  existingAccountIds,
  onConfirm,
}) => {
  const { t } = useI18n();
  const [accountId, setAccountId] = useState('');
  const [error, setError] = useState('');

  // 打开时重置状态
  useEffect(() => {
    if (open) {
      setAccountId('');
      setError('');
    }
  }, [open]);

  // Escape 键关闭
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  /** 提交校验 */
  const handleConfirm = () => {
    const trimmed = accountId.trim();
    // 空字符串校验
    if (!trimmed) {
      setError(t('channels.accountIdRequired'));
      return;
    }
    // 格式校验
    if (!ACCOUNT_ID_REGEX.test(trimmed)) {
      setError(t('channels.accountIdInvalid'));
      return;
    }
    // 重复 ID 校验
    if (existingAccountIds.includes(trimmed)) {
      setError(t('channels.accountIdDuplicate'));
      return;
    }
    onConfirm(trimmed);
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      onClick={onClose}
    >
      {/* 半透明遮罩 */}
      <div className="absolute inset-0 bg-black/40" />

      {/* 弹窗主体 */}
      <div
        className="relative w-full max-w-md rounded-3xl border p-6 shadow-2xl animate-[fadeInDown_0.2s_ease-out]"
        style={{ backgroundColor: 'var(--app-bg-elevated)', borderColor: 'var(--app-border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold" style={{ color: 'var(--app-text)' }}>
            {t('channels.modal.addAccount')}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1.5 transition-colors hover:opacity-70"
            style={{ color: 'var(--app-text-muted)' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* 输入区域 */}
        <div className="mt-5">
          <label className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>
            {t('channels.modal.accountIdLabel')}
          </label>
          <div className="mt-1 text-xs" style={{ color: 'var(--app-text-muted)' }}>
            {t('channels.modal.accountIdHint')}
          </div>
          <input
            value={accountId}
            onChange={(e) => { setAccountId(e.target.value); setError(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleConfirm(); }}
            className="mt-2 w-full rounded-xl border px-3 py-2 text-sm outline-none"
            style={{ backgroundColor: 'var(--app-bg)', borderColor: error ? '#EF4444' : 'var(--app-border)', color: 'var(--app-text)' }}
            placeholder={t('channels.modal.accountIdPlaceholder')}
            autoFocus
          />
          {error ? (
            <div className="mt-1 text-xs" style={{ color: '#EF4444' }}>{error}</div>
          ) : null}
        </div>

        {/* 底部按钮 */}
        <div className="mt-5 flex justify-end gap-2">
          <AppButton variant="secondary" size="sm" onClick={onClose}>
            {t('channels.modal.cancel')}
          </AppButton>
          <AppButton variant="primary" size="sm" onClick={handleConfirm}>
            {t('channels.modal.confirm')}
          </AppButton>
        </div>
      </div>
    </div>
  );
};

export default AddAccountModal;
