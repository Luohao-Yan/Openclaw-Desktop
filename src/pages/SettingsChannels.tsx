import React, { useEffect, useMemo, useState } from 'react';
import {
  Bot,
  Link2,
  MessageSquare,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Wifi,
} from 'lucide-react';
import AppButton from '../components/AppButton';
import AppSelect, { type AppSelectOption } from '../components/AppSelect';
import GlassCard from '../components/GlassCard';
import { useI18n } from '../i18n/I18nContext';
import type { AgentInfo } from '../../types/electron';

type ChannelDomain = 'feishu' | 'lark';
type ChannelConnectionMode = 'websocket' | 'webhook';
type DmPolicy = 'pairing' | 'allowlist' | 'open' | 'disabled';
type GroupPolicy = 'open' | 'allowlist' | 'disabled';
type PeerKind = 'direct' | 'group';

interface ChannelFooterConfig {
  elapsed?: boolean;
  status?: boolean;
}

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

interface ChannelBinding {
  agentId: string;
  enabled?: boolean;
  match: {
    accountId?: string;
    channel: string;
    peer?: {
      id?: string;
      kind?: PeerKind;
    };
  };
}

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
  footer: {
    elapsed: true,
    status: true,
  },
  accounts: {},
};

const defaultFeishuAccountConfig: FeishuAccountConfig = {
  enabled: true,
  domain: 'feishu',
  requireMention: true,
  streaming: true,
  typingIndicator: true,
  resolveSenderNames: true,
  footer: {
    elapsed: true,
    status: true,
  },
  groupPolicy: 'open',
};

const domainOptions: AppSelectOption[] = [
  {
    label: 'Feishu',
    value: 'feishu',
  },
  {
    label: 'Lark',
    value: 'lark',
  },
];

const dmPolicyOptions: AppSelectOption[] = [
  {
    label: 'Pairing',
    value: 'pairing',
    description: '私聊需先完成配对，安全性更高。',
  },
  {
    label: 'Allowlist',
    value: 'allowlist',
    description: '仅允许 allowFrom 列表中的用户发起私聊。',
  },
  {
    label: 'Open',
    value: 'open',
    description: '允许所有用户直接私聊。',
  },
  {
    label: 'Disabled',
    value: 'disabled',
    description: '禁用私聊入口。',
  },
];

const groupPolicyOptions: AppSelectOption[] = [
  {
    label: 'Open',
    value: 'open',
    description: '允许群组使用。',
  },
  {
    label: 'Allowlist',
    value: 'allowlist',
    description: '仅允许指定群组使用。',
  },
  {
    label: 'Disabled',
    value: 'disabled',
    description: '禁用群组消息。',
  },
];

const connectionModeOptions: AppSelectOption[] = [
  {
    label: 'WebSocket',
    value: 'websocket',
    description: '官方推荐，无需公网回调地址。',
  },
  {
    label: 'Webhook',
    value: 'webhook',
    description: '通过事件回调接入，需要配置校验参数和回调地址。',
  },
];

const peerKindOptions: AppSelectOption[] = [
  {
    label: 'Direct',
    value: 'direct',
  },
  {
    label: 'Group',
    value: 'group',
  },
];

const cloneConfig = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

const parseCsv = (value: string): string[] => value
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

const toCsv = (value?: string[]): string => (value || []).join(', ');

