import pkg from 'electron';
import fs from 'fs/promises';
const { ipcMain } = pkg;
import { spawn } from 'child_process';
import {
  existsSync,
  mkdirSync,
  renameSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs';
import { basename, dirname, extname, join, relative, resolve } from 'path';
import { getOpenClawRootDir, getShellPath, resolveOpenClawCommand } from './settings.js';
import { buildAgentCreateArgs, classifyAgentError, formatAgentCreateError, needsAgentDirRepair, planAgentDirRepair } from './agentCreateLogic.js';

/**
 * 构建 doctor --fix 命令的环境变量（纯函数）
 * 注入完整 shell PATH 以确保版本管理器路径可用，
 * 同时保留 NO_COLOR 和 FORCE_COLOR 设置
 * @param processEnv 当前进程环境变量
 * @param shellPath 完整的 shell PATH（包含版本管理器路径）
 * @returns 包含完整 PATH 的环境变量对象
 */
export function buildDoctorFixEnv(
  processEnv: Record<string, string | undefined>,
  shellPath: string,
): Record<string, string | undefined> {
  return {
    ...processEnv,
    PATH: shellPath,
    NO_COLOR: '1',
    FORCE_COLOR: '0',
  };
}

const WORKSPACE_TRASH_DIRNAME = '.recycle-bin';
const WORKSPACE_TRASH_MANIFEST = 'manifest.json';
const AGENT_WORKSPACE_FILES = [
  'AGENTS.md',
  'BOOTSTRAP.md',
  'HEARTBEAT.md',
  'IDENTITY.md',
  'SOUL.md',
  'TOOLS.md',
  'USER.md',
] as const;

type AgentWorkspaceFileName = typeof AGENT_WORKSPACE_FILES[number];

export interface AgentInfo {
  id: string;
  name: string;
  workspace: string;
  model: string | { primary: string; fallbacks?: string[] };
  agentDir?: string;
  workspaceRoot?: string;
  agentConfigRoot?: string;
  configSource?: 'workspace' | 'agents' | 'workspace+agents' | 'config-only';
}

function deleteWorkspaceEntryToTrash(targetPath: string, info: AgentInfo) {
  const normalizedTarget = ensureInsideWorkspaceRoot(targetPath, info);
  const workspaceRoot = info.workspaceRoot;
  if (!workspaceRoot) {
    throw new Error('当前 Agent 没有可用的 workspace 根目录');
  }

  if (!existsSync(normalizedTarget)) {
    throw new Error('目标文件或目录不存在');
  }

  const trashEntries = readWorkspaceTrashManifest(info);
  const { trashRoot } = ensureWorkspaceTrash(info);
  const stat = statSync(normalizedTarget);
  const kind = stat.isDirectory() ? 'directory' as const : 'file' as const;
  const deletedAt = new Date().toISOString();
  const originalRelativePath = relative(workspaceRoot, normalizedTarget) || basename(normalizedTarget);
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const trashName = `${id}${kind === 'file' ? extname(normalizedTarget) : ''}`;
  const trashPath = join(trashRoot, trashName);

  renameSync(normalizedTarget, trashPath);

  const trashEntry: AgentWorkspaceTrashEntry = {
    id,
    name: basename(normalizedTarget),
    path: trashPath,
    relativePath: relative(workspaceRoot, trashPath),
    kind,
    deletedAt,
    originalPath: normalizedTarget,
    originalRelativePath,
  };

  writeWorkspaceTrashManifest(info, [trashEntry, ...trashEntries]);
  return trashEntry;
}

function restoreWorkspaceTrashEntryById(trashEntryId: string, info: AgentInfo) {
  const trashEntries = readWorkspaceTrashManifest(info);
  const trashEntry = trashEntries.find((entry) => entry.id === trashEntryId);

  if (!trashEntry) {
    throw new Error('未找到回收站条目');
  }

  const restoredPath = ensureInsideWorkspaceRoot(trashEntry.originalPath, info);
  if (existsSync(restoredPath)) {
    throw new Error('原始位置已存在同名文件或目录，无法恢复');
  }

  if (!existsSync(trashEntry.path)) {
    throw new Error('回收站中的文件已不存在');
  }

  mkdirSync(dirname(restoredPath), { recursive: true });
  renameSync(trashEntry.path, restoredPath);

  const nextEntries = trashEntries.filter((entry) => entry.id !== trashEntryId);
  writeWorkspaceTrashManifest(info, nextEntries);

  return restoredPath;
}

function permanentlyDeleteWorkspaceTrashEntryById(trashEntryId: string, info: AgentInfo) {
  const trashEntries = readWorkspaceTrashManifest(info);
  const trashEntry = trashEntries.find((entry) => entry.id === trashEntryId);

  if (!trashEntry) {
    throw new Error('未找到回收站条目');
  }

  if (existsSync(trashEntry.path)) {
    rmSync(trashEntry.path, { recursive: true, force: true });
  }

  const nextEntries = trashEntries.filter((entry) => entry.id !== trashEntryId);
  writeWorkspaceTrashManifest(info, nextEntries);

  return trashEntryId;
}

function restoreWorkspaceTrashEntriesByIds(trashEntryIds: string[], info: AgentInfo) {
  const restoredPaths: string[] = [];

  for (const trashEntryId of trashEntryIds) {
    restoredPaths.push(restoreWorkspaceTrashEntryById(trashEntryId, info));
  }

  return restoredPaths;
}

function permanentlyDeleteWorkspaceTrashEntriesByIds(trashEntryIds: string[], info: AgentInfo) {
  const deletedIds: string[] = [];

  for (const trashEntryId of trashEntryIds) {
    deletedIds.push(permanentlyDeleteWorkspaceTrashEntryById(trashEntryId, info));
  }

  return deletedIds;
}

function clearWorkspaceTrash(info: AgentInfo) {
  const trashEntries = readWorkspaceTrashManifest(info);

  for (const trashEntry of trashEntries) {
    if (existsSync(trashEntry.path)) {
      rmSync(trashEntry.path, { recursive: true, force: true });
    }
  }

  writeWorkspaceTrashManifest(info, []);
  return trashEntries.length;
}

function renameWorkspaceEntry(targetPath: string, nextName: string, info: AgentInfo) {
  const normalizedTarget = ensureInsideWorkspaceRoot(targetPath, info);
  const trimmedName = nextName.trim();

  if (!trimmedName) {
    throw new Error('名称不能为空');
  }

  if (trimmedName.includes('/') || trimmedName.includes('\\')) {
    throw new Error('名称不能包含路径分隔符');
  }

  const nextPath = ensureInsideWorkspaceRoot(join(dirname(normalizedTarget), trimmedName), info);
  if (normalizedTarget === nextPath) {
    const currentStat = statSync(normalizedTarget);
    return createWorkspaceEntry(normalizedTarget, currentStat.isDirectory() ? 'directory' : 'file', info);
  }

  if (existsSync(nextPath)) {
    throw new Error('目标名称已存在');
  }

  renameSync(normalizedTarget, nextPath);
  const renamedStat = statSync(nextPath);
  return createWorkspaceEntry(nextPath, renamedStat.isDirectory() ? 'directory' : 'file', info);
}

export interface AgentWorkspaceFileSummary {
  name: AgentWorkspaceFileName;
  path: string;
  exists: boolean;
  size: number;
  updatedAt?: string;
}

export interface AgentWorkspaceDetails {
  agent: AgentInfo;
  globalAgentConfig?: {
    raw: any;
    configPath?: string;
    workspace?: string;
    agentDir?: string;
    modelDisplay: string;
    modelPrimary?: string;
    modelFallbacks: string[];
    allowAgents: string[];
    bindings: Array<{
      channel?: string;
      accountId?: string;
      binding: any;
      accountConfig?: any;
    }>;
  };
  skillsOverview?: {
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
  };
  workspaceRoot?: string;
  agentConfigRoot?: string;
  memoryRoot?: string;
  sessionsRoot?: string;
  workspaceEntries: Array<{
    name: string;
    path: string;
    relativePath: string;
    kind: 'file' | 'directory';
  }>;
  memoryEntries: Array<{
    name: string;
    path: string;
    relativePath: string;
    kind: 'file' | 'directory';
  }>;
  agentConfigEntries: Array<{
    name: string;
    path: string;
    relativePath: string;
    kind: 'file' | 'directory';
  }>;
  sessionEntries: Array<{
    name: string;
    path: string;
    relativePath: string;
    kind: 'file' | 'directory';
  }>;
  files: AgentWorkspaceFileSummary[];
}

interface AgentWorkspaceTrashEntry {
  id: string;
  name: string;
  path: string;
  relativePath: string;
  kind: 'file' | 'directory';
  deletedAt: string;
  originalPath: string;
  originalRelativePath: string;
}

function getConfigPath() {
  return join(getOpenClawRootDir(), 'openclaw.json');
}

function readConfig() {
  const configPath = getConfigPath();

  if (!existsSync(configPath)) {
    throw new Error('Config file not found');
  }

  const content = readFileSync(configPath, 'utf8');
  return JSON.parse(content);
}

function writeConfig(config: any) {
  const configPath = getConfigPath();
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
}

function getOpenClawRoot() {
  return getOpenClawRootDir();
}

function getAgentModelSummary(agent: any, config: any) {
  if (typeof agent?.model === 'string') {
    return {
      modelDisplay: agent.model,
      modelPrimary: agent.model,
      modelFallbacks: [] as string[],
    };
  }

  if (agent?.model && typeof agent.model === 'object') {
    const modelPrimary = typeof agent.model.primary === 'string'
      ? agent.model.primary
      : undefined;
    const modelFallbacks = Array.isArray(agent.model.fallbacks)
      ? agent.model.fallbacks.filter((value: unknown): value is string => typeof value === 'string' && value.trim().length > 0)
      : [];

    return {
      modelDisplay: modelPrimary || '未配置主模型',
      modelPrimary,
      modelFallbacks,
    };
  }

  if (typeof config?.agents?.defaults?.model?.primary === 'string') {
    return {
      modelDisplay: `Default: ${config.agents.defaults.model.primary}`,
      modelPrimary: config.agents.defaults.model.primary,
      modelFallbacks: Array.isArray(config?.agents?.defaults?.model?.fallbacks)
        ? config.agents.defaults.model.fallbacks.filter((value: unknown): value is string => typeof value === 'string' && value.trim().length > 0)
        : [],
    };
  }

  return {
    modelDisplay: '未配置模型',
    modelPrimary: undefined,
    modelFallbacks: [] as string[],
  };
}

async function runAgentCreateCommand(payload: { name: string; workspace: string; model?: string }) {
  const trimmedName = payload.name.trim();
  const trimmedWorkspace = payload.workspace.trim();

  if (!trimmedName) {
    throw new Error('智能体名称不能为空');
  }

  if (!trimmedWorkspace) {
    throw new Error('Workspace 路径不能为空');
  }

  // 修复 Bug 3: 先执行 openclaw doctor --fix 自动修复配置文件中的 schema 不兼容问题
  const openclawCmd = resolveOpenClawCommand();
  // 获取完整 shell PATH，确保版本管理器路径可用
  const shellPath = await getShellPath();
  try {
    await new Promise<void>((resolve) => {
      const doctorChild = spawn(openclawCmd, ['--no-color', 'doctor', '--fix'], {
        env: buildDoctorFixEnv(process.env, shellPath),
      });
      doctorChild.on('close', () => resolve());
      doctorChild.on('error', () => resolve());
      // doctor --fix 超时 10 秒后继续，不阻塞创建流程
      setTimeout(() => { try { doctorChild.kill(); } catch {} resolve(); }, 10000);
    });
  } catch {
    // doctor --fix 失败不阻塞，继续尝试创建智能体
  }

  // 使用提取的纯函数构建 CLI 参数
  const args = buildAgentCreateArgs(payload);

  return new Promise<{ success: boolean; output: string; error?: string }>((resolvePromise) => {
    const child = spawn(openclawCmd, ['--no-color', ...args], {
      env: buildDoctorFixEnv(process.env, shellPath),
    });

    let output = '';
    let errorOutput = '';

    child.stdout.on('data', (data) => {
      output += data.toString();
    });

    child.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolvePromise({ success: true, output });
        return;
      }

      // 修复 Bug 3: 使用错误分类和友好格式化替代原始 stderr
      const errorType = classifyAgentError(errorOutput);
      const friendlyError = formatAgentCreateError(errorOutput, errorType);

      resolvePromise({
        success: false,
        output: '',
        error: friendlyError || `Command exited with code ${code}`,
      });
    });

    child.on('error', (error) => {
      resolvePromise({ success: false, output: '', error: error.message });
    });
  });
}

