/**
 * Agent 分组管理 — IPC 通信层
 *
 * 注册所有分组管理相关的 IPC 通道，包括：
 * - 分组 CRUD 操作（创建、读取、更新、删除）
 * - Agent-分组映射管理（分配、移除、查询）
 * - 按分组批量导出（加密打包为 .ocgroup 文件）
 * - 按分组批量导入（解析 .ocgroup 文件并逐个导入 Agent）
 *
 * 调用 agentGroupLogic.ts 纯函数模块处理业务逻辑，
 * 调用 agentExchangeLogic.ts 复用现有的加密/解密引擎。
 */

import pkg from 'electron';
const { ipcMain, dialog, BrowserWindow } = pkg;
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'child_process';
import Store from 'electron-store';
import {
  validateGroupName,
  createGroup,
  cleanOrphanMappings,
  findGroupByName,
  removeMappingsForGroup,
  serializeOcgroup,
  deserializeOcgroup,
  parseOcgroupHeader,
  type AgentGroup,
  type GroupMetadata,
  type ExportProgressEvent,
  type ImportProgressEvent,
} from './agentGroupLogic.js';
import {
  encryptPayload,
  decryptPayload,
  serializeBundle,
  deserializeBundle,
  validatePassphrase,
  stripSensitiveFields,
  stripPathFields,
  sanitizeModelsJson,
  collectSkillManifest,
  extractChannelBindings,
  resolveAgentName,
  buildImportAgentCreateArgs,
  resolveImportWorkspacePath,
  OCAGENT_MAGIC,
  FORMAT_VERSION,
  type AgentConfigPayload,
} from './agentExchangeLogic.js';
import { getOpenClawRootDir, getShellPath, resolveOpenClawCommand } from './settings.js';
import { buildDoctorFixEnv } from './agents.js';

// electron-store 实例（模块级别）
const store = new Store();

/** 分组定义存储 key */
const GROUPS_KEY = 'agentGroups';
/** Agent-分组映射存储 key */
const MAPPINGS_KEY = 'agentGroupMappings';

/** Agent workspace 中的 7 个 markdown 配置文件 */
const WORKSPACE_MD_FILES = [
  'AGENTS.md',
  'BOOTSTRAP.md',
  'HEARTBEAT.md',
  'IDENTITY.md',
  'SOUL.md',
  'TOOLS.md',
  'USER.md',
] as const;

// ============================================================================
// 辅助函数
// ============================================================================

/** 获取 openclaw.json 配置文件路径 */
function getConfigPath(): string {
  return path.join(getOpenClawRootDir(), 'openclaw.json');
}

/** 读取 openclaw.json 配置 */
function readConfig(): any {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) {
    throw new Error('Config file not found');
  }
  const content = fs.readFileSync(configPath, 'utf8');
  return JSON.parse(content);
}

/** 写入 openclaw.json 配置 */
function writeConfig(config: any): void {
  const configPath = getConfigPath();
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
}

/** 获取 OpenClaw 根目录 */
function getOpenClawRoot(): string {
  return getOpenClawRootDir();
}

/**
 * 获取应用版本号
 * 优先从 Electron app 对象获取，回退到 '0.0.0'
 */
