/**
 * 群消息配置组件（GroupMessagesConfig）
 * 管理群消息处理策略：全局开关、触发条件、渠道级覆盖
 * - 全局开关：启用/禁用群消息处理
 * - 触发条件：requireMention、keywords、prefix
 * - 渠道覆盖：为不同渠道设置独立的群消息策略
 * - 所有变更通过 onSave 回调持久化到 openclaw.json
 */
import React, { useState } from 'react';
import { Plus, Trash2, MessageSquare } from 'lucide-react';
import AppButton from '../../components/AppButton';
import GlassCard from '../../components/GlassCard';
import { useI18n } from '../../i18n/I18nContext';
import {
  updateGroupMessagesConfig,
  updateGroupMessagesOverride,
  validateKeywords,
} from '../../utils/channelOps';
import type { GroupMessagesOverride } from '../../utils/channelOps';

// ============================================================
// 组件属性接口
// ============================================================

interface GroupMessagesConfigProps {
  /** 完整的 OpenClaw 配置对象 */
  config: any;
  /** 已配置的渠道类型列表，用于覆盖选择 */
  configuredChannels: string[];
  /** 保存回调，将更新后的配置持久化 */
  onSave: (updatedConfig: any) => Promise<void>;
}

// ============================================================
// GroupMessagesConfig 组件
// ============================================================

