/**
 * 渠道配置 Modal 弹窗
 * 三段式布局：固定顶部（渠道名称 + Tab）、可滚动中间内容区、固定底部操作栏
 * 内部管理 activeTab 和 selectedAccountId 状态
 * 复用 SettingsChannels 中已有的 FeishuChannelForm / FeishuAccountForm / GenericChannelJsonEditor / GenericAccountJsonEditor
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Bot, Loader2, Plus, Save, Trash2, X, RotateCcw } from 'lucide-react';
import AppButton from '../../components/AppButton';
import { useI18n } from '../../i18n/I18nContext';
import { getChannelBindingCount, SUPPORTED_CHANNEL_TYPES } from '../../utils/channelOps';
import AddAccountModal from './AddAccountModal';

// ── 类型定义（与 SettingsChannels 保持一致） ──────────────────────────────
/** 完整配置结构 */
interface OpenClawConfig {
  agents?: { list?: any[] };
  bindings?: any[];
  channels?: Record<string, any>;
  plugins?: { entries?: Record<string, { enabled?: boolean }> };
}

/** 组件 Props */
interface ChannelConfigModalProps {
  /** 当前打开的渠道类型，null 表示关闭 */
  channelType: string | null;
  /** 关闭 Modal 回调 */
  onClose: () => void;
  /** 完整的 draft 配置对象 */
  draft: OpenClawConfig;
  /** 通用草稿更新器 */
  updateDraft: (updater: (current: OpenClawConfig) => OpenClawConfig) => void;
  /** 保存配置回调 */
  onSave: () => Promise<void>;
  /** 重置草稿回调 */
  onReset: () => void;
  /** 是否正在保存 */
  isSaving: boolean;
  /** Feishu 渠道配置更新器 */
  updateFeishuConfig: (updates: Record<string, any>) => void;
  /** Feishu 账号配置更新器 */
  updateFeishuAccount: (accountId: string, updates: Record<string, any>) => void;
  /** 渠道顶层 JSON 保存 */
  onSaveChannelJson: (channelType: string, jsonStr: string) => void;
  /** 账号 JSON 保存 */
  onSaveAccountJson: (accountId: string, jsonStr: string) => void;
  /** 添加账号回调 */
  onAddAccount: (accountId: string) => void;
  /** 删除账号回调 */
  onDeleteAccount: (accountId: string) => void;
  /** Feishu 渠道表单组件 */
  FeishuChannelForm: React.FC<{ config: any; onUpdate: (updates: any) => void }>;
  /** Feishu 账号表单组件 */
  FeishuAccountForm: React.FC<{ accountId: string; account: any; onUpdate: (updates: any) => void }>;
  /** 通用渠道 JSON 编辑器组件 */
  GenericChannelJsonEditor: React.FC<{ channelType: string; channelConfig: any; onSave: (jsonStr: string) => void }>;
  /** 通用账号 JSON 编辑器组件 */
  GenericAccountJsonEditor: React.FC<{ accountId: string; accountConfig: any; onSave: (jsonStr: string) => void }>;
}

/** Tab 类型 */
type ConfigTab = 'config' | 'accounts';