function getAppVersion(): string {
  try {
    return pkg.app?.getVersion?.() || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/**
 * 向渲染进程发送导出进度事件
 *
 * @param data - 导出进度事件数据
 */
function sendExportProgress(data: ExportProgressEvent): void {
  const win = BrowserWindow.getAllWindows()[0];
  win?.webContents.send('agentGroups:exportProgress', data);
}

/**
 * 向渲染进程发送导入进度事件
 *
 * @param data - 导入进度事件数据
 */
function sendImportProgress(data: ImportProgressEvent): void {
  const win = BrowserWindow.getAllWindows()[0];
  win?.webContents.send('agentGroups:importProgress', data);
}

/**
 * 解析 Agent 的实际 workspace 根目录
 *
 * @param agent - openclaw.json 中的 agent 条目
 * @returns 实际存在的 workspace 目录路径，或 undefined
 */
function resolveWorkspaceRoot(agent: any): string | undefined {
  const openclawRoot = getOpenClawRoot();

  // 优先：~/.openclaw/workspace-{agentId}
  if (agent?.id) {
    const normalizedId = String(agent.id).trim();
    const directWorkspace = path.join(openclawRoot, `workspace-${normalizedId}`);
    if (fs.existsSync(directWorkspace)) {
      return directWorkspace;
    }
  }

  // 候选路径列表
  const candidates = [
    agent?.workspace,
    agent?.workspaceRoot,
    agent?.workspaceDir,
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

  for (const candidate of candidates) {
    const resolvedCandidate = path.resolve(candidate);
    if (fs.existsSync(resolvedCandidate)) {
      return resolvedCandidate;
    }
  }

  return undefined;
}

/**
 * 解析 Agent 的配置目录（agentDir）
 *
 * @param agent - openclaw.json 中的 agent 条目
 * @returns 实际存在的 agent 配置目录路径，或 undefined
 */
function resolveAgentConfigRoot(agent: any): string | undefined {
  if (agent?.agentDir) {
    const resolvedAgentDir = path.resolve(agent.agentDir);
    if (fs.existsSync(resolvedAgentDir)) {
      return resolvedAgentDir;
    }
  }

  if (agent?.id) {
    const fallbackAgentDir = path.join(getOpenClawRoot(), 'agents', String(agent.id).trim(), 'agent');
    if (fs.existsSync(fallbackAgentDir)) {
      return fallbackAgentDir;
    }
  }

  return undefined;
}

/**
 * 执行 CLI 命令并返回 Promise
 *
 * @param cmd - 命令路径
 * @param args - 命令参数数组
 * @param env - 环境变量
 * @returns 包含 success、stdout、stderr 的结果对象
 */
function runCliCommand(
  cmd: string,
  args: string[],
  env: Record<string, string | undefined>,
): Promise<{ success: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { env });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });
    child.on('close', (code) => {
      resolve({ success: code === 0, stdout, stderr });
    });
    child.on('error', (err) => {
      resolve({ success: false, stdout: '', stderr: err.message });
    });
  });
}

/**
 * 获取已安装 Skills 列表
 *
 * @returns 已安装 skills 的简要信息数组
 */
function getInstalledSkillsList(): Array<{ id: string; name: string; path?: string }> {
  const result: Array<{ id: string; name: string; path?: string }> = [];
  const possiblePaths = [
    path.join(process.env.HOME || '', '.openclaw', 'skills'),
    getOpenClawRoot() ? path.join(getOpenClawRoot(), 'skills') : null,
  ].filter((p): p is string => p !== null);

  for (const skillsDir of possiblePaths) {
    if (!fs.existsSync(skillsDir)) continue;
    try {
      const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const skillId = entry.name;
        const skillPath = path.join(skillsDir, skillId);
        const skillMdPath = path.join(skillPath, 'SKILL.md');
        if (!fs.existsSync(skillMdPath)) continue;
        let name = skillId;
        try {
          const mdContent = fs.readFileSync(skillMdPath, 'utf8');
          const nameMatch = mdContent.match(/name:\s*([^\n\s]+)/);
          if (nameMatch) name = nameMatch[1];
        } catch { /* 解析失败使用目录名 */ }
        result.push({ id: skillId, name, path: skillPath });
      }
    } catch { /* 目录读取失败，跳过 */ }
  }
  return result;
}

/**
 * 递归读取目录下的所有文件
 *
 * @param baseDir - 根目录（用于计算相对路径）
 * @param currentDir - 当前遍历的目录
 * @param files - 文件路径到内容的映射（累积结果）
 */
function readDirRecursive(baseDir: string, currentDir: string, files: Record<string, string>): void {
  const entries = fs.readdirSync(currentDir);
  for (const entry of entries) {
    const entryPath = path.join(currentDir, entry);
    try {
      const stat = fs.statSync(entryPath);
      if (stat.isFile()) {
        const relativePath = entryPath.substring(baseDir.length + 1).replace(/\\/g, '/');
        files[relativePath] = fs.readFileSync(entryPath, 'utf8');
      } else if (stat.isDirectory()) {
        readDirRecursive(baseDir, entryPath, files);
      }
    } catch { /* 单个文件读取失败，跳过 */ }
  }
}

