/**
 * 群组管理组件（GroupsManager）
 * 管理已知群组及其配置
 * - 群组列表展示：群组 ID、所属渠道、群组名称、启用状态
 * - 添加群组：表单输入群组 ID、所属渠道、群组名称；重复检测
 * - 编辑群组：展开编辑区域，修改名称、启用状态、消息处理策略
 * - 删除群组：确认后删除
 * - 所有变更通过 onSave 回调持久化到 openclaw.json
 */
import React, { useState } from 'react';
import { Plus, Trash2, Edit, Users } from 'lucide-react';
import AppButton from '../../components/AppButton';
import GlassCard from '../../components/GlassCard';
import { useI18n } from '../../i18n/I18nContext';
import {
  addGroup,
  updateGroup,
  deleteGroup,
  isGroupIdDuplicate,
} from '../../utils/channelOps';

// ============================================================
// 组件属性接口
// ============================================================

interface GroupsManagerProps {
  /** 完整的 OpenClaw 配置对象 */
  config: any;
  /** 已配置的渠道类型列表，用于所属渠道选择 */
  configuredChannels: string[];
  /** 保存回调，将更新后的配置持久化 */
  onSave: (updatedConfig: any) => Promise<void>;
}

// ============================================================
// GroupsManager 组件
// ============================================================

