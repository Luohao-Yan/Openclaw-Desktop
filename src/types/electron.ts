import type { DesktopRuntimeCapabilities, DesktopRuntimeInfo } from './desktopRuntime';

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

export interface GatewayStatusResult {
  status: 'running' | 'stopped' | 'error' | 'checking';
  error?: string;
  pid?: number;
  uptime?: string;
  version?: string;
  host?: string;
  port?: number;
}

export interface GatewayRepairResult {
  success?: boolean;
  message?: string;
  steps?: string[];
  status?: {
    error?: string;
  };
}

export interface BasicSuccessResult {
  success: boolean;
  error?: string;
  message?: string;
  path?: string;
}

export interface CronScheduleAt {
  kind: 'at';
  at: string;
  tz?: string;
}

export interface CronScheduleEvery {
  kind: 'every';
  every: string;
}

export interface CronScheduleCron {
  kind: 'cron';
  cron: string;
  tz?: string;
  stagger?: string;
}

export type CronScheduleDraft =
  | CronScheduleAt
  | CronScheduleEvery
  | CronScheduleCron;

export interface CronPayloadSystemEvent {
  kind: 'systemEvent';
  text: string;
  mode?: 'now' | 'next-heartbeat';
}

export interface CronPayloadAgentTurn {
  kind: 'agentTurn';
  message: string;
  model?: string;
  thinking?: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
  timeoutSeconds?: number;
  channel?: string;
  to?: string;
  deliver?: boolean;
  announce?: boolean;
  lightContext?: boolean;
  sessionId?: string;
  bestEffort?: boolean;
}

export type CronPayloadDraft =
  | CronPayloadSystemEvent
  | CronPayloadAgentTurn;

export interface CronJobDraft {
  name: string;
  description?: string;
  agentId?: string | null;
  enabled?: boolean;
  sessionTarget?: 'main' | 'isolated';
  wakeMode?: 'now' | 'next-heartbeat';
  deleteAfterRun?: boolean;
  schedule: CronScheduleDraft;
  payload: CronPayloadDraft;
}

export interface CronJobRecord {
  id: string;
  name: string;
  enabled?: boolean;
  schedule?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  session?: string;
  status?: string;
  nextRunAt?: string;
  updatedAt?: string;
  createdAt?: string;
  raw?: Record<string, unknown>;
}

export interface CronRunRecord {
  id?: string;
  runId?: string;
  status?: string;
  startedAt?: string;
  finishedAt?: string;
  summary?: string;
  raw?: Record<string, unknown>;
}

export interface CronListResult {
  success: boolean;
  jobs: CronJobRecord[];
  error?: string;
}

export interface CronStatusResult {
  success: boolean;
  status?: Record<string, unknown>;
  error?: string;
}

export interface CronMutationResult {
  success: boolean;
  error?: string;
  message?: string;
  data?: Record<string, unknown>;
}

export interface CronRunsResult {
  success: boolean;
  runs: CronRunRecord[];
  error?: string;
}

// ── Approvals 类型 ────────────────────────────────────────────────────────────

/** allowlist 单条规则 */
export interface ApprovalAllowlistEntry {
  pattern: string;
  agent?: string;
  nodeId?: string;
}

/** approvals get 返回的数据结构 */
export interface ApprovalsData {
  allowlist?: ApprovalAllowlistEntry[];
  raw?: unknown;
}

/** 操作目标：本地 / gateway / 指定 node */
export type ApprovalsTarget =
  | { kind: 'local' }
  | { kind: 'gateway' }
  | { kind: 'node'; nodeId: string };

/** approvalsGet 返回结果 */
export interface ApprovalsGetResult {
  success: boolean;
  data?: ApprovalsData;
  raw?: string;
  error?: string;
}

export interface NodeConfigShape {
  gateway?: {
    host?: string;
    port?: number;
  };
}

export interface NodeConfigGetResult {
  success: boolean;
  error?: string;
  path?: string;
  config?: NodeConfigShape;
}

export interface SettingsGetResult<T = Record<string, unknown>> {
  success: boolean;
  error?: string;
  settings?: T;
}

