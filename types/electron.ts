// Type definitions for Electron API

export type GatewayStatus = {
  status: 'running' | 'stopped' | 'error' | 'checking';
  error?: string;
  pid?: number;
  version?: string;
};

export interface GatewayActions {
  gatewayStatus(): Promise<GatewayStatus>;
  gatewayStart(): Promise<{ success: boolean; error?: string }>;
  gatewayStop(): Promise<{ success: boolean; error?: string }>;
  gatewayRestart(): Promise<{ success: boolean; error?: string }>;
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
}

export interface SettingsActions {
  settingsGet(): Promise<{ success: boolean; settings?: Settings; error?: string }>;
  settingsSet(updates: Partial<Settings>): Promise<{ success: boolean; error?: string }>;
  detectOpenClawPath(): Promise<{ success: boolean; path?: string; error?: string }>;
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
}

export interface ConfigActions {
  configGet(): Promise<{ success: boolean; config?: any; error?: string }>;
  configSet(config: any): Promise<{ success: boolean; error?: string }>;
}

export interface LogsActions {
  logsGet(lines: number): Promise<{ success: boolean; logs?: string; error?: string }>;
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
  sessionsCreate(agent: string, model?: string): Promise<{ success: boolean; sessionId?: string; error?: string }>;
  sessionsSend(sessionId: string, message: string): Promise<{ success: boolean; response?: string; error?: string }>;
  sessionsClose(sessionId: string): Promise<{ success: boolean; error?: string }>;
  sessionsExport(sessionId: string, format: 'json' | 'markdown'): Promise<{ success: boolean; data?: string; error?: string }>;
  sessionsImport(data: string, format: 'json' | 'markdown'): Promise<{ success: boolean; sessionId?: string; error?: string }>;
  sessionsStats(): Promise<{ total: number; active: number; idle: number; agents: Record<string, number> }>;
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

export interface MainActions {
  openLink(url: string): Promise<void>;
  openDevTools(): Promise<void>;
}

export interface ElectronAPI extends 
  GatewayActions, 
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
  MainActions {}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}