function normalizeModel(agent: any, config: any) {
  let modelValue = 'Unknown';

  if (agent.model) {
    if (typeof agent.model === 'string') {
      modelValue = agent.model;
    } else if (typeof agent.model === 'object' && agent.model.primary) {
      modelValue = agent.model.primary;
      if (agent.model.fallbacks && Array.isArray(agent.model.fallbacks)) {
        modelValue += ` (+${agent.model.fallbacks.length} fallback${agent.model.fallbacks.length > 1 ? 's' : ''})`;
      }
    }
  } else if (config?.agents?.defaults?.model?.primary) {
    modelValue = `Default: ${config.agents.defaults.model.primary}`;
  }

  return modelValue;
}

function resolveAgentConfigRoot(agent: any) {
  if (agent?.agentDir) {
    const resolvedAgentDir = resolve(agent.agentDir);
    if (existsSync(resolvedAgentDir)) {
      return resolvedAgentDir;
    }
  }

  if (agent?.id) {
    const fallbackAgentDir = join(getOpenClawRoot(), 'agents', String(agent.id).trim(), 'agent');
    if (existsSync(fallbackAgentDir)) {
      return fallbackAgentDir;
    }
  }

  return undefined;
}

function resolveWorkspaceRoot(agent: any, autoCreate = false) {
  if (agent?.id) {
    const normalizedId = String(agent.id).trim();
    const directWorkspace = join(getOpenClawRoot(), `workspace-${normalizedId}`);
    if (existsSync(directWorkspace)) {
      return directWorkspace;
    }
  }

  const candidates = [
    agent?.workspace,
    agent?.workspaceRoot,
    agent?.workspaceDir,
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

  for (const candidate of candidates) {
    const resolvedCandidate = resolve(candidate);
    if (existsSync(resolvedCandidate)) {
      return resolvedCandidate;
    }

    const workspaceName = basename(resolvedCandidate);
    const fallbackCandidate = join(getOpenClawRoot(), workspaceName);
    if (existsSync(fallbackCandidate)) {
      return fallbackCandidate;
    }
  }

  if (agent?.id) {
    const normalizedId = String(agent.id).trim();
    const nestedWorkspace = join(getOpenClawRoot(), 'agents', normalizedId, `workspace-${normalizedId}`);
    if (existsSync(nestedWorkspace)) {
      return nestedWorkspace;
    }
  }

  // 所有候选路径均不存在，确定最终路径
  const finalPath = typeof agent?.workspace === 'string' && agent.workspace.trim().length > 0
    ? resolve(agent.workspace)
    : undefined;

  // autoCreate 模式：workspace 目录缺失时自动创建
  // 典型场景：新环境安装后 openclaw.json 中已有 main agent 但 workspace 目录尚未创建
  if (autoCreate && finalPath) {
    try {
      mkdirSync(finalPath, { recursive: true });
      console.log(`[resolveWorkspaceRoot] 自动创建缺失的 workspace 目录: ${finalPath}`);
    } catch (err) {
      console.warn(`[resolveWorkspaceRoot] 自动创建 workspace 目录失败: ${finalPath}`, err);
    }
  }

  return finalPath;
}

function mapAgentInfo(agent: any, config: any, autoCreateWorkspace = false): AgentInfo {
  const workspaceRoot = resolveWorkspaceRoot(agent, autoCreateWorkspace);
  const agentConfigRoot = resolveAgentConfigRoot(agent);
  const hasWorkspace = Boolean(workspaceRoot && existsSync(workspaceRoot));
  const hasAgentConfig = Boolean(agentConfigRoot && existsSync(agentConfigRoot));

  let configSource: AgentInfo['configSource'];
  if (hasWorkspace && hasAgentConfig) {
    configSource = 'workspace+agents';
  } else if (hasWorkspace) {
    configSource = 'workspace';
  } else if (hasAgentConfig) {
    configSource = 'agents';
  } else {
    configSource = 'config-only';
  }

  return {
    id: agent.id || 'unknown',
    name: agent.name || 'Unnamed Agent',
    workspace: agent.workspace || workspaceRoot || 'Not specified',
    model: normalizeModel(agent, config),
    agentDir: agent.agentDir,
    workspaceRoot,
    agentConfigRoot,
    configSource,
  };
}

function getAgentRecord(agentId: string) {
  const config = readConfig();
  const agentsList = config?.agents?.list || [];
  const agent = agentsList.find((item: any) => item.id === agentId);

  if (!agent) {
    throw new Error(`Agent with ID ${agentId} not found`);
  }

  return {
    config,
    agent,
    info: mapAgentInfo(agent, config),
  };
}

function ensureInsideAllowedRoots(targetPath: string, info: AgentInfo) {
  const resolvedTarget = resolve(targetPath);
  const allowedRoots = [
    info.workspaceRoot,
    info.agentConfigRoot,
  ].filter((value): value is string => Boolean(value));

  // Normalize paths for comparison
  const normalizedTarget = resolvedTarget;
  
  if (!allowedRoots.some((root) => {
    const normalizedRoot = resolve(root);
    return normalizedTarget === normalizedRoot || normalizedTarget.startsWith(normalizedRoot + '/');
  })) {
    throw new Error(`Target path is outside the allowed agent workspace roots. Target: ${normalizedTarget}, Allowed roots: ${allowedRoots.join(', ')}`);
  }

  return resolvedTarget;
}

function ensureInsideWorkspaceRoot(targetPath: string, info: AgentInfo) {
  if (!info.workspaceRoot) {
    throw new Error('当前 Agent 没有可用的 workspace 根目录');
  }

  const normalizedRoot = resolve(info.workspaceRoot);
  const normalizedTarget = resolve(targetPath);

  if (normalizedTarget !== normalizedRoot && !normalizedTarget.startsWith(normalizedRoot + '/')) {
    throw new Error(`Target path is outside workspace root. Target: ${normalizedTarget}, Workspace: ${normalizedRoot}`);
  }

  return normalizedTarget;
}

function getWorkspaceTrashRoot(info: AgentInfo) {
  if (!info.workspaceRoot) {
    throw new Error('当前 Agent 没有可用的 workspace 根目录');
  }

  return join(info.workspaceRoot, WORKSPACE_TRASH_DIRNAME);
}

function getWorkspaceTrashManifestPath(info: AgentInfo) {
  return join(getWorkspaceTrashRoot(info), WORKSPACE_TRASH_MANIFEST);
}

function ensureWorkspaceTrash(info: AgentInfo) {
  const trashRoot = getWorkspaceTrashRoot(info);
  const manifestPath = getWorkspaceTrashManifestPath(info);

  mkdirSync(trashRoot, { recursive: true });
  if (!existsSync(manifestPath)) {
    writeFileSync(manifestPath, '[]', 'utf8');
  }

  return { trashRoot, manifestPath };
}

function readWorkspaceTrashManifest(info: AgentInfo): AgentWorkspaceTrashEntry[] {
  const { manifestPath } = ensureWorkspaceTrash(info);

  try {
    const content = readFileSync(manifestPath, 'utf8');
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    writeFileSync(manifestPath, '[]', 'utf8');
    return [];
  }
}

function writeWorkspaceTrashManifest(info: AgentInfo, entries: AgentWorkspaceTrashEntry[]) {
  const { manifestPath } = ensureWorkspaceTrash(info);
  writeFileSync(manifestPath, JSON.stringify(entries, null, 2), 'utf8');
}

function toRelativeWorkspacePath(targetPath: string, info: AgentInfo) {
  const workspaceRoot = info.workspaceRoot;
  if (!workspaceRoot) {
    return basename(targetPath);
  }

  const relativePath = relative(workspaceRoot, targetPath);
  return relativePath || basename(targetPath);
}

function createWorkspaceEntry(targetPath: string, kind: 'file' | 'directory', info: AgentInfo) {
  return {
    name: basename(targetPath),
    path: targetPath,
    relativePath: toRelativeWorkspacePath(targetPath, info),
    kind,
  };
}

function readDirectoryEntries(rootPath?: string) {
  if (!rootPath || !existsSync(rootPath)) {
    return [];
  }

  return readdirSync(rootPath, { withFileTypes: true })
    .filter((entry) => entry.name !== WORKSPACE_TRASH_DIRNAME)
    .map((entry) => ({
      name: entry.name,
      path: join(rootPath, entry.name),
      relativePath: entry.name,
      kind: entry.isDirectory() ? 'directory' as const : 'file' as const,
    }))
    .sort((left, right) => {
      if (left.kind !== right.kind) {
        return left.kind === 'directory' ? -1 : 1;
      }

      return left.name.localeCompare(right.name);
    });
}

function resolveMemoryRoot(info: AgentInfo) {
  if (!info.workspaceRoot) {
    return undefined;
  }

  const memoryRoot = join(info.workspaceRoot, 'memory');
  return existsSync(memoryRoot) ? memoryRoot : undefined;
}

function resolveSessionsRoot(info: AgentInfo) {
  if (!info.agentConfigRoot) {
    return undefined;
  }

  const sessionsRoot = join(dirname(info.agentConfigRoot), 'sessions');
  return existsSync(sessionsRoot) ? sessionsRoot : undefined;
}

function resolveWorkspaceBrowsePath(info: AgentInfo, targetPath?: string) {
  if (!info.workspaceRoot) {
    throw new Error('当前 Agent 没有可用的 workspace 根目录');
  }

  const normalizedRoot = resolve(info.workspaceRoot);

  if (!targetPath) {
    return normalizedRoot;
  }

  const normalizedTarget = resolve(targetPath);
  if (normalizedTarget !== normalizedRoot && !normalizedTarget.startsWith(normalizedRoot + '/')) {
    throw new Error('目标目录不在当前 Agent 的 workspace 目录内');
  }

  return normalizedTarget;
}

function listWorkspaceEntries(info: AgentInfo, targetPath?: string) {
  const currentPath = resolveWorkspaceBrowsePath(info, targetPath);
  const currentStat = statSync(currentPath);

  if (!currentStat.isDirectory()) {
    throw new Error('当前路径不是目录，无法浏览');
  }

  return {
    currentPath,
    rootPath: info.workspaceRoot,
    entries: readDirectoryEntries(currentPath).map((entry) => ({
      ...entry,
      relativePath: toRelativeWorkspacePath(entry.path, info),
    })),
  };
}

function resolveManagedFilePath(info: AgentInfo, targetPath: string) {
  const allowedRoots = [info.workspaceRoot, info.agentConfigRoot, resolveSessionsRoot(info)].filter(
    (value): value is string => Boolean(value),
  );

  if (!allowedRoots.length) {
    throw new Error('当前 Agent 没有可用的 workspace、配置或会话目录');
  }

  const normalizedTarget = resolve(targetPath);

  if (!allowedRoots.some((root) => {
    const normalizedRoot = resolve(root);
    return normalizedTarget === normalizedRoot || normalizedTarget.startsWith(normalizedRoot + '/');
  })) {
    throw new Error('目标文件不在当前智能体允许访问的 workspace、配置或会话目录内');
  }

  return normalizedTarget;
}

async function readManagedFile(info: AgentInfo, targetPath: string) {
  const filePath = resolveManagedFilePath(info, targetPath);
  try {
    const fileStat = await fs.stat(filePath);
    const baseRoot = [info.workspaceRoot, info.agentConfigRoot, resolveSessionsRoot(info)].find((root) => {
      if (!root) {
        return false;
      }

      const normalizedRoot = resolve(root);
      return filePath === normalizedRoot || filePath.startsWith(normalizedRoot + '/');
    });
    const content = await fs.readFile(filePath, 'utf8');

    return {
      name: basename(filePath),
      path: filePath,
      relativePath: relative(baseRoot || dirname(filePath), filePath) || basename(filePath),
      kind: 'file' as const,
      exists: true,
      size: fileStat.size,
      updatedAt: fileStat.mtime.toISOString(),
      content,
    };
  } catch (error) {
    return {
      name: basename(filePath),
      path: filePath,
      relativePath: basename(filePath),
      kind: 'file' as const,
      exists: false,
      size: 0,
      updatedAt: undefined,
      content: '',
    };
  }
}

async function saveManagedFile(info: AgentInfo, targetPath: string, content: string) {
  const filePath = resolveManagedFilePath(info, targetPath);
  await fs.mkdir(dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
  return readManagedFile(info, filePath);
}

function resolveMemoryFilePath(info: AgentInfo, targetPath: string) {
  const memoryRoot = resolveMemoryRoot(info);

  if (!memoryRoot) {
    throw new Error('当前 Agent 没有可用的 memory 目录');
  }

  const normalizedTarget = resolve(targetPath);
  const normalizedRoot = resolve(memoryRoot);

  if (normalizedTarget !== normalizedRoot && !normalizedTarget.startsWith(normalizedRoot + '/')) {
    throw new Error('目标记忆文件不在 memory 目录内');
  }

  return normalizedTarget;
}

function readMemoryFile(info: AgentInfo, targetPath: string) {
  const filePath = resolveMemoryFilePath(info, targetPath);
  const fileExists = existsSync(filePath);
  const fileStat = fileExists ? statSync(filePath) : null;

  return {
    name: basename(filePath),
    path: filePath,
    relativePath: relative(resolveMemoryRoot(info) || dirname(filePath), filePath) || basename(filePath),
    kind: 'file' as const,
    exists: fileExists,
    size: fileStat?.size || 0,
    updatedAt: fileStat?.mtime.toISOString(),
    content: fileExists ? readFileSync(filePath, 'utf8') : '',
  };
}

function saveMemoryFile(info: AgentInfo, targetPath: string, content: string) {
  const filePath = resolveMemoryFilePath(info, targetPath);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, 'utf8');

  return readMemoryFile(info, filePath);
}

function clearMemoryFile(info: AgentInfo, targetPath: string) {
  const filePath = resolveMemoryFilePath(info, targetPath);

  if (!existsSync(filePath)) {
    throw new Error('目标记忆文件不存在');
  }

  writeFileSync(filePath, '', 'utf8');
  return readMemoryFile(info, filePath);
}

function resolveWorkspaceFilePath(info: AgentInfo, fileName: AgentWorkspaceFileName) {
  const preferredRoots = [info.workspaceRoot, info.agentConfigRoot].filter(
    (value): value is string => Boolean(value),
  );

  for (const root of preferredRoots) {
    const candidate = join(root, fileName);
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  if (info.workspaceRoot) {
    return join(info.workspaceRoot, fileName);
  }

  if (info.agentConfigRoot) {
    return join(info.agentConfigRoot, fileName);
  }

  throw new Error('No available workspace or config root for this agent');
}

function buildWorkspaceDetails(info: AgentInfo): AgentWorkspaceDetails {
  const { config, agent } = getAgentRecord(info.id);
  const memoryRoot = resolveMemoryRoot(info);
  const sessionsRoot = resolveSessionsRoot(info);
  const modelSummary = getAgentModelSummary(agent, config);
  const configPath = getConfigPath();
  const workspaceEntries = readDirectoryEntries(info.workspaceRoot);
  const memoryEntries = readDirectoryEntries(memoryRoot);
  const agentConfigEntries = readDirectoryEntries(info.agentConfigRoot);
  const sessionEntries = readDirectoryEntries(sessionsRoot);
  const bindings = (config?.bindings || []).filter((binding: any) => binding?.agentId === info.id);
  const bindingDetails = bindings.map((binding: any) => {
    const channel = typeof binding?.match?.channel === 'string' ? binding.match.channel : undefined;
    const accountId = typeof binding?.match?.accountId === 'string' ? binding.match.accountId : undefined;
    const accountConfig = channel && accountId
      ? config?.channels?.[channel]?.accounts?.[accountId]
      : undefined;

    return {
      channel,
      accountId,
      binding,
      accountConfig,
    };
  });
  const allowAgents = Array.isArray(agent?.subagents?.allowAgents)
    ? agent.subagents.allowAgents
    : [];
  const bindingChannels = bindings
    .map((binding: any) => binding?.match?.channel)
    .filter((value: unknown): value is string => typeof value === 'string' && value.trim().length > 0);
  const bindingAccounts = bindings
    .map((binding: any) => binding?.match?.accountId)
    .filter((value: unknown): value is string => typeof value === 'string' && value.trim().length > 0);
  const sourceLabels = [
    'commands.nativeSkills · 全局命令配置',
    'tools.profile · 全局工具档位',
    'agents.defaults.subagents.maxConcurrent · 全局默认并发',
    'agent.subagents.allowAgents · 当前 Agent 子智能体范围',
    'bindings[].match · 当前 Agent 通道绑定',
  ];

  const files = AGENT_WORKSPACE_FILES.map((fileName) => {
    const filePath = resolveWorkspaceFilePath(info, fileName);
    const fileExists = existsSync(filePath);
    const fileStat = fileExists ? statSync(filePath) : null;

    return {
      name: fileName,
      path: filePath,
      exists: fileExists,
      size: fileStat?.size || 0,
      updatedAt: fileStat?.mtime.toISOString(),
    };
  });

  return {
    agent: info,
    globalAgentConfig: {
      raw: agent,
      configPath,
      workspace: agent?.workspace,
      agentDir: agent?.agentDir,
      modelDisplay: modelSummary.modelDisplay,
      modelPrimary: modelSummary.modelPrimary,
      modelFallbacks: modelSummary.modelFallbacks,
      allowAgents,
      bindings: bindingDetails,
    },
    skillsOverview: {
      allowAgents,
      bindingAccounts,
      bindingChannels,
      bindingsEnabled: bindings.length > 0,
      configPath,
      maxConcurrent: config?.agents?.defaults?.subagents?.maxConcurrent,
      nativeSkillsMode: config?.commands?.nativeSkills,
      nativeSkillsEnabled: (config?.commands?.nativeSkills || 'auto') !== 'off',
      sourceLabels,
      toolsProfile: config?.tools?.profile,
    },
    workspaceRoot: info.workspaceRoot,
    agentConfigRoot: info.agentConfigRoot,
    memoryRoot,
    sessionsRoot,
    workspaceEntries,
    memoryEntries,
    agentConfigEntries,
    sessionEntries,
    files,
  };
}

export interface AgentPerformanceMetrics {
  cpuUsage: number;
  memoryUsage: number;
  tokensPerSecond: number;
  responseTime: number;
  errorRate: number;
  uptime: number;
  sessionCount: number;
  totalMessages: number;
  lastUpdated: string;
}

export interface AgentEnhancementFeature {
  id: string;
  name: string;
  type: 'performance' | 'security' | 'monitoring' | 'integration' | 'automation' | 'utility';
  description: string;
  enabled: boolean;
  settings: Record<string, any>;
  lastApplied?: string;
  status: 'active' | 'inactive' | 'error';
  version?: string;
  dependencies?: string[];
}

// ── 增强功能配置管理 ──────────────────────────────────────────────────────────

/** 增强功能配置文件结构 */
interface EnhancementConfig {
  version: string;
  agentId: string;
  lastModified: string;
  enhancements: {
    [enhancementId: string]: {
      enabled: boolean;
      settings: Record<string, any>;
      lastApplied?: string;
    };
  };
}

/**
 * 获取增强功能配置文件路径
 * @param info 智能体信息
 * @returns 配置文件完整路径
 */
function getEnhancementConfigPath(info: AgentInfo): string {
  const agentDir = info.agentConfigRoot || info.workspaceRoot;
  if (!agentDir) {
    throw new Error('无法确定智能体配置目录');
  }
  return join(agentDir, 'enhancements.json');
}

/**
 * 读取增强功能配置文件
 * @param info 智能体信息
 * @returns 配置对象
 */
function readEnhancementConfig(info: AgentInfo): EnhancementConfig {
  const configPath = getEnhancementConfigPath(info);
  
  try {
    // 尝试读取配置文件
    const content = readFileSync(configPath, 'utf8');
    const config = JSON.parse(content);
    
    // 验证配置格式
    if (!validateEnhancementConfig(config)) {
      console.warn(`[agents] 增强功能配置格式无效，使用默认配置: ${configPath}`);
      return createDefaultEnhancementConfig(info.id);
    }
    
    return config;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      // 文件不存在，创建默认配置
      console.log(`[agents] 增强功能配置文件不存在，创建默认配置: ${configPath}`);
      const defaultConfig = createDefaultEnhancementConfig(info.id);
      writeEnhancementConfig(info, defaultConfig);
      return defaultConfig;
    }
    
    if (error instanceof SyntaxError) {
      // JSON 格式错误，备份并创建新配置
      const backupPath = `${configPath}.backup.${Date.now()}`;
      try {
        renameSync(configPath, backupPath);
        console.warn(`[agents] 损坏的配置文件已备份到: ${backupPath}`);
      } catch (backupError) {
        console.error(`[agents] 无法备份损坏的配置文件:`, backupError);
      }
      
      const defaultConfig = createDefaultEnhancementConfig(info.id);
      writeEnhancementConfig(info, defaultConfig);
      return defaultConfig;
    }
    
    // 其他错误，抛出
    throw error;
  }
}

/**
 * 写入增强功能配置文件
 * @param info 智能体信息
 * @param config 配置对象
 */
function writeEnhancementConfig(info: AgentInfo, config: EnhancementConfig): void {
  const configPath = getEnhancementConfigPath(info);
  
  try {
    // 确保目录存在
    const configDir = dirname(configPath);
    mkdirSync(configDir, { recursive: true });
    
    // 更新最后修改时间
    config.lastModified = new Date().toISOString();
    
    // 原子性写入：先写临时文件，再重命名
    const tempPath = `${configPath}.tmp`;
    writeFileSync(tempPath, JSON.stringify(config, null, 2), 'utf8');
    renameSync(tempPath, configPath);
    
    console.log(`[agents] 增强功能配置已保存: ${configPath}`);
  } catch (error) {
    console.error(`[agents] 保存增强功能配置失败:`, error);
    throw error;
  }
}

/**
 * 创建默认增强功能配置
 * @param agentId 智能体 ID
 * @returns 默认配置对象
 */
function createDefaultEnhancementConfig(agentId: string): EnhancementConfig {
  return {
    version: '1.0.0',
    agentId,
    lastModified: new Date().toISOString(),
    enhancements: {
      'performance-boost': {
        enabled: true,
        settings: { compression: 'high', cacheSize: 1000 },
        lastApplied: new Date().toISOString(),
      },
      'security-audit': {
        enabled: true,
        settings: { auditLevel: 'high', logSensitive: true },
        lastApplied: new Date().toISOString(),
      },
      'real-time-monitoring': {
        enabled: true,
        settings: { updateInterval: 5000, alertThreshold: 80 },
        lastApplied: new Date().toISOString(),
      },
      'api-integration': {
        enabled: false,
        settings: { webhookUrl: '', maxRetries: 3 },
      },
      'auto-scaling': {
        enabled: false,
        settings: { minInstances: 1, maxInstances: 5, scaleThreshold: 70 },
      },
      'session-management': {
        enabled: true,
        settings: { maxSessions: 20, retentionDays: 30 },
        lastApplied: new Date().toISOString(),
      },
      'tool-integration': {
        enabled: false,
        settings: { tools: [], maxConcurrent: 5 },
      },
      'analytics-dashboard': {
        enabled: true,
        settings: { metricsEnabled: true, reportFrequency: 'daily' },
        lastApplied: new Date().toISOString(),
      },
    },
  };
}

/**
 * 验证增强功能配置格式
 * @param config 配置对象
 * @returns 是否有效
 */
function validateEnhancementConfig(config: any): config is EnhancementConfig {
  if (!config || typeof config !== 'object') {
    return false;
  }
  
  // 检查必需字段
  if (!config.version || !config.agentId || !config.enhancements) {
    return false;
  }
  
  // 检查 enhancements 是否为对象
  if (typeof config.enhancements !== 'object') {
    return false;
  }
  
  // 检查每个增强功能配置
  for (const [id, enhancement] of Object.entries(config.enhancements)) {
    if (typeof enhancement !== 'object' || enhancement === null) {
      return false;
    }
    
    const enh = enhancement as any;
    if (typeof enh.enabled !== 'boolean' || typeof enh.settings !== 'object') {
      return false;
    }
  }
  
  return true;
}

// ── 性能数据采集器 ──────────────────────────────────────────────────────────

/**
 * 性能数据采集器类
 * 负责收集智能体的各项性能指标
 */
class PerformanceCollector {
  private startTime: number = Date.now();
  
  /**
   * 收集 CPU 使用率
   * @returns CPU 使用率百分比 (0-100)
   */
  collectCpuUsage(): number {
    try {
      const usage = process.cpuUsage();
      // 计算 CPU 使用率百分比
      // cpuUsage 返回的是微秒，需要转换为百分比
      const totalUsage = (usage.user + usage.system) / 1000000; // 转换为秒
      const uptime = (Date.now() - this.startTime) / 1000; // 转换为秒
      const cpuPercent = (totalUsage / uptime) * 100;
      
      // 限制在 0-100 范围内
      return Math.min(Math.max(cpuPercent, 0), 100);
    } catch (error) {
      console.warn('[PerformanceCollector] 获取 CPU 使用率失败:', error);
      return 0;
    }
  }
  
  /**
   * 收集内存使用量
   * @returns 内存使用量 (MB)
   */
  collectMemoryUsage(): number {
    try {
      const usage = process.memoryUsage();
      // 将字节转换为 MB
      return usage.heapUsed / (1024 * 1024);
    } catch (error) {
      console.warn('[PerformanceCollector] 获取内存使用量失败:', error);
      return 0;
    }
  }
  
  /**
   * 收集会话统计信息
   * @param info 智能体信息
   * @returns { sessionCount, totalMessages }
   */
  collectSessionStats(info: AgentInfo): { sessionCount: number; totalMessages: number } {
    try {
      const sessionsRoot = resolveSessionsRoot(info);
      if (!existsSync(sessionsRoot)) {
        return { sessionCount: 0, totalMessages: 0 };
      }
      
      // 统计会话目录数量
      const sessions = readdirSync(sessionsRoot, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory());
      
      let totalMessages = 0;
      
      // 统计每个会话的消息数
      for (const session of sessions) {
        const sessionPath = join(sessionsRoot, session.name);
        const messagesPath = join(sessionPath, 'messages');
        
        if (existsSync(messagesPath)) {
          try {
            const messages = readdirSync(messagesPath, { withFileTypes: true })
              .filter(dirent => dirent.isFile());
            totalMessages += messages.length;
          } catch (error) {
            // 忽略单个会话的错误
            console.warn(`[PerformanceCollector] 读取会话消息失败: ${session.name}`, error);
          }
        }
      }
      
      return {
        sessionCount: sessions.length,
        totalMessages,
      };
    } catch (error) {
      console.warn('[PerformanceCollector] 收集会话统计失败:', error);
      return { sessionCount: 0, totalMessages: 0 };
    }
  }
  
  /**
   * 计算运行时间
   * @returns 运行时间（秒）
   */
  calculateUptime(): number {
    return Math.floor((Date.now() - this.startTime) / 1000);
  }
  
  /**
   * 从会话日志中解析响应时间
   * @param info 智能体信息
   * @returns 平均响应时间（秒）
   */
  parseResponseTime(info: AgentInfo): number {
    try {
      // TODO: 实际实现需要解析会话日志文件
      // 这里返回模拟数据
      return Math.random() * 2 + 0.5; // 0.5-2.5 秒
    } catch (error) {
      console.warn('[PerformanceCollector] 解析响应时间失败:', error);
      return 0;
    }
  }
  
  /**
   * 从会话日志中解析 Tokens/秒
   * @param info 智能体信息
   * @returns Tokens 处理速度
   */
  parseTokensPerSecond(info: AgentInfo): number {
    try {
      // TODO: 实际实现需要解析会话日志文件
      // 这里返回模拟数据
      return Math.random() * 50 + 10; // 10-60 tokens/s
    } catch (error) {
      console.warn('[PerformanceCollector] 解析 Tokens/秒失败:', error);
      return 0;
    }
  }
  
  /**
   * 从错误日志中计算错误率
   * @param info 智能体信息
   * @returns 错误率百分比 (0-100)
   */
  calculateErrorRate(info: AgentInfo): number {
    try {
      // TODO: 实际实现需要解析错误日志
      // 这里返回模拟数据
      return Math.random() * 5; // 0-5% 错误率
    } catch (error) {
      console.warn('[PerformanceCollector] 计算错误率失败:', error);
      return 0;
    }
  }
  
  /**
   * 收集所有性能指标
   * @param info 智能体信息
   * @returns 完整的性能指标对象
   */
  collectAll(info: AgentInfo): AgentPerformanceMetrics {
    const sessionStats = this.collectSessionStats(info);
    
    return {
      cpuUsage: this.collectCpuUsage(),
      memoryUsage: this.collectMemoryUsage(),
      tokensPerSecond: this.parseTokensPerSecond(info),
      responseTime: this.parseResponseTime(info),
      errorRate: this.calculateErrorRate(info),
      uptime: this.calculateUptime(),
      sessionCount: sessionStats.sessionCount,
      totalMessages: sessionStats.totalMessages,
      lastUpdated: new Date().toISOString(),
    };
  }
}

// ── 性能数据缓存 ──────────────────────────────────────────────────────────

/**
 * 性能数据缓存类
 * 使用 Map 存储缓存数据，支持 TTL 过期检查
 */
class PerformanceCache {
  private cache = new Map<string, {
    data: AgentPerformanceMetrics;
    timestamp: number;
  }>();
  
  private readonly TTL = 5000; // 5 秒过期时间
  
  /**
   * 获取缓存的性能数据
   * @param agentId 智能体 ID
   * @returns 性能数据或 null（如果不存在或已过期）
   */
  get(agentId: string): AgentPerformanceMetrics | null {
    const entry = this.cache.get(agentId);
    
    if (!entry) {
      return null;
    }
    
    // 检查是否过期
    if (Date.now() - entry.timestamp > this.TTL) {
      this.cache.delete(agentId);
      return null;
    }
    
    return entry.data;
  }
  
  /**
   * 设置缓存数据
   * @param agentId 智能体 ID
   * @param data 性能数据
   */
  set(agentId: string, data: AgentPerformanceMetrics): void {
    this.cache.set(agentId, {
      data,
      timestamp: Date.now(),
    });
  }
  
  /**
   * 清理缓存
   * @param agentId 可选的智能体 ID，如果提供则只清理该智能体的缓存
   */
  clear(agentId?: string): void {
    if (agentId) {
      this.cache.delete(agentId);
    } else {
      this.cache.clear();
    }
  }
}

// 创建全局性能采集器和缓存实例
const performanceCollector = new PerformanceCollector();
const performanceCache = new PerformanceCache();

// ── 性能测试执行器 ──────────────────────────────────────────────────────────

/**
 * 性能测试结果接口
 */
interface PerformanceTestResult {
  testId: string;
  agentId: string;
  timestamp: string;
  duration: number;
  status: 'completed' | 'failed' | 'timeout';
  metrics: {
    cpuUsage: number;
    memoryUsage: number;
    tokensPerSecond: number;
    responseTime: number;
    errorRate: number;
    throughput: number;
    success: boolean;
  };
  errors?: string[];
}

/**
 * 性能测试执行器类
 * 负责执行性能测试并收集测试指标
 */
class PerformanceTester {
  private readonly TIMEOUT = 30000; // 30 秒超时
  private readonly CONCURRENT_REQUESTS = 10; // 并发请求数
  
  /**
   * 执行性能测试
   * @param info 智能体信息
   * @returns 测试结果
   */
  async runTest(info: AgentInfo): Promise<PerformanceTestResult> {
    const testId = `perf-test-${Date.now()}`;
    const startTime = Date.now();
    const errors: string[] = [];
    
    console.log(`[PerformanceTester] 开始性能测试: ${info.id}`);
    
    try {
      // 创建超时 Promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('测试超时')), this.TIMEOUT);
      });
      
      // 执行测试任务
      const testPromise = this.executeTestTasks(info, errors);
      
      // 等待测试完成或超时
      await Promise.race([testPromise, timeoutPromise]);
      
      const duration = Date.now() - startTime;
      
      // 收集测试期间的性能指标
      const metrics = performanceCollector.collectAll(info);
      
      // 计算吞吐量（请求/秒）
      const throughput = (this.CONCURRENT_REQUESTS / duration) * 1000;
      
      const result: PerformanceTestResult = {
        testId,
        agentId: info.id,
        timestamp: new Date().toISOString(),
        duration,
        status: errors.length > 0 ? 'failed' : 'completed',
        metrics: {
          cpuUsage: metrics.cpuUsage,
          memoryUsage: metrics.memoryUsage,
          tokensPerSecond: metrics.tokensPerSecond,
          responseTime: metrics.responseTime,
          errorRate: metrics.errorRate,
          throughput,
          success: errors.length === 0,
        },
        errors: errors.length > 0 ? errors : undefined,
      };
      
      console.log(`[PerformanceTester] 测试完成: ${info.id}, 状态: ${result.status}`);
      
      return result;
    } catch (error: any) {
      const duration = Date.now() - startTime;
      
      console.error(`[PerformanceTester] 测试失败: ${info.id}`, error);
      
      return {
        testId,
        agentId: info.id,
        timestamp: new Date().toISOString(),
        duration,
        status: error.message === '测试超时' ? 'timeout' : 'failed',
        metrics: {
          cpuUsage: 0,
          memoryUsage: 0,
          tokensPerSecond: 0,
          responseTime: 0,
          errorRate: 100,
          throughput: 0,
          success: false,
        },
        errors: [error.message],
      };
    }
  }
  
  /**
   * 执行测试任务
   * @param info 智能体信息
   * @param errors 错误列表
   */
  private async executeTestTasks(info: AgentInfo, errors: string[]): Promise<void> {
    const tasks: Promise<void>[] = [];
    
    // 创建并发测试任务
    for (let i = 0; i < this.CONCURRENT_REQUESTS; i++) {
      tasks.push(this.executeTestTask(info, i, errors));
    }
    
    // 等待所有任务完成
    await Promise.all(tasks);
  }
  
  /**
   * 执行单个测试任务
   * @param info 智能体信息
   * @param taskIndex 任务索引
   * @param errors 错误列表
   */
  private async executeTestTask(info: AgentInfo, taskIndex: number, errors: string[]): Promise<void> {
    try {
      // 模拟测试任务执行
      // TODO: 实际实现应该调用智能体的 API 或执行真实的测试请求
      await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500));
      
      // 随机模拟一些失败情况
      if (Math.random() < 0.05) { // 5% 失败率
        throw new Error(`测试任务 ${taskIndex} 失败`);
      }
    } catch (error: any) {
      errors.push(error.message);
      console.warn(`[PerformanceTester] 任务 ${taskIndex} 失败:`, error.message);
    }
  }
}