const GroupMessagesConfig: React.FC<GroupMessagesConfigProps> = ({
  config,
  configuredChannels,
  onSave,
}) => {
  const { t } = useI18n();

  // ── 关键词验证错误状态 ──────────────────────────────────
  const [keywordError, setKeywordError] = useState('');
  /** 正在添加覆盖的渠道选择器是否可见 */
  const [showAddOverride, setShowAddOverride] = useState(false);
  /** 覆盖项的关键词验证错误（按渠道类型） */
  const [overrideKeywordErrors, setOverrideKeywordErrors] = useState<Record<string, string>>({});

  // ── 从配置中读取群消息数据 ──────────────────────────────
  const groupMessages = (config as any)?.groupMessages || {};
  const enabled: boolean = groupMessages.enabled ?? false;
  const requireMention: boolean = groupMessages.requireMention ?? false;
  const keywords: string[] = groupMessages.keywords || [];
  const prefix: string = groupMessages.prefix || '';
  const overrides: Record<string, GroupMessagesOverride> = groupMessages.overrides || {};

  // ── 已有覆盖的渠道列表 ──────────────────────────────────
  const overrideChannels = Object.keys(overrides);
  /** 可添加覆盖的渠道（排除已有覆盖的） */
  const availableChannelsForOverride = configuredChannels.filter(
    (ch) => !overrideChannels.includes(ch),
  );

  // ── 全局开关切换 ──────────────────────────────────────
  const handleToggleEnabled = async () => {
    const updated = updateGroupMessagesConfig(config, { enabled: !enabled });
    await onSave(updated);
  };

  // ── requireMention 切换 ──────────────────────────────────
  const handleToggleRequireMention = async () => {
    const updated = updateGroupMessagesConfig(config, { requireMention: !requireMention });
    await onSave(updated);
  };

  // ── 关键词保存 ──────────────────────────────────────────
  const handleSaveKeywords = async (rawText: string) => {
    const rawList = rawText.split('\n');
    const validated = validateKeywords(rawList);

    // 检查原始列表中是否有非空但 trim 后为空的项（纯空白关键词）
    const hasInvalid = rawList.some((kw) => kw.length > 0 && kw.trim().length === 0);

    if (hasInvalid) {
      setKeywordError(t('channels.groupMessagesInvalidKeyword' as any));
      return;
    }

    setKeywordError('');
    const updated = updateGroupMessagesConfig(config, { keywords: validated });
    await onSave(updated);
  };

  // ── 前缀保存 ──────────────────────────────────────────
  const handleSavePrefix = async (newPrefix: string) => {
    const updated = updateGroupMessagesConfig(config, { prefix: newPrefix });
    await onSave(updated);
  };

  // ── 添加渠道覆盖 ──────────────────────────────────────
  const handleAddOverride = async (channelType: string) => {
    const updated = updateGroupMessagesOverride(config, channelType, { enabled: false });
    await onSave(updated);
    setShowAddOverride(false);
  };

  // ── 删除渠道覆盖 ──────────────────────────────────────
  const handleDeleteOverride = async (channelType: string) => {
    // 通过重建 overrides 对象来删除指定渠道的覆盖
    const newOverrides = { ...overrides };
    delete newOverrides[channelType];
    const existing = (config as any).groupMessages || {};
    const updated = {
      ...config,
      groupMessages: {
        ...existing,
        overrides: newOverrides,
      },
    };
    await onSave(updated);
  };

  // ── 更新覆盖项的某个字段 ──────────────────────────────
  const handleUpdateOverrideField = async (
    channelType: string,
    field: keyof GroupMessagesOverride,
    value: any,
  ) => {
    const updated = updateGroupMessagesOverride(config, channelType, { [field]: value });
    await onSave(updated);
  };

  // ── 保存覆盖项的关键词 ──────────────────────────────────
  const handleSaveOverrideKeywords = async (channelType: string, rawText: string) => {
    const rawList = rawText.split('\n');
    const validated = validateKeywords(rawList);
    const hasInvalid = rawList.some((kw) => kw.length > 0 && kw.trim().length === 0);

    if (hasInvalid) {
      setOverrideKeywordErrors((prev) => ({
        ...prev,
        [channelType]: t('channels.groupMessagesInvalidKeyword' as any),
      }));
      return;
    }

    setOverrideKeywordErrors((prev) => {
      const next = { ...prev };
      delete next[channelType];
      return next;
    });
    const updated = updateGroupMessagesOverride(config, channelType, { keywords: validated });
    await onSave(updated);
  };

  return (
    <GlassCard className="rounded-2xl p-6">
      {/* 标题区域 */}
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" style={{ color: 'var(--app-text-muted)' }} />
          <h3 className="text-lg font-semibold" style={{ color: 'var(--app-text)' }}>
            {t('channels.groupMessages' as any)}
          </h3>
        </div>
        <p className="mt-1 text-sm" style={{ color: 'var(--app-text-muted)' }}>
          {t('channels.groupMessagesDescription' as any)}
        </p>
      </div>

      {/* 全局开关 */}
      <div className="mb-5 flex items-center justify-between">
        <label className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>
          {t('channels.groupMessagesEnabled' as any)}
        </label>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={handleToggleEnabled}
          className="relative inline-flex h-6 w-11 cursor-pointer items-center rounded-full transition-token-normal"
          style={{
            backgroundColor: enabled
              ? 'var(--app-active-bg, rgba(59,130,246,0.5))'
              : 'var(--app-bg, #374151)',
            border: `1px solid ${enabled ? 'var(--app-active-border, #3b82f6)' : 'var(--app-border)'}`,
          }}
        >
          <span
            className="inline-block h-4 w-4 rounded-full transition-token-normal"
            style={{
              backgroundColor: enabled ? 'var(--app-active-text, #3b82f6)' : 'var(--app-text-muted)',
              transform: enabled ? 'translateX(22px)' : 'translateX(4px)',
            }}
          />
        </button>
      </div>

      {/* requireMention 开关 */}
      <div className="mb-5 flex items-center justify-between">
        <label className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>
          {t('channels.groupMessagesRequireMention' as any)}
        </label>
        <button
          type="button"
          role="switch"
          aria-checked={requireMention}
          onClick={handleToggleRequireMention}
          className="relative inline-flex h-6 w-11 cursor-pointer items-center rounded-full transition-token-normal"
          style={{
            backgroundColor: requireMention
              ? 'var(--app-active-bg, rgba(59,130,246,0.5))'
              : 'var(--app-bg, #374151)',
            border: `1px solid ${requireMention ? 'var(--app-active-border, #3b82f6)' : 'var(--app-border)'}`,
          }}
        >
          <span
            className="inline-block h-4 w-4 rounded-full transition-token-normal"
            style={{
              backgroundColor: requireMention ? 'var(--app-active-text, #3b82f6)' : 'var(--app-text-muted)',
              transform: requireMention ? 'translateX(22px)' : 'translateX(4px)',
            }}
          />
        </button>
      </div>

      {/* 关键词输入区域 */}
      <KeywordsField
        label={t('channels.groupMessagesKeywords' as any)}
        hint={t('channels.groupMessagesKeywordsHint' as any)}
        keywords={keywords}
        error={keywordError}
        onSave={handleSaveKeywords}
      />

      {/* 前缀输入 */}
      <PrefixField
        label={t('channels.groupMessagesPrefix' as any)}
        value={prefix}
        onSave={handleSavePrefix}
      />

      {/* 渠道覆盖配置区域 */}
      <div className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <label className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>
            {t('channels.groupMessagesOverrides' as any)}
          </label>
          {availableChannelsForOverride.length > 0 && (
            <AppButton
              size="xs"
              variant="primary"
              icon={<Plus className="h-3.5 w-3.5" />}
              onClick={() => setShowAddOverride(true)}
            >
              {t('channels.groupMessagesAddOverride' as any)}
            </AppButton>
          )}
        </div>

        {/* 添加覆盖选择器 */}
        {showAddOverride && (
          <div
            className="mb-4 flex flex-wrap items-end gap-3 rounded-lg p-4"
            style={{
              backgroundColor: 'var(--app-bg-subtle)',
              border: '1px solid var(--app-border)',
            }}
          >
            <div className="flex-1" style={{ minWidth: '160px' }}>
              <select
                id="override-channel-select"
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={{
                  backgroundColor: 'var(--app-bg)',
                  border: '1px solid var(--app-border)',
                  color: 'var(--app-text)',
                }}
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) handleAddOverride(e.target.value);
                }}
              >
                <option value="" disabled>
                  — select —
                </option>
                {availableChannelsForOverride.map((ch) => (
                  <option key={ch} value={ch}>
                    {ch}
                  </option>
                ))}
              </select>
            </div>
            <AppButton
              size="sm"
              variant="secondary"
              onClick={() => setShowAddOverride(false)}
            >
              {t('common.cancel' as any)}
            </AppButton>
          </div>
        )}

        {/* 覆盖列表 */}
        {overrideChannels.length === 0 ? (
          <div
            className="rounded-lg py-6 text-center text-sm"
            style={{
              color: 'var(--app-text-muted)',
              backgroundColor: 'var(--app-bg-subtle)',
              border: '1px solid var(--app-border)',
            }}
          >
            {t('channels.groupMessagesOverrides' as any)} — 0
          </div>
        ) : (
          <div className="space-y-3">
            {overrideChannels.map((channelType) => {
              const ov = overrides[channelType] || {};
              return (
                <OverrideCard
                  key={channelType}
                  channelType={channelType}
                  override={ov}
                  keywordError={overrideKeywordErrors[channelType] || ''}
                  onToggleEnabled={() =>
                    handleUpdateOverrideField(channelType, 'enabled', !ov.enabled)
                  }
                  onToggleRequireMention={() =>
                    handleUpdateOverrideField(channelType, 'requireMention', !ov.requireMention)
                  }
                  onSaveKeywords={(raw) => handleSaveOverrideKeywords(channelType, raw)}
                  onSavePrefix={(val) =>
                    handleUpdateOverrideField(channelType, 'prefix', val)
                  }
                  onDelete={() => handleDeleteOverride(channelType)}
                />
              );
            })}
          </div>
        )}
      </div>
    </GlassCard>
  );
};