const ChannelConfigModal: React.FC<ChannelConfigModalProps> = ({
  channelType,
  onClose,
  draft,
  updateDraft: _updateDraft,
  onSave,
  onReset,
  isSaving,
  updateFeishuConfig,
  updateFeishuAccount,
  onSaveChannelJson,
  onSaveAccountJson,
  onAddAccount,
  onDeleteAccount,
  FeishuChannelForm,
  FeishuAccountForm,
  GenericChannelJsonEditor,
  GenericAccountJsonEditor,
}) => {
  const { t } = useI18n();

  // ── 内部状态 ──────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<ConfigTab>('config');
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [showAddAccountModal, setShowAddAccountModal] = useState(false);

  // 打开时重置 Tab 和选中账号
  useEffect(() => {
    if (channelType) {
      setActiveTab('config');
      const acctIds = Object.keys(draft?.channels?.[channelType]?.accounts || {});
      setSelectedAccountId(acctIds[0] || '');
    }
  }, [channelType]);

  // Escape 键关闭（仅在 AddAccountModal 未打开时）
  useEffect(() => {
    if (!channelType || showAddAccountModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [channelType, onClose, showAddAccountModal]);

  // ── 派生数据 ──────────────────────────────────────────────────────────
  const channelConfig = channelType ? (draft?.channels?.[channelType] || {}) : {};
  const isEnabled = channelConfig.enabled === true;
  const typeDef = SUPPORTED_CHANNEL_TYPES.find((ct) => ct.id === channelType);
  const channelName = typeDef?.name || channelType || '';

  /** 当前渠道下的账号 ID 列表 */
  const accountIds = useMemo(() => {
    if (!channelType) return [];
    return Object.keys(draft?.channels?.[channelType]?.accounts || {});
  }, [draft, channelType]);

  /** 当前选中账号的配置 */
  const selectedAccountConfig = useMemo(() => {
    if (!channelType || !selectedAccountId) return undefined;
    return draft?.channels?.[channelType]?.accounts?.[selectedAccountId];
  }, [draft, channelType, selectedAccountId]);

  if (!channelType) return null;

  /** 处理添加账号确认 */
  const handleAddAccountConfirm = (accountId: string) => {
    onAddAccount(accountId);
    setSelectedAccountId(accountId);
    setShowAddAccountModal(false);
  };

  /** 处理删除账号 */
  const handleDeleteAccount = (accountId: string) => {
    const msg = t('channels.modal.deleteAccountConfirm').replace('{id}', accountId);
    if (!window.confirm(msg)) return;
    onDeleteAccount(accountId);
    // 删除后选中下一个账号
    const remaining = accountIds.filter((id) => id !== accountId);
    setSelectedAccountId(remaining[0] || '');
  };

  /** Tab 按钮样式 */
  const tabStyle = (tab: ConfigTab) => ({
    backgroundColor: activeTab === tab ? 'var(--app-selected-card-bg)' : 'transparent',
    borderColor: activeTab === tab ? 'var(--app-selected-card-border)' : 'transparent',
    color: activeTab === tab ? 'var(--app-text)' : 'var(--app-text-muted)',
  });

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      onClick={onClose}
    >
      {/* 半透明遮罩 */}
      <div className="absolute inset-0 bg-black/40" />

      {/* 弹窗主体：三段式布局 */}
      <div
        className="relative flex w-full max-w-[960px] flex-col rounded-3xl border shadow-2xl animate-[fadeInDown_0.2s_ease-out]"
        style={{
          backgroundColor: 'var(--app-bg-elevated)',
          borderColor: 'var(--app-border)',
          maxHeight: '90vh',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── 固定顶部：渠道名称 + 启用状态 + Tab ──────────────────── */}
        <div className="shrink-0 border-b px-6 pt-5 pb-0" style={{ borderColor: 'var(--app-border)' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-semibold" style={{ color: 'var(--app-text)' }}>
                {channelName}
              </h3>
              <span
                className="rounded-full px-2 py-0.5 text-xs"
                style={{
                  backgroundColor: isEnabled ? 'rgba(34, 197, 94, 0.15)' : 'rgba(156, 163, 175, 0.15)',
                  color: isEnabled ? '#22C55E' : 'var(--app-text-muted)',
                }}
              >
                {isEnabled ? t('channels.channelEnabled') : t('channels.channelDisabled')}
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl p-1.5 transition-colors hover:opacity-70"
              style={{ color: 'var(--app-text-muted)' }}
            >
              <X size={18} />
            </button>
          </div>

          {/* Config_Tab 分段标签 */}
          <div className="mt-4 flex gap-1 pb-0">
            <button
              type="button"
              className="rounded-t-xl border border-b-0 px-4 py-2 text-sm font-medium transition-all"
              style={tabStyle('config')}
              onClick={() => setActiveTab('config')}
            >
              {t('channels.modal.baseConfig')}
            </button>
            <button
              type="button"
              className="rounded-t-xl border border-b-0 px-4 py-2 text-sm font-medium transition-all"
              style={tabStyle('accounts')}
              onClick={() => setActiveTab('accounts')}
            >
              {t('channels.modal.accountManagement')}
              {accountIds.length > 0 ? (
                <span className="ml-1.5 text-xs" style={{ color: 'var(--app-text-muted)' }}>
                  ({accountIds.length})
                </span>
              ) : null}
            </button>
          </div>
        </div>

        {/* ── 可滚动中间内容区 ──────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* 基础配置 Tab */}
          {activeTab === 'config' ? (
            <div>
              {channelType === 'feishu' ? (
                <FeishuChannelForm
                  config={channelConfig}
                  onUpdate={updateFeishuConfig}
                />
              ) : (
                <GenericChannelJsonEditor
                  channelType={channelType}
                  channelConfig={channelConfig}
                  onSave={(jsonStr) => onSaveChannelJson(channelType, jsonStr)}
                />
              )}
            </div>
          ) : null}

          {/* 账号管理 Tab */}
          {activeTab === 'accounts' ? (
            <div>
              {/* 账号列表头部 + 添加按钮 */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bot size={18} style={{ color: 'var(--app-text)' }} />
                  <span className="text-sm font-semibold" style={{ color: 'var(--app-text)' }}>
                    {t('channels.accounts')}
                  </span>
                </div>
                <AppButton
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowAddAccountModal(true)}
                  icon={<Plus size={14} />}
                >
                  {t('channels.modal.addAccount')}
                </AppButton>
              </div>

              {/* 账号标签列表 */}
              {accountIds.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {accountIds.map((acctId) => (
                    <div key={acctId} className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setSelectedAccountId(acctId)}
                        className="rounded-2xl border px-4 py-2 text-sm font-medium transition-all"
                        style={
                          selectedAccountId === acctId
                            ? { background: 'var(--app-selected-card-bg)', borderColor: 'var(--app-selected-card-border)', color: 'var(--app-text)' }
                            : { backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)', color: 'var(--app-text-muted)' }
                        }
                      >
                        {acctId}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteAccount(acctId)}
                        className="rounded-lg p-1 transition-colors hover:opacity-70"
                        style={{ color: 'var(--app-text-muted)' }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                /* 无账号空状态 */
                <div className="mt-6 rounded-2xl border px-4 py-8 text-center" style={{ borderColor: 'var(--app-border)' }}>
                  <div className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
                    {t('channels.modal.noAccounts')}
                  </div>
                  <div className="mt-1 text-xs" style={{ color: 'var(--app-text-muted)' }}>
                    {t('channels.modal.noAccountsHint')}
                  </div>
                </div>
              )}

              {/* 选中账号的编辑表单 */}
              {selectedAccountId && selectedAccountConfig ? (
                <div className="mt-5">
                  {channelType === 'feishu' ? (
                    <FeishuAccountForm
                      accountId={selectedAccountId}
                      account={selectedAccountConfig}
                      onUpdate={(updates) => updateFeishuAccount(selectedAccountId, updates)}
                    />
                  ) : (
                    <GenericAccountJsonEditor
                      accountId={selectedAccountId}
                      accountConfig={selectedAccountConfig}
                      onSave={(jsonStr) => onSaveAccountJson(selectedAccountId, jsonStr)}
                    />
                  )}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* ── 固定底部操作栏 ──────────────────────────────────────── */}
        <div
          className="shrink-0 flex items-center justify-end gap-3 border-t px-6 py-4"
          style={{ borderColor: 'var(--app-border)' }}
        >
          <AppButton variant="secondary" size="sm" onClick={onReset} icon={<RotateCcw size={14} />}>
            {t('channels.modal.reset')}
          </AppButton>
          <AppButton
            variant="primary"
            size="sm"
            onClick={() => void onSave()}
            disabled={isSaving}
            icon={isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          >
            {isSaving ? t('saving') : t('channels.modal.save')}
          </AppButton>
        </div>
      </div>

      {/* 添加账号子 Modal */}
      <AddAccountModal
        open={showAddAccountModal}
        onClose={() => setShowAddAccountModal(false)}
        channelType={channelType}
        existingAccountIds={accountIds}
        onConfirm={handleAddAccountConfirm}
      />
    </div>
  );
};

export default ChannelConfigModal;
