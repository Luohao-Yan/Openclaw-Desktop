// ============================================================================
// SetupChannelsPage — 渠道配置页面（多账户版）
// 路由: /setup/local/channels
// 位于配置确认之后、创建 Agent 之前
// 支持同一 provider 下添加多个账户实例，每个账户有独立的 accountId 和凭证字段
// @see 需求 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 2.2, 2.3
// ============================================================================

import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronRight,
  Loader2,
  Plus,
  SkipForward,
  Trash2,
  XCircle,
} from 'lucide-react';
import AppButton from '../../components/AppButton';
import SetupLayout from '../../components/setup/SetupLayout';
import { useSetupFlow } from '../../contexts/SetupFlowContext';
import type { ChannelConfig } from '../../types/setup';
import {
  getAccountFields,
  getChannelGuide,
  validateAccountId,
} from '../../config/channelAccountFields';
import type { ChannelAccountInstance } from '../../contexts/setupActions';

// ============================================================================
// 渠道图标颜色映射
// ============================================================================

/** 渠道图标颜色映射（key 与 SUPPORTED_CHANNEL_TYPES 一致） */
const channelColors: Record<string, string> = {
  telegram: '#26A5E4',
  whatsapp: '#25D366',
  discord: '#5865F2',
  signal: '#3A76F0',
  slack: '#E01E5A',
  bluebubbles: '#34C759',
  imessage: '#5AC8FA',
  googlechat: '#00AC47',
  irc: '#8B8B8B',
  webchat: '#FF6B35',
  feishu: '#3370FF',
  line: '#06C755',
  matrix: '#0DBD8B',
  mattermost: '#0058CC',
  msteams: '#6264A7',
  nextcloudtalk: '#0082C9',
  nostr: '#8B5CF6',
  synologychat: '#B5B5B6',
  tlon: '#1A1A1A',
  twitch: '#9146FF',
  zalo: '#0068FF',
  zalopersonal: '#0068FF',
};

// ============================================================================
// 子组件
// ============================================================================

/** 底部操作栏组件 */
const SetupActionBar: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="mt-6 flex flex-wrap items-center gap-3">
    {children}
  </div>
);

/** 渠道开关组件 — 开启绿色/关闭灰色，带文字标签 */
const ChannelToggle: React.FC<{
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}> = ({ enabled, onChange }) => (
  <button
    type="button"
    role="switch"
    aria-checked={enabled}
    onClick={() => onChange(!enabled)}
    className="relative inline-flex h-7 w-14 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2"
    style={{
      backgroundColor: enabled ? '#22c55e' : '#d1d5db',
      outlineColor: enabled ? '#16a34a' : '#9ca3af',
    }}
  >
    <span
      className="absolute text-[10px] font-semibold select-none"
      style={{
        color: '#fff',
        left: enabled ? '6px' : undefined,
        right: enabled ? undefined : '6px',
      }}
    >
      {enabled ? 'ON' : 'OFF'}
    </span>
    <span
      className="pointer-events-none inline-block h-5 w-5 rounded-full shadow-md transition-transform duration-200"
      style={{
        backgroundColor: '#fff',
        marginLeft: '3px',
        transform: enabled ? 'translateX(28px)' : 'translateX(0)',
      }}
    />
  </button>
);

// ============================================================================
// 账户表单组件 — 单个账户实例的配置表单
// ============================================================================

