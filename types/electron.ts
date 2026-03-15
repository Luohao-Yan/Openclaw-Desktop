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
}

export interface RuntimeActions {
  runtimeInfo(): Promise<DesktopRuntimeInfo | null>;
  getCapabilities(): Promise<DesktopRuntimeCapabilities | null>;
  setupEnvironmentCheck(): Promise<SetupEnvironmentCheckResult>;
  setupInstallOpenClaw(): Promise<SetupInstallResult>;
  onInstallProgress?(callback: (event: InstallProgressEvent) => void): () => void;
  onInstallOutput?(callback: (event: InstallOutputEvent) => void): () => void;
  testModelConnection?(params: { provider: string; model: string; apiKey?: string; baseUrl?: string }): Promise<{ success: boolean; error?: string; latencyMs?: number }>;
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
  /** 诊断指定渠道连接状态（执行 openclaw channels status --channel <channelType>） */
  channelsDiagnose(channelType: string): Promise<ChannelsCommandResult>;
  /** 重新连接指定渠道（执行 openclaw channels reconnect --channel <channelType>） */
  channelsReconnect(channelType: string): Promise<ChannelsCommandResult>;
  /** 查询指定渠道的待审批 DM 配对请求（读取配对 JSON 文件） */
  pairingList(channel: string): Promise<{
    success: boolean;
    requests?: Array<{ senderId: string; code: string; accountId: string; createdAt?: string; expiresAt?: string }>;
    error?: string;
  }>;
  /** 审批指定渠道的 DM 配对请求（执行 openclaw pairing approve <channel> <code>） */
  pairingApprove(channel: string, code: string): Promise<ChannelsCommandResult>;
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
}

export interface RemoteOpenClawTestResult {
  success: boolean;
  error?: string;
  version?: string;
  host?: string;
  port?: number;
  authenticated?: boolean;
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
}

export interface ConfigActions {
  configGet(): Promise<{ success: boolean; config?: any; error?: string }>;
  configSet(config: any): Promise<{ success: boolean; error?: string }>;
  coreConfigGetOverview(): Promise<CoreConfigOverviewResult>;
  coreConfigSaveOverview(
    payload: { values: Record<string, unknown> },
  ): Promise<CoreConfigSaveResult>;
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
  sessionsSend(sessionId: string, message: string): Promise<{ success: boolean; response?: string; error?: string }>;
  sessionsClose(sessionId: string): Promise<{ success: boolean; error?: string }>;
  sessionsExport(sessionId: string, format: 'json' | 'markdown'): Promise<{ success: boolean; data?: string; error?: string }>;
  sessionsImport(data: string, format: 'json' | 'markdown'): Promise<{ success: boolean; sessionId?: string; error?: string }>;
  sessionsStats(): Promise<{ total: number; active: number; idle: number; agents: Record<string, number>; stores?: { agentId: string; path: string }[] }>;
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
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  category: string;
  status: 'installed' | 'available' | 'updatable' | 'error';
  installedAt?: string;
  updatedAt?: string;
  size?: number;
  dependencies?: string[];
  rating?: number;
  downloads?: number;
  enabled: boolean;
  path?: string;
}

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
  FileActions,
  MainActions,
  ModelsActions,
  ChannelsActions,
  AgentEnhancementActions {}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}