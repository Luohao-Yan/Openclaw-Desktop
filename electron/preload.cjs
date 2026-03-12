const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Gateway
  gatewayStatus: () => ipcRenderer.invoke('gateway:status'),
  gatewayStart: () => ipcRenderer.invoke('gateway:start'),
  gatewayStop: () => ipcRenderer.invoke('gateway:stop'),
  gatewayRestart: () => ipcRenderer.invoke('gateway:restart'),

  // Config
  configGet: () => ipcRenderer.invoke('config:get'),
  configSet: (config) => ipcRenderer.invoke('config:set', config),

  // Tasks
  tasksGet: () => ipcRenderer.invoke('tasks:get'),
  tasksKill: (id) => ipcRenderer.invoke('tasks:kill', id),

  // Logs
  logsGet: (lines) => ipcRenderer.invoke('logs:get', lines),

  // Settings
  settingsGet: () => ipcRenderer.invoke('settings:get'),
  settingsSet: (updates) => ipcRenderer.invoke('settings:set', updates),
  detectOpenClawPath: () => ipcRenderer.invoke('detect:openclawPath'),
  diagnoseOpenClawRoot: () => ipcRenderer.invoke('settings:diagnoseOpenClawRoot'),

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

  // Window controls
  windowMinimize: () => ipcRenderer.invoke('window:minimize'),
  windowMaximize: () => ipcRenderer.invoke('window:maximize'),
  windowClose: () => ipcRenderer.invoke('window:close'),

  // System stats
  systemStats: () => ipcRenderer.invoke('system:stats'),

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
});
