/**
 * 添加渠道 Modal 弹窗
 * 使用 AppModal 统一弹窗结构
 * 以网格布局展示可添加的渠道类型，点击后触发添加回调
 */
import React from 'react';
import { PlusCircle } from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';
import AppModal from '../../components/AppModal';
import type { ChannelTypeDefinition } from '../../utils/channelOps';

interface AddChannelModalProps {
  open: boolean;
  onClose: () => void;
  availableChannelTypes: ChannelTypeDefinition[];
  onSelect: (channelType: string) => void;
}

const AddChannelModal: React.FC<AddChannelModalProps> = ({
  open,
  onClose,
  availableChannelTypes,
  onSelect,
}) => {
  const { t } = useI18n();

  return (
    <AppModal
      open={open}
      onClose={onClose}
      title={t('channels.modal.selectChannelType')}
      icon={<PlusCircle size={20} />}
      variant="info"
    >
      {/* 渠道类型网格 */}
      {availableChannelTypes.length > 0 ? (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          {availableChannelTypes.map((ct) => (
            <button
              key={ct.id}
              type="button"
              className="rounded-xl border px-3 py-3 text-left text-sm transition-token-normal hover:scale-[1.02] cursor-pointer"
              style={{
                borderColor: 'var(--app-border)',
                color: 'var(--app-text)',
                backgroundColor: 'var(--app-bg)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--app-active-border)';
                e.currentTarget.style.backgroundColor = 'var(--app-hover)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--app-border)';
                e.currentTarget.style.backgroundColor = 'var(--app-bg)';
              }}
              onClick={() => { onSelect(ct.id); onClose(); }}
            >
              <div className="font-medium">{ct.name}</div>
              <div className="mt-0.5 text-xs" style={{ color: 'var(--app-text-muted)' }}>{ct.id}</div>
            </button>
          ))}
        </div>
      ) : (
        /* 无可用渠道时的空状态 */
        <div className="py-4 text-center text-sm" style={{ color: 'var(--app-text-muted)' }}>
          {t('channels.noChannelsHint')}
        </div>
      )}
    </AppModal>
  );
};

export default AddChannelModal;