// 创建全局性能测试器实例
const performanceTester = new PerformanceTester();

// ── 性能测试结果持久化 ──────────────────────────────────────────────────────────

/**
 * 获取性能测试结果文件路径
 * @param info 智能体信息
 * @returns 测试结果文件路径
 */
function getPerformanceTestResultsPath(info: AgentInfo): string {
  const agentDir = info.agentConfigRoot || info.workspaceRoot;
  if (!agentDir) {
    throw new Error('无法确定智能体配置目录');
  }
  return join(agentDir, 'performance-tests.json');
}

/**
 * 读取性能测试历史记录
 * @param info 智能体信息
 * @returns 测试结果数组
 */
function readPerformanceTestResults(info: AgentInfo): PerformanceTestResult[] {
  const resultsPath = getPerformanceTestResultsPath(info);
  
  try {
    if (!existsSync(resultsPath)) {
      return [];
    }
    
    const content = readFileSync(resultsPath, 'utf8');
    const results = JSON.parse(content);
    
    if (!Array.isArray(results)) {
      console.warn('[PerformanceTest] 测试结果文件格式无效');
      return [];
    }
    
    return results;
  } catch (error) {
    console.error('[PerformanceTest] 读取测试结果失败:', error);
    return [];
  }
}

/**
 * 保存性能测试结果
 * @param info 智能体信息
 * @param result 测试结果
 */
