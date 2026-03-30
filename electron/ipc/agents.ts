import pkg from 'electron';
import fs from 'fs/promises';
const { ipcMain, dialog } = pkg;
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
import { checkAgentCompleteness, planAgentCompletenessRepair, validateAgentRename } from './agentCompletenessLogic.js';
import { buildDeleteCleanupPlan } from './agentDeleteCleanupLogic.js';
import { aggregateSessionStats } from './statsAggregator.js';

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

      // CLI 执行前缓存 agent 配置（CLI 执行后配置会被删除，届时无法再读取）
      let cachedAgent: any = null;
      try {
        const record = getAgentRecord(trimmedId);
        cachedAgent = record.agent;
      } catch {
        // 读取失败不阻断删除流程（agent 可能已不存在于配置中）
        cachedAgent = null;
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
            // CLI 成功后执行 workspace 清理
            try {
              const openclawRoot = getOpenClawRoot();
              const plan = buildDeleteCleanupPlan({
                agentId: trimmedId,
                agentRecord: cachedAgent,
                cliExitCode: code,
                openclawRoot,
              });

              if (plan.shouldCleanWorkspace && plan.workspacePath) {
                const wpPath = resolve(plan.workspacePath);
                const rootPath = resolve(openclawRoot);

                // 安全校验：确保 workspace 路径位于 OpenClaw 根目录下，防止误删
                const isUnderRoot = wpPath.startsWith(rootPath + '/') || wpPath.startsWith(rootPath + '\\');
                if (!isUnderRoot) {
                  console.warn(`[agents:delete] workspace 路径不在 OpenClaw 根目录下，跳过清理: ${wpPath}`);
                } else if (existsSync(wpPath) && statSync(wpPath).isDirectory()) {
                  try {
                    rmSync(wpPath, { recursive: true, force: true });
                    console.log(`[agents:delete] 已清理 workspace 目录: ${wpPath}`);
                  } catch (rmErr) {
                    // 删除失败仅打印警告，不影响成功返回
                    console.warn(`[agents:delete] workspace 目录清理失败: ${wpPath}`, rmErr);
                  }
                }
              }
            } catch (cleanupErr) {
              // 清理逻辑异常不影响删除结果
              console.warn(`[agents:delete] workspace 清理过程异常:`, cleanupErr);
            }

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

  // ── 快速操作 IPC Handlers ──────────────────────────────────────────────────────────
  
  /**
   * 打开调试终端
   * 创建新窗口显示智能体的调试终端
   */
  ipcMain.handle('agents:openDebugTerminal', async (_, agentId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const { info } = getAgentRecord(agentId);
      const workspaceRoot = info.workspaceRoot;

      // 检查工作区目录是否存在
      if (!workspaceRoot || !existsSync(workspaceRoot)) {
        return { success: false, error: '工作区目录不存在' };
      }

      console.log(`[agents:openDebugTerminal] 打开调试终端: ${agentId}, 工作区: ${workspaceRoot}`);

      // 根据操作系统平台选择终端命令
      let child;
      const platform = process.platform;

      if (platform === 'darwin') {
        // macOS: 使用 Terminal.app 打开
        child = spawn('open', ['-a', 'Terminal', workspaceRoot], { detached: true, stdio: 'ignore' });
      } else if (platform === 'win32') {
        // Windows: 使用 cmd 打开并切换到工作区目录
        child = spawn('cmd', ['/c', 'start', 'cmd', '/K', `cd /d "${workspaceRoot}"`], { detached: true, stdio: 'ignore' });
      } else {
        // Linux: 使用默认终端模拟器打开
        child = spawn('x-terminal-emulator', ['--working-directory', workspaceRoot], { detached: true, stdio: 'ignore' });
      }

      // 分离子进程，避免阻塞主进程
      child.unref();

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

      // 生成默认文件名：{agentName}-config-{YYYY-MM-DD}.json
      const dateStr = new Date().toISOString().slice(0, 10);
      const defaultFileName = `${info.name}-config-${dateStr}.json`;

      // 弹出系统保存对话框，让用户选择导出路径
      const { canceled, filePath: savePath } = await dialog.showSaveDialog({
        title: '导出 Agent 配置',
        defaultPath: defaultFileName,
        filters: [{ name: 'JSON 文件', extensions: ['json'] }],
      });

      // 用户取消了对话框
      if (canceled || !savePath) {
        return { success: false, error: '用户取消了导出' };
      }

      // 组装简化的导出数据结构
      const exportData = {
        exportVersion: '1.0',
        exportDate: new Date().toISOString(),
        agentInfo: {
          id: info.id,
          name: info.name,
          model: typeof agent.model === 'string' ? agent.model : agent.model?.primary || '',
          workspace: info.workspace,
        },
        config,
      };

      // 写入用户选择的路径
      writeFileSync(savePath, JSON.stringify(exportData, null, 2), 'utf8');

      console.log(`[agents:exportConfig] 配置已导出: ${savePath}`);

      return { success: true, filePath: savePath };
    } catch (error) {
      console.error('[agents:exportConfig] 错误:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * 导入智能体配置
   * 弹出文件选择对话框，从 JSON 文件导入配置并写入 openclaw.json
   */
  ipcMain.handle('agents:importConfig', async (_, agentId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      getAgentRecord(agentId);

      // 弹出系统文件选择对话框，过滤 .json 文件
      const { canceled, filePaths } = await dialog.showOpenDialog({
        title: '导入 Agent 配置',
        filters: [{ name: 'JSON 文件', extensions: ['json'] }],
        properties: ['openFile'],
      });

      // 用户取消了对话框
      if (canceled || !filePaths.length) {
        return { success: false, error: '用户取消了导入' };
      }

      const selectedPath = filePaths[0];

      // 读取并解析导入文件
      const content = readFileSync(selectedPath, 'utf8');
      const importData = JSON.parse(content);

      // 验证导入数据必须包含 agentInfo 和 config 字段
      if (!importData.agentInfo || !importData.config) {
        return { success: false, error: '导入文件格式无效：缺少 agentInfo 或 config 字段' };
      }

      // 将导入的 config 内容写入 openclaw.json
      writeConfig(importData.config);

      console.log(`[agents:importConfig] 配置导入成功: ${agentId}`);

      return { success: true };
    } catch (error) {
      console.error('[agents:importConfig] 错误:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * 重启智能体
   * 通过 OpenClaw CLI 先停止再启动智能体进程
   */
  ipcMain.handle('agents:restart', async (_, agentId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const { info } = getAgentRecord(agentId);

      const openclawCmd = resolveOpenClawCommand();
      const shellPath = await getShellPath();
      const spawnEnv = buildDoctorFixEnv(process.env, shellPath);

      console.log(`[agents:restart] 正在停止智能体: ${agentId}`);

      // 第一步：停止智能体
      const stopResult = await new Promise<{ success: boolean; error?: string }>((resolvePromise) => {
        const child = spawn(openclawCmd, ['--no-color', 'agents', 'stop', agentId], {
          env: spawnEnv,
        });

        let stderr = '';

        child.stdout.on('data', () => {});
        child.stderr.on('data', (data) => { stderr += data.toString(); });

        child.on('close', (code) => {
          if (code === 0) {
            resolvePromise({ success: true });
          } else {
            const errorMsg = stderr.trim() || `停止命令退出码 ${code}`;
            resolvePromise({ success: false, error: errorMsg });
          }
        });

        child.on('error', (err) => {
          resolvePromise({ success: false, error: err.message });
        });
      });

      if (!stopResult.success) {
        return { success: false, error: `停止智能体失败: ${stopResult.error}` };
      }

      console.log(`[agents:restart] 正在启动智能体: ${agentId}`);

      // 第二步：启动智能体
      const startResult = await new Promise<{ success: boolean; error?: string }>((resolvePromise) => {
        const child = spawn(openclawCmd, ['--no-color', 'agents', 'start', agentId], {
          env: spawnEnv,
        });

        let stderr = '';

        child.stdout.on('data', () => {});
        child.stderr.on('data', (data) => { stderr += data.toString(); });

        child.on('close', (code) => {
          if (code === 0) {
            resolvePromise({ success: true });
          } else {
            const errorMsg = stderr.trim() || `启动命令退出码 ${code}`;
            resolvePromise({ success: false, error: errorMsg });
          }
        });

        child.on('error', (err) => {
          resolvePromise({ success: false, error: err.message });
        });
      });

      if (!startResult.success) {
        return { success: false, error: `启动智能体失败: ${startResult.error}` };
      }

      console.log(`[agents:restart] 智能体重启完成: ${agentId}`);
      return { success: true };
    } catch (error) {
      console.error('[agents:restart] 错误:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * 安全检查
   * 执行智能体的安全审计，覆盖三个检查类别：文件权限、API 密钥安全、配置安全性
   */
  ipcMain.handle('agents:securityCheck', async (_, agentId: string): Promise<{ success: boolean; results?: any[]; error?: string }> => {
    try {
      const { config, agent, info } = getAgentRecord(agentId);

      console.log(`[agents:securityCheck] 执行安全检查: ${agentId}`);

      const results: Array<{
        name: string;
        riskLevel: 'low' | 'medium' | 'high';
        status: 'pass' | 'warning' | 'fail';
        message: string;
        recommendation: string;
      }> = [];

      // ── 检查 1: 文件权限 ──
      // 检查工作区目录权限（mode），权限大于 755 视为过于宽松
      try {
        if (info.workspaceRoot && existsSync(info.workspaceRoot)) {
          const stat = statSync(info.workspaceRoot);
          // 提取 Unix 权限位（低 9 位）
          const mode = stat.mode & 0o777;
          const isSecure = mode <= 0o755;

          results.push({
            name: '文件权限检查',
            riskLevel: isSecure ? 'low' : 'medium',
            status: isSecure ? 'pass' : 'warning',
            message: isSecure
              ? `工作区目录权限正常 (${mode.toString(8)})`
              : `工作区目录权限过于宽松 (${mode.toString(8)})，超过 755`,
            recommendation: isSecure
              ? '当前权限设置合理，无需调整'
              : '建议执行 chmod 755 将工作区目录权限收紧至 755 或更严格',
          });
        } else {
          // 工作区目录不存在，标记为 fail
          results.push({
            name: '文件权限检查',
            riskLevel: 'medium',
            status: 'fail',
            message: '工作区目录不存在，无法检查文件权限',
            recommendation: '请确认 Agent 的 workspaceRoot 配置正确且目录已创建',
          });
        }
      } catch (error) {
        // 单项检查失败不影响其他项
        results.push({
          name: '文件权限检查',
          riskLevel: 'medium',
          status: 'fail',
          message: `文件权限检查异常: ${String(error)}`,
          recommendation: '请检查工作区目录是否可访问',
        });
      }

      // ── 检查 2: API 密钥安全 ──
      // 读取 openclaw.json 配置，检查字段值中是否包含明文 API 密钥模式
      try {
        // 用于匹配常见明文 API 密钥前缀的正则
        const apiKeyPatterns = [/sk-/i, /key-/i, /api[_-]?key/i, /secret[_-]?key/i, /token[_-]/i, /bearer\s+/i];
        const configStr = JSON.stringify(config);
        const foundPatterns: string[] = [];

        for (const pattern of apiKeyPatterns) {
          if (pattern.test(configStr)) {
            foundPatterns.push(pattern.source);
          }
        }

        const hasExposedKeys = foundPatterns.length > 0;

        results.push({
          name: 'API 密钥安全',
          riskLevel: hasExposedKeys ? 'high' : 'low',
          status: hasExposedKeys ? 'fail' : 'pass',
          message: hasExposedKeys
            ? `配置文件中检测到疑似明文 API 密钥 (匹配模式: ${foundPatterns.join(', ')})`
            : '配置文件中未检测到明文 API 密钥',
          recommendation: hasExposedKeys
            ? '建议将 API 密钥移至环境变量或加密存储，避免在配置文件中明文保存'
            : '当前配置安全，建议定期检查是否有新增的明文密钥',
        });
      } catch (error) {
        // 单项检查失败不影响其他项
        results.push({
          name: 'API 密钥安全',
          riskLevel: 'medium',
          status: 'fail',
          message: `API 密钥安全检查异常: ${String(error)}`,
          recommendation: '请确认 openclaw.json 配置文件可正常读取',
        });
      }

      // ── 检查 3: 配置安全性 ──
      // 检查关键配置项是否使用安全默认值：allowAgents 不应为通配符、bindings 应有 channel 和 accountId
      try {
        const issues: string[] = [];

        // 检查 allowAgents 是否包含通配符 '*'
        const allowAgents = Array.isArray(agent?.subagents?.allowAgents)
          ? agent.subagents.allowAgents
          : [];
        const hasWildcard = allowAgents.some((a: unknown) => a === '*');
        if (hasWildcard) {
          issues.push('allowAgents 包含通配符 "*"，允许所有子智能体访问');
        }

        // 检查 bindings 是否都有正确的 channel 和 accountId
        const bindings = Array.isArray(config?.bindings) ? config.bindings : [];
        const agentBindings = bindings.filter((b: any) => b?.agentId === agentId);
        for (const binding of agentBindings) {
          const channel = binding?.match?.channel;
          const accountId = binding?.match?.accountId;
          if (!channel || typeof channel !== 'string' || !channel.trim()) {
            issues.push('存在缺少 channel 的绑定配置');
          }
          if (!accountId || typeof accountId !== 'string' || !accountId.trim()) {
            issues.push('存在缺少 accountId 的绑定配置');
          }
        }

        const hasIssues = issues.length > 0;

        results.push({
          name: '配置安全性',
          riskLevel: hasIssues ? 'medium' : 'low',
          status: hasIssues ? 'warning' : 'pass',
          message: hasIssues
            ? `发现 ${issues.length} 个配置安全问题: ${issues.join('; ')}`
            : '关键配置项均使用安全默认值',
          recommendation: hasIssues
            ? '建议限制 allowAgents 范围（避免使用通配符），并确保所有 bindings 都配置了 channel 和 accountId'
            : '当前配置安全，建议定期审查配置变更',
        });
      } catch (error) {
        // 单项检查失败不影响其他项
        results.push({
          name: '配置安全性',
          riskLevel: 'medium',
          status: 'fail',
          message: `配置安全性检查异常: ${String(error)}`,
          recommendation: '请检查 Agent 配置是否完整',
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
   * 获取智能体历史统计数据
   * 从 sessions 目录读取 JSONL transcript 文件，按日期聚合 Token 消耗、会话量、响应时间、错误率
   */
  ipcMain.handle('agents:getHistoryStats', async (_, agentId: string): Promise<{ success: boolean; stats?: import('./statsAggregator.js').DailyStats[]; totalSessions?: number; error?: string }> => {
    try {
      const { info } = getAgentRecord(agentId);
      const sessionsRoot = resolveSessionsRoot(info);

      // sessions 目录不存在时返回空统计数据
      if (!sessionsRoot) {
        return { success: true, stats: [], totalSessions: 0 };
      }

      const { dailyStats: stats, totalSessions } = aggregateSessionStats(sessionsRoot);
      return { success: true, stats, totalSessions };
    } catch (error) {
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

  // ── Agent 配置完整性检查与修复 IPC Handlers ──────────────────────────────────────

  /**
   * 检查 agent 配置完整性
   * 返回完整性报告，包含各项检查的通过/缺失状态
   */
  ipcMain.handle('agents:checkCompleteness', async (_, agentId: string): Promise<{ success: boolean; report?: any; error?: string }> => {
    try {
      const { info } = getAgentRecord(agentId);
      const report = checkAgentCompleteness(info, existsSync);
      return { success: true, report };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  /**
   * 执行 agent 配置完整性修复
   * 先检查完整性，再生成修复计划，最后执行目录创建和文件写入（幂等）
   */
  ipcMain.handle('agents:repairCompleteness', async (_, agentId: string): Promise<{ success: boolean; repairedItems?: string[]; error?: string }> => {
    try {
      const { info } = getAgentRecord(agentId);
      // 获取完整性报告
      const report = checkAgentCompleteness(info, existsSync);
      // 生成修复计划
      const plan = planAgentCompletenessRepair(info, report);
      const repairedItems: string[] = [];

      // 执行目录创建
      for (const dir of plan.directoriesToCreate) {
        mkdirSync(dir, { recursive: true });
        repairedItems.push(`目录: ${dir}`);
      }

      // 执行文件写入（幂等：已存在则跳过）
      for (const file of plan.filesToWrite) {
        if (!existsSync(file.path)) {
          // 确保父目录存在
          mkdirSync(dirname(file.path), { recursive: true });
          writeFileSync(file.path, file.content, 'utf8');
          repairedItems.push(`文件: ${file.path}`);
        }
      }

      return { success: true, repairedItems };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  /**
   * 重命名 agent
   * 校验名称合法性后更新 openclaw.json 中的 name 字段
   */
  ipcMain.handle('agents:rename', async (_, agentId: string, newName: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const config = readConfig();
      const agentsList = config?.agents?.list || [];
      const agentEntry = agentsList.find((a: any) => a.id === agentId || a.name === agentId);

      if (!agentEntry) {
        return { success: false, error: `未找到智能体: ${agentId}` };
      }

      const trimmedName = newName.trim();

      // 幂等：名称相同时直接返回成功
      if (agentEntry.name === trimmedName) {
        return { success: true };
      }

      // 获取所有已有 agent 名称（排除当前 agent）
      const existingNames = agentsList
        .filter((a: any) => (a.id || a.name) !== agentId)
        .map((a: any) => a.name as string);

      // 校验名称合法性
      const validation = validateAgentRename(newName, existingNames);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }

      // 更新名称并写入配置
      agentEntry.name = trimmedName;
      writeConfig(config);

      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  /**
   * 写入 agent 的 models.json
   * 将模型配置内容写入 agent 配置目录的 models.json 文件
   */
  ipcMain.handle('agents:writeModelsJson', async (_, agentId: string, content: object): Promise<{ success: boolean; error?: string }> => {
    try {
      const { info } = getAgentRecord(agentId);

      if (!info.agentConfigRoot) {
        return { success: false, error: 'agent 配置目录路径为空' };
      }

      // 确保配置目录存在
      mkdirSync(info.agentConfigRoot, { recursive: true });

      // 写入 models.json
      const modelsPath = join(info.agentConfigRoot, 'models.json');
      writeFileSync(modelsPath, JSON.stringify(content, null, 2), 'utf8');

      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });
}