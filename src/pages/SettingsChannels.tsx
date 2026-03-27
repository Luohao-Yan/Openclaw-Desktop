/**
 * 渠道配置中心 - 完整重构版
 * 支持 22 种渠道类型的通用配置管理，包括：
 * - 多渠道列表与管理（添加/删除）
 * - 渠道详情面板（Feishu 结构化表单 / 通用 JSON 编辑器）
 * - 账号管理（添加/编辑/删除）
 * - 状态摘要栏
 * 注：绑定管理已移至 Agent 页面（AgentWorkspace），此处仅做只读展示
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Code,
  Loader2,
  MessageSquare,
  Play,
  Plus,
  RefreshCw,
  Save,
  Terminal,
  Trash2,
} from 'lucide-react';
import AppButton from '../components/AppButton';
import AppSelect, { type AppSelectOption } from '../components/AppSelect';
import GlassCard from '../components/GlassCard';
import { useI18n } from '../i18n/I18nContext';
import type { AgentInfo } from '../../types/electron';

// ── 导入渠道操作纯函数 ──────────────────────────────────────────────────────
import {
  computeChannelSummary,
  getChannelBindingCount,
  addChannelToConfig,
  deleteChannelFromConfig,
  updateChannelConfig,
  addAccountToChannel,
  deleteAccountFromChannel,
  updateAccountConfig,
  SUPPORTED_CHANNEL_TYPES,
} from '../utils/channelOps';

// ── 导入 Modal 弹窗组件 ──────────────────────────────────────────────────────
import ChannelConfigModal from './settings/ChannelConfigModal';
import AddChannelModal from './settings/AddChannelModal';

// ── 导入高级配置子组件 ──────────────────────────────────────────────────────
import PairingManager from './settings/PairingManager';
import GroupMessagesConfig from './settings/GroupMessagesConfig';
import GroupsManager from './settings/GroupsManager';
import BroadcastGroupsConfig from './settings/BroadcastGroupsConfig';
import ChannelRoutingConfig from './settings/ChannelRoutingConfig';
import LocationParsingConfig from './settings/LocationParsingConfig';
import TroubleshootingPanel from './settings/TroubleshootingPanel';

// ============================================================
// 类型定义（保留 Feishu 结构化表单所需类型）
// ============================================================

type ChannelDomain = 'feishu' | 'lark';
type ChannelConnectionMode = 'websocket' | 'webhook';
type DmPolicy = 'pairing' | 'allowlist' | 'open' | 'disabled';
type GroupPolicy = 'open' | 'allowlist' | 'disabled';
type PeerKind = 'direct' | 'group';

/** Feishu 渠道 Footer 配置 */
interface ChannelFooterConfig {
  elapsed?: boolean;
  status?: boolean;
}

/** Feishu 账号配置接口 */
interface FeishuAccountConfig {
  allowFrom?: string[];
  appId?: string;
  appSecret?: string;
  blockStreaming?: boolean;
  botName?: string;
  dmPolicy?: DmPolicy;
  domain?: ChannelDomain;
  enabled?: boolean;
  footer?: ChannelFooterConfig;
  groupPolicy?: GroupPolicy;
  requireMention?: boolean;
  resolveSenderNames?: boolean;
  streaming?: boolean;
  textChunkLimit?: number;
  typingIndicator?: boolean;
}

/** Feishu 渠道顶层配置接口 */
interface FeishuChannelConfig {
  accounts?: Record<string, FeishuAccountConfig>;
  allowFrom?: string[];
  appId?: string;
  appSecret?: string;
  blockStreaming?: boolean;
  connectionMode?: ChannelConnectionMode;
  defaultAccount?: string;
  dmPolicy?: DmPolicy;
  domain?: ChannelDomain;
  enabled?: boolean;
  footer?: ChannelFooterConfig;
  groupAllowFrom?: string[];
  groupPolicy?: GroupPolicy;
  mediaMaxMb?: number;
  requireMention?: boolean;
  resolveSenderNames?: boolean;
  streaming?: boolean;
  textChunkLimit?: number;
  typingIndicator?: boolean;
  verificationToken?: string;
  webhookHost?: string;
  webhookPath?: string;
  webhookPort?: number;
}

/** 渠道绑定记录（UI 层扩展，支持 peer 和 type） */
interface ChannelBinding {
  agentId: string;
  enabled?: boolean;
  type?: string;
  match: {
    accountId?: string;
    channel: string;
    peer?: {
      id?: string;
      kind?: PeerKind;
    };
  };
}

/** 完整配置结构 */
interface OpenClawConfig {
  agents?: {
    list?: AgentInfo[];
  };
  bindings?: ChannelBinding[];
  channels?: Record<string, any>;
  plugins?: {
    entries?: Record<string, { enabled?: boolean }>;
  };
}

// ============================================================
// 默认配置常量
// ============================================================

/** Feishu 渠道默认配置 */
const defaultFeishuChannelConfig: FeishuChannelConfig = {
  enabled: false,
  domain: 'feishu',
  connectionMode: 'websocket',
  dmPolicy: 'pairing',
  groupPolicy: 'open',
  requireMention: true,
  streaming: true,
  blockStreaming: true,
  typingIndicator: true,
  resolveSenderNames: true,
  textChunkLimit: 2000,
  mediaMaxMb: 30,
  footer: { elapsed: true, status: true },
  accounts: {},
};

/** Feishu 账号默认配置 */
const defaultFeishuAccountConfig: FeishuAccountConfig = {
  enabled: true,
  domain: 'feishu',
  requireMention: true,
  streaming: true,
  typingIndicator: true,
  resolveSenderNames: true,
  footer: { elapsed: true, status: true },
  groupPolicy: 'open',
  dmPolicy: 'open',
  allowFrom: ['*'],
};

// ============================================================
// 选项数组（Feishu 表单使用）
// ============================================================

const domainOptions: AppSelectOption[] = [
  { label: 'Feishu', value: 'feishu' },
  { label: 'Lark', value: 'lark' },
];

const dmPolicyOptions: AppSelectOption[] = [
  { label: 'Pairing', value: 'pairing', description: '私聊需先完成配对，安全性更高。' },
  { label: 'Allowlist', value: 'allowlist', description: '仅允许 allowFrom 列表中的用户发起私聊。' },
  { label: 'Open', value: 'open', description: '允许所有用户直接私聊。' },
  { label: 'Disabled', value: 'disabled', description: '禁用私聊入口。' },
];