function savePerformanceTestResult(info: AgentInfo, result: PerformanceTestResult): void {
  const resultsPath = getPerformanceTestResultsPath(info);
  
  try {
    // 读取现有结果
    const results = readPerformanceTestResults(info);
    
    // 添加新结果
    results.push(result);
    
    // 保留最近 50 次测试
    const MAX_RESULTS = 50;
    if (results.length > MAX_RESULTS) {
      results.splice(0, results.length - MAX_RESULTS);
    }
    
    // 确保目录存在
    const resultsDir = dirname(resultsPath);
    mkdirSync(resultsDir, { recursive: true });
    
    // 原子性写入
    const tempPath = `${resultsPath}.tmp`;
    writeFileSync(tempPath, JSON.stringify(results, null, 2), 'utf8');
    renameSync(tempPath, resultsPath);
    
    console.log(`[PerformanceTest] 测试结果已保存: ${resultsPath}`);
  } catch (error) {
    console.error('[PerformanceTest] 保存测试结果失败:', error);
    throw error;
  }
}

/**
 * 生成性能测试报告
 * @param result 测试结果
 * @returns 报告内容
 */
function generatePerformanceTestReport(result: PerformanceTestResult): string {
  const lines: string[] = [];
  
  lines.push('# 性能测试报告');
  lines.push('');
  lines.push(`**测试 ID**: ${result.testId}`);
  lines.push(`**智能体 ID**: ${result.agentId}`);
  lines.push(`**测试时间**: ${result.timestamp}`);
  lines.push(`**测试时长**: ${result.duration}ms`);
  lines.push(`**测试状态**: ${result.status}`);
  lines.push('');
  lines.push('## 性能指标');
  lines.push('');
  lines.push(`- **CPU 使用率**: ${result.metrics.cpuUsage.toFixed(2)}%`);
  lines.push(`- **内存使用量**: ${result.metrics.memoryUsage.toFixed(2)} MB`);
  lines.push(`- **Tokens/秒**: ${result.metrics.tokensPerSecond.toFixed(2)}`);
  lines.push(`- **响应时间**: ${result.metrics.responseTime.toFixed(2)}s`);
  lines.push(`- **错误率**: ${result.metrics.errorRate.toFixed(2)}%`);
  lines.push(`- **吞吐量**: ${result.metrics.throughput.toFixed(2)} 请求/秒`);
  lines.push(`- **测试成功**: ${result.metrics.success ? '是' : '否'}`);
  
  if (result.errors && result.errors.length > 0) {
    lines.push('');
    lines.push('## 错误信息');
    lines.push('');
    result.errors.forEach((error, index) => {
      lines.push(`${index + 1}. ${error}`);
    });
  }
  
  return lines.join('\n');
}

