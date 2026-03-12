const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Runtime
  runtimeInfo: () => ipcRenderer.invoke('runtime:info'),
  getCapabilities: () => ipcRenderer.invoke('runtime:capabilities'),

  // Gateway
  gatewayStatus: () => ipcRenderer.invoke('gateway:status'),
  gatewayStart: () => ipcRenderer.invoke('gateway:start'),
  gatewayStop: () => ipcRenderer.invoke('gateway:stop'),
  gatewayRestart: () => ipcRenderer.invoke('gateway:restart'),
  gatewayRepairCompatibility: () => ipcRenderer.invoke('gateway:repairCompatibility'),

  // Config
  configGet: () => ipcRenderer.invoke('config:get'),
  configSet: (config) => ipcRenderer.invoke('config:set', config),
  nodeConfigGet: () => ipcRenderer.invoke('nodeConfig:get'),
  nodeConfigSet: (config) => ipcRenderer.invoke('nodeConfig:set', config),
  coreConfigGetOverview: () => ipcRenderer.invoke('coreConfig:getOverview'),
  coreConfigSaveOverview: (payload) => ipcRenderer.invoke('coreConfig:saveOverview', payload),

  // Tasks
  tasksGet: () => ipcRenderer.invoke('tasks:get'),
  tasksKill: (id) => ipcRenderer.invoke('tasks:kill', id),

  // Cron
  cronList: (includeAll) => ipcRenderer.invoke('cron:list', includeAll),
  cronStatus: () => ipcRenderer.invoke('cron:status'),
  cronCreate: (payload) => ipcRenderer.invoke('cron:create', payload),
  cronAdd: (payload) => ipcRenderer.invoke('cron:add', payload),
  cronEdit: (jobId, patch) => ipcRenderer.invoke('cron:edit', jobId, patch),
  cronRemove: (jobId) => ipcRenderer.invoke('cron:remove', jobId),
  cronEnable: (jobId) => ipcRenderer.invoke('cron:enable', jobId),
  cronDisable: (jobId) => ipcRenderer.invoke('cron:disable', jobId),
  cronRun: (jobId, force) => ipcRenderer.invoke('cron:run', jobId, force),
  cronRuns: (jobId, limit) => ipcRenderer.invoke('cron:runs', jobId, limit),

  // Logs
  logsGet: (lines) => ipcRenderer.invoke('logs:get', lines),
  openGatewayLog: () => ipcRenderer.invoke('logs:openGatewayLog'),

  // Settings
  settingsGet: () => ipcRenderer.invoke('settings:get'),
  settingsSet: (updates) => ipcRenderer.invoke('settings:set', updates),
  detectOpenClawPath: () => ipcRenderer.invoke('detect:openclawPath'),
  diagnoseOpenClawRoot: () => ipcRenderer.invoke('settings:diagnoseOpenClawRoot'),
  diagnoseOpenClawCommand: () => ipcRenderer.invoke('settings:diagnoseOpenClawCommand'),
  testOpenClawCommand: () => ipcRenderer.invoke('settings:testOpenClawCommand'),
  autoRepairOpenClawCommand: () => ipcRenderer.invoke('settings:autoRepairOpenClawCommand'),

  // Tailscale
  tailscaleStatus: () => ipcRenderer.invoke('tailscale:status'),
  tailscaleStart: () => ipcRenderer.invoke('tailscale:start'),
  tailscaleApplyExposure: (mode, port) => ipcRenderer.invoke('tailscale:applyExposure', mode, port),

  // Agents
  agentsGetAll: () => ipcRenderer.invoke('agents:getAll'),
  agentsCreate: (payload) => ipcRenderer.invoke('agents:create', payload),
  agentsGetAgentConfigPath: (agentId) => ipcRenderer.invoke('agents:getAgentConfigPath', agentId),
  agentsGetWorkspaceDetails: (agentId) => ipcRenderer.invoke('agents:getWorkspaceDetails', agentId),
  agentsReadWorkspaceFile: (agentId, fileName) => ipcRenderer.invoke('agents:readWorkspaceFile', agentId, fileName),
  agentsSaveWorkspaceFile: (agentId, fileName, content) => ipcRenderer.invoke('agents:saveWorkspaceFile', agentId, fileName, content),
  agentsRenameWorkspaceEntry: (agentId, targetPath, nextName) => ipcRenderer.invoke('agents:renameWorkspaceEntry', agentId, targetPath, nextName),
  agentsDeleteWorkspaceEntry: (agentId, targetPath) => ipcRenderer.invoke('agents:deleteWorkspaceEntry', agentId, targetPath),
  agentsListWorkspaceTrash: (agentId) => ipcRenderer.invoke('agents:listWorkspaceTrash', agentId),
  agentsRestoreWorkspaceTrashEntry: (agentId, trashEntryId) => ipcRenderer.invoke('agents:restoreWorkspaceTrashEntry', agentId, trashEntryId),
  agentsRestoreWorkspaceTrashEntries: (agentId, trashEntryIds) => ipcRenderer.invoke('agents:restoreWorkspaceTrashEntries', agentId, trashEntryIds),
  agentsDeleteWorkspaceTrashEntry: (agentId, trashEntryId) => ipcRenderer.invoke('agents:deleteWorkspaceTrashEntry', agentId, trashEntryId),
  agentsDeleteWorkspaceTrashEntries: (agentId, trashEntryIds) => ipcRenderer.invoke('agents:deleteWorkspaceTrashEntries', agentId, trashEntryIds),
  agentsClearWorkspaceTrash: (agentId) => ipcRenderer.invoke('agents:clearWorkspaceTrash', agentId),
  agentsReadMemoryFile: (agentId, targetPath) => ipcRenderer.invoke('agents:readMemoryFile', agentId, targetPath),
  agentsSaveMemoryFile: (agentId, targetPath, content) => ipcRenderer.invoke('agents:saveMemoryFile', agentId, targetPath, content),
  agentsClearMemoryFile: (agentId, targetPath) => ipcRenderer.invoke('agents:clearMemoryFile', agentId, targetPath),
  agentsReadManagedFile: (agentId, targetPath) => ipcRenderer.invoke('agents:readManagedFile', agentId, targetPath),
  agentsSaveManagedFile: (agentId, targetPath, content) => ipcRenderer.invoke('agents:saveManagedFile', agentId, targetPath, content),
  agentsListWorkspaceEntries: (agentId, targetPath) => ipcRenderer.invoke('agents:listWorkspaceEntries', agentId, targetPath),
  agentsGetCount: () => ipcRenderer.invoke('agents:getCount'),

  // Sessions
  sessionsList: () => ipcRenderer.invoke('sessions:list'),
  sessionsGet: (sessionId) => ipcRenderer.invoke('sessions:get', sessionId),
  sessionsCreate: (agent, model) => ipcRenderer.invoke('sessions:create', agent, model),
  sessionsSend: (sessionId, message) => ipcRenderer.invoke('sessions:send', sessionId, message),
  sessionsClose: (sessionId) => ipcRenderer.invoke('sessions:close', sessionId),
  sessionsExport: (sessionId, format) => ipcRenderer.invoke('sessions:export', sessionId, format),
  sessionsImport: (data, format) => ipcRenderer.invoke('sessions:import', data, format),
  sessionsStats: () => ipcRenderer.invoke('sessions:stats'),
  sessionsCleanup: (dryRun) => ipcRenderer.invoke('sessions:cleanup', dryRun),

  // 打开文件路径（用于 Skills 页面）
  openPath: (targetPath) => ipcRenderer.invoke('shell:openPath', targetPath),

  // Window controls
  windowMinimize: () => ipcRenderer.invoke('window:minimize'),
  windowMaximize: () => ipcRenderer.invoke('window:maximize'),
  windowClose: () => ipcRenderer.invoke('window:close'),

  // System stats
  systemStats: () => ipcRenderer.invoke('system:stats'),
  setupEnvironmentCheck: () => ipcRenderer.invoke('system:setupEnvironmentCheck'),
  setupInstallOpenClaw: () => ipcRenderer.invoke('system:setupInstallOpenClaw'),
  onInstallProgress: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('install:progress', handler);
    return () => ipcRenderer.removeListener('install:progress', handler);
  },
  onInstallOutput: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('install:output', handler);
    return () => ipcRenderer.removeListener('install:output', handler);
  },
  testModelConnection: (params) => ipcRenderer.invoke('system:testModelConnection', params),

  // Instances
  instancesGetAll: () => ipcRenderer.invoke('instances:getAll'),
  instancesStart: (instanceId) => ipcRenderer.invoke('instances:start', instanceId),
  instancesStop: (instanceId) => ipcRenderer.invoke('instances:stop', instanceId),
  instancesRestart: (instanceId) => ipcRenderer.invoke('instances:restart', instanceId),
  instancesDelete: (instanceId) => ipcRenderer.invoke('instances:delete', instanceId),
  instancesStats: () => ipcRenderer.invoke('instances:stats'),

  // Skills
  skillsGetAll: () => ipcRenderer.invoke('skills:getAll'),
  skillsInstall: (skillId) => ipcRenderer.invoke('skills:install', skillId),
  skillsUninstall: (skillId) => ipcRenderer.invoke('skills:uninstall', skillId),
  skillsUpdate: (skillId) => ipcRenderer.invoke('skills:update', skillId),
  skillsEnable: (skillId) => ipcRenderer.invoke('skills:enable', skillId),
  skillsDisable: (skillId) => ipcRenderer.invoke('skills:disable', skillId),
  skillsStats: () => ipcRenderer.invoke('skills:stats'),
  skillsSearch: (query) => ipcRenderer.invoke('skills:search', query),

  // Approvals — exec approvals 图形化管理
  approvalsGet: (target) => ipcRenderer.invoke('approvals:get', target),
  approvalsAllowlistAdd: (pattern, agent, target) => ipcRenderer.invoke('approvals:allowlist:add', pattern, agent, target),
  approvalsAllowlistRemove: (pattern) => ipcRenderer.invoke('approvals:allowlist:remove', pattern),

  // 应用配置管理
  appConfigReset: () => ipcRenderer.invoke('app-config:reset'),
  appConfigReinstallOpenclaw: () => ipcRenderer.invoke('app-config:reinstall-openclaw'),
});
