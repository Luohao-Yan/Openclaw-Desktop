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
}

export interface RemoteOpenClawTestResult {
  success: boolean;
  error?: string;
  version?: string;
  host?: string;
  port?: number;
  authenticated?: boolean;
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
  sessionsList: () => Promise<any[]>;
  sessionsGet: (sessionId: string) => Promise<any>;
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

  // Approvals 类型
  approvalsGet: (target: ApprovalsTarget) => Promise<ApprovalsGetResult>;
  approvalsAllowlistAdd: (pattern: string, agent: string, target: ApprovalsTarget) => Promise<BasicSuccessResult>;
  approvalsAllowlistRemove: (pattern: string) => Promise<BasicSuccessResult>;
}