// ============================================================
// 关键词输入子组件
// ============================================================

interface KeywordsFieldProps {
  label: string;
  hint: string;
  keywords: string[];
  error: string;
  onSave: (rawText: string) => Promise<void>;
}

/** 关键词文本域：每行一个关键词，失焦时保存 */
const KeywordsField: React.FC<KeywordsFieldProps> = ({ label, hint, keywords, error, onSave }) => {
  const [localValue, setLocalValue] = useState<string | null>(null);
  const displayValue = localValue !== null ? localValue : keywords.join('\n');

  return (
    <div className="mb-5">
      <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--app-text)' }}>
        {label}
      </label>
      <p className="mb-2 text-xs" style={{ color: 'var(--app-text-muted)' }}>
        {hint}
      </p>
      <textarea
        rows={4}
        value={displayValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={() => {
          if (localValue !== null) {
            onSave(localValue);
            setLocalValue(null);
          }
        }}
        className="w-full resize-y rounded-lg px-3 py-2 text-sm outline-none"
        style={{
          backgroundColor: 'var(--app-bg)',
          border: `1px solid ${error ? 'var(--app-error, #ef4444)' : 'var(--app-border)'}`,
          color: 'var(--app-text)',
        }}
      />
      {error && (
        <p className="mt-1 text-xs" style={{ color: 'var(--app-error, #ef4444)' }}>
          {error}
        </p>
      )}
    </div>
  );
};

