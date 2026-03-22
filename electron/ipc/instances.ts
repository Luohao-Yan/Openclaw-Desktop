import pkg from 'electron';
const { ipcMain } = pkg;
import { join } from 'path';
import { existsSync } from 'fs';
import { getOpenClawRootDir, resolveOpenClawCommand, runCommand as runShellCommand } from './settings.js';
import { rm } from 'fs/promises';

const ANSI_ESCAPE_PATTERN = /\u001B\[[0-?]*[ -/]*[@-~]/g;
const CONTROL_CHAR_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

function stripAnsiAndControlChars(value: string) {
  return value
    .replace(ANSI_ESCAPE_PATTERN, '')
    .replace(CONTROL_CHAR_PATTERN, '')
    .replace(/\r/g, '')
    .trim();
}

export interface InstanceInfo {
  id: string;
  name: string;
  type: 'gateway' | 'agent' | 'node' | 'service';
  status: 'running' | 'stopped' | 'starting' | 'error';
  error?: string;
  pid?: number;
  memoryUsage?: number;
  cpuUsage?: number;
  uptime?: number;
  port?: number;
  version?: string;
  lastActive?: string;
  configPath?: string;
}

// 运行 OpenClaw 命令的辅助函数
// 复用 settings.ts 的 runShellCommand，确保使用完整的 shell PATH（解决 Electron 主进程 PATH 缺失问题）
async function runOpenClawCommand(args: string[]): Promise<{ success: boolean; output: string; error?: string }> {
  const result = await runShellCommand(resolveOpenClawCommand(), ['--no-color', ...args]);
  // 对输出做 ANSI 清理，保持和原来一致
  return {
    success: result.success,
    output: stripAnsiAndControlChars(result.output || ''),
    error: result.error,
  };
}

// ============================================================================
// 解析 openclaw gateway status 输出
// 从 CLI 输出中提取真正的运行时实例信息（Gateway 服务和 LaunchAgent）
// ============================================================================
function parseOpenClawStatus(output: string): InstanceInfo[] {
  const instances: InstanceInfo[] = [];
  const lines = stripAnsiAndControlChars(output).split('\n');

  // --- 解析 LaunchAgent 服务状态 ---
  let launchAgentStatus: 'running' | 'stopped' | 'error' = 'stopped';
  let launchAgentLoaded = false;
  for (const line of lines) {
    const trimmed = line.trim();
    // 匹配 "Service: LaunchAgent (loaded)" 或 "Service: LaunchAgent (not loaded)"
    if (trimmed.startsWith('Service:') && trimmed.includes('LaunchAgent')) {
      launchAgentLoaded = trimmed.includes('loaded') && !trimmed.includes('not loaded');
      if (launchAgentLoaded) {
        launchAgentStatus = 'running';
      }
    }
  }

  // --- 解析 Gateway 运行时状态 ---
  let gatewayPid: number | undefined;
  let gatewayPort: number | undefined;
  let gatewayStatus: 'running' | 'stopped' | 'error' = 'stopped';
  let dashboardUrl: string | undefined;

  for (const line of lines) {
    const trimmed = line.trim();

    // 匹配 "Runtime: running (pid 19978, state active)"
    if (trimmed.startsWith('Runtime:')) {
      if (trimmed.includes('running')) {
        gatewayStatus = 'running';
        const pidMatch = trimmed.match(/pid\s+(\d+)/);
        if (pidMatch) {
          gatewayPid = parseInt(pidMatch[1], 10);
        }
      } else if (trimmed.includes('stopped') || trimmed.includes('not running')) {
        gatewayStatus = 'stopped';
      } else if (trimmed.includes('error')) {
        gatewayStatus = 'error';
      }
    }

    // 匹配 "Listening: 127.0.0.1:18789"
    if (trimmed.startsWith('Listening:')) {
      const portMatch = trimmed.match(/:(\d+)/);
      if (portMatch) {
        gatewayPort = parseInt(portMatch[1], 10);
      }
    }

    // 匹配 "Dashboard: http://127.0.0.1:18789/"
    if (trimmed.startsWith('Dashboard:')) {
      dashboardUrl = trimmed.replace('Dashboard:', '').trim();
    }
  }

  // 添加 LaunchAgent 服务实例
  instances.push({
    id: 'openclaw-launchagent',
    name: 'LaunchAgent',
    type: 'service',
    status: launchAgentLoaded ? launchAgentStatus : 'stopped',
    lastActive: new Date().toISOString(),
  });

  // 添加 Gateway 实例
  instances.push({
    id: 'openclaw-gateway',
    name: 'OpenClaw Gateway',
    type: 'gateway',
    status: gatewayStatus,
    pid: gatewayPid,
    port: gatewayPort,
    configPath: dashboardUrl,
    lastActive: new Date().toISOString(),
  });

  return instances;
}

// ============================================================================
// 获取 Agent 实例（已废弃）
// Agent 不是独立的运行时实例，它们是配置定义，通过 Gateway 运行
// 此函数保留但返回空数组，避免将 workspace 目录误认为运行中的实例
// ============================================================================
async function getAgentInstances(): Promise<InstanceInfo[]> {
  // Agent 不是独立的运行时实例
  // 它们是配置定义，通过 Gateway 统一管理和运行
  // 真正的"实例"只有 Gateway 和 Node 服务
  return [];
}

// 获取所有节点实例
async function getNodeInstances(): Promise<InstanceInfo[]> {
  const instances: InstanceInfo[] = [];
  
  try {
    // 检查节点配置
    const result = await runOpenClawCommand(['nodes', 'status']);
    if (result.success) {
      const output = result.output;
      if (output.includes('paired nodes')) {
        instances.push({
          id: 'local-node',
          name: 'Local Node',
          type: 'node',
          status: 'running',
          lastActive: new Date().toISOString()
        });
      }
    }
  } catch (error) {
    console.error('Error getting node instances:', error);
  }
  
  return instances;
}

export function setupInstancesIPC() {
  // 获取所有实例
  ipcMain.handle('instances:getAll', async (): Promise<{ success: boolean; instances?: InstanceInfo[]; error?: string }> => {
    try {
      // 获取网关状态（即使命令返回非零退出码，输出里也可能有状态信息）
      const statusResult = await runOpenClawCommand(['gateway', 'status']);
      const gatewayInstances = parseOpenClawStatus(statusResult.output);
      
      // 获取 Agent 实例
      const agentInstances = await getAgentInstances();
      
      // 获取节点实例
      const nodeInstances = await getNodeInstances();
      
      // 合并所有实例
      const allInstances = [
        ...gatewayInstances,
        ...agentInstances,
        ...nodeInstances
      ];
      
      return { success: true, instances: allInstances };
    } catch (error) {
      return { 
        success: false, 
        error: `Failed to get instances: ${error instanceof Error ? error.message : String(error)}` 
      };
    }
  });

  // 启动实例
  ipcMain.handle('instances:start', async (_, instanceId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      if (instanceId === 'openclaw-gateway') {
        const result = await runOpenClawCommand(['gateway', 'start']);
        if (result.success) {
          return { success: true };
        } else {
          return { success: false, error: result.error };
        }
      }
      
      return { success: false, error: `Unsupported instance type or ID: ${instanceId}` };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // 停止实例
  ipcMain.handle('instances:stop', async (_, instanceId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      if (instanceId === 'openclaw-gateway') {
        const result = await runOpenClawCommand(['gateway', 'stop']);
        if (result.success) {
          return { success: true };
        } else {
          return { success: false, error: result.error };
        }
      }
      
      return { success: false, error: `Unsupported instance type or ID: ${instanceId}` };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // 重启实例
  ipcMain.handle('instances:restart', async (_, instanceId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      if (instanceId === 'openclaw-gateway') {
        // 停止并启动
        const stopResult = await runOpenClawCommand(['gateway', 'stop']);
        if (stopResult.success) {
          // 等待 2 秒
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          const startResult = await runOpenClawCommand(['gateway', 'start']);
          if (startResult.success) {
            return { success: true };
          } else {
            return { success: false, error: `Failed to start: ${startResult.error}` };
          }
        } else {
          return { success: false, error: `Failed to stop: ${stopResult.error}` };
        }
      }
      
      return { success: false, error: `Unsupported instance type or ID: ${instanceId}` };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // 删除实例（仅支持停止 Gateway 服务）
  ipcMain.handle('instances:delete', async (_, instanceId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      // 实例管理中不应删除 Agent workspace 目录
      // Agent 的管理应在 Agent 管理页面中进行
      if (instanceId === 'openclaw-gateway' || instanceId === 'openclaw-launchagent') {
        // 卸载 LaunchAgent 服务
        const result = await runOpenClawCommand(['gateway', 'uninstall']);
        if (result.success) {
          return { success: true };
        } else {
          return { success: false, error: result.error };
        }
      }

      return { success: false, error: `不支持删除此实例: ${instanceId}` };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // 获取实例统计信息
  ipcMain.handle('instances:stats', async (): Promise<{ 
    success: boolean; 
    stats?: {
      total: number;
      running: number;
      stopped: number;
      error: number;
      byType: Record<string, number>;
    }; 
    error?: string 
  }> => {
    try {
      const result = await runOpenClawCommand(['gateway', 'status']);
      const instances = parseOpenClawStatus(result.output);
      const agentInstances = await getAgentInstances();
      const nodeInstances = await getNodeInstances();
      
      const allInstances = [...instances, ...agentInstances, ...nodeInstances];
      
      const stats = {
        total: allInstances.length,
        running: allInstances.filter(i => i.status === 'running').length,
        stopped: allInstances.filter(i => i.status === 'stopped').length,
        error: allInstances.filter(i => i.status === 'error').length,
        byType: allInstances.reduce((acc, instance) => {
          acc[instance.type] = (acc[instance.type] || 0) + 1;
          return acc;
        }, {} as Record<string, number>)
      };
      
      return { success: true, stats };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });
}