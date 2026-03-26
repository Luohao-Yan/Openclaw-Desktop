/**
 * 位置解析配置组件（LocationParsingConfig）
 * 管理渠道位置解析规则，支持正则表达式和预定义格式两种解析模式
 * - 全局开关：控制是否启用位置解析功能
 * - 解析规则列表：按渠道类型分组展示
 * - 添加/编辑规则：配置适用渠道类型、解析模式、正则/预定义格式、字段映射
 * - 正则表达式验证：保存前校验，无效正则阻止保存
 * - 所有变更通过 onSave 回调持久化到 openclaw.json
 */
import React, { useState } from 'react';
import { Plus, Trash2, Edit, MapPin } from 'lucide-react';
import AppButton from '../../components/AppButton';
import AppBadge from '../../components/AppBadge';
import GlassCard from '../../components/GlassCard';
import { useI18n } from '../../i18n/I18nContext';
import {
  updateLocationParsingConfig,
  updateLocationParsingRule,
  validateRegexPattern,
} from '../../utils/channelOps';
import type { LocationParsingRule } from '../../utils/channelOps';

// ============================================================
// 组件属性接口
// ============================================================

interface LocationParsingConfigProps {
  /** 完整的 OpenClaw 配置对象 */
  config: any;
  /** 已配置的渠道类型列表，用于规则渠道选择 */
  configuredChannels: string[];
  /** 保存回调，将更新后的配置持久化 */
  onSave: (updatedConfig: any) => Promise<void>;
}

// ============================================================
// 空规则草稿工厂
// ============================================================

/** 创建空的位置解析规则草稿 */
const createEmptyDraft = (): LocationParsingRule & { channelType: string } => ({
  channelType: '',
  mode: 'regex',
  pattern: '',
  format: '',
  fieldMapping: {},
});

/** 将字段映射对象序列化为 key=value 文本（每行一对） */
const serializeFieldMapping = (mapping: Record<string, string> | undefined): string => {
  if (!mapping || Object.keys(mapping).length === 0) return '';
  return Object.entries(mapping)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
};

/** 将 key=value 文本解析为字段映射对象 */
const parseFieldMapping = (text: string): Record<string, string> => {
  const result: Record<string, string> = {};
  text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line.includes('='))
    .forEach((line) => {
      const eqIdx = line.indexOf('=');
      const key = line.slice(0, eqIdx).trim();
      const value = line.slice(eqIdx + 1).trim();
      if (key) result[key] = value;
    });
  return result;
};

// ============================================================
// LocationParsingConfig 组件
// ============================================================