export interface DiagnoseRootResult<T = unknown> {
  success: boolean;
  error?: string;
  diagnostic?: T;
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

export interface ElectronAPI {
  runtimeInfo: () => Promise<DesktopRuntimeInfo | null>;
  getCapabilities: () => Promise<DesktopRuntimeCapabilities | null>;
  gatewayStatus: () => Promise<GatewayStatusResult>;
  gatewayStart: () => Promise<BasicSuccessResult>;
  gatewayStop: () => Promise<BasicSuccessResult>;
  gatewayRestart: () => Promise<BasicSuccessResult>;
  gatewayRepairCompatibility: () => Promise<GatewayRepairResult>;
  configGet: () => Promise<{ success: boolean; error?: string; config?: any }>;
  configSet: (config: any) => Promise<{ success: boolean; error?: string }>;
  nodeConfigGet: () => Promise<NodeConfigGetResult>;
  nodeConfigSet: (config: NodeConfigShape) => Promise<BasicSuccessResult>;
  coreConfigGetOverview: () => Promise<CoreConfigOverviewResult>;
  coreConfigSaveOverview: (payload: { values: Record<string, unknown> }) => Promise<CoreConfigSaveResult>;
  /** 将 channel 配置写入 openclaw.json 的 channels 节点 */
  coreConfigWriteChannel: (channelKey: string, channelConfig: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>;
  /** 验证 agent 是否存在于 openclaw.json 的 agents.list 中 */
  coreConfigVerifyAgent: (agentId: string) => Promise<{ success: boolean; exists?: boolean; agent?: Record<string, unknown>; error?: string }>;
  /** 将 agent-channel 绑定写入 openclaw.json 的 bindings 数组 */
  coreConfigWriteBinding: (agentId: string, channelKey: string, accountId: string) => Promise<{ success: boolean; error?: string }>;
  /** 查询 agent 的绑定信息和系统可用渠道（用于引导流程 bind-channels 步骤） */
  coreConfigGetAgentBindableInfo: (agentId: string) => Promise<{
    success: boolean;
    existingBindings: Array<{ channel: string; accountId?: string }>;
    availableChannels: string[];
    /** 每个渠道下的账户列表（channel key → accountId 数组） */
    channelAccounts: Record<string, string[]>;
    /** 所有渠道-账户的绑定映射（"channelKey/accountId" → agentId） */
    accountBindings: Record<string, string>;
    error?: string;
  }>;
  tasksGet: () => Promise<any[]>;
  tasksKill: (id: string) => Promise<any>;
  cronList: (includeAll?: boolean) => Promise<CronListResult>;
  cronStatus: () => Promise<CronStatusResult>;
  cronCreate: (payload: CronJobDraft) => Promise<CronMutationResult>;
  cronAdd: (payload: CronJobDraft) => Promise<CronMutationResult>;
  cronEdit: (jobId: string, patch: Partial<CronJobDraft>) => Promise<CronMutationResult>;
  cronRemove: (jobId: string) => Promise<CronMutationResult>;
  cronEnable: (jobId: string) => Promise<CronMutationResult>;
  cronDisable: (jobId: string) => Promise<CronMutationResult>;
  cronRun: (jobId: string, force?: boolean) => Promise<CronMutationResult>;
  cronRuns: (jobId: string, limit?: number) => Promise<CronRunsResult>;
  logsGet: (lines?: number) => Promise<any>;
  openGatewayLog: () => Promise<BasicSuccessResult>;
  settingsGet: <T = Record<string, unknown>>() => Promise<SettingsGetResult<T>>;
  settingsSet: (updates: Record<string, unknown>) => Promise<BasicSuccessResult>;
  detectOpenClawPath: () => Promise<any>;
  diagnoseOpenClawRoot: <T = unknown>() => Promise<DiagnoseRootResult<T>>;
  diagnoseOpenClawCommand: () => Promise<DiagnoseCommandResult<OpenClawCommandDiagnostic>>;
  testOpenClawCommand: () => Promise<DiagnoseCommandResult<OpenClawCommandDiagnostic>>;
  autoRepairOpenClawCommand: () => Promise<OpenClawCommandRepairResult>;
  tailscaleStatus: () => Promise<any>;
  tailscaleStart: () => Promise<BasicSuccessResult>;
  tailscaleApplyExposure: (mode: string, port: number) => Promise<BasicSuccessResult>;
  remoteOpenClawTestConnection?: (payload: RemoteOpenClawConnectionPayload) => Promise<RemoteOpenClawTestResult>;
  remoteOpenClawSaveConnection?: (payload: RemoteOpenClawConnectionPayload) => Promise<BasicSuccessResult>;
  agentsGetAll: () => Promise<any>;
  agentsCreate: (payload: any) => Promise<any>;
  /** 删除智能体（调用 openclaw agents delete） */
  agentsDelete: (agentId: string) => Promise<{ success: boolean; output?: string; error?: string }>;
  agentsGetAgentConfigPath: (agentId: string) => Promise<any>;
  agentsGetWorkspaceDetails: (agentId: string) => Promise<any>;
  agentsReadWorkspaceFile: (agentId: string, fileName: string) => Promise<any>;
  agentsSaveWorkspaceFile: (agentId: string, fileName: string, content: string) => Promise<any>;
  agentsRenameWorkspaceEntry: (agentId: string, targetPath: string, nextName: string) => Promise<any>;
  agentsDeleteWorkspaceEntry: (agentId: string, targetPath: string) => Promise<any>;
  agentsListWorkspaceTrash: (agentId: string) => Promise<any>;
  agentsRestoreWorkspaceTrashEntry: (agentId: string, trashEntryId: string) => Promise<any>;
  agentsRestoreWorkspaceTrashEntries: (agentId: string, trashEntryIds: string[]) => Promise<any>;
  agentsDeleteWorkspaceTrashEntry: (agentId: string, trashEntryId: string) => Promise<any>;
  agentsDeleteWorkspaceTrashEntries: (agentId: string, trashEntryIds: string[]) => Promise<any>;
  agentsClearWorkspaceTrash: (agentId: string) => Promise<any>;
  agentsReadMemoryFile: (agentId: string, targetPath: string) => Promise<any>;
  agentsSaveMemoryFile: (agentId: string, targetPath: string, content: string) => Promise<any>;
  agentsClearMemoryFile: (agentId: string, targetPath: string) => Promise<any>;
  agentsReadManagedFile: (agentId: string, targetPath: string) => Promise<any>;
  agentsSaveManagedFile: (agentId: string, targetPath: string, content: string) => Promise<any>;
  agentsListWorkspaceEntries: (agentId: string, targetPath: string) => Promise<any>;
  agentsGetCount: () => Promise<any>;
  /** 更新智能体 Identity 配置 */
  agentsUpdateIdentity: (agentId: string, identity: { name?: string; theme?: string; emoji?: string; avatar?: string }) => Promise<{ success: boolean; error?: string }>;
  
  // ── 智能体增强功能 API ──────────────────────────────────────────────────────────
  /** 获取智能体性能指标 */
  agentsGetPerformance: (agentId: string) => Promise<{ success: boolean; metrics?: AgentPerformanceMetrics; error?: string }>;
  /** 执行性能测试 */
  agentsRunPerformanceTest: (agentId: string) => Promise<{ success: boolean; result?: PerformanceTestResult; error?: string }>;
  /** 获取增强功能列表 */
  agentsGetEnhancements: (agentId: string) => Promise<{ success: boolean; enhancements?: AgentEnhancementFeature[]; error?: string }>;
  /** 启用/禁用增强功能 */
  agentsToggleEnhancement: (agentId: string, enhancementId: string, enabled: boolean) => Promise<{ success: boolean; enhancement?: AgentEnhancementFeature; error?: string }>;
  /** 更新增强功能设置 */
  agentsUpdateEnhancementSettings: (agentId: string, enhancementId: string, settings: Record<string, any>) => Promise<{ success: boolean; enhancement?: AgentEnhancementFeature; error?: string }>;
  /** 打开调试终端 */
  agentsOpenDebugTerminal: (agentId: string) => Promise<{ success: boolean; error?: string }>;
  /** 导出配置 */
  agentsExportConfig: (agentId: string) => Promise<{ success: boolean; filePath?: string; error?: string }>;
  /** 导入配置 */
  agentsImportConfig: (agentId: string, filePath: string) => Promise<{ success: boolean; error?: string }>;
  /** 克隆智能体 */
  agentsClone: (agentId: string, newName: string, workspace: string) => Promise<{ success: boolean; newAgentId?: string; error?: string }>;
  /** 生成报告 */
  agentsGenerateReport: (agentId: string, format: 'pdf' | 'markdown') => Promise<{ success: boolean; reportPath?: string; error?: string }>;
  /** 重启智能体 */
  agentsRestart: (agentId: string) => Promise<{ success: boolean; error?: string }>;
  /** 安全检查 */
  agentsSecurityCheck: (agentId: string) => Promise<{ success: boolean; results?: SecurityCheckResult[]; error?: string }>;
  
  sessionsList: () => Promise<any[]>;
  sessionsGet: (sessionId: string) => Promise<any>;
  sessionsTranscript: (agentId: string, sessionKey: string) => Promise<any>;
  sessionsCreate: (agent: string, model?: string) => Promise<any>;
  sessionsSend: (sessionId: string, message: string) => Promise<any>;
  sessionsClose: (sessionId: string) => Promise<any>;
  sessionsExport: (sessionId: string, format: 'json' | 'markdown') => Promise<any>;
  sessionsImport: (data: string, format: string) => Promise<any>;
  sessionsStats: () => Promise<any>;
  sessionsCleanup: (dryRun?: boolean) => Promise<{ success: boolean; output?: string; error?: string }>;
  openPath: (targetPath: string) => Promise<{ success: boolean; error?: string }>;
  windowMinimize: () => Promise<void>;
  windowMaximize: () => Promise<void>;
  windowClose: () => Promise<void>;
  systemStats: () => Promise<{ cpu: number; memory: number; disk: number; network: number; uptime: number }>;
  setupEnvironmentCheck: () => Promise<SetupEnvironmentCheckResult>;
  setupInstallOpenClaw: () => Promise<SetupInstallResult>;
  onInstallProgress: (callback: (event: InstallProgressEvent) => void) => () => void;
  onInstallOutput: (callback: (event: InstallOutputEvent) => void) => () => void;
  testModelConnection: (params: { provider: string; model: string; apiKey?: string; baseUrl?: string }) => Promise<{ success: boolean; error?: string; latencyMs?: number }>;
  instancesGetAll: () => Promise<any>;
  instancesStart: (instanceId: string) => Promise<any>;
  instancesStop: (instanceId: string) => Promise<any>;
  instancesRestart: (instanceId: string) => Promise<any>;
  instancesDelete: (instanceId: string) => Promise<any>;
  instancesStats: () => Promise<any>;
  skillsGetAll: () => Promise<any>;
  skillsInstall: (skillId: string) => Promise<any>;
  skillsUninstall: (skillId: string) => Promise<any>;
  skillsUpdate: (skillId: string) => Promise<any>;
  skillsEnable: (skillId: string) => Promise<any>;
  skillsDisable: (skillId: string) => Promise<any>;
  skillsStats: () => Promise<any>;
  skillsSearch: (query: string) => Promise<any>;

  /** 修复环境问题（安装/升级/修复PATH） */
  fixEnvironment: (action: 'install' | 'upgrade' | 'fixPath', ...args: any[]) => Promise<import('./setup').FixResult>;

  /** 监听环境修复进度事件，返回取消订阅函数 */
  onFixProgress: (callback: (data: { action: string; status: string; message: string }) => void) => () => void;

  /** 解析运行时环境（三级回退策略） */
  resolveRuntime: () => Promise<import('./setup').LegacyRuntimeResolution>;

  // Approvals 类型
  approvalsGet: (target: ApprovalsTarget) => Promise<ApprovalsGetResult>;
  approvalsAllowlistAdd: (pattern: string, agent: string, target: ApprovalsTarget) => Promise<BasicSuccessResult>;
  approvalsAllowlistRemove: (pattern: string) => Promise<BasicSuccessResult>;

  // 应用配置管理
  appConfigReset: () => Promise<BasicSuccessResult>;
  appConfigReinstallOpenclaw: () => Promise<{ success: boolean; output?: string; error?: string }>;

  /** 执行 openclaw doctor --fix 自动修复配置文件 */
  doctorFix: () => Promise<{ success: boolean; output?: string; error?: string }>;

  // ── 模型配置管理 ──────────────────────────────────────────────────────────
  /** 获取所有提供商的认证状态 */
  modelsStatus: () => Promise<ModelsStatusResult>;

  // ── 渠道管理 ──────────────────────────────────────────────────────────────
  /** 查询渠道状态（执行 openclaw channels status） */
  channelsStatus: () => Promise<{ success: boolean; output?: string; error?: string }>;
  /** 查询渠道列表（执行 openclaw channels list） */
  channelsList: () => Promise<{ success: boolean; output?: string; error?: string }>;
  /** 诊断指定渠道连接状态（执行 openclaw channels status 并过滤指定渠道） */
  channelsDiagnose: (channelType: string) => Promise<{ success: boolean; output?: string; error?: string }>;
  /** 重新连接指定渠道（执行 openclaw channels login --channel <channelType>） */
  channelsReconnect: (channelType: string) => Promise<{ success: boolean; output?: string; error?: string }>;
  /** 查询指定渠道的待审批 DM 配对请求（读取配对 JSON 文件） */
  pairingList: (channel: string) => Promise<{
    success: boolean;
    requests?: Array<{ senderId: string; code: string; accountId: string; createdAt?: string; expiresAt?: string }>;
    error?: string;
  }>;
  /** 审批指定渠道的 DM 配对请求（执行 openclaw pairing approve <channel> <code>） */
  pairingApprove: (channel: string, code: string) => Promise<{ success: boolean; output?: string; error?: string }>;
  /** 添加渠道到 OpenClaw 系统（执行 openclaw channels add） */
  channelsAdd: (channelType: string, fieldValues: Record<string, string>) => Promise<{ success: boolean; output?: string; error?: string }>;
  /** 按过滤条件查询日志（执行 openclaw logs --filter <filter>） */
  logsFilter: (filter: string) => Promise<{ success: boolean; logs?: any[]; error?: string }>;
  /** 在系统终端启动 openclaw onboard 交互式向导 */
  modelsOnboard: () => Promise<BasicSuccessResult>;
  /** 执行 openclaw models scan，返回扫描输出文本 */
  modelsScan: () => Promise<ModelsScanResult>;
  /** 读取 agents.defaults.model.primary 和 fallbacks */
  modelsGetConfig: () => Promise<ModelsConfigResult>;
  /** 写入 agents.defaults.model.primary */
  modelsSetPrimary: (model: string) => Promise<BasicSuccessResult>;
  /** 追加一个备用模型 */
  modelsFallbackAdd: (model: string) => Promise<BasicSuccessResult>;
  /** 移除一个备用模型 */
  modelsFallbackRemove: (model: string) => Promise<BasicSuccessResult>;
  /** 清空备用模型列表 */
  modelsFallbackClear: () => Promise<BasicSuccessResult>;
  /** 获取所有模型别名列表 */
  modelsAliasesList: () => Promise<ModelsAliasesListResult>;
  /** 添加模型别名 */
  modelsAliasAdd: (alias: string, model: string) => Promise<BasicSuccessResult>;
  /** 移除模型别名 */
  modelsAliasRemove: (alias: string) => Promise<BasicSuccessResult>;
  /** 从提供商配置中删除模型 */
  modelsModelRemove: (providerId: string, modelId: string) => Promise<BasicSuccessResult>;
  /** 向提供商配置中添加模型 */
  modelsModelAdd: (providerId: string, model: { id: string; name: string; alias?: string; [key: string]: any }) => Promise<BasicSuccessResult>;
  /** 更新模型配置 */
  modelsModelUpdate: (providerId: string, modelId: string, updates: { [key: string]: any }) => Promise<BasicSuccessResult>;
  /** 保存提供商配置（baseUrl、apiKey 等） */
  modelsProviderConfigSave: (providerId: string, config: { baseUrl?: string; apiKey?: string; [key: string]: any }) => Promise<BasicSuccessResult>;
}