const groupPolicyOptions: AppSelectOption[] = [
  { label: 'Open', value: 'open', description: '允许群组使用。' },
  { label: 'Allowlist', value: 'allowlist', description: '仅允许指定群组使用。' },
  { label: 'Disabled', value: 'disabled', description: '禁用群组消息。' },
];

const connectionModeOptions: AppSelectOption[] = [
  { label: 'WebSocket', value: 'websocket', description: '官方推荐，无需公网回调地址。' },
  { label: 'Webhook', value: 'webhook', description: '通过事件回调接入，需要配置校验参数和回调地址。' },
];



// ============================================================
// 工具函数
// ============================================================

/** 深拷贝配置对象 */
const cloneConfig = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

/** 逗号分隔字符串转数组 */
const parseCsv = (value: string): string[] =>
  value.split(',').map((item) => item.trim()).filter(Boolean);

/** 数组转逗号分隔字符串 */
const toCsv = (value?: string[]): string => (value || []).join(', ');

// ============================================================
// 主组件
// ============================================================

const SettingsChannels: React.FC = () => {
  const { t } = useI18n();

  // ── 核心状态 ────────────────────────────────────────────────────────────
  const [config, setConfig] = useState<OpenClawConfig | null>(null);
  const [draft, setDraft] = useState<OpenClawConfig | null>(null);
  const [agents, setAgents] = useState<AgentInfo[]>([]);

  // ── 页面交互状态 ────────────────────────────────────────────────────────
  const [configModalChannel, setConfigModalChannel] = useState<string | null>(null);
  const [showAddChannelModal, setShowAddChannelModal] = useState(false);

  // ── 加载/保存状态 ──────────────────────────────────────────────────────
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');

  // ── CLI 状态 ──────────────────────────────────────────────────────────
  const [cliOutput, setCliOutput] = useState('');
  const [cliRunning, setCliRunning] = useState(false);

  // ── 原始 JSON 编辑器状态 ──────────────────────────────────────────────
  const [rawChannelsDraft, setRawChannelsDraft] = useState('');
  const [jsonParseError, setJsonParseError] = useState('');

  // ── 消息提示 ──────────────────────────────────────────────────────────
  const showMessage = (nextMessage: string) => {
    setMessage(nextMessage);
    window.setTimeout(() => {
      setMessage((current) => (current === nextMessage ? '' : current));
    }, 4000);
  };

  // ── 数据加载 ──────────────────────────────────────────────────────────
  const loadData = async () => {
    try {
      setIsLoading(true);
      const [configResult, agentsResult] = await Promise.all([
        window.electronAPI.configGet(),
        window.electronAPI.agentsGetAll(),
      ]);

      if (!configResult.success || !configResult.config) {
        throw new Error(configResult.error || t('channels.loadFailed'));
      }

      const nextConfig = configResult.config as OpenClawConfig;
      if (!nextConfig.channels) nextConfig.channels = {};
      if (!nextConfig.bindings) nextConfig.bindings = [];

      const nextDraft = cloneConfig(nextConfig);
      setConfig(nextConfig);
      setDraft(nextDraft);
      setRawChannelsDraft(JSON.stringify(nextDraft.channels || {}, null, 2));

      const nextAgents =
        agentsResult.success && agentsResult.agents
          ? agentsResult.agents
          : nextConfig.agents?.list || [];
      setAgents(nextAgents);

      // 如果当前 Modal 打开的渠道已被删除，关闭 Modal
      if (configModalChannel && !nextDraft.channels?.[configModalChannel]) {
        setConfigModalChannel(null);
      }
    } catch (error) {
      showMessage(`${t('channels.loadFailed')}：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  // ── 计算派生数据 ──────────────────────────────────────────────────────

  /** 渠道状态摘要 */
  const summary = useMemo(() => {
    if (!draft) return { totalChannels: 0, enabledChannels: 0, totalAccounts: 0, totalBindings: 0 };
    return computeChannelSummary({
      bindings: (draft.bindings || []) as any[],
      channels: draft.channels || {},
    });
  }, [draft]);

  /** 已配置的渠道类型列表 */
  const configuredChannelTypes = useMemo(
    () => Object.keys(draft?.channels || {}),
    [draft],
  );

  /** 可添加的渠道类型（排除已配置的） */
  const availableChannelTypes = useMemo(
    () => SUPPORTED_CHANNEL_TYPES.filter((ct) => !configuredChannelTypes.includes(ct.id)),
    [configuredChannelTypes],
  );

  // ============================================================
  // 配置更新辅助函数
  // ============================================================

  /** 通用草稿更新器 */
  const updateDraft = (updater: (current: OpenClawConfig) => OpenClawConfig) => {
    setDraft((current) => {
      const safeCurrent = cloneConfig(current || { channels: {}, bindings: [] });
      const nextDraft = updater(safeCurrent);
      setRawChannelsDraft(JSON.stringify(nextDraft.channels || {}, null, 2));
      return nextDraft;
    });
  };

  /** 持久化配置到 openclaw.json（先读后写模式） */
  const persistConfig = async (nextConfig: OpenClawConfig) => {
    try {
      setIsSaving(true);

      // 先读取当前最新配置，合并变更后写回
      const currentResult = await window.electronAPI.configGet();
      if (!currentResult.success || !currentResult.config) {
        throw new Error(currentResult.error || t('channels.loadFailed'));
      }

      // 仅覆盖 channels 和 bindings，保留其他配置节点不变
      const mergedConfig = {
        ...currentResult.config,
        channels: nextConfig.channels,
        bindings: nextConfig.bindings,
      };

      const result = await window.electronAPI.configSet(mergedConfig);
      if (!result.success) {
        throw new Error(result.error || t('channels.saveFailed'));
      }
      setConfig(cloneConfig(nextConfig));
      setDraft(cloneConfig(nextConfig));
      setRawChannelsDraft(JSON.stringify(nextConfig.channels || {}, null, 2));
      showMessage(t('channels.saveSuccess'));
    } catch (error) {
      // 保存失败，保留编辑内容不丢失
      showMessage(`${t('channels.saveFailed')}：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsSaving(false);
    }
  };

  // ── 高级配置子组件的保存回调 ──────────────────────────────────────────
  /** 高级配置子组件通用保存回调（先读后写模式） */
  const onSaveAdvancedConfig = async (updatedConfig: any) => {
    try {
      setIsSaving(true);
      const currentResult = await window.electronAPI.configGet();
      if (!currentResult.success || !currentResult.config) {
        throw new Error(currentResult.error || t('channels.loadFailed'));
      }
      // 合并：将子组件更新的字段覆盖到当前配置
      const mergedConfig = {
        ...currentResult.config,
        ...updatedConfig,
      };
      // 移除 OpenClaw v0.3.24+ schema 不支持的根级别字段，避免校验失败
      delete (mergedConfig as any).pairing;
      const result = await window.electronAPI.configSet(mergedConfig);
      if (!result.success) {
        throw new Error(result.error || t('channels.saveFailed'));
      }
      // 更新本地状态
      const nextConfig = mergedConfig as OpenClawConfig;
      if (!nextConfig.channels) nextConfig.channels = {};
      if (!nextConfig.bindings) nextConfig.bindings = [];
      setConfig(cloneConfig(nextConfig));
      setDraft(cloneConfig(nextConfig));
      setRawChannelsDraft(JSON.stringify(nextConfig.channels || {}, null, 2));
      showMessage(t('channels.saveSuccess'));
    } catch (error) {
      showMessage(`${t('channels.saveFailed')}：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsSaving(false);
    }
  };

  // ── Feishu 渠道配置更新 ────────────────────────────────────────────────
  const updateFeishuConfig = (updates: Partial<FeishuChannelConfig>) => {
    updateDraft((current) => ({
      ...current,
      channels: {
        ...(current.channels || {}),
        feishu: {
          ...cloneConfig(defaultFeishuChannelConfig),
          ...(current.channels?.feishu || {}),
          ...updates,
          accounts: {
            ...((current.channels?.feishu?.accounts || {}) as Record<string, FeishuAccountConfig>),
          },
        },
      },
    }));
  };

  // ── Feishu 账号配置更新 ────────────────────────────────────────────────
  const updateFeishuAccount = (accountId: string, updates: Partial<FeishuAccountConfig>) => {
    updateDraft((current) => ({
      ...current,
      channels: {
        ...(current.channels || {}),
        feishu: {
          ...cloneConfig(defaultFeishuChannelConfig),
          ...(current.channels?.feishu || {}),
          accounts: {
            ...((current.channels?.feishu?.accounts || {}) as Record<string, FeishuAccountConfig>),
            [accountId]: {
              ...cloneConfig(defaultFeishuAccountConfig),
              ...((current.channels?.feishu?.accounts?.[accountId] || {}) as FeishuAccountConfig),
              ...updates,
            },
          },
        },
      },
    }));
  };

  // ============================================================
  // 渠道管理操作（Task 11）
  // ============================================================

  /** 添加渠道 */
  const handleAddChannel = async (channelType: string) => {
    if (!draft) return;
    const asBindingConfig = { bindings: (draft.bindings || []) as any[], channels: draft.channels || {} };
    const nextBindingConfig = addChannelToConfig(asBindingConfig, channelType);
    const nextDraft: OpenClawConfig = { ...draft, channels: nextBindingConfig.channels, bindings: nextBindingConfig.bindings as any };
    setDraft(nextDraft);
    setRawChannelsDraft(JSON.stringify(nextDraft.channels || {}, null, 2));
    setShowAddChannelModal(false);
    // 持久化后自动打开配置 Modal
    await persistConfig(nextDraft);
    setConfigModalChannel(channelType);
  };

  /** 删除渠道（带确认） */
  const handleDeleteChannel = async (channelType: string) => {
    if (!draft) return;
    if (!window.confirm(t('channels.confirmDeleteChannel'))) return;
    const asBindingConfig = { bindings: (draft.bindings || []) as any[], channels: draft.channels || {} };
    const nextBindingConfig = deleteChannelFromConfig(asBindingConfig, channelType);
    const nextDraft: OpenClawConfig = { ...draft, channels: nextBindingConfig.channels, bindings: nextBindingConfig.bindings as any };
    // 如果 Modal 正在展示该渠道，自动关闭
    if (configModalChannel === channelType) {
      setConfigModalChannel(null);
    }
    setDraft(nextDraft);
    setRawChannelsDraft(JSON.stringify(nextDraft.channels || {}, null, 2));
    await persistConfig(nextDraft);
  };

  // ============================================================
  // 渠道详情操作（Task 12）
  // ============================================================

  /** 保存渠道顶层配置（通用 JSON 编辑器） */
  const handleSaveChannelJson = (channelType: string, jsonStr: string) => {
    try {
      const parsed = JSON.parse(jsonStr);
      // 排除 accounts，仅更新顶层字段
      const { accounts: _a, ...topLevel } = parsed;
      updateDraft((current) => {
        const asBindingConfig = { bindings: (current.bindings || []) as any[], channels: current.channels || {} };
        const next = updateChannelConfig(asBindingConfig, channelType, topLevel);
        return { ...current, channels: next.channels };
      });
    } catch {
      showMessage(t('channels.jsonParseError'));
    }
  };

  // ── 账号管理操作（由 ChannelConfigModal 调用） ──────────────────────

  /** 添加账号（channelType 由 Modal 传入） */
  const handleAddAccount = (channelType: string, accountId: string) => {
    if (!draft) return;
    // 对 Feishu 渠道使用默认账号配置
    const initialConfig = channelType === 'feishu' ? cloneConfig(defaultFeishuAccountConfig) : {};
    const asBindingConfig = { bindings: (draft.bindings || []) as any[], channels: draft.channels || {} };
    const nextBindingConfig = addAccountToChannel(asBindingConfig, channelType, accountId, initialConfig);
    const nextDraft: OpenClawConfig = { ...draft, channels: nextBindingConfig.channels };
    setDraft(nextDraft);
    setRawChannelsDraft(JSON.stringify(nextDraft.channels || {}, null, 2));
  };

  /** 删除账号（channelType 由 Modal 传入） */
  const handleDeleteAccount = (channelType: string, accountId: string) => {
    if (!draft) return;
    const asBindingConfig = { bindings: (draft.bindings || []) as any[], channels: draft.channels || {} };
    const nextBindingConfig = deleteAccountFromChannel(asBindingConfig, channelType, accountId);
    const nextDraft: OpenClawConfig = { ...draft, channels: nextBindingConfig.channels };
    setDraft(nextDraft);
    setRawChannelsDraft(JSON.stringify(nextDraft.channels || {}, null, 2));
  };

  /** 更新通用渠道账号配置（JSON 编辑器，channelType 由 Modal 传入） */
  const handleSaveAccountJson = (channelType: string, accountId: string, jsonStr: string) => {
    if (!draft) return;
    try {
      const parsed = JSON.parse(jsonStr);
      const asBindingConfig = { bindings: (draft.bindings || []) as any[], channels: draft.channels || {} };
      const next = updateAccountConfig(asBindingConfig, channelType, accountId, parsed);
      const nextDraft: OpenClawConfig = { ...draft, channels: next.channels };
      setDraft(nextDraft);
      setRawChannelsDraft(JSON.stringify(nextDraft.channels || {}, null, 2));
    } catch {
      showMessage(t('channels.jsonParseError'));
    }
  };

  // ============================================================
  // CLI 命令集成（Task 15.1）
  // ============================================================

  /** 执行 CLI 命令并更新输出 */
  const runCliCommand = async (command: 'status' | 'list') => {
    try {
      setCliRunning(true);
      setCliOutput('');
      const result = command === 'status'
        ? await window.electronAPI.channelsStatus()
        : await window.electronAPI.channelsList();

      if (!result.success) {
        // CLI 命令失败，显示错误详情
        setCliOutput(`${t('channels.cliFailed')}：${result.error || 'Unknown error'}`);
        return;
      }
      setCliOutput(result.output || '');
    } catch (error) {
      // 捕获 IPC 通信异常
      setCliOutput(`${t('channels.cliFailed')}：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setCliRunning(false);
    }
  };

  // ============================================================
  // 全局保存/重置（Task 16 - 先读后写模式 + 完善错误处理）
  // ============================================================

  /**
   * 保存所有配置（先读后写模式）
   * 优先使用 draft 对象中的 channels 数据，确保表单编辑的内容不会丢失。
   * 仅当 rawChannelsDraft 被用户手动编辑且与 draft 不一致时，才使用 JSON 编辑器内容。
   */
  const saveConfig = async () => {
    if (!draft) return;

    // 判断 JSON 编辑器内容是否被用户手动修改过（与 draft 不一致）
    let channelsToSave: Record<string, any>;
    const draftChannelsJson = JSON.stringify(draft.channels || {}, null, 2);
    const rawEdited = rawChannelsDraft !== draftChannelsJson;

    if (rawEdited) {
      // 用户手动编辑了 JSON 编辑器，验证并使用编辑器内容
      try {
        channelsToSave = JSON.parse(rawChannelsDraft || '{}');
        setJsonParseError('');
      } catch {
        // JSON 格式无效，阻止保存并提示
        setJsonParseError(t('channels.jsonParseError'));
        showMessage(t('channels.jsonParseError'));
        return;
      }
    } else {
      // 表单编辑模式：直接使用 draft 对象，避免 rawChannelsDraft 同步延迟导致数据丢失
      channelsToSave = draft.channels || {};
      setJsonParseError('');
    }

    try {
      setIsSaving(true);

      // 先读后写：读取当前最新配置，合并变更后写回
      const currentResult = await window.electronAPI.configGet();
      if (!currentResult.success || !currentResult.config) {
        throw new Error(currentResult.error || t('channels.loadFailed'));
      }

      // 合并：仅覆盖 channels 和 bindings，保留其他配置节点不变
      const mergedConfig = {
        ...currentResult.config,
        channels: channelsToSave,
        bindings: draft.bindings || [],
      };

      // 写入配置（config:set 自动创建时间戳备份）
      const result = await window.electronAPI.configSet(mergedConfig);
      if (!result.success) {
        throw new Error(result.error || t('channels.saveFailed'));
      }

      // 保存成功，同步更新所有本地状态
      const savedChannelsJson = JSON.stringify(channelsToSave, null, 2);
      setConfig(cloneConfig(mergedConfig as OpenClawConfig));
      setDraft(cloneConfig(mergedConfig as OpenClawConfig));
      setRawChannelsDraft(savedChannelsJson);
      showMessage(t('channels.saveSuccess'));
    } catch (error) {
      // 保存失败，保留编辑内容不丢失
      showMessage(`${t('channels.saveFailed')}：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsSaving(false);
    }
  };

  /** 重置草稿到上次加载的配置 */
  const resetDraft = () => {
    if (!config) return;
    const nextDraft = cloneConfig(config);
    setDraft(nextDraft);
    setRawChannelsDraft(JSON.stringify(nextDraft.channels || {}, null, 2));
    setJsonParseError('');
  };

  // ============================================================
  // 加载状态
  // ============================================================

  if (isLoading || !draft) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <div className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
          {t('common.loading')}
        </div>
      </div>
    );
  }

  // ============================================================
  // 渲染
  // ============================================================

  return (
    <div className="space-y-5">
      {/* ── 页面头部：标题 + 操作按钮 ──────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold" style={{ color: 'var(--app-text)' }}>
            {t('channels.title')}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-7" style={{ color: 'var(--app-text-muted)' }}>
            {t('channels.description')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <AppButton variant="secondary" onClick={() => void loadData()} icon={<RefreshCw size={16} />}>
            {t('channels.refreshConfig')}
          </AppButton>
          <AppButton variant="secondary" onClick={resetDraft}>
            {t('channels.resetDraft')}
          </AppButton>
          <AppButton variant="primary" onClick={() => void saveConfig()} loading={isSaving} icon={<Save size={16} />}>
            {t('channels.saveConfig')}
          </AppButton>
        </div>
      </div>

      {/* ── 消息提示（固定浮层 toast） ──────────────────────────────── */}
      {message ? (
        <div
          className="fixed top-6 left-1/2 z-[100] -translate-x-1/2 animate-[fadeInDown_0.25s_ease-out]"
          style={{ pointerEvents: 'none' }}
        >
          <div
            className="rounded-2xl border px-5 py-3 shadow-lg text-sm font-medium"
            style={{
              backgroundColor: message.includes(t('channels.saveFailed')) || message.includes(t('channels.loadFailed')) || message.includes(t('channels.jsonParseError'))
                ? 'rgba(239, 68, 68, 0.95)'
                : 'rgba(16, 185, 129, 0.95)',
              borderColor: message.includes(t('channels.saveFailed')) || message.includes(t('channels.loadFailed')) || message.includes(t('channels.jsonParseError'))
                ? 'rgba(239, 68, 68, 0.6)'
                : 'rgba(16, 185, 129, 0.6)',
              color: '#FFFFFF',
              pointerEvents: 'auto',
            }}
          >
            {message}
          </div>
        </div>
      ) : null}

      {/* ── 状态摘要栏（ChannelStatusBar - Task 10.2） ────────────────── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="flex items-center justify-between rounded-2xl border px-4 py-3" style={{ borderColor: 'var(--app-border)' }}>
          <span className="text-sm" style={{ color: 'var(--app-text-muted)' }}>{t('channels.summary.configured')}</span>
          <span className="text-lg font-semibold" style={{ color: 'var(--app-text)' }}>{summary.totalChannels}</span>
        </div>
        <div className="flex items-center justify-between rounded-2xl border px-4 py-3" style={{ borderColor: 'var(--app-border)' }}>
          <span className="text-sm" style={{ color: 'var(--app-text-muted)' }}>{t('channels.summary.enabled')}</span>
          <span className="text-lg font-semibold" style={{ color: 'var(--app-text)' }}>{summary.enabledChannels}</span>
        </div>
        <div className="flex items-center justify-between rounded-2xl border px-4 py-3" style={{ borderColor: 'var(--app-border)' }}>
          <span className="text-sm" style={{ color: 'var(--app-text-muted)' }}>{t('channels.summary.accounts')}</span>
          <span className="text-lg font-semibold" style={{ color: 'var(--app-text)' }}>{summary.totalAccounts}</span>
        </div>
        <div className="flex items-center justify-between rounded-2xl border px-4 py-3" style={{ borderColor: 'var(--app-border)' }}>
          <span className="text-sm" style={{ color: 'var(--app-text-muted)' }}>{t('channels.summary.bindings')}</span>
          <span className="text-lg font-semibold" style={{ color: 'var(--app-text)' }}>{summary.totalBindings}</span>
        </div>
      </div>

      {/* ── 渠道列表（ChannelList - Task 11） ────────────────────────── */}
      <GlassCard className="rounded-3xl p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-2xl"
              style={{ backgroundColor: 'rgba(45, 212, 191, 0.14)', color: '#14B8A6' }}
            >
              <MessageSquare size={20} />
            </div>
            <div>
              <div className="text-lg font-semibold" style={{ color: 'var(--app-text)' }}>
                {t('channels.title')}
              </div>
              <div className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
                {t('channels.description')}
              </div>
            </div>
          </div>
          <AppButton variant="secondary" onClick={() => setShowAddChannelModal(true)} icon={<Plus size={16} />}>
            {t('channels.addChannel')}
          </AppButton>
        </div>

        {/* 渠道卡片列表 */}
        {configuredChannelTypes.length > 0 ? (
          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {configuredChannelTypes.map((channelType) => {
              const channelConfig = draft.channels?.[channelType] || {};
              const isEnabled = channelConfig.enabled === true;
              const accountCount = Object.keys(channelConfig.accounts || {}).length;
              const bindingCount = getChannelBindingCount(
                { bindings: (draft.bindings || []) as any[], channels: draft.channels || {} },
                channelType,
              );
              const isSelected = configModalChannel === channelType;
              const typeDef = SUPPORTED_CHANNEL_TYPES.find((ct) => ct.id === channelType);

              return (
                <div
                  key={channelType}
                  className="cursor-pointer rounded-2xl border p-4 transition-token-normal"
                  style={{
                    borderColor: isSelected ? 'var(--app-active-border)' : 'var(--app-border)',
                    backgroundColor: isSelected ? 'var(--app-bg-subtle)' : 'var(--app-bg)',
                  }}
                  onClick={() => setConfigModalChannel(channelType)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold" style={{ color: 'var(--app-text)' }}>
                        {typeDef?.name || channelType}
                      </span>
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
                    <AppButton
                      variant="danger"
                      size="xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleDeleteChannel(channelType);
                      }}
                      icon={<Trash2 size={12} />}
                    >
                      {t('channels.deleteChannel')}
                    </AppButton>
                  </div>
                  <div className="mt-2 flex gap-4 text-xs" style={{ color: 'var(--app-text-muted)' }}>
                    <span>{t('channels.accounts')}: {accountCount}</span>
                    <span>{t('channels.bindings')}: {bindingCount}</span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* 空状态 */
          <div className="mt-5 rounded-2xl border px-4 py-8 text-center" style={{ borderColor: 'var(--app-border)' }}>
            <div className="text-sm" style={{ color: 'var(--app-text-muted)' }}>{t('channels.noChannels')}</div>
            <div className="mt-1 text-xs" style={{ color: 'var(--app-text-muted)' }}>{t('channels.noChannelsHint')}</div>
          </div>
        )}
      </GlassCard>

      {/* ── Modal 弹窗组件 ─────────────────────────────────────────────── */}
      <AddChannelModal
        open={showAddChannelModal}
        onClose={() => setShowAddChannelModal(false)}
        availableChannelTypes={availableChannelTypes}
        onSelect={(channelType) => void handleAddChannel(channelType)}
      />

      <ChannelConfigModal
        channelType={configModalChannel}
        onClose={() => setConfigModalChannel(null)}
        draft={draft}
        updateDraft={updateDraft}
        onSave={saveConfig}
        onReset={resetDraft}
        isSaving={isSaving}
        updateFeishuConfig={updateFeishuConfig}
        updateFeishuAccount={updateFeishuAccount}
        onSaveChannelJson={handleSaveChannelJson}
        onSaveAccountJson={(accountId, jsonStr) => {
          if (configModalChannel) handleSaveAccountJson(configModalChannel, accountId, jsonStr);
        }}
        onAddAccount={(accountId) => {
          if (configModalChannel) handleAddAccount(configModalChannel, accountId);
        }}
        onDeleteAccount={(accountId) => {
          if (configModalChannel) handleDeleteAccount(configModalChannel, accountId);
        }}
        FeishuChannelForm={FeishuChannelForm}
        FeishuAccountForm={FeishuAccountForm}
        GenericChannelJsonEditor={GenericChannelJsonEditor}
        GenericAccountJsonEditor={GenericAccountJsonEditor}
      />

      {/* ── CLI 命令集成区域（Task 15.1） ────────────────────────────── */}
      <GlassCard className="rounded-3xl p-5">
        <div className="flex items-center gap-3">
          <div
            className="flex h-11 w-11 items-center justify-center rounded-2xl"
            style={{ backgroundColor: 'rgba(168, 85, 247, 0.14)', color: '#A855F7' }}
          >
            <Terminal size={20} />
          </div>
          <div>
            <div className="text-lg font-semibold" style={{ color: 'var(--app-text)' }}>
              CLI
            </div>
          </div>
        </div>

        {/* CLI 操作按钮 */}
        <div className="mt-4 flex flex-wrap gap-3">
          <AppButton
            variant="secondary"
            onClick={() => void runCliCommand('status')}
            disabled={cliRunning}
            icon={cliRunning ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
          >
            {cliRunning ? t('channels.cliRunning') : t('channels.cliStatus')}
          </AppButton>
          <AppButton
            variant="secondary"
            onClick={() => void runCliCommand('list')}
            disabled={cliRunning}
            icon={cliRunning ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
          >
            {cliRunning ? t('channels.cliRunning') : t('channels.cliList')}
          </AppButton>
        </div>

        {/* CLI 输出区域 */}
        {cliOutput ? (
          <pre
            className="mt-4 max-h-[300px] overflow-auto whitespace-pre-wrap rounded-2xl border px-4 py-3 font-mono text-sm"
            style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
          >
            {cliOutput}
          </pre>
        ) : null}
      </GlassCard>

      {/* ── 配对管理（PairingManager - Task 26） ────────────────────── */}
      <PairingManager
        configuredChannels={configuredChannelTypes}
      />

      {/* ── 群消息配置（GroupMessagesConfig - Task 27） ──────────────── */}
      <GroupMessagesConfig
        config={draft || {}}
        configuredChannels={configuredChannelTypes}
        onSave={onSaveAdvancedConfig}
      />

      {/* ── 群组管理（GroupsManager - Task 28） ──────────────────────── */}
      <GroupsManager
        config={draft || {}}
        configuredChannels={configuredChannelTypes}
        onSave={onSaveAdvancedConfig}
      />

      {/* ── 广播群组配置（BroadcastGroupsConfig - Task 29） ──────────── */}
      <BroadcastGroupsConfig
        config={draft || {}}
        configuredChannels={configuredChannelTypes}
        groups={(draft as any)?.groups || {}}
        onSave={onSaveAdvancedConfig}
      />

      {/* ── 渠道路由配置（ChannelRoutingConfig - Task 30） ────────────── */}
      <ChannelRoutingConfig
        config={draft || {}}
        configuredChannels={configuredChannelTypes}
        agents={agents}
        onSave={onSaveAdvancedConfig}
      />

      {/* ── 位置解析配置（LocationParsingConfig - Task 31） ────────────── */}
      <LocationParsingConfig
        config={draft || {}}
        configuredChannels={configuredChannelTypes}
        onSave={onSaveAdvancedConfig}
      />

      {/* ── 故障排查面板（TroubleshootingPanel - Task 32） ────────────── */}
      <TroubleshootingPanel
        config={draft || {}}
        configuredChannels={configuredChannelTypes}
      />

      {/* ── 原始 JSON 编辑器（RawJsonEditor - Task 15.2） ────────────── */}
      <GlassCard className="rounded-3xl p-5">
        <div className="flex items-center gap-3">
          <div
            className="flex h-11 w-11 items-center justify-center rounded-2xl"
            style={{ backgroundColor: 'rgba(234, 179, 8, 0.14)', color: '#EAB308' }}
          >
            <Code size={20} />
          </div>
          <div>
            <div className="text-lg font-semibold" style={{ color: 'var(--app-text)' }}>
              {t('channels.rawJson')}
            </div>
            <div className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
              {t('channels.rawJsonDescription')}
            </div>
          </div>
        </div>

        {/* JSON 解析错误提示 */}
        {jsonParseError ? (
          <div
            className="mt-4 rounded-xl border px-3 py-2 text-sm"
            style={{ borderColor: '#EF4444', color: '#EF4444' }}
          >
            {jsonParseError}
          </div>
        ) : null}

        {/* JSON 编辑器 */}
        <textarea
          value={rawChannelsDraft}
          onChange={(e) => {
            setRawChannelsDraft(e.target.value);
            // 实时清除之前的解析错误提示
            if (jsonParseError) setJsonParseError('');
          }}
          className="mt-4 min-h-[240px] w-full rounded-2xl border px-4 py-3 font-mono text-sm outline-none"
          style={{ backgroundColor: 'var(--app-bg)', borderColor: jsonParseError ? '#EF4444' : 'var(--app-border)', color: 'var(--app-text)', lineHeight: 1.7 }}
          spellCheck={false}
        />

        {/* 保存按钮 */}
        <div className="mt-3 flex justify-end">
          <AppButton
            variant="primary"
            size="sm"
            onClick={() => void saveConfig()}
            disabled={isSaving}
            icon={<Save size={14} />}
          >
            {t('channels.saveConfig')}
          </AppButton>
        </div>
      </GlassCard>
    </div>
  );
};

// ============================================================
// 子组件：Feishu 渠道结构化表单
// ============================================================

/** Feishu 渠道顶层配置表单 */
const FeishuChannelForm: React.FC<{
  config: FeishuChannelConfig;
  onUpdate: (updates: Partial<FeishuChannelConfig>) => void;
}> = ({ config, onUpdate }) => {
  const { t } = useI18n();

  return (
    <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
      {/* 启用渠道 */}
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={Boolean(config.enabled)} onChange={(e) => onUpdate({ enabled: e.target.checked })} />
        <span className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>{t('channels.channelEnabled')}</span>
      </label>
      {/* 需要 @ 提及 */}
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={Boolean(config.requireMention)} onChange={(e) => onUpdate({ requireMention: e.target.checked })} />
        <span className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>requireMention</span>
      </label>
      {/* 域名 */}
      <div>
        <div className="mb-2 text-sm font-medium" style={{ color: 'var(--app-text)' }}>domain</div>
        <AppSelect size="sm" options={domainOptions} value={config.domain || 'feishu'} onChange={(v) => onUpdate({ domain: v as ChannelDomain })} />
      </div>
      {/* 连接模式 */}
      <div>
        <div className="mb-2 text-sm font-medium" style={{ color: 'var(--app-text)' }}>connectionMode</div>
        <AppSelect size="sm" options={connectionModeOptions} value={config.connectionMode || 'websocket'} onChange={(v) => onUpdate({ connectionMode: v as ChannelConnectionMode })} />
      </div>
      {/* 私聊策略 */}
      <div>
        <div className="mb-2 text-sm font-medium" style={{ color: 'var(--app-text)' }}>dmPolicy</div>
        <AppSelect size="sm" options={dmPolicyOptions} value={config.dmPolicy || 'pairing'} onChange={(v) => onUpdate({ dmPolicy: v as DmPolicy })} />
      </div>
      {/* 群聊策略 */}
      <div>
        <div className="mb-2 text-sm font-medium" style={{ color: 'var(--app-text)' }}>groupPolicy</div>
        <AppSelect size="sm" options={groupPolicyOptions} value={config.groupPolicy || 'open'} onChange={(v) => onUpdate({ groupPolicy: v as GroupPolicy })} />
      </div>

      {/* 默认账号 ID */}
      <label className="space-y-2 block md:col-span-2">
        <span className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>defaultAccount</span>
        <input
          value={config.defaultAccount || ''}
          onChange={(e) => onUpdate({ defaultAccount: e.target.value })}
          className="w-full rounded-2xl border px-4 py-3 text-sm outline-none"
          style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
          placeholder="e.g. main"
        />
      </label>
      {/* 私聊 allowFrom */}
      <label className="space-y-2 block md:col-span-2">
        <span className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>allowFrom</span>
        <input
          value={toCsv(config.allowFrom)}
          onChange={(e) => onUpdate({ allowFrom: parseCsv(e.target.value) })}
          className="w-full rounded-2xl border px-4 py-3 text-sm outline-none"
          style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
          placeholder="ou_xxx, ou_yyy"
        />
      </label>
      {/* 群聊 allowFrom */}
      <label className="space-y-2 block md:col-span-2">
        <span className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>groupAllowFrom</span>
        <input
          value={toCsv(config.groupAllowFrom)}
          onChange={(e) => onUpdate({ groupAllowFrom: parseCsv(e.target.value) })}
          className="w-full rounded-2xl border px-4 py-3 text-sm outline-none"
          style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
          placeholder="ou_xxx, ou_yyy"
        />
      </label>

      {/* 文本分块限制 */}
      <label className="space-y-2 block">
        <span className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>textChunkLimit</span>
        <input
          type="number" value={config.textChunkLimit || ''}
          onChange={(e) => onUpdate({ textChunkLimit: Number(e.target.value) || undefined })}
          className="w-full rounded-2xl border px-4 py-3 text-sm outline-none"
          style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
          placeholder="2000"
        />
      </label>
      {/* 媒体大小上限 */}
      <label className="space-y-2 block">
        <span className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>mediaMaxMb</span>
        <input
          type="number" value={config.mediaMaxMb || ''}
          onChange={(e) => onUpdate({ mediaMaxMb: Number(e.target.value) || undefined })}
          className="w-full rounded-2xl border px-4 py-3 text-sm outline-none"
          style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
          placeholder="30"
        />
      </label>
      {/* 布尔开关组 */}
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={Boolean(config.streaming)} onChange={(e) => onUpdate({ streaming: e.target.checked })} />
        <span className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>streaming</span>
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={Boolean(config.blockStreaming)} onChange={(e) => onUpdate({ blockStreaming: e.target.checked })} />
        <span className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>blockStreaming</span>
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={Boolean(config.typingIndicator)} onChange={(e) => onUpdate({ typingIndicator: e.target.checked })} />
        <span className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>typingIndicator</span>
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={Boolean(config.resolveSenderNames)} onChange={(e) => onUpdate({ resolveSenderNames: e.target.checked })} />
        <span className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>resolveSenderNames</span>
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={Boolean(config.footer?.elapsed)} onChange={(e) => onUpdate({ footer: { ...(config.footer || {}), elapsed: e.target.checked } })} />
        <span className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>footer.elapsed</span>
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={Boolean(config.footer?.status)} onChange={(e) => onUpdate({ footer: { ...(config.footer || {}), status: e.target.checked } })} />
        <span className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>footer.status</span>
      </label>

      {/* Webhook 模式额外字段 */}
      {config.connectionMode === 'webhook' ? (
        <>
          <label className="space-y-2 block">
            <span className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>verificationToken</span>
            <input
              value={config.verificationToken || ''}
              onChange={(e) => onUpdate({ verificationToken: e.target.value })}
              className="w-full rounded-2xl border px-4 py-3 text-sm outline-none"
              style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
            />
          </label>
          <label className="space-y-2 block">
            <span className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>webhookHost</span>
            <input
              value={config.webhookHost || ''}
              onChange={(e) => onUpdate({ webhookHost: e.target.value })}
              className="w-full rounded-2xl border px-4 py-3 text-sm outline-none"
              style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
              placeholder="127.0.0.1"
            />
          </label>
          <label className="space-y-2 block">
            <span className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>webhookPath</span>
            <input
              value={config.webhookPath || ''}
              onChange={(e) => onUpdate({ webhookPath: e.target.value })}
              className="w-full rounded-2xl border px-4 py-3 text-sm outline-none"
              style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
              placeholder="/feishu/events"
            />
          </label>
          <label className="space-y-2 block">
            <span className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>webhookPort</span>
            <input
              type="number"
              value={config.webhookPort || ''}
              onChange={(e) => onUpdate({ webhookPort: Number(e.target.value) || undefined })}
              className="w-full rounded-2xl border px-4 py-3 text-sm outline-none"
              style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
              placeholder="3000"
            />
          </label>
        </>
      ) : null}
    </div>
  );
};

// ============================================================
// 子组件：Feishu 账号结构化表单
// ============================================================

/** Feishu 账号配置表单 */
const FeishuAccountForm: React.FC<{
  accountId: string;
  account: FeishuAccountConfig;
  onUpdate: (updates: Partial<FeishuAccountConfig>) => void;
}> = ({ accountId: _accountId, account, onUpdate }) => {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {/* 启用 */}
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={Boolean(account.enabled)} onChange={(e) => onUpdate({ enabled: e.target.checked })} />
        <span className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>启用</span>
      </label>
      {/* requireMention */}
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={Boolean(account.requireMention)} onChange={(e) => onUpdate({ requireMention: e.target.checked })} />
        <span className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>需要 @提及 才响应</span>
      </label>
      {/* appId */}
      <label className="space-y-1 block">
        <span className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>App ID</span>
        <div className="text-xs" style={{ color: 'var(--app-text-muted)' }}>飞书开放平台的应用凭证 ID</div>
        <input
          value={account.appId || ''} onChange={(e) => onUpdate({ appId: e.target.value })}
          className="w-full rounded-2xl border px-4 py-3 text-sm outline-none"
          style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
        />
      </label>
      {/* appSecret */}
      <label className="space-y-1 block">
        <span className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>App Secret</span>
        <div className="text-xs" style={{ color: 'var(--app-text-muted)' }}>飞书开放平台的应用密钥</div>
        <input
          value={account.appSecret || ''} onChange={(e) => onUpdate({ appSecret: e.target.value })}
          className="w-full rounded-2xl border px-4 py-3 text-sm outline-none"
          style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
        />
      </label>
      {/* botName */}
      <label className="space-y-1 block">
        <span className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>机器人名称</span>
        <div className="text-xs" style={{ color: 'var(--app-text-muted)' }}>在飞书中显示的 Bot 名称，用于 @提及 匹配</div>
        <input
          value={account.botName || ''} onChange={(e) => onUpdate({ botName: e.target.value })}
          className="w-full rounded-2xl border px-4 py-3 text-sm outline-none"
          style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
        />
      </label>

      {/* domain */}
      <div className="space-y-1">
        <div className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>域名环境</div>
        <div className="text-xs" style={{ color: 'var(--app-text-muted)' }}>飞书（feishu）或 Lark 国际版（lark）</div>
        <AppSelect size="sm" options={domainOptions} value={account.domain || 'feishu'} onChange={(v) => onUpdate({ domain: v as ChannelDomain })} />
      </div>
      {/* dmPolicy */}
      <div className="space-y-1">
        <div className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>私聊策略</div>
        <div className="text-xs" style={{ color: 'var(--app-text-muted)' }}>控制 Bot 如何处理私聊消息</div>
        <AppSelect size="sm" options={dmPolicyOptions} value={account.dmPolicy || 'pairing'} onChange={(v) => onUpdate({ dmPolicy: v as DmPolicy })} />
      </div>
      {/* groupPolicy */}
      <div className="space-y-1">
        <div className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>群聊策略</div>
        <div className="text-xs" style={{ color: 'var(--app-text-muted)' }}>控制 Bot 如何处理群聊消息</div>
        <AppSelect size="sm" options={groupPolicyOptions} value={account.groupPolicy || 'open'} onChange={(v) => onUpdate({ groupPolicy: v as GroupPolicy })} />
      </div>
      {/* allowFrom */}
      <label className="space-y-1 block md:col-span-2">
        <span className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>允许来源</span>
        <div className="text-xs" style={{ color: 'var(--app-text-muted)' }}>限制可以与 Bot 交互的用户 ID，多个用逗号分隔，留空表示不限制</div>
        <input
          value={toCsv(account.allowFrom)}
          onChange={(e) => onUpdate({ allowFrom: parseCsv(e.target.value) })}
          className="w-full rounded-2xl border px-4 py-3 text-sm outline-none"
          style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
          placeholder="ou_xxx, ou_yyy"
        />
      </label>
      {/* 布尔开关 */}
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={Boolean(account.streaming)} onChange={(e) => onUpdate({ streaming: e.target.checked })} />
        <span className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>流式输出</span>
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={Boolean(account.typingIndicator)} onChange={(e) => onUpdate({ typingIndicator: e.target.checked })} />
        <span className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>输入中提示</span>
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={Boolean(account.resolveSenderNames)} onChange={(e) => onUpdate({ resolveSenderNames: e.target.checked })} />
        <span className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>解析发送者名称</span>
      </label>
      {/* textChunkLimit */}
      <label className="space-y-1 block">
        <span className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>文本分片上限</span>
        <div className="text-xs" style={{ color: 'var(--app-text-muted)' }}>单条消息最大字符数，超出会自动分片发送</div>
        <input
          type="number" value={account.textChunkLimit || ''}
          onChange={(e) => onUpdate({ textChunkLimit: Number(e.target.value) || undefined })}
          className="w-full rounded-2xl border px-4 py-3 text-sm outline-none"
          style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
          placeholder="2000"
        />
      </label>
      {/* footer */}
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={Boolean(account.footer?.elapsed)} onChange={(e) => onUpdate({ footer: { ...(account.footer || {}), elapsed: e.target.checked } })} />
        <span className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>底部显示耗时</span>
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={Boolean(account.footer?.status)} onChange={(e) => onUpdate({ footer: { ...(account.footer || {}), status: e.target.checked } })} />
        <span className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>底部显示状态</span>
      </label>
    </div>
  );
};

// ============================================================
// 子组件：通用渠道 JSON 编辑器
// ============================================================

/** 通用渠道顶层配置 JSON 编辑器（排除 accounts） */
const GenericChannelJsonEditor: React.FC<{
  channelType: string;
  channelConfig: Record<string, any>;
  onSave: (jsonStr: string) => void;
}> = ({ channelType, channelConfig, onSave }) => {
  const { t } = useI18n();
  // 排除 accounts 字段，仅编辑顶层配置
  const { accounts: _a, ...topLevel } = channelConfig;
  const [jsonStr, setJsonStr] = useState(JSON.stringify(topLevel, null, 2));

  // 当外部配置变化时同步
  useEffect(() => {
    const { accounts: _a2, ...tl } = channelConfig;
    setJsonStr(JSON.stringify(tl, null, 2));
  }, [channelConfig]);

  return (
    <div className="mt-5">
      <div className="mb-2 text-sm font-medium" style={{ color: 'var(--app-text)' }}>
        {t('channels.jsonEditorTitle')} ({channelType})
      </div>
      <textarea
        value={jsonStr}
        onChange={(e) => setJsonStr(e.target.value)}
        className="min-h-[180px] w-full rounded-2xl border px-4 py-3 font-mono text-sm outline-none"
        style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)', color: 'var(--app-text)', lineHeight: 1.7 }}
        spellCheck={false}
      />
      <div className="mt-2 flex justify-end">
        <AppButton variant="primary" size="sm" onClick={() => onSave(jsonStr)} icon={<Save size={14} />}>
          {t('common.save')}
        </AppButton>
      </div>
    </div>
  );
};

// ============================================================
// 子组件：通用账号 JSON 编辑器
// ============================================================

/** 通用账号配置 JSON 编辑器 */
const GenericAccountJsonEditor: React.FC<{
  accountId: string;
  accountConfig: any;
  onSave: (jsonStr: string) => void;
}> = ({ accountId, accountConfig, onSave }) => {
  const { t } = useI18n();
  const [jsonStr, setJsonStr] = useState(JSON.stringify(accountConfig || {}, null, 2));

  // 当外部配置变化时同步
  useEffect(() => {
    setJsonStr(JSON.stringify(accountConfig || {}, null, 2));
  }, [accountConfig]);

  return (
    <div>
      <div className="mb-2 text-sm font-medium" style={{ color: 'var(--app-text)' }}>
        {t('channels.accountIdLabel')}: {accountId}
      </div>
      <textarea
        value={jsonStr}
        onChange={(e) => setJsonStr(e.target.value)}
        className="min-h-[140px] w-full rounded-2xl border px-4 py-3 font-mono text-sm outline-none"
        style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)', color: 'var(--app-text)', lineHeight: 1.7 }}
        spellCheck={false}
      />
      <div className="mt-2 flex justify-end">
        <AppButton variant="primary" size="sm" onClick={() => onSave(jsonStr)} icon={<Save size={14} />}>
          {t('common.save')}
        </AppButton>
      </div>
    </div>
  );
};

export default SettingsChannels;
