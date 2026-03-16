import React from 'react';
import {
  matchPath,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import type {
  SettingsGetResult,
  SetupInstallResult,
} from '../types/electron';
import type {
  ChannelAddResult,
  ChannelConfig,
  FixResult,
  RuntimeResolution,
  SetupEnvironmentCheck,
  SetupInstallResult as SetupInstallFlowResult,
  SetupLocalCheckResult,
  SetupMode,
  SetupRemoteDraft,
  SetupRemoteVerificationResult,
  SetupSettings,
} from '../types/setup';

/** 环境修复进度状态 */
interface FixProgressState {
  action: string;
  status: 'idle' | 'running' | 'done' | 'error';
  message: string;
}

interface SetupFlowContextValue {
  completeSetup: () => Promise<void>;
  currentStep: string;
  environmentCheck: SetupEnvironmentCheck;
  errorMessage: string;
  goBackStep: () => void;
  hasCompletedSetup: boolean;
  isBootstrapping: boolean;
  isBusy: boolean;
  localCheckResult: SetupLocalCheckResult | null;
  mode: SetupMode | null;
  persistPartialState: (updates: Partial<SetupSettings>) => Promise<void>;
  installOpenClawForSetup: () => Promise<SetupInstallFlowResult>;
  refreshEnvironmentCheck: () => Promise<SetupEnvironmentCheck>;
  refreshLocalCheck: () => Promise<SetupLocalCheckResult>;
  remoteDraft: SetupRemoteDraft;
  remoteVerification: SetupRemoteVerificationResult | null;
  setupInstallResult: SetupInstallFlowResult;
  saveLocalConfiguration: (payload: {
    openclawPath: string;
    openclawRootDir: string;
  }) => Promise<void>;
  saveRemoteDraft: (payload: SetupRemoteDraft) => Promise<void>;
  selectMode: (mode: SetupMode) => Promise<void>;
  setErrorMessage: React.Dispatch<React.SetStateAction<string>>;
  setupSettings: SetupSettings;
  verifyLocalSetup: () => Promise<boolean>;
  verifyRemoteSetup: () => Promise<SetupRemoteVerificationResult>;

  // 运行时解析
  runtimeResolution: RuntimeResolution | null;

  // 环境修复
  fixEnvironment: (action: 'install' | 'upgrade' | 'fixPath') => Promise<FixResult>;
  fixProgress: FixProgressState;

  // 渠道绑定
  channelConfigs: ChannelConfig[];
  updateChannelConfig: (key: string, updates: Partial<ChannelConfig>) => void;
  testChannelConnection: (key: string) => Promise<boolean>;
  saveChannelConfigs: () => Promise<void>;

  /** 批量添加已启用渠道到 OpenClaw 系统 */
  addEnabledChannels: () => Promise<ChannelAddResult[]>;
  /** 渠道添加结果列表 */
  channelAddResults: ChannelAddResult[];
  /** 引导流程中创建的 Agent 信息 */
  createdAgent: { id: string; name: string } | null;
  /** 设置已创建的 Agent */
  setCreatedAgent: (agent: { id: string; name: string } | null) => void;
}

const SetupFlowContext = React.createContext<SetupFlowContextValue | undefined>(undefined);

const defaultRemoteDraft: SetupRemoteDraft = {
  host: '',
  port: '3000',
  protocol: 'http',
  token: '',
};

const defaultLocalCheckResult: SetupLocalCheckResult = {
  commandDetected: false,
  commandPath: '',
  rootDirDetected: false,
  rootDir: '',
  versionSuccess: false,
  versionOutput: '',
  error: '',
};

/** 默认支持的消息渠道列表 */
const defaultChannelConfigs: ChannelConfig[] = [
  // —— 内置渠道（Gateway 原生支持） ——
  {
    key: 'telegram', label: 'Telegram', hint: 'Bot API via grammY，支持群组', tokenLabel: 'Bot Token',
    enabled: false, token: '', fieldValues: {}, testStatus: 'idle',
    fields: [{ id: 'token', label: 'Bot Token', placeholder: '例如 123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11', type: 'password', required: true }],
    cliHint: 'openclaw channels add --channel telegram --token <bot-token>',
  },
  {
    key: 'whatsapp', label: 'WhatsApp', hint: '使用 Baileys，需 QR 配对扫码', tokenLabel: 'QR Pairing',
    enabled: false, token: '', fieldValues: {}, testStatus: 'idle',
    fields: [{ id: 'info', label: '配对方式', placeholder: '启用后通过 openclaw channels login --channel whatsapp 扫码配对', type: 'info', required: false }],
    cliHint: 'openclaw channels login --channel whatsapp',
  },
  {
    key: 'feishu', label: 'Feishu / Lark', hint: '飞书/Lark 机器人，WebSocket 接入', tokenLabel: 'App ID / App Secret',
    enabled: false, token: '', fieldValues: {}, testStatus: 'idle',
    fields: [
      { id: 'appId', label: 'App ID', placeholder: '飞书开放平台应用的 App ID', type: 'text', required: true },
      { id: 'appSecret', label: 'App Secret', placeholder: '飞书开放平台应用的 App Secret', type: 'password', required: true },
    ],
    cliHint: 'openclaw channels add --channel feishu --app-id <id> --app-secret <secret>',
  },
  {
    key: 'discord', label: 'Discord', hint: 'Bot API + Gateway，支持服务器/频道/DM', tokenLabel: 'Bot Token',
    enabled: false, token: '', fieldValues: {}, testStatus: 'idle',
    fields: [{ id: 'token', label: 'Bot Token', placeholder: '从 Discord Developer Portal 获取', type: 'password', required: true }],
    cliHint: 'openclaw channels add --channel discord --token <bot-token>',
  },
  {
    key: 'signal', label: 'Signal', hint: '通过 signal-cli 接入，注重隐私', tokenLabel: 'Signal CLI Path',
    enabled: false, token: '', fieldValues: {}, testStatus: 'idle',
    fields: [{ id: 'phone', label: '手机号', placeholder: '+86xxxxxxxxxxx', type: 'text', required: true }],
    cliHint: 'openclaw channels add --channel signal --phone <number>',
  },
  {
    key: 'slack', label: 'Slack', hint: 'Bolt SDK，Workspace 应用', tokenLabel: 'Bot OAuth Token',
    enabled: false, token: '', fieldValues: {}, testStatus: 'idle',
    fields: [
      { id: 'appToken', label: 'App Token', placeholder: 'xapp-1-...', type: 'password', required: true },
      { id: 'botToken', label: 'Bot Token', placeholder: 'xoxb-...', type: 'password', required: true },
    ],
    cliHint: 'openclaw channels add --channel slack --app-token <xapp-...> --bot-token <xoxb-...>',
  },
  {
    key: 'bluebubbles', label: 'BlueBubbles', hint: '推荐的 iMessage 方案，需 macOS BlueBubbles 服务器', tokenLabel: 'Server Password',
    enabled: false, token: '', fieldValues: {}, testStatus: 'idle',
    fields: [
      { id: 'url', label: 'Server URL', placeholder: 'http://localhost:1234', type: 'text', required: true },
      { id: 'password', label: 'Password', placeholder: 'BlueBubbles 服务器密码', type: 'password', required: true },
    ],
    cliHint: 'openclaw channels add --channel bluebubbles --url <server-url> --password <pwd>',
  },
  {
    key: 'imessage', label: 'iMessage (legacy)', hint: '旧版 imsg CLI 集成（已弃用，推荐 BlueBubbles）', tokenLabel: 'CLI Path',
    enabled: false, token: '', fieldValues: {}, testStatus: 'idle',
    fields: [{ id: 'info', label: '说明', placeholder: '已弃用，请使用 BlueBubbles 替代', type: 'info', required: false }],
    cliHint: 'openclaw channels add --channel imessage',
  },
  {
    key: 'googlechat', label: 'Google Chat', hint: 'Google Chat API，HTTP Webhook', tokenLabel: 'Webhook URL / Service Account',
    enabled: false, token: '', fieldValues: {}, testStatus: 'idle',
    fields: [{ id: 'serviceAccountKey', label: 'Service Account JSON', placeholder: 'Service Account 密钥文件路径或 JSON 内容', type: 'text', required: true }],
    cliHint: 'openclaw channels add --channel googlechat --service-account-key <path>',
  },
  {
    key: 'irc', label: 'IRC', hint: '经典 IRC 服务器，支持频道和 DM', tokenLabel: 'Server / Nick',
    enabled: false, token: '', fieldValues: {}, testStatus: 'idle',
    fields: [
      { id: 'server', label: 'Server', placeholder: 'irc.libera.chat:6697', type: 'text', required: true },
      { id: 'nick', label: 'Nick', placeholder: 'openclaw-bot', type: 'text', required: true },
    ],
    cliHint: 'openclaw channels add --channel irc --server <host:port> --nick <name>',
  },
  {
    key: 'webchat', label: 'WebChat', hint: 'Gateway 内置 WebChat UI，WebSocket 连接', tokenLabel: 'WebSocket URL',
    enabled: false, token: '', fieldValues: {}, testStatus: 'idle',
    fields: [{ id: 'info', label: '说明', placeholder: '无需额外配置，启用后 Gateway 自动提供 WebChat 界面', type: 'info', required: false }],
    cliHint: 'openclaw channels add --channel webchat',
  },
  // —— 插件渠道（需单独安装） ——
  {
    key: 'line', label: 'LINE', hint: 'LINE Messaging API 机器人（插件）', tokenLabel: 'Channel Access Token',
    enabled: false, token: '', fieldValues: {}, testStatus: 'idle',
    fields: [
      { id: 'channelSecret', label: 'Channel Secret', placeholder: 'LINE Channel Secret', type: 'password', required: true },
      { id: 'accessToken', label: 'Access Token', placeholder: 'LINE Channel Access Token', type: 'password', required: true },
    ],
    cliHint: 'openclaw channels add --channel line --channel-secret <secret> --access-token <token>',
  },
  {
    key: 'matrix', label: 'Matrix', hint: 'Matrix 协议接入（插件）', tokenLabel: 'Access Token',
    enabled: false, token: '', fieldValues: {}, testStatus: 'idle',
    fields: [
      { id: 'homeserver', label: 'Homeserver URL', placeholder: 'https://matrix.org', type: 'text', required: true },
      { id: 'accessToken', label: 'Access Token', placeholder: 'Matrix Access Token', type: 'password', required: true },
    ],
    cliHint: 'openclaw channels add --channel matrix --homeserver <url> --access-token <token>',
  },
  {
    key: 'mattermost', label: 'Mattermost', hint: 'Bot API + WebSocket，支持频道/群组/DM（插件）', tokenLabel: 'Bot Token',
    enabled: false, token: '', fieldValues: {}, testStatus: 'idle',
    fields: [
      { id: 'url', label: 'Server URL', placeholder: 'https://mattermost.example.com', type: 'text', required: true },
      { id: 'token', label: 'Bot Token', placeholder: 'Mattermost Bot Token', type: 'password', required: true },
    ],
    cliHint: 'openclaw channels add --channel mattermost --url <server-url> --token <bot-token>',
  },
  {
    key: 'msteams', label: 'Microsoft Teams', hint: 'Bot Framework，企业支持（插件）', tokenLabel: 'App ID / Password',
    enabled: false, token: '', fieldValues: {}, testStatus: 'idle',
    fields: [
      { id: 'appId', label: 'App ID', placeholder: 'Azure Bot App ID', type: 'text', required: true },
      { id: 'appPassword', label: 'App Password', placeholder: 'Azure Bot App Password', type: 'password', required: true },
    ],
    cliHint: 'openclaw channels add --channel msteams --app-id <id> --app-password <pwd>',
  },
  {
    key: 'nextcloudtalk', label: 'Nextcloud Talk', hint: '自托管 Nextcloud Talk，Webhook 接入（插件）', tokenLabel: 'Webhook Token',
    enabled: false, token: '', fieldValues: {}, testStatus: 'idle',
    fields: [
      { id: 'url', label: 'Nextcloud URL', placeholder: 'https://cloud.example.com', type: 'text', required: true },
      { id: 'token', label: 'App Token', placeholder: 'Nextcloud App Token', type: 'password', required: true },
    ],
    cliHint: 'openclaw channels add --channel nextcloudtalk --url <nc-url> --token <app-token>',
  },
  {
    key: 'nostr', label: 'Nostr', hint: '去中心化 DM，NIP-04 协议（插件）', tokenLabel: 'Private Key',
    enabled: false, token: '', fieldValues: {}, testStatus: 'idle',
    fields: [{ id: 'privateKey', label: 'Private Key (nsec)', placeholder: 'nsec1...', type: 'password', required: true }],
    cliHint: 'openclaw channels add --channel nostr --private-key <nsec...>',
  },
  {
    key: 'synologychat', label: 'Synology Chat', hint: 'Synology NAS Chat，Webhook 接入（插件）', tokenLabel: 'Webhook URL',
    enabled: false, token: '', fieldValues: {}, testStatus: 'idle',
    fields: [
      { id: 'incomingUrl', label: 'Incoming Webhook URL', placeholder: 'https://nas.example.com/webapi/...', type: 'text', required: true },
      { id: 'outgoingToken', label: 'Outgoing Token', placeholder: 'Outgoing Webhook Token', type: 'password', required: true },
    ],
    cliHint: 'openclaw channels add --channel synologychat --incoming-url <url> --outgoing-token <token>',
  },
  {
    key: 'tlon', label: 'Tlon', hint: 'Urbit 生态消息应用（插件）', tokenLabel: 'Ship Code',
    enabled: false, token: '', fieldValues: {}, testStatus: 'idle',
    fields: [
      { id: 'shipUrl', label: 'Ship URL', placeholder: 'http://localhost:8080', type: 'text', required: true },
      { id: 'code', label: 'Access Code', placeholder: '+code from Urbit', type: 'password', required: true },
    ],
    cliHint: 'openclaw channels add --channel tlon --ship-url <url> --code <access-code>',
  },
  {
    key: 'twitch', label: 'Twitch', hint: 'Twitch 聊天，IRC 连接（插件）', tokenLabel: 'OAuth Token',
    enabled: false, token: '', fieldValues: {}, testStatus: 'idle',
    fields: [
      { id: 'channel', label: 'Channel', placeholder: 'Twitch 频道名', type: 'text', required: true },
      { id: 'oauthToken', label: 'OAuth Token', placeholder: 'oauth:...', type: 'password', required: true },
    ],
    cliHint: 'openclaw channels add --channel twitch --channel-name <name> --oauth-token <token>',
  },
  {
    key: 'zalo', label: 'Zalo', hint: 'Zalo Bot API，越南流行通讯应用（插件）', tokenLabel: 'API Token',
    enabled: false, token: '', fieldValues: {}, testStatus: 'idle',
    fields: [{ id: 'token', label: 'API Token', placeholder: 'Zalo OA Access Token', type: 'password', required: true }],
    cliHint: 'openclaw channels add --channel zalo --token <oa-access-token>',
  },
  {
    key: 'zalopersonal', label: 'Zalo Personal', hint: 'Zalo 个人账号，QR 登录（插件）', tokenLabel: 'QR Login',
    enabled: false, token: '', fieldValues: {}, testStatus: 'idle',
    fields: [{ id: 'info', label: '配对方式', placeholder: '启用后通过 openclaw channels login --channel zalopersonal 扫码登录', type: 'info', required: false }],
    cliHint: 'openclaw channels login --channel zalopersonal',
  },
];

/** 默认环境修复进度状态 */
const defaultFixProgress: FixProgressState = {
  action: '',
  status: 'idle',
  message: '',
};

const setupRoutePatterns = [
  '/setup/welcome',
  '/setup/local/intro',
  '/setup/local/environment',
  '/setup/local/check',
  '/setup/local/confirm-existing',
  '/setup/local/install-guide',
  '/setup/local/configure',
  '/setup/local/channels',
  '/setup/local/create-agent',  // 新增：创建 Agent 步骤
  '/setup/local/verify',
  '/setup/remote/intro',
  '/setup/remote/config',
  '/setup/remote/verify',
  '/setup/complete',
] as const;

const getCurrentStepFromPath = (pathname: string) => {
  const matchedPattern = setupRoutePatterns.find((pattern) => matchPath(pattern, pathname));
  return matchedPattern || '/setup/welcome';
};

const getPreviousStep = (
  pathname: string,
  setupSettings: SetupSettings,
  mode: SetupMode | null,
): string | null => {
  const step = getCurrentStepFromPath(pathname);

  if (step === '/setup/local/configure') {
    if (setupSettings.localInstallValidated) {
      return '/setup/local/confirm-existing';
    }

    return '/setup/local/install-guide';
  }

  if (step === '/setup/complete') {
    return mode === 'remote'
      ? '/setup/remote/verify'
      : '/setup/local/verify';
  }

  const backMap: Record<string, string | null> = {
    '/setup/welcome': null,
    '/setup/local/intro': '/setup/welcome',
    '/setup/local/environment': '/setup/local/intro',
    '/setup/local/check': '/setup/local/environment',
    '/setup/local/confirm-existing': '/setup/local/check',
    '/setup/local/install-guide': '/setup/local/check',
    '/setup/local/channels': '/setup/local/configure',
    '/setup/local/create-agent': '/setup/local/channels',
    '/setup/local/verify': '/setup/local/create-agent',
    '/setup/remote/intro': '/setup/welcome',
    '/setup/remote/config': '/setup/remote/intro',
    '/setup/remote/verify': '/setup/remote/config',
  };

  return backMap[step] || '/setup/welcome';
};

const normalizeSettings = (
  result: SettingsGetResult<SetupSettings> | null,
): SetupSettings => {
  if (!result?.success || !result.settings) {
    return {};
  }

  return result.settings;
};

const detectRendererPlatform = () => {
  const platform = navigator.platform || navigator.userAgent || 'unknown';
  const normalized = platform.toLowerCase();

  if (normalized.includes('mac')) {
    return {
      platform: 'darwin',
      platformLabel: 'macOS',
    };
  }

  if (normalized.includes('win')) {
    return {
      platform: 'win32',
      platformLabel: 'Windows',
    };
  }

  if (normalized.includes('linux')) {
    return {
      platform: 'linux',
      platformLabel: 'Linux',
    };
  }

  return {
    platform: 'unknown',
    platformLabel: '未知系统',
  };
};

/**
 * 创建降级环境检测结果。
 * 当 IPC 调用失败或不可用时，保留已成功获取的部分检测结果，
 * 仅对缺失字段使用降级默认值。
 *
 * @param setupSettings - 当前设置状态，用于提取 openclawRootDir 等已知信息
 * @param errorMessage - 可选的具体错误原因，会写入 notes 和 diagnosticError
 * @param partialResult - 可选的部分检测结果，已成功获取的字段将被保留
 */
const createFallbackEnvironmentCheck = (
  setupSettings: SetupSettings,
  errorMessage?: string,
  partialResult?: Partial<SetupEnvironmentCheck>,
): SetupEnvironmentCheck => {
  const platformInfo = detectRendererPlatform();
  const isWindows = platformInfo.platform === 'win32';

  // 构建降级模式说明 notes
  const notes: string[] = [
    '当前未能从桌面端主进程拿到完整环境诊断结果，已切换为降级检测模式。',
    '你仍然可以查看后续安装检测；如需完整 Node / npm / CLI 诊断，请确认桌面端已更新到最新运行时代码。',
  ];

  // 将具体错误原因插入 notes 首位
  if (errorMessage) {
    notes.unshift(`环境自检异常：${errorMessage}`);
  }

  // 降级默认值：所有字段的兜底
  const defaults: SetupEnvironmentCheck = {
    source: 'fallback',
    platform: platformInfo.platform,
    platformLabel: platformInfo.platformLabel,
    runtimeMode: 'missing',
    runtimeCommand: undefined,
    bundledRuntimeAvailable: false,
    nodeInstalled: false,
    nodeVersionSatisfies: false,
    npmInstalled: false,
    openclawInstalled: false,
    openclawConfigExists: false,
    openclawRootDir: setupSettings.openclawRootDir || '',
    recommendedInstallCommand: isWindows
      ? 'iwr -useb https://openclaw.ai/install.ps1 | iex'
      : 'curl -fsSL https://openclaw.ai/install.sh | bash',
    recommendedInstallLabel: isWindows
      ? 'PowerShell 安装脚本（Windows / WSL）'
      : 'Shell 安装脚本（macOS / Linux）',
    notes,
    diagnosticError: errorMessage,
    bundledNodeAvailable: false,
    bundledOpenClawAvailable: false,
    runtimeTier: 'missing',
    fixableIssues: [],
  };

  // 无部分结果时直接返回默认值
  if (!partialResult) {
    return defaults;
  }

  // 合并：保留 partialResult 中已有的有效字段，缺失字段使用默认值。
  // source 和 runtimeMode 强制为降级值，notes 合并部分结果中的原有备注。
  const mergedNotes = [
    ...notes,
    ...(partialResult.notes || []),
  ];

  return {
    ...defaults,
    ...partialResult,
    // 以下字段强制使用降级值，不被 partialResult 覆盖
    source: 'fallback',
    runtimeMode: 'missing',
    notes: mergedNotes,
    diagnosticError: errorMessage || partialResult.diagnosticError,
    // 确保新增字段有兜底值（partialResult 中可能未包含）
    bundledNodeAvailable: partialResult.bundledNodeAvailable ?? false,
    bundledOpenClawAvailable: partialResult.bundledOpenClawAvailable ?? false,
    runtimeTier: partialResult.runtimeTier ?? 'missing',
    fixableIssues: partialResult.fixableIssues ?? [],
  };
};

const defaultSetupInstallResult: SetupInstallFlowResult = {
  success: false,
  message: '',
  command: '',
};

export const SetupFlowProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [isBootstrapping, setIsBootstrapping] = React.useState(true);
  const [isBusy, setIsBusy] = React.useState(false);
  const [setupSettings, setSetupSettings] = React.useState<SetupSettings>({});
  const [mode, setMode] = React.useState<SetupMode | null>(null);
  const [environmentCheck, setEnvironmentCheck] = React.useState<SetupEnvironmentCheck>(createFallbackEnvironmentCheck({}));
  const [localCheckResult, setLocalCheckResult] = React.useState<SetupLocalCheckResult | null>(null);
  const [remoteDraft, setRemoteDraft] = React.useState<SetupRemoteDraft>(defaultRemoteDraft);
  const [remoteVerification, setRemoteVerification] = React.useState<SetupRemoteVerificationResult | null>(null);
  const [setupInstallResult, setSetupInstallResult] = React.useState<SetupInstallFlowResult>(defaultSetupInstallResult);
  const [errorMessage, setErrorMessage] = React.useState('');
  const latestSettingsRef = React.useRef<SetupSettings>({});

  // 运行时解析状态
  const [runtimeResolution, setRuntimeResolution] = React.useState<RuntimeResolution | null>(null);

  // 环境修复进度状态
  const [fixProgress, setFixProgress] = React.useState<FixProgressState>(defaultFixProgress);

  // 渠道绑定配置状态
  const [channelConfigs, setChannelConfigs] = React.useState<ChannelConfig[]>(defaultChannelConfigs);

  // 渠道添加结果状态
  const [channelAddResults, setChannelAddResults] = React.useState<ChannelAddResult[]>([]);
  // 引导流程中创建的 Agent 信息
  const [createdAgent, setCreatedAgent] = React.useState<{ id: string; name: string } | null>(null);

  const currentStep = React.useMemo(
    () => getCurrentStepFromPath(location.pathname),
    [location.pathname],
  );

  const hasCompletedSetup = Boolean(setupSettings.setupCompleted);

  React.useEffect(() => {
    latestSettingsRef.current = setupSettings;
  }, [setupSettings]);

  const persistPartialState = React.useCallback(async (updates: Partial<SetupSettings>) => {
    const nextSettings = {
      ...latestSettingsRef.current,
      ...updates,
      setupLastVisitedAt: new Date().toISOString(),
    };

    latestSettingsRef.current = nextSettings;
    setSetupSettings(nextSettings);

    if (typeof window.electronAPI?.settingsSet === 'function') {
      await window.electronAPI.settingsSet(nextSettings);
    }
  }, []);

  const refreshEnvironmentCheck = React.useCallback(async () => {
    setIsBusy(true);
    setErrorMessage('');

    try {
      const result = typeof window.electronAPI?.setupEnvironmentCheck === 'function'
        ? await window.electronAPI.setupEnvironmentCheck()
        : createFallbackEnvironmentCheck(latestSettingsRef.current, '当前桌面端未暴露 setupEnvironmentCheck IPC');
      const normalizedResult: SetupEnvironmentCheck = (result as Partial<SetupEnvironmentCheck>).source
        ? {
            ...result,
            source: 'ipc' as const,
            runtimeMode: (result as Partial<SetupEnvironmentCheck>).runtimeMode || 'missing',
            bundledRuntimeAvailable: (result as Partial<SetupEnvironmentCheck>).bundledRuntimeAvailable || false,
            bundledNodeAvailable: (result as Partial<SetupEnvironmentCheck>).bundledNodeAvailable || false,
            bundledOpenClawAvailable: (result as Partial<SetupEnvironmentCheck>).bundledOpenClawAvailable || false,
            runtimeTier: (result as Partial<SetupEnvironmentCheck>).runtimeTier || 'missing',
            fixableIssues: (result as Partial<SetupEnvironmentCheck>).fixableIssues || [],
          } as SetupEnvironmentCheck
        : {
            ...result,
            source: 'ipc' as const,
            runtimeMode: 'missing',
            bundledRuntimeAvailable: false,
            bundledNodeAvailable: false,
            bundledOpenClawAvailable: false,
            runtimeTier: 'missing' as const,
            fixableIssues: [],
          };

      setEnvironmentCheck(normalizedResult);

      await persistPartialState({
        detectedPlatform: normalizedResult.platform,
        detectedPlatformLabel: normalizedResult.platformLabel,
        openclawRootDir: normalizedResult.openclawRootDir || latestSettingsRef.current.openclawRootDir,
        setupCurrentStep: '/setup/local/environment',
      });

      return normalizedResult;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const fallbackResult = createFallbackEnvironmentCheck(latestSettingsRef.current, message);
      setEnvironmentCheck(fallbackResult);
      setErrorMessage('环境检测未能完成，请重试。');
      await persistPartialState({
        detectedPlatform: fallbackResult.platform,
        detectedPlatformLabel: fallbackResult.platformLabel,
        openclawRootDir: fallbackResult.openclawRootDir || latestSettingsRef.current.openclawRootDir,
        setupCurrentStep: '/setup/local/environment',
      });
      return fallbackResult;
    } finally {
      setIsBusy(false);
    }
  }, [persistPartialState]);

  const refreshLocalCheck = React.useCallback(async () => {
    setIsBusy(true);
    setErrorMessage('');

    try {
      const [detectedPathResult, commandResult, rootResult] = await Promise.all([
        typeof window.electronAPI?.detectOpenClawPath === 'function'
          ? window.electronAPI.detectOpenClawPath()
          : Promise.resolve(null),
        typeof window.electronAPI?.diagnoseOpenClawCommand === 'function'
          ? window.electronAPI.diagnoseOpenClawCommand()
          : Promise.resolve(null),
        typeof window.electronAPI?.diagnoseOpenClawRoot === 'function'
          ? window.electronAPI.diagnoseOpenClawRoot()
          : Promise.resolve(null),
      ]);

      const resolvedCommandPath = commandResult?.diagnostic?.detectedPath
        || commandResult?.diagnostic?.pathEnvCommand
        || commandResult?.diagnostic?.configuredPath
        || detectedPathResult?.path
        || '';
      const resolvedRootDir = rootResult?.diagnostic?.rootDir
        || commandResult?.diagnostic?.rootDir
        || latestSettingsRef.current.openclawRootDir
        || '';

      const nextResult: SetupLocalCheckResult = {
        commandDetected: Boolean(commandResult?.diagnostic?.commandExists || resolvedCommandPath),
        commandPath: resolvedCommandPath,
        rootDirDetected: Boolean(rootResult?.success && rootResult?.diagnostic?.exists),
        rootDir: resolvedRootDir,
        versionSuccess: Boolean(commandResult?.diagnostic?.versionSuccess),
        versionOutput: commandResult?.diagnostic?.versionOutput || '',
        error: commandResult?.error || rootResult?.error || '',
      };

      setLocalCheckResult(nextResult);
      await persistPartialState({
        localInstallValidated: nextResult.commandDetected && nextResult.rootDirDetected,
        openclawPath: nextResult.commandPath || latestSettingsRef.current.openclawPath,
        openclawRootDir: nextResult.rootDir || latestSettingsRef.current.openclawRootDir,
        setupCurrentStep: '/setup/local/check',
      });

      return nextResult;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setErrorMessage('检测过程中出现问题，请重试。');
      const nextResult = {
        ...defaultLocalCheckResult,
        error: message,
      };
      setLocalCheckResult(nextResult);
      return nextResult;
    } finally {
      setIsBusy(false);
    }
  }, [persistPartialState, setupSettings.openclawPath, setupSettings.openclawRootDir]);

  const installOpenClawForSetup = React.useCallback(async () => {
    setIsBusy(true);
    setErrorMessage('');

    const runningState: SetupInstallFlowResult = {
      success: false,
      message: '正在自动安装 OpenClaw，请稍候…',
      command: environmentCheck.recommendedInstallCommand,
    };

    setSetupInstallResult(runningState);
    await persistPartialState({
      setupInstallStatus: 'running',
      setupInstallMessage: runningState.message,
      setupCurrentStep: '/setup/local/install-guide',
    });

    try {
      const result: SetupInstallResult = typeof window.electronAPI?.setupInstallOpenClaw === 'function'
        ? await window.electronAPI.setupInstallOpenClaw()
        : {
          success: false,
          message: '当前桌面端未提供一键安装能力。',
          command: environmentCheck.recommendedInstallCommand,
          error: 'setupInstallOpenClaw IPC 不可用',
        };

      setSetupInstallResult(result);

      await persistPartialState({
        setupInstallStatus: result.success ? 'succeeded' : 'failed',
        setupInstallMessage: result.message,
        setupCurrentStep: '/setup/local/install-guide',
      });

      if (!result.success) {
        setErrorMessage('安装未能完成，请检查网络连接后重试。');
        return result;
      }

      await refreshEnvironmentCheck();
      await refreshLocalCheck();

      // 不在这里 navigate，让前端安装页面走完 model/workspace/gateway 子步骤后再跳转

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failedResult: SetupInstallFlowResult = {
        success: false,
        message: 'OpenClaw 自动安装失败。',
        command: environmentCheck.recommendedInstallCommand,
        error: message,
      };
      setSetupInstallResult(failedResult);
      setErrorMessage('安装未能完成，请检查网络连接后重试。');
      await persistPartialState({
        setupInstallStatus: 'failed',
        setupInstallMessage: failedResult.message,
        setupCurrentStep: '/setup/local/install-guide',
      });
      return failedResult;
    } finally {
      setIsBusy(false);
    }
  }, [environmentCheck.recommendedInstallCommand, navigate, persistPartialState, refreshEnvironmentCheck, refreshLocalCheck]);

  const saveLocalConfiguration = React.useCallback(async (payload: {
    openclawPath: string;
    openclawRootDir: string;
  }) => {
    setIsBusy(true);
    setErrorMessage('');

    try {
      await persistPartialState({
        localInstallValidated: false,
        openclawPath: payload.openclawPath.trim(),
        openclawRootDir: payload.openclawRootDir.trim(),
        setupCurrentStep: '/setup/local/configure',
        setupMode: 'local',
      });
      setSetupSettings((prev) => ({
        ...prev,
        openclawPath: payload.openclawPath.trim(),
        openclawRootDir: payload.openclawRootDir.trim(),
      }));
    } finally {
      setIsBusy(false);
    }
  }, [persistPartialState]);

  const verifyLocalSetup = React.useCallback(async () => {
    setIsBusy(true);
    setErrorMessage('');

    try {
      const commandResult = typeof window.electronAPI?.testOpenClawCommand === 'function'
        ? await window.electronAPI.testOpenClawCommand()
        : null;

      if (!commandResult?.success) {
        throw new Error(commandResult?.error || commandResult?.message || 'OpenClaw CLI 验证失败');
      }

      const gatewayStatus = typeof window.electronAPI?.gatewayStatus === 'function'
        ? await window.electronAPI.gatewayStatus()
        : null;

      if (gatewayStatus?.status === 'stopped' && typeof window.electronAPI?.gatewayStart === 'function') {
        const startResult = await window.electronAPI.gatewayStart();
        if (!startResult.success) {
          throw new Error(startResult.error || startResult.message || 'OpenClaw 网关启动失败');
        }
      }

      const nextGatewayStatus = typeof window.electronAPI?.gatewayStatus === 'function'
        ? await window.electronAPI.gatewayStatus()
        : gatewayStatus;

      const gatewayHealthy = nextGatewayStatus
        && nextGatewayStatus.status !== 'error'
        && nextGatewayStatus.status !== 'checking'
        && nextGatewayStatus.status !== 'stopped';

      if (!gatewayHealthy) {
        throw new Error(nextGatewayStatus?.error || 'OpenClaw 网关当前不可用，请先完成本地安装或配置。');
      }

      await persistPartialState({
        localInstallValidated: true,
        setupCurrentStep: '/setup/local/verify',
      });
      return true;
    } catch (error) {
      setErrorMessage('验证未能完成，请确认 OpenClaw 已正确安装后重试。');
      return false;
    } finally {
      setIsBusy(false);
    }
  }, [persistPartialState]);

  const saveRemoteDraft = React.useCallback(async (payload: SetupRemoteDraft) => {
    setRemoteDraft(payload);
    setRemoteVerification(null);
    await persistPartialState({
      remoteConnectionValidated: false,
      remoteHost: payload.host.trim(),
      remotePort: Number(payload.port) || undefined,
      remoteProtocol: payload.protocol,
      remoteToken: payload.token,
      setupCurrentStep: '/setup/remote/config',
      setupMode: 'remote',
    });
  }, [persistPartialState]);

  const verifyRemoteSetup = React.useCallback(async () => {
    setIsBusy(true);
    setErrorMessage('');

    try {
      if (typeof window.electronAPI?.remoteOpenClawTestConnection !== 'function') {
        const unavailableResult: SetupRemoteVerificationResult = {
          success: false,
          error: '当前桌面端还未提供远程 OpenClaw 连接测试能力，请先完成 IPC 实现。',
        };
        setRemoteVerification(unavailableResult);
        return unavailableResult;
      }

      const result = await window.electronAPI.remoteOpenClawTestConnection({
        host: remoteDraft.host.trim(),
        port: Number(remoteDraft.port) || undefined,
        protocol: remoteDraft.protocol,
        token: remoteDraft.token,
      });

      setRemoteVerification(result);

      if (!result.success) {
        throw new Error(result.error || '远程 OpenClaw 连接验证失败');
      }

      if (typeof window.electronAPI?.remoteOpenClawSaveConnection === 'function') {
        await window.electronAPI.remoteOpenClawSaveConnection({
          host: remoteDraft.host.trim(),
          port: Number(remoteDraft.port) || undefined,
          protocol: remoteDraft.protocol,
          token: remoteDraft.token,
        });
      }

      await persistPartialState({
        remoteConnectionValidated: true,
        setupCurrentStep: '/setup/remote/verify',
      });

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failedResult: SetupRemoteVerificationResult = {
        success: false,
        error: message,
      };
      setErrorMessage(message);
      setRemoteVerification(failedResult);
      return failedResult;
    } finally {
      setIsBusy(false);
    }
  }, [persistPartialState, remoteDraft]);

  const selectMode = React.useCallback(async (nextMode: SetupMode) => {
    setMode(nextMode);
    await persistPartialState({
      setupCurrentStep: nextMode === 'local' ? '/setup/local/intro' : '/setup/remote/intro',
      setupMode: nextMode,
    });
  }, [persistPartialState]);

  const completeSetup = React.useCallback(async () => {
    setIsBusy(true);
    setErrorMessage('');

    try {
      await persistPartialState({
        runMode: mode || 'local',
        setupCompleted: true,
        setupCurrentStep: '/setup/complete',
      });
      setSetupSettings((prev) => ({
        ...prev,
        runMode: mode || 'local',
        setupCompleted: true,
        setupCurrentStep: '/setup/complete',
      }));
      navigate('/');
    } finally {
      setIsBusy(false);
    }
  }, [navigate, persistPartialState]);

  const goBackStep = React.useCallback(() => {
    const previousStep = getPreviousStep(location.pathname, setupSettings, mode);
    if (previousStep) {
      navigate(previousStep);
    }
  }, [location.pathname, mode, navigate, setupSettings]);

  /**
   * 调用主进程修复环境问题（安装/升级/修复 PATH）。
   * 同时监听 onFixProgress 事件推送修复进度到 UI。
   */
  const fixEnvironment = React.useCallback(async (action: 'install' | 'upgrade' | 'fixPath'): Promise<FixResult> => {
    // 重置进度状态为运行中
    setFixProgress({ action, status: 'running', message: '正在执行修复…' });

    // 订阅修复进度事件
    let unsubscribe: (() => void) | undefined;
    if (typeof window.electronAPI?.onFixProgress === 'function') {
      unsubscribe = window.electronAPI.onFixProgress((data) => {
        setFixProgress({
          action: data.action || action,
          status: data.status as FixProgressState['status'],
          message: data.message || '',
        });
      });
    }

    try {
      if (typeof window.electronAPI?.fixEnvironment !== 'function') {
        const unavailable: FixResult = {
          success: false,
          message: '当前桌面端未提供环境修复能力。',
          action,
          error: 'fixEnvironment IPC 不可用',
        };
        setFixProgress({ action, status: 'error', message: unavailable.message });
        return unavailable;
      }

      const result = await window.electronAPI.fixEnvironment(action);

      // 更新最终进度状态
      setFixProgress({
        action,
        status: result.success ? 'done' : 'error',
        message: result.message,
      });

      // 修复完成后自动刷新环境检测
      if (result.success) {
        await refreshEnvironmentCheck();
      }

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failedResult: FixResult = {
        success: false,
        message: '环境修复失败。',
        action,
        error: message,
      };
      setFixProgress({ action, status: 'error', message: failedResult.message });
      return failedResult;
    } finally {
      // 清理进度事件订阅
      unsubscribe?.();
    }
  }, [refreshEnvironmentCheck]);

  /**
   * 更新指定渠道的配置（局部更新）。
   */
  const updateChannelConfig = React.useCallback((key: string, updates: Partial<ChannelConfig>) => {
    setChannelConfigs((prev) =>
      prev.map((ch) => (ch.key === key ? { ...ch, ...updates } : ch)),
    );
  }, []);

  /**
   * 测试指定渠道的连接有效性。
   * 调用主进程 channelsDiagnose IPC 验证凭证。
   */
  const testChannelConnection = React.useCallback(async (key: string): Promise<boolean> => {
    // 标记为测试中
    updateChannelConfig(key, { testStatus: 'testing', testError: undefined });

    try {
      if (typeof window.electronAPI?.channelsDiagnose !== 'function') {
        updateChannelConfig(key, { testStatus: 'error', testError: '当前桌面端未提供渠道诊断能力。' });
        return false;
      }

      const result = await window.electronAPI.channelsDiagnose(key);

      if (result.success) {
        updateChannelConfig(key, { testStatus: 'ok', testError: undefined });
        return true;
      }

      updateChannelConfig(key, { testStatus: 'error', testError: result.error || '连接测试失败' });
      return false;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      updateChannelConfig(key, { testStatus: 'error', testError: message });
      return false;
    }
  }, [updateChannelConfig]);

  /**
   * 保存所有已启用渠道的配置到持久化存储。
   */
  const saveChannelConfigs = React.useCallback(async () => {
    // 构建渠道绑定映射：仅保存已启用的渠道及其字段值
    const channelBindings: Record<string, { enabled: boolean; token?: string; fieldValues?: Record<string, string> }> = {};
    for (const ch of channelConfigs) {
      if (ch.enabled) {
        channelBindings[ch.key] = {
          enabled: true,
          token: ch.token || undefined,
          fieldValues: Object.keys(ch.fieldValues).length > 0 ? ch.fieldValues : undefined,
        };
      }
    }

    await persistPartialState({ channelBindings });
  }, [channelConfigs, persistPartialState]);

  /**
   * 批量添加已启用渠道到 OpenClaw 系统。
   * 仅对已启用且所有必填字段已填写的渠道执行 CLI 添加。
   */
  const addEnabledChannels = React.useCallback(async (): Promise<ChannelAddResult[]> => {
    // 筛选合格渠道：已启用且所有必填字段已填写
    const eligibleChannels = channelConfigs.filter((ch) => {
      if (!ch.enabled) return false;
      const requiredFields = ch.fields.filter((f) => f.required);
      return requiredFields.every((f) => (ch.fieldValues[f.id] || '').trim() !== '');
    });

    const results: ChannelAddResult[] = [];

    for (const ch of eligibleChannels) {
      try {
        // 降级处理：IPC 不可用时跳过 CLI 添加
        if (typeof window.electronAPI?.channelsAdd !== 'function') {
          results.push({
            channelKey: ch.key,
            channelLabel: ch.label,
            success: false,
            error: 'channelsAdd IPC 不可用',
          });
          continue;
        }

        const result = await window.electronAPI.channelsAdd(ch.key, ch.fieldValues);
        results.push({
          channelKey: ch.key,
          channelLabel: ch.label,
          success: result.success,
          output: result.output,
          error: result.error,
        });
      } catch (err: any) {
        results.push({
          channelKey: ch.key,
          channelLabel: ch.label,
          success: false,
          error: err.message || '未知错误',
        });
      }
    }

    setChannelAddResults(results);

    // 将成功添加的渠道保存到 setupSettings
    const addedChannels = results
      .filter((r) => r.success)
      .map((r) => ({ key: r.channelKey, label: r.channelLabel }));
    if (addedChannels.length > 0) {
      await persistPartialState({ addedChannels });
    }

    return results;
  }, [channelConfigs, persistPartialState]);

  React.useEffect(() => {
    const bootstrap = async () => {
      setIsBootstrapping(true);

      try {
        const result = typeof window.electronAPI?.settingsGet === 'function'
          ? await window.electronAPI.settingsGet<SetupSettings>()
          : null;
        const normalizedSettings = normalizeSettings(result);
        setSetupSettings(normalizedSettings);
        setMode(normalizedSettings.setupMode || null);
        if (normalizedSettings.detectedPlatform || normalizedSettings.detectedPlatformLabel) {
          // 用已持久化的平台信息更新环境检测状态，保留其余字段
          setEnvironmentCheck((prev) => ({
            ...prev,
            platform: normalizedSettings.detectedPlatform || prev?.platform || 'unknown',
            platformLabel: normalizedSettings.detectedPlatformLabel || prev?.platformLabel || '未知系统',
            openclawRootDir: normalizedSettings.openclawRootDir || prev?.openclawRootDir || '',
          }));
        }
        setRemoteDraft({
          host: normalizedSettings.remoteHost || '',
          port: normalizedSettings.remotePort ? String(normalizedSettings.remotePort) : defaultRemoteDraft.port,
          protocol: normalizedSettings.remoteProtocol || defaultRemoteDraft.protocol,
          token: normalizedSettings.remoteToken || '',
        });
        if (normalizedSettings.openclawPath || normalizedSettings.openclawRootDir) {
          setLocalCheckResult({
            ...defaultLocalCheckResult,
            commandDetected: Boolean(normalizedSettings.openclawPath),
            commandPath: normalizedSettings.openclawPath || '',
            rootDirDetected: Boolean(normalizedSettings.openclawRootDir),
            rootDir: normalizedSettings.openclawRootDir || '',
          });
        }

        if (typeof window.electronAPI?.setupEnvironmentCheck === 'function') {
          const setupEnvironmentResult = await window.electronAPI.setupEnvironmentCheck();
          setEnvironmentCheck({
            ...setupEnvironmentResult,
            source: 'ipc',
            runtimeMode: (setupEnvironmentResult as Partial<SetupEnvironmentCheck>).runtimeMode || 'missing',
            bundledRuntimeAvailable: (setupEnvironmentResult as Partial<SetupEnvironmentCheck>).bundledRuntimeAvailable || false,
            bundledNodeAvailable: (setupEnvironmentResult as Partial<SetupEnvironmentCheck>).bundledNodeAvailable || false,
            bundledOpenClawAvailable: (setupEnvironmentResult as Partial<SetupEnvironmentCheck>).bundledOpenClawAvailable || false,
            runtimeTier: (setupEnvironmentResult as Partial<SetupEnvironmentCheck>).runtimeTier || 'missing',
            fixableIssues: (setupEnvironmentResult as Partial<SetupEnvironmentCheck>).fixableIssues || [],
          });
        }

        // 调用 resolveRuntime 获取运行时解析结果
        if (typeof window.electronAPI?.resolveRuntime === 'function') {
          try {
            const resolution = await window.electronAPI.resolveRuntime();
            setRuntimeResolution(resolution);
          } catch {
            // 运行时解析失败不阻断引导流程，保持 null 状态
          }
        }
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : String(error));
      } finally {
        setIsBootstrapping(false);
      }
    };

    void bootstrap();
  }, []);

  React.useEffect(() => {
    if (isBootstrapping) {
      return;
    }

    if (hasCompletedSetup && location.pathname.startsWith('/setup')) {
      navigate('/');
      return;
    }

    if (!hasCompletedSetup && !location.pathname.startsWith('/setup')) {
      navigate('/setup/welcome');
      return;
    }

    if (!hasCompletedSetup && location.pathname.startsWith('/setup')) {
      if (setupSettings.setupCurrentStep === currentStep) {
        return;
      }

      void persistPartialState({
        setupCurrentStep: currentStep,
      });
    }
  }, [
    currentStep,
    hasCompletedSetup,
    isBootstrapping,
    location.pathname,
    navigate,
    persistPartialState,
    setupSettings.setupCurrentStep,
  ]);

  const value = React.useMemo<SetupFlowContextValue>(() => ({
    completeSetup,
    currentStep,
    environmentCheck,
    errorMessage,
    goBackStep,
    hasCompletedSetup,
    isBootstrapping,
    isBusy,
    localCheckResult,
    mode,
    persistPartialState,
    refreshEnvironmentCheck,
    refreshLocalCheck,
    remoteDraft,
    remoteVerification,
    saveLocalConfiguration,
    saveRemoteDraft,
    selectMode,
    setErrorMessage,
    setupInstallResult,
    setupSettings,
    installOpenClawForSetup,
    verifyLocalSetup,
    verifyRemoteSetup,
    // 运行时解析
    runtimeResolution,
    // 环境修复
    fixEnvironment,
    fixProgress,
    // 渠道绑定
    channelConfigs,
    updateChannelConfig,
    testChannelConnection,
    saveChannelConfigs,
    // 渠道 CLI 添加
    addEnabledChannels,
    channelAddResults,
    // 创建的 Agent
    createdAgent,
    setCreatedAgent,
  }), [
    completeSetup,
    currentStep,
    environmentCheck,
    errorMessage,
    goBackStep,
    hasCompletedSetup,
    isBootstrapping,
    isBusy,
    localCheckResult,
    mode,
    persistPartialState,
    refreshEnvironmentCheck,
    refreshLocalCheck,
    remoteDraft,
    remoteVerification,
    saveLocalConfiguration,
    saveRemoteDraft,
    selectMode,
    setupInstallResult,
    setupSettings,
    installOpenClawForSetup,
    verifyLocalSetup,
    verifyRemoteSetup,
    // 运行时解析
    runtimeResolution,
    // 环境修复
    fixEnvironment,
    fixProgress,
    // 渠道绑定
    channelConfigs,
    updateChannelConfig,
    testChannelConnection,
    saveChannelConfigs,
    // 渠道 CLI 添加
    addEnabledChannels,
    channelAddResults,
    // 创建的 Agent
    createdAgent,
    setCreatedAgent,
  ]);

  return (
    <SetupFlowContext.Provider value={value}>
      {children}
    </SetupFlowContext.Provider>
  );
};

export const useSetupFlow = () => {
  const context = React.useContext(SetupFlowContext);

  if (!context) {
    throw new Error('useSetupFlow must be used within SetupFlowProvider');
  }

  return context;
};
