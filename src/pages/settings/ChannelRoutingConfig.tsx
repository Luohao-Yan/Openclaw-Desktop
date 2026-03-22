/**
 * 渠道路由配置组件（ChannelRoutingConfig）
 * 管理消息路由规则，按优先级将消息分发到不同 Agent
 * - 路由规则列表展示：按优先级从高到低排序，显示规则名称、匹配条件摘要、目标 Agent、优先级
 * - 添加路由规则：表单配置规则名称、匹配条件（渠道类型、账号 ID、消息来源）、目标 Agent、优先级
 * - 编辑路由规则：修改所有路由条件和目标配置
 * - 删除路由规则：确认后删除
 * - 所有变更通过 onSave 回调持久化到 openclaw.json
 */
import React, { useState } from 'react';
import { Plus, Trash2, Edit, Route } from 'lucide-react';
import AppButton from '../../components/AppButton';
import AppBadge from '../../components/AppBadge';
import GlassCard from '../../components/GlassCard';
import { useI18n } from '../../i18n/I18nContext';
import {
  addRoutingRule,
  updateRoutingRule,
  deleteRoutingRule,
  sortRoutingRulesByPriority,
} from '../../utils/channelOps';
import type { RoutingRule } from '../../utils/channelOps';
import type { AgentInfo } from '../../../types/electron';

// ============================================================
// 组件属性接口
// ============================================================

interface ChannelRoutingConfigProps {
  /** 完整的 OpenClaw 配置对象 */
  config: any;
  /** 已配置的渠道类型列表，用于匹配条件选择 */
  configuredChannels: string[];
  /** Agent 列表，用于目标 Agent 选择 */
  agents: AgentInfo[];
  /** 保存回调，将更新后的配置持久化 */
  onSave: (updatedConfig: any) => Promise<void>;
}

// ============================================================
// 空规则草稿工厂
// ============================================================

/** 创建空的路由规则草稿 */
const createEmptyDraft = (): RoutingRule => ({
  name: '',
  match: { channel: '', accountId: '', source: '' },
  agentId: '',
  priority: 0,
  enabled: true,
});

// ============================================================
// ChannelRoutingConfig 组件
// ============================================================