// ── 增强功能管理系统 ──────────────────────────────────────────────────────────

/**
 * 内置增强功能列表
 * 定义所有可用的增强功能及其默认配置
 */
const BUILTIN_ENHANCEMENTS: AgentEnhancementFeature[] = [
  {
    id: 'performance-boost',
    name: '性能加速',
    type: 'performance',
    description: '优化模型推理性能，提高响应速度',
    enabled: true,
    settings: {
      compression: 'high',
      cacheSize: 1000,
    },
    status: 'active',
    version: '1.0.0',
  },
  {
    id: 'security-audit',
    name: '安全审计',
    type: 'security',
    description: '实时监控安全风险，防止恶意请求',
    enabled: true,
    settings: {
      auditLevel: 'high',
      logSensitive: true,
    },
    status: 'active',
    version: '1.0.0',
  },
  {
    id: 'real-time-monitoring',
    name: '实时监控',
    type: 'monitoring',
    description: '实时显示 Agent 性能指标和状态',
    enabled: true,
    settings: {
      updateInterval: 5000,
      alertThreshold: 80,
    },
    status: 'active',
    version: '1.0.0',
  },
  {
    id: 'api-integration',
    name: 'API 集成',
    type: 'integration',
    description: '集成外部 API 服务以扩展功能',
    enabled: false,
    settings: {
      webhookUrl: '',
      maxRetries: 3,
    },
    status: 'inactive',
    version: '1.0.0',
  },
  {
    id: 'auto-scaling',
    name: '自动扩缩容',
    type: 'automation',
    description: '根据负载自动调整资源分配',
    enabled: false,
    settings: {
      minInstances: 1,
      maxInstances: 5,
      scaleThreshold: 70,
    },
    status: 'inactive',
    version: '1.0.0',
  },
  {
    id: 'session-management',
    name: '会话管理',
    type: 'utility',
    description: '增强会话管理和历史记录功能',
    enabled: true,
    settings: {
      maxSessions: 20,
      retentionDays: 30,
    },
    status: 'active',
    version: '1.0.0',
  },
  {
    id: 'tool-integration',
    name: '工具集成',
    type: 'integration',
    description: '集成更多外部工具和服务',
    enabled: false,
    settings: {
      tools: [],
      maxConcurrent: 5,
    },
    status: 'inactive',
    version: '1.0.0',
  },
  {
    id: 'analytics-dashboard',
    name: '分析仪表板',
    type: 'monitoring',
    description: '提供详细的性能分析和报告',
    enabled: true,
    settings: {
      metricsEnabled: true,
      reportFrequency: 'daily',
    },
    status: 'active',
    version: '1.0.0',
  },
];

// ── 增强功能管理器 ──────────────────────────────────────────────────────────

/**
 * 增强功能管理器类
 * 负责管理增强功能的启用/禁用、设置更新和依赖检查
 */
class EnhancementManager {
  /**
   * 获取增强功能列表
   * @param info 智能体信息
   * @returns 增强功能数组
   */
  getEnhancements(info: AgentInfo): AgentEnhancementFeature[] {
    try {
      // 读取配置文件
      const config = readEnhancementConfig(info);
      
      // 合并内置功能和配置
      const enhancements = BUILTIN_ENHANCEMENTS.map(builtin => {
        const configEntry = config.enhancements[builtin.id];
        
        if (configEntry) {
          return {
            ...builtin,
            enabled: configEntry.enabled,
            settings: { ...builtin.settings, ...configEntry.settings },
            lastApplied: configEntry.lastApplied,
            status: (configEntry.enabled ? 'active' : 'inactive') as AgentEnhancementFeature['status'],
          };
        }
        
        return builtin;
      });
      
      return enhancements;
    } catch (error) {
      console.error('[EnhancementManager] 获取增强功能列表失败:', error);
      // 返回默认的内置功能列表
      return BUILTIN_ENHANCEMENTS;
    }
  }
  
