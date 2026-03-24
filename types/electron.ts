// Type definitions for Electron API

export type GatewayStatus = {
  status: 'running' | 'stopped' | 'error' | 'checking';
  error?: string;
  pid?: number;
  version?: string;
  uptime?: string;
  host?: string;
  port?: number;
};

export type TailscaleExposureMode = 'off' | 'tailnet' | 'public';

export interface DesktopRuntimeInfo {
  appVersion: string;
  appVersionLabel: string;
  channel: 'preview';
  userName: string;
  openclawCompatTail: number;
  runtimeVersion: string;
  preloadVersion: string;
  mainVersion: string;
  capabilitiesVersion: number;
}

export interface DesktopRuntimeCapabilities {
  gateway?: {
    status?: boolean;
    start?: boolean;
    stop?: boolean;
    restart?: boolean;
    repairCompatibility?: boolean;
  };
  settings?: {
    diagnoseRoot?: boolean;
  };
  system?: {
    runtimeInfo?: boolean;
    capabilities?: boolean;
    stats?: boolean;
  };
}

export interface SetupEnvironmentCheckResult {
  platform: string;
  platformLabel: string;
  nodeInstalled: boolean;
  nodeVersion?: string;
  nodeVersionSatisfies: boolean;
  npmInstalled: boolean;
  npmVersion?: string;
  openclawInstalled: boolean;
  openclawVersion?: string;
  openclawCommand?: string;
  openclawConfigExists: boolean;
  openclawRootDir: string;
  recommendedInstallCommand: string;
  recommendedInstallLabel: string;
  notes: string[];
  /** ClawHub CLI 是否已安装 */
  clawhubInstalled: boolean;
  /** ClawHub CLI 版本号 */
  clawhubVersion?: string;
}

export interface SetupInstallResult {
  success: boolean;
  message: string;
  command: string;
  output?: string;
  error?: string;
}

export type InstallStage = 'download' | 'install' | 'init' | 'verify';

export interface InstallProgressEvent {
  stage: InstallStage;
  status: 'running' | 'done' | 'error';
  message?: string;
}

export interface InstallOutputEvent {
  data: string;
  isError: boolean;
}

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

export type TailscaleStatus = {
  installed: boolean;
  running: boolean;
  version?: string;
  dnsName?: string;
  tailnet?: string;
  exposureMode: TailscaleExposureMode;
  statusText: string;
  error?: string;
};

export interface GatewayActions {
  gatewayStatus(): Promise<GatewayStatus>;
  gatewayStart(): Promise<{ success: boolean; message?: string; error?: string }>;
  gatewayStop(): Promise<{ success: boolean; message?: string; error?: string }>;
  gatewayRestart(): Promise<{ success: boolean; message?: string; error?: string }>;
  gatewayRepairCompatibility(): Promise<{
    success?: boolean;
    message?: string;
    steps?: string[];
    status?: {
      error?: string;
    };
  }>;
  /** 启动 Gateway，失败时自动调用 repairCompatibility 修复后重试 */
  gatewayStartWithAutoRepair(): Promise<{ success: boolean; message?: string; error?: string }>;
}

export interface RuntimeActions {
  runtimeInfo(): Promise<DesktopRuntimeInfo | null>;
  getCapabilities(): Promise<DesktopRuntimeCapabilities | null>;
  setupEnvironmentCheck(): Promise<SetupEnvironmentCheckResult>;
  setupInstallOpenClaw(): Promise<SetupInstallResult>;
  onInstallProgress?(callback: (event: InstallProgressEvent) => void): () => void;
  onInstallOutput?(callback: (event: InstallOutputEvent) => void): () => void;
  testModelConnection?(params: { provider: string; model: string; apiKey?: string; baseUrl?: string }): Promise<{ success: boolean; error?: string; latencyMs?: number }>;

  /** 修复环境问题（安装/升级/修复PATH） */
  fixEnvironment(action: 'install' | 'upgrade' | 'fixPath', ...args: any[]): Promise<FixResult>;

  /** 监听环境修复进度事件，返回取消订阅函数 */
  onFixProgress(callback: (data: { action: string; status: string; message: string }) => void): () => void;

  /** 解析运行时环境（三级回退策略） */
  resolveRuntime(): Promise<RuntimeResolution>;

  /** 在系统默认浏览器中打开外部链接 */
  openExternal(url: string): Promise<{ success: boolean; error?: string }>;
}

export interface TailscaleActions {
  tailscaleStatus(): Promise<TailscaleStatus>;
  tailscaleStart(): Promise<{ success: boolean; error?: string }>;
  tailscaleApplyExposure(
    mode: TailscaleExposureMode,
    port: number,
  ): Promise<{ success: boolean; error?: string }>;
}

export interface OpenClawCommandDiagnostic {
  configuredPath: string;
  resolvedCommand: string;
  rootDir: string;
  pathEnvHit: boolean;
  pathEnvCommand?: string;
  detectedPath?: string;
  detectedSource?: 'configured' | 'common-path' | 'path-env' | 'directory' | 'not-found';
  commandExists: boolean;
  versionSuccess: boolean;
  versionOutput?: string;
  error?: string;
}

export interface DiagnoseCommandResult<T = unknown> {
  success: boolean;
  error?: string;
  diagnostic?: T;
  message?: string;
}

export interface OpenClawCommandRepairResult {
  success: boolean;
  error?: string;
  message?: string;
  steps?: string[];
  diagnostic?: OpenClawCommandDiagnostic;
}

export interface OpenClawManifestFieldOption {
  label: string;
  value: string;
}

export interface OpenClawManifestField {
  id: string;
  label: string;
  type: 'readonly' | 'text' | 'number' | 'select' | 'password';
  source?: string;
  path?: string;
  defaultValue?: string | number;
  options?: OpenClawManifestFieldOption[];
}

export interface OpenClawManifestCommand {
  id: string;
  label: string;
  command: string;
  subcommands: string[];
}

export interface OpenClawManifestSection {
  id: string;
  title: string;
  description: string;
  fields: OpenClawManifestField[];
  commands: OpenClawManifestCommand[];
}

export interface OpenClawVersionedManifest {
  manifestVersion: string;
  openclawVersionRange: string;
  capabilities: Record<string, boolean>;
  sections: OpenClawManifestSection[];
}

export interface OpenClawCommandPreview {
  id: string;
  label: string;
  command: string;
}