/**
 * 读取私有 Skill 的所有文件内容
 *
 * @param skillId - skill 的唯一标识
 * @returns 文件相对路径到文件内容的映射
 */
function readPrivateSkillFiles(skillId: string): Record<string, string> {
  const files: Record<string, string> = {};
  const possiblePaths = [
    path.join(process.env.HOME || '', '.openclaw', 'skills', skillId),
    getOpenClawRoot() ? path.join(getOpenClawRoot(), 'skills', skillId) : null,
  ].filter((p): p is string => p !== null);

  for (const skillDir of possiblePaths) {
    if (!fs.existsSync(skillDir)) continue;
    try {
      readDirRecursive(skillDir, skillDir, files);
      if (Object.keys(files).length > 0) break;
    } catch { /* 目录读取失败，尝试下一个 */ }
  }
  return files;
}

/**
 * 回滚已创建的 Agent（调用 openclaw agents delete --force）
 *
 * @param agentId - 需要回滚的 Agent ID
 */
async function rollbackAgent(agentId: string | undefined): Promise<void> {
  if (!agentId) return;
  try {
    const openclawCmd = resolveOpenClawCommand();
    const shellPath = await getShellPath();
    const env = buildDoctorFixEnv(process.env, shellPath);
    await runCliCommand(openclawCmd, ['--no-color', 'agents', 'delete', agentId, '--force', '--json'], env);
  } catch {
    // 回滚异常不阻塞主流程
  }
}


// ============================================================================
// 主函数：注册所有分组管理 IPC 通道
// ============================================================================