// ============================================================
// 前缀输入子组件
// ============================================================

interface PrefixFieldProps {
  label: string;
  value: string;
  onSave: (val: string) => Promise<void>;
}

/** 前缀文本输入，失焦时保存 */
const PrefixField: React.FC<PrefixFieldProps> = ({ label, value, onSave }) => {
  const [localValue, setLocalValue] = useState<string | null>(null);
  const displayValue = localValue !== null ? localValue : value;

  return (
    <div className="mb-5">
      <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--app-text)' }}>
        {label}
      </label>
      <input
        type="text"
        value={displayValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={() => {
          if (localValue !== null) {
            onSave(localValue);
            setLocalValue(null);
          }
        }}
        className="w-full rounded-lg px-3 py-2 text-sm outline-none"
        style={{
          backgroundColor: 'var(--app-bg)',
          border: '1px solid var(--app-border)',
          color: 'var(--app-text)',
        }}
        placeholder="/bot"
      />
    </div>
  );
};

// ============================================================
// 渠道覆盖卡片子组件
// ============================================================

interface OverrideCardProps {
  channelType: string;
  override: GroupMessagesOverride;
  keywordError: string;
  onToggleEnabled: () => Promise<void>;
  onToggleRequireMention: () => Promise<void>;
  onSaveKeywords: (raw: string) => Promise<void>;
  onSavePrefix: (val: string) => Promise<void>;
  onDelete: () => Promise<void>;
}

