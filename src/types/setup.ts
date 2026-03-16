export type SetupMode = 'local' | 'remote';

/** 运行时层级：内置 > 系统 > 在线安装 > 缺失 */
export type RuntimeTier = 'bundled' | 'system' | 'online' | 'missing';

/** 运行时解析结果，描述当前生效的运行时来源与状态 */
export interface RuntimeResolution {
  /** 当前生效的运行时层级 */
  tier: RuntimeTier;
  /** Node.js 可执行文件路径，未找到时为 null */
  nodePath: string | null;
  /** OpenClaw CLI 可执行文件路径，未找到时为 null */
  openclawPath: string | null;
  /** 内置 Node.js 是否可用 */
  bundledNodeAvailable: boolean;
  /** 内置 OpenClaw CLI 是否可用 */
  bundledOpenClawAvailable: boolean;
  /** 系统 Node.js 版本号，未检测到时为 null */
  systemNodeVersion: string | null;
  /** 系统 Node.js 版本是否满足最低要求（>= 22） */
  systemNodeSatisfies: boolean;
  /** 系统是否已安装 OpenClaw CLI */
  systemOpenClawInstalled: boolean;
  /** 解析过程中的错误信息 */
  error?: string;
}

/** 可自动修复的环境问题 */
export interface FixableIssue {
  /** 问题唯一标识 */
  id: string;
  /** 问题描述标签 */
  label: string;
  /** 修复动作类型：安装 / 升级 / 修复 PATH */
  action: 'install' | 'upgrade' | 'fixPath';
  /** 严重程度：必要 / 可选 */
  severity: 'required' | 'optional';
}

/** 环境修复操作的执行结果 */
export interface FixResult {
  /** 修复是否成功 */
  success: boolean;
  /** 结果描述信息 */
  message: string;
  /** 执行的修复动作描述 */
  action: string;
  /** 失败时的错误信息 */
  error?: string;
}

/** 渠道配置字段定义（每个渠道可有多个输入字段） */
export interface ChannelField {
  /** 字段唯一标识 */
  id: string;
  /** 字段显示标签 */
  label: string;
  /** 输入框占位提示 */
  placeholder: string;
  /** 输入类型：密码 / 文本 / 只读提示 */
  type: 'password' | 'text' | 'info';
  /** 是否必填 */
  required: boolean;
}

/** 消息渠道配置项 */
export interface ChannelConfig {
  /** 渠道唯一标识 */
  key: string;
  /** 渠道显示名称 */
  label: string;
  /** 渠道配置提示信息 */
  hint: string;
  /** Token 输入框标签（兼容旧逻辑） */
  tokenLabel: string;
  /** 是否启用该渠道 */
  enabled: boolean;
  /** 渠道凭证 Token（兼容旧逻辑，存储第一个字段的值） */
  token: string;
  /** 渠道各字段的值映射 */
  fieldValues: Record<string, string>;
  /** 渠道专属输入字段定义 */
  fields: ChannelField[];
  /** 连接测试状态：空闲 / 测试中 / 成功 / 失败 */
  testStatus: 'idle' | 'testing' | 'ok' | 'error';
  /** 连接测试失败时的错误信息 */
  testError?: string;
  /** CLI 添加命令模板，如 "openclaw channels add --channel telegram --token {token}" */
  cliHint?: string;
}

/** 单个渠道的 CLI 添加结果 */
export interface ChannelAddResult {
  /** 渠道标识 */
  channelKey: string;
  /** 渠道显示名称 */
  channelLabel: string;
  /** CLI 命令是否执行成功 */
  success: boolean;
  /** CLI 标准输出 */
  output?: string;
  /** 错误信息 */
  error?: string;
}

export interface SetupEnvironmentCheck {
  source: 'ipc' | 'fallback';
  platform: string;
  platformLabel: string;
  runtimeMode: 'bundled' | 'system' | 'missing';
  runtimeCommand?: string;
  bundledRuntimeAvailable: boolean;
  nodeInstalled: boolean;
  nodeVersion?: string;
  nodeVersionSatisfies: boolean;
  npmInstalled: boolean;
  npmVersion?: string;
  openclawInstalled: boolean;
  openclawVersion?: string;
  openclawConfigExists: boolean;
  openclawRootDir: string;
  recommendedInstallCommand: string;
  recommendedInstallLabel: string;
  notes: string[];
  diagnosticError?: string;
  /** 内置 Node.js 是否可用 */
  bundledNodeAvailable: boolean;
  /** 内置 Node.js 路径 */
  bundledNodePath?: string;
  /** 内置 OpenClaw CLI 是否可用 */
  bundledOpenClawAvailable: boolean;
  /** 内置 OpenClaw CLI 路径 */
  bundledOpenClawPath?: string;
  /** 当前生效的运行时层级 */
  runtimeTier: RuntimeTier;
  /** 可自动修复的问题列表 */
  fixableIssues: FixableIssue[];
}

export interface SetupSettings {
  runMode?: SetupMode;
  setupCompleted?: boolean;
  setupMode?: SetupMode;
  setupCurrentStep?: string;
  setupLastVisitedAt?: string;
  setupInstallStatus?: 'idle' | 'running' | 'succeeded' | 'failed';
  setupInstallMessage?: string;
  localInstallValidated?: boolean;
  remoteConnectionValidated?: boolean;
  openclawPath?: string;
  openclawRootDir?: string;
  remoteHost?: string;
  remotePort?: number;
  remoteProtocol?: 'http' | 'https';
  remoteToken?: string;
  detectedPlatform?: string;
  detectedPlatformLabel?: string;
  /** 当前生效的运行时层级 */
  runtimeTier?: RuntimeTier;
  /** 消息渠道绑定配置 */
  channelBindings?: Record<string, { enabled: boolean; token?: string; fieldValues?: Record<string, string> }>;
  /** 引导流程中成功添加的渠道列表 */
  addedChannels?: Array<{ key: string; label: string }>;
  /** 引导流程中创建的 Agent 名称 */
  createdAgentName?: string;
  /** 引导流程中创建的 Agent ID */
  createdAgentId?: string;
}

export interface SetupLocalCheckResult {
  commandDetected: boolean;
  commandPath: string;
  rootDirDetected: boolean;
  rootDir: string;
  versionSuccess: boolean;
  versionOutput: string;
  error: string;
}

export interface SetupRemoteDraft {
  host: string;
  port: string;
  protocol: 'http' | 'https';
  token: string;
}

export interface SetupRemoteVerificationResult {
  authenticated?: boolean;
  error?: string;
  host?: string;
  port?: number;
  success: boolean;
  version?: string;
}

export interface SetupInstallResult {
  success: boolean;
  message: string;
  command: string;
  output?: string;
  error?: string;
}