const SettingsChannels: React.FC = () => {
  const { t } = useI18n();
  const [config, setConfig] = useState<OpenClawConfig | null>(null);
  const [draft, setDraft] = useState<OpenClawConfig | null>(null);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [rawChannelsDraft, setRawChannelsDraft] = useState('');

  const showMessage = (nextMessage: string) => {
    setMessage(nextMessage);
    window.setTimeout(() => {
      setMessage((current) => current === nextMessage ? '' : current);
    }, 4000);
  };

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [configResult, agentsResult] = await Promise.all([
        window.electronAPI.configGet(),
        window.electronAPI.agentsGetAll(),
      ]);

      if (!configResult.success || !configResult.config) {
        throw new Error(configResult.error || '读取 openclaw.json 失败');
      }

      const nextConfig = configResult.config as OpenClawConfig;
      if (!nextConfig.channels) {
        nextConfig.channels = {};
      }
      if (!nextConfig.bindings) {
        nextConfig.bindings = [];
      }
      if (!nextConfig.channels.feishu) {
        nextConfig.channels.feishu = cloneConfig(defaultFeishuChannelConfig);
      }
      if (!nextConfig.channels.feishu.accounts) {
        nextConfig.channels.feishu.accounts = {};
      }

      const nextDraft = cloneConfig(nextConfig);
      setConfig(nextConfig);
      setDraft(nextDraft);
      setRawChannelsDraft(JSON.stringify(nextDraft.channels || {}, null, 2));

      const nextAgents = agentsResult.success && agentsResult.agents
        ? agentsResult.agents
        : nextConfig.agents?.list || [];
      setAgents(nextAgents);

      const accountIds = Object.keys(nextDraft.channels?.feishu?.accounts || {});
      setSelectedAccountId((current) => current && accountIds.includes(current)
        ? current
        : (accountIds[0] || ''));
    } catch (error) {
      showMessage(`错误：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const feishuConfig = useMemo<FeishuChannelConfig>(() => ({
    ...cloneConfig(defaultFeishuChannelConfig),
    ...(draft?.channels?.feishu || {}),
    accounts: {
      ...(cloneConfig(defaultFeishuChannelConfig).accounts || {}),
      ...((draft?.channels?.feishu?.accounts || {}) as Record<string, FeishuAccountConfig>),
    },
  }), [draft]);

  const feishuAccounts = feishuConfig.accounts || {};
  const accountIds = Object.keys(feishuAccounts);
  const selectedAccount = selectedAccountId ? feishuAccounts[selectedAccountId] : undefined;
  const feishuBindings = (draft?.bindings || []).filter((binding) => binding?.match?.channel === 'feishu');
  const channelOptions = Object.keys(draft?.channels || {}).map((channel) => ({
    label: channel,
    value: channel,
  }));
  const agentOptions = agents.map((agent) => ({
    label: agent.name || agent.id,
    value: agent.id,
    description: agent.workspace,
  }));

  const updateDraft = (updater: (current: OpenClawConfig) => OpenClawConfig) => {
    setDraft((current) => {
      const safeCurrent = cloneConfig(current || {
        channels: {
          feishu: cloneConfig(defaultFeishuChannelConfig),
        },
        bindings: [],
      });
      const nextDraft = updater(safeCurrent);
      setRawChannelsDraft(JSON.stringify(nextDraft.channels || {}, null, 2));
      return nextDraft;
    });
  };

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

  const addAccount = () => {
    const baseId = 'account';
    let index = accountIds.length + 1;
    let nextId = `${baseId}-${index}`;
    while (feishuAccounts[nextId]) {
      index += 1;
      nextId = `${baseId}-${index}`;
    }

    updateFeishuAccount(nextId, cloneConfig(defaultFeishuAccountConfig));
    setSelectedAccountId(nextId);
  };

  const removeAccount = (accountId: string) => {
    updateDraft((current) => {
      const nextAccounts = { ...((current.channels?.feishu?.accounts || {}) as Record<string, FeishuAccountConfig>) };
      delete nextAccounts[accountId];
      return {
        ...current,
        bindings: (current.bindings || []).filter((binding) => binding.match?.accountId !== accountId || binding.match?.channel !== 'feishu'),
        channels: {
          ...(current.channels || {}),
          feishu: {
            ...cloneConfig(defaultFeishuChannelConfig),
            ...(current.channels?.feishu || {}),
            accounts: nextAccounts,
          },
        },
      };
    });

    const nextIds = accountIds.filter((item) => item !== accountId);
    setSelectedAccountId(nextIds[0] || '');
  };

  const addBinding = () => {
    const fallbackAgentId = agents[0]?.id || 'main';
    const fallbackAccountId = selectedAccountId || accountIds[0] || 'default';
    updateDraft((current) => ({
      ...current,
      bindings: [
        ...(current.bindings || []),
        {
          agentId: fallbackAgentId,
          enabled: true,
          match: {
            channel: 'feishu',
            accountId: fallbackAccountId,
            peer: {
              kind: 'direct',
              id: '',
            },
          },
        },
      ],
    }));
  };

  const updateBinding = (index: number, updates: Partial<ChannelBinding>) => {
    updateDraft((current) => {
      const bindings = [...(current.bindings || [])];
      const targetIndexes = bindings
        .map((binding, bindingIndex) => ({ binding, bindingIndex }))
        .filter((item) => item.binding?.match?.channel === 'feishu');
      const target = targetIndexes[index];
      if (!target) {
        return current;
      }
      bindings[target.bindingIndex] = {
        ...target.binding,
        ...updates,
        match: {
          ...target.binding.match,
          ...(updates.match || {}),
          peer: {
            ...target.binding.match?.peer,
            ...(updates.match?.peer || {}),
          },
        },
      };
      return {
        ...current,
        bindings,
      };
    });
  };

  const removeBinding = (index: number) => {
    updateDraft((current) => {
      const bindings = [...(current.bindings || [])];
      const targetIndexes = bindings
        .map((binding, bindingIndex) => ({ binding, bindingIndex }))
        .filter((item) => item.binding?.match?.channel === 'feishu');
      const target = targetIndexes[index];
      if (!target) {
        return current;
      }
      bindings.splice(target.bindingIndex, 1);
      return {
        ...current,
        bindings,
      };
    });
  };

  const saveConfig = async () => {
    if (!draft) {
      return;
    }

    try {
      setIsSaving(true);
      const parsedChannels = JSON.parse(rawChannelsDraft || '{}');
      const nextConfig: OpenClawConfig = {
        ...draft,
        channels: parsedChannels,
      };
      const result = await window.electronAPI.configSet(nextConfig);
      if (!result.success) {
        throw new Error(result.error || '保存配置失败');
      }
      setConfig(cloneConfig(nextConfig));
      setDraft(cloneConfig(nextConfig));
      showMessage('渠道配置已保存到 openclaw.json');
    } catch (error) {
      showMessage(`错误：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsSaving(false);
    }
  };

  const resetDraft = () => {
    if (!config) {
      return;
    }
    const nextDraft = cloneConfig(config);
    setDraft(nextDraft);
    setRawChannelsDraft(JSON.stringify(nextDraft.channels || {}, null, 2));
  };

  if (isLoading || !draft) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <div className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
          {t('common.loading')}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold" style={{ color: 'var(--app-text)' }}>
            渠道配置中心
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-7" style={{ color: 'var(--app-text-muted)' }}>
            参考 OpenClaw 官方 Channels 文档，这里集中管理渠道启用状态、账号配置、多账号路由与智能体绑定。当前优先完整支持飞书，其他渠道可通过原始 JSON 区继续扩展。
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <AppButton
            variant="secondary"
            onClick={() => void loadData()}
            icon={<RefreshCw size={16} />}
          >
            刷新配置
          </AppButton>
          <AppButton
            variant="secondary"
            onClick={resetDraft}
          >
            恢复未保存修改
          </AppButton>
          <AppButton
            variant="primary"
            onClick={() => void saveConfig()}
            disabled={isSaving}
            icon={<Save size={16} />}
          >
            保存到 openclaw.json
          </AppButton>
        </div>
      </div>

      {message ? (
        <GlassCard className="rounded-2xl p-4">
          <div className="text-sm" style={{ color: 'var(--app-text)' }}>
            {message}
          </div>
        </GlassCard>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <GlassCard className="rounded-3xl p-5 xl:col-span-2">
          <div className="flex items-center gap-3">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-2xl"
              style={{ backgroundColor: 'rgba(45, 212, 191, 0.14)', color: '#14B8A6' }}
            >
              <MessageSquare size={20} />
            </div>
            <div>
              <div className="text-lg font-semibold" style={{ color: 'var(--app-text)' }}>
                Feishu 渠道
              </div>
              <div className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
                WebSocket / Webhook、多账号、访问控制、流式输出与绑定路由
              </div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>启用渠道</span>
              <input
                type="checkbox"
                checked={Boolean(feishuConfig.enabled)}
                onChange={(event) => updateFeishuConfig({ enabled: event.target.checked })}
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>默认需要 @ 提及</span>
              <input
                type="checkbox"
                checked={Boolean(feishuConfig.requireMention)}
                onChange={(event) => updateFeishuConfig({ requireMention: event.target.checked })}
              />
            </label>
            <div>
              <div className="mb-2 text-sm font-medium" style={{ color: 'var(--app-text)' }}>域名</div>
              <AppSelect
                size="sm"
                options={domainOptions}
                value={feishuConfig.domain || 'feishu'}
                onChange={(value) => updateFeishuConfig({ domain: value as ChannelDomain })}
              />
            </div>
            <div>
              <div className="mb-2 text-sm font-medium" style={{ color: 'var(--app-text)' }}>连接模式</div>
              <AppSelect
                size="sm"
                options={connectionModeOptions}
                value={feishuConfig.connectionMode || 'websocket'}
                onChange={(value) => updateFeishuConfig({ connectionMode: value as ChannelConnectionMode })}
              />
            </div>
            <div>
              <div className="mb-2 text-sm font-medium" style={{ color: 'var(--app-text)' }}>私聊策略</div>
              <AppSelect
                size="sm"
                options={dmPolicyOptions}
                value={feishuConfig.dmPolicy || 'pairing'}
                onChange={(value) => updateFeishuConfig({ dmPolicy: value as DmPolicy })}
              />
            </div>
            <div>
              <div className="mb-2 text-sm font-medium" style={{ color: 'var(--app-text)' }}>群聊策略</div>
              <AppSelect
                size="sm"
                options={groupPolicyOptions}
                value={feishuConfig.groupPolicy || 'open'}
                onChange={(value) => updateFeishuConfig({ groupPolicy: value as GroupPolicy })}
              />
            </div>
            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>默认账号 ID</span>
              <input
                value={feishuConfig.defaultAccount || ''}
                onChange={(event) => updateFeishuConfig({ defaultAccount: event.target.value })}
                className="w-full rounded-2xl border px-4 py-3 text-sm outline-none"
                style={{
                  backgroundColor: 'var(--app-bg)',
                  borderColor: 'var(--app-border)',
                  color: 'var(--app-text)',
                }}
                placeholder="例如 main"
              />
            </label>
            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>私聊 allowFrom</span>
              <input
                value={toCsv(feishuConfig.allowFrom)}
                onChange={(event) => updateFeishuConfig({ allowFrom: parseCsv(event.target.value) })}
                className="w-full rounded-2xl border px-4 py-3 text-sm outline-none"
                style={{
                  backgroundColor: 'var(--app-bg)',
                  borderColor: 'var(--app-border)',
                  color: 'var(--app-text)',
                }}
                placeholder="使用逗号分隔，如 ou_xxx, ou_yyy"
              />
            </label>
            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>群聊 allowFrom</span>
              <input
                value={toCsv(feishuConfig.groupAllowFrom)}
                onChange={(event) => updateFeishuConfig({ groupAllowFrom: parseCsv(event.target.value) })}
                className="w-full rounded-2xl border px-4 py-3 text-sm outline-none"
                style={{
                  backgroundColor: 'var(--app-bg)',
                  borderColor: 'var(--app-border)',
                  color: 'var(--app-text)',
                }}
                placeholder="使用逗号分隔，限制群聊发送者"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>文本分块限制</span>
              <input
                type="number"
                value={feishuConfig.textChunkLimit || ''}
                onChange={(event) => updateFeishuConfig({ textChunkLimit: Number(event.target.value) || undefined })}
                className="w-full rounded-2xl border px-4 py-3 text-sm outline-none"
                style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
                placeholder="2000"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>媒体大小上限 MB</span>
              <input
                type="number"
                value={feishuConfig.mediaMaxMb || ''}
                onChange={(event) => updateFeishuConfig({ mediaMaxMb: Number(event.target.value) || undefined })}
                className="w-full rounded-2xl border px-4 py-3 text-sm outline-none"
                style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
                placeholder="30"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>启用流式输出</span>
              <input
                type="checkbox"
                checked={Boolean(feishuConfig.streaming)}
                onChange={(event) => updateFeishuConfig({ streaming: event.target.checked })}
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>启用块级流式</span>
              <input
                type="checkbox"
                checked={Boolean(feishuConfig.blockStreaming)}
                onChange={(event) => updateFeishuConfig({ blockStreaming: event.target.checked })}
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>Typing Indicator</span>
              <input
                type="checkbox"
                checked={Boolean(feishuConfig.typingIndicator)}
                onChange={(event) => updateFeishuConfig({ typingIndicator: event.target.checked })}
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>解析发送者名称</span>
              <input
                type="checkbox"
                checked={Boolean(feishuConfig.resolveSenderNames)}
                onChange={(event) => updateFeishuConfig({ resolveSenderNames: event.target.checked })}
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>Footer 显示耗时</span>
              <input
                type="checkbox"
                checked={Boolean(feishuConfig.footer?.elapsed)}
                onChange={(event) => updateFeishuConfig({
                  footer: {
                    ...(feishuConfig.footer || {}),
                    elapsed: event.target.checked,
                  },
                })}
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>Footer 显示状态</span>
              <input
                type="checkbox"
                checked={Boolean(feishuConfig.footer?.status)}
                onChange={(event) => updateFeishuConfig({
                  footer: {
                    ...(feishuConfig.footer || {}),
                    status: event.target.checked,
                  },
                })}
              />
            </label>
            {feishuConfig.connectionMode === 'webhook' ? (
              <>
                <label className="space-y-2">
                  <span className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>Verification Token</span>
                  <input
                    value={feishuConfig.verificationToken || ''}
                    onChange={(event) => updateFeishuConfig({ verificationToken: event.target.value })}
                    className="w-full rounded-2xl border px-4 py-3 text-sm outline-none"
                    style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>Webhook Host</span>
                  <input
                    value={feishuConfig.webhookHost || ''}
                    onChange={(event) => updateFeishuConfig({ webhookHost: event.target.value })}
                    className="w-full rounded-2xl border px-4 py-3 text-sm outline-none"
                    style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
                    placeholder="127.0.0.1"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>Webhook Path</span>
                  <input
                    value={feishuConfig.webhookPath || ''}
                    onChange={(event) => updateFeishuConfig({ webhookPath: event.target.value })}
                    className="w-full rounded-2xl border px-4 py-3 text-sm outline-none"
                    style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
                    placeholder="/feishu/events"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>Webhook Port</span>
                  <input
                    type="number"
                    value={feishuConfig.webhookPort || ''}
                    onChange={(event) => updateFeishuConfig({ webhookPort: Number(event.target.value) || undefined })}
                    className="w-full rounded-2xl border px-4 py-3 text-sm outline-none"
                    style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
                    placeholder="3000"
                  />
                </label>
              </>
            ) : null}
          </div>
        </GlassCard>

        <GlassCard className="rounded-3xl p-5">
          <div className="flex items-center gap-3">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-2xl"
              style={{ backgroundColor: 'rgba(59, 130, 246, 0.14)', color: '#3B82F6' }}
            >
              <Wifi size={20} />
            </div>
            <div>
              <div className="text-lg font-semibold" style={{ color: 'var(--app-text)' }}>
                状态摘要
              </div>
              <div className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
                当前渠道总览
              </div>
            </div>
          </div>

          <div className="mt-5 space-y-3 text-sm">
            <div className="flex items-center justify-between rounded-2xl border px-4 py-3" style={{ borderColor: 'var(--app-border)' }}>
              <span style={{ color: 'var(--app-text-muted)' }}>已配置渠道</span>
              <span className="font-semibold" style={{ color: 'var(--app-text)' }}>{Object.keys(draft.channels || {}).length}</span>
            </div>
            <div className="flex items-center justify-between rounded-2xl border px-4 py-3" style={{ borderColor: 'var(--app-border)' }}>
              <span style={{ color: 'var(--app-text-muted)' }}>Feishu 账号</span>
              <span className="font-semibold" style={{ color: 'var(--app-text)' }}>{accountIds.length}</span>
            </div>
            <div className="flex items-center justify-between rounded-2xl border px-4 py-3" style={{ borderColor: 'var(--app-border)' }}>
              <span style={{ color: 'var(--app-text-muted)' }}>Feishu 绑定</span>
              <span className="font-semibold" style={{ color: 'var(--app-text)' }}>{feishuBindings.length}</span>
            </div>
            <div className="flex items-center justify-between rounded-2xl border px-4 py-3" style={{ borderColor: 'var(--app-border)' }}>
              <span style={{ color: 'var(--app-text-muted)' }}>Feishu 插件</span>
              <span className="font-semibold" style={{ color: 'var(--app-text)' }}>
                {draft.plugins?.entries?.['feishu-openclaw-plugin']?.enabled ? '已启用' : '未启用'}
              </span>
            </div>
            <div className="rounded-2xl border px-4 py-3" style={{ borderColor: 'var(--app-border)' }}>
              <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--app-text-muted)' }}>OpenClaw Docs 提示</div>
              <div className="mt-2 text-sm leading-6" style={{ color: 'var(--app-text)' }}>
                Channels 可同时运行，多渠道按聊天上下文路由；飞书支持多账号、访问控制、流式输出以及 `bindings` 多智能体路由。
              </div>
            </div>
          </div>
        </GlassCard>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <GlassCard className="rounded-3xl p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Bot size={18} style={{ color: 'var(--app-text)' }} />
              <div>
                <div className="text-lg font-semibold" style={{ color: 'var(--app-text)' }}>Feishu 账号</div>
                <div className="text-sm" style={{ color: 'var(--app-text-muted)' }}>管理 appId、appSecret、机器人名与账号级策略</div>
              </div>
            </div>
            <AppButton variant="secondary" onClick={addAccount} icon={<Plus size={16} />}>
              新增账号
            </AppButton>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {accountIds.map((accountId) => (
              <button
                key={accountId}
                type="button"
                onClick={() => setSelectedAccountId(accountId)}
                className="rounded-2xl border px-4 py-2 text-sm font-medium transition-all"
                style={selectedAccountId === accountId
                  ? {
                      background: 'var(--app-selected-card-bg)',
                      borderColor: 'var(--app-selected-card-border)',
                      color: 'var(--app-text)',
                    }
                  : {
                      backgroundColor: 'var(--app-bg)',
                      borderColor: 'var(--app-border)',
                      color: 'var(--app-text-muted)',
                    }}
              >
                {accountId}
              </button>
            ))}
          </div>

          {selectedAccount ? (
            <div className="mt-5 space-y-4">
              <div className="flex justify-end">
                <AppButton
                  variant="danger"
                  size="sm"
                  onClick={() => removeAccount(selectedAccountId)}
                  icon={<Trash2 size={14} />}
                >
                  删除账号
                </AppButton>
              </div>

              <label className="space-y-2 block">
                <span className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>账号 ID</span>
                <input
                  value={selectedAccountId}
                  onChange={(event) => {
                    const nextId = event.target.value.trim();
                    if (!nextId || nextId === selectedAccountId || feishuAccounts[nextId]) {
                      return;
                    }
                    updateDraft((current) => {
                      const nextAccounts = { ...((current.channels?.feishu?.accounts || {}) as Record<string, FeishuAccountConfig>) };
                      nextAccounts[nextId] = nextAccounts[selectedAccountId];
                      delete nextAccounts[selectedAccountId];
                      const nextBindings = (current.bindings || []).map((binding) => binding.match?.channel === 'feishu' && binding.match?.accountId === selectedAccountId
                        ? {
                            ...binding,
                            match: {
                              ...binding.match,
                              accountId: nextId,
                            },
                          }
                        : binding);
                      return {
                        ...current,
                        bindings: nextBindings,
                        channels: {
                          ...(current.channels || {}),
                          feishu: {
                            ...cloneConfig(defaultFeishuChannelConfig),
                            ...(current.channels?.feishu || {}),
                            accounts: nextAccounts,
                          },
                        },
                      };
                    });
                    setSelectedAccountId(nextId);
                  }}
                  className="w-full rounded-2xl border px-4 py-3 text-sm outline-none"
                  style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
                />
              </label>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="space-y-2 block">
                  <span className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>账号启用</span>
                  <input
                    type="checkbox"
                    checked={Boolean(selectedAccount.enabled)}
                    onChange={(event) => updateFeishuAccount(selectedAccountId, { enabled: event.target.checked })}
                  />
                </label>
                <label className="space-y-2 block">
                  <span className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>账号需要 @ 提及</span>
                  <input
                    type="checkbox"
                    checked={Boolean(selectedAccount.requireMention)}
                    onChange={(event) => updateFeishuAccount(selectedAccountId, { requireMention: event.target.checked })}
                  />
                </label>
                <label className="space-y-2 block">
                  <span className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>App ID</span>
                  <input
                    value={selectedAccount.appId || ''}
                    onChange={(event) => updateFeishuAccount(selectedAccountId, { appId: event.target.value })}
                    className="w-full rounded-2xl border px-4 py-3 text-sm outline-none"
                    style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
                  />
                </label>
                <label className="space-y-2 block">
                  <span className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>App Secret</span>
                  <input
                    value={selectedAccount.appSecret || ''}
                    onChange={(event) => updateFeishuAccount(selectedAccountId, { appSecret: event.target.value })}
                    className="w-full rounded-2xl border px-4 py-3 text-sm outline-none"
                    style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
                  />
                </label>
                <label className="space-y-2 block">
                  <span className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>Bot 名称</span>
                  <input
                    value={selectedAccount.botName || ''}
                    onChange={(event) => updateFeishuAccount(selectedAccountId, { botName: event.target.value })}
                    className="w-full rounded-2xl border px-4 py-3 text-sm outline-none"
                    style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
                  />
                </label>
                <div>
                  <div className="mb-2 text-sm font-medium" style={{ color: 'var(--app-text)' }}>账号域名</div>
                  <AppSelect
                    size="sm"
                    options={domainOptions}
                    value={selectedAccount.domain || 'feishu'}
                    onChange={(value) => updateFeishuAccount(selectedAccountId, { domain: value as ChannelDomain })}
                  />
                </div>
                <div>
                  <div className="mb-2 text-sm font-medium" style={{ color: 'var(--app-text)' }}>账号私聊策略</div>
                  <AppSelect
                    size="sm"
                    options={dmPolicyOptions}
                    value={selectedAccount.dmPolicy || 'pairing'}
                    onChange={(value) => updateFeishuAccount(selectedAccountId, { dmPolicy: value as DmPolicy })}
                  />
                </div>
                <div>
                  <div className="mb-2 text-sm font-medium" style={{ color: 'var(--app-text)' }}>账号群聊策略</div>
                  <AppSelect
                    size="sm"
                    options={groupPolicyOptions}
                    value={selectedAccount.groupPolicy || 'open'}
                    onChange={(value) => updateFeishuAccount(selectedAccountId, { groupPolicy: value as GroupPolicy })}
                  />
                </div>
                <label className="space-y-2 block md:col-span-2">
                  <span className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>账号 allowFrom</span>
                  <input
                    value={toCsv(selectedAccount.allowFrom)}
                    onChange={(event) => updateFeishuAccount(selectedAccountId, { allowFrom: parseCsv(event.target.value) })}
                    className="w-full rounded-2xl border px-4 py-3 text-sm outline-none"
                    style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
                    placeholder="使用逗号分隔，配置账号级白名单"
                  />
                </label>
                <label className="space-y-2 block">
                  <span className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>账号流式输出</span>
                  <input
                    type="checkbox"
                    checked={Boolean(selectedAccount.streaming)}
                    onChange={(event) => updateFeishuAccount(selectedAccountId, { streaming: event.target.checked })}
                  />
                </label>
                <label className="space-y-2 block">
                  <span className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>账号 Typing Indicator</span>
                  <input
                    type="checkbox"
                    checked={Boolean(selectedAccount.typingIndicator)}
                    onChange={(event) => updateFeishuAccount(selectedAccountId, { typingIndicator: event.target.checked })}
                  />
                </label>
                <label className="space-y-2 block">
                  <span className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>账号解析发送者名称</span>
                  <input
                    type="checkbox"
                    checked={Boolean(selectedAccount.resolveSenderNames)}
                    onChange={(event) => updateFeishuAccount(selectedAccountId, { resolveSenderNames: event.target.checked })}
                  />
                </label>
                <label className="space-y-2 block">
                  <span className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>账号文本分块限制</span>
                  <input
                    type="number"
                    value={selectedAccount.textChunkLimit || ''}
                    onChange={(event) => updateFeishuAccount(selectedAccountId, { textChunkLimit: Number(event.target.value) || undefined })}
                    className="w-full rounded-2xl border px-4 py-3 text-sm outline-none"
                    style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
                    placeholder="2000"
                  />
                </label>
                <label className="space-y-2 block">
                  <span className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>账号 Footer 显示耗时</span>
                  <input
                    type="checkbox"
                    checked={Boolean(selectedAccount.footer?.elapsed)}
                    onChange={(event) => updateFeishuAccount(selectedAccountId, {
                      footer: {
                        ...(selectedAccount.footer || {}),
                        elapsed: event.target.checked,
                      },
                    })}
                  />
                </label>
                <label className="space-y-2 block">
                  <span className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>账号 Footer 显示状态</span>
                  <input
                    type="checkbox"
                    checked={Boolean(selectedAccount.footer?.status)}
                    onChange={(event) => updateFeishuAccount(selectedAccountId, {
                      footer: {
                        ...(selectedAccount.footer || {}),
                        status: event.target.checked,
                      },
                    })}
                  />
                </label>
              </div>
            </div>
          ) : (
            <div className="mt-5 rounded-2xl border px-4 py-6 text-sm" style={{ borderColor: 'var(--app-border)', color: 'var(--app-text-muted)' }}>
              还没有 Feishu 账号，点击“新增账号”开始配置。
            </div>
          )}
        </GlassCard>

        <GlassCard className="rounded-3xl p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Link2 size={18} style={{ color: 'var(--app-text)' }} />
              <div>
                <div className="text-lg font-semibold" style={{ color: 'var(--app-text)' }}>智能体绑定</div>
                <div className="text-sm" style={{ color: 'var(--app-text-muted)' }}>管理 bindings，将频道账号或特定会话路由到指定 Agent</div>
              </div>
            </div>
            <AppButton variant="secondary" onClick={addBinding} icon={<Plus size={16} />}>
              新增绑定
            </AppButton>
          </div>

          <div className="mt-5 space-y-4">
            {feishuBindings.length ? feishuBindings.map((binding, index) => (
              <div key={`${binding.agentId}-${index}`} className="rounded-2xl border p-4" style={{ borderColor: 'var(--app-border)' }}>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <div className="mb-2 text-sm font-medium" style={{ color: 'var(--app-text)' }}>Agent</div>
                    <AppSelect
                      size="sm"
                      options={agentOptions}
                      value={binding.agentId}
                      onChange={(value) => updateBinding(index, { agentId: value as string })}
                    />
                  </div>
                  <div>
                    <div className="mb-2 text-sm font-medium" style={{ color: 'var(--app-text)' }}>账号</div>
                    <AppSelect
                      size="sm"
                      options={accountIds.map((accountId) => ({ label: accountId, value: accountId }))}
                      value={binding.match?.accountId || ''}
                      onChange={(value) => updateBinding(index, { match: { ...binding.match, accountId: value as string } })}
                    />
                  </div>
                  <div>
                    <div className="mb-2 text-sm font-medium" style={{ color: 'var(--app-text)' }}>匹配类型</div>
                    <AppSelect
                      size="sm"
                      options={peerKindOptions}
                      value={binding.match?.peer?.kind || 'direct'}
                      onChange={(value) => updateBinding(index, {
                        match: {
                          ...binding.match,
                          peer: {
                            ...binding.match?.peer,
                            kind: value as PeerKind,
                          },
                        },
                      })}
                    />
                  </div>
                  <label className="space-y-2 block">
                    <span className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>目标 ID</span>
                    <input
                      value={binding.match?.peer?.id || ''}
                      onChange={(event) => updateBinding(index, {
                        match: {
                          ...binding.match,
                          peer: {
                            ...binding.match?.peer,
                            id: event.target.value,
                          },
                        },
                      })}
                      className="w-full rounded-2xl border px-4 py-3 text-sm outline-none"
                      style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
                      placeholder="直聊填 ou_xxx，群聊填 oc_xxx"
                    />
                  </label>
                </div>

                <div className="mt-4 flex justify-end">
                  <AppButton
                    variant="danger"
                    size="sm"
                    onClick={() => removeBinding(index)}
                    icon={<Trash2 size={14} />}
                  >
                    删除绑定
                  </AppButton>
                </div>
              </div>
            )) : (
              <div className="rounded-2xl border px-4 py-6 text-sm" style={{ borderColor: 'var(--app-border)', color: 'var(--app-text-muted)' }}>
                暂无 Feishu 绑定。你可以把不同账号、不同群聊或私聊路由到不同智能体。
              </div>
            )}
          </div>
        </GlassCard>
      </div>

      <GlassCard className="rounded-3xl p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold" style={{ color: 'var(--app-text)' }}>原始 Channels JSON</div>
            <div className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
              用于补充 Telegram、Slack、Discord、WhatsApp 等其它官方支持渠道的配置。保存时会整体写回 `channels` 字段。
            </div>
          </div>
          <div className="text-xs" style={{ color: 'var(--app-text-muted)' }}>
            已识别渠道：{channelOptions.map((item) => item.value).join(', ') || '无'}
          </div>
        </div>

        <textarea
          value={rawChannelsDraft}
          onChange={(event) => setRawChannelsDraft(event.target.value)}
          className="mt-5 min-h-[280px] w-full rounded-3xl border px-4 py-4 font-mono text-sm outline-none"
          style={{
            backgroundColor: 'var(--app-bg)',
            borderColor: 'var(--app-border)',
            color: 'var(--app-text)',
            lineHeight: 1.7,
          }}
          spellCheck={false}
        />
      </GlassCard>
    </div>
  );
};

export default SettingsChannels;