/** 单个渠道覆盖配置卡片 */
const OverrideCard: React.FC<OverrideCardProps> = ({
  channelType,
  override,
  keywordError,
  onToggleEnabled,
  onToggleRequireMention,
  onSaveKeywords,
  onSavePrefix,
  onDelete,
}) => {
  const { t } = useI18n();
  const [confirmDelete, setConfirmDelete] = useState(false);
  /** 本地关键词编辑状态 */
  const [localKw, setLocalKw] = useState<string | null>(null);
  /** 本地前缀编辑状态 */
  const [localPrefix, setLocalPrefix] = useState<string | null>(null);

  const ovEnabled = override.enabled ?? false;
  const ovRequireMention = override.requireMention ?? false;
  const ovKeywords = override.keywords || [];
  const ovPrefix = override.prefix || '';

  const kwDisplay = localKw !== null ? localKw : ovKeywords.join('\n');
  const prefixDisplay = localPrefix !== null ? localPrefix : ovPrefix;

  return (
    <div
      className="rounded-lg p-4"
      style={{
        backgroundColor: 'var(--app-bg-subtle)',
        border: '1px solid var(--app-border)',
      }}
    >
      {/* 头部：渠道名称 + 删除按钮 */}
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold" style={{ color: 'var(--app-text)' }}>
          {channelType}
        </span>
        {confirmDelete ? (
          <div className="flex items-center gap-2">
            <AppButton size="xs" variant="danger" onClick={onDelete}>
              {t('common.confirm' as any)}
            </AppButton>
            <AppButton size="xs" variant="secondary" onClick={() => setConfirmDelete(false)}>
              {t('common.cancel' as any)}
            </AppButton>
          </div>
        ) : (
          <AppButton
            size="xs"
            variant="danger"
            icon={<Trash2 className="h-3.5 w-3.5" />}
            onClick={() => setConfirmDelete(true)}
          >
            {t('channels.deleteChannel' as any)}
          </AppButton>
        )}
      </div>

      {/* enabled 开关 */}
      <div className="mb-3 flex items-center justify-between">
        <label className="text-xs" style={{ color: 'var(--app-text-muted)' }}>
          {t('channels.groupMessagesEnabled' as any)}
        </label>
        <button
          type="button"
          role="switch"
          aria-checked={ovEnabled}
          onClick={onToggleEnabled}
          className="relative inline-flex h-5 w-9 cursor-pointer items-center rounded-full transition-token-normal"
          style={{
            backgroundColor: ovEnabled
              ? 'var(--app-active-bg, rgba(59,130,246,0.5))'
              : 'var(--app-bg, #374151)',
            border: `1px solid ${ovEnabled ? 'var(--app-active-border, #3b82f6)' : 'var(--app-border)'}`,
          }}
        >
          <span
            className="inline-block h-3 w-3 rounded-full transition-token-normal"
            style={{
              backgroundColor: ovEnabled ? 'var(--app-active-text, #3b82f6)' : 'var(--app-text-muted)',
              transform: ovEnabled ? 'translateX(18px)' : 'translateX(3px)',
            }}
          />
        </button>
      </div>

      {/* requireMention 开关 */}
      <div className="mb-3 flex items-center justify-between">
        <label className="text-xs" style={{ color: 'var(--app-text-muted)' }}>
          {t('channels.groupMessagesRequireMention' as any)}
        </label>
        <button
          type="button"
          role="switch"
          aria-checked={ovRequireMention}
          onClick={onToggleRequireMention}
          className="relative inline-flex h-5 w-9 cursor-pointer items-center rounded-full transition-token-normal"
          style={{
            backgroundColor: ovRequireMention
              ? 'var(--app-active-bg, rgba(59,130,246,0.5))'
              : 'var(--app-bg, #374151)',
            border: `1px solid ${ovRequireMention ? 'var(--app-active-border, #3b82f6)' : 'var(--app-border)'}`,
          }}
        >
          <span
            className="inline-block h-3 w-3 rounded-full transition-token-normal"
            style={{
              backgroundColor: ovRequireMention ? 'var(--app-active-text, #3b82f6)' : 'var(--app-text-muted)',
              transform: ovRequireMention ? 'translateX(18px)' : 'translateX(3px)',
            }}
          />
        </button>
      </div>

      {/* 关键词 */}
      <div className="mb-3">
        <label className="mb-1 block text-xs" style={{ color: 'var(--app-text-muted)' }}>
          {t('channels.groupMessagesKeywords' as any)}
        </label>
        <textarea
          rows={3}
          value={kwDisplay}
          onChange={(e) => setLocalKw(e.target.value)}
          onBlur={() => {
            if (localKw !== null) {
              onSaveKeywords(localKw);
              setLocalKw(null);
            }
          }}
          className="w-full resize-y rounded-lg px-3 py-2 text-xs outline-none"
          style={{
            backgroundColor: 'var(--app-bg)',
            border: `1px solid ${keywordError ? 'var(--app-error, #ef4444)' : 'var(--app-border)'}`,
            color: 'var(--app-text)',
          }}
        />
        {keywordError && (
          <p className="mt-1 text-xs" style={{ color: 'var(--app-error, #ef4444)' }}>
            {keywordError}
          </p>
        )}
      </div>

      {/* 前缀 */}
      <div>
        <label className="mb-1 block text-xs" style={{ color: 'var(--app-text-muted)' }}>
          {t('channels.groupMessagesPrefix' as any)}
        </label>
        <input
          type="text"
          value={prefixDisplay}
          onChange={(e) => setLocalPrefix(e.target.value)}
          onBlur={() => {
            if (localPrefix !== null) {
              onSavePrefix(localPrefix);
              setLocalPrefix(null);
            }
          }}
          className="w-full rounded-lg px-3 py-2 text-xs outline-none"
          style={{
            backgroundColor: 'var(--app-bg)',
            border: '1px solid var(--app-border)',
            color: 'var(--app-text)',
          }}
          placeholder="/bot"
        />
      </div>
    </div>
  );
};

export default GroupMessagesConfig;
