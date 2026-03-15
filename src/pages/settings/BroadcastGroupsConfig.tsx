/**
 * 广播群组配置组件（BroadcastGroupsConfig）
 * 管理广播群组的配置，实现多目标消息推送
 * - 广播群组列表展示：群组名称、目标渠道列表、启用状态
 * - 添加广播群组：表单输入名称，多选目标渠道和群组
 * - 编辑广播群组：修改名称、添加/移除目标、切换启用状态
 * - 删除广播群组：确认后删除
 * - 所有变更通过 onSave 回调持久化到 openclaw.json
 */
import React, { useState } from 'react';
import { Plus, Trash2, Edit, Radio } from 'lucide-react';
import AppButton from '../../components/AppButton';
import GlassCard from '../../components/GlassCard';
import { useI18n } from '../../i18n/I18nContext';
import {
  addBroadcastGroup,
  updateBroadcastGroup,
  deleteBroadcastGroup,
} from '../../utils/channelOps';
import type { BroadcastTarget } from '../../utils/channelOps';

// ============================================================
// 组件属性接口
// ============================================================

interface BroadcastGroupsConfigProps {
  /** 完整的 OpenClaw 配置对象 */
  config: any;
  /** 已配置的渠道类型列表，用于目标选择 */
  configuredChannels: string[];
  /** 已配置的群组，用于目标选择 */
  groups: Record<string, any>;
  /** 保存回调，将更新后的配置持久化 */
  onSave: (updatedConfig: any) => Promise<void>;
}

// ============================================================
// BroadcastGroupsConfig 组件
// ============================================================

