/**
 * 新建会话弹窗组件
 * 输入智能体名称和可选模型，创建新的会话
 */
import React from 'react';
import { X } from 'lucide-react';
import type { TFunc } from './types';

interface CreateSessionModalProps {
  /** 是否显示弹窗 */
  visible: boolean;
  /** 关闭弹窗 */
  onClose: () => void;
  /** 智能体名称 */
  agentName: string;
  /** 智能体名称变更 */
  onAgentNameChange: (value: string) => void;
  /** 模型名称 */
  modelName: string;
  /** 模型名称变更 */
  onModelNameChange: (value: string) => void;
  /** 提交创建 */
  onCreate: () => void;
  /** 是否正在创建 */
  creating: boolean;
  /** 翻译函数 */
  t: TFunc;
}

/** 新建会话弹窗 */
const CreateSessionModal: React.FC<CreateSessionModalProps> = ({
  visible, onClose,
  agentName, onAgentNameChange,
  modelName, onModelNameChange,
  onCreate, creating, t,
}) => {
  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full max-w-md rounded-2xl border p-6 shadow-2xl"
        style={{ backgroundColor: 'var(--app-bg-elevated)', borderColor: 'var(--app-border)' }}>

        {/* 标题栏 */}
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold" style={{ color: 'var(--app-text)' }}>{t('sessions.createTitle')}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5 cursor-pointer"
            style={{ color: 'var(--app-text-muted)' }}>
            <X size={18} />
          </button>
        </div>

        {/* 智能体名称输入 */}
        <div className="mb-4">
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--app-text)' }}>
            {t('sessions.agentName')}
          </label>
          <input type="text" value={agentName} onChange={(e) => onAgentNameChange(e.target.value)}
            placeholder={t('sessions.agentNamePlaceholder')}
            className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/50"
            style={{ backgroundColor: 'var(--app-bg)', border: '1px solid var(--app-border)', color: 'var(--app-text)' }} />
        </div>

        {/* 模型名称输入（可选） */}
        <div className="mb-6">
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--app-text)' }}>
            {t('sessions.modelOptional')}
          </label>
          <input type="text" value={modelName} onChange={(e) => onModelNameChange(e.target.value)}
            placeholder={t('sessions.modelPlaceholder')}
            className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/50"
            style={{ backgroundColor: 'var(--app-bg)', border: '1px solid var(--app-border)', color: 'var(--app-text)' }} />
          <p className="mt-1 text-xs" style={{ color: 'var(--app-text-muted)' }}>{t('sessions.modelHint')}</p>
        </div>

        {/* 操作按钮 */}
        <div className="flex justify-end gap-3">
          <button onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm transition-colors cursor-pointer"
            style={{ backgroundColor: 'var(--app-bg)', border: '1px solid var(--app-border)', color: 'var(--app-text)' }}>
            {t('sessions.cancel')}
          </button>
          <button onClick={onCreate} disabled={creating || !agentName.trim()}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:scale-105 active:scale-95"
            style={{ background: 'linear-gradient(135deg, #00B4FF 0%, #22C55E 100%)', color: 'white', boxShadow: '0 4px 12px rgba(0,180,255,0.25)' }}>
            {creating ? t('sessions.creating') : t('sessions.create')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateSessionModal;
