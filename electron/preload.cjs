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
  // 按过滤条件查询日志（用于渠道故障排查）
  logsFilter: (filter) => ipcRenderer.invoke('logs:filter', filter),

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
  agentsUpdateIdentity: (agentId, identity) => ipcRenderer.invoke('agents:updateIdentity', agentId, identity),
  
  // Agent Enhancement - 智能体增强功能
  agentsGetPerformance: (agentId) => ipcRenderer.invoke('agents:getPerformance', agentId),
  agentsRunPerformanceTest: (agentId) => ipcRenderer.invoke('agents:runPerformanceTest', agentId),
  agentsGetEnhancements: (agentId) => ipcRenderer.invoke('agents:getEnhancements', agentId),
  agentsToggleEnhancement: (agentId, enhancementId, enabled) => ipcRenderer.invoke('agents:toggleEnhancement', agentId, enhancementId, enabled),
  agentsUpdateEnhancementSettings: (agentId, enhancementId, settings) => ipcRenderer.invoke('agents:updateEnhancementSettings', agentId, enhancementId, settings),
  agentsOpenDebugTerminal: (agentId) => ipcRenderer.invoke('agents:openDebugTerminal', agentId),
  agentsExportConfig: (agentId) => ipcRenderer.invoke('agents:exportConfig', agentId),
  agentsImportConfig: (agentId, filePath) => ipcRenderer.invoke('agents:importConfig', agentId, filePath),
  agentsClone: (agentId, newName, workspace) => ipcRenderer.invoke('agents:clone', agentId, newName, workspace),
  agentsGenerateReport: (agentId, format) => ipcRenderer.invoke('agents:generateReport', agentId, format),
  agentsRestart: (agentId) => ipcRenderer.invoke('agents:restart', agentId),
  agentsSecurityCheck: (agentId) => ipcRenderer.invoke('agents:securityCheck', agentId),

  // Sessions
  sessionsList: () => ipcRenderer.invoke('sessions:list'),
  sessionsGet: (sessionId) => ipcRenderer.invoke('sessions:get', sessionId),
  sessionsTranscript: (agentId, sessionKey) => ipcRenderer.invoke('sessions:transcript', agentId, sessionKey),
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

  // Channels — 渠道管理
  channelsStatus: () => ipcRenderer.invoke('channels:status'),
  channelsList: () => ipcRenderer.invoke('channels:list'),
  // 渠道诊断：执行 openclaw channels status --channel <channelType>
  channelsDiagnose: (channelType) => ipcRenderer.invoke('channels:diagnose', channelType),
  // 渠道重连：执行 openclaw channels reconnect --channel <channelType>
  channelsReconnect: (channelType) => ipcRenderer.invoke('channels:reconnect', channelType),
  // DM 配对请求列表：执行 openclaw pairing list <channel>
  pairingList: (channel) => ipcRenderer.invoke('channels:pairingList', channel),
  // DM 配对审批：执行 openclaw pairing approve <channel> <code>
  pairingApprove: (channel, code) => ipcRenderer.invoke('channels:pairingApprove', channel, code),
  // 添加渠道到 OpenClaw 系统（执行 openclaw channels add）
  channelsAdd: (channelType, fieldValues) => ipcRenderer.invoke('channels:add', channelType, fieldValues),

  // Models — 模型配置管理
  modelsStatus: () => ipcRenderer.invoke('models:status'),
  modelsOnboard: () => ipcRenderer.invoke('models:onboard'),
  modelsScan: () => ipcRenderer.invoke('models:scan'),
  modelsGetConfig: () => ipcRenderer.invoke('models:getConfig'),
  modelsSetPrimary: (model) => ipcRenderer.invoke('models:setPrimary', model),
  modelsFallbackAdd: (model) => ipcRenderer.invoke('models:fallbackAdd', model),
  modelsFallbackRemove: (model) => ipcRenderer.invoke('models:fallbackRemove', model),
  modelsFallbackClear: () => ipcRenderer.invoke('models:fallbackClear'),
  modelsAliasesList: () => ipcRenderer.invoke('models:aliasesList'),
  modelsAliasAdd: (alias, model) => ipcRenderer.invoke('models:aliasAdd', alias, model),
  modelsAliasRemove: (alias) => ipcRenderer.invoke('models:aliasRemove', alias),
  modelsModelRemove: (providerId, modelId) => ipcRenderer.invoke('models:modelRemove', providerId, modelId),
  modelsModelAdd: (providerId, model) => ipcRenderer.invoke('models:modelAdd', providerId, model),
  modelsModelUpdate: (providerId, modelId, updates) => ipcRenderer.invoke('models:modelUpdate', providerId, modelId, updates),
  modelsProviderConfigSave: (providerId, config) => ipcRenderer.invoke('models:providerConfigSave', providerId, config),

  // 远程 OpenClaw 连接
  remoteOpenClawTestConnection: (payload) => ipcRenderer.invoke('remote:testConnection', payload),
  remoteOpenClawSaveConnection: (payload) => ipcRenderer.invoke('remote:saveConnection', payload),

  // 环境修复
  fixEnvironment: (action, ...args) => ipcRenderer.invoke('system:fixEnvironment', action, ...args),
  onFixProgress: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('fix:progress', handler);
    return () => ipcRenderer.removeListener('fix:progress', handler);
  },

  // 运行时解析（三级回退策略）
  resolveRuntime: () => ipcRenderer.invoke('system:resolveRuntime'),
});
