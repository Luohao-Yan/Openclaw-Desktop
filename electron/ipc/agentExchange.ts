/**
 * Agent 配置加密导入/导出 — IPC 通信层
 *
 * 注册 IPC 通道，调用加密引擎层（agentExchangeLogic.ts）和文件系统 API，
 * 实现 Agent 配置的导出（加密 + 保存）和导入（解密 + 创建 + 写入 + 安装 + 绑定）。
 * 导入流程通过 agents:importProgress 事件向渲染进程实时推送分步进度，
 * 失败时自动回滚（调用 openclaw agents delete --force 清理已创建的 Agent）。
 */

import pkg from 'electron';
const { ipcMain, dialog, BrowserWindow } = pkg;
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync } from 'fs';
import { join, resolve, basename } from 'path';
import { spawn } from 'child_process';
import Store from 'electron-store';
import { getOpenClawRootDir, getShellPath, resolveOpenClawCommand } from './settings.js';
import { buildDoctorFixEnv } from './agents.js';
import {
  encryptPayload,
  decryptPayload,
  serializeBundle,
  deserializeBundle,
  stripSensitiveFields,
  resolveAgentName,
  extractChannelBindings,
  collectSkillManifest,
  createExportHistoryRecord,
  OCAGENT_MAGIC,
  FORMAT_VERSION,
  type AgentConfigPayload,
  type ExportHistoryRecord,
  type ImportProgress,
} from './agentExchangeLogic.js';

// electron-store 实例，用于持久化导出历史记录
const store = new Store();
const EXPORT_HISTORY_KEY = 'agentExportHistory';

// Agent workspace 中的 7 个 markdown 配置文件
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
// 辅助函数：Agent 路径解析（复用 agents.ts 中的逻辑）
// ============================================================================

/**
 * 解析 Agent 的实际 workspace 根目录
 *
 * 按优先级依次尝试多种路径格式：
 * 1. ~/.openclaw/workspace-{agentId}
 * 2. agent.workspace / agent.workspaceRoot / agent.workspaceDir（绝对路径或相对路径）
 * 3. ~/.openclaw/agents/{agentId}/workspace-{agentId}
 *
 * @param agent - openclaw.json 中的 agent 条目
 * @returns 实际存在的 workspace 目录路径，或 undefined
 */