export interface CoreConfigOverview {
  manifest: OpenClawVersionedManifest;
  openclawVersion: string;
  manifestVersion: string;
  configPath: string;
  commandPath: string;
  draft: Record<string, unknown>;
  commandPreviews: OpenClawCommandPreview[];
  rawConfig: Record<string, unknown>;
}

export interface CoreConfigOverviewResult {
  success: boolean;
  error?: string;
  overview?: CoreConfigOverview;
}

export interface CoreConfigSaveResult {
  success: boolean;
  error?: string;
  saved?: {
    configPath: string;
    desktopUpdates: Record<string, unknown>;
  };
}

// ── 模型配置相关类型 ──────────────────────────────────────────────────────────

/** 单个提供商的认证状态 */
export type ProviderAuthStatus = 'authenticated' | 'unauthenticated' | 'unknown';

/** models:status 返回结果 */
export interface ModelsStatusResult {
  success: boolean;
  /** key 为提供商 id（与静态列表 PROVIDER_LIST 中的 id 对应） */
  providers: Record<string, ProviderAuthStatus>;
  error?: string;
}

/** models:scan 返回结果 */
export interface ModelsScanResult {
  success: boolean;
  /** 扫描输出文本 */
  output?: string;
  error?: string;
}

/** models:getConfig 返回结果 */
export interface ModelsConfigResult {
  success: boolean;
  /** 当前主模型（provider/model 格式） */
  primary?: string;
  /** 备用模型列表 */
  fallbacks?: string[];
  /** 已配置的模型（agents.defaults.models）- 模型别名映射 */
  configuredModels?: Record<string, { alias?: string; [key: string]: any }>;
  /** 自定义提供商配置（models.providers） */
  providers?: Record<string, {
    baseUrl?: string;
    apiKey?: string;
    api?: string;
    models?: Array<{ id: string; name: string; [key: string]: any }>;
    [key: string]: any;
  }>;
  error?: string;
}

/** models:aliasesList 返回结果 */
export interface ModelsAliasesListResult {
  success: boolean;
  /** key 为别名，value 为 provider/model */
  aliases: Record<string, string>;
  error?: string;
}

/** 单条别名（UI 展示用） */
export interface ModelAlias {
  /** 别名名称 */
  alias: string;
  /** 目标 provider/model */
  target: string;
}

// ── 渠道管理相关类型 ──────────────────────────────────────────────────────────

/** 渠道 CLI 命令执行结果 */
export interface ChannelsCommandResult {
  success: boolean;
  output?: string;
  error?: string;
}

/** 渠道管理操作接口 */
export interface ChannelsActions {
  /** 查询渠道状态（执行 openclaw channels status） */
  channelsStatus(): Promise<ChannelsCommandResult>;
  /** 查询渠道列表（执行 openclaw channels list） */
  channelsList(): Promise<ChannelsCommandResult>;
  /** 诊断指定渠道连接状态（执行 openclaw channels status 并过滤指定渠道） */
  channelsDiagnose(channelType: string): Promise<ChannelsCommandResult>;
  /** 重新连接指定渠道（执行 openclaw channels login --channel <channelType>） */
  channelsReconnect(channelType: string): Promise<ChannelsCommandResult>;
  /** 查询指定渠道的待审批 DM 配对请求（读取配对 JSON 文件） */
  pairingList(channel: string): Promise<{
    success: boolean;
    requests?: Array<{ senderId: string; code: string; accountId: string; createdAt?: string; expiresAt?: string }>;
    error?: string;
  }>;
  /** 审批指定渠道的 DM 配对请求（执行 openclaw pairing approve <channel> <code>） */
  pairingApprove(channel: string, code: string): Promise<ChannelsCommandResult>;
  /** 读取本地持久化的配对管理配置（electron-store，不依赖 OpenClaw schema） */
  pairingConfigGet(): Promise<{ success: boolean; config?: Record<string, unknown>; error?: string }>;
  /** 保存配对管理配置到本地持久化存储（electron-store，不依赖 OpenClaw schema） */
  pairingConfigSet(config: Record<string, unknown>): Promise<{ success: boolean; error?: string }>;
  /** 添加渠道到 OpenClaw 系统（执行 openclaw channels add） */
  channelsAdd(channelType: string, fieldValues: Record<string, string>): Promise<ChannelsCommandResult>;
}

/** 模型配置相关操作接口 */
export interface ModelsActions {
  /** 获取所有提供商的认证状态 */
  modelsStatus(): Promise<ModelsStatusResult>;
  /** 在系统终端启动 openclaw onboard 交互式向导 */
  modelsOnboard(): Promise<{ success: boolean; error?: string; message?: string }>;
  /** 执行 openclaw models scan，返回扫描输出文本 */
  modelsScan(): Promise<ModelsScanResult>;
  /** 读取 agents.defaults.model.primary 和 fallbacks */
  modelsGetConfig(): Promise<ModelsConfigResult>;
  /** 写入 agents.defaults.model.primary */
  modelsSetPrimary(model: string): Promise<{ success: boolean; error?: string; message?: string }>;
  /** 追加一个备用模型 */
  modelsFallbackAdd(model: string): Promise<{ success: boolean; error?: string; message?: string }>;
  /** 移除一个备用模型 */
  modelsFallbackRemove(model: string): Promise<{ success: boolean; error?: string; message?: string }>;
  /** 清空备用模型列表 */
  modelsFallbackClear(): Promise<{ success: boolean; error?: string; message?: string }>;
  /** 获取所有模型别名列表 */
  modelsAliasesList(): Promise<ModelsAliasesListResult>;
  /** 添加模型别名 */
  modelsAliasAdd(alias: string, model: string): Promise<{ success: boolean; error?: string; message?: string }>;
  /** 移除模型别名 */
  modelsAliasRemove(alias: string): Promise<{ success: boolean; error?: string; message?: string }>;
  /** 从提供商配置中删除模型 */
  modelsModelRemove(providerId: string, modelId: string): Promise<{ success: boolean; error?: string; message?: string }>;
  /** 向提供商配置中添加模型 */
  modelsModelAdd(providerId: string, model: { id: string; name: string; alias?: string; [key: string]: any }): Promise<{ success: boolean; error?: string; message?: string }>;
  /** 更新模型配置 */
  modelsModelUpdate(providerId: string, modelId: string, updates: { [key: string]: any }): Promise<{ success: boolean; error?: string; message?: string }>;
  /** 保存提供商配置（baseUrl、apiKey 等） */
  modelsProviderConfigSave(providerId: string, config: { baseUrl?: string; apiKey?: string; [key: string]: any }): Promise<{ success: boolean; error?: string; message?: string }>;
}