const GroupsManager: React.FC<GroupsManagerProps> = ({
  config,
  configuredChannels,
  onSave,
}) => {
  const { t } = useI18n();

  // ── 添加群组表单状态 ──────────────────────────────────
  const [showAddForm, setShowAddForm] = useState(false);
  const [newGroupId, setNewGroupId] = useState('');
  const [newGroupChannel, setNewGroupChannel] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  /** 群组 ID 重复错误 */
  const [duplicateError, setDuplicateError] = useState('');
  /** 当前展开编辑的群组 ID */
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  /** 待确认删除的群组 ID */
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // ── 从配置中读取群组数据 ──────────────────────────────
  const groups: Record<string, any> = (config as any)?.groups || {};
  const groupIds = Object.keys(groups);

  // ── 添加群组处理 ──────────────────────────────────────
  const handleAddGroup = async () => {
    const trimmedId = newGroupId.trim();
    if (!trimmedId || !newGroupChannel) return;

    // 重复检测
    if (isGroupIdDuplicate(config, trimmedId)) {
      setDuplicateError(t('channels.groupsGroupIdDuplicate' as any));
      return;
    }

    setDuplicateError('');
    const updated = addGroup(config, trimmedId, {
      channel: newGroupChannel,
      name: newGroupName.trim() || undefined,
      enabled: true,
    });
    await onSave(updated);

    // 重置表单
    setNewGroupId('');
    setNewGroupChannel('');
    setNewGroupName('');
    setShowAddForm(false);
  };

  // ── 更新群组字段处理 ──────────────────────────────────
  const handleUpdateField = async (groupId: string, field: string, value: any) => {
    const updated = updateGroup(config, groupId, { [field]: value });
    await onSave(updated);
  };

  // ── 删除群组处理 ──────────────────────────────────────
  const handleDeleteGroup = async (groupId: string) => {
    const updated = deleteGroup(config, groupId);
    await onSave(updated);
    setConfirmDeleteId(null);
    if (editingGroupId === groupId) setEditingGroupId(null);
  };

  return (
    <GlassCard className="rounded-2xl p-6">
      {/* 标题区域 */}
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5" style={{ color: 'var(--app-text-muted)' }} />
          <h3 className="text-lg font-semibold" style={{ color: 'var(--app-text)' }}>
            {t('channels.groups' as any)}
          </h3>
        </div>
        <p className="mt-1 text-sm" style={{ color: 'var(--app-text-muted)' }}>
          {t('channels.groupsDescription' as any)}
        </p>
      </div>

      {/* 添加群组按钮 */}
      <div className="mb-4 flex items-center justify-end">
        <AppButton
          size="xs"
          variant="primary"
          icon={<Plus className="h-3.5 w-3.5" />}
          onClick={() => setShowAddForm(true)}
        >
          {t('channels.groupsAddGroup' as any)}
        </AppButton>
      </div>

      {/* 添加群组内联表单 */}
      {showAddForm && (
        <div
          className="mb-4 flex flex-wrap items-end gap-3 rounded-lg p-4"
          style={{
            backgroundColor: 'var(--app-bg-subtle)',
            border: '1px solid var(--app-border)',
          }}
        >
          {/* 群组 ID 输入 */}
          <div className="flex-1" style={{ minWidth: '140px' }}>
            <label
              className="mb-1 block text-xs"
              style={{ color: 'var(--app-text-muted)' }}
            >
              {t('channels.groupsGroupId' as any)}
            </label>
            <input
              type="text"
              value={newGroupId}
              onChange={(e) => {
                setNewGroupId(e.target.value);
                setDuplicateError('');
              }}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{
                backgroundColor: 'var(--app-bg)',
                border: `1px solid ${duplicateError ? 'var(--app-error, #ef4444)' : 'var(--app-border)'}`,
                color: 'var(--app-text)',
              }}
              placeholder="group-feishu-001"
            />
            {duplicateError && (
              <p className="mt-1 text-xs" style={{ color: 'var(--app-error, #ef4444)' }}>
                {duplicateError}
              </p>
            )}
          </div>
          {/* 所属渠道选择 */}
          <div className="flex-1" style={{ minWidth: '140px' }}>
            <label
              className="mb-1 block text-xs"
              style={{ color: 'var(--app-text-muted)' }}
            >
              {t('channels.groupsGroupChannel' as any)}
            </label>
            <select
              value={newGroupChannel}
              onChange={(e) => setNewGroupChannel(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{
                backgroundColor: 'var(--app-bg)',
                border: '1px solid var(--app-border)',
                color: 'var(--app-text)',
              }}
            >
              <option value="" disabled>
                — select —
              </option>
              {configuredChannels.map((ch) => (
                <option key={ch} value={ch}>
                  {ch}
                </option>
              ))}
            </select>
          </div>
          {/* 群组名称输入 */}
          <div className="flex-1" style={{ minWidth: '140px' }}>
            <label
              className="mb-1 block text-xs"
              style={{ color: 'var(--app-text-muted)' }}
            >
              {t('channels.groupsGroupName' as any)}
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
              placeholder="技术讨论群"
            />
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
                setNewGroupChannel('');
                setNewGroupName('');
                setDuplicateError('');
              }}
            >
              {t('common.cancel' as any)}
            </AppButton>
          </div>
        </div>
      )}

      {/* 群组列表 */}
      {groupIds.length === 0 ? (
        <div
          className="rounded-lg py-8 text-center text-sm"
          style={{
            color: 'var(--app-text-muted)',
            backgroundColor: 'var(--app-bg-subtle)',
            border: '1px solid var(--app-border)',
          }}
        >
          {t('channels.groupsNoGroups' as any)}
        </div>
      ) : (
        <div className="space-y-2">
          {groupIds.map((gid) => {
            const group = groups[gid] || {};
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
                {/* 群组卡片头部 */}
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="flex flex-wrap items-center gap-3">
                    {/* 群组 ID */}
                    <span
                      className="text-sm font-medium"
                      style={{ color: 'var(--app-text)' }}
                    >
                      {gid}
                    </span>
                    {/* 所属渠道 */}
                    <span
                      className="rounded-full px-2 py-0.5 text-xs"
                      style={{
                        backgroundColor: 'var(--app-active-bg, rgba(59,130,246,0.1))',
                        color: 'var(--app-active-text, #3b82f6)',
                      }}
                    >
                      {group.channel || '—'}
                    </span>
                    {/* 群组名称 */}
                    {group.name && (
                      <span
                        className="text-sm"
                        style={{ color: 'var(--app-text-muted)' }}
                      >
                        {group.name}
                      </span>
                    )}
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
                      {t('channels.groupsEditGroup' as any)}
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
                        {t('channels.groupsDeleteGroup' as any)}
                      </AppButton>
                    )}
                  </div>
                </div>

                {/* 编辑区域（展开时显示） */}
                {isEditing && (
                  <GroupEditArea
                    group={group}
                    onUpdateField={(field, value) =>
                      handleUpdateField(gid, field, value)
                    }
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
// 群组编辑区域子组件
// ============================================================

interface GroupEditAreaProps {
  /** 当前群组数据 */
  group: any;
  /** 更新群组字段回调 */
  onUpdateField: (field: string, value: any) => Promise<void>;
}

/** 群组编辑区域：修改名称、启用状态、消息处理策略 */
const GroupEditArea: React.FC<GroupEditAreaProps> = ({ group, onUpdateField }) => {
  const { t } = useI18n();

  // ── 本地编辑状态（失焦时保存） ──────────────────────────
  const [localName, setLocalName] = useState<string | null>(null);
  const nameDisplay = localName !== null ? localName : (group.name || '');

  const enabled: boolean = group.enabled !== false;

  // ── 消息处理策略 ──────────────────────────────────────
  const messagePolicy = group.messagePolicy || {};
  const policyRequireMention: boolean = messagePolicy.requireMention ?? false;

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
          {t('channels.groupsGroupName' as any)}
        </label>
        <input
          type="text"
          value={nameDisplay}
          onChange={(e) => setLocalName(e.target.value)}
          onBlur={() => {
            if (localName !== null) {
              onUpdateField('name', localName);
              setLocalName(null);
            }
          }}
          className="w-full rounded-lg px-3 py-2 text-sm outline-none"
          style={{
            backgroundColor: 'var(--app-bg)',
            border: '1px solid var(--app-border)',
            color: 'var(--app-text)',
          }}
          placeholder="技术讨论群"
        />
      </div>

      {/* 启用状态开关 */}
      <div className="mb-4 flex items-center justify-between">
        <label
          className="text-xs font-medium"
          style={{ color: 'var(--app-text-muted)' }}
        >
          {t('channels.groupsGroupEnabled' as any)}
        </label>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => onUpdateField('enabled', !enabled)}
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

      {/* 群组级消息处理策略：requireMention 开关 */}
      <div className="flex items-center justify-between">
        <label
          className="text-xs font-medium"
          style={{ color: 'var(--app-text-muted)' }}
        >
          {t('channels.groupMessagesRequireMention' as any)}
        </label>
        <button
          type="button"
          role="switch"
          aria-checked={policyRequireMention}
          onClick={() =>
            onUpdateField('messagePolicy', {
              ...messagePolicy,
              requireMention: !policyRequireMention,
            })
          }
          className="relative inline-flex h-5 w-9 cursor-pointer items-center rounded-full transition-colors duration-200"
          style={{
            backgroundColor: policyRequireMention
              ? 'var(--app-active-bg, rgba(59,130,246,0.5))'
              : 'var(--app-bg, #374151)',
            border: `1px solid ${policyRequireMention ? 'var(--app-active-border, #3b82f6)' : 'var(--app-border)'}`,
          }}
        >
          <span
            className="inline-block h-3 w-3 rounded-full transition-transform duration-200"
            style={{
              backgroundColor: policyRequireMention
                ? 'var(--app-active-text, #3b82f6)'
                : 'var(--app-text-muted)',
              transform: policyRequireMention ? 'translateX(18px)' : 'translateX(3px)',
            }}
          />
        </button>
      </div>
    </div>
  );
};

export default GroupsManager;