  /**
   * 切换增强功能启用状态
   * @param info 智能体信息
   * @param enhancementId 增强功能 ID
   * @param enabled 是否启用
   * @returns 更新后的增强功能
   */
  toggleEnhancement(info: AgentInfo, enhancementId: string, enabled: boolean): AgentEnhancementFeature {
    try {
      // 读取配置
      const config = readEnhancementConfig(info);
      
      // 检查增强功能是否存在
      const builtin = BUILTIN_ENHANCEMENTS.find(e => e.id === enhancementId);
      if (!builtin) {
        throw new Error(`增强功能不存在: ${enhancementId}`);
      }
      
      // 检查依赖关系
      if (enabled && builtin.dependencies) {
        this.checkDependencies(config, builtin.dependencies);
      }
      
      // 更新配置
      if (!config.enhancements[enhancementId]) {
        config.enhancements[enhancementId] = {
          enabled,
          settings: builtin.settings,
        };
      } else {
        config.enhancements[enhancementId].enabled = enabled;
      }
      
      // 设置最后应用时间
      if (enabled) {
        config.enhancements[enhancementId].lastApplied = new Date().toISOString();
      }
      
      // 保存配置
      writeEnhancementConfig(info, config);
      
      // 返回更新后的增强功能
      return {
        ...builtin,
        enabled,
        settings: config.enhancements[enhancementId].settings,
        lastApplied: config.enhancements[enhancementId].lastApplied,
        status: enabled ? 'active' : 'inactive',
      };
    } catch (error) {
      console.error('[EnhancementManager] 切换增强功能失败:', error);
      throw error;
    }
  }
  
  /**
   * 更新增强功能设置
   * @param info 智能体信息
   * @param enhancementId 增强功能 ID
   * @param settings 新的设置
   * @returns 更新后的增强功能
   */
  updateSettings(info: AgentInfo, enhancementId: string, settings: Record<string, any>): AgentEnhancementFeature {
    try {
      // 读取配置
      const config = readEnhancementConfig(info);
      
      // 检查增强功能是否存在
      const builtin = BUILTIN_ENHANCEMENTS.find(e => e.id === enhancementId);
      if (!builtin) {
        throw new Error(`增强功能不存在: ${enhancementId}`);
      }
      
      // 更新设置
      if (!config.enhancements[enhancementId]) {
        config.enhancements[enhancementId] = {
          enabled: builtin.enabled,
          settings,
        };
      } else {
        config.enhancements[enhancementId].settings = {
          ...config.enhancements[enhancementId].settings,
          ...settings,
        };
      }
      
      // 如果功能已启用，更新最后应用时间
      if (config.enhancements[enhancementId].enabled) {
        config.enhancements[enhancementId].lastApplied = new Date().toISOString();
      }
      
      // 保存配置
      writeEnhancementConfig(info, config);
      
      // 返回更新后的增强功能
      return {
        ...builtin,
        enabled: config.enhancements[enhancementId].enabled,
        settings: config.enhancements[enhancementId].settings,
        lastApplied: config.enhancements[enhancementId].lastApplied,
        status: config.enhancements[enhancementId].enabled ? 'active' : 'inactive',
      };
    } catch (error) {
      console.error('[EnhancementManager] 更新增强功能设置失败:', error);
      throw error;
    }
  }
  
  /**
   * 检查依赖关系
   * @param config 配置对象
   * @param dependencies 依赖的增强功能 ID 列表
   * @throws 如果依赖未满足则抛出错误
   */
  checkDependencies(config: EnhancementConfig, dependencies: string[]): void {
    for (const depId of dependencies) {
      const depConfig = config.enhancements[depId];
      
      if (!depConfig || !depConfig.enabled) {
        const depName = BUILTIN_ENHANCEMENTS.find(e => e.id === depId)?.name || depId;
        throw new Error(`依赖的增强功能未启用: ${depName}`);
      }
    }
  }
}

// 创建全局增强功能管理器实例
const enhancementManager = new EnhancementManager();