export interface RemoteOpenClawConnectionPayload {
  host: string;
  port?: number;
  protocol: 'http' | 'https';
  token?: string;
  /** 是否跳过 SSL 证书验证（自签名证书场景） */
  skipCertVerification?: boolean;
}

export interface RemoteOpenClawTestResult {
  success: boolean;
  error?: string;
  version?: string;
  host?: string;
  port?: number;
  authenticated?: boolean;
  /** 是否为自签名证书错误 */
  isSelfSignedCertError?: boolean;
}

export interface TaskItem {
  id: string;
  name: string;
  description?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress?: number;
  createdAt: string;
  updatedAt: string;
}

export interface TasksActions {
  tasksGet(): Promise<TaskItem[]>;
  taskCreate(name: string, description?: string): Promise<{ success: boolean; id?: string; error?: string }>;
  taskUpdate(id: string, updates: Partial<TaskItem>): Promise<{ success: boolean; error?: string }>;
  taskDelete(id: string): Promise<{ success: boolean; error?: string }>;
}

export interface Settings {
  openclawPath?: string;
  openclawRootDir?: string;
  theme?: 'dark' | 'light' | 'system';
  sidebarCollapsed?: boolean;
  sidebarWidth?: number;
  language?: string;
  autoStart?: boolean;
  startMinimized?: boolean;
  appearance?: 'system' | 'light' | 'dark';
  glassEffect?: boolean;
  showTrayIcon?: boolean;
  trayIconAction?: 'openWindow' | 'showMenu';
  openclawActive?: boolean;
  runMode?: 'local' | 'remote';
  launchAtLogin?: boolean;
  showDockIcon?: boolean;
  playMenuBarAnimations?: boolean;
  allowCanvas?: boolean;
  allowCamera?: boolean;
  enablePeekabooBridge?: boolean;
  enableDebugTools?: boolean;
  exposureMode?: 'off' | 'tailnet' | 'public';
  requireCredentials?: boolean;
  userProfile?: {
    name?: string;
    email?: string;
    avatarUrl?: string;
    avatarType?: 'default' | 'gravatar' | 'custom';
    gravatarEmail?: string;
    theme?: 'light' | 'dark' | 'system';
  };
  // Setup Wizard 偏好：仅保存在 electron-store，不写入 openclaw.json
  /** 是否安装后台 Daemon 服务（Setup Wizard done 步骤偏好） */
  setupInstallDaemon?: boolean;
  /** Daemon 运行时类型：node（系统 Node.js）或 bundled（内置运行时） */
  setupDaemonRuntime?: 'node' | 'bundled';
  /** 是否安装推荐 Skills 套件（Setup Wizard done 步骤偏好） */
  setupInstallRecommendedSkills?: boolean;
}

export interface SettingsActions {
  settingsGet<T = Settings>(): Promise<{ success: boolean; settings?: T; error?: string }>;
  settingsSet(updates: Partial<Settings>): Promise<{ success: boolean; error?: string }>;
  detectOpenClawPath(): Promise<{ success: boolean; path?: string; error?: string }>;
  diagnoseOpenClawRoot(): Promise<{ success: boolean; diagnostic?: any; error?: string }>;
  diagnoseOpenClawCommand(): Promise<DiagnoseCommandResult<OpenClawCommandDiagnostic>>;
  testOpenClawCommand(): Promise<DiagnoseCommandResult<OpenClawCommandDiagnostic>>;
  autoRepairOpenClawCommand(): Promise<OpenClawCommandRepairResult>;
  remoteOpenClawTestConnection?(payload: RemoteOpenClawConnectionPayload): Promise<RemoteOpenClawTestResult>;
  remoteOpenClawSaveConnection?(payload: RemoteOpenClawConnectionPayload): Promise<{ success: boolean; error?: string; message?: string }>;
}

export interface LogsActions {
  logsGet(lines: number): Promise<{ success: boolean; logs?: any[]; error?: string }>;
  openGatewayLog(): Promise<{ success: boolean; path?: string; error?: string }>;
  /** 按过滤条件查询日志（执行 openclaw logs --filter <filter>） */
  logsFilter(filter: string): Promise<{ success: boolean; logs?: any[]; error?: string }>;
}

export type AgentWorkspaceFileName =
  | 'AGENTS.md'
  | 'BOOTSTRAP.md'
  | 'HEARTBEAT.md'
  | 'IDENTITY.md'
  | 'SOUL.md'
  | 'TOOLS.md'
  | 'USER.md';

export interface AgentInfo {
  id: string;
  name: string;
  workspace: string;
  model: string;
  agentDir?: string;
  workspaceRoot?: string;
  agentConfigRoot?: string;
  configSource?: 'workspace' | 'agents' | 'workspace+agents' | 'config-only';
}

export interface AgentWorkspaceFileSummary {
  name: AgentWorkspaceFileName;
  path: string;
  exists: boolean;
  size: number;
  updatedAt?: string;
}

export interface AgentWorkspaceFileDetail extends AgentWorkspaceFileSummary {
  content: string;
}

export interface AgentWorkspaceEntry {
  name: string;
  path: string;
  relativePath: string;
  kind: 'file' | 'directory';
}

export interface AgentMemoryFileDetail extends AgentWorkspaceEntry {
  exists: boolean;
  size: number;
  updatedAt?: string;
  content: string;
}

export interface AgentManagedFileDetail extends AgentWorkspaceEntry {
  exists: boolean;
  size: number;
  updatedAt?: string;
  content: string;
}

export interface AgentWorkspaceBrowseResult {
  currentPath: string;
  entries: AgentWorkspaceEntry[];
  rootPath?: string;
}

export interface AgentSkillsOverview {
  allowAgents: string[];
  bindingAccounts: string[];
  bindingChannels: string[];
  bindingsEnabled: boolean;
  configPath?: string;
  maxConcurrent?: number;
  nativeSkillsMode?: string;
  nativeSkillsEnabled: boolean;
  sourceLabels: string[];
  toolsProfile?: string;
}

