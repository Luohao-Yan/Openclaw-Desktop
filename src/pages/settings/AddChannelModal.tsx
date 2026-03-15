/**
 * 添加渠道 Modal 弹窗
 * 以网格布局展示可添加的渠道类型，点击后触发添加回调
 */
import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';
import type { ChannelTypeDefinition } from '../../utils/channelOps';

/** 组件 Props */
interface AddChannelModalProps {
  /** 是否显示 */
  open: boolean;
  /** 关闭回调 */
  onClose: () => void;
  /** 可添加的渠道类型列表（已排除已配置的） */
  availableChannelTypes: ChannelTypeDefinition[];
  /** 选择渠道类型后的回调 */
  onSelect: (channelType: string) => void;
}

const AddChannelModal: React.FC<AddChannelModalProps> = ({
  open,
  onClose,
  availableChannelTypes,
  onSelect,
}) => {
  const { t } = useI18n();

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

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      onClick={onClose}
    >
      {/* 半透明遮罩 */}
      <div className="absolute inset-0 bg-black/40" />

      {/* 弹窗主体 */}
      <div
        className="relative w-full max-w-lg rounded-3xl border p-6 shadow-2xl animate-[fadeInDown_0.2s_ease-out]"
        style={{ backgroundColor: 'var(--app-bg-elevated)', borderColor: 'var(--app-border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold" style={{ color: 'var(--app-text)' }}>
            {t('channels.modal.selectChannelType')}
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

        {/* 渠道类型网格 */}
        <div className="mt-5 grid grid-cols-2 gap-2 md:grid-cols-3">
          {availableChannelTypes.map((ct) => (
            <button
              key={ct.id}
              type="button"
              className="rounded-xl border px-3 py-3 text-left text-sm transition-all hover:opacity-80"
              style={{
                borderColor: 'var(--app-border)',
                color: 'var(--app-text)',
                backgroundColor: 'var(--app-bg)',
              }}
              onClick={() => onSelect(ct.id)}
            >
              <div className="font-medium">{ct.name}</div>
              <div className="mt-0.5 text-xs" style={{ color: 'var(--app-text-muted)' }}>{ct.id}</div>
            </button>
          ))}
        </div>

        {/* 无可用渠道时的空状态 */}
        {availableChannelTypes.length === 0 ? (
          <div className="mt-4 text-center text-sm" style={{ color: 'var(--app-text-muted)' }}>
            {t('channels.noChannelsHint')}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default AddChannelModal;
