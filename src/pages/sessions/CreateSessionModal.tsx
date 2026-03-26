/**
 * 新建会话弹窗组件
 * 支持从已有 agent 列表和模型列表中选择，也支持手动输入
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
  /** 可选：已有 agent 列表，用于下拉选择 */
  agents?: { id: string; name: string }[];
  /** 可选：可用模型列表，用于下拉选择 */
  models?: { label: string; value: string }[];
}

const CreateSessionModal: React.FC<CreateSessionModalProps> = ({
  visible, onClose,
  agentName, onAgentNameChange,
  modelName, onModelNameChange,
  onCreate, creating, t,
  agents = [],
  models = [],
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
        {/* 智能体选择 */}
        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--app-text)' }}>
            {t('sessions.agentName')}
          </label>
          {agents.length > 0 ? (
            /* 有 agent 列表时显示下拉选择 */
            <select
              value={agentName}
              onChange={(e) => onAgentNameChange(e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-sm outline-none transition-token-normal"
              style={{
                backgroundColor: 'var(--app-bg)',
                border: '1px solid var(--app-border)',
                color: 'var(--app-text)',
              }}
              autoFocus
              disabled={creating}
            >
              <option value="">{t('sessions.agentNamePlaceholder')}</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>{a.name} ({a.id})</option>
              ))}
            </select>
          ) : (
            /* 无 agent 列表时回退为手动输入 */
            <input
              type="text"
              value={agentName}
              onChange={(e) => onAgentNameChange(e.target.value)}
              placeholder={t('sessions.agentNamePlaceholder')}
              className="w-full px-3 py-2 rounded-xl text-sm outline-none transition-token-normal"
              style={{
                backgroundColor: 'var(--app-bg)',
                border: '1px solid var(--app-border)',
                color: 'var(--app-text)',
              }}
              autoFocus
              disabled={creating}
            />
          )}
        </div>

        {/* 模型选择（可选） */}
        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--app-text)' }}>
            {t('sessions.modelOptional')}
          </label>
          {models.length > 0 ? (
            /* 有模型列表时显示下拉选择 */
            <select
              value={modelName}
              onChange={(e) => onModelNameChange(e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-sm outline-none transition-token-normal"
              style={{
                backgroundColor: 'var(--app-bg)',
                border: '1px solid var(--app-border)',
                color: 'var(--app-text)',
              }}
              disabled={creating}
            >
              <option value="">{t('sessions.modelPlaceholder')}</option>
              {models.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          ) : (
            /* 无模型列表时回退为手动输入 */
            <input
              type="text"
              value={modelName}
              onChange={(e) => onModelNameChange(e.target.value)}
              placeholder={t('sessions.modelPlaceholder')}
              className="w-full px-3 py-2 rounded-xl text-sm outline-none transition-token-normal"
              style={{
                backgroundColor: 'var(--app-bg)',
                border: '1px solid var(--app-border)',
                color: 'var(--app-text)',
              }}
              disabled={creating}
            />
          )}
          <p className="mt-1.5 text-xs" style={{ color: 'var(--app-text-muted)' }}>
            {t('sessions.modelHint')}
          </p>
        </div>
      </div>
    </AppModal>
  );
};

export default CreateSessionModal;