const LocationParsingConfig: React.FC<LocationParsingConfigProps> = ({
  config,
  configuredChannels,
  onSave,
}) => {
  const { t } = useI18n();

  // ── 添加规则表单状态 ──────────────────────────────────
  const [showAddForm, setShowAddForm] = useState(false);
  const [draft, setDraft] = useState<LocationParsingRule & { channelType: string }>(createEmptyDraft());
  const [draftMappingText, setDraftMappingText] = useState('');
  const [draftRegexError, setDraftRegexError] = useState('');
  /** 当前展开编辑的渠道类型 */
  const [editingChannel, setEditingChannel] = useState<string | null>(null);
  /** 待确认删除的渠道类型 */
  const [confirmDeleteChannel, setConfirmDeleteChannel] = useState<string | null>(null);

  // ── 从配置中读取位置解析数据 ──────────────────────────
  const locationParsing = (config as any)?.locationParsing || {};
  const isEnabled: boolean = locationParsing.enabled === true;
  const rules: Record<string, LocationParsingRule> = locationParsing.rules || {};
  const ruleEntries = Object.entries(rules);

  // ── 全局开关切换处理 ──────────────────────────────────
  const handleToggleEnabled = async () => {
    const updated = updateLocationParsingConfig(config, { enabled: !isEnabled });
    await onSave(updated);
  };

  // ── 添加规则处理 ──────────────────────────────────────
  const handleAddRule = async () => {
    if (!draft.channelType) return;

    // 正则模式下验证正则表达式
    if (draft.mode === 'regex' && draft.pattern) {
      const validation = validateRegexPattern(draft.pattern);
      if (!validation.valid) {
        setDraftRegexError(t('channels.locationParsingInvalidRegex' as any));
        return;
      }
    }

    const rule: LocationParsingRule = {
      mode: draft.mode,
      ...(draft.mode === 'regex' && draft.pattern ? { pattern: draft.pattern } : {}),
      ...(draft.mode === 'predefined' && draft.format ? { format: draft.format } : {}),
    };

    // 解析字段映射
    const mapping = parseFieldMapping(draftMappingText);
    if (Object.keys(mapping).length > 0) {
      rule.fieldMapping = mapping;
    }

    const updated = updateLocationParsingRule(config, draft.channelType, rule);
    await onSave(updated);

    // 重置表单
    setDraft(createEmptyDraft());
    setDraftMappingText('');
    setDraftRegexError('');
    setShowAddForm(false);
  };

  // ── 删除规则处理 ──────────────────────────────────────
  const handleDeleteRule = async (channelType: string) => {
    // 从 rules 中移除指定渠道的规则
    const existingRules = { ...(locationParsing.rules || {}) };
    delete existingRules[channelType];
    const updated = updateLocationParsingConfig(config, { rules: existingRules });
    await onSave(updated);
    setConfirmDeleteChannel(null);
    if (editingChannel === channelType) setEditingChannel(null);
  };

  // ── 获取规则模式的显示文本 ────────────────────────────
  const getModeLabel = (mode: string): string => {
    return mode === 'regex'
      ? t('channels.locationParsingRegex' as any)
      : t('channels.locationParsingPredefined' as any);
  };

  // ── 获取规则的摘要文本 ────────────────────────────────
  const getRuleSummary = (rule: LocationParsingRule): string => {
    if (rule.mode === 'regex' && rule.pattern) {
      return rule.pattern.length > 30 ? rule.pattern.slice(0, 30) + '…' : rule.pattern;
    }
    if (rule.mode === 'predefined' && rule.format) {
      return rule.format;
    }
    return '—';
  };

  return (
    <GlassCard className="rounded-2xl p-6">
      {/* 标题区域 */}
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <MapPin className="h-5 w-5" style={{ color: 'var(--app-text-muted)' }} />
          <h3
            className="text-lg font-semibold"
            style={{ color: 'var(--app-text)' }}
          >
            {t('channels.locationParsing' as any)}
          </h3>
        </div>
        <p
          className="mt-1 text-sm"
          style={{ color: 'var(--app-text-muted)' }}
        >
          {t('channels.locationParsingDescription' as any)}
        </p>
      </div>

      {/* 全局开关 */}
      <div className="mb-6 flex items-center justify-between">
        <label
          className="text-sm font-medium"
          style={{ color: 'var(--app-text)' }}
        >
          {t('channels.locationParsingEnabled' as any)}
        </label>
        <button
          type="button"
          onClick={handleToggleEnabled}
          className="relative inline-flex h-6 w-11 cursor-pointer items-center rounded-full transition-token-normal"
          style={{
            backgroundColor: isEnabled
              ? 'var(--app-active-border, #3b82f6)'
              : 'var(--app-border)',
          }}
          role="switch"
          aria-checked={isEnabled}
        >
          <span
            className="inline-block h-4 w-4 rounded-full transition-token-normal"
            style={{
              backgroundColor: 'white',
              transform: isEnabled ? 'translateX(22px)' : 'translateX(4px)',
            }}
          />
        </button>
      </div>

      {/* 添加规则按钮 */}
      <div className="mb-4 flex items-center justify-end">
        <AppButton
          size="xs"
          variant="primary"
          icon={<Plus className="h-3.5 w-3.5" />}
          onClick={() => setShowAddForm(true)}
        >
          {t('channels.locationParsingAddRule' as any)}
        </AppButton>
      </div>

      {/* 添加规则内联表单 */}
      {showAddForm && (
        <LocationParsingRuleForm
          draft={draft}
          mappingText={draftMappingText}
          regexError={draftRegexError}
          configuredChannels={configuredChannels}
          existingRuleChannels={Object.keys(rules)}
          onChange={setDraft}
          onMappingChange={setDraftMappingText}
          onRegexErrorClear={() => setDraftRegexError('')}
          onConfirm={handleAddRule}
          onCancel={() => {
            setShowAddForm(false);
            setDraft(createEmptyDraft());
            setDraftMappingText('');
            setDraftRegexError('');
          }}
        />
      )}

      {/* 规则列表 */}
      {ruleEntries.length === 0 ? (
        <div
          className="rounded-lg py-8 text-center text-sm"
          style={{
            color: 'var(--app-text-muted)',
            backgroundColor: 'var(--app-bg-subtle)',
            border: '1px solid var(--app-border)',
          }}
        >
          {t('channels.locationParsing' as any)} — 0
        </div>
      ) : (
        <div className="space-y-2">
          {ruleEntries.map(([channelType, rule]) => {
            const isEditing = editingChannel === channelType;
            const isConfirmingDelete = confirmDeleteChannel === channelType;

            return (
              <div
                key={channelType}
                className="rounded-lg"
                style={{
                  backgroundColor: 'var(--app-bg-subtle)',
                  border: '1px solid var(--app-border)',
                }}
              >
                {/* 规则卡片头部 */}
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="flex flex-wrap items-center gap-3">
                    {/* 渠道类型 */}
                    <span
                      className="text-sm font-medium"
                      style={{ color: 'var(--app-text)' }}
                    >
                      {channelType}
                    </span>
                    {/* 解析模式 badge */}
                    <AppBadge variant="info" size="sm">
                      {getModeLabel(rule.mode)}
                    </AppBadge>
                    {/* 规则摘要 */}
                    <span
                      className="text-xs font-mono"
                      style={{ color: 'var(--app-text-muted)' }}
                    >
                      {getRuleSummary(rule)}
                    </span>
                  </div>

                  {/* 操作按钮区域 */}
                  <div className="flex items-center gap-2">
                    {/* 编辑按钮 */}
                    <AppButton
                      size="xs"
                      variant="secondary"
                      icon={<Edit className="h-3.5 w-3.5" />}
                      onClick={() =>
                        setEditingChannel(isEditing ? null : channelType)
                      }
                    >
                      {t('channels.routingEditRule' as any)}
                    </AppButton>

                    {/* 删除按钮 / 确认删除 */}
                    {isConfirmingDelete ? (
                      <div className="flex items-center gap-2">
                        <AppButton
                          size="xs"
                          variant="danger"
                          onClick={() => handleDeleteRule(channelType)}
                        >
                          {t('common.confirm' as any)}
                        </AppButton>
                        <AppButton
                          size="xs"
                          variant="secondary"
                          onClick={() => setConfirmDeleteChannel(null)}
                        >
                          {t('common.cancel' as any)}
                        </AppButton>
                      </div>
                    ) : (
                      <AppButton
                        size="xs"
                        variant="danger"
                        icon={<Trash2 className="h-3.5 w-3.5" />}
                        onClick={() => setConfirmDeleteChannel(channelType)}
                      >
                        {t('channels.routingDeleteRule' as any)}
                      </AppButton>
                    )}
                  </div>
                </div>

                {/* 编辑区域（展开时显示） */}
                {isEditing && (
                  <LocationParsingRuleEditArea
                    channelType={channelType}
                    rule={rule}
                    config={config}
                    onSave={onSave}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </GlassCard>
  );
};

// ============================================================
// 位置解析规则表单子组件（添加时使用）
// ============================================================

interface LocationParsingRuleFormProps {
  /** 当前草稿数据 */
  draft: LocationParsingRule & { channelType: string };
  /** 字段映射文本 */
  mappingText: string;
  /** 正则验证错误信息 */
  regexError: string;
  /** 已配置的渠道类型列表 */
  configuredChannels: string[];
  /** 已有规则的渠道类型列表（用于排除） */
  existingRuleChannels: string[];
  /** 草稿变更回调 */
  onChange: (draft: LocationParsingRule & { channelType: string }) => void;
  /** 字段映射文本变更回调 */
  onMappingChange: (text: string) => void;
  /** 清除正则错误回调 */
  onRegexErrorClear: () => void;
  /** 确认添加回调 */
  onConfirm: () => void;
  /** 取消回调 */
  onCancel: () => void;
}

/** 位置解析规则内联表单：用于添加新规则 */
const LocationParsingRuleForm: React.FC<LocationParsingRuleFormProps> = ({
  draft,
  mappingText,
  regexError,
  configuredChannels,
  existingRuleChannels,
  onChange,
  onMappingChange,
  onRegexErrorClear,
  onConfirm,
  onCancel,
}) => {
  const { t } = useI18n();

  /** 可选的渠道类型（排除已有规则的渠道） */
  const availableChannels = configuredChannels.filter(
    (ch) => !existingRuleChannels.includes(ch),
  );

  return (
    <div
      className="mb-4 rounded-lg p-4"
      style={{
        backgroundColor: 'var(--app-bg-subtle)',
        border: '1px solid var(--app-border)',
      }}
    >
      {/* 第一行：渠道类型 + 解析模式 */}
      <div className="mb-3 flex flex-wrap items-end gap-3">
        {/* 渠道类型选择 */}
        <div className="flex-1" style={{ minWidth: '160px' }}>
          <label
            className="mb-1 block text-xs"
            style={{ color: 'var(--app-text-muted)' }}
          >
            {t('channels.bindingChannel' as any)}
          </label>
          <select
            value={draft.channelType}
            onChange={(e) => onChange({ ...draft, channelType: e.target.value })}
            className="w-full rounded-lg px-3 py-2 text-sm outline-none"
            style={{
              backgroundColor: 'var(--app-bg)',
              border: '1px solid var(--app-border)',
              color: 'var(--app-text)',
            }}
          >
            <option value="" disabled>
              — {t('channels.selectChannelType' as any)} —
            </option>
            {availableChannels.map((ch) => (
              <option key={ch} value={ch}>
                {ch}
              </option>
            ))}
          </select>
        </div>
        {/* 解析模式选择 */}
        <div className="flex-1" style={{ minWidth: '160px' }}>
          <label
            className="mb-1 block text-xs"
            style={{ color: 'var(--app-text-muted)' }}
          >
            {t('channels.locationParsingMode' as any)}
          </label>
          <select
            value={draft.mode}
            onChange={(e) =>
              onChange({ ...draft, mode: e.target.value as 'regex' | 'predefined' })
            }
            className="w-full rounded-lg px-3 py-2 text-sm outline-none"
            style={{
              backgroundColor: 'var(--app-bg)',
              border: '1px solid var(--app-border)',
              color: 'var(--app-text)',
            }}
          >
            <option value="regex">{t('channels.locationParsingRegex' as any)}</option>
            <option value="predefined">{t('channels.locationParsingPredefined' as any)}</option>
          </select>
        </div>
      </div>

      {/* 第二行：正则表达式或预定义格式 */}
      <div className="mb-3">
        {draft.mode === 'regex' ? (
          <div>
            <label
              className="mb-1 block text-xs"
              style={{ color: 'var(--app-text-muted)' }}
            >
              {t('channels.locationParsingRegex' as any)}
            </label>
            <input
              type="text"
              value={draft.pattern || ''}
              onChange={(e) => {
                onChange({ ...draft, pattern: e.target.value });
                onRegexErrorClear();
              }}
              className="w-full rounded-lg px-3 py-2 text-sm font-mono outline-none"
              style={{
                backgroundColor: 'var(--app-bg)',
                border: regexError
                  ? '1px solid var(--app-danger, #ef4444)'
                  : '1px solid var(--app-border)',
                color: 'var(--app-text)',
              }}
              placeholder="^loc:(-?\d+\.\d+),(-?\d+\.\d+)$"
            />
            {regexError && (
              <p
                className="mt-1 text-xs"
                style={{ color: 'var(--app-danger, #ef4444)' }}
              >
                {regexError}
              </p>
            )}
          </div>
        ) : (
          <div>
            <label
              className="mb-1 block text-xs"
              style={{ color: 'var(--app-text-muted)' }}
            >
              {t('channels.locationParsingPredefined' as any)}
            </label>
            <input
              type="text"
              value={draft.format || ''}
              onChange={(e) => onChange({ ...draft, format: e.target.value })}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{
                backgroundColor: 'var(--app-bg)',
                border: '1px solid var(--app-border)',
                color: 'var(--app-text)',
              }}
              placeholder="geo-uri"
            />
          </div>
        )}
      </div>

      {/* 第三行：字段映射 */}
      <div className="mb-3">
        <label
          className="mb-1 block text-xs"
          style={{ color: 'var(--app-text-muted)' }}
        >
          {t('channels.locationParsingFieldMapping' as any)} (key=value)
        </label>
        <textarea
          value={mappingText}
          onChange={(e) => onMappingChange(e.target.value)}
          rows={3}
          className="w-full rounded-lg px-3 py-2 text-sm font-mono outline-none resize-none"
          style={{
            backgroundColor: 'var(--app-bg)',
            border: '1px solid var(--app-border)',
            color: 'var(--app-text)',
          }}
          placeholder={"lat=$1\nlng=$2"}
        />
      </div>

      {/* 操作按钮 */}
      <div className="flex gap-2">
        <AppButton size="sm" variant="primary" onClick={onConfirm}>
          {t('common.confirm' as any)}
        </AppButton>
        <AppButton size="sm" variant="secondary" onClick={onCancel}>
          {t('common.cancel' as any)}
        </AppButton>
      </div>
    </div>
  );
};

// ============================================================
// 位置解析规则编辑区域子组件
// ============================================================

interface LocationParsingRuleEditAreaProps {
  /** 渠道类型 */
  channelType: string;
  /** 当前规则数据 */
  rule: LocationParsingRule;
  /** 完整配置对象 */
  config: any;
  /** 保存回调 */
  onSave: (updatedConfig: any) => Promise<void>;
}

/** 位置解析规则编辑区域：修改解析模式、正则/格式、字段映射 */
const LocationParsingRuleEditArea: React.FC<LocationParsingRuleEditAreaProps> = ({
  channelType,
  rule,
  config,
  onSave,
}) => {
  const { t } = useI18n();

  // ── 本地编辑状态 ──────────────────────────────────────
  const [localMode, setLocalMode] = useState(rule.mode);
  const [localPattern, setLocalPattern] = useState(rule.pattern || '');
  const [localFormat, setLocalFormat] = useState(rule.format || '');
  const [localMappingText, setLocalMappingText] = useState(
    serializeFieldMapping(rule.fieldMapping),
  );
  const [regexError, setRegexError] = useState('');

  /** 保存编辑后的规则 */
  const handleSave = async () => {
    // 正则模式下验证正则表达式
    if (localMode === 'regex' && localPattern) {
      const validation = validateRegexPattern(localPattern);
      if (!validation.valid) {
        setRegexError(t('channels.locationParsingInvalidRegex' as any));
        return;
      }
    }

    const updatedRule: LocationParsingRule = {
      mode: localMode,
      ...(localMode === 'regex' && localPattern ? { pattern: localPattern } : {}),
      ...(localMode === 'predefined' && localFormat ? { format: localFormat } : {}),
    };

    const mapping = parseFieldMapping(localMappingText);
    if (Object.keys(mapping).length > 0) {
      updatedRule.fieldMapping = mapping;
    }

    const updated = updateLocationParsingRule(config, channelType, updatedRule);
    await onSave(updated);
    setRegexError('');
  };

  return (
    <div
      className="border-t px-4 py-4"
      style={{ borderColor: 'var(--app-border)' }}
    >
      {/* 解析模式编辑 */}
      <div className="mb-4">
        <label
          className="mb-1 block text-xs font-medium"
          style={{ color: 'var(--app-text-muted)' }}
        >
          {t('channels.locationParsingMode' as any)}
        </label>
        <select
          value={localMode}
          onChange={(e) => {
            setLocalMode(e.target.value as 'regex' | 'predefined');
            setRegexError('');
          }}
          className="w-full rounded-lg px-3 py-2 text-sm outline-none"
          style={{
            backgroundColor: 'var(--app-bg)',
            border: '1px solid var(--app-border)',
            color: 'var(--app-text)',
          }}
        >
          <option value="regex">{t('channels.locationParsingRegex' as any)}</option>
          <option value="predefined">{t('channels.locationParsingPredefined' as any)}</option>
        </select>
      </div>

      {/* 正则表达式或预定义格式编辑 */}
      <div className="mb-4">
        {localMode === 'regex' ? (
          <div>
            <label
              className="mb-1 block text-xs font-medium"
              style={{ color: 'var(--app-text-muted)' }}
            >
              {t('channels.locationParsingRegex' as any)}
            </label>
            <input
              type="text"
              value={localPattern}
              onChange={(e) => {
                setLocalPattern(e.target.value);
                setRegexError('');
              }}
              className="w-full rounded-lg px-3 py-2 text-sm font-mono outline-none"
              style={{
                backgroundColor: 'var(--app-bg)',
                border: regexError
                  ? '1px solid var(--app-danger, #ef4444)'
                  : '1px solid var(--app-border)',
                color: 'var(--app-text)',
              }}
              placeholder="^loc:(-?\d+\.\d+),(-?\d+\.\d+)$"
            />
            {regexError && (
              <p
                className="mt-1 text-xs"
                style={{ color: 'var(--app-danger, #ef4444)' }}
              >
                {regexError}
              </p>
            )}
          </div>
        ) : (
          <div>
            <label
              className="mb-1 block text-xs font-medium"
              style={{ color: 'var(--app-text-muted)' }}
            >
              {t('channels.locationParsingPredefined' as any)}
            </label>
            <input
              type="text"
              value={localFormat}
              onChange={(e) => setLocalFormat(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{
                backgroundColor: 'var(--app-bg)',
                border: '1px solid var(--app-border)',
                color: 'var(--app-text)',
              }}
              placeholder="geo-uri"
            />
          </div>
        )}
      </div>

      {/* 字段映射编辑 */}
      <div className="mb-4">
        <label
          className="mb-1 block text-xs font-medium"
          style={{ color: 'var(--app-text-muted)' }}
        >
          {t('channels.locationParsingFieldMapping' as any)} (key=value)
        </label>
        <textarea
          value={localMappingText}
          onChange={(e) => setLocalMappingText(e.target.value)}
          rows={3}
          className="w-full rounded-lg px-3 py-2 text-sm font-mono outline-none resize-none"
          style={{
            backgroundColor: 'var(--app-bg)',
            border: '1px solid var(--app-border)',
            color: 'var(--app-text)',
          }}
          placeholder={"lat=$1\nlng=$2"}
        />
      </div>

      {/* 保存按钮 */}
      <div className="flex gap-2">
        <AppButton size="sm" variant="primary" onClick={handleSave}>
          {t('common.save' as any)}
        </AppButton>
      </div>
    </div>
  );
};

export default LocationParsingConfig;