const BroadcastGroupsConfig: React.FC<BroadcastGroupsConfigProps> = ({
  config,
  configuredChannels,
  groups,
  onSave,
}) => {
  const { t } = useI18n();

  // ── 添加广播群组表单状态 ──────────────────────────────
  const [showAddForm, setShowAddForm] = useState(false);
  const [newGroupId, setNewGroupId] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  /** 添加表单中选中的目标 */
  const [newTargets, setNewTargets] = useState<BroadcastTarget[]>([]);
  /** 当前展开编辑的广播群组 ID */
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  /** 待确认删除的广播群组 ID */
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // ── 从配置中读取广播群组数据 ──────────────────────────
  const broadcastGroups: Record<string, any> = (config as any)?.broadcastGroups || {};
  const groupIds = Object.keys(broadcastGroups);
  /** 已配置的群组 ID 列表 */
  const availableGroupIds = Object.keys(groups);

  // ── 目标选择切换（添加表单用） ────────────────────────
  const toggleNewTarget = (target: BroadcastTarget) => {
    const exists = newTargets.some(
      (t) => t.type === target.type && t.id === target.id,
    );
    if (exists) {
      setNewTargets(newTargets.filter(
        (t) => !(t.type === target.type && t.id === target.id),
      ));
    } else {
      setNewTargets([...newTargets, target]);
    }
  };

  /** 检查目标是否已选中 */
  const isNewTargetSelected = (type: string, id: string) =>
    newTargets.some((t) => t.type === type && t.id === id);

  // ── 添加广播群组处理 ──────────────────────────────────
  const handleAddGroup = async () => {
    const trimmedId = newGroupId.trim();
    const trimmedName = newGroupName.trim();
    if (!trimmedId || !trimmedName) return;

    const updated = addBroadcastGroup(config, trimmedId, {
      name: trimmedName,
      targets: newTargets,
      enabled: true,
    });
    await onSave(updated);

    // 重置表单
    setNewGroupId('');
    setNewGroupName('');
    setNewTargets([]);
    setShowAddForm(false);
  };

  // ── 删除广播群组处理 ──────────────────────────────────
  const handleDeleteGroup = async (groupId: string) => {
    const updated = deleteBroadcastGroup(config, groupId);
    await onSave(updated);
    setConfirmDeleteId(null);
    if (editingGroupId === groupId) setEditingGroupId(null);
  };

  return (
    <GlassCard className="rounded-2xl p-6">
      {/* 标题区域 */}
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <Radio className="h-5 w-5" style={{ color: 'var(--app-text-muted)' }} />
          <h3 className="text-lg font-semibold" style={{ color: 'var(--app-text)' }}>
            {t('channels.broadcastGroups' as any)}
          </h3>
        </div>
        <p className="mt-1 text-sm" style={{ color: 'var(--app-text-muted)' }}>
          {t('channels.broadcastGroupsDescription' as any)}
        </p>
      </div>

      {/* 添加广播群组按钮 */}
      <div className="mb-4 flex items-center justify-end">
        <AppButton
          size="xs"
          variant="primary"
          icon={<Plus className="h-3.5 w-3.5" />}
          onClick={() => setShowAddForm(true)}
        >
          {t('channels.broadcastGroupsAdd' as any)}
        </AppButton>
      </div>

      {/* 添加广播群组内联表单 */}
      {showAddForm && (
        <div
          className="mb-4 rounded-lg p-4"
          style={{
            backgroundColor: 'var(--app-bg-subtle)',
            border: '1px solid var(--app-border)',
          }}
        >
          <div className="mb-3 flex flex-wrap items-end gap-3">
            {/* 广播群组 ID 输入 */}
            <div className="flex-1" style={{ minWidth: '140px' }}>
              <label
                className="mb-1 block text-xs"
                style={{ color: 'var(--app-text-muted)' }}
              >
                ID
              </label>
              <input
                type="text"
                value={newGroupId}
                onChange={(e) => setNewGroupId(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={{
                  backgroundColor: 'var(--app-bg)',
                  border: '1px solid var(--app-border)',
                  color: 'var(--app-text)',
                }}
                placeholder="broadcast-all"
              />
            </div>
            {/* 广播群组名称输入 */}
            <div className="flex-1" style={{ minWidth: '140px' }}>
              <label
                className="mb-1 block text-xs"
                style={{ color: 'var(--app-text-muted)' }}
              >
                {t('channels.broadcastGroupsName' as any)}
              </label>
              <input
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={{
                  backgroundColor: 'var(--app-bg)',
                  border: '1px solid var(--app-border)',
                  color: 'var(--app-text)',
                }}
                placeholder="全渠道广播"
              />
            </div>
          </div>

          {/* 目标选择区域 */}
          <div className="mb-3">
            <label
              className="mb-2 block text-xs font-medium"
              style={{ color: 'var(--app-text-muted)' }}
            >
              {t('channels.broadcastGroupsTargets' as any)}
            </label>
            <div className="flex flex-wrap gap-2">
              {/* 渠道目标 */}
              {configuredChannels.map((ch) => (
                <label
                  key={`ch-${ch}`}
                  className="flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-colors"
                  style={{
                    backgroundColor: isNewTargetSelected('channel', ch)
                      ? 'var(--app-active-bg, rgba(59,130,246,0.15))'
                      : 'var(--app-bg)',
                    border: `1px solid ${isNewTargetSelected('channel', ch) ? 'var(--app-active-border, #3b82f6)' : 'var(--app-border)'}`,
                    color: isNewTargetSelected('channel', ch)
                      ? 'var(--app-active-text, #3b82f6)'
                      : 'var(--app-text)',
                  }}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={isNewTargetSelected('channel', ch)}
                    onChange={() => toggleNewTarget({ type: 'channel', id: ch })}
                  />
                  <span>📡 {ch}</span>
                </label>
              ))}
              {/* 群组目标 */}
              {availableGroupIds.map((gid) => (
                <label
                  key={`grp-${gid}`}
                  className="flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-colors"
                  style={{
                    backgroundColor: isNewTargetSelected('group', gid)
                      ? 'var(--app-active-bg, rgba(59,130,246,0.15))'
                      : 'var(--app-bg)',
                    border: `1px solid ${isNewTargetSelected('group', gid) ? 'var(--app-active-border, #3b82f6)' : 'var(--app-border)'}`,
                    color: isNewTargetSelected('group', gid)
                      ? 'var(--app-active-text, #3b82f6)'
                      : 'var(--app-text)',
                  }}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={isNewTargetSelected('group', gid)}
                    onChange={() => toggleNewTarget({ type: 'group', id: gid })}
                  />
                  <span>👥 {gid}</span>
                </label>
              ))}
            </div>
          </div>

          {/* 操作按钮 */}
          <div className="flex gap-2">
            <AppButton size="sm" variant="primary" onClick={handleAddGroup}>
              {t('common.confirm' as any)}
            </AppButton>
            <AppButton
              size="sm"
              variant="secondary"
              onClick={() => {
                setShowAddForm(false);
                setNewGroupId('');
                setNewGroupName('');
                setNewTargets([]);
              }}
            >
              {t('common.cancel' as any)}
            </AppButton>
          </div>
        </div>
      )}

      {/* 广播群组列表 */}
      {groupIds.length === 0 ? (
        <div
          className="rounded-lg py-8 text-center text-sm"
          style={{
            color: 'var(--app-text-muted)',
            backgroundColor: 'var(--app-bg-subtle)',
            border: '1px solid var(--app-border)',
          }}
        >
          {t('channels.broadcastGroupsNoGroups' as any)}
        </div>
      ) : (
        <div className="space-y-2">
          {groupIds.map((gid) => {
            const group = broadcastGroups[gid] || {};
            const targets: BroadcastTarget[] = group.targets || [];
            const isEditing = editingGroupId === gid;
            const isConfirmingDelete = confirmDeleteId === gid;

            return (
              <div
                key={gid}
                className="rounded-lg"
                style={{
                  backgroundColor: 'var(--app-bg-subtle)',
                  border: '1px solid var(--app-border)',
                }}
              >
                {/* 广播群组卡片头部 */}
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="flex flex-wrap items-center gap-3">
                    {/* 群组名称 */}
                    <span
                      className="text-sm font-medium"
                      style={{ color: 'var(--app-text)' }}
                    >
                      {group.name || gid}
                    </span>
                    {/* 目标数量摘要 */}
                    <span
                      className="rounded-full px-2 py-0.5 text-xs"
                      style={{
                        backgroundColor: 'var(--app-active-bg, rgba(59,130,246,0.1))',
                        color: 'var(--app-active-text, #3b82f6)',
                      }}
                    >
                      {targets.length} {t('channels.broadcastGroupsTargets' as any).toLowerCase()}
                    </span>
                    {/* 启用状态徽章 */}
                    <span
                      className="rounded-full px-2 py-0.5 text-xs"
                      style={{
                        backgroundColor:
                          group.enabled !== false
                            ? 'rgba(34,197,94,0.15)'
                            : 'rgba(156,163,175,0.15)',
                        color:
                          group.enabled !== false
                            ? 'var(--app-success, #22c55e)'
                            : 'var(--app-text-muted)',
                      }}
                    >
                      {group.enabled !== false
                        ? t('channels.channelEnabled' as any)
                        : t('channels.channelDisabled' as any)}
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
                        setEditingGroupId(isEditing ? null : gid)
                      }
                    >
                      {t('channels.broadcastGroupsEdit' as any)}
                    </AppButton>

                    {/* 删除按钮 / 确认删除 */}
                    {isConfirmingDelete ? (
                      <div className="flex items-center gap-2">
                        <AppButton
                          size="xs"
                          variant="danger"
                          onClick={() => handleDeleteGroup(gid)}
                        >
                          {t('common.confirm' as any)}
                        </AppButton>
                        <AppButton
                          size="xs"
                          variant="secondary"
                          onClick={() => setConfirmDeleteId(null)}
                        >
                          {t('common.cancel' as any)}
                        </AppButton>
                      </div>
                    ) : (
                      <AppButton
                        size="xs"
                        variant="danger"
                        icon={<Trash2 className="h-3.5 w-3.5" />}
                        onClick={() => setConfirmDeleteId(gid)}
                      >
                        {t('channels.broadcastGroupsDelete' as any)}
                      </AppButton>
                    )}
                  </div>
                </div>

                {/* 编辑区域（展开时显示） */}
                {isEditing && (
                  <BroadcastGroupEditArea
                    groupId={gid}
                    group={group}
                    configuredChannels={configuredChannels}
                    availableGroupIds={availableGroupIds}
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
// 广播群组编辑区域子组件
// ============================================================

interface BroadcastGroupEditAreaProps {
  /** 广播群组 ID */
  groupId: string;
  /** 当前广播群组数据 */
  group: any;
  /** 已配置的渠道类型列表 */
  configuredChannels: string[];
  /** 可选的群组 ID 列表 */
  availableGroupIds: string[];
  /** 完整配置对象 */
  config: any;
  /** 保存回调 */
  onSave: (updatedConfig: any) => Promise<void>;
}

/** 广播群组编辑区域：修改名称、目标列表、启用状态 */
const BroadcastGroupEditArea: React.FC<BroadcastGroupEditAreaProps> = ({
  groupId,
  group,
  configuredChannels,
  availableGroupIds,
  config,
  onSave,
}) => {
  const { t } = useI18n();

  // ── 本地编辑状态 ──────────────────────────────────────
  const [localName, setLocalName] = useState<string | null>(null);
  const nameDisplay = localName !== null ? localName : (group.name || '');
  const enabled: boolean = group.enabled !== false;
  const targets: BroadcastTarget[] = group.targets || [];

  /** 检查目标是否已选中 */
  const isTargetSelected = (type: string, id: string) =>
    targets.some((t: BroadcastTarget) => t.type === type && t.id === id);

  /** 切换目标选中状态并持久化 */
  const toggleTarget = async (target: BroadcastTarget) => {
    const exists = targets.some(
      (t: BroadcastTarget) => t.type === target.type && t.id === target.id,
    );
    const newTargets = exists
      ? targets.filter(
          (t: BroadcastTarget) => !(t.type === target.type && t.id === target.id),
        )
      : [...targets, target];

    const updated = updateBroadcastGroup(config, groupId, { targets: newTargets });
    await onSave(updated);
  };

  /** 更新单个字段并持久化 */
  const handleUpdateField = async (field: string, value: any) => {
    const updated = updateBroadcastGroup(config, groupId, { [field]: value });
    await onSave(updated);
  };

  return (
    <div
      className="border-t px-4 py-4"
      style={{ borderColor: 'var(--app-border)' }}
    >
      {/* 群组名称编辑 */}
      <div className="mb-4">
        <label
          className="mb-1 block text-xs font-medium"
          style={{ color: 'var(--app-text-muted)' }}
        >
          {t('channels.broadcastGroupsName' as any)}
        </label>
        <input
          type="text"
          value={nameDisplay}
          onChange={(e) => setLocalName(e.target.value)}
          onBlur={() => {
            if (localName !== null) {
              handleUpdateField('name', localName);
              setLocalName(null);
            }
          }}
          className="w-full rounded-lg px-3 py-2 text-sm outline-none"
          style={{
            backgroundColor: 'var(--app-bg)',
            border: '1px solid var(--app-border)',
            color: 'var(--app-text)',
          }}
          placeholder="全渠道广播"
        />
      </div>

      {/* 启用状态开关 */}
      <div className="mb-4 flex items-center justify-between">
        <label
          className="text-xs font-medium"
          style={{ color: 'var(--app-text-muted)' }}
        >
          {t('channels.broadcastGroupsEnabled' as any)}
        </label>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => handleUpdateField('enabled', !enabled)}
          className="relative inline-flex h-5 w-9 cursor-pointer items-center rounded-full transition-colors duration-200"
          style={{
            backgroundColor: enabled
              ? 'var(--app-active-bg, rgba(59,130,246,0.5))'
              : 'var(--app-bg, #374151)',
            border: `1px solid ${enabled ? 'var(--app-active-border, #3b82f6)' : 'var(--app-border)'}`,
          }}
        >
          <span
            className="inline-block h-3 w-3 rounded-full transition-transform duration-200"
            style={{
              backgroundColor: enabled
                ? 'var(--app-active-text, #3b82f6)'
                : 'var(--app-text-muted)',
              transform: enabled ? 'translateX(18px)' : 'translateX(3px)',
            }}
          />
        </button>
      </div>

      {/* 目标选择区域 */}
      <div>
        <label
          className="mb-2 block text-xs font-medium"
          style={{ color: 'var(--app-text-muted)' }}
        >
          {t('channels.broadcastGroupsTargets' as any)}
        </label>
        <div className="flex flex-wrap gap-2">
          {/* 渠道目标 */}
          {configuredChannels.map((ch) => (
            <label
              key={`ch-${ch}`}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-colors"
              style={{
                backgroundColor: isTargetSelected('channel', ch)
                  ? 'var(--app-active-bg, rgba(59,130,246,0.15))'
                  : 'var(--app-bg)',
                border: `1px solid ${isTargetSelected('channel', ch) ? 'var(--app-active-border, #3b82f6)' : 'var(--app-border)'}`,
                color: isTargetSelected('channel', ch)
                  ? 'var(--app-active-text, #3b82f6)'
                  : 'var(--app-text)',
              }}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={isTargetSelected('channel', ch)}
                onChange={() => toggleTarget({ type: 'channel', id: ch })}
              />
              <span>📡 {ch}</span>
            </label>
          ))}
          {/* 群组目标 */}
          {availableGroupIds.map((gid) => (
            <label
              key={`grp-${gid}`}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-colors"
              style={{
                backgroundColor: isTargetSelected('group', gid)
                  ? 'var(--app-active-bg, rgba(59,130,246,0.15))'
                  : 'var(--app-bg)',
                border: `1px solid ${isTargetSelected('group', gid) ? 'var(--app-active-border, #3b82f6)' : 'var(--app-border)'}`,
                color: isTargetSelected('group', gid)
                  ? 'var(--app-active-text, #3b82f6)'
                  : 'var(--app-text)',
              }}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={isTargetSelected('group', gid)}
                onChange={() => toggleTarget({ type: 'group', id: gid })}
              />
              <span>👥 {gid}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
};

export default BroadcastGroupsConfig;