const ChannelRoutingConfig: React.FC<ChannelRoutingConfigProps> = ({
  config,
  configuredChannels,
  agents,
  onSave,
}) => {
  const { t } = useI18n();

  // ── 添加规则表单状态 ──────────────────────────────────
  const [showAddForm, setShowAddForm] = useState(false);
  const [draft, setDraft] = useState<RoutingRule>(createEmptyDraft());
  /** 当前展开编辑的规则原始索引（在未排序数组中的索引） */
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  /** 待确认删除的规则原始索引 */
  const [confirmDeleteIndex, setConfirmDeleteIndex] = useState<number | null>(null);

  // ── 从配置中读取路由规则 ──────────────────────────────
  const routing = (config as any)?.channelRouting || {};
  const rawRules: RoutingRule[] = routing.rules || [];
  /** 按优先级排序后的规则列表（仅用于展示） */
  const sortedRules = sortRoutingRulesByPriority(rawRules);

  // ── 辅助：根据排序后的规则找到其在原始数组中的索引 ──
  const getOriginalIndex = (rule: RoutingRule): number => {
    return rawRules.indexOf(rule);
  };

  // ── 匹配条件摘要文本 ──────────────────────────────────
  const getMatchSummary = (match: RoutingRule['match']): string => {
    const parts: string[] = [];
    if (match.channel) parts.push(match.channel);
    if (match.accountId) parts.push(match.accountId);
    if (match.source) parts.push(match.source);
    return parts.length > 0 ? parts.join(' / ') : '—';
  };

  // ── 获取 Agent 显示名称 ──────────────────────────────
  const getAgentName = (agentId: string): string => {
    const agent = agents.find((a) => a.id === agentId);
    return agent ? agent.name || agent.id : agentId || '—';
  };

  // ── 添加路由规则处理 ──────────────────────────────────
  const handleAddRule = async () => {
    const trimmedName = draft.name.trim();
    if (!trimmedName || !draft.agentId) return;

    const rule: RoutingRule = {
      ...draft,
      name: trimmedName,
      match: {
        ...(draft.match.channel ? { channel: draft.match.channel } : {}),
        ...(draft.match.accountId ? { accountId: draft.match.accountId } : {}),
        ...(draft.match.source ? { source: draft.match.source } : {}),
      },
    };
    const updated = addRoutingRule(config, rule);
    await onSave(updated);

    // 重置表单
    setDraft(createEmptyDraft());
    setShowAddForm(false);
  };

  // ── 删除路由规则处理 ──────────────────────────────────
  const handleDeleteRule = async (originalIndex: number) => {
    const updated = deleteRoutingRule(config, originalIndex);
    await onSave(updated);
    setConfirmDeleteIndex(null);
    if (editingIndex === originalIndex) setEditingIndex(null);
  };

  return (
    <GlassCard className="rounded-2xl p-6">
      {/* 标题区域 */}
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <Route className="h-5 w-5" style={{ color: 'var(--app-text-muted)' }} />
          <h3
            className="text-lg font-semibold"
            style={{ color: 'var(--app-text)' }}
          >
            {t('channels.routing' as any)}
          </h3>
        </div>
        <p
          className="mt-1 text-sm"
          style={{ color: 'var(--app-text-muted)' }}
        >
          {t('channels.routingDescription' as any)}
        </p>
      </div>

      {/* 添加路由规则按钮 */}
      <div className="mb-4 flex items-center justify-end">
        <AppButton
          size="xs"
          variant="primary"
          icon={<Plus className="h-3.5 w-3.5" />}
          onClick={() => setShowAddForm(true)}
        >
          {t('channels.routingAddRule' as any)}
        </AppButton>
      </div>

      {/* 添加路由规则内联表单 */}
      {showAddForm && (
        <RoutingRuleForm
          draft={draft}
          configuredChannels={configuredChannels}
          agents={agents}
          onChange={setDraft}
          onConfirm={handleAddRule}
          onCancel={() => {
            setShowAddForm(false);
            setDraft(createEmptyDraft());
          }}
        />
      )}

      {/* 路由规则列表 */}
      {sortedRules.length === 0 ? (
        <div
          className="rounded-lg py-8 text-center text-sm"
          style={{
            color: 'var(--app-text-muted)',
            backgroundColor: 'var(--app-bg-subtle)',
            border: '1px solid var(--app-border)',
          }}
        >
          {t('channels.routingNoRules' as any)}
        </div>
      ) : (
        <div className="space-y-2">
          {sortedRules.map((rule) => {
            const originalIndex = getOriginalIndex(rule);
            const isEditing = editingIndex === originalIndex;
            const isConfirmingDelete = confirmDeleteIndex === originalIndex;

            return (
              <div
                key={`rule-${originalIndex}`}
                className="rounded-lg"
                style={{
                  backgroundColor: 'var(--app-bg-subtle)',
                  border: '1px solid var(--app-border)',
                }}
              >
                {/* 规则卡片头部 */}
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="flex flex-wrap items-center gap-3">
                    {/* 规则名称 */}
                    <span
                      className="text-sm font-medium"
                      style={{ color: 'var(--app-text)' }}
                    >
                      {rule.name || '—'}
                    </span>
                    {/* 匹配条件摘要 badge */}
                    <AppBadge variant="info" size="sm">
                      {getMatchSummary(rule.match)}
                    </AppBadge>
                    {/* 目标 Agent */}
                    <span
                      className="text-xs"
                      style={{ color: 'var(--app-text-muted)' }}
                    >
                      → {getAgentName(rule.agentId)}
                    </span>
                    {/* 优先级 badge */}
                    <AppBadge variant="default" size="sm">
                      P{rule.priority}
                    </AppBadge>
                  </div>

                  {/* 操作按钮区域 */}
                  <div className="flex items-center gap-2">
                    {/* 编辑按钮 */}
                    <AppButton
                      size="xs"
                      variant="secondary"
                      icon={<Edit className="h-3.5 w-3.5" />}
                      onClick={() =>
                        setEditingIndex(isEditing ? null : originalIndex)
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
                          onClick={() => handleDeleteRule(originalIndex)}
                        >
                          {t('common.confirm' as any)}
                        </AppButton>
                        <AppButton
                          size="xs"
                          variant="secondary"
                          onClick={() => setConfirmDeleteIndex(null)}
                        >
                          {t('common.cancel' as any)}
                        </AppButton>
                      </div>
                    ) : (
                      <AppButton
                        size="xs"
                        variant="danger"
                        icon={<Trash2 className="h-3.5 w-3.5" />}
                        onClick={() => setConfirmDeleteIndex(originalIndex)}
                      >
                        {t('channels.routingDeleteRule' as any)}
                      </AppButton>
                    )}
                  </div>
                </div>

                {/* 编辑区域（展开时显示） */}
                {isEditing && (
                  <RoutingRuleEditArea
                    rule={rule}
                    originalIndex={originalIndex}
                    configuredChannels={configuredChannels}
                    agents={agents}
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
// 路由规则表单子组件（添加时使用）
// ============================================================

interface RoutingRuleFormProps {
  /** 当前草稿数据 */
  draft: RoutingRule;
  /** 已配置的渠道类型列表 */
  configuredChannels: string[];
  /** Agent 列表 */
  agents: AgentInfo[];
  /** 草稿变更回调 */
  onChange: (draft: RoutingRule) => void;
  /** 确认添加回调 */
  onConfirm: () => void;
  /** 取消回调 */
  onCancel: () => void;
}

/** 路由规则内联表单：用于添加新规则 */
const RoutingRuleForm: React.FC<RoutingRuleFormProps> = ({
  draft,
  configuredChannels,
  agents,
  onChange,
  onConfirm,
  onCancel,
}) => {
  const { t } = useI18n();

  /** 更新草稿字段的便捷方法 */
  const updateField = (field: string, value: any) => {
    onChange({ ...draft, [field]: value });
  };

  /** 更新匹配条件字段 */
  const updateMatch = (field: string, value: string) => {
    onChange({ ...draft, match: { ...draft.match, [field]: value } });
  };

  return (
    <div
      className="mb-4 rounded-lg p-4"
      style={{
        backgroundColor: 'var(--app-bg-subtle)',
        border: '1px solid var(--app-border)',
      }}
    >
      {/* 第一行：规则名称 + 优先级 */}
      <div className="mb-3 flex flex-wrap items-end gap-3">
        {/* 规则名称 */}
        <div className="flex-1" style={{ minWidth: '180px' }}>
          <label
            className="mb-1 block text-xs"
            style={{ color: 'var(--app-text-muted)' }}
          >
            {t('channels.routingRuleName' as any)}
          </label>
          <input
            type="text"
            value={draft.name}
            onChange={(e) => updateField('name', e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm outline-none"
            style={{
              backgroundColor: 'var(--app-bg)',
              border: '1px solid var(--app-border)',
              color: 'var(--app-text)',
            }}
            placeholder="VIP 用户路由"
          />
        </div>
        {/* 优先级 */}
        <div style={{ minWidth: '100px', maxWidth: '120px' }}>
          <label
            className="mb-1 block text-xs"
            style={{ color: 'var(--app-text-muted)' }}
          >
            {t('channels.routingRulePriority' as any)}
          </label>
          <input
            type="number"
            value={draft.priority}
            onChange={(e) => updateField('priority', Number(e.target.value) || 0)}
            className="w-full rounded-lg px-3 py-2 text-sm outline-none"
            style={{
              backgroundColor: 'var(--app-bg)',
              border: '1px solid var(--app-border)',
              color: 'var(--app-text)',
            }}
            placeholder="100"
          />
        </div>
      </div>

      {/* 第二行：匹配条件 */}
      <div className="mb-3">
        <label
          className="mb-2 block text-xs font-medium"
          style={{ color: 'var(--app-text-muted)' }}
        >
          {t('channels.routingRuleMatch' as any)}
        </label>
        <div className="flex flex-wrap items-end gap-3">
          {/* 渠道类型 */}
          <div className="flex-1" style={{ minWidth: '140px' }}>
            <label
              className="mb-1 block text-xs"
              style={{ color: 'var(--app-text-muted)' }}
            >
              {t('channels.bindingChannel' as any)}
            </label>
            <select
              value={draft.match.channel || ''}
              onChange={(e) => updateMatch('channel', e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{
                backgroundColor: 'var(--app-bg)',
                border: '1px solid var(--app-border)',
                color: 'var(--app-text)',
              }}
            >
              <option value="">— {t('channels.allChannels' as any)} —</option>
              {configuredChannels.map((ch) => (
                <option key={ch} value={ch}>
                  {ch}
                </option>
              ))}
            </select>
          </div>
          {/* 账号 ID */}
          <div className="flex-1" style={{ minWidth: '140px' }}>
            <label
              className="mb-1 block text-xs"
              style={{ color: 'var(--app-text-muted)' }}
            >
              {t('channels.bindingAccountId' as any)}
            </label>
            <input
              type="text"
              value={draft.match.accountId || ''}
              onChange={(e) => updateMatch('accountId', e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{
                backgroundColor: 'var(--app-bg)',
                border: '1px solid var(--app-border)',
                color: 'var(--app-text)',
              }}
              placeholder="default"
            />
          </div>
          {/* 消息来源 */}
          <div className="flex-1" style={{ minWidth: '140px' }}>
            <label
              className="mb-1 block text-xs"
              style={{ color: 'var(--app-text-muted)' }}
            >
              Source
            </label>
            <input
              type="text"
              value={draft.match.source || ''}
              onChange={(e) => updateMatch('source', e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{
                backgroundColor: 'var(--app-bg)',
                border: '1px solid var(--app-border)',
                color: 'var(--app-text)',
              }}
              placeholder="vip"
            />
          </div>
        </div>
      </div>

      {/* 第三行：目标 Agent */}
      <div className="mb-3">
        <label
          className="mb-1 block text-xs"
          style={{ color: 'var(--app-text-muted)' }}
        >
          {t('channels.routingRuleAgent' as any)}
        </label>
        <select
          value={draft.agentId}
          onChange={(e) => updateField('agentId', e.target.value)}
          className="w-full rounded-lg px-3 py-2 text-sm outline-none"
          style={{
            backgroundColor: 'var(--app-bg)',
            border: '1px solid var(--app-border)',
            color: 'var(--app-text)',
          }}
        >
          <option value="" disabled>
            — {t('channels.bindingAgentId' as any)} —
          </option>
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name || agent.id}
            </option>
          ))}
        </select>
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
// 路由规则编辑区域子组件
// ============================================================

interface RoutingRuleEditAreaProps {
  /** 当前规则数据 */
  rule: RoutingRule;
  /** 规则在原始数组中的索引 */
  originalIndex: number;
  /** 已配置的渠道类型列表 */
  configuredChannels: string[];
  /** Agent 列表 */
  agents: AgentInfo[];
  /** 完整配置对象 */
  config: any;
  /** 保存回调 */
  onSave: (updatedConfig: any) => Promise<void>;
}

/** 路由规则编辑区域：修改规则名称、匹配条件、目标 Agent、优先级 */
const RoutingRuleEditArea: React.FC<RoutingRuleEditAreaProps> = ({
  rule,
  originalIndex,
  configuredChannels,
  agents,
  config,
  onSave,
}) => {
  const { t } = useI18n();

  // ── 本地编辑状态（失焦或选择时保存） ──────────────────
  const [localName, setLocalName] = useState<string | null>(null);
  const [localAccountId, setLocalAccountId] = useState<string | null>(null);
  const [localSource, setLocalSource] = useState<string | null>(null);
  const [localPriority, setLocalPriority] = useState<number | null>(null);

  /** 显示值：优先使用本地编辑状态，否则使用规则原始值 */
  const nameDisplay = localName !== null ? localName : (rule.name || '');
  const accountIdDisplay = localAccountId !== null ? localAccountId : (rule.match.accountId || '');
  const sourceDisplay = localSource !== null ? localSource : (rule.match.source || '');
  const priorityDisplay = localPriority !== null ? localPriority : rule.priority;

  /** 更新单个字段并持久化 */
  const handleUpdateField = async (updates: Partial<RoutingRule>) => {
    const updated = updateRoutingRule(config, originalIndex, updates);
    await onSave(updated);
  };

  /** 更新匹配条件字段并持久化 */
  const handleUpdateMatch = async (field: string, value: string) => {
    const updated = updateRoutingRule(config, originalIndex, {
      match: { ...rule.match, [field]: value },
    });
    await onSave(updated);
  };

  return (
    <div
      className="border-t px-4 py-4"
      style={{ borderColor: 'var(--app-border)' }}
    >
      {/* 规则名称编辑 */}
      <div className="mb-4">
        <label
          className="mb-1 block text-xs font-medium"
          style={{ color: 'var(--app-text-muted)' }}
        >
          {t('channels.routingRuleName' as any)}
        </label>
        <input
          type="text"
          value={nameDisplay}
          onChange={(e) => setLocalName(e.target.value)}
          onBlur={() => {
            if (localName !== null) {
              handleUpdateField({ name: localName });
              setLocalName(null);
            }
          }}
          className="w-full rounded-lg px-3 py-2 text-sm outline-none"
          style={{
            backgroundColor: 'var(--app-bg)',
            border: '1px solid var(--app-border)',
            color: 'var(--app-text)',
          }}
        />
      </div>

      {/* 优先级编辑 */}
      <div className="mb-4">
        <label
          className="mb-1 block text-xs font-medium"
          style={{ color: 'var(--app-text-muted)' }}
        >
          {t('channels.routingRulePriority' as any)}
        </label>
        <input
          type="number"
          value={priorityDisplay}
          onChange={(e) => setLocalPriority(Number(e.target.value) || 0)}
          onBlur={() => {
            if (localPriority !== null) {
              handleUpdateField({ priority: localPriority });
              setLocalPriority(null);
            }
          }}
          className="w-full rounded-lg px-3 py-2 text-sm outline-none"
          style={{
            backgroundColor: 'var(--app-bg)',
            border: '1px solid var(--app-border)',
            color: 'var(--app-text)',
          }}
        />
      </div>

      {/* 匹配条件编辑 */}
      <div className="mb-4">
        <label
          className="mb-2 block text-xs font-medium"
          style={{ color: 'var(--app-text-muted)' }}
        >
          {t('channels.routingRuleMatch' as any)}
        </label>
        <div className="flex flex-wrap items-end gap-3">
          {/* 渠道类型 */}
          <div className="flex-1" style={{ minWidth: '140px' }}>
            <label
              className="mb-1 block text-xs"
              style={{ color: 'var(--app-text-muted)' }}
            >
              {t('channels.bindingChannel' as any)}
            </label>
            <select
              value={rule.match.channel || ''}
              onChange={(e) => handleUpdateMatch('channel', e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{
                backgroundColor: 'var(--app-bg)',
                border: '1px solid var(--app-border)',
                color: 'var(--app-text)',
              }}
            >
              <option value="">— {t('channels.allChannels' as any)} —</option>
              {configuredChannels.map((ch) => (
                <option key={ch} value={ch}>
                  {ch}
                </option>
              ))}
            </select>
          </div>
          {/* 账号 ID */}
          <div className="flex-1" style={{ minWidth: '140px' }}>
            <label
              className="mb-1 block text-xs"
              style={{ color: 'var(--app-text-muted)' }}
            >
              {t('channels.bindingAccountId' as any)}
            </label>
            <input
              type="text"
              value={accountIdDisplay}
              onChange={(e) => setLocalAccountId(e.target.value)}
              onBlur={() => {
                if (localAccountId !== null) {
                  handleUpdateMatch('accountId', localAccountId);
                  setLocalAccountId(null);
                }
              }}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{
                backgroundColor: 'var(--app-bg)',
                border: '1px solid var(--app-border)',
                color: 'var(--app-text)',
              }}
              placeholder="default"
            />
          </div>
          {/* 消息来源 */}
          <div className="flex-1" style={{ minWidth: '140px' }}>
            <label
              className="mb-1 block text-xs"
              style={{ color: 'var(--app-text-muted)' }}
            >
              Source
            </label>
            <input
              type="text"
              value={sourceDisplay}
              onChange={(e) => setLocalSource(e.target.value)}
              onBlur={() => {
                if (localSource !== null) {
                  handleUpdateMatch('source', localSource);
                  setLocalSource(null);
                }
              }}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{
                backgroundColor: 'var(--app-bg)',
                border: '1px solid var(--app-border)',
                color: 'var(--app-text)',
              }}
              placeholder="vip"
            />
          </div>
        </div>
      </div>

      {/* 目标 Agent 编辑 */}
      <div>
        <label
          className="mb-1 block text-xs font-medium"
          style={{ color: 'var(--app-text-muted)' }}
        >
          {t('channels.routingRuleAgent' as any)}
        </label>
        <select
          value={rule.agentId || ''}
          onChange={(e) => handleUpdateField({ agentId: e.target.value })}
          className="w-full rounded-lg px-3 py-2 text-sm outline-none"
          style={{
            backgroundColor: 'var(--app-bg)',
            border: '1px solid var(--app-border)',
            color: 'var(--app-text)',
          }}
        >
          <option value="" disabled>
            — {t('channels.bindingAgentId' as any)} —
          </option>
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name || agent.id}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};

export default ChannelRoutingConfig;