export interface AgentBindingOverview {
  channel?: string;
  accountId?: string;
  binding: any;
  accountConfig?: any;
}

export interface AgentGlobalConfigOverview {
  raw: any;
  configPath?: string;
  workspace?: string;
  agentDir?: string;
  modelDisplay: string;
  modelPrimary?: string;
  modelFallbacks: string[];
  allowAgents: string[];
  bindings: AgentBindingOverview[];
}

export interface AgentWorkspaceTrashEntry {
  id: string;
  name: string;
  path: string;
  relativePath: string;
  kind: 'file' | 'directory';
  deletedAt: string;
  originalPath: string;
  originalRelativePath: string;
}

export interface AgentWorkspaceDetails {
  agent: AgentInfo;
  globalAgentConfig?: AgentGlobalConfigOverview;
  skillsOverview?: AgentSkillsOverview;
  workspaceRoot?: string;
  agentConfigRoot?: string;
  memoryRoot?: string;
  sessionsRoot?: string;
  workspaceEntries: AgentWorkspaceEntry[];
  memoryEntries: AgentWorkspaceEntry[];
  agentConfigEntries: AgentWorkspaceEntry[];
  sessionEntries: AgentWorkspaceEntry[];
  files: AgentWorkspaceFileSummary[];
}

export interface AgentsActions {
  agentsGetAll(): Promise<{ success: boolean; agents?: AgentInfo[]; error?: string }>;
  agentsCreate(payload: { name: string; workspace: string; model?: string }): Promise<{ success: boolean; agent?: AgentInfo; error?: string }>;
  /** 删除智能体（调用 openclaw agents delete） */
  agentsDelete(agentId: string): Promise<{ success: boolean; output?: string; error?: string }>;
  agentsGetAgentConfigPath(agentId: string): Promise<{ success: boolean; path?: string; error?: string }>;
  agentsGetWorkspaceDetails(agentId: string): Promise<{ success: boolean; details?: AgentWorkspaceDetails; error?: string }>;
  agentsReadWorkspaceFile(agentId: string, fileName: AgentWorkspaceFileName): Promise<{ success: boolean; file?: AgentWorkspaceFileDetail; error?: string }>;
  agentsSaveWorkspaceFile(agentId: string, fileName: AgentWorkspaceFileName, content: string): Promise<{ success: boolean; file?: AgentWorkspaceFileSummary; error?: string }>;
  agentsRenameWorkspaceEntry(agentId: string, targetPath: string, nextName: string): Promise<{ success: boolean; entry?: AgentWorkspaceEntry; error?: string }>;
  agentsDeleteWorkspaceEntry(agentId: string, targetPath: string): Promise<{ success: boolean; trashEntry?: AgentWorkspaceTrashEntry; error?: string }>;
  agentsListWorkspaceTrash(agentId: string): Promise<{ success: boolean; trashRoot?: string; entries?: AgentWorkspaceTrashEntry[]; error?: string }>;
  agentsRestoreWorkspaceTrashEntry(agentId: string, trashEntryId: string): Promise<{ success: boolean; restoredPath?: string; error?: string }>;
  agentsRestoreWorkspaceTrashEntries(agentId: string, trashEntryIds: string[]): Promise<{ success: boolean; restoredPaths?: string[]; error?: string }>;
  agentsDeleteWorkspaceTrashEntry(agentId: string, trashEntryId: string): Promise<{ success: boolean; deletedId?: string; error?: string }>;
  agentsDeleteWorkspaceTrashEntries(agentId: string, trashEntryIds: string[]): Promise<{ success: boolean; deletedIds?: string[]; error?: string }>;
  agentsClearWorkspaceTrash(agentId: string): Promise<{ success: boolean; deletedCount?: number; error?: string }>;
  agentsReadMemoryFile(agentId: string, targetPath: string): Promise<{ success: boolean; file?: AgentMemoryFileDetail; error?: string }>;
  agentsSaveMemoryFile(agentId: string, targetPath: string, content: string): Promise<{ success: boolean; file?: AgentMemoryFileDetail; error?: string }>;
  agentsClearMemoryFile(agentId: string, targetPath: string): Promise<{ success: boolean; file?: AgentMemoryFileDetail; error?: string }>;
  agentsReadManagedFile(agentId: string, targetPath: string): Promise<{ success: boolean; file?: AgentManagedFileDetail; error?: string }>;
  agentsSaveManagedFile(agentId: string, targetPath: string, content: string): Promise<{ success: boolean; file?: AgentManagedFileDetail; error?: string }>;
  agentsListWorkspaceEntries(agentId: string, targetPath?: string): Promise<{ success: boolean; result?: AgentWorkspaceBrowseResult; error?: string }>;
  agentsGetCount(): Promise<{ success: boolean; count?: number; error?: string }>;
  /** 更新智能体 Identity 配置 */
  agentsUpdateIdentity(agentId: string, identity: { name?: string; theme?: string; emoji?: string; avatar?: string }): Promise<{ success: boolean; error?: string }>;

  // ── 智能体配置完整性 API ──────────────────────────────────────────────────────────
  /** 检查 agent 配置完整性 */
  agentsCheckCompleteness?(agentId: string): Promise<{ success: boolean; report?: any; error?: string }>;
  /** 执行 agent 配置完整性修复 */
  agentsRepairCompleteness?(agentId: string): Promise<{ success: boolean; repairedItems?: string[]; error?: string }>;
  /** 重命名 agent */
  agentsRename?(agentId: string, newName: string): Promise<{ success: boolean; error?: string }>;
  /** 写入 agent 的 models.json */
  agentsWriteModelsJson?(agentId: string, content: object): Promise<{ success: boolean; error?: string }>;
}