/** 单个账户实例的配置表单 */
const AccountForm: React.FC<{
  /** 渠道 provider key */
  provider: string;
  /** 账户实例数据 */
  account: ChannelAccountInstance;
  /** 同 provider 下所有已有的 accountId（用于唯一性校验） */
  existingIds: string[];
  /** 是否可删除（列表长度 > 1 时可删除） */
  canDelete: boolean;
  /** 账户序号（从 1 开始） */
  index: number;
  /** 更新账户字段值 */
  onFieldChange: (accountId: string, fieldId: string, value: string) => void;
  /** 更新 accountId */
  onAccountIdChange: (oldAccountId: string, newAccountId: string) => void;
  /** 删除账户 */
  onDelete: (accountId: string) => void;
}> = ({ provider, account, existingIds, canDelete, index, onFieldChange, onAccountIdChange, onDelete }) => {
  /** 获取该渠道的账户配置字段定义（排除 accountId，单独渲染） */
  const accountFields = React.useMemo(
    () => getAccountFields(provider).filter((f) => f.id !== 'accountId'),
    [provider],
  );

  /** accountId 校验结果 */
  const accountIdValidation = React.useMemo(
    () => {
      if (!account.accountId) return { valid: true }; // 空值不显示错误（等用户输入）
      // 排除自身 accountId 后校验唯一性
      const otherIds = existingIds.filter((id) => id !== account.accountId);
      return validateAccountId(account.accountId, otherIds);
    },
    [account.accountId, existingIds],
  );

  /** 获取平台配置指导 */
  const guide = React.useMemo(() => getChannelGuide(provider), [provider]);

  return (
    <div
      className="rounded-xl border p-4 space-y-3"
      style={{
        backgroundColor: 'var(--app-bg)',
        borderColor: 'var(--app-border)',
      }}
    >
      {/* 账户标题行 */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium" style={{ color: 'var(--app-text-muted)' }}>
          账户 #{index}
        </span>
        {canDelete && (
          <button
            type="button"
            onClick={() => onDelete(account.accountId)}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors hover:bg-red-50"
            style={{ color: '#ef4444' }}
            aria-label={`删除账户 ${account.accountId || index}`}
          >
            <Trash2 size={12} />
            删除
          </button>
        )}
      </div>

      {/* accountId 输入字段 */}
      <div>
        <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--app-text-muted)' }}>
          账户 ID <span style={{ color: '#ef4444' }}>*</span>
        </label>
        <input
          type="text"
          value={account.accountId}
          onChange={(e) => onAccountIdChange(account.accountId, e.target.value)}
          placeholder="例如 my-bot（仅允许字母、数字、连字符、下划线）"
          className="w-full rounded-xl border px-3 py-2 text-sm outline-none transition-colors duration-200 focus:ring-2"
          style={{
            backgroundColor: 'var(--app-bg)',
            borderColor: accountIdValidation.valid ? 'var(--app-border)' : '#ef4444',
            color: 'var(--app-text)',
          }}
        />
        {/* accountId 校验错误提示 */}
        {!accountIdValidation.valid && accountIdValidation.error && (
          <p className="mt-1 text-xs" style={{ color: '#ef4444' }}>
            {accountIdValidation.error}
          </p>
        )}
      </div>

      {/* 渠道凭证字段 */}
      {accountFields.map((field) => (
        <div key={field.id}>
          <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--app-text-muted)' }}>
            {field.label}
            {field.required && <span style={{ color: '#ef4444' }}> *</span>}
            {/* 飞书 botName 推荐填写提示 */}
            {field.id === 'botName' && (
              <span className="ml-1 text-[10px]" style={{ color: 'var(--app-text-muted)' }}>
                （推荐填写，用于绑定页面显示）
              </span>
            )}
          </label>
          {field.type === 'select' && field.options ? (
            <select
              value={account.fieldValues[field.id] || field.defaultValue || ''}
              onChange={(e) => onFieldChange(account.accountId, field.id, e.target.value)}
              className="w-full rounded-xl border px-3 py-2 text-sm outline-none transition-colors duration-200 focus:ring-2"
              style={{
                backgroundColor: 'var(--app-bg)',
                borderColor: 'var(--app-border)',
                color: 'var(--app-text)',
              }}
            >
              {field.options.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          ) : (
            <input
              type={field.type === 'password' ? 'password' : 'text'}
              value={account.fieldValues[field.id] || ''}
              onChange={(e) => onFieldChange(account.accountId, field.id, e.target.value)}
              placeholder={field.placeholder}
              className="w-full rounded-xl border px-3 py-2 text-sm outline-none transition-colors duration-200 focus:ring-2"
              style={{
                backgroundColor: 'var(--app-bg)',
                borderColor: 'var(--app-border)',
                color: 'var(--app-text)',
              }}
            />
          )}
        </div>
      ))}

      {/* 平台配置指导链接 */}
      {guide && (
        <div
          className="rounded-lg px-3 py-2 text-xs"
          style={{ backgroundColor: 'var(--app-bg-subtle, rgba(0,0,0,0.03))', color: 'var(--app-text-muted)' }}
        >
          📖 {guide.url ? (
            <a href={guide.url} target="_blank" rel="noopener noreferrer" className="underline">
              {guide.title}
            </a>
          ) : guide.title}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// 渠道 Provider 卡片组件 — 包含开关 + 多账户表单
// ============================================================================

/** 单个渠道 Provider 卡片 */
const ProviderCard: React.FC<{
  config: ChannelConfig;
  /** 该 provider 下的账户实例列表 */
  accounts: ChannelAccountInstance[];
  /** 切换 provider 启用/禁用 */
  onToggle: (enabled: boolean) => void;
  /** 添加新账户 */
  onAddAccount: () => void;
  /** 更新账户字段值 */
  onFieldChange: (accountId: string, fieldId: string, value: string) => void;
  /** 更新 accountId */
  onAccountIdChange: (oldAccountId: string, newAccountId: string) => void;
  /** 删除账户 */
  onDeleteAccount: (accountId: string) => void;
}> = ({ config, accounts, onToggle, onAddAccount, onFieldChange, onAccountIdChange, onDeleteAccount }) => {
  const accentColor = channelColors[config.key] || 'var(--app-active-text)';
  /** 所有已有的 accountId 列表（用于唯一性校验） */
  const existingIds = React.useMemo(
    () => accounts.map((a) => a.accountId),
    [accounts],
  );

  return (
    <div
      className={`rounded-2xl border transition-all duration-200`}
      style={{
        backgroundColor: 'var(--app-bg)',
        borderColor: config.enabled ? accentColor : 'var(--app-border)',
        boxShadow: config.enabled ? `0 0 0 1px ${accentColor}22` : 'none',
      }}
    >
      {/* Provider 标题行：名称 + 开关 */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <div
            className="h-3 w-3 rounded-full"
            style={{ backgroundColor: accentColor }}
          />
          <div>
            <div className="text-sm font-semibold">{config.label}</div>
            {!config.enabled && (
              <div className="mt-0.5 text-xs" style={{ color: 'var(--app-text-muted)' }}>
                {config.hint}
              </div>
            )}
          </div>
        </div>
        <ChannelToggle enabled={config.enabled} onChange={onToggle} />
      </div>

      {/* 启用后展开的多账户配置区域 */}
      {config.enabled && (
        <div
          className="border-t px-4 pb-4 pt-3 space-y-3"
          style={{ borderColor: 'var(--app-border)' }}
        >
          {/* 账户列表 */}
          {accounts.map((account, idx) => (
            <AccountForm
              key={account._stableKey || `new-${idx}`}
              provider={config.key}
              account={account}
              existingIds={existingIds}
              canDelete={accounts.length > 1}
              index={idx + 1}
              onFieldChange={onFieldChange}
              onAccountIdChange={onAccountIdChange}
              onDelete={onDeleteAccount}
            />
          ))}

          {/* 添加账户按钮 */}
          <button
            type="button"
            onClick={onAddAccount}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed px-3 py-2.5 text-xs font-medium transition-colors hover:border-solid"
            style={{
              borderColor: 'var(--app-border)',
              color: 'var(--app-text-muted)',
            }}
          >
            <Plus size={14} />
            添加账户
          </button>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// 添加结果展示组件
// ============================================================================

/** 渠道添加结果摘要 */
const AddResultsSummary: React.FC<{
  results: Array<{ channelKey: string; channelLabel: string; success: boolean; error?: string; accountId?: string }>;
}> = ({ results }) => {
  if (results.length === 0) return null;

  const successCount = results.filter((r) => r.success).length;
  const failCount = results.length - successCount;

  return (
    <div className="mt-4 space-y-2">
      {/* 总结 */}
      <div
        className="rounded-xl px-4 py-2.5 text-xs"
        style={{ backgroundColor: 'var(--app-bg)', color: 'var(--app-text-muted)' }}
      >
        添加完成：{successCount} 个成功{failCount > 0 ? `，${failCount} 个失败` : ''}
      </div>

      {/* 失败详情 */}
      {results.filter((r) => !r.success).map((r, i) => (
        <div
          key={`${r.channelKey}-${r.accountId || i}`}
          className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs"
          style={{ backgroundColor: 'rgba(239, 68, 68, 0.08)', color: '#ef4444' }}
        >
          <XCircle size={13} className="mt-0.5 shrink-0" />
          <span>
            {r.channelLabel}{r.accountId ? ` (${r.accountId})` : ''}: {r.error || '添加失败'}
          </span>
        </div>
      ))}
    </div>
  );
};

// ============================================================================
// 主页面组件
// ============================================================================

/**
 * 渠道配置页面组件（多账户版）
 *
 * 功能：
 * - 显示所有支持的渠道 provider，允许启用/禁用
 * - 启用 provider 后自动创建一个默认账户实例
 * - 支持为同一 provider 添加多个账户（"添加账户"按钮）
 * - 每个账户有独立的 accountId 输入 + 凭证字段
 * - accountId 实时校验（格式 + 同 provider 唯一性）
 * - 支持删除账户（至少保留一个）
 * - "继续"按钮按 account 维度调用 CLI 添加渠道
 */
export const SetupChannelsPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    channelConfigs,
    updateChannelConfig,
    saveChannelConfigs,
    addEnabledChannels,
    channelAddResults,
    channelAccounts,
    dispatch,
    isBusy,
  } = useSetupFlow();

  /** 是否正在执行 CLI 添加渠道 */
  const [isAdding, setIsAdding] = React.useState(false);

  /** 按钮禁用状态 */
  const buttonsDisabled = isBusy || isAdding;

  // ── Provider 启用/禁用切换 ──────────────────────────────────────────────
  /** 切换 provider 启用状态，启用时自动创建默认账户 */
  const handleToggle = React.useCallback((key: string, enabled: boolean) => {
    updateChannelConfig(key, {
      enabled,
      ...(!enabled ? { testStatus: 'idle' as const, testError: undefined } : {}),
    });

    if (enabled) {
      // 启用时：如果该 provider 还没有账户，自动创建一个默认账户
      const existing = channelAccounts[key] || [];
      if (existing.length === 0) {
        dispatch({
          type: 'ADD_CHANNEL_ACCOUNT',
          payload: {
            provider: key,
            account: { _stableKey: crypto.randomUUID(), accountId: 'default', fieldValues: {} },
          },
        });
      }
    }
  }, [updateChannelConfig, channelAccounts, dispatch]);

  // ── 账户管理操作 ──────────────────────────────────────────────────────────
  /** 添加新账户到指定 provider */
  const handleAddAccount = React.useCallback((provider: string) => {
    const existing = channelAccounts[provider] || [];
    // 生成唯一的默认 accountId
    let suffix = existing.length + 1;
    let newId = `account-${suffix}`;
    const existingIds = existing.map((a) => a.accountId);
    while (existingIds.includes(newId)) {
      suffix++;
      newId = `account-${suffix}`;
    }
    dispatch({
      type: 'ADD_CHANNEL_ACCOUNT',
      payload: {
        provider,
        account: { _stableKey: crypto.randomUUID(), accountId: newId, fieldValues: {} },
      },
    });
  }, [channelAccounts, dispatch]);

  /** 更新账户字段值 */
  const handleFieldChange = React.useCallback((provider: string, accountId: string, fieldId: string, value: string) => {
    dispatch({
      type: 'UPDATE_CHANNEL_ACCOUNT',
      payload: {
        provider,
        accountId,
        updates: {
          fieldValues: {
            ...(channelAccounts[provider]?.find((a) => a.accountId === accountId)?.fieldValues || {}),
            [fieldId]: value,
          },
        },
      },
    });
  }, [channelAccounts, dispatch]);

  /** 更新 accountId（需要先删除旧的再添加新的，或直接更新） */
  const handleAccountIdChange = React.useCallback((provider: string, oldAccountId: string, newAccountId: string) => {
    dispatch({
      type: 'UPDATE_CHANNEL_ACCOUNT',
      payload: {
        provider,
        accountId: oldAccountId,
        updates: { accountId: newAccountId },
      },
    });
  }, [dispatch]);

  /** 删除账户 */
  const handleDeleteAccount = React.useCallback((provider: string, accountId: string) => {
    dispatch({
      type: 'REMOVE_CHANNEL_ACCOUNT',
      payload: { provider, accountId },
    });
  }, [dispatch]);

  // ── 页面操作 ──────────────────────────────────────────────────────────────
  /** 跳过渠道配置 */
  const handleSkip = async () => {
    await saveChannelConfigs();
    navigate('/setup/local/create-agent');
  };

  /** 已启用的渠道数量 */
  const enabledCount = channelConfigs.filter((ch) => ch.enabled).length;
  /** 总账户数量 */
  const totalAccountCount = Object.values(channelAccounts).reduce(
    (sum, list) => sum + list.length, 0,
  );

  /** 是否已完成渠道添加操作（用于控制"继续"按钮行为） */
  const [addCompleted, setAddCompleted] = React.useState(false);

  /** 执行 CLI 添加已启用渠道（按 account 维度） */
  const handleContinue = async () => {
    // 如果已完成添加操作，用户查看结果后再次点击"继续"，直接导航到下一步
    if (addCompleted) {
      navigate('/setup/local/create-agent');
      return;
    }

    // 没有启用任何渠道时，直接导航
    if (enabledCount === 0) {
      await saveChannelConfigs();
      navigate('/setup/local/create-agent');
      return;
    }

    setIsAdding(true);
    try {
      await addEnabledChannels();
      await saveChannelConfigs();
      // 标记添加完成，停留在当前页面展示结果摘要
      // 用户查看 AddResultsSummary 后再次点击"继续"即可导航
      setAddCompleted(true);
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <SetupLayout
      title="渠道配置"
      description="配置消息渠道连接，让 OpenClaw 能够接收和发送消息。每个渠道可添加多个账户。你可以稍后在设置中修改。"
      stepLabel="渠道配置"
      footer={
        <div className="flex flex-wrap items-center gap-3">
          <AppButton
            variant="secondary"
            onClick={() => void handleSkip()}
            disabled={buttonsDisabled}
            icon={<SkipForward size={14} />}
          >
            跳过
          </AppButton>
          <AppButton
            variant="primary"
            onClick={() => void handleContinue()}
            disabled={buttonsDisabled}
            icon={isAdding
              ? <Loader2 size={15} className="animate-spin" />
              : <ChevronRight size={15} />
            }
          >
            {isAdding ? '添加中…' : '继续'}
          </AppButton>
        </div>
      }
    >
      {/* 渠道 Provider 列表 */}
      {/* 渠道列表 — 自然高度，不限制内部滚动，由外层 SetupLayout 统一滚动 */}
      <div className="space-y-3">
        {channelConfigs.map((config) => (
          <ProviderCard
            key={config.key}
            config={config}
            accounts={channelAccounts[config.key] || []}
            onToggle={(enabled) => handleToggle(config.key, enabled)}
            onAddAccount={() => handleAddAccount(config.key)}
            onFieldChange={(accountId, fieldId, value) =>
              handleFieldChange(config.key, accountId, fieldId, value)
            }
            onAccountIdChange={(oldId, newId) =>
              handleAccountIdChange(config.key, oldId, newId)
            }
            onDeleteAccount={(accountId) =>
              handleDeleteAccount(config.key, accountId)
            }
          />
        ))}
      </div>

      {/* 已启用渠道计数提示 */}
      {enabledCount > 0 && (
        <div
          className="mt-4 rounded-xl px-4 py-2.5 text-xs"
          style={{ backgroundColor: 'var(--app-bg)', color: 'var(--app-text-muted)' }}
        >
          已启用 {enabledCount} 个渠道，共 {totalAccountCount} 个账户。
        </div>
      )}

      {/* CLI 添加结果摘要 */}
      <AddResultsSummary results={channelAddResults} />

    </SetupLayout>
  );
};

export default SetupChannelsPage;
