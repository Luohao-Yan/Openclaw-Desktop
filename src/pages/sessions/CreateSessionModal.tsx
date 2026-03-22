/**
 * 新建会话弹窗组件
 * 使用 AppModal 统一弹窗结构
 */
import React from 'react';
import { MessageSquare } from 'lucide-react';
import AppButton from '../../components/AppButton';
import AppModal from '../../components/AppModal';
import type { TFunc } from './types';

interface CreateSessionModalProps {
  visible: boolean;
  onClose: () => void;
  agentName: string;
  onAgentNameChange: (value: string) => void;
  modelName: string;
  onModelNameChange: (value: string) => void;
  onCreate: () => void;
  creating: boolean;
  t: TFunc;
}

const CreateSessionModal: React.FC<CreateSessionModalProps> = ({
  visible, onClose,
  agentName, onAgentNameChange,
  modelName, onModelNameChange,
  onCreate, creating, t,
}) => {
  return (
    <AppModal
      open={visible}
      onClose={onClose}
      title={t('sessions.createTitle')}
      icon={<MessageSquare size={20} />}
      variant="info"
      disableClose={creating}
      footer={
        <>
          <AppButton variant="secondary" onClick={onClose} disabled={creating}>
            {t('sessions.cancel')}
          </AppButton>
          <AppButton
            variant="primary"
            onClick={onCreate}
            disabled={creating || !agentName.trim()}
          >
            {creating ? t('sessions.creating') : t('sessions.create')}
          </AppButton>
        </>
      }
    >
      <div className="space-y-4">
        {/* 智能体名称输入 */}
        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--app-text)' }}>
            {t('sessions.agentName')}
          </label>
          <input
            type="text"
            value={agentName}
            onChange={(e) => onAgentNameChange(e.target.value)}
            placeholder={t('sessions.agentNamePlaceholder')}
            className="w-full px-3 py-2 rounded-xl text-sm outline-none transition-all duration-200"
            style={{
              backgroundColor: 'var(--app-bg)',
              border: '1px solid var(--app-border)',
              color: 'var(--app-text)',
            }}
            autoFocus
            disabled={creating}
          />
        </div>

        {/* 模型名称输入（可选） */}
        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--app-text)' }}>
            {t('sessions.modelOptional')}
          </label>
          <input
            type="text"
            value={modelName}
            onChange={(e) => onModelNameChange(e.target.value)}
            placeholder={t('sessions.modelPlaceholder')}
            className="w-full px-3 py-2 rounded-xl text-sm outline-none transition-all duration-200"
            style={{
              backgroundColor: 'var(--app-bg)',
              border: '1px solid var(--app-border)',
              color: 'var(--app-text)',
            }}
            disabled={creating}
          />
          <p className="mt-1.5 text-xs" style={{ color: 'var(--app-text-muted)' }}>
            {t('sessions.modelHint')}
          </p>
        </div>
      </div>
    </AppModal>
  );
};

export default CreateSessionModal;