function resolveWorkspaceRoot(agent: any): string | undefined {
  const openclawRoot = getOpenClawRoot();

  // 优先：~/.openclaw/workspace-{agentId}
  if (agent?.id) {
    const normalizedId = String(agent.id).trim();
    const directWorkspace = join(openclawRoot, `workspace-${normalizedId}`);
    if (existsSync(directWorkspace)) {
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
    const resolvedCandidate = resolve(candidate);
    if (existsSync(resolvedCandidate)) {
      return resolvedCandidate;
    }
    // 回退：尝试在 openclaw 根目录下查找同名目录
    const workspaceName = basename(resolvedCandidate);
    const fallbackCandidate = join(openclawRoot, workspaceName);
    if (existsSync(fallbackCandidate)) {
      return fallbackCandidate;
    }
  }

  // 嵌套路径：~/.openclaw/agents/{agentId}/workspace-{agentId}
  if (agent?.id) {
    const normalizedId = String(agent.id).trim();
    const nestedWorkspace = join(openclawRoot, 'agents', normalizedId, `workspace-${normalizedId}`);
    if (existsSync(nestedWorkspace)) {
      return nestedWorkspace;
    }
  }

  return undefined;
}

/**
 * 解析 Agent 的配置目录（agentDir）
 *
 * 按优先级依次尝试：
 * 1. agent.agentDir（如果存在）
 * 2. ~/.openclaw/agents/{agentId}/agent/
 *
 * @param agent - openclaw.json 中的 agent 条目
 * @returns 实际存在的 agent 配置目录路径，或 undefined
 */
function resolveAgentConfigRoot(agent: any): string | undefined {
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

// ============================================================================
// 辅助函数：配置文件读写（复制 agents.ts 中的模式）
// ============================================================================

/** 获取 openclaw.json 配置文件路径 */
function getConfigPath(): string {
  return join(getOpenClawRootDir(), 'openclaw.json');
}

/** 读取 openclaw.json 配置 */
function readConfig(): any {
  const configPath = getConfigPath();
  if (!existsSync(configPath)) {
    throw new Error('Config file not found');
  }
  const content = readFileSync(configPath, 'utf8');
  return JSON.parse(content);
}

/** 写入 openclaw.json 配置 */
function writeConfig(config: any): void {
  const configPath = getConfigPath();
  writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
}

/** 获取 OpenClaw 根目录 */
function getOpenClawRoot(): string {
  return getOpenClawRootDir();
}

// ============================================================================
// 辅助函数：进度推送
// ============================================================================

/**
 * 向所有渲染进程窗口发送导入进度事件
 *
 * @param step - 当前步骤编号（1-5）
 * @param stepName - 步骤名称
 * @param status - 步骤状态
 * @param message - 可选的详细信息
 */
function sendProgress(
  step: number,
  stepName: string,
  status: ImportProgress['status'],
  message?: string,
): void {
  const windows = BrowserWindow.getAllWindows();
  const progress: ImportProgress = { step, stepName, status, message };
  for (const win of windows) {
    win.webContents.send('agents:importProgress', progress);
  }
}

// ============================================================================
// 辅助函数：CLI 命令执行
// ============================================================================

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

// ============================================================================
// 主函数：注册所有 IPC 通道
// ============================================================================

export function setupAgentExchangeIPC(): void {

  // ========================================================================
  // agents:selectExportPath — 系统保存对话框
  // ========================================================================
  ipcMain.handle(
    'agents:selectExportPath',
    async (_, defaultName: string): Promise<{ success: boolean; filePath?: string; error?: string }> => {
      try {
        const result = await dialog.showSaveDialog({
          title: '导出 Agent 配置',
          defaultPath: defaultName,
          filters: [{ name: 'OpenClaw Agent Bundle', extensions: ['ocagent'] }],
        });

        if (result.canceled || !result.filePath) {
          return { success: false, error: 'cancelled' };
        }

        return { success: true, filePath: result.filePath };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  );

  // ========================================================================
  // agents:selectImportFile — 系统文件选择对话框
  // ========================================================================
  ipcMain.handle(
    'agents:selectImportFile',
    async (): Promise<{ success: boolean; filePath?: string; error?: string }> => {
      try {
        const result = await dialog.showOpenDialog({
          title: '选择 Agent 配置文件',
          filters: [{ name: 'OpenClaw Agent Bundle', extensions: ['ocagent'] }],
          properties: ['openFile'],
        });

        if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
          return { success: false, error: 'cancelled' };
        }

        return { success: true, filePath: result.filePaths[0] };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  );

  // ========================================================================
  // agents:getExportHistory — 读取导出历史记录
  // ========================================================================
  ipcMain.handle(
    'agents:getExportHistory',
    async (): Promise<{ success: boolean; history: ExportHistoryRecord[] }> => {
      try {
        const history = (store.get(EXPORT_HISTORY_KEY, []) as ExportHistoryRecord[]);
        // 按导出时间倒序排列
        history.sort((a, b) => new Date(b.exportTime).getTime() - new Date(a.exportTime).getTime());
        return { success: true, history };
      } catch (error) {
        return { success: true, history: [] };
      }
    },
  );

  // ========================================================================
  // agents:deleteExportHistory — 删除指定导出历史记录
  // ========================================================================
  ipcMain.handle(
    'agents:deleteExportHistory',
    async (_, recordId: string): Promise<{ success: boolean; error?: string }> => {
      try {
        const history = (store.get(EXPORT_HISTORY_KEY, []) as ExportHistoryRecord[]);
        const filtered = history.filter((r) => r.id !== recordId);
        store.set(EXPORT_HISTORY_KEY, filtered);
        return { success: true };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  );

  // ========================================================================
  // agents:exportBundle — 收集配置 → 加密 → 写入指定路径 → 记录历史
  // ========================================================================
  ipcMain.handle(
    'agents:exportBundle',
    async (_, agentId: string, passphrase: string, filePath?: string): Promise<{ success: boolean; filePath?: string; error?: string }> => {
      try {
        // 1. 读取 openclaw.json，查找目标 Agent
        const config = readConfig();
        const agentsList = config?.agents?.list || [];
        const agentEntry = agentsList.find((item: any) => item.id === agentId);

        if (!agentEntry) {
          return { success: false, error: 'Agent not found' };
        }

        // 2. 使用路径解析函数定位实际的 workspace 和 agentDir 目录
        const actualWorkspaceDir = resolveWorkspaceRoot(agentEntry);
        const actualAgentDir = resolveAgentConfigRoot(agentEntry);

        // 3. 收集 workspace 目录下的 markdown 配置文件
        const workspaceFiles: Record<string, string> = {};
        if (actualWorkspaceDir && existsSync(actualWorkspaceDir)) {
          for (const fileName of WORKSPACE_MD_FILES) {
            const mdPath = join(actualWorkspaceDir, fileName);
            if (existsSync(mdPath)) {
              try {
                workspaceFiles[fileName] = readFileSync(mdPath, 'utf8');
              } catch {
                // 单个文件读取失败不阻塞导出
              }
            }
          }
        }

        // 4. 读取 agent 配置目录下的 models.json
        let modelsJson: string | undefined;
        if (actualAgentDir) {
          const modelsPath = join(actualAgentDir, 'models.json');
          if (existsSync(modelsPath)) {
            try {
              modelsJson = readFileSync(modelsPath, 'utf8');
            } catch {
              // models.json 读取失败不阻塞导出
            }
          }
        }

        // 5. 过滤敏感字段
        const cleanedEntry = stripSensitiveFields(agentEntry as Record<string, unknown>);

        // 6. 提取 Channel 绑定模板
        const bindings = config?.bindings || [];
        const channelBindings = extractChannelBindings(bindings, agentId);

        // 7. 收集 Skills 清单
        const toolsMdContent = workspaceFiles['TOOLS.md'];
        const installedSkills = getInstalledSkillsList();
        const skills = collectSkillManifest(toolsMdContent, installedSkills);

        // 8. 对于私有 skill，读取其文件内容
        for (const skill of skills) {
          if (skill.source === 'private' && skill.id) {
            const skillFiles = readPrivateSkillFiles(skill.id);
            if (Object.keys(skillFiles).length > 0) {
              skill.files = skillFiles;
            }
          }
        }

        // 9. 构建 AgentConfigPayload
        const payload: AgentConfigPayload = {
          agent: {
            id: agentEntry.id || agentId,
            name: agentEntry.name || 'Unnamed Agent',
            model: agentEntry.model || 'Unknown',
            workspace: actualWorkspaceDir || agentEntry.workspace || '',
          },
          agentEntry: cleanedEntry,
          workspaceFiles,
          modelsJson,
          skills,
          channelBindings,
        };

        // 10. 加密 payload
        const { cryptoParams, ciphertext } = encryptPayload(payload, passphrase);

        // 11. 序列化为 .ocagent 二进制格式
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

        // 12. 确定保存路径：优先使用传入的 filePath，否则弹出保存对话框
        let savePath = filePath;
        if (!savePath) {
          const defaultName = `${agentEntry.name || 'agent'}.ocagent`;
          const saveResult = await dialog.showSaveDialog({
            title: '导出 Agent 配置',
            defaultPath: defaultName,
            filters: [{ name: 'OpenClaw Agent Bundle', extensions: ['ocagent'] }],
          });
          if (saveResult.canceled || !saveResult.filePath) {
            return { success: false, error: 'cancelled' };
          }
          savePath = saveResult.filePath;
        }

        // 13. 写入文件
        writeFileSync(savePath, bundleBuffer);

        // 14. 保存导出历史记录到 electron-store
        const fileSize = bundleBuffer.length;
        const historyRecord = createExportHistoryRecord(
          agentId,
          agentEntry.name || 'Unnamed Agent',
          savePath,
          passphrase,
          fileSize,
        );
        const history = (store.get(EXPORT_HISTORY_KEY, []) as ExportHistoryRecord[]);
        history.push(historyRecord);
        store.set(EXPORT_HISTORY_KEY, history);

        return { success: true, filePath: savePath };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  );

  // ========================================================================
  // agents:importBundle — 一键导入流程（解密 → 创建 → 写入 → 安装 → 绑定）
  // ========================================================================
  ipcMain.handle(
    'agents:importBundle',
    async (
      _,
      filePath: string,
      passphrase: string,
    ): Promise<{
      success: boolean;
      agent?: any;
      failedSkills?: Array<{ id: string; name: string; error: string }>;
      warnings?: string[];
      rolledBack?: boolean;
      error?: string;
    }> => {
      let createdAgentId: string | undefined;
      const failedSkills: Array<{ id: string; name: string; error: string }> = [];
      const warnings: string[] = [];

      try {
        // ==================================================================
        // Step 1: 解密验证 — 读取文件、反序列化、解密 payload
        // ==================================================================
        sendProgress(1, '解密验证', 'running');

        let payload: AgentConfigPayload;
        try {
          const fileBuffer = readFileSync(filePath);
          const bundle = deserializeBundle(fileBuffer);
          payload = decryptPayload(bundle.cryptoParams, bundle.ciphertext, passphrase);
          sendProgress(1, '解密验证', 'success');
        } catch (err) {
          sendProgress(1, '解密验证', 'failed', String(err));
          return { success: false, error: String(err) };
        }

        // ==================================================================
        // Step 2: 创建 Agent — 解决名称冲突后调用 CLI
        // ==================================================================
        sendProgress(2, '创建 Agent', 'running');

        try {
          // 读取现有 Agent 名称列表，解决冲突
          const config = readConfig();
          const existingNames = (config?.agents?.list || []).map((a: any) => a.name || '');
          const resolvedName = resolveAgentName(payload.agent.name, existingNames);

          // 构建 CLI 参数：openclaw agents add --non-interactive --json
          const openclawCmd = resolveOpenClawCommand();
          const shellPath = await getShellPath();
          const env = buildDoctorFixEnv(process.env, shellPath);

          const cliArgs = [
            '--no-color',
            'agents', 'add',
            '--name', resolvedName,
            '--non-interactive',
            '--json',
          ];

          const cliResult = await runCliCommand(openclawCmd, cliArgs, env);

          if (!cliResult.success) {
            const errorMsg = cliResult.stderr.trim() || cliResult.stdout.trim() || '创建 Agent 失败';
            sendProgress(2, '创建 Agent', 'failed', errorMsg);
            return { success: false, error: errorMsg };
          }

          // 从更新后的配置中找到新创建的 Agent
          const updatedConfig = readConfig();
          const updatedList = updatedConfig?.agents?.list || [];
          const newAgent = updatedList.find((a: any) => a.name === resolvedName);

          if (!newAgent) {
            sendProgress(2, '创建 Agent', 'failed', 'Agent 创建成功但未能在配置中定位');
            return { success: false, error: 'Agent 创建成功但未能在配置中定位' };
          }

          createdAgentId = newAgent.id;
          sendProgress(2, '创建 Agent', 'success', `已创建: ${resolvedName}`);
        } catch (err) {
          sendProgress(2, '创建 Agent', 'failed', String(err));
          return { success: false, error: String(err) };
        }

        // ==================================================================
        // Step 3: 写入配置文件 — workspace markdown 文件 + models.json
        // ==================================================================
        sendProgress(3, '写入配置文件', 'running');

        try {
          // 重新读取配置获取新 Agent 的目录信息
          const configAfterCreate = readConfig();
          const agentRecord = (configAfterCreate?.agents?.list || []).find(
            (a: any) => a.id === createdAgentId,
          );

          if (!agentRecord) {
            throw new Error('无法找到新创建的 Agent 记录');
          }

          // 写入 workspace markdown 文件
          const wsDir = agentRecord.workspace;
          if (wsDir && payload.workspaceFiles) {
            // 确保 workspace 目录存在
            if (!existsSync(wsDir)) {
              mkdirSync(wsDir, { recursive: true });
            }
            for (const [fileName, content] of Object.entries(payload.workspaceFiles)) {
              const targetPath = join(wsDir, fileName);
              writeFileSync(targetPath, content, 'utf8');
            }
          }

          // 写入 models.json 到 agentDir
          const agentDir = agentRecord.agentDir;
          if (agentDir && payload.modelsJson) {
            if (!existsSync(agentDir)) {
              mkdirSync(agentDir, { recursive: true });
            }
            const modelsPath = join(agentDir, 'models.json');
            writeFileSync(modelsPath, payload.modelsJson, 'utf8');
          }

          sendProgress(3, '写入配置文件', 'success');
        } catch (err) {
          sendProgress(3, '写入配置文件', 'failed', String(err));
          // 触发回滚
          await rollbackAgent(createdAgentId);
          return { success: false, error: String(err), rolledBack: true };
        }

        // ==================================================================
        // Step 4: 安装 Skills — clawhub 公共 skill 用 CLI，私有 skill 写文件
        // ==================================================================
        sendProgress(4, '安装 Skills', 'running');

        try {
          if (payload.skills && payload.skills.length > 0) {
            const openclawCmd = resolveOpenClawCommand();
            const shellPath = await getShellPath();
            const env = buildDoctorFixEnv(process.env, shellPath);

            for (const skill of payload.skills) {
              try {
                if (skill.source === 'clawhub') {
                  // clawhub 公共 skill：使用 clawhub install 命令
                  const installResult = await runCliCommand(
                    openclawCmd,
                    ['--no-color', 'clawhub', 'install', skill.id],
                    env,
                  );
                  if (!installResult.success) {
                    failedSkills.push({
                      id: skill.id,
                      name: skill.name,
                      error: installResult.stderr.trim() || '安装失败',
                    });
                  }
                } else if (skill.source === 'private' && skill.files) {
                  // 私有 skill：将文件内容写入本地 skills 目录
                  const skillsDir = join(getOpenClawRoot(), 'skills', skill.id);
                  mkdirSync(skillsDir, { recursive: true });
                  for (const [fileName, content] of Object.entries(skill.files)) {
                    writeFileSync(join(skillsDir, fileName), content, 'utf8');
                  }
                }
              } catch (skillErr) {
                // 单个 skill 安装失败不触发回滚，记录到 failedSkills
                failedSkills.push({
                  id: skill.id,
                  name: skill.name,
                  error: String(skillErr),
                });
              }
            }
          }

          // Skills 部分失败不触发回滚
          sendProgress(4, '安装 Skills', 'success',
            failedSkills.length > 0 ? `${failedSkills.length} 个 skill 安装失败` : undefined,
          );
        } catch (err) {
          // Skills 整体异常也不触发回滚，仅记录警告
          warnings.push(`Skills 安装异常: ${String(err)}`);
          sendProgress(4, '安装 Skills', 'success', `安装过程出现异常: ${String(err)}`);
        }

        // ==================================================================
        // Step 5: 配置 Channel 绑定 — 写入 openclaw.json bindings
        // ==================================================================
        sendProgress(5, '配置 Channel 绑定', 'running');

        try {
          if (payload.channelBindings && payload.channelBindings.length > 0 && createdAgentId) {
            const latestConfig = readConfig();
            if (!Array.isArray(latestConfig.bindings)) {
              latestConfig.bindings = [];
            }

            for (const template of payload.channelBindings) {
              // 构建绑定条目，accountId 留空等待用户后续配置
              const bindingEntry: Record<string, unknown> = {
                agentId: createdAgentId,
                match: {
                  channel: template.channel,
                  accountId: '', // 留空，等待用户配置
                  ...(template.matchRules || {}),
                },
              };
              latestConfig.bindings.push(bindingEntry);
            }

            writeConfig(latestConfig);
          }

          sendProgress(5, '配置 Channel 绑定', 'success');
        } catch (err) {
          sendProgress(5, '配置 Channel 绑定', 'failed', String(err));
          // 触发回滚
          await rollbackAgent(createdAgentId);
          return { success: false, error: String(err), rolledBack: true };
        }

        // ==================================================================
        // 导入完成，返回结果
        // ==================================================================
        // 重新读取配置获取最终的 Agent 信息
        const finalConfig = readConfig();
        const finalAgent = (finalConfig?.agents?.list || []).find(
          (a: any) => a.id === createdAgentId,
        );

        return {
          success: true,
          agent: finalAgent ? {
            id: finalAgent.id,
            name: finalAgent.name,
            workspace: finalAgent.workspace,
            model: finalAgent.model,
          } : undefined,
          failedSkills: failedSkills.length > 0 ? failedSkills : undefined,
          warnings: warnings.length > 0 ? warnings : undefined,
        };
      } catch (error) {
        // 全局异常捕获：如果已创建 Agent 则回滚
        if (createdAgentId) {
          await rollbackAgent(createdAgentId);
          return { success: false, error: String(error), rolledBack: true };
        }
        return { success: false, error: String(error) };
      }
    },
  );
} // end of setupAgentExchangeIPC


// ============================================================================
// 辅助函数：回滚、Skills 读取
// ============================================================================

/**
 * 回滚已创建的 Agent
 *
 * 调用 openclaw agents delete <agentId> --force --json 清理已创建的 Agent 及关联文件。
 * 通过进度事件推送 rolling-back / rolled-back 状态。
 *
 * @param agentId - 需要回滚的 Agent ID
 */
async function rollbackAgent(agentId: string | undefined): Promise<void> {
  if (!agentId) return;

  try {
    sendProgress(0, '回滚清理', 'rolling-back', '正在清理已创建的 Agent...');

    const openclawCmd = resolveOpenClawCommand();
    const shellPath = await getShellPath();
    const env = buildDoctorFixEnv(process.env, shellPath);

    const result = await runCliCommand(
      openclawCmd,
      ['--no-color', 'agents', 'delete', agentId, '--force', '--json'],
      env,
    );

    if (result.success) {
      sendProgress(0, '回滚清理', 'rolled-back', '已清理，未影响现有配置');
    } else {
      sendProgress(0, '回滚清理', 'rolled-back', `清理可能不完整: ${result.stderr.trim()}`);
    }
  } catch (err) {
    sendProgress(0, '回滚清理', 'rolled-back', `回滚异常: ${String(err)}`);
  }
}

/**
 * 获取已安装 Skills 列表
 *
 * 扫描 skills 目录，返回每个 skill 的 id、name 和 path。
 * 复用 skills.ts 中的目录扫描逻辑。
 *
 * @returns 已安装 skills 的简要信息数组
 */
function getInstalledSkillsList(): Array<{ id: string; name: string; path?: string }> {
  const result: Array<{ id: string; name: string; path?: string }> = [];

  // 检查多个可能的 skills 安装位置
  const possiblePaths = [
    join(process.env.HOME || '', '.openclaw', 'skills'),
    getOpenClawRoot() ? join(getOpenClawRoot(), 'skills') : null,
  ].filter((p): p is string => p !== null);

  for (const skillsDir of possiblePaths) {
    if (!existsSync(skillsDir)) continue;

    try {
      const entries = readdirSync(skillsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const skillId = entry.name;
        const skillPath = join(skillsDir, skillId);
        const skillMdPath = join(skillPath, 'SKILL.md');

        // 仅包含有 SKILL.md 的目录
        if (!existsSync(skillMdPath)) continue;

        // 尝试从 SKILL.md 中提取名称
        let name = skillId;
        try {
          const mdContent = readFileSync(skillMdPath, 'utf8');
          const nameMatch = mdContent.match(/name:\s*([^\n\s]+)/);
          if (nameMatch) name = nameMatch[1];
        } catch {
          // 解析失败使用目录名作为名称
        }

        result.push({ id: skillId, name, path: skillPath });
      }
    } catch {
      // 目录读取失败，跳过
    }
  }

  return result;
}

/**
 * 读取私有 Skill 的所有文件内容
 *
 * 扫描 skill 目录下的所有文件，读取其文本内容。
 * 用于导出时收集私有 skill 的完整文件。
 *
 * @param skillId - skill 的唯一标识（目录名）
 * @returns 文件名到文件内容的映射
 */
function readPrivateSkillFiles(skillId: string): Record<string, string> {
  const files: Record<string, string> = {};

  // 在多个可能的 skills 目录中查找
  const possiblePaths = [
    join(process.env.HOME || '', '.openclaw', 'skills', skillId),
    getOpenClawRoot() ? join(getOpenClawRoot(), 'skills', skillId) : null,
  ].filter((p): p is string => p !== null);

  for (const skillDir of possiblePaths) {
    if (!existsSync(skillDir)) continue;

    try {
      const entries = readdirSync(skillDir);
      for (const entry of entries) {
        const entryPath = join(skillDir, entry);
        try {
          const stat = statSync(entryPath);
          if (stat.isFile()) {
            files[entry] = readFileSync(entryPath, 'utf8');
          }
        } catch {
          // 单个文件读取失败，跳过
        }
      }
      // 找到第一个有效目录后停止
      if (Object.keys(files).length > 0) break;
    } catch {
      // 目录读取失败，尝试下一个
    }
  }

  return files;
}