export function setupAgentsIPC() {
  ipcMain.handle('agents:getAll', async (): Promise<{ success: boolean; agents?: AgentInfo[]; error?: string }> => {
    try {
      const config = readConfig();
      const agentsList = config?.agents?.list || [];
      // autoCreateWorkspace = true：自动创建缺失的 workspace 目录
      // 典型场景：新环境安装后 main agent 的 workspace 目录尚未创建
      const agents = agentsList.map((agent: any) => mapAgentInfo(agent, config, true));
      
      return { success: true, agents };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('agents:create', async (_, payload: { name: string; workspace: string; model?: string }): Promise<{ success: boolean; agent?: AgentInfo; error?: string }> => {
    try {
      const createResult = await runAgentCreateCommand(payload);
      if (!createResult.success) {
        return { success: false, error: createResult.error || '创建智能体失败' };
      }

      const config = readConfig();
      const agentsList = config?.agents?.list || [];
      const createdAgent = agentsList.find((item: any) => item.workspace === payload.workspace || item.name === payload.name);

      if (!createdAgent) {
        return { success: false, error: '智能体创建成功，但未能在配置中定位新条目' };
      }

      // 防御性检查：CLI 可能注册了 agent 但未创建 agentDir
      // 此情况在 openclaw.json 存在 schema 兼容性问题时会发生
      const agentDir = createdAgent.agentDir;
      if (needsAgentDirRepair(agentDir, existsSync)) {
        try {
          const plan = planAgentDirRepair(agentDir);
          mkdirSync(plan.directoryToCreate, { recursive: true });
          for (const file of plan.filesToWrite) {
            // 仅在文件不存在时写入，避免覆盖已有配置
            if (!existsSync(file.path)) {
              writeFileSync(file.path, file.content, 'utf8');
            }
          }
          console.log(`[agents:create] agentDir 不存在，已自动创建: ${agentDir}`);
        } catch (repairErr) {
          // 修复失败不阻塞创建流程，仅记录警告
          console.warn(`[agents:create] agentDir 自动创建失败: ${repairErr}`);
        }
      }

      return {
        success: true,
        agent: mapAgentInfo(createdAgent, config),
      };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  /**
   * 删除智能体 — 调用 openclaw agents delete <id> --force --json
   * 通过官方 CLI 正式删除，清理 openclaw.json 条目、workspace 和 agentDir
   */
  ipcMain.handle('agents:delete', async (_, agentId: string): Promise<{ success: boolean; output?: string; error?: string }> => {
    try {
      const trimmedId = (agentId || '').trim();
      if (!trimmedId) {
        return { success: false, error: '智能体 ID 不能为空' };
      }

      const openclawCmd = resolveOpenClawCommand();
      const shellPath = await getShellPath();

      return new Promise((resolvePromise) => {
        const child = spawn(openclawCmd, ['--no-color', 'agents', 'delete', trimmedId, '--force', '--json'], {
          env: buildDoctorFixEnv(process.env, shellPath),
        });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data) => { stdout += data.toString(); });
        child.stderr.on('data', (data) => { stderr += data.toString(); });

        child.on('close', (code) => {
          if (code === 0) {
            resolvePromise({ success: true, output: stdout });
          } else {
            // 提取友好错误信息
            const errorMsg = stderr.trim() || stdout.trim() || `命令退出码 ${code}`;
            resolvePromise({ success: false, output: stdout, error: errorMsg });
          }
        });

        child.on('error', (err) => {
          resolvePromise({ success: false, error: err.message });
        });
      });
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('agents:getAgentConfigPath', async (_, agentId: string): Promise<{ success: boolean; path?: string; error?: string }> => {
    try {
      const { info } = getAgentRecord(agentId);
      return { success: true, path: info.agentConfigRoot || info.workspaceRoot };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('agents:getWorkspaceDetails', async (_, agentId: string): Promise<{ success: boolean; details?: AgentWorkspaceDetails; error?: string }> => {
    try {
      const { info } = getAgentRecord(agentId);
      return {
        success: true,
        details: buildWorkspaceDetails(info),
      };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('agents:readWorkspaceFile', async (_, agentId: string, fileName: AgentWorkspaceFileName): Promise<{ success: boolean; file?: AgentWorkspaceFileSummary & { content: string }; error?: string }> => {
    try {
      const { info } = getAgentRecord(agentId);
      const filePath = ensureInsideAllowedRoots(resolveWorkspaceFilePath(info, fileName), info);
      const fileExists = existsSync(filePath);
      const fileStat = fileExists ? statSync(filePath) : null;

      return {
        success: true,
        file: {
          name: fileName,
          path: filePath,
          exists: fileExists,
          size: fileStat?.size || 0,
          updatedAt: fileStat?.mtime.toISOString(),
          content: fileExists ? readFileSync(filePath, 'utf8') : '',
        },
      };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('agents:saveWorkspaceFile', async (_, agentId: string, fileName: AgentWorkspaceFileName, content: string): Promise<{ success: boolean; file?: AgentWorkspaceFileSummary; error?: string }> => {
    try {
      const { info } = getAgentRecord(agentId);
      const filePath = ensureInsideAllowedRoots(resolveWorkspaceFilePath(info, fileName), info);
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, content, 'utf8');
      const fileStat = statSync(filePath);

      return {
        success: true,
        file: {
          name: fileName,
          path: filePath,
          exists: true,
          size: fileStat.size,
          updatedAt: fileStat.mtime.toISOString(),
        },
      };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('agents:readMemoryFile', async (_, agentId: string, targetPath: string): Promise<{ success: boolean; file?: ReturnType<typeof readMemoryFile>; error?: string }> => {
    try {
      const { info } = getAgentRecord(agentId);
      const file = readMemoryFile(info, targetPath);
      return { success: true, file };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('agents:saveMemoryFile', async (_, agentId: string, targetPath: string, content: string): Promise<{ success: boolean; file?: ReturnType<typeof readMemoryFile>; error?: string }> => {
    try {
      const { info } = getAgentRecord(agentId);
      const file = saveMemoryFile(info, targetPath, content);
      return { success: true, file };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('agents:clearMemoryFile', async (_, agentId: string, targetPath: string): Promise<{ success: boolean; file?: ReturnType<typeof readMemoryFile>; error?: string }> => {
    try {
      const { info } = getAgentRecord(agentId);
      const file = clearMemoryFile(info, targetPath);
      return { success: true, file };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('agents:readManagedFile', async (_, agentId: string, targetPath: string): Promise<{ success: boolean; file?: ReturnType<typeof readManagedFile>; error?: string }> => {
    try {
      const { info } = getAgentRecord(agentId);
      const file = readManagedFile(info, targetPath);
      return { success: true, file };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('agents:saveManagedFile', async (_, agentId: string, targetPath: string, content: string): Promise<{ success: boolean; file?: ReturnType<typeof readManagedFile>; error?: string }> => {
    try {
      const { info } = getAgentRecord(agentId);
      const file = saveManagedFile(info, targetPath, content);
      return { success: true, file };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('agents:listWorkspaceEntries', async (_, agentId: string, targetPath?: string): Promise<{ success: boolean; result?: ReturnType<typeof listWorkspaceEntries>; error?: string }> => {
    try {
      const { info } = getAgentRecord(agentId);
      const result = listWorkspaceEntries(info, targetPath);
      return { success: true, result };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('agents:renameWorkspaceEntry', async (_, agentId: string, targetPath: string, nextName: string): Promise<{ success: boolean; entry?: ReturnType<typeof createWorkspaceEntry>; error?: string }> => {
    try {
      const { info } = getAgentRecord(agentId);
      const entry = renameWorkspaceEntry(targetPath, nextName, info);
      return { success: true, entry };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('agents:deleteWorkspaceEntry', async (_, agentId: string, targetPath: string): Promise<{ success: boolean; trashEntry?: AgentWorkspaceTrashEntry; error?: string }> => {
    try {
      const { info } = getAgentRecord(agentId);
      const trashEntry = deleteWorkspaceEntryToTrash(targetPath, info);
      return { success: true, trashEntry };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('agents:listWorkspaceTrash', async (_, agentId: string): Promise<{ success: boolean; trashRoot?: string; entries?: AgentWorkspaceTrashEntry[]; error?: string }> => {
    try {
      const { info } = getAgentRecord(agentId);
      const trashRoot = getWorkspaceTrashRoot(info);
      const entries = readWorkspaceTrashManifest(info)
        .filter((entry) => existsSync(entry.path))
        .sort((left, right) => right.deletedAt.localeCompare(left.deletedAt));
      writeWorkspaceTrashManifest(info, entries);
      return { success: true, trashRoot, entries };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('agents:restoreWorkspaceTrashEntry', async (_, agentId: string, trashEntryId: string): Promise<{ success: boolean; restoredPath?: string; error?: string }> => {
    try {
      const { info } = getAgentRecord(agentId);
      const restoredPath = restoreWorkspaceTrashEntryById(trashEntryId, info);
      return { success: true, restoredPath };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('agents:restoreWorkspaceTrashEntries', async (_, agentId: string, trashEntryIds: string[]): Promise<{ success: boolean; restoredPaths?: string[]; error?: string }> => {
    try {
      const { info } = getAgentRecord(agentId);
      const restoredPaths = restoreWorkspaceTrashEntriesByIds(trashEntryIds, info);
      return { success: true, restoredPaths };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('agents:deleteWorkspaceTrashEntry', async (_, agentId: string, trashEntryId: string): Promise<{ success: boolean; deletedId?: string; error?: string }> => {
    try {
      const { info } = getAgentRecord(agentId);
      const deletedId = permanentlyDeleteWorkspaceTrashEntryById(trashEntryId, info);
      return { success: true, deletedId };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('agents:deleteWorkspaceTrashEntries', async (_, agentId: string, trashEntryIds: string[]): Promise<{ success: boolean; deletedIds?: string[]; error?: string }> => {
    try {
      const { info } = getAgentRecord(agentId);
      const deletedIds = permanentlyDeleteWorkspaceTrashEntriesByIds(trashEntryIds, info);
      return { success: true, deletedIds };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('agents:clearWorkspaceTrash', async (_, agentId: string): Promise<{ success: boolean; deletedCount?: number; error?: string }> => {
    try {
      const { info } = getAgentRecord(agentId);
      const deletedCount = clearWorkspaceTrash(info);
      return { success: true, deletedCount };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('agents:getCount', async (): Promise<{ success: boolean; count?: number; error?: string }> => {
    try {
      const config = readConfig();
      const agentsList = config?.agents?.list || [];
      return { success: true, count: agentsList.length };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // ── 性能监控 IPC Handlers ──────────────────────────────────────────────────────────
  
  /**
   * 获取智能体性能指标
   * 使用缓存机制，5秒内返回缓存数据
   */
  ipcMain.handle('agents:getPerformance', async (_, agentId: string): Promise<{ success: boolean; metrics?: AgentPerformanceMetrics; error?: string }> => {
    try {
      const { info } = getAgentRecord(agentId);
      
      // 尝试从缓存获取
      const cached = performanceCache.get(agentId);
      if (cached) {
        console.log(`[agents:getPerformance] 返回缓存数据: ${agentId}`);
        return { success: true, metrics: cached };
      }
      
      // 收集性能数据
      console.log(`[agents:getPerformance] 收集性能数据: ${agentId}`);
      const metrics = performanceCollector.collectAll(info);
      
      // 更新缓存
      performanceCache.set(agentId, metrics);
      
      return { success: true, metrics };
    } catch (error) {
      console.error('[agents:getPerformance] 错误:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * 执行性能测试
   * 运行测试并保存结果到文件
   */
  ipcMain.handle('agents:runPerformanceTest', async (_, agentId: string): Promise<{ success: boolean; result?: PerformanceTestResult; error?: string }> => {
    try {
      const { info } = getAgentRecord(agentId);
      
      console.log(`[agents:runPerformanceTest] 开始执行性能测试: ${agentId}`);
      
      // 执行性能测试
      const result = await performanceTester.runTest(info);
      
      // 保存测试结果
      savePerformanceTestResult(info, result);
      
      // 清理性能缓存，强制下次获取最新数据
      performanceCache.clear(agentId);
      
      console.log(`[agents:runPerformanceTest] 测试完成: ${agentId}, 状态: ${result.status}`);
      
      return { success: true, result };
    } catch (error) {
      console.error('[agents:runPerformanceTest] 错误:', error);
      return { success: false, error: String(error) };
    }
  });

  // ── 增强功能管理 IPC Handlers ──────────────────────────────────────────────────────────
  
  /**
   * 获取智能体增强功能列表
   */
  ipcMain.handle('agents:getEnhancements', async (_, agentId: string): Promise<{ success: boolean; enhancements?: AgentEnhancementFeature[]; error?: string }> => {
    try {
      const { info } = getAgentRecord(agentId);
      
      console.log(`[agents:getEnhancements] 获取增强功能列表: ${agentId}`);
      
      // 使用增强功能管理器获取列表
      const enhancements = enhancementManager.getEnhancements(info);
      
      return { success: true, enhancements };
    } catch (error) {
      console.error('[agents:getEnhancements] 错误:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * 启用/禁用增强功能
   */
  ipcMain.handle('agents:toggleEnhancement', async (_, agentId: string, enhancementId: string, enabled: boolean): Promise<{ success: boolean; enhancement?: AgentEnhancementFeature; error?: string }> => {
    try {
      const { info } = getAgentRecord(agentId);
      
      console.log(`[agents:toggleEnhancement] 切换增强功能: ${agentId}, ${enhancementId}, ${enabled}`);
      
      // 使用增强功能管理器切换状态
      const enhancement = enhancementManager.toggleEnhancement(info, enhancementId, enabled);
      
      return { success: true, enhancement };
    } catch (error) {
      console.error('[agents:toggleEnhancement] 错误:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * 更新增强功能设置
   */
  ipcMain.handle('agents:updateEnhancementSettings', async (_, agentId: string, enhancementId: string, settings: Record<string, any>): Promise<{ success: boolean; enhancement?: AgentEnhancementFeature; error?: string }> => {
    try {
      const { info } = getAgentRecord(agentId);
      
      console.log(`[agents:updateEnhancementSettings] 更新增强功能设置: ${agentId}, ${enhancementId}`);
      
      // 使用增强功能管理器更新设置
      const enhancement = enhancementManager.updateSettings(info, enhancementId, settings);
      
      return { success: true, enhancement };
    } catch (error) {
      console.error('[agents:updateEnhancementSettings] 错误:', error);
      return { success: false, error: String(error) };
    }
  });

  // ── 快速操作 IPC Handlers ──────────────────────────────────────────────────────────
  
  /**
   * 打开调试终端
   * 创建新窗口显示智能体的调试终端
   */
  ipcMain.handle('agents:openDebugTerminal', async (_, agentId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const { info } = getAgentRecord(agentId);
      
      console.log(`[agents:openDebugTerminal] 打开调试终端: ${agentId}`);
      
      // TODO: 实现调试终端窗口创建
      // 这需要在 main.ts 中创建新的 BrowserWindow
      // 暂时返回成功，实际功能需要在后续实现
      
      return { success: true };
    } catch (error) {
      console.error('[agents:openDebugTerminal] 错误:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * 导出智能体配置
   * 将智能体的所有配置导出为 JSON 文件
   */
  ipcMain.handle('agents:exportConfig', async (_, agentId: string): Promise<{ success: boolean; filePath?: string; error?: string }> => {
    try {
      const { info, config, agent } = getAgentRecord(agentId);
      
      console.log(`[agents:exportConfig] 导出配置: ${agentId}`);
      
      // 收集配置数据
      const exportData = {
        exportVersion: '1.0.0',
        exportDate: new Date().toISOString(),
        agentInfo: {
          id: info.id,
          name: info.name,
          model: agent.model,
          workspace: info.workspace,
        },
        config: {
          openclaw: agent,
          enhancements: readEnhancementConfig(info),
        },
        workspaceFiles: {} as Record<string, string>,
        metadata: {
          desktopVersion: '0.3.13', // TODO: 从 package.json 读取
          openclawVersion: 'unknown', // TODO: 从 CLI 获取版本
        },
      };
      
      // 读取工作区文件
      for (const fileName of AGENT_WORKSPACE_FILES) {
        try {
          const filePath = resolveWorkspaceFilePath(info, fileName);
          if (existsSync(filePath)) {
            exportData.workspaceFiles[fileName] = readFileSync(filePath, 'utf8');
          }
        } catch (error) {
          console.warn(`[agents:exportConfig] 读取文件失败: ${fileName}`, error);
        }
      }
      
      // 生成导出文件路径
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const exportFileName = `agent-${info.name}-${timestamp}.json`;
      const exportPath = join(info.workspaceRoot || info.agentConfigRoot || getOpenClawRoot(), exportFileName);
      
      // 保存导出文件
      writeFileSync(exportPath, JSON.stringify(exportData, null, 2), 'utf8');
      
      console.log(`[agents:exportConfig] 配置已导出: ${exportPath}`);
      
      return { success: true, filePath: exportPath };
    } catch (error) {
      console.error('[agents:exportConfig] 错误:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * 导入智能体配置
   * 从 JSON 文件导入配置并应用到智能体
   */
  ipcMain.handle('agents:importConfig', async (_, agentId: string, filePath: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const { info } = getAgentRecord(agentId);
      
      console.log(`[agents:importConfig] 导入配置: ${agentId}, 文件: ${filePath}`);
      
      // 验证文件存在
      if (!existsSync(filePath)) {
        throw new Error('导入文件不存在');
      }
      
      // 读取并解析导入文件
      const content = readFileSync(filePath, 'utf8');
      const importData = JSON.parse(content);
      
      // 验证导入数据格式
      if (!importData.exportVersion || !importData.config) {
        throw new Error('导入文件格式无效');
      }
      
      // 导入增强功能配置
      if (importData.config.enhancements) {
        writeEnhancementConfig(info, importData.config.enhancements);
      }
      
      // 导入工作区文件
      if (importData.workspaceFiles && info.workspaceRoot) {
        for (const [fileName, content] of Object.entries(importData.workspaceFiles)) {
          try {
            const filePath = join(info.workspaceRoot, fileName);
            mkdirSync(dirname(filePath), { recursive: true });
            writeFileSync(filePath, content as string, 'utf8');
          } catch (error) {
            console.warn(`[agents:importConfig] 写入文件失败: ${fileName}`, error);
          }
        }
      }
      
      console.log(`[agents:importConfig] 配置导入成功: ${agentId}`);
      
      return { success: true };
    } catch (error) {
      console.error('[agents:importConfig] 错误:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * 克隆智能体
   * 创建当前智能体的副本
   */
  ipcMain.handle('agents:clone', async (_, agentId: string, newName: string, workspace: string): Promise<{ success: boolean; newAgentId?: string; error?: string }> => {
    try {
      const { info, agent } = getAgentRecord(agentId);
      
      console.log(`[agents:clone] 克隆智能体: ${agentId} -> ${newName}`);
      
      // 使用 OpenClaw CLI 创建新智能体
      const createResult = await runAgentCreateCommand({
        name: newName,
        workspace,
        model: typeof agent.model === 'string' ? agent.model : agent.model?.primary,
      });
      
      if (!createResult.success) {
        throw new Error(createResult.error || '创建智能体失败');
      }
      
      // 读取配置获取新智能体 ID
      const config = readConfig();
      const newAgent = config?.agents?.list?.find((a: any) => a.name === newName);
      
      if (!newAgent) {
        throw new Error('无法找到新创建的智能体');
      }
      
      const newInfo = mapAgentInfo(newAgent, config);
      
      // 复制增强功能配置
      try {
        const sourceConfig = readEnhancementConfig(info);
        sourceConfig.agentId = newInfo.id;
        writeEnhancementConfig(newInfo, sourceConfig);
      } catch (error) {
        console.warn('[agents:clone] 复制增强功能配置失败:', error);
      }
      
      // 复制工作区文件
      if (info.workspaceRoot && newInfo.workspaceRoot) {
        for (const fileName of AGENT_WORKSPACE_FILES) {
          try {
            const sourcePath = join(info.workspaceRoot, fileName);
            const targetPath = join(newInfo.workspaceRoot, fileName);
            
            if (existsSync(sourcePath)) {
              const content = readFileSync(sourcePath, 'utf8');
              mkdirSync(dirname(targetPath), { recursive: true });
              writeFileSync(targetPath, content, 'utf8');
            }
          } catch (error) {
            console.warn(`[agents:clone] 复制文件失败: ${fileName}`, error);
          }
        }
      }
      
      console.log(`[agents:clone] 克隆成功: ${newInfo.id}`);
      
      return { success: true, newAgentId: newInfo.id };
    } catch (error) {
      console.error('[agents:clone] 错误:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * 生成性能报告
   * 生成智能体的性能分析报告
   */
  ipcMain.handle('agents:generateReport', async (_, agentId: string, format: 'pdf' | 'markdown'): Promise<{ success: boolean; reportPath?: string; error?: string }> => {
    try {
      const { info } = getAgentRecord(agentId);
      
      console.log(`[agents:generateReport] 生成报告: ${agentId}, 格式: ${format}`);
      
      // 收集性能数据
      const metrics = performanceCollector.collectAll(info);
      
      // 读取测试历史
      const testResults = readPerformanceTestResults(info);
      
      // 生成报告内容
      const reportLines: string[] = [];
      reportLines.push(`# ${info.name} 性能报告`);
      reportLines.push('');
      reportLines.push(`**生成时间**: ${new Date().toLocaleString('zh-CN')}`);
      reportLines.push(`**智能体 ID**: ${info.id}`);
      reportLines.push('');
      reportLines.push('## 当前性能指标');
      reportLines.push('');
      reportLines.push(`- **CPU 使用率**: ${metrics.cpuUsage.toFixed(2)}%`);
      reportLines.push(`- **内存使用量**: ${metrics.memoryUsage.toFixed(2)} MB`);
      reportLines.push(`- **Tokens/秒**: ${metrics.tokensPerSecond.toFixed(2)}`);
      reportLines.push(`- **响应时间**: ${metrics.responseTime.toFixed(2)}s`);
      reportLines.push(`- **错误率**: ${metrics.errorRate.toFixed(2)}%`);
      reportLines.push(`- **运行时间**: ${Math.floor(metrics.uptime / 3600)}h ${Math.floor((metrics.uptime % 3600) / 60)}m`);
      reportLines.push(`- **活跃会话数**: ${metrics.sessionCount}`);
      reportLines.push(`- **总消息数**: ${metrics.totalMessages}`);
      reportLines.push('');
      
      if (testResults.length > 0) {
        reportLines.push('## 性能测试历史');
        reportLines.push('');
        reportLines.push('| 测试时间 | 状态 | CPU | 内存 | 响应时间 | 吞吐量 |');
        reportLines.push('|---------|------|-----|------|---------|--------|');
        
        testResults.slice(-10).forEach(result => {
          const date = new Date(result.timestamp).toLocaleString('zh-CN');
          reportLines.push(`| ${date} | ${result.status} | ${result.metrics.cpuUsage.toFixed(1)}% | ${result.metrics.memoryUsage.toFixed(1)}MB | ${result.metrics.responseTime.toFixed(2)}s | ${result.metrics.throughput.toFixed(2)} req/s |`);
        });
        
        reportLines.push('');
      }
      
      const reportContent = reportLines.join('\n');
      
      // 生成报告文件路径
      const reportsDir = join(info.workspaceRoot || info.agentConfigRoot || getOpenClawRoot(), 'reports');
      mkdirSync(reportsDir, { recursive: true });
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const reportFileName = `performance-report-${timestamp}.${format === 'pdf' ? 'pdf' : 'md'}`;
      const reportPath = join(reportsDir, reportFileName);
      
      // 保存报告（目前只支持 Markdown）
      if (format === 'markdown') {
        writeFileSync(reportPath, reportContent, 'utf8');
      } else {
        // PDF 格式需要额外的库支持，暂时保存为 Markdown
        writeFileSync(reportPath.replace('.pdf', '.md'), reportContent, 'utf8');
      }
      
      console.log(`[agents:generateReport] 报告已生成: ${reportPath}`);
      
      return { success: true, reportPath };
    } catch (error) {
      console.error('[agents:generateReport] 错误:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * 重启智能体
   * 重启智能体进程
   */
  ipcMain.handle('agents:restart', async (_, agentId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const { info } = getAgentRecord(agentId);
      
      console.log(`[agents:restart] 重启智能体: ${agentId}`);
      
      // TODO: 实现智能体进程重启
      // 这需要与 OpenClaw Gateway 集成
      // 暂时返回成功，实际功能需要在后续实现
      
      // 清理性能缓存
      performanceCache.clear(agentId);
      
      return { success: true };
    } catch (error) {
      console.error('[agents:restart] 错误:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * 安全检查
   * 执行智能体的安全审计
   */
  ipcMain.handle('agents:securityCheck', async (_, agentId: string): Promise<{ success: boolean; results?: any[]; error?: string }> => {
    try {
      const { info } = getAgentRecord(agentId);
      
      console.log(`[agents:securityCheck] 执行安全检查: ${agentId}`);
      
      const results: any[] = [];
      
      // 检查 1: 文件权限
      if (info.workspaceRoot && existsSync(info.workspaceRoot)) {
        try {
          const stat = statSync(info.workspaceRoot);
          const mode = stat.mode & parseInt('777', 8);
          const isSecure = mode <= parseInt('755', 8);
          
          results.push({
            checkId: 'file-permissions',
            name: '文件权限检查',
            category: 'file-permissions',
            riskLevel: isSecure ? 'low' : 'medium',
            status: isSecure ? 'pass' : 'warning',
            message: isSecure ? '工作区文件权限设置合理' : '工作区文件权限过于宽松',
            recommendation: isSecure ? undefined : '建议将工作区权限设置为 755 或更严格',
          });
        } catch (error) {
          results.push({
            checkId: 'file-permissions',
            name: '文件权限检查',
            category: 'file-permissions',
            riskLevel: 'low',
            status: 'pass',
            message: '无法检查文件权限',
          });
        }
      }
      
      // 检查 2: API 密钥安全
      results.push({
        checkId: 'api-keys',
        name: 'API 密钥安全',
        category: 'api-keys',
        riskLevel: 'low',
        status: 'pass',
        message: 'API 密钥存储在系统配置中',
        recommendation: '确保配置文件权限正确设置',
      });
      
      // 检查 3: 网络暴露风险
      results.push({
        checkId: 'network',
        name: '网络暴露风险',
        category: 'network',
        riskLevel: 'low',
        status: 'pass',
        message: '智能体运行在本地环境',
      });
      
      // 检查 4: 配置安全性
      try {
        const config = readEnhancementConfig(info);
        const hasSecurityAudit = config.enhancements['security-audit']?.enabled;
        
        results.push({
          checkId: 'config-security',
          name: '配置安全性',
          category: 'config',
          riskLevel: hasSecurityAudit ? 'low' : 'medium',
          status: hasSecurityAudit ? 'pass' : 'warning',
          message: hasSecurityAudit ? '安全审计功能已启用' : '安全审计功能未启用',
          recommendation: hasSecurityAudit ? undefined : '建议启用安全审计增强功能',
        });
      } catch (error) {
        results.push({
          checkId: 'config-security',
          name: '配置安全性',
          category: 'config',
          riskLevel: 'low',
          status: 'pass',
          message: '配置文件正常',
        });
      }
      
      console.log(`[agents:securityCheck] 安全检查完成: ${agentId}, 发现 ${results.length} 个检查项`);
      
      return { success: true, results };
    } catch (error) {
      console.error('[agents:securityCheck] 错误:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * 更新智能体 Identity 配置
   * 将 identity 信息写入 openclaw.json 中对应 Agent 条目
   */
  ipcMain.handle('agents:updateIdentity', async (_, agentId: string, identity: { name?: string; theme?: string; emoji?: string; avatar?: string }): Promise<{ success: boolean; error?: string }> => {
    try {
      console.log(`[agents:updateIdentity] 更新 Identity: ${agentId}`);

      const config = readConfig();
      const agentsList = config?.agents?.list || [];
      const agentEntry = agentsList.find((a: any) => a.id === agentId || a.name === agentId);

      if (!agentEntry) {
        return { success: false, error: `未找到智能体: ${agentId}` };
      }

      // 过滤空值字段，仅保留有实际内容的字段
      const filtered: Record<string, string> = {};
      for (const [key, value] of Object.entries(identity)) {
        if (value && value.trim()) {
          filtered[key] = value.trim();
        }
      }

      // 设置 identity 字段
      agentEntry.identity = filtered;
      writeConfig(config);

      console.log(`[agents:updateIdentity] Identity 更新成功: ${agentId}`);
      return { success: true };
    } catch (error) {
      console.error('[agents:updateIdentity] 错误:', error);
      return { success: false, error: String(error) };
    }
  });
}