export interface ConfigActions {
  configGet(): Promise<{ success: boolean; config?: any; error?: string }>;
  configSet(config: any): Promise<{ success: boolean; error?: string }>;
  coreConfigGetOverview(): Promise<CoreConfigOverviewResult>;
  coreConfigSaveOverview(
    payload: { values: Record<string, unknown> },
  ): Promise<CoreConfigSaveResult>;
  /** 将 channel 配置写入 openclaw.json 的 channels 节点 */
  coreConfigWriteChannel(channelKey: string, channelConfig: Record<string, unknown>): Promise<{ success: boolean; error?: string }>;
  /** 验证 agent 是否存在于 openclaw.json 的 agents.list 中 */
  coreConfigVerifyAgent(agentId: string): Promise<{ success: boolean; exists?: boolean; agent?: Record<string, unknown>; error?: string }>;
  /** 将 agent-channel 绑定写入 openclaw.json 的 bindings 数组 */
  coreConfigWriteBinding(agentId: string, channelKey: string, accountId: string): Promise<{ success: boolean; error?: string }>;
  /** 查询 agent 的绑定信息和系统可用渠道（用于引导流程 bind-channels 步骤） */
  coreConfigGetAgentBindableInfo(agentId: string): Promise<{
    success: boolean;
    existingBindings: Array<{ channel: string; accountId?: string }>;
    availableChannels: string[];
    /** 每个渠道下的账户列表（channel key → accountId 数组） */
    channelAccounts: Record<string, string[]>;
    /** 所有渠道-账户的绑定映射（"channelKey/accountId" → agentId） */
    accountBindings: Record<string, string>;
    error?: string;
  }>;
}

export interface SystemStats {
  cpu: number;
  memory: number;
  disk: number;
  network: number;
  uptime: number;
}

export interface SystemStatsActions {
  systemStats(): Promise<SystemStats>;
}

export interface TasksExtendedActions {
  tasksKill(id: string): Promise<{ success: boolean; error?: string }>;
}

export interface Session {
  id: string;
  name: string;
  status: 'active' | 'idle' | 'inactive';
  agent: string;
  model: string;
  channel: string;
  channelId: string;
  createdAt: string;
  lastActivity: string;
  tokensUsed: number;
  messagesCount: number;
  participants: string[];
  metadata?: Record<string, any>;
}

export interface SessionDetail extends Session {
  messages?: {
    id: string;
    content: string;
    role: 'user' | 'assistant' | 'system';
    timestamp: string;
    tokens: number;
  }[];
  settings?: {
    temperature: number;
    maxTokens: number;
    contextWindow: number;
    stream: boolean;
  };
  resources?: {
    files: string[];
    tools: string[];
    skills: string[];
  };
}

export interface SessionsActions {
  sessionsList(): Promise<Session[]>;
  sessionsGet(sessionId: string): Promise<SessionDetail | null>;
  sessionsTranscript(agentId: string, sessionKey: string): Promise<{ success: boolean; transcript: any[]; error?: string }>;
  sessionsCreate(agent: string, model?: string): Promise<{ success: boolean; sessionId?: string; error?: string }>;
  /** 向指定 session 发送消息，异步模式返回 pending 标志，前端需轮询获取回复 */
  sessionsSend(sessionId: string, message: string, meta?: { sessionId?: string; agentId?: string; deliveryContext?: { channel: string; to: string; accountId?: string } }): Promise<{ success: boolean; response?: string; transcript?: any[]; pending?: boolean; error?: string }>;
  /** 查询指定 session 的异步发送状态 */
  sessionsSendStatus(sessionKey: string): Promise<{ status: 'idle' | 'processing' | 'completed' | 'error' | 'timeout'; startedAt?: number; error?: string }>;
  sessionsClose(sessionId: string): Promise<{ success: boolean; error?: string }>;
  sessionsExport(sessionId: string, format: 'json' | 'markdown'): Promise<{ success: boolean; data?: string; error?: string }>;
  sessionsImport(data: string, format: 'json' | 'markdown'): Promise<{ success: boolean; sessionId?: string; error?: string }>;
  sessionsStats(): Promise<{ total: number; active: number; idle: number; agents: Record<string, number>; stores?: { agentId: string; path: string }[] }>;
  /** 获取每个 agent 的详细统计（会话数 + 消息数 + Token 估算 + 平均响应时间） */
  sessionsAgentDetailedStats(): Promise<{ success: boolean; stats: Record<string, { sessionCount: number; messageCount: number; tokenUsage: number; avgResponseMs: number }>; error?: string }>;
  sessionsCleanup(dryRun?: boolean): Promise<{ success: boolean; output?: string; error?: string }>;
}

export interface InstanceInfo {
  id: string;
  name: string;
  type: 'gateway' | 'agent' | 'node' | 'service';
  status: 'running' | 'stopped' | 'starting' | 'error';
  pid?: number;
  memoryUsage?: number;
  cpuUsage?: number;
  uptime?: number;
  port?: number;
  version?: string;
  lastActive?: string;
  configPath?: string;
}

export interface InstancesActions {
  instancesGetAll(): Promise<{ success: boolean; instances?: InstanceInfo[]; error?: string }>;
  instancesStart(instanceId: string): Promise<{ success: boolean; error?: string }>;
  instancesStop(instanceId: string): Promise<{ success: boolean; error?: string }>;
  instancesRestart(instanceId: string): Promise<{ success: boolean; error?: string }>;
  instancesDelete(instanceId: string): Promise<{ success: boolean; error?: string }>;
  instancesStats(): Promise<{ 
    success: boolean; 
    stats?: {
      total: number;
      running: number;
      stopped: number;
      error: number;
      byType: Record<string, number>;
    }; 
    error?: string 
  }>;
}

export interface SkillInfo {
  /** 技能唯一标识（通常为 kebab-case 名称） */
  id: string;
  /** 技能显示名称 */
  name: string;
  /** 技能描述 */
  description: string;
  /** 版本号 */
  version: string;
  /** 作者 */
  author: string;
  /** 分类 */
  category: string;
  /** 技能状态 */
  status: 'installed' | 'available' | 'updatable' | 'error';
  /** 安装时间 */
  installedAt?: string;
  /** 更新时间 */
  updatedAt?: string;
  /** 文件大小 */
  size?: number;
  /** 依赖列表 */
  dependencies?: string[];
  /** 评分 */
  rating?: number;
  /** 下载数 */
  downloads?: number;
  /** 是否启用 */
  enabled: boolean;
  /** 技能目录路径 */
  path?: string;
  /** 是否满足安装条件 */
  eligible?: boolean;
  /** 缺失的依赖项 */
  missingRequirements?: string[];

  // ── 新增字段（需求 9.4）──
  /** 技能来源 */
  source?: 'custom' | 'clawhub' | 'bundled' | 'plugin';
  /** Emoji 图标 */
  emoji?: string;
  /** 依赖声明 */
  requires?: {
    bins?: string[];
    env?: string[];
    config?: string[];
  };
  /** 是否为自定义技能 */
  isCustom?: boolean;
}

// ── SKILL.md 结构化数据（需求 10）──────────────────────────────────────────────

/** SKILL.md 结构化数据 */
export interface SkillMdData {
  frontmatter: {
    name: string;
    description: string;
    metadata?: {
      openclaw?: {
        emoji?: string;
        homepage?: string;
        requires?: { bins?: string[]; env?: string[]; config?: string[] };
        primaryEnv?: string;
        install?: Array<{
          id: string;
          kind: string;
          formula?: string;
          bins?: string[];
          label?: string;
        }>;
        always?: boolean;
        os?: string[];
      };
    };
    'user-invocable'?: boolean;
    'disable-model-invocation'?: boolean;
    'command-dispatch'?: string;
    'command-tool'?: string;
    'command-arg-mode'?: string;
  };
  /** key 为章节标题（如 "Instructions"、"Rules"），value 为 Markdown 内容 */
  sections: Record<string, string>;
}

/** SKILL.md 解析结果：成功或失败的判别联合类型 */
export type ParseResult =
  | { ok: true; data: SkillMdData }
  | { ok: false; error: string };

/** 技能运行时配置条目，对应 openclaw.json 中 skills.entries.<id> */
export interface SkillEntryConfig {
  enabled?: boolean;
  apiKey?: string | { source: string; provider: string; id: string };
  env?: Record<string, string>;
  config?: Record<string, unknown>;
}

// ── 插件信息（需求 8）──────────────────────────────────────────────────────────

/** 插件信息 */
export interface PluginInfo {
  id: string;
  name: string;
  version: string;
  /** loaded = 已加载运行中（等同于 enabled），disabled = 未启用，error = 出错 */
  status: 'enabled' | 'loaded' | 'disabled' | 'error';
  description?: string;
  path?: string;
  skills?: string[];
  /** 插件来源：bundled = 内置，global = 用户安装 */
  origin?: 'bundled' | 'global' | string;
}

// ── 技能诊断报告（需求 7）──────────────────────────────────────────────────────

/** 技能诊断条目 */
export interface SkillDiagnosticItem {
  skillName: string;
  status: 'ok' | 'warning' | 'error';
  issues: string[];
}

/** 技能诊断报告 */
export interface SkillDiagnosticReport {
  items: SkillDiagnosticItem[];
  summary: { ok: number; warning: number; error: number };
}

/** 技能与Agent的绑定关系（Agent专属技能功能） */
export interface SkillAgentBinding {
  /** 技能ID */
  skillId: string;
  /** Agent ID */
  agentId: string;
  /** 绑定时间（ISO 8601格式） */
  bindTime: string;
  /** 绑定用户ID（可选） */
  bindUserId?: string;
}

/** Agent的专属技能信息（包含全局技能和专属技能） */
export interface AgentSkillInfo {
  /** Agent ID */
  agentId: string;
  /** 全局可用技能列表（所有Agent均可调用） */
  globalSkills: SkillInfo[];
  /** 专属技能列表（仅该Agent可调用） */
  exclusiveSkills: SkillInfo[];
}

// ── 技能操作接口 ──────────────────────────────────────────────────────────────

export interface SkillsActions {
  skillsGetAll(): Promise<{ success: boolean; skills?: SkillInfo[]; error?: string }>;
  skillsInstall(skillId: string): Promise<{ success: boolean; error?: string }>;
  skillsUninstall(skillId: string): Promise<{ success: boolean; error?: string }>;
  skillsUpdate(skillId: string): Promise<{ success: boolean; error?: string }>;
  skillsEnable(skillId: string): Promise<{ success: boolean; error?: string }>;
  skillsDisable(skillId: string): Promise<{ success: boolean; error?: string }>;
  skillsStats(): Promise<{ 
    success: boolean; 
    stats?: {
      total: number;
      installed: number;
      updatable: number;
      enabled: number;
      byCategory: Record<string, number>;
    }; 
    error?: string 
  }>;
  skillsSearch(query: string): Promise<{ success: boolean; skills?: SkillInfo[]; error?: string }>;

  // ── 新增方法签名（需求 9.1, 9.4）──
  /** 创建自定义技能 */
  skillsCreate(payload: { name: string; description: string; emoji?: string; content?: string }): Promise<{ success: boolean; skillId?: string; error?: string }>;
  /** 读取技能 SKILL.md 原始内容 */
  skillsRead(skillId: string): Promise<{ success: boolean; content?: string; error?: string }>;
  /** 保存技能 SKILL.md 内容 */
  skillsSave(skillId: string, content: string): Promise<{ success: boolean; error?: string }>;
  /** 删除自定义技能 */
  skillsDeleteCustom(skillId: string): Promise<{ success: boolean; error?: string }>;
  /** 获取技能运行时详情 */
  skillsInfo(skillName: string): Promise<{ success: boolean; info?: Record<string, unknown>; error?: string }>;
  /** 执行全局技能健康检查 */
  skillsCheck(): Promise<{ success: boolean; report?: SkillDiagnosticReport; error?: string }>;
  /** ClawHub 市场搜索 */
  skillsClawHubSearch(query: string): Promise<{ success: boolean; skills?: SkillInfo[]; error?: string }>;
  /** 读取技能配置 */
  skillsGetConfig(skillId: string): Promise<{ success: boolean; config?: SkillEntryConfig; error?: string }>;
  /** 保存技能配置 */
  skillsSaveConfig(skillId: string, config: SkillEntryConfig): Promise<{ success: boolean; error?: string }>;
  /** 启动文件监听 */
  skillsStartWatcher(): Promise<{ success: boolean }>;
  /** 停止文件监听 */
  skillsStopWatcher(): Promise<{ success: boolean }>;
  /** 监听技能文件变更事件，返回取消订阅函数 */
  onSkillsChanged(callback: () => void): () => void;
}

// ── 插件管理操作接口（需求 8.1-8.6）──────────────────────────────────────────

export interface PluginsActions {
  /** 获取插件列表 */
  pluginsList(): Promise<{ success: boolean; plugins?: PluginInfo[]; error?: string }>;
  /** 安装插件 */
  pluginsInstall(spec: string): Promise<{ success: boolean; error?: string }>;
  /** 卸载插件 */
  pluginsUninstall(id: string): Promise<{ success: boolean; error?: string }>;
  /** 启用插件 */
  pluginsEnable(id: string): Promise<{ success: boolean; error?: string }>;
  /** 禁用插件 */
  pluginsDisable(id: string): Promise<{ success: boolean; error?: string }>;
  /** 查看插件详情 */
  pluginsInspect(id: string): Promise<{ success: boolean; detail?: Record<string, unknown>; error?: string }>;
  /** 插件诊断 */
  pluginsDoctor(): Promise<{ success: boolean; report?: Record<string, unknown>; error?: string }>;
  /** 执行依赖安装命令 */
  skillsInstallDependency(payload: { command: string; args: string[] }): Promise<{ success: boolean; output?: string; error?: string }>;
}

export interface FileActions {
  fileRead(filePath: string): Promise<{
    success: boolean;
    content?: string;
    lastModified?: string;
    size?: number;
    error?: string;
  }>;
  
  fileWrite(filePath: string, content: string): Promise<{
    success: boolean;
    lastModified?: string;
    size?: number;
    error?: string;
  }>;
  
  fileExists(filePath: string): Promise<{
    success: boolean;
    exists?: boolean;
    lastModified?: string;
    size?: number;
    error?: string;
  }>;
}

// ── 智能体增强功能相关类型 ──────────────────────────────────────────────────────────

/** 智能体性能指标 */
export interface AgentPerformanceMetrics {
  cpuUsage: number;          // CPU 使用率（百分比，0-100）
  memoryUsage: number;       // 内存使用量（MB）
  tokensPerSecond: number;   // Token 处理速度（tokens/秒）
  responseTime: number;      // 平均响应时间（秒）
  errorRate: number;         // 错误率（百分比，0-100）
  uptime: number;            // 运行时间（秒）
  sessionCount: number;      // 活跃会话数
  totalMessages: number;     // 总消息数
  lastUpdated: string;       // 最后更新时间（ISO 8601 格式）
}

/** 增强功能类型 */
export type AgentEnhancementType = 'performance' | 'security' | 'monitoring' | 'integration' | 'automation' | 'utility';

/** 增强功能状态 */
export type AgentEnhancementStatus = 'active' | 'inactive' | 'error';

/** 智能体增强功能 */
export interface AgentEnhancementFeature {
  id: string;                                    // 增强功能唯一标识
  name: string;                                  // 显示名称
  type: AgentEnhancementType;                    // 功能类型
  description: string;                           // 功能描述
  enabled: boolean;                              // 是否启用
  settings: Record<string, any>;                 // 功能设置参数
  lastApplied?: string;                          // 最后应用时间（ISO 8601）
  status: AgentEnhancementStatus;                // 运行状态
  dependencies?: string[];                       // 依赖的其他增强功能 ID
  version?: string;                              // 功能版本
}

/** 增强功能配置文件结构 */
export interface EnhancementConfig {
  version: string;                              // 配置文件版本
  agentId: string;                              // 智能体 ID
  lastModified: string;                         // 最后修改时间
  enhancements: {
    [enhancementId: string]: {
      enabled: boolean;                         // 是否启用
      settings: Record<string, any>;            // 设置参数
      lastApplied?: string;                     // 最后应用时间
    };
  };
}

/** 性能测试结果 */
export interface PerformanceTestResult {
  testId: string;                               // 测试 ID
  agentId: string;                              // 智能体 ID
  timestamp: string;                            // 测试时间
  duration: number;                             // 测试时长（毫秒）
  status: 'completed' | 'failed' | 'timeout';   // 测试状态
  metrics: {
    cpuUsage: number;                           // 测试期间平均 CPU 使用率
    memoryUsage: number;                        // 测试期间平均内存使用量
    tokensPerSecond: number;                    // Token 处理速度
    responseTime: number;                       // 平均响应时间
    errorRate: number;                          // 错误率
    throughput: number;                         // 吞吐量（请求/秒）
    success: boolean;                           // 测试是否成功
  };
  errors?: string[];                            // 错误信息列表
}

/** 安全检查类别 */
export type SecurityCheckCategory = 'file-permissions' | 'api-keys' | 'network' | 'dependencies' | 'config';

/** 安全检查风险等级 */
export type SecurityRiskLevel = 'low' | 'medium' | 'high';

/** 安全检查状态 */
export type SecurityCheckStatus = 'pass' | 'warning' | 'fail';

/** 安全检查结果 */
export interface SecurityCheckResult {
  checkId: string;                              // 检查项 ID
  name: string;                                 // 检查项名称
  category: SecurityCheckCategory;              // 检查类别
  riskLevel: SecurityRiskLevel;                 // 风险等级
  status: SecurityCheckStatus;                  // 检查状态
  message: string;                              // 检查结果描述
  recommendation?: string;                      // 修复建议
  details?: Record<string, any>;                // 详细信息
}

/** 智能体配置导出数据 */
export interface AgentConfigExport {
  exportVersion: string;                        // 导出格式版本
  exportDate: string;                           // 导出时间
  agentInfo: {
    id: string;                                 // 智能体 ID
    name: string;                               // 智能体名称
    model: string;                              // 模型配置
    workspace: string;                          // 工作区路径
  };
  config: {
    openclaw: any;                              // openclaw.json 内容
    enhancements: EnhancementConfig;            // 增强功能配置
  };
  workspaceFiles: {
    [fileName: string]: string;                 // 工作区文件内容
  };
  metadata: {
    desktopVersion: string;                     // Desktop 应用版本
    openclawVersion: string;                    // OpenClaw CLI 版本
  };
}

/** 智能体增强功能操作接口 */
export interface AgentEnhancementActions {
  // 性能监控
  agentsGetPerformance(agentId: string): Promise<{
    success: boolean;
    metrics?: AgentPerformanceMetrics;
    error?: string;
  }>;
  
  agentsRunPerformanceTest(agentId: string): Promise<{
    success: boolean;
    result?: PerformanceTestResult;
    error?: string;
  }>;
  
  // 增强功能管理
  agentsGetEnhancements(agentId: string): Promise<{
    success: boolean;
    enhancements?: AgentEnhancementFeature[];
    error?: string;
  }>;
  
  agentsToggleEnhancement(
    agentId: string,
    enhancementId: string,
    enabled: boolean
  ): Promise<{
    success: boolean;
    enhancement?: AgentEnhancementFeature;
    error?: string;
  }>;
  
  agentsUpdateEnhancementSettings(
    agentId: string,
    enhancementId: string,
    settings: Record<string, any>
  ): Promise<{
    success: boolean;
    enhancement?: AgentEnhancementFeature;
    error?: string;
  }>;
  
  // 快速操作
  agentsOpenDebugTerminal(agentId: string): Promise<{
    success: boolean;
    error?: string;
  }>;
  
  agentsExportConfig(agentId: string): Promise<{
    success: boolean;
    filePath?: string;
    error?: string;
  }>;
  
  agentsImportConfig(agentId: string, filePath: string): Promise<{
    success: boolean;
    error?: string;
  }>;
  
  agentsClone(agentId: string, newName: string, workspace: string): Promise<{
    success: boolean;
    newAgentId?: string;
    error?: string;
  }>;
  
  agentsGenerateReport(agentId: string, format: 'pdf' | 'markdown'): Promise<{
    success: boolean;
    reportPath?: string;
    error?: string;
  }>;
  
  agentsRestart(agentId: string): Promise<{
    success: boolean;
    error?: string;
  }>;
  
  agentsSecurityCheck(agentId: string): Promise<{
    success: boolean;
    results?: SecurityCheckResult[];
    error?: string;
  }>;
}

// ── Agent 配置加密导入/导出相关类型 ──────────────────────────────────────────

/** 导出 Bundle 结果 */
export interface ExportBundleResult {
  success: boolean;
  /** 导出文件路径 */
  filePath?: string;
  /** 错误信息 */
  error?: string;
}

/** 导入 Bundle 结果 */
export interface ImportBundleResult {
  success: boolean;
  /** 导入成功后的 Agent 信息 */
  agent?: any;
  /** 安装失败的 Skills 列表 */
  failedSkills?: Array<{ id: string; name: string; error: string }>;
  /** 非致命警告信息（如部分文件写入失败） */
  warnings?: string[];
  /** 是否执行了回滚操作 */
  rolledBack?: boolean;
  /** 错误信息 */
  error?: string;
}

/** 导入进度事件 */
export interface ImportProgress {
  /** 当前步骤编号 1-5 */
  step: number;
  /** 步骤名称 */
  stepName: string;
  /** 步骤状态（含回滚状态） */
  status: 'pending' | 'running' | 'success' | 'failed' | 'rolling-back' | 'rolled-back';
  /** 可选的详细信息（如错误原因、子进度、回滚提示） */
  message?: string;
}

/** Skill 清单条目 */
export interface SkillManifestEntry {
  /** skill 唯一标识 */
  id: string;
  /** skill 名称 */
  name: string;
  /** 来源类型：clawhub 公共 skill 或本地私有 skill */
  source: 'clawhub' | 'private';
  /** 私有 skill 的文件内容（仅 source='private' 时存在） */
  files?: Record<string, string>;
}

/** Channel 绑定模板（不含账户凭证） */
export interface ChannelBindingTemplate {
  /** channel 类型名称（如 wechat、telegram） */
  channel: string;
  /** 绑定匹配规则（不含 accountId） */
  matchRules?: Record<string, unknown>;
}

/** 导出历史记录 */
export interface ExportHistoryRecord {
  /** 唯一标识（UUID） */
  id: string;
  /** Agent ID */
  agentId: string;
  /** Agent 名称 */
  agentName: string;
  /** 导出时间（ISO 8601） */
  exportTime: string;
  /** 导出文件路径 */
  filePath: string;
  /** Passphrase 明文（仅本地存储） */
  passphrase: string;
  /** 文件大小（字节） */
  fileSize: number;
}

/** Agent 配置加密导入/导出操作接口 */
export interface AgentExchangeActions {
  /** 导出 Agent 配置为加密 .ocagent 文件 */
  agentsExportBundle(agentId: string, passphrase: string, filePath?: string): Promise<ExportBundleResult>;
  /** 导入加密的 .ocagent 配置文件 */
  agentsImportBundle(filePath: string, passphrase: string): Promise<ImportBundleResult>;
  /** 调用系统保存对话框选择导出路径 */
  agentsSelectExportPath(defaultName: string): Promise<{ success: boolean; filePath?: string; error?: string }>;
  /** 调用系统文件选择对话框选择 .ocagent 文件 */
  agentsSelectImportFile(): Promise<{ success: boolean; filePath?: string; error?: string }>;
  /** 监听导入进度事件 */
  onImportProgress(callback: (progress: ImportProgress) => void): () => void;
  /** 获取导出历史记录列表 */
  agentsGetExportHistory(): Promise<{ success: boolean; history: ExportHistoryRecord[] }>;
  /** 删除指定的导出历史记录 */
  agentsDeleteExportHistory(recordId: string): Promise<{ success: boolean; error?: string }>;
}

export interface MainActions {
  openLink(url: string): Promise<void>;
  openDevTools(): Promise<void>;
  openPath?(targetPath: string): Promise<void>;
  windowMinimize(): Promise<void>;
  windowMaximize(): Promise<void>;
  windowClose(): Promise<void>;
  // 应用配置管理
  appConfigReset(): Promise<{ success: boolean; error?: string }>;
  appConfigReinstallOpenclaw(): Promise<{ success: boolean; output?: string; error?: string }>;
  /** 卸载 OpenClaw（本地执行命令、SSH 远程执行或返回手动引导标志） */
  appConfigUninstallOpenclaw(
    params: { mode: 'local' | 'remote-ssh' | 'remote-manual' }
  ): Promise<{ success: boolean; output?: string; error?: string; manualRequired?: boolean; sshError?: string }>;
  /** 退出应用 */
  appConfigQuit(): Promise<{ success: boolean }>;
  /** 执行 openclaw doctor --fix 自动修复配置文件 */
  doctorFix(): Promise<{ success: boolean; output?: string; error?: string }>;
}

export interface ElectronAPI extends 
  RuntimeActions,
  GatewayActions, 
  TailscaleActions,
  TasksActions, 
  TasksExtendedActions, 
  SettingsActions, 
  ConfigActions, 
  LogsActions, 
  AgentsActions, 
  SystemStatsActions, 
  SessionsActions, 
  InstancesActions, 
  SkillsActions,
  PluginsActions,
  FileActions,
  MainActions,
  ModelsActions,
  ChannelsActions,
  AgentEnhancementActions,
  AgentExchangeActions {}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}