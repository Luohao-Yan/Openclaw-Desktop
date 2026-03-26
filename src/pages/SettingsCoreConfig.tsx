import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, RefreshCw, Save, ChevronRight } from 'lucide-react';
import AppButton from '../components/AppButton';
import AppSelect from '../components/AppSelect';
import GlassCard from '../components/GlassCard';
import type {
  CoreConfigOverviewResult,
  CoreConfigSaveResult,
  CoreConfigOverview,
  ElectronAPI,
  NodeConfigShape,
  OpenClawManifestField,
  OpenClawManifestSection,
  ApprovalsTarget,
  ApprovalsGetResult,
  ApprovalAllowlistEntry,
} from '../types/electron';

/* 输入框样式：使用 transition-token-normal 统一过渡动画 */
const inputClassName = 'w-full rounded-xl border px-4 py-3 text-sm outline-none transition-token-normal focus:ring-2 focus:ring-blue-500/20';

const electronAPI = window.electronAPI as unknown as ElectronAPI & {
  coreConfigGetOverview: () => Promise<CoreConfigOverviewResult>;
  coreConfigSaveOverview: (payload: { values: Record<string, unknown> }) => Promise<CoreConfigSaveResult>;
  approvalsGet: (target: ApprovalsTarget) => Promise<ApprovalsGetResult>;
  approvalsAllowlistAdd: (pattern: string, agent: string, target: ApprovalsTarget) => Promise<{ success: boolean; error?: string }>;
  approvalsAllowlistRemove: (pattern: string) => Promise<{ success: boolean; error?: string }>;
};

interface ConfigNavItem {
  id: string;
  title: string;
  description: string;
  manifestSectionIds?: string[];
}

interface ConfigNavGroup {
  id: string;
  items: ConfigNavItem[];
}

interface ConfigDetailTab {
  id: string;
  label: string;
}

interface ConfigDetailPanelDefinition {
  title: string;
  description: string;
  tabs: ConfigDetailTab[];
}

interface AgentListItemDraft {
  id?: string;
  name?: string;
  workspace?: string;
  agentDir?: string;
  model?: string | {
    primary?: string;
    fallbacks?: string[];
  };
  subagents?: {
    allowAgents?: string[];
  };
}

const configNavGroups: ConfigNavGroup[] = [
  {
    id: 'group-1',
    items: [
      {
        id: 'acp',
        title: 'ACP',
        description: 'ACP runtime controls for enabling dispatch, selecting backends, and constraining allowed agent targets.',
        // 关联 manifest 中的 acp section，自动渲染字段与命令
        manifestSectionIds: ['acp'],
      },
      {
        id: 'approvals',
        title: 'Approvals',
        description: 'Approval routing controls for forwarding execution approvals to external chat destinations.',
      },
      {
        id: 'auth',
        title: 'Auth',
        description: 'Authentication profile root for provider credentials, token routing, and failover strategy.',
        manifestSectionIds: ['modelAuth'],
      },
      {
        id: 'broadcast',
        title: 'Broadcast',
        description: 'Broadcast routing map for sending the same outbound message to multiple destinations.',
      },
      {
        id: 'canvas-host',
        title: 'Canvas Host',
        description: 'Canvas host settings for serving canvas assets and local live reload behavior.',
      },
      {
        id: 'environment',
        title: 'Environment',
        description: 'Environment import and override settings used to supply runtime variables to the gateway process.',
      },
      {
        id: 'media',
        title: 'Media',
        description: 'Top-level media behavior shared across providers and tools that handle inbound files.',
      },
      {
        id: 'memory',
        title: 'Memory',
        description: 'Memory backend configuration and global persistence behavior.',
      },
      {
        id: 'metadata',
        title: 'Metadata',
        description: 'Metadata fields maintained by OpenClaw to record config write and version history.',
        manifestSectionIds: ['runtime'],
      },
      {
        id: 'secrets',
        title: 'Secrets',
        description: 'Secret reference storage and secure value indirection used across the config surface.',
      },
      {
        id: 'web-channel',
        title: 'Web Channel',
        description: 'Web channel runtime settings for heartbeat, reconnect, and browser-linked sessions.',
      },
    ],
  },
  {
    id: 'group-2',
    items: [
      {
        id: 'setup-wizard-state',
        title: 'Setup Wizard State',
        description: 'Setup wizard state tracking fields that record the most recent guided onboarding run details.',
      },
      {
        id: 'updates',
        title: 'Updates',
        description: 'Update-channel and startup-check behavior for keeping runtime versions current.',
      },
      {
        id: 'cli',
        title: 'CLI',
        description: 'CLI presentation controls for banner, default output style, and local command behavior.',
        manifestSectionIds: ['maintenance'],
      },
      {
        id: 'diagnostics',
        title: 'Diagnostics',
        description: 'Diagnostics controls for tracing, telemetry export, and cache inspection during debugging.',
        manifestSectionIds: ['maintenance'],
      },
      {
        id: 'gateway',
        title: 'Gateway',
        description: 'Gateway runtime surface for bind mode, auth, control UI, remote transport, and safety limits.',
      },
      {
        id: 'node-host',
        title: 'Node Host',
        description: 'Node host controls for features exposed from this gateway node to clients or peer nodes.',
      },
      {
        id: 'agents',
        title: 'Agents',
        description: 'Agent runtime configuration root covering defaults and explicit agent entries for routing.',
      },
      {
        id: 'tools',
        title: 'Tools',
        description: 'Global tool access policy and capability configuration across web, exec, media, and messaging.',
      },
      {
        id: 'bindings',
        title: 'Bindings',
        description: 'Top-level binding rules for routing and persistent ACP conversation ownership.',
      },
      {
        id: 'audio',
        title: 'Audio',
        description: 'Global audio ingestion settings used before higher-level tools process speech or media content.',
      },
      {
        id: 'models',
        title: 'Models',
        description: 'Model catalog root for provider definitions, merge behavior, and optional provider discovery.',
        manifestSectionIds: ['modelAuth'],
      },
      {
        id: 'messages',
        title: 'Messages',
        description: 'Message formatting, acknowledgement, queueing, debounce, and inbound status reaction behavior.',
      },
      {
        id: 'commands',
        title: 'Commands',
        description: 'Controls chat command surfaces, owner gating, and elevated command access behavior.',
        manifestSectionIds: ['maintenance'],
      },
      {
        id: 'session',
        title: 'Session',
        description: 'Global session routing, reset, delivery policy, and maintenance controls for conversation history.',
        manifestSectionIds: ['workspace'],
      },
      {
        id: 'cron',
        title: 'Cron',
        description: 'Global scheduler settings for stored cron jobs, run concurrency, and delivery fallback.',
      },
      {
        id: 'hooks',
        title: 'Hooks',
        description: 'Inbound webhook automation surface for mapping external events into wake or agent actions.',
      },
    ],
  },
  {
    id: 'group-3',
    items: [
      {
        id: 'ui',
        title: 'UI',
        description: 'UI presentation settings for accenting and assistant identity shown in control surfaces.',
      },
      {
        id: 'browser',
        title: 'Browser',
        description: 'Browser runtime controls for local or remote CDP attachment, profile routing, and screenshots.',
      },
      {
        id: 'talk',
        title: 'Talk',
        description: 'Talk-mode voice synthesis settings for voice identity, model selection, and output format.',
      },
      {
        id: 'channels',
        title: 'Channels',
        description: 'Channel provider configurations plus shared defaults for access policy and heartbeat behavior.',
      },
      {
        id: 'skills',
        title: 'Skills',
        description: 'Skills runtime registration and execution surface for capability exposure and defaults.',
      },
      {
        id: 'plugins',
        title: 'Plugins',
        description: 'Plugin system controls for extensions, constrained load scope, and entry configuration.',
      },
      {
        id: 'discovery',
        title: 'Discovery',
        description: 'Service discovery settings for local mDNS and runtime environment advertisement.',
      },
    ],
  },
];

const configDetailPanels: Record<string, ConfigDetailPanelDefinition> = {
  acp: {
    title: 'ACP',
    description: '配置 Agent Client Protocol 桥接，将 IDE 或 ACP 客户端连接到 OpenClaw Gateway。',
    tabs: [
      { id: 'all', label: 'All' },
      { id: 'connection', label: 'Connection' },
      { id: 'session', label: 'Session' },
      { id: 'advanced', label: 'Advanced' },
    ],
  },
  approvals: {
    title: 'Approvals',
    description: '管理本地主机、Gateway 或指定 Node 的 exec approvals allowlist。可查看当前规则、添加新规则或移除已有规则。',
    tabs: [
      { id: 'local', label: '本地' },
      { id: 'gateway', label: 'Gateway' },
      { id: 'node', label: 'Node' },
    ],
  },
  auth: {
    title: 'Auth',
    description: 'Authentication profile root used for multi-profile provider credentials and cooldown-based failover ordering. Keep profiles minimal and explicit so automatic failover behavior stays auditable.',
    tabs: [
      { id: 'all', label: 'All' },
      { id: 'cooldowns', label: 'Auth Cooldowns' },
      { id: 'profile-order', label: 'Auth Profile Order' },
      { id: 'profiles', label: 'Auth Profiles' },
    ],
  },
  broadcast: {
    title: 'Broadcast',
    description: 'Broadcast routing map for sending the same outbound message to multiple peer IDs per source conversation. Keep this minimal and audited because one source can fan out to many destinations.',
    tabs: [
      { id: 'all', label: 'All' },
      { id: 'strategy', label: 'Broadcast Strategy' },
    ],
  },
  'canvas-host': {
    title: 'Canvas Host',
    description: 'Canvas host settings for serving canvas assets and local live-reload behavior used by canvas-enabled workflows. Keep disabled unless canvas-hosted assets are actively used.',
    tabs: [
      { id: 'all', label: 'All' },
      { id: 'enabled', label: 'Canvas Host Enabled' },
      { id: 'live-reload', label: 'Canvas Host Live Reload' },
      { id: 'base-url', label: 'Canvas Host Base URL' },
    ],
  },
  environment: {
    title: 'Environment',
    description: 'Environment import and override settings used to supply runtime variables to the gateway process. Use this section to control shell-env loading and explicit variable injection behavior.',
    tabs: [
      { id: 'all', label: 'All' },
      { id: 'shell-import', label: 'Shell Environment Import' },
      { id: 'overrides', label: 'Environment Variable Overrides' },
    ],
  },
  media: {
    title: 'Media',
    description: 'Top-level media behavior shared across providers and tools that handle inbound files. Keep defaults unless you need stable filenames for external processing pipelines or longer-lived inbound media retention.',
    tabs: [
      { id: 'all', label: 'All' },
      { id: 'preserve-filenames', label: 'Preserve Media Filenames' },
      { id: 'retention-ttl', label: 'Media Retention TTL (hours)' },
    ],
  },
  memory: {
    title: 'Memory',
    description: 'Memory backend configuration (global).',
    tabs: [
      { id: 'all', label: 'All' },
      { id: 'backend', label: 'Memory Backend' },
      { id: 'citations-mode', label: 'Memory Citations Mode' },
      { id: 'qmd', label: 'Qmd' },
    ],
  },
  metadata: {
    title: 'Metadata',
    description: 'Metadata fields automatically maintained by OpenClaw to record write/version history for this config file. Keep these values system-managed and avoid manual edits unless debugging migration history.',
    tabs: [
      { id: 'all', label: 'All' },
      { id: 'last-touched-at', label: 'Config Last Touched At' },
      { id: 'last-touched-version', label: 'Config Last Touched Version' },
    ],
  },
  'web-channel': {
    title: 'Web Channel',
    description: 'Web channel runtime settings for heartbeat and reconnect behavior when operating web-based chat surfaces. Use reconnect values tuned to your network reliability profile and expected uptime needs.',
    tabs: [
      { id: 'all', label: 'All' },
      { id: 'enabled', label: 'Web Channel Enabled' },
      { id: 'heartbeat-interval', label: 'Web Channel Heartbeat Interval (seconds)' },
      { id: 'reconnect-backoff', label: 'Web Channel Reconnect Backoff (seconds)' },
    ],
  },
  'setup-wizard-state': {
    title: 'Setup Wizard State',
    description: 'Setup wizard state tracking fields that record the most recent guided onboarding run details. Keep these fields for observability and troubleshooting of setup flows across upgrades.',
    tabs: [
      { id: 'all', label: 'All' },
      { id: 'wizard-last-run-timestamp', label: 'Wizard Last Run Timestamp' },
      { id: 'wizard-last-run-command', label: 'Wizard Last Run Command' },
    ],
  },
  updates: {
    title: 'Updates',
    description: 'Update-channel and startup-check behavior for keeping OpenClaw runtime versions current. Use conservative channels in production and more experimental channels only in controlled environments.',
    tabs: [
      { id: 'all', label: 'All' },
      { id: 'auto', label: 'Auto' },
      { id: 'channel', label: 'Update Channel' },
      { id: 'check-on-start', label: 'Update Check on Start' },
    ],
  },
  cli: {
    title: 'CLI',
    description: 'CLI presentation controls for local command output behavior such as banner and tagline style. Use this section to keep startup output aligned with operator preference without changing runtime behavior.',
    tabs: [
      { id: 'all', label: 'All' },
      { id: 'banner', label: 'CLI Banner' },
    ],
  },
  diagnostics: {
    title: 'Diagnostics',
    description: 'Diagnostics controls for targeted tracing, telemetry export, and cache inspection during debugging. Keep baseline diagnostics minimal in production and enable deeper signals only when investigating issues.',
    tabs: [
      { id: 'all', label: 'All' },
      { id: 'cache-trace', label: 'Cache Trace' },
      { id: 'diagnostics-enabled', label: 'Diagnostics Enabled' },
      { id: 'diagnostics-flags', label: 'Diagnostics Flags' },
    ],
  },
  gateway: {
    title: 'Gateway',
    description: 'Gateway runtime surface for bind mode, auth, control UI, remote transport, and operational safety controls. This panel writes to the real gateway fields consumed by the desktop gateway status and repair flows.',
    tabs: [
      { id: 'all', label: 'All' },
      { id: 'bind', label: 'Gateway Bind' },
      { id: 'auth', label: 'Gateway Auth' },
      { id: 'remote', label: 'Gateway Remote' },
    ],
  },
  'node-host': {
    title: 'Node Host',
    description: 'Node host controls backed by the real `node.json` file. This first pass implements the confirmed gateway host/port fields that desktop gateway resolution already consumes.',
    tabs: [
      { id: 'all', label: 'All' },
      { id: 'node-browser-proxy', label: 'Node Browser Proxy' },
    ],
  },
  agents: {
    title: 'Agents',
    description: 'Agent runtime configuration root covering confirmed production fields in `agents.defaults` and `agents.list`. This panel edits structured values directly and writes them back to `openclaw.json` without demo placeholders.',
    tabs: [
      { id: 'all', label: 'All' },
      { id: 'agent-defaults', label: 'Agent Defaults' },
      { id: 'bootstrap', label: 'Bootstrap' },
      { id: 'compaction', label: 'Compaction' },
      { id: 'agent-list', label: 'Agent List' },
    ],
  },
};

const SettingsCoreConfig: React.FC = () => {
  const [overview, setOverview] = useState<CoreConfigOverview | null>(null);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [message, setMessage] = useState('');
  const [loadError, setLoadError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [nodeConfig, setNodeConfig] = useState<NodeConfigShape>({});
  const detailPanelRef = useRef<HTMLDivElement | null>(null);
  const [activeNavItemId, setActiveNavItemId] = useState(configNavGroups[0]?.items[0]?.id || 'acp');
  const [activeDetailTabs, setActiveDetailTabs] = useState<Record<string, string>>({
    approvals: 'local',
    auth: 'cooldowns',
    broadcast: 'strategy',
    'canvas-host': 'enabled',
    environment: 'shell-import',
    media: 'preserve-filenames',
    memory: 'backend',
    metadata: 'last-touched-at',
    'web-channel': 'enabled',
    'setup-wizard-state': 'wizard-last-run-timestamp',
    updates: 'auto',
    cli: 'banner',
    diagnostics: 'cache-trace',
    gateway: 'bind',
    'node-host': 'node-browser-proxy',
    agents: 'agent-defaults',
  });

  // ── Auth 状态 ─────────────────────────────────────────────────────────────
  // profile-order：有序的 profile ID 列表
  const [authProfileOrder, setAuthProfileOrder] = useState<string[]>([]);
  const [newProfileOrderId, setNewProfileOrderId] = useState('');
  // profiles：profile ID -> profile 对象的映射
  interface AuthProfile {
    id: string;
    provider: string;
    token?: string;
    tokenRefEnv?: string;
    label?: string;
    models?: string;
  }
  const [authProfiles, setAuthProfiles] = useState<AuthProfile[]>([]);
  const [authProfileDraft, setAuthProfileDraft] = useState<AuthProfile>({
    id: '', provider: 'anthropic', token: '', tokenRefEnv: '', label: '', models: '',
  });
  const [authProfileEditId, setAuthProfileEditId] = useState<string | null>(null);

  /** 从 rawConfig 同步 auth 状态（在 loadOverview 后调用） */
  const syncAuthFromRawConfig = (rawConfig: Record<string, unknown>) => {
    const authRaw = rawConfig.auth as Record<string, unknown> | undefined;
    // 同步 profileOrder
    const order = authRaw?.profileOrder;
    setAuthProfileOrder(Array.isArray(order) ? order.filter((v): v is string => typeof v === 'string') : []);
    // 同步 profiles（对象 map -> 数组）
    const profilesRaw = authRaw?.profiles as Record<string, unknown> | undefined;
    if (profilesRaw && typeof profilesRaw === 'object') {
      const arr: AuthProfile[] = Object.entries(profilesRaw).map(([id, val]) => {
        const v = val as Record<string, unknown>;
        return {
          id,
          provider: typeof v.provider === 'string' ? v.provider : 'anthropic',
          token: typeof v.token === 'string' ? v.token : '',
          tokenRefEnv: typeof v.tokenRefEnv === 'string' ? v.tokenRefEnv : '',
          label: typeof v.label === 'string' ? v.label : '',
          models: Array.isArray(v.models) ? (v.models as string[]).join(', ') : (typeof v.models === 'string' ? v.models : ''),
        };
      });
      setAuthProfiles(arr);
    } else {
      setAuthProfiles([]);
    }
  };

  /** 将当前 auth 状态写回 draft（profileOrder + profiles） */
  const flushAuthToDraft = (order: string[], profiles: AuthProfile[]) => {
    // 构建 profiles 对象 map
    const profilesMap: Record<string, unknown> = {};
    profiles.forEach((p) => {
      profilesMap[p.id] = {
        provider: p.provider,
        ...(p.token ? { token: p.token } : {}),
        ...(p.tokenRefEnv ? { tokenRefEnv: p.tokenRefEnv } : {}),
        ...(p.label ? { label: p.label } : {}),
        ...(p.models ? { models: p.models.split(',').map((s) => s.trim()).filter(Boolean) } : {}),
      };
    });
    updateField('__authProfileOrder', order);
    updateField('__authProfiles', profilesMap);
  };

  // ── Approvals 状态 ────────────────────────────────────────────────────────
  const [approvalsEntries, setApprovalsEntries] = useState<ApprovalAllowlistEntry[]>([]);
  const [approvalsLoading, setApprovalsLoading] = useState(false);
  const [approvalsError, setApprovalsError] = useState('');
  const [approvalsNodeId, setApprovalsNodeId] = useState('');
  // 新增规则表单
  const [newPattern, setNewPattern] = useState('');
  const [newAgent, setNewAgent] = useState('*');

  /** 根据当前 tab 构造 ApprovalsTarget */
  const buildApprovalsTarget = (tabId: string): ApprovalsTarget => {
    if (tabId === 'gateway') return { kind: 'gateway' };
    if (tabId === 'node') return { kind: 'node', nodeId: approvalsNodeId };
    return { kind: 'local' };
  };

  /** 加载指定目标的 allowlist */
  const loadApprovals = async (tabId: string) => {
    setApprovalsLoading(true);
    setApprovalsError('');
    try {
      const result = await electronAPI.approvalsGet(buildApprovalsTarget(tabId));
      if (!result.success) {
        setApprovalsError(result.error || '获取失败');
        setApprovalsEntries([]);
      } else {
        setApprovalsEntries(result.data?.allowlist || []);
      }
    } catch (err) {
      setApprovalsError(String(err));
    } finally {
      setApprovalsLoading(false);
    }
  };

  /** 添加 allowlist 规则 */
  const handleApprovalsAdd = async (tabId: string) => {
    if (!newPattern.trim()) return;
    const result = await electronAPI.approvalsAllowlistAdd(
      newPattern.trim(),
      newAgent.trim() || '*',
      buildApprovalsTarget(tabId),
    );
    if (result.success) {
      setNewPattern('');
      setNewAgent('*');
      await loadApprovals(tabId);
    } else {
      showMessage(`错误：${result.error || '添加失败'}`);
    }
  };

  /** 移除 allowlist 规则 */
  const handleApprovalsRemove = async (pattern: string, tabId: string) => {
    const result = await electronAPI.approvalsAllowlistRemove(pattern);
    if (result.success) {
      await loadApprovals(tabId);
    } else {
      showMessage(`错误：${result.error || '移除失败'}`);
    }
  };

  const showMessage = (nextMessage: string) => {
    setMessage(nextMessage);
    window.setTimeout(() => {
      setMessage((current) => current === nextMessage ? '' : current);
    }, 4000);
  };

  const loadOverview = async () => {
    try {
      setIsLoading(true);
      setLoadError('');
      const [result, nodeResult] = await Promise.all([
        electronAPI.coreConfigGetOverview(),
        electronAPI.nodeConfigGet(),
      ]);
      if (!result.success || !result.overview) {
        throw new Error(result.error || '读取核心配置失败');
      }

      if (!nodeResult.success) {
        throw new Error(nodeResult.error || '读取 Node Host 配置失败');
      }

      setOverview(result.overview);
      const nextNodeConfig = nodeResult.config || {};
      setNodeConfig(nextNodeConfig);
      setDraft({
        ...result.overview.draft,
        nodeGatewayHost: nextNodeConfig.gateway?.host ?? '',
        nodeGatewayPort: nextNodeConfig.gateway?.port ?? 18789,
      });
      // 同步 auth 图形化状态
      syncAuthFromRawConfig(result.overview.rawConfig);
    } catch (error) {
      const nextError = error instanceof Error ? error.message : String(error);
      setOverview(null);
      setLoadError(nextError);
      showMessage(`错误：${nextError}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadOverview();
  }, []);

  const updateField = (fieldId: string, value: unknown) => {
    setDraft((current) => ({
      ...current,
      [fieldId]: value,
    }));
  };

  const commandPreviewText = useMemo(() => {
    return (overview?.commandPreviews || []).map((item) => `${item.label}\n${item.command}`).join('\n\n');
  }, [overview]);

  const navItems = useMemo(() => {
    return configNavGroups.flatMap((group) => group.items);
  }, []);

  const activeNavItem = useMemo(() => {
    return navItems.find((item) => item.id === activeNavItemId) || navItems[0] || null;
  }, [activeNavItemId, navItems]);

  const activeManifestSections = useMemo(() => {
    if (!overview || !activeNavItem?.manifestSectionIds?.length) {
      return [];
    }

    return activeNavItem.manifestSectionIds
      .map((sectionId) => (overview.manifest.sections || []).find((section) => section.id === sectionId))
      .filter((section): section is OpenClawManifestSection => Boolean(section));
  }, [activeNavItem, overview]);

  const activeCustomDetail = useMemo(() => {
    return activeNavItem ? configDetailPanels[activeNavItem.id] || null : null;
  }, [activeNavItem]);

  const handleCopyCommands = async () => {
    try {
      await navigator.clipboard.writeText(commandPreviewText);
      showMessage('命令预览已复制到剪贴板');
    } catch (error) {
      showMessage(`错误：${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      const result = await electronAPI.coreConfigSaveOverview({ values: draft });
      if (!result.success) {
        throw new Error(result.error || '保存核心配置失败');
      }

      const nodeResult = await electronAPI.nodeConfigSet({
        ...nodeConfig,
        gateway: {
          ...(nodeConfig.gateway || {}),
          host: typeof draft.nodeGatewayHost === 'string'
            ? draft.nodeGatewayHost
            : '',
          port: typeof draft.nodeGatewayPort === 'number'
            ? draft.nodeGatewayPort
            : Number(draft.nodeGatewayPort || 18789),
        },
      });
      if (!nodeResult.success) {
        throw new Error(nodeResult.error || '保存 Node Host 配置失败');
      }

      await loadOverview();
      showMessage(`核心配置已保存到 ${result.saved?.configPath || overview?.configPath || 'openclaw.json'}`);
    } catch (error) {
      showMessage(`错误：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsSaving(false);
    }
  };

  const updateDetailTab = (navId: string, tabId: string) => {
    setActiveDetailTabs((current) => ({
      ...current,
      [navId]: tabId,
    }));
  };

  const handleSelectNavItem = (itemId: string) => {
    setActiveNavItemId(itemId);
  };

  const renderTabButton = (navId: string, tab: ConfigDetailTab) => {
    const isActive = (activeDetailTabs[navId] || 'all') === tab.id;

    return (
      <button
        key={tab.id}
        type="button"
        onClick={() => updateDetailTab(navId, tab.id)}
        className="rounded-full px-4 py-1.5 text-sm font-medium transition-token-normal"
        style={{
          backgroundColor: isActive ? 'rgba(29, 139, 255, 0.15)' : 'transparent',
          color: isActive ? '#1D8BFF' : 'var(--app-text-muted)',
          border: isActive ? '1px solid rgba(29, 139, 255, 0.35)' : '1px solid var(--app-border)',
        }}
      >
        {tab.label}
      </button>
    );
  };

  const renderInputBlock = (
    title: string,
    description: string,
    inputId: string,
    inputType: 'text' | 'number' = 'text',
    placeholder = '',
  ) => {
    const value = draft[inputId];

    return (
      <div className="space-y-2.5">
        <div>
          <div className="text-[15px] font-semibold" style={{ color: 'var(--app-text)' }}>
            {title}
          </div>
          <div className="mt-1 text-sm leading-7" style={{ color: 'var(--app-text-muted)' }}>
            {description}
          </div>
        </div>
        <input
          type={inputType}
          value={typeof value === 'number' ? value : String(value ?? '')}
          onChange={(event) => updateField(
            inputId,
            inputType === 'number' ? Number(event.target.value || 0) : event.target.value,
          )}
          placeholder={placeholder}
          className={inputClassName}
          style={{
            backgroundColor: 'var(--app-bg-subtle)',
            borderColor: 'var(--app-border)',
            color: 'var(--app-text)',
          }}
        />
      </div>
    );
  };

  const renderSelectBlock = (
    title: string,
    description: string,
    fieldId: string,
    options: Array<{ label: string; value: string }>,
    placeholder = 'Select...',
  ) => {
    return (
      <div className="space-y-2.5">
        <div>
          <div className="text-[15px] font-semibold" style={{ color: 'var(--app-text)' }}>
            {title}
          </div>
          <div className="mt-1 text-sm leading-7" style={{ color: 'var(--app-text-muted)' }}>
            {description}
          </div>
        </div>
        <AppSelect
          value={typeof draft[fieldId] === 'string' ? String(draft[fieldId]) : ''}
          onChange={(nextValue) => updateField(fieldId, nextValue)}
          options={options}
          placeholder={placeholder}
          size="md"
        />
      </div>
    );
  };

  const renderAddListBlock = (title: string, description: string, emptyText: string) => {
    return (
      <div className="space-y-3">
        <div>
          <div className="text-[15px] font-semibold" style={{ color: 'var(--app-text)' }}>
            {title}
          </div>
          <div className="mt-1 text-sm leading-7" style={{ color: 'var(--app-text-muted)' }}>
            {description}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <AppButton variant="secondary" icon={null}>
            Add
          </AppButton>
        </div>
        <div className="text-sm leading-7" style={{ color: 'var(--app-text-muted)' }}>
          {emptyText}
        </div>
      </div>
    );
  };

  const renderTextareaBlock = (
    title: string,
    description: string,
    fieldId: string,
    placeholder = '',
  ) => {
    const value = draft[fieldId];

    return (
      <div className="space-y-2.5">
        <div>
          <div className="text-[15px] font-semibold" style={{ color: 'var(--app-text)' }}>
            {title}
          </div>
          <div className="mt-1 text-sm leading-7" style={{ color: 'var(--app-text-muted)' }}>
            {description}
          </div>
        </div>
        <textarea
          value={String(value ?? '')}
          onChange={(event) => updateField(fieldId, event.target.value)}
          placeholder={placeholder}
          rows={6}
          className={`${inputClassName} min-h-[132px] resize-y`}
          style={{
            backgroundColor: 'var(--app-bg-subtle)',
            borderColor: 'var(--app-border)',
            color: 'var(--app-text)',
          }}
        />
      </div>
    );
  };

  const renderToggleBlock = (title: string, description: string, fieldId: string) => {
    const checked = Boolean(draft[fieldId]);

    return (
      <div className="space-y-3">
        <div>
          <div className="text-[15px] font-semibold" style={{ color: 'var(--app-text)' }}>
            {title}
          </div>
          <div className="mt-1 text-sm leading-7" style={{ color: 'var(--app-text-muted)' }}>
            {description}
          </div>
        </div>
        <label className="inline-flex items-center gap-3 text-sm font-medium" style={{ color: 'var(--app-text)' }}>
          <input
            type="checkbox"
            checked={checked}
            onChange={(event) => updateField(fieldId, event.target.checked)}
            className="h-5 w-5 rounded border"
            style={{
              accentColor: '#1D8BFF',
            }}
          />
          {title}
        </label>
      </div>
    );
  };

  const renderReadonlyBlock = (
    title: string,
    description: string,
    fieldId: string,
    fallback = '—',
  ) => {
    const value = draft[fieldId];

    return (
      <div className="space-y-2.5">
        <div>
          <div className="text-[15px] font-semibold" style={{ color: 'var(--app-text)' }}>
            {title}
          </div>
          <div className="mt-1 text-sm leading-7" style={{ color: 'var(--app-text-muted)' }}>
            {description}
          </div>
        </div>
        <div
          className="rounded-xl border px-4 py-3 text-sm"
          style={{
            backgroundColor: 'var(--app-bg-subtle)',
            borderColor: 'var(--app-border)',
            color: 'var(--app-text)',
          }}
        >
          {String(value ?? fallback) || fallback}
        </div>
      </div>
    );
  };

  const getStringListField = (fieldId: string) => {
    const value = draft[fieldId];
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  };

  const updateStringListField = (fieldId: string, values: string[]) => {
    updateField(
      fieldId,
      values.map((item) => item.trim()).filter(Boolean),
    );
  };

  const updateStringListItem = (fieldId: string, index: number, value: string) => {
    const current = getStringListField(fieldId);
    const next = current.map((item, itemIndex) => itemIndex === index ? value : item);
    updateStringListField(fieldId, next);
  };

  const addStringListItem = (fieldId: string) => {
    const current = getStringListField(fieldId);
    updateField(fieldId, [...current, '']);
  };

  const removeStringListItem = (fieldId: string, index: number) => {
    const current = getStringListField(fieldId);
    updateField(fieldId, current.filter((_, itemIndex) => itemIndex !== index));
  };

  const renderStringListEditor = (
    title: string,
    description: string,
    fieldId: string,
    placeholder = '',
  ) => {
    const items = getStringListField(fieldId);

    return (
      <div className="space-y-3">
        <div>
          <div className="text-[15px] font-semibold" style={{ color: 'var(--app-text)' }}>
            {title}
          </div>
          <div className="mt-1 text-sm leading-7" style={{ color: 'var(--app-text-muted)' }}>
            {description}
          </div>
        </div>
        <div className="space-y-3">
          {items.map((item, index) => (
            <div key={`${fieldId}-${index}`} className="flex items-center gap-3">
              <input
                type="text"
                value={item}
                onChange={(event) => updateStringListItem(fieldId, index, event.target.value)}
                placeholder={placeholder}
                className={inputClassName}
                style={{
                  backgroundColor: 'var(--app-bg-subtle)',
                  borderColor: 'var(--app-border)',
                  color: 'var(--app-text)',
                }}
              />
              <AppButton variant="secondary" icon={null} onClick={() => removeStringListItem(fieldId, index)}>
                Remove
              </AppButton>
            </div>
          ))}
          <div className="flex items-center gap-3">
            <AppButton variant="secondary" icon={null} onClick={() => addStringListItem(fieldId)}>
              Add
            </AppButton>
          </div>
        </div>
      </div>
    );
  };

  const getAgentListDraft = () => {
    const value = draft.agentList;
    return Array.isArray(value) ? value as AgentListItemDraft[] : [];
  };

  const updateAgentListDraft = (nextAgents: AgentListItemDraft[]) => {
    updateField('agentList', nextAgents);
  };

  const updateAgentListItem = (
    index: number,
    updater: (current: AgentListItemDraft) => AgentListItemDraft,
  ) => {
    const current = getAgentListDraft();
    const next = current.map((item, itemIndex) => itemIndex === index ? updater(item || {}) : item);
    updateAgentListDraft(next);
  };

  const addAgentListItem = () => {
    const current = getAgentListDraft();
    updateAgentListDraft([
      ...current,
      {
        id: '',
        name: '',
        workspace: '',
        agentDir: '',
        model: '',
        subagents: {
          allowAgents: [],
        },
      },
    ]);
  };

  const removeAgentListItem = (index: number) => {
    const current = getAgentListDraft();
    updateAgentListDraft(current.filter((_, itemIndex) => itemIndex !== index));
  };

  const renderAgentListEditor = () => {
    const agents = getAgentListDraft();

    return (
      <div className="space-y-4">
        <div>
          <div className="text-[15px] font-semibold" style={{ color: 'var(--app-text)' }}>
            Agent List
          </div>
          <div className="mt-1 text-sm leading-7" style={{ color: 'var(--app-text-muted)' }}>
            Structured editor for `agents.list`. Each entry maps directly to the persisted agent object in `openclaw.json`.
          </div>
        </div>
        <div className="space-y-4">
          {agents.map((agent, index) => {
            const modelPrimary = typeof agent.model === 'string'
              ? agent.model
              : agent.model?.primary || '';
            const allowAgents = Array.isArray(agent.subagents?.allowAgents)
              ? agent.subagents?.allowAgents || []
              : [];

            return (
              <div
                key={`agent-item-${index}`}
                className="space-y-4 rounded-2xl border p-4"
                style={{
                  backgroundColor: 'var(--app-bg-subtle)',
                  borderColor: 'var(--app-border)',
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold" style={{ color: 'var(--app-text)' }}>
                    {agent.name?.trim() || agent.id?.trim() || `Agent ${index + 1}`}
                  </div>
                  <AppButton variant="secondary" icon={null} onClick={() => removeAgentListItem(index)}>
                    Remove
                  </AppButton>
                </div>

                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  <div className="space-y-2.5">
                    <div>
                      <div className="text-[15px] font-semibold" style={{ color: 'var(--app-text)' }}>
                        Agent ID
                      </div>
                      <div className="mt-1 text-sm leading-7" style={{ color: 'var(--app-text-muted)' }}>
                        Stable agent identifier used by bindings, routing, and subagent policies.
                      </div>
                    </div>
                    <input
                      type="text"
                      value={String(agent.id ?? '')}
                      onChange={(event) => updateAgentListItem(index, (current) => ({
                        ...current,
                        id: event.target.value,
                      }))}
                      placeholder="primary"
                      className={inputClassName}
                      style={{
                        backgroundColor: 'var(--app-bg-subtle)',
                        borderColor: 'var(--app-border)',
                        color: 'var(--app-text)',
                      }}
                    />
                  </div>

                  <div className="space-y-2.5">
                    <div>
                      <div className="text-[15px] font-semibold" style={{ color: 'var(--app-text)' }}>
                        Agent Name
                      </div>
                      <div className="mt-1 text-sm leading-7" style={{ color: 'var(--app-text-muted)' }}>
                        Human-readable agent display name.
                      </div>
                    </div>
                    <input
                      type="text"
                      value={String(agent.name ?? '')}
                      onChange={(event) => updateAgentListItem(index, (current) => ({
                        ...current,
                        name: event.target.value,
                      }))}
                      placeholder="Primary Agent"
                      className={inputClassName}
                      style={{
                        backgroundColor: 'var(--app-bg-subtle)',
                        borderColor: 'var(--app-border)',
                        color: 'var(--app-text)',
                      }}
                    />
                  </div>

                  <div className="space-y-2.5">
                    <div>
                      <div className="text-[15px] font-semibold" style={{ color: 'var(--app-text)' }}>
                        Workspace
                      </div>
                      <div className="mt-1 text-sm leading-7" style={{ color: 'var(--app-text-muted)' }}>
                        Workspace path used by this agent.
                      </div>
                    </div>
                    <input
                      type="text"
                      value={String(agent.workspace ?? '')}
                      onChange={(event) => updateAgentListItem(index, (current) => ({
                        ...current,
                        workspace: event.target.value,
                      }))}
                      placeholder="~/.openclaw/workspace-primary"
                      className={inputClassName}
                      style={{
                        backgroundColor: 'var(--app-bg-subtle)',
                        borderColor: 'var(--app-border)',
                        color: 'var(--app-text)',
                      }}
                    />
                  </div>

                  <div className="space-y-2.5">
                    <div>
                      <div className="text-[15px] font-semibold" style={{ color: 'var(--app-text)' }}>
                        Agent Dir
                      </div>
                      <div className="mt-1 text-sm leading-7" style={{ color: 'var(--app-text-muted)' }}>
                        Optional explicit agent config directory.
                      </div>
                    </div>
                    <input
                      type="text"
                      value={String(agent.agentDir ?? '')}
                      onChange={(event) => updateAgentListItem(index, (current) => ({
                        ...current,
                        agentDir: event.target.value,
                      }))}
                      placeholder="~/.openclaw/agents/primary/agent"
                      className={inputClassName}
                      style={{
                        backgroundColor: 'var(--app-bg-subtle)',
                        borderColor: 'var(--app-border)',
                        color: 'var(--app-text)',
                      }}
                    />
                  </div>

                  <div className="space-y-2.5">
                    <div>
                      <div className="text-[15px] font-semibold" style={{ color: 'var(--app-text)' }}>
                        Model
                      </div>
                      <div className="mt-1 text-sm leading-7" style={{ color: 'var(--app-text-muted)' }}>
                        Primary model for this agent. Stored as a string for the confirmed first pass.
                      </div>
                    </div>
                    <input
                      type="text"
                      value={modelPrimary}
                      onChange={(event) => updateAgentListItem(index, (current) => ({
                        ...current,
                        model: event.target.value,
                      }))}
                      placeholder="dashscope/deepseek-v3.2"
                      className={inputClassName}
                      style={{
                        backgroundColor: 'var(--app-bg-subtle)',
                        borderColor: 'var(--app-border)',
                        color: 'var(--app-text)',
                      }}
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <div className="text-[15px] font-semibold" style={{ color: 'var(--app-text)' }}>
                      Allowed Subagents
                    </div>
                    <div className="mt-1 text-sm leading-7" style={{ color: 'var(--app-text-muted)' }}>
                      Agent IDs permitted for this agent to spawn or call as subagents.
                    </div>
                  </div>
                  <div className="space-y-3">
                    {allowAgents.map((allowAgent, allowIndex) => (
                      <div key={`agent-${index}-allow-${allowIndex}`} className="flex items-center gap-3">
                        <input
                          type="text"
                          value={allowAgent}
                          onChange={(event) => updateAgentListItem(index, (current) => {
                            const currentAllowAgents = Array.isArray(current.subagents?.allowAgents)
                              ? current.subagents?.allowAgents || []
                              : [];
                            const nextAllowAgents = currentAllowAgents.map((item, itemIndex) => itemIndex === allowIndex ? event.target.value : item);

                            return {
                              ...current,
                              subagents: {
                                ...(current.subagents || {}),
                                allowAgents: nextAllowAgents,
                              },
                            };
                          })}
                          placeholder="ops-agent"
                          className={inputClassName}
                          style={{
                            backgroundColor: 'var(--app-bg-subtle)',
                            borderColor: 'var(--app-border)',
                            color: 'var(--app-text)',
                          }}
                        />
                        <AppButton
                          variant="secondary"
                          icon={null}
                          onClick={() => updateAgentListItem(index, (current) => {
                            const currentAllowAgents = Array.isArray(current.subagents?.allowAgents)
                              ? current.subagents?.allowAgents || []
                              : [];

                            return {
                              ...current,
                              subagents: {
                                ...(current.subagents || {}),
                                allowAgents: currentAllowAgents.filter((_, itemIndex) => itemIndex !== allowIndex),
                              },
                            };
                          })}
                        >
                          Remove
                        </AppButton>
                      </div>
                    ))}
                    <div className="flex items-center gap-3">
                      <AppButton
                        variant="secondary"
                        icon={null}
                        onClick={() => updateAgentListItem(index, (current) => {
                          const currentAllowAgents = Array.isArray(current.subagents?.allowAgents)
                            ? current.subagents?.allowAgents || []
                            : [];

                          return {
                            ...current,
                            subagents: {
                              ...(current.subagents || {}),
                              allowAgents: [...currentAllowAgents, ''],
                            },
                          };
                        })}
                      >
                        Add
                      </AppButton>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          <div className="flex items-center gap-3">
            <AppButton variant="secondary" icon={null} onClick={addAgentListItem}>
              Add
            </AppButton>
          </div>
        </div>
      </div>
    );
  };

  const renderCustomDetailPanel = () => {
    if (!activeNavItem || !activeCustomDetail) {
      return null;
    }

    const activeTabId = activeDetailTabs[activeNavItem.id] || activeCustomDetail.tabs[0]?.id || 'all';

    let content: React.ReactNode = null;

    if (activeNavItem.id === 'acp') {
      // ── ACP Connection tab ──
      if (activeTabId === 'all' || activeTabId === 'connection') {
        content = (
          <div className="space-y-6">
            {renderInputBlock('Gateway URL', 'Remote gateway URL for ACP bridge connection.', 'acpRemoteUrl', 'text', 'http://127.0.0.1:18788')}
            {renderInputBlock('Gateway Token', 'Auth token for remote gateway access.', 'acpRemoteToken', 'text', '')}
            {renderInputBlock('Token File Path', 'Path to a file containing the gateway token.', 'acpTokenFile', 'text', '~/.openclaw/gateway.token')}
            {renderInputBlock('Gateway Password', 'Password for gateway access (if applicable).', 'acpPassword', 'text', '')}
            {renderInputBlock('Password File Path', 'Path to a file containing the gateway password.', 'acpPasswordFile', 'text', '')}
          </div>
        );
      }

      // ── ACP Session tab ──
      if (activeTabId === 'session') {
        content = (
          <div className="space-y-6">
            {renderInputBlock('Default Session Key', 'Default session key to attach to on start (e.g. agent:main:main).', 'acpSession', 'text', 'agent:main:main')}
            {renderInputBlock('Default Session Label', 'Human-readable label for the default session.', 'acpSessionLabel', 'text', '')}
            {renderInputBlock('Require Existing Session', 'Fail if the target session does not already exist.', 'acpRequireExisting', 'text', '')}
            {renderInputBlock('Reset Session on Start', 'Reset the session state when ACP bridge starts.', 'acpResetSession', 'text', '')}
          </div>
        );
      }

      // ── ACP Advanced tab ──
      if (activeTabId === 'advanced') {
        content = (
          <div className="space-y-6">
            {renderInputBlock('No Prefix CWD', 'Disable CWD prefix injection in ACP messages.', 'acpNoPrefixCwd', 'text', '')}
            {renderInputBlock('Verbose Logging', 'Enable verbose ACP bridge logging for debugging.', 'acpVerbose', 'text', '')}
          </div>
        );
      }
    }

    if (activeNavItem.id === 'approvals') {
      // 当前 tab 对应的目标标签
      const tabId = activeTabId;

      content = (
        <div className="space-y-5">
          {/* Node ID 输入（仅 node tab 显示） */}
          {tabId === 'node' && (
            <div className="space-y-2">
              <div className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>
                Node ID / Name / IP
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={approvalsNodeId}
                  onChange={(e) => setApprovalsNodeId(e.target.value)}
                  placeholder="node-id 或 IP 地址"
                  className={inputClassName}
                  style={{
                    backgroundColor: 'var(--app-bg-subtle)',
                    borderColor: 'var(--app-border)',
                    color: 'var(--app-text)',
                  }}
                />
                <AppButton
                  variant="secondary"
                  icon={<RefreshCw size={14} />}
                  onClick={() => void loadApprovals(tabId)}
                  disabled={approvalsLoading || !approvalsNodeId.trim()}
                >
                  加载
                </AppButton>
              </div>
            </div>
          )}

          {/* 加载按钮（local / gateway） */}
          {tabId !== 'node' && (
            <div className="flex items-center gap-2">
              <AppButton
                variant="secondary"
                icon={<RefreshCw size={14} />}
                onClick={() => void loadApprovals(tabId)}
                disabled={approvalsLoading}
              >
                {approvalsLoading ? '加载中…' : '加载 Allowlist'}
              </AppButton>
            </div>
          )}

          {/* 错误提示 */}
          {approvalsError && (
            <div
              className="rounded-lg border px-4 py-2.5 text-sm"
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.10)',
                borderColor: 'rgba(239, 68, 68, 0.30)',
                color: '#fca5a5',
              }}
            >
              {approvalsError}
            </div>
          )}

          {/* Allowlist 列表 */}
          {approvalsEntries.length > 0 && (
            <div className="space-y-2">
              <div className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>
                当前 Allowlist（{approvalsEntries.length} 条）
              </div>
              <div className="space-y-2">
                {approvalsEntries.map((entry, idx) => (
                  <div
                    key={`entry-${idx}`}
                    className="flex items-center justify-between gap-3 rounded-xl border px-4 py-3"
                    style={{
                      backgroundColor: 'var(--app-bg-subtle)',
                      borderColor: 'var(--app-border)',
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-mono text-sm" style={{ color: 'var(--app-text)' }}>
                        {entry.pattern}
                      </div>
                      <div className="mt-0.5 text-xs" style={{ color: 'var(--app-text-muted)' }}>
                        agent: {entry.agent || '*'}
                        {entry.nodeId ? `  ·  node: ${entry.nodeId}` : ''}
                      </div>
                    </div>
                    <AppButton
                      variant="secondary"
                      icon={null}
                      onClick={() => void handleApprovalsRemove(entry.pattern, tabId)}
                    >
                      移除
                    </AppButton>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 空状态 */}
          {!approvalsLoading && approvalsEntries.length === 0 && !approvalsError && (
            <div className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
              暂无 allowlist 规则，点击「加载 Allowlist」获取当前配置，或直接添加新规则。
            </div>
          )}

          {/* 添加新规则 */}
          <div
            className="space-y-3 rounded-2xl border p-4"
            style={{
              backgroundColor: 'transparent',
              borderColor: 'var(--app-border)',
            }}
          >
            <div className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>
              添加规则
            </div>
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              <div className="space-y-1.5">
                <div className="text-xs" style={{ color: 'var(--app-text-muted)' }}>路径 Pattern</div>
                <input
                  type="text"
                  value={newPattern}
                  onChange={(e) => setNewPattern(e.target.value)}
                  placeholder="~/Projects/**/bin/rg"
                  className={inputClassName}
                  style={{
                    backgroundColor: 'var(--app-bg-subtle)',
                    borderColor: 'var(--app-border)',
                    color: 'var(--app-text)',
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <div className="text-xs" style={{ color: 'var(--app-text-muted)' }}>Agent（留空或 * 表示全部）</div>
                <input
                  type="text"
                  value={newAgent}
                  onChange={(e) => setNewAgent(e.target.value)}
                  placeholder="* 或 main"
                  className={inputClassName}
                  style={{
                    backgroundColor: 'var(--app-bg-subtle)',
                    borderColor: 'var(--app-border)',
                    color: 'var(--app-text)',
                  }}
                />
              </div>
            </div>
            <AppButton
              variant="success"
              icon={null}
              onClick={() => void handleApprovalsAdd(tabId)}
              disabled={!newPattern.trim() || (tabId === 'node' && !approvalsNodeId.trim())}
            >
              添加到 Allowlist
            </AppButton>
          </div>
        </div>
      );
    }

    if (activeNavItem.id === 'auth') {
      if (activeTabId === 'all') {
        // all tab：所有子 section 垂直堆叠，每个带标题+描述
        content = (
          <div className="space-y-8">
            {/* Auth Cooldowns */}
            <div className="space-y-4">
              <div>
                <div className="text-[15px] font-semibold" style={{ color: 'var(--app-text)' }}>Auth Cooldowns</div>
                <div className="mt-1 text-sm leading-7" style={{ color: 'var(--app-text-muted)' }}>
                  Cooldown/backoff controls for temporary profile suppression after billing-related failures and retry windows.
                </div>
              </div>
              {renderInputBlock('Billing Backoff (hours)', 'Base backoff (hours) when a profile fails due to billing/insufficient credits (default: 5).', 'authBillingBackoffHours', 'number')}
              {renderInputBlock('Billing Backoff Cap (hours)', 'Cap (hours) for billing backoff (default: 24).', 'authBillingBackoffCapHours', 'number')}
              {renderInputBlock('Failover Window (hours)', 'Failure window (hours) for backoff counters (default: 24).', 'authFailoverWindowHours', 'number')}
            </div>

            {/* Auth Profile Order */}
            <div className="space-y-4">
              <div>
                <div className="text-[15px] font-semibold" style={{ color: 'var(--app-text)' }}>Auth Profile Order</div>
                <div className="mt-1 text-sm leading-7" style={{ color: 'var(--app-text-muted)' }}>
                  Ordered list of auth profile IDs used for failover preference. Keep critical providers earlier and experimental profiles later.
                </div>
              </div>
              {authProfileOrder.length > 0 ? (
                <div className="space-y-2">
                  {authProfileOrder.map((profileId, idx) => (
                    <div key={`all-order-${idx}`} className="flex items-center gap-2 rounded-xl border px-4 py-2.5" style={{ backgroundColor: 'var(--app-bg-subtle)', borderColor: 'var(--app-border)' }}>
                      <span className="w-6 text-center text-xs font-mono" style={{ color: 'var(--app-text-muted)' }}>{idx + 1}</span>
                      <span className="flex-1 font-mono text-sm" style={{ color: 'var(--app-text)' }}>{profileId}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm" style={{ color: 'var(--app-text-muted)' }}>No extra entries yet.</div>
              )}
            </div>

            {/* Auth Profiles */}
            <div className="space-y-4">
              <div>
                <div className="text-[15px] font-semibold" style={{ color: 'var(--app-text)' }}>认证配置</div>
                <div className="mt-1 text-sm leading-7" style={{ color: 'var(--app-text-muted)' }}>
                  Provider credential profiles containing provider type, token source, model constraints, and audit-friendly labels.
                </div>
              </div>
              {authProfiles.length > 0 ? (
                <div className="space-y-2">
                  {authProfiles.map((p) => (
                    <div key={`all-profile-${p.id}`} className="rounded-xl border px-4 py-2.5" style={{ backgroundColor: 'var(--app-bg-subtle)', borderColor: 'var(--app-border)' }}>
                      <span className="font-mono text-sm font-semibold" style={{ color: 'var(--app-text)' }}>{p.id}</span>
                      <span className="ml-3 text-xs" style={{ color: 'var(--app-text-muted)' }}>{p.provider}{p.label ? ` · ${p.label}` : ''}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm" style={{ color: 'var(--app-text-muted)' }}>No extra entries yet.</div>
              )}
            </div>
          </div>
        );
      }

      if (activeTabId === 'cooldowns') {
        content = (
          <div className="space-y-6">
            {renderInputBlock(
              'Billing Backoff (hours)',
              'Base backoff (hours) when a profile fails due to billing/insufficient credits (default: 5).',
              'authBillingBackoffHours',
              'number',
            )}
            {renderInputBlock(
              'Billing Backoff Cap (hours)',
              'Cap (hours) for billing backoff (default: 24).',
              'authBillingBackoffCapHours',
              'number',
            )}
            {renderInputBlock(
              'Failover Window (hours)',
              'Failure window (hours) for backoff counters (default: 24).',
              'authFailoverWindowHours',
              'number',
            )}
          </div>
        );
      }

      if (activeTabId === 'profile-order') {
        // ── Auth Profile Order：有序列表，支持上移/下移/删除/添加 ──
        content = (
          <div className="space-y-5">
            {/* 当前顺序列表 */}
            {authProfileOrder.length > 0 ? (
              <div className="space-y-2">
                {authProfileOrder.map((profileId, idx) => (
                  <div
                    key={`order-${idx}`}
                    className="flex items-center gap-2 rounded-xl border px-4 py-2.5"
                    style={{ backgroundColor: 'var(--app-bg-subtle)', borderColor: 'var(--app-border)' }}
                  >
                    {/* 序号 */}
                    <span className="w-6 text-center text-xs font-mono" style={{ color: 'var(--app-text-muted)' }}>{idx + 1}</span>
                    <span className="flex-1 font-mono text-sm" style={{ color: 'var(--app-text)' }}>{profileId}</span>
                    {/* 上移 */}
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => {
                        const next = [...authProfileOrder];
                        [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                        setAuthProfileOrder(next);
                        flushAuthToDraft(next, authProfiles);
                      }}
                      className="rounded px-2 py-1 text-xs transition-opacity disabled:opacity-30"
                      style={{ color: 'var(--app-text-muted)' }}
                    >↑</button>
                    {/* 下移 */}
                    <button
                      type="button"
                      disabled={idx === authProfileOrder.length - 1}
                      onClick={() => {
                        const next = [...authProfileOrder];
                        [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
                        setAuthProfileOrder(next);
                        flushAuthToDraft(next, authProfiles);
                      }}
                      className="rounded px-2 py-1 text-xs transition-opacity disabled:opacity-30"
                      style={{ color: 'var(--app-text-muted)' }}
                    >↓</button>
                    {/* 删除 */}
                    <AppButton
                      variant="secondary"
                      icon={null}
                      onClick={() => {
                        const next = authProfileOrder.filter((_, i) => i !== idx);
                        setAuthProfileOrder(next);
                        flushAuthToDraft(next, authProfiles);
                      }}
                    >移除</AppButton>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm" style={{ color: 'var(--app-text-muted)' }}>暂无 profile 顺序配对。</div>
            )}

            {/* 添加新 profile ID */}
            <div
              className="space-y-3 rounded-2xl border p-4"
              style={{ backgroundColor: 'transparent', borderColor: 'var(--app-border)' }}
            >
              <div className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>添加 Profile ID</div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newProfileOrderId}
                  onChange={(e) => setNewProfileOrderId(e.target.value)}
                  placeholder="profile-id"
                  className={inputClassName}
                  style={{ backgroundColor: 'var(--app-bg-subtle)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
                />
                <AppButton
                  variant="success"
                  icon={null}
                  onClick={() => {
                    const id = newProfileOrderId.trim();
                    if (!id || authProfileOrder.includes(id)) return;
                    const next = [...authProfileOrder, id];
                    setAuthProfileOrder(next);
                    flushAuthToDraft(next, authProfiles);
                    setNewProfileOrderId('');
                  }}
                  disabled={!newProfileOrderId.trim()}
                >添加</AppButton>
              </div>
            </div>
          </div>
        );
      }

      if (activeTabId === 'profiles') {
        // ── Auth Profiles：增删改查 profile 对象 ──
        const isEditing = authProfileEditId !== null;

        content = (
          <div className="space-y-5">
            {/* Profile 列表 */}
            {authProfiles.length > 0 ? (
              <div className="space-y-2">
                {authProfiles.map((profile) => (
                  <div
                    key={profile.id}
                    className="rounded-xl border px-4 py-3"
                    style={{ backgroundColor: 'var(--app-bg-subtle)', borderColor: 'var(--app-border)' }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="font-mono text-sm font-semibold" style={{ color: 'var(--app-text)' }}>{profile.id}</div>
                        <div className="mt-0.5 text-xs" style={{ color: 'var(--app-text-muted)' }}>
                          provider: {profile.provider}
                          {profile.label ? `  ·  ${profile.label}` : ''}
                          {profile.tokenRefEnv ? `  ·  env: ${profile.tokenRefEnv}` : ''}
                          {profile.models ? `  ·  models: ${profile.models}` : ''}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <AppButton
                          variant="secondary"
                          icon={null}
                          onClick={() => {
                            setAuthProfileEditId(profile.id);
                            setAuthProfileDraft({ ...profile });
                          }}
                        >编辑</AppButton>
                        <AppButton
                          variant="secondary"
                          icon={null}
                          onClick={() => {
                            const next = authProfiles.filter((p) => p.id !== profile.id);
                            setAuthProfiles(next);
                            flushAuthToDraft(authProfileOrder, next);
                            if (authProfileEditId === profile.id) {
                              setAuthProfileEditId(null);
                              setAuthProfileDraft({ id: '', provider: 'anthropic', token: '', tokenRefEnv: '', label: '', models: '' });
                            }
                          }}
                        >删除</AppButton>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm" style={{ color: 'var(--app-text-muted)' }}>暂无 auth profiles，请在下方添加。</div>
            )}

            {/* 编辑 / 新增表单 */}
            <div
              className="space-y-4 rounded-2xl border p-4"
              style={{ backgroundColor: 'transparent', borderColor: 'var(--app-border)' }}
            >
              <div className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>
                {isEditing ? `编辑 Profile：${authProfileEditId}` : '新增 Profile'}
              </div>
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                {/* ID（新增时可编辑，编辑时只读） */}
                <div className="space-y-1.5">
                  <div className="text-xs" style={{ color: 'var(--app-text-muted)' }}>Profile ID *</div>
                  <input
                    type="text"
                    value={authProfileDraft.id}
                    onChange={(e) => setAuthProfileDraft((d) => ({ ...d, id: e.target.value }))}
                    disabled={isEditing}
                    placeholder="my-profile"
                    className={inputClassName}
                    style={{ backgroundColor: 'var(--app-bg-subtle)', borderColor: 'var(--app-border)', color: 'var(--app-text)', opacity: isEditing ? 0.6 : 1 }}
                  />
                </div>
                {/* Provider */}
                <div className="space-y-1.5">
                  <div className="text-xs" style={{ color: 'var(--app-text-muted)' }}>提供商</div>
                  <input
                    type="text"
                    value={authProfileDraft.provider}
                    onChange={(e) => setAuthProfileDraft((d) => ({ ...d, provider: e.target.value }))}
                    placeholder="anthropic"
                    className={inputClassName}
                    style={{ backgroundColor: 'var(--app-bg-subtle)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
                  />
                </div>
                {/* Token */}
                <div className="space-y-1.5">
                  <div className="text-xs" style={{ color: 'var(--app-text-muted)' }}>Token（直接填写）</div>
                  <input
                    type="password"
                    value={authProfileDraft.token ?? ''}
                    onChange={(e) => setAuthProfileDraft((d) => ({ ...d, token: e.target.value }))}
                    placeholder="sk-ant-..."
                    className={inputClassName}
                    style={{ backgroundColor: 'var(--app-bg-subtle)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
                  />
                </div>
                {/* Token Ref Env */}
                <div className="space-y-1.5">
                  <div className="text-xs" style={{ color: 'var(--app-text-muted)' }}>Token Env Ref（环境变量名）</div>
                  <input
                    type="text"
                    value={authProfileDraft.tokenRefEnv ?? ''}
                    onChange={(e) => setAuthProfileDraft((d) => ({ ...d, tokenRefEnv: e.target.value }))}
                    placeholder="ANTHROPIC_API_KEY"
                    className={inputClassName}
                    style={{ backgroundColor: 'var(--app-bg-subtle)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
                  />
                </div>
                {/* Label */}
                <div className="space-y-1.5">
                  <div className="text-xs" style={{ color: 'var(--app-text-muted)' }}>Label（可选备注）</div>
                  <input
                    type="text"
                    value={authProfileDraft.label ?? ''}
                    onChange={(e) => setAuthProfileDraft((d) => ({ ...d, label: e.target.value }))}
                    placeholder="主账号"
                    className={inputClassName}
                    style={{ backgroundColor: 'var(--app-bg-subtle)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
                  />
                </div>
                {/* Models */}
                <div className="space-y-1.5">
                  <div className="text-xs" style={{ color: 'var(--app-text-muted)' }}>Models（逗号分隔，留空不限制）</div>
                  <input
                    type="text"
                    value={authProfileDraft.models ?? ''}
                    onChange={(e) => setAuthProfileDraft((d) => ({ ...d, models: e.target.value }))}
                    placeholder="claude-opus-4-5, claude-sonnet-4-5"
                    className={inputClassName}
                    style={{ backgroundColor: 'var(--app-bg-subtle)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <AppButton
                  variant="success"
                  icon={null}
                  disabled={!authProfileDraft.id.trim()}
                  onClick={() => {
                    const draft = { ...authProfileDraft, id: authProfileDraft.id.trim() };
                    let next: typeof authProfiles;
                    if (isEditing) {
                      // 更新已有 profile
                      next = authProfiles.map((p) => p.id === authProfileEditId ? draft : p);
                    } else {
                      // 新增，若 ID 已存在则覆盖
                      const exists = authProfiles.some((p) => p.id === draft.id);
                      next = exists
                        ? authProfiles.map((p) => p.id === draft.id ? draft : p)
                        : [...authProfiles, draft];
                    }
                    setAuthProfiles(next);
                    flushAuthToDraft(authProfileOrder, next);
                    setAuthProfileEditId(null);
                    setAuthProfileDraft({ id: '', provider: 'anthropic', token: '', tokenRefEnv: '', label: '', models: '' });
                  }}
                >
                  {isEditing ? '保存修改' : '添加 Profile'}
                </AppButton>
                {isEditing && (
                  <AppButton
                    variant="secondary"
                    icon={null}
                    onClick={() => {
                      setAuthProfileEditId(null);
                      setAuthProfileDraft({ id: '', provider: 'anthropic', token: '', tokenRefEnv: '', label: '', models: '' });
                    }}
                  >取消</AppButton>
                )}
              </div>
            </div>
          </div>
        );
      }
    }

    if (activeNavItem.id === 'broadcast') {
      content = renderSelectBlock(
        'Broadcast Strategy',
        'Delivery order for broadcast fan-out. `parallel` sends to all targets concurrently, while `sequential` sends one-by-one. Use `parallel` for speed and `sequential` for stricter ordering/backpressure control.',
        'broadcastStrategy',
        [
          { label: 'parallel', value: 'parallel' },
          { label: 'sequential', value: 'sequential' },
        ],
      );
    }

    if (activeNavItem.id === 'canvas-host') {
      if (activeTabId === 'all' || activeTabId === 'enabled') {
        content = renderToggleBlock(
          'Canvas Host Enabled',
          'Canvas host serving switch for canvas assets and embedded workflow surfaces. Disable this unless you actively publish canvas-hosted views from this runtime.',
          'canvasHostEnabled',
        );
      }

      if (activeTabId === 'live-reload') {
        content = renderToggleBlock(
          'Canvas Host Live Reload',
          'Enable live reload for local canvas development so served assets refresh automatically during authoring.',
          'canvasHostLiveReload',
        );
      }

      if (activeTabId === 'base-url') {
        content = renderInputBlock(
          'Canvas Host Base URL',
          'Base URL used by clients to resolve hosted canvas assets and preview routes.',
          'canvasHostBaseUrl',
          'text',
          'http://127.0.0.1:3000',
        );
      }
    }

    if (activeNavItem.id === 'environment') {
      if (activeTabId === 'all' || activeTabId === 'shell-import') {
        content = (
          <div className="space-y-6">
            {renderToggleBlock(
              'Shell Environment Import Enabled',
              'Shell environment import controls for loading variables from your login shell during startup. Keep this enabled when you depend on profile-defined secrets or PATH customizations.',
              'shellEnvironmentImportEnabled',
            )}
            {renderInputBlock(
              'Shell Environment Import Timeout (ms)',
              'Maximum time in milliseconds allowed for shell environment resolution before fallback behavior applies. Use tighter timeouts for faster startup, or increase when shell initialization is heavy.',
              'shellEnvironmentImportTimeoutMs',
              'number',
            )}
          </div>
        );
      }

      if (activeTabId === 'overrides') {
        content = renderTextareaBlock(
          'Environment Variable Overrides',
          'Explicit environment variable key/value overrides injected into the runtime after shell import resolution.',
          'environmentVariableOverrides',
          '{\n  "OPENCLAW_LOG_LEVEL": "debug"\n}',
        );
      }
    }

    if (activeNavItem.id === 'media') {
      if (activeTabId === 'all' || activeTabId === 'preserve-filenames') {
        content = renderToggleBlock(
          'Preserve Media Filenames',
          'Preserve original inbound media filenames instead of normalizing to generated names. Enable only when downstream systems rely on source filenames.',
          'preserveMediaFilenames',
        );
      }

      if (activeTabId === 'retention-ttl') {
        content = renderInputBlock(
          'Media Retention TTL (hours)',
          'Retention time in hours for temporary media objects before cleanup removes them from local storage.',
          'mediaRetentionTtlHours',
          'number',
        );
      }
    }

    if (activeNavItem.id === 'memory') {
      if (activeTabId === 'all' || activeTabId === 'backend') {
        content = renderSelectBlock(
          'Memory Backend',
          'Selects the global memory engine. `builtin` uses OpenClaw memory internals, while `qmd` uses the QMD sidecar pipeline. Keep `builtin` unless you intentionally operate QMD.',
          'memoryBackend',
          [
            { label: 'builtin', value: 'builtin' },
            { label: 'qmd', value: 'qmd' },
          ],
        );
      }

      if (activeTabId === 'citations-mode') {
        content = renderSelectBlock(
          'Memory Citations Mode',
          'Controls how memory citations are attached to responses when retrieved memory contributes to generation.',
          'memoryCitationsMode',
          [
            { label: 'off', value: 'off' },
            { label: 'inline', value: 'inline' },
            { label: 'footnote', value: 'footnote' },
          ],
        );
      }

      if (activeTabId === 'qmd') {
        content = (
          <div className="space-y-6">
            {renderInputBlock(
              'Qmd Base URL',
              'Base URL for the QMD service used when the global memory backend is set to `qmd`.',
              'memoryQmdBaseUrl',
              'text',
              'http://127.0.0.1:8787',
            )}
            {renderInputBlock(
              'Qmd Collection',
              'Logical collection or namespace used to group memory vectors for this runtime.',
              'memoryQmdCollection',
              'text',
              'default',
            )}
          </div>
        );
      }
    }

    if (activeNavItem.id === 'metadata') {
      if (activeTabId === 'all' || activeTabId === 'last-touched-at') {
        content = renderReadonlyBlock(
          'Config Last Touched At',
          'Timestamp recorded when this configuration file was most recently written by OpenClaw or a compatible management surface.',
          'configLastTouchedAt',
        );
      }

      if (activeTabId === 'last-touched-version') {
        content = renderReadonlyBlock(
          'Config Last Touched Version',
          'Version string recorded for the runtime that last updated this configuration file.',
          'configLastTouchedVersion',
        );
      }
    }

    if (activeNavItem.id === 'web-channel') {
      if (activeTabId === 'all' || activeTabId === 'enabled') {
        content = renderToggleBlock(
          'Web Channel Enabled',
          'Enables the web channel runtime used by browser-based chat surfaces and session attachments.',
          'webChannelEnabled',
        );
      }

      if (activeTabId === 'heartbeat-interval') {
        content = renderInputBlock(
          'Web Channel Heartbeat Interval (seconds)',
          'Heartbeat interval in seconds used to keep browser-linked sessions warm and detect disconnects.',
          'webChannelHeartbeatIntervalSeconds',
          'number',
        );
      }

      if (activeTabId === 'reconnect-backoff') {
        content = renderInputBlock(
          'Web Channel Reconnect Backoff (seconds)',
          'Reconnect backoff in seconds before retrying web channel attachment after transient disconnect.',
          'webChannelReconnectBackoffSeconds',
          'number',
        );
      }
    }

    if (activeNavItem.id === 'setup-wizard-state') {
      if (activeTabId === 'all' || activeTabId === 'wizard-last-run-timestamp') {
        content = renderReadonlyBlock(
          'Wizard Last Run Timestamp',
          'ISO timestamp for when the setup wizard most recently completed on this host. Use this to confirm onboarding recency during support and operational audits.',
          'wizardLastRunTimestamp',
        );
      }

      if (activeTabId === 'wizard-last-run-command') {
        content = renderReadonlyBlock(
          'Wizard Last Run Command',
          'The last setup wizard command or entry path used to complete onboarding.',
          'wizardLastRunCommand',
        );
      }
    }

    if (activeNavItem.id === 'updates') {
      if (activeTabId === 'all' || activeTabId === 'auto') {
        content = (
          <div className="space-y-6">
            {renderInputBlock(
              'Auto Update Beta Check Interval (hours)',
              'How often beta-channel checks run in hours (default: 1).',
              'autoUpdateBetaCheckIntervalHours',
              'number',
            )}
            {renderToggleBlock(
              'Auto Update Enabled',
              'Enables automated update checks and managed rollout behavior according to your selected update channel.',
              'autoUpdateEnabled',
            )}
            {renderInputBlock(
              'Auto Update Stable Delay (hours)',
              'Minimum delay before stable-channel auto-apply starts (default: 6).',
              'autoUpdateStableDelayHours',
              'number',
            )}
            {renderInputBlock(
              'Auto Update Stable Jitter (hours)',
              'Extra stable-channel rollout spread window in hours (default: 12).',
              'autoUpdateStableJitterHours',
              'number',
            )}
          </div>
        );
      }

      if (activeTabId === 'channel') {
        content = renderSelectBlock(
          'Update Channel',
          'Controls which release channel this runtime follows for update checks and rollout policy.',
          'updateChannel',
          [
            { label: 'stable', value: 'stable' },
            { label: 'beta', value: 'beta' },
            { label: 'nightly', value: 'nightly' },
          ],
        );
      }

      if (activeTabId === 'check-on-start') {
        content = renderToggleBlock(
          'Update Check on Start',
          'Runs an update availability check during application startup so operators receive prompt version visibility.',
          'updateCheckOnStart',
        );
      }
    }

    if (activeNavItem.id === 'cli') {
      content = renderSelectBlock(
        'CLI Banner Tagline Mode',
        'Controls tagline style in the CLI startup banner: `random` picks from the rotating tagline pool, `default` always shows the neutral default tagline, and `off` hides tagline text while keeping the banner version line.',
        'cliBannerTaglineMode',
        [
          { label: 'random', value: 'random' },
          { label: 'default', value: 'default' },
          { label: 'off', value: 'off' },
        ],
      );
    }

    if (activeNavItem.id === 'diagnostics') {
      if (activeTabId === 'all' || activeTabId === 'cache-trace') {
        content = (
          <div className="space-y-6">
            {renderToggleBlock(
              'Cache Trace Enabled',
              'Cache-trace logging settings for observing cache decisions and payload context in embedded runs. Enable this temporarily for debugging and disable afterward to reduce sensitive log footprint.',
              'cacheTraceEnabled',
            )}
            {renderInputBlock(
              'Cache Trace File Path',
              'JSONL output path for cache trace logs.',
              'cacheTraceFilePath',
              'text',
              '$OPENCLAW_STATE_DIR/logs/cache-trace.jsonl',
            )}
            {renderToggleBlock(
              'Cache Trace Include Messages',
              'Includes message content in cache trace output when enabled.',
              'cacheTraceIncludeMessages',
            )}
            {renderToggleBlock(
              'Cache Trace Include Prompt',
              'Includes final prompt payloads in cache trace output when enabled.',
              'cacheTraceIncludePrompt',
            )}
            {renderToggleBlock(
              'Cache Trace Include System',
              'Includes system prompt and runtime system context in cache trace output when enabled.',
              'cacheTraceIncludeSystem',
            )}
          </div>
        );
      }

      if (activeTabId === 'diagnostics-enabled') {
        content = renderToggleBlock(
          'Diagnostics Enabled',
          'Master diagnostics switch for additional tracing and troubleshooting instrumentation.',
          'diagnosticsEnabled',
        );
      }

      if (activeTabId === 'diagnostics-flags') {
        content = renderTextareaBlock(
          'Diagnostics Flags',
          'Additional diagnostics flags or feature switches used to selectively enable deeper troubleshooting signals.',
          'diagnosticsFlags',
          'trace-cache\ntrace-memory',
        );
      }
    }

    if (activeNavItem.id === 'gateway') {
      if (activeTabId === 'all' || activeTabId === 'bind') {
        content = (
          <div className="space-y-6">
            {renderSelectBlock(
              'Gateway Mode',
              'Controls whether the desktop targets a locally hosted gateway or connects to a remote gateway endpoint.',
              'gatewayMode',
              [
                { label: 'local', value: 'local' },
                { label: 'remote', value: 'remote' },
              ],
            )}
            {renderSelectBlock(
              'Gateway Bind',
              'Bind profile used by local gateway exposure. Non-loopback exposure should be paired with explicit authentication.',
              'gatewayBind',
              [
                { label: 'loopback', value: 'loopback' },
                { label: 'local', value: 'local' },
                { label: 'lan', value: 'lan' },
                { label: 'tailnet', value: 'tailnet' },
                { label: 'custom', value: 'custom' },
              ],
            )}
            {renderInputBlock(
              'Bind Host',
              'Explicit host used by the local gateway listener when host-based routing is required.',
              'host',
              'text',
              '127.0.0.1',
            )}
            {renderInputBlock(
              'Port',
              'TCP port exposed by the gateway service.',
              'port',
              'number',
            )}
            {renderInputBlock(
              'Gateway URL',
              'Optional explicit gateway URL used by callers or compatibility flows.',
              'gatewayUrl',
              'text',
              'http://127.0.0.1:18789',
            )}
          </div>
        );
      }

      if (activeTabId === 'auth') {
        content = (
          <div className="space-y-6">
            {renderSelectBlock(
              'Gateway Auth Mode',
              'Authentication mode for gateway access. Keep authentication enabled whenever bind is not loopback-only.',
              'authMode',
              [
                { label: 'token', value: 'token' },
                { label: 'password', value: 'password' },
                { label: 'disabled', value: 'disabled' },
              ],
            )}
            {renderInputBlock(
              'Gateway Token',
              'Primary token used by gateway authentication.',
              'token',
              'text',
            )}
            {renderInputBlock(
              'Gateway Token Ref Env',
              'Environment variable name used to resolve the gateway token at runtime.',
              'tokenRefEnv',
              'text',
              'OPENCLAW_GATEWAY_TOKEN',
            )}
            {renderInputBlock(
              'Legacy Gateway Token',
              'Legacy top-level gateway token retained for compatibility with older runtime consumers.',
              'legacyGatewayToken',
              'text',
            )}
          </div>
        );
      }

      if (activeTabId === 'remote') {
        content = (
          <div className="space-y-6">
            {renderInputBlock(
              'Remote Gateway URL',
              'Remote gateway base URL used when gateway mode is set to remote.',
              'gatewayRemoteUrl',
              'text',
              'https://gateway.example.com',
            )}
            {renderInputBlock(
              'Remote Gateway Token',
              'Remote gateway access token used together with the remote URL.',
              'gatewayRemoteToken',
              'text',
            )}
          </div>
        );
      }
    }

    if (activeNavItem.id === 'node-host') {
      content = (
        <div className="space-y-6">
          {renderInputBlock(
            'Node Gateway Host',
            'Host value stored in `node.json -> gateway.host`. Desktop gateway target resolution uses this as a fallback when `openclaw.json` does not explicitly define a gateway host.',
            'nodeGatewayHost',
            'text',
            '127.0.0.1',
          )}
          {renderInputBlock(
            'Node Gateway Port',
            'Port value stored in `node.json -> gateway.port`. Desktop gateway target resolution uses this as a fallback when `openclaw.json` does not explicitly define a gateway port.',
            'nodeGatewayPort',
            'number',
          )}
        </div>
      );
    }

    if (activeNavItem.id === 'agents') {
      if (activeTabId === 'all' || activeTabId === 'agent-defaults') {
        content = (
          <div className="space-y-6">
            {renderInputBlock(
              'Default Model Primary',
              'Primary model inherited by agents that do not override their own model.',
              'agentDefaultModelPrimary',
              'text',
              'dashscope/deepseek-v3.2',
            )}
            {renderStringListEditor(
              'Default Model Fallbacks',
              'Ordered fallback model IDs used when the primary model is unavailable or exhausted.',
              'agentDefaultModelFallbacks',
              'dashscope/qwen-max',
            )}
            {renderInputBlock(
              'Subagents Max Concurrent',
              'Maximum number of subagents that can run concurrently by default.',
              'agentDefaultsSubagentsMaxConcurrent',
              'number',
            )}
          </div>
        );
      }

      if (activeTabId === 'bootstrap') {
        content = (
          <div className="space-y-6">
            {renderToggleBlock(
              'Skip Bootstrap',
              'Skips loading bootstrap files such as `AGENTS.md`, `SOUL.md`, `TOOLS.md`, `IDENTITY.md`, `USER.md`, `HEARTBEAT.md`, and `BOOTSTRAP.md` into the runtime prompt.',
              'agentDefaultsSkipBootstrap',
            )}
            {renderInputBlock(
              'Bootstrap Max Chars',
              'Maximum characters allowed from each individual bootstrap file before truncation.',
              'agentDefaultsBootstrapMaxChars',
              'number',
            )}
            {renderInputBlock(
              'Bootstrap Total Max Chars',
              'Maximum total characters allowed across all injected bootstrap files.',
              'agentDefaultsBootstrapTotalMaxChars',
              'number',
            )}
            {renderSelectBlock(
              'Bootstrap Prompt Truncation Warning',
              'Controls whether truncation warning text is injected into the system prompt when bootstrap files are trimmed.',
              'agentDefaultsBootstrapPromptTruncationWarning',
              [
                { label: 'off', value: 'off' },
                { label: 'once', value: 'once' },
                { label: 'always', value: 'always' },
              ],
            )}
          </div>
        );
      }

      if (activeTabId === 'compaction') {
        content = (
          <div className="space-y-6">
            {renderSelectBlock(
              'Compaction Mode',
              'Compaction strategy for long histories. `safeguard` is the documented default and applies stricter continuity protections.',
              'agentDefaultsCompactionMode',
              [
                { label: 'default', value: 'default' },
                { label: 'safeguard', value: 'safeguard' },
              ],
            )}
            {renderInputBlock(
              'Compaction Reserve Tokens Floor',
              'Minimum token reserve retained during compaction to preserve reply headroom.',
              'agentDefaultsCompactionReserveTokensFloor',
              'number',
            )}
            {renderSelectBlock(
              'Compaction Identifier Policy',
              'Identifier preservation policy for compaction summaries.',
              'agentDefaultsCompactionIdentifierPolicy',
              [
                { label: 'strict', value: 'strict' },
                { label: 'off', value: 'off' },
                { label: 'custom', value: 'custom' },
              ],
            )}
            {renderTextareaBlock(
              'Compaction Identifier Instructions',
              'Custom identifier-preservation instructions used when identifier policy is set to `custom`.',
              'agentDefaultsCompactionIdentifierInstructions',
              'Preserve deployment IDs, ticket IDs, and host:port pairs exactly.',
            )}
            {renderStringListEditor(
              'Post-Compaction Context Sections',
              'AGENTS.md H2/H3 section names re-injected after compaction. Official defaults are `Session Startup` and `Red Lines`; empty list disables reinjection.',
              'agentDefaultsCompactionPostSections',
              'Session Startup',
            )}
            {renderInputBlock(
              'Compaction Model Override',
              'Optional provider/model-id override used only for compaction summarization.',
              'agentDefaultsCompactionModel',
              'text',
              'openrouter/anthropic/claude-sonnet-4-5',
            )}
            {renderToggleBlock(
              'Compaction Memory Flush Enabled',
              'Runs a silent memory flush turn before auto-compaction to store durable notes.',
              'agentDefaultsCompactionMemoryFlushEnabled',
            )}
            {renderInputBlock(
              'Compaction Memory Flush Soft Threshold Tokens',
              'Token threshold that triggers pre-compaction memory flush.',
              'agentDefaultsCompactionMemoryFlushSoftThresholdTokens',
              'number',
            )}
            {renderTextareaBlock(
              'Compaction Memory Flush System Prompt',
              'System prompt override for the pre-compaction memory flush turn.',
              'agentDefaultsCompactionMemoryFlushSystemPrompt',
              'Session nearing compaction. Store durable memories now.',
            )}
            {renderTextareaBlock(
              'Compaction Memory Flush Prompt',
              'User prompt template used for the pre-compaction memory flush turn.',
              'agentDefaultsCompactionMemoryFlushPrompt',
              'Write any lasting notes to memory/YYYY-MM-DD.md; reply with NO_REPLY if nothing to store.',
            )}
          </div>
        );
      }

      if (activeTabId === 'agent-list') {
        content = renderAgentListEditor();
      }
    }

    return (
      <GlassCard className="rounded-[24px] p-5 lg:p-6">
        <div className="space-y-5">
          <div>
            <h3 className="text-[32px] font-semibold leading-tight" style={{ color: 'var(--app-text)' }}>
              {activeCustomDetail.title}
            </h3>
            <p className="mt-2 max-w-4xl text-sm leading-7" style={{ color: 'var(--app-text-muted)' }}>
              {activeCustomDetail.description}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {activeCustomDetail.tabs.map((tab) => renderTabButton(activeNavItem.id, tab))}
          </div>

          {content}
        </div>
      </GlassCard>
    );
  };

  const renderField = (field: OpenClawManifestField) => {
    const value = draft[field.id];

    if (field.type === 'readonly') {
      return (
        <div
          className="rounded-xl border px-4 py-3 text-sm"
          style={{
            backgroundColor: 'var(--app-bg)',
            borderColor: 'var(--app-border)',
            color: 'var(--app-text)',
          }}
        >
          {String(value ?? '') || '—'}
        </div>
      );
    }

    if (field.type === 'select') {
      return (
        <AppSelect
          value={typeof value === 'string' ? value : ''}
          onChange={(nextValue) => updateField(field.id, nextValue)}
          options={field.options || []}
          placeholder={`请选择${field.label}`}
          size="md"
        />
      );
    }

    const inputType = field.type === 'password'
      ? 'password'
      : field.type === 'number'
        ? 'number'
        : 'text';

    return (
      <input
        type={inputType}
        value={typeof value === 'number' ? value : String(value ?? '')}
        onChange={(event) => updateField(
          field.id,
          field.type === 'number'
            ? Number(event.target.value || 0)
            : event.target.value,
        )}
        className={inputClassName}
        style={{
          backgroundColor: 'var(--app-bg)',
          borderColor: 'var(--app-border)',
          color: 'var(--app-text)',
        }}
      />
    );
  };

  const renderSection = (section: OpenClawManifestSection) => {
    const sectionFields = section.fields || [];
    const sectionCommands = section.commands || [];

    return (
      <GlassCard key={section.id} className="rounded-[24px] p-5 lg:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold" style={{ color: 'var(--app-text)' }}>
              {section.title}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-7" style={{ color: 'var(--app-text-muted)' }}>
              {section.description}
            </p>
          </div>
        </div>

        {sectionFields.length ? (
          <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
            {sectionFields.map((field) => (
              <div key={field.id} className="space-y-2">
                <label className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>
                  {field.label}
                </label>
                {renderField(field)}
                {field.path ? (
                  <div className="text-xs" style={{ color: 'var(--app-text-muted)' }}>
                    映射路径：`{field.path}`
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        {sectionCommands.length ? (
          <div className="mt-5 space-y-3">
            <div className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>
              官方命令参考
            </div>
            <div className="space-y-2">
              {sectionCommands.map((command) => (
                <div
                  key={command.id}
                  className="rounded-xl border px-4 py-3"
                  style={{
                    backgroundColor: 'var(--app-bg)',
                    borderColor: 'var(--app-border)',
                  }}
                >
                  <div className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>
                    {command.label}
                  </div>
                  <div className="mt-1 font-mono text-xs leading-6" style={{ color: 'var(--app-text-muted)' }}>
                    {[overview?.commandPath || 'openclaw', ...(command.subcommands || [])].join(' ')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </GlassCard>
    );
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <div className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
          正在读取 OpenClaw 核心配置…
        </div>
      </div>
    );
  }

  if (!overview) {
    return (
      <GlassCard className="rounded-[24px] p-6">
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold" style={{ color: 'var(--app-text)' }}>
              核心配置读取失败
            </h2>
            <p className="mt-2 text-sm leading-7" style={{ color: 'var(--app-text-muted)' }}>
              {loadError || '暂时无法读取 OpenClaw 核心配置，请检查 OpenClaw CLI 路径、配置文件路径或 manifest 是否可用。'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <AppButton
              variant="secondary"
              onClick={loadOverview}
              disabled={isLoading}
              icon={<RefreshCw size={14} />}
            >
              重新加载
            </AppButton>
          </div>
        </div>
      </GlassCard>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* 顶部操作栏 */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold" style={{ color: 'var(--app-text)' }}>Core Config</h1>
          <div className="rounded-full px-2.5 py-1 text-xs" style={{ backgroundColor: 'var(--app-bg-subtle)', color: 'var(--app-text-muted)' }}>
            {overview.openclawVersion}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AppButton
            variant="secondary"
            onClick={loadOverview}
            disabled={isLoading || isSaving}
            icon={<RefreshCw size={14} />}
          >
            刷新
          </AppButton>
          <AppButton
            variant="success"
            onClick={handleSave}
            disabled={isLoading || isSaving}
            icon={<Save size={14} />}
          >
            {isSaving ? '保存中...' : '保存'}
          </AppButton>
        </div>
      </div>

      {message ? (
        <div
          className={`mb-3 rounded-lg border px-4 py-2.5 text-sm ${message.includes('错误') ? 'border-red-700 text-red-300' : 'border-emerald-700 text-emerald-300'}`}
          style={{
            backgroundColor: message.includes('错误') ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.12)',
          }}
        >
          {message}
        </div>
      ) : null}

      {/* 两栏固定布局 */}
      <div className="flex flex-1 gap-4 overflow-hidden">
        {/* 左侧导航 — 独立滚动 */}
        <div
          className="w-[260px] shrink-0 overflow-y-auto rounded-[20px] border p-3"
          style={{
            backgroundColor: 'var(--app-bg-elevated)',
            borderColor: 'var(--app-border)',
          }}
        >
          <div className="space-y-0.5">
            {configNavGroups.map((group, groupIndex) => (
              <div
                key={group.id}
                className={groupIndex === 0 ? '' : 'border-t pt-2 mt-2'}
                style={groupIndex === 0 ? undefined : { borderColor: 'var(--app-border)' }}
              >
                {group.items.map((item) => {
                  const isActive = item.id === activeNavItem?.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelectNavItem(item.id)}
                      className="w-full rounded-xl px-3 py-2.5 text-left transition-token-fast"
                      style={{
                        backgroundColor: isActive ? 'rgba(96, 165, 250, 0.15)' : 'transparent',
                        boxShadow: isActive ? 'inset 0 0 0 1px rgba(96, 165, 250, 0.22)' : 'none',
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium truncate" style={{ color: isActive ? '#60a5fa' : 'var(--app-text)' }}>
                          {item.title}
                        </div>
                        {isActive && <ChevronRight size={14} style={{ color: '#60a5fa', flexShrink: 0 }} />}
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* 右侧内容区 — 独立滚动 */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-0.5">
          {activeCustomDetail ? (
            renderCustomDetailPanel()
          ) : activeManifestSections.length ? (
            <div className="space-y-4">
              {activeManifestSections.map(renderSection)}
            </div>
          ) : (
            <GlassCard className="rounded-[24px] p-5 lg:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-xl font-semibold" style={{ color: 'var(--app-text)' }}>
                    {activeNavItem?.title || 'Config'}
                  </h3>
                  <p className="mt-2 max-w-3xl text-sm leading-7" style={{ color: 'var(--app-text-muted)' }}>
                    该配置项的右侧详情面板已预留完成，后续可以继续按你的节奏逐项补充具体字段、分组和交互。
                  </p>
                </div>
              </div>

              <div className="mt-5 rounded-2xl border p-4" style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-bg)' }}>
                <div className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>
                  当前状态
                </div>
                <div className="mt-2 text-sm leading-7" style={{ color: 'var(--app-text-muted)' }}>
                  左侧导航骨架与主项已经就位。这个主项暂未接入桌面端现有 manifest 字段，后续可继续为它补充表单、子标签和配置映射。
                </div>
              </div>
            </GlassCard>
          )}

          <GlassCard className="rounded-[20px] p-5">
            <details>
              <summary className="cursor-pointer text-sm font-medium select-none" style={{ color: 'var(--app-text)' }}>
                Raw JSON Preview
              </summary>
              <pre
                className="mt-4 overflow-x-auto rounded-xl border p-4 text-xs leading-6"
                style={{
                  backgroundColor: 'var(--app-bg)',
                  borderColor: 'var(--app-border)',
                  color: 'var(--app-text-muted)',
                }}
              >
                {JSON.stringify(overview.rawConfig, null, 2)}
              </pre>
            </details>
          </GlassCard>
        </div>
      </div>
    </div>
  );
};

export default SettingsCoreConfig;