export function setupAgentGroupsIPC(): void {

  // ========================================================================
  // agentGroups:list — 读取分组列表
  // ========================================================================
  ipcMain.handle(
    'agentGroups:list',
    async (): Promise<{ success: boolean; groups: AgentGroup[]; error?: string }> => {
      try {
        const groups = (store.get(GROUPS_KEY, []) as AgentGroup[]);
        return { success: true, groups };
      } catch (err) {
        return { success: false, groups: [], error: String(err) };
      }
    },
  );

  // ========================================================================
  // agentGroups:create — 创建新分组
  // ========================================================================
  ipcMain.handle(
    'agentGroups:create',
    async (
      _,
      data: { name: string; description?: string; color?: string; emoji?: string },
    ): Promise<{ success: boolean; group?: AgentGroup; error?: string }> => {
      try {
        const groups = (store.get(GROUPS_KEY, []) as AgentGroup[]);
        const existingNames = groups.map((g) => g.name);

        // 校验分组名称
        const validation = validateGroupName(data.name, existingNames);
        if (!validation.valid) {
          return { success: false, error: validation.error };
        }

        // 创建分组对象并持久化
        const group = createGroup(data.name, {
          description: data.description,
          color: data.color,
          emoji: data.emoji,
        });
        groups.push(group);
        store.set(GROUPS_KEY, groups);

        return { success: true, group };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },
  );

  // ========================================================================
  // agentGroups:update — 更新分组属性
  // ========================================================================
  ipcMain.handle(
    'agentGroups:update',
    async (
      _,
      data: { id: string; name?: string; description?: string; color?: string; emoji?: string },
    ): Promise<{ success: boolean; group?: AgentGroup; error?: string }> => {
      try {
        const groups = (store.get(GROUPS_KEY, []) as AgentGroup[]);
        const index = groups.findIndex((g) => g.id === data.id);

        if (index === -1) {
          return { success: false, error: '分组不存在' };
        }

        // 如果修改了名称，需要校验新名称
        if (data.name !== undefined) {
          const otherNames = groups
            .filter((g) => g.id !== data.id)
            .map((g) => g.name);
          const validation = validateGroupName(data.name, otherNames);
          if (!validation.valid) {
            return { success: false, error: validation.error };
          }
          groups[index].name = data.name;
        }

        // 更新可选字段
        if (data.description !== undefined) groups[index].description = data.description;
        if (data.color !== undefined) groups[index].color = data.color;
        if (data.emoji !== undefined) groups[index].emoji = data.emoji;
        groups[index].updatedAt = new Date().toISOString();

        store.set(GROUPS_KEY, groups);
        return { success: true, group: groups[index] };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },
  );

  // ========================================================================
  // agentGroups:delete — 删除分组及其关联映射
  // ========================================================================
  ipcMain.handle(
    'agentGroups:delete',
    async (_, groupId: string): Promise<{ success: boolean; error?: string }> => {
      try {
        const groups = (store.get(GROUPS_KEY, []) as AgentGroup[]);
        const index = groups.findIndex((g) => g.id === groupId);

        if (index === -1) {
          return { success: false, error: '分组不存在' };
        }

        // 移除分组定义
        groups.splice(index, 1);
        store.set(GROUPS_KEY, groups);

        // 清除关联的 Agent-分组映射
        const mappings = (store.get(MAPPINGS_KEY, {}) as Record<string, string>);
        const cleanedMappings = removeMappingsForGroup(mappings, groupId);
        store.set(MAPPINGS_KEY, cleanedMappings);

        return { success: true };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },
  );

  // ========================================================================
  // agentGroups:assignAgent — 将 Agent 分配到分组
  // ========================================================================
  ipcMain.handle(
    'agentGroups:assignAgent',
    async (
      _,
      data: { agentId: string; groupId: string },
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        const mappings = (store.get(MAPPINGS_KEY, {}) as Record<string, string>);
        mappings[data.agentId] = data.groupId;
        store.set(MAPPINGS_KEY, mappings);
        return { success: true };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },
  );

  // ========================================================================
  // agentGroups:removeAgent — 将 Agent 从分组中移除
  // ========================================================================
  ipcMain.handle(
    'agentGroups:removeAgent',
    async (_, agentId: string): Promise<{ success: boolean; error?: string }> => {
      try {
        const mappings = (store.get(MAPPINGS_KEY, {}) as Record<string, string>);
        delete mappings[agentId];
        store.set(MAPPINGS_KEY, mappings);
        return { success: true };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },
  );

  // ========================================================================
  // agentGroups:getMappings — 获取 Agent-分组映射关系
  // ========================================================================
  ipcMain.handle(
    'agentGroups:getMappings',
    async (): Promise<{ success: boolean; mappings: Record<string, string>; error?: string }> => {
      try {
        let mappings = (store.get(MAPPINGS_KEY, {}) as Record<string, string>);

        // 尝试清理孤立映射（如果能获取到有效 Agent 列表）
        try {
          const config = readConfig();
          const agentsList = config?.agents?.list || [];
          const validAgentIds = agentsList.map((a: any) => a.id).filter(Boolean);
          mappings = cleanOrphanMappings(mappings, validAgentIds);
          store.set(MAPPINGS_KEY, mappings);
        } catch {
          // 无法读取 Agent 列表时跳过清理，返回原始映射
        }

        return { success: true, mappings };
      } catch (err) {
        return { success: false, mappings: {}, error: String(err) };
      }
    },
  );


  // ========================================================================
  // agentGroups:selectExportPath — 系统保存对话框（.ocgroup 过滤器）
  // ========================================================================
  ipcMain.handle(
    'agentGroups:selectExportPath',
    async (_, defaultName: string): Promise<{ success: boolean; filePath?: string; error?: string }> => {
      try {
        const result = await dialog.showSaveDialog({
          title: '导出分组配置',
          defaultPath: defaultName,
          filters: [{ name: 'OpenClaw Agent Group', extensions: ['ocgroup'] }],
        });

        if (result.canceled || !result.filePath) {
          return { success: false, error: 'cancelled' };
        }
        return { success: true, filePath: result.filePath };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },
  );

  // ========================================================================
  // agentGroups:exportGroup — 按分组批量导出 Agent 配置
  // ========================================================================
  ipcMain.handle(
    'agentGroups:exportGroup',
    async (
      _,
      data: { groupId: string; passphrase: string; filePath?: string },
    ): Promise<{
      success: boolean;
      filePath?: string;
      failedAgents?: Array<{ name: string; error: string }>;
      error?: string;
    }> => {
      try {
        // 1. 校验 Passphrase
        const passphraseCheck = validatePassphrase(data.passphrase);
        if (!passphraseCheck.valid) {
          return { success: false, error: passphraseCheck.error };
        }

        // 2. 查找分组
        const groups = (store.get(GROUPS_KEY, []) as AgentGroup[]);
        const group = groups.find((g) => g.id === data.groupId);
        if (!group) {
          return { success: false, error: '分组不存在' };
        }

        // 3. 获取分组下的 Agent ID 列表
        const mappings = (store.get(MAPPINGS_KEY, {}) as Record<string, string>);
        const agentIds = Object.entries(mappings)
          .filter(([_, gId]) => gId === data.groupId)
          .map(([agentId]) => agentId);

        if (agentIds.length === 0) {
          return { success: false, error: '分组中没有 Agent' };
        }

        // 4. 读取 openclaw.json 获取 Agent 详细信息
        const config = readConfig();
        const agentsList = config?.agents?.list || [];
        const bindings = config?.bindings || [];

        // 5. 确定保存路径
        let savePath = data.filePath;
        if (!savePath) {
          const defaultName = `${group.name}.ocgroup`;
          const saveResult = await dialog.showSaveDialog({
            title: '导出分组配置',
            defaultPath: defaultName,
            filters: [{ name: 'OpenClaw Agent Group', extensions: ['ocgroup'] }],
          });
          if (saveResult.canceled || !saveResult.filePath) {
            return { success: false, error: 'cancelled' };
          }
          savePath = saveResult.filePath;
        }

        // 6. 逐个 Agent 收集配置、加密、序列化为 Bundle
        const agentBundles: Buffer[] = [];
        const failedAgents: Array<{ name: string; error: string }> = [];
        const total = agentIds.length;

        for (let i = 0; i < agentIds.length; i++) {
          const agentId = agentIds[i];
          const agentEntry = agentsList.find((a: any) => a.id === agentId);
          const agentName = agentEntry?.name || agentId;

          // 推送进度：正在导出
          sendExportProgress({
            current: i + 1,
            total,
            agentName,
            status: 'exporting',
          });

          if (!agentEntry) {
            // Agent 在 openclaw.json 中不存在，跳过
            failedAgents.push({ name: agentName, error: 'Agent 在系统中不存在' });
            sendExportProgress({ current: i + 1, total, agentName, status: 'failed', error: 'Agent 在系统中不存在' });
            continue;
          }

          try {
            // 收集 workspace 文件
            const actualWorkspaceDir = resolveWorkspaceRoot(agentEntry);
            const actualAgentDir = resolveAgentConfigRoot(agentEntry);
            const workspaceFiles: Record<string, string> = {};

            if (actualWorkspaceDir && fs.existsSync(actualWorkspaceDir)) {
              for (const fileName of WORKSPACE_MD_FILES) {
                const mdPath = path.join(actualWorkspaceDir, fileName);
                if (fs.existsSync(mdPath)) {
                  try { workspaceFiles[fileName] = fs.readFileSync(mdPath, 'utf8'); } catch { /* 跳过 */ }
                }
              }
            }

            // 读取 models.json
            let modelsJson: string | undefined;
            if (actualAgentDir) {
              const modelsPath = path.join(actualAgentDir, 'models.json');
              if (fs.existsSync(modelsPath)) {
                try { modelsJson = fs.readFileSync(modelsPath, 'utf8'); } catch { /* 跳过 */ }
              }
            }

            // 过滤敏感字段和路径字段
            const sensitiveFiltered = stripSensitiveFields(agentEntry as Record<string, unknown>);
            const cleanedEntry = stripPathFields(sensitiveFiltered);

            // 提取 Channel 绑定模板
            const channelBindings = extractChannelBindings(bindings, agentId);

            // 收集 Skills 清单
            const toolsMdContent = workspaceFiles['TOOLS.md'];
            const installedSkills = getInstalledSkillsList();
            const skills = collectSkillManifest(toolsMdContent, installedSkills);

            // 读取私有 skill 文件
            for (const skill of skills) {
              if (skill.source === 'private' && skill.id) {
                const skillFiles = readPrivateSkillFiles(skill.id);
                if (Object.keys(skillFiles).length > 0) {
                  skill.files = skillFiles;
                }
              }
            }

            // 构建 AgentConfigPayload
            const payload: AgentConfigPayload = {
              agent: {
                id: agentEntry.id || agentId,
                name: agentEntry.name || 'Unnamed Agent',
                model: agentEntry.model || 'Unknown',
                workspace: '',
              },
              agentEntry: cleanedEntry,
              workspaceFiles,
              modelsJson: sanitizeModelsJson(modelsJson),
              skills,
              channelBindings,
            };

            // 加密 payload
            const { cryptoParams, ciphertext } = encryptPayload(payload, data.passphrase);

            // 序列化为 .ocagent 二进制 Bundle
            const bundleBuffer = serializeBundle({
              header: {
                magic: OCAGENT_MAGIC,
                formatVersion: FORMAT_VERSION,
                exportTime: new Date().toISOString(),
                appVersion: getAppVersion(),
              },
              cryptoParams,
              ciphertext,
            });

            agentBundles.push(bundleBuffer);
            sendExportProgress({ current: i + 1, total, agentName, status: 'success' });
          } catch (agentErr) {
            // 单个 Agent 导出失败，记录并继续
            failedAgents.push({ name: agentName, error: String(agentErr) });
            sendExportProgress({ current: i + 1, total, agentName, status: 'failed', error: String(agentErr) });
          }
        }

        // 7. 如果没有任何 Agent 成功导出，返回失败
        if (agentBundles.length === 0) {
          return { success: false, error: '所有 Agent 导出均失败', failedAgents };
        }

        // 8. 构建分组元数据并序列化为 .ocgroup 格式
        const groupMeta: GroupMetadata = {
          name: group.name,
          ...(group.description && { description: group.description }),
          ...(group.color && { color: group.color }),
          ...(group.emoji && { emoji: group.emoji }),
        };

        const ocgroupBuffer = serializeOcgroup(groupMeta, agentBundles, getAppVersion());

        // 9. 写入文件
        fs.writeFileSync(savePath, ocgroupBuffer);

        return {
          success: true,
          filePath: savePath,
          failedAgents: failedAgents.length > 0 ? failedAgents : undefined,
        };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },
  );


  // ========================================================================
  // agentGroups:selectImportFile — 系统文件选择对话框（.ocgroup 过滤器）
  // ========================================================================
  ipcMain.handle(
    'agentGroups:selectImportFile',
    async (): Promise<{ success: boolean; filePath?: string; error?: string }> => {
      try {
        const result = await dialog.showOpenDialog({
          title: '选择分组配置文件',
          filters: [{ name: 'OpenClaw Agent Group', extensions: ['ocgroup'] }],
          properties: ['openFile'],
        });

        if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
          return { success: false, error: 'cancelled' };
        }
        return { success: true, filePath: result.filePaths[0] };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },
  );

  // ========================================================================
  // agentGroups:previewImport — 预览 .ocgroup 文件信息（无需 Passphrase）
  // ========================================================================
  ipcMain.handle(
    'agentGroups:previewImport',
    async (
      _,
      filePath: string,
    ): Promise<{
      success: boolean;
      groupMeta?: GroupMetadata;
      agentCount?: number;
      error?: string;
    }> => {
      try {
        const fileBuffer = fs.readFileSync(filePath);
        const { groupMeta, agentCount } = parseOcgroupHeader(fileBuffer);
        return { success: true, groupMeta, agentCount };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },
  );

  // ========================================================================
  // agentGroups:importGroup — 批量导入 .ocgroup 文件中的 Agent
  // ========================================================================
  ipcMain.handle(
    'agentGroups:importGroup',
    async (
      _,
      data: { filePath: string; passphrase: string },
    ): Promise<{
      success: boolean;
      summary?: {
        successCount: number;
        failedAgents: Array<{ name: string; error: string }>;
        warnings: string[];
        group: { id: string; name: string; merged: boolean };
      };
      error?: string;
    }> => {
      try {
        // 1. 读取并解析 .ocgroup 文件
        const fileBuffer = fs.readFileSync(data.filePath);
        const { groupMeta, agentBundles } = deserializeOcgroup(fileBuffer);

        if (agentBundles.length === 0) {
          return { success: false, error: '归档文件中没有 Agent 数据' };
        }

        // 2. 验证第一个 Agent 的 Passphrase（快速失败）
        try {
          const firstBundle = deserializeBundle(agentBundles[0]);
          decryptPayload(firstBundle.cryptoParams, firstBundle.ciphertext, data.passphrase);
        } catch {
          return { success: false, error: '密钥错误或文件已损坏' };
        }

        // 3. 创建或合并分组
        const groups = (store.get(GROUPS_KEY, []) as AgentGroup[]);
        let merged = false;
        let targetGroup: AgentGroup;

        const existingGroup = findGroupByName(groupMeta.name, groups);
        if (existingGroup) {
          // 同名分组已存在，合并到已有分组
          targetGroup = existingGroup;
          merged = true;
        } else {
          // 创建新分组
          targetGroup = createGroup(groupMeta.name, {
            description: groupMeta.description,
            color: groupMeta.color,
            emoji: groupMeta.emoji,
          });
          groups.push(targetGroup);
          store.set(GROUPS_KEY, groups);
        }

        // 4. 逐个导入 Agent
        const mappings = (store.get(MAPPINGS_KEY, {}) as Record<string, string>);
        const failedAgents: Array<{ name: string; error: string }> = [];
        const warnings: string[] = [];
        let successCount = 0;
        const total = agentBundles.length;

        for (let i = 0; i < agentBundles.length; i++) {
          let agentName = `Agent ${i + 1}`;
          let createdAgentId: string | undefined;

          // 推送进度：开始处理
          sendImportProgress({
            current: i + 1,
            total,
            agentName,
            step: 1,
            stepName: '解密验证',
            status: 'running',
          });

          try {
            // Step 1: 解密 Bundle
            const bundle = deserializeBundle(agentBundles[i]);
            const payload: AgentConfigPayload = decryptPayload(
              bundle.cryptoParams,
              bundle.ciphertext,
              data.passphrase,
            );
            agentName = payload.agent?.name || agentName;

            sendImportProgress({
              current: i + 1, total, agentName,
              step: 1, stepName: '解密验证', status: 'success',
            });

            // Step 2: 创建 Agent
            sendImportProgress({
              current: i + 1, total, agentName,
              step: 2, stepName: '创建 Agent', status: 'running',
            });

            const config = readConfig();
            const existingNames = (config?.agents?.list || []).map((a: any) => a.name || '');
            const resolvedName = resolveAgentName(agentName, existingNames);

            const openclawCmd = resolveOpenClawCommand();
            const shellPath = await getShellPath();
            const env = buildDoctorFixEnv(process.env, shellPath);
            const workspacePath = resolveImportWorkspacePath(getOpenClawRoot(), resolvedName);
            const args = buildImportAgentCreateArgs({ name: resolvedName, workspace: workspacePath });

            const cliResult = await runCliCommand(openclawCmd, ['--no-color', ...args], env);
            if (!cliResult.success) {
              const errorMsg = cliResult.stderr.trim() || cliResult.stdout.trim() || '创建 Agent 失败';
              throw new Error(errorMsg);
            }

            // 从更新后的配置中找到新创建的 Agent
            const updatedConfig = readConfig();
            const newAgent = (updatedConfig?.agents?.list || []).find((a: any) => a.name === resolvedName);
            if (!newAgent) {
              throw new Error('Agent 创建成功但未能在配置中定位');
            }
            createdAgentId = newAgent.id;

            sendImportProgress({
              current: i + 1, total, agentName: resolvedName,
              step: 2, stepName: '创建 Agent', status: 'success',
              message: `已创建: ${resolvedName}`,
            });

            // Step 3: 写入配置文件
            sendImportProgress({
              current: i + 1, total, agentName: resolvedName,
              step: 3, stepName: '写入配置文件', status: 'running',
            });

            const configAfterCreate = readConfig();
            const agentRecord = (configAfterCreate?.agents?.list || []).find(
              (a: any) => a.id === createdAgentId,
            );

            if (agentRecord) {
              // 写入 workspace markdown 文件
              const wsDir = agentRecord.workspace;
              if (wsDir && payload.workspaceFiles) {
                if (!fs.existsSync(wsDir)) fs.mkdirSync(wsDir, { recursive: true });
                for (const [fileName, content] of Object.entries(payload.workspaceFiles)) {
                  fs.writeFileSync(path.join(wsDir, fileName), content, 'utf8');
                }
              }

              // 写入 models.json
              const agentDir = agentRecord.agentDir;
              if (agentDir && payload.modelsJson) {
                if (!fs.existsSync(agentDir)) fs.mkdirSync(agentDir, { recursive: true });
                fs.writeFileSync(path.join(agentDir, 'models.json'), payload.modelsJson, 'utf8');
              }
            }

            sendImportProgress({
              current: i + 1, total, agentName: resolvedName,
              step: 3, stepName: '写入配置文件', status: 'success',
            });

            // Step 4: 安装 Skills
            sendImportProgress({
              current: i + 1, total, agentName: resolvedName,
              step: 4, stepName: '安装 Skills', status: 'running',
            });

            if (payload.skills && payload.skills.length > 0) {
              for (const skill of payload.skills) {
                try {
                  if (skill.source === 'clawhub') {
                    const installResult = await runCliCommand(
                      openclawCmd,
                      ['--no-color', 'clawhub', 'install', skill.id],
                      env,
                    );
                    if (!installResult.success) {
                      warnings.push(`${resolvedName}: Skill ${skill.name} 安装失败`);
                    }
                  } else if (skill.source === 'private' && skill.files) {
                    const skillsDir = path.join(getOpenClawRoot(), 'skills', skill.id);
                    fs.mkdirSync(skillsDir, { recursive: true });
                    for (const [fileName, content] of Object.entries(skill.files)) {
                      fs.writeFileSync(path.join(skillsDir, fileName), content, 'utf8');
                    }
                  }
                } catch (skillErr) {
                  warnings.push(`${resolvedName}: Skill ${skill.name} 安装异常: ${String(skillErr)}`);
                }
              }
            }

            sendImportProgress({
              current: i + 1, total, agentName: resolvedName,
              step: 4, stepName: '安装 Skills', status: 'success',
            });

            // Step 5: 配置 Channel 绑定
            sendImportProgress({
              current: i + 1, total, agentName: resolvedName,
              step: 5, stepName: '配置 Channel 绑定', status: 'running',
            });

            if (payload.channelBindings && payload.channelBindings.length > 0 && createdAgentId) {
              try {
                const latestConfig = readConfig();
                if (!Array.isArray(latestConfig.bindings)) {
                  latestConfig.bindings = [];
                }
                for (const template of payload.channelBindings) {
                  latestConfig.bindings.push({
                    agentId: createdAgentId,
                    match: {
                      channel: template.channel,
                      accountId: '',
                      ...(template.matchRules || {}),
                    },
                  });
                }
                writeConfig(latestConfig);
              } catch (bindErr) {
                warnings.push(`${resolvedName}: Channel 绑定配置异常: ${String(bindErr)}`);
              }
            }

            sendImportProgress({
              current: i + 1, total, agentName: resolvedName,
              step: 5, stepName: '配置 Channel 绑定', status: 'success',
            });

            // 将导入的 Agent 分配到目标分组
            mappings[createdAgentId] = targetGroup.id;
            successCount++;
          } catch (agentErr) {
            // 单个 Agent 导入失败，执行回滚并记录
            failedAgents.push({ name: agentName, error: String(agentErr) });

            if (createdAgentId) {
              sendImportProgress({
                current: i + 1, total, agentName,
                step: 0, stepName: '回滚清理', status: 'rolling-back',
              });
              await rollbackAgent(createdAgentId);
              sendImportProgress({
                current: i + 1, total, agentName,
                step: 0, stepName: '回滚清理', status: 'rolled-back',
              });
            }
          }
        }

        // 5. 持久化映射关系
        store.set(MAPPINGS_KEY, mappings);

        return {
          success: true,
          summary: {
            successCount,
            failedAgents,
            warnings,
            group: { id: targetGroup.id, name: targetGroup.name, merged },
          },
        };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },
  );

} // end of setupAgentGroupsIPC
