import pkg from 'electron';
const { ipcMain } = pkg;
import { spawn } from 'child_process';
import { join } from 'path';
import { existsSync } from 'fs';
import { getOpenClawRootDir, resolveOpenClawCommand } from './settings.js';
import { readFile } from 'fs/promises';

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
async function runOpenClawCommand(args: string[]): Promise<{ success: boolean; output: string; error?: string }> {
  return new Promise((resolve) => {
    try {
      const child = spawn(resolveOpenClawCommand(), ['--no-color', ...args], {
        env: {
          ...process.env,
          NO_COLOR: '1',
          FORCE_COLOR: '0',
        },
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
          resolve({ success: true, output: stripAnsiAndControlChars(output) });
        } else {
          resolve({ success: false, output: '', error: stripAnsiAndControlChars(errorOutput) || `Command exited with code ${code}` });
        }
      });
      
      child.on('error', (error) => {
        resolve({ success: false, output: '', error: error.message });
      });
      
      // 设置超时
      setTimeout(() => {
        try {
          child.kill();
        } catch (e) {
          // ignore
        }
        resolve({ success: false, output: '', error: 'Command timeout' });
      }, 15000);
      
    } catch (error: any) {
      resolve({ success: false, output: '', error: error.message });
    }
  });
}

// 解析 OpenClaw 状态输出
function parseOpenClawStatus(output: string): InstanceInfo[] {
  const instances: InstanceInfo[] = [];
  const lines = stripAnsiAndControlChars(output).split('\n');
  
  let currentInstance: Partial<InstanceInfo> = {};
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    if (trimmed.includes('Service:')) {
      if (currentInstance.id) {
        instances.push(currentInstance as InstanceInfo);
      }
      const serviceName = trimmed.replace('Service:', '').trim();
      currentInstance = {
        id: serviceName.toLowerCase().replace(/\s+/g, '-'),
        name: serviceName,
        type: 'service' as const,
        status: 'checking' as any
      };
    } else if (trimmed.includes('Gateway:')) {
      if (currentInstance.id) {
        instances.push(currentInstance as InstanceInfo);
      }
      currentInstance = {
        id: 'openclaw-gateway',
        name: 'OpenClaw Gateway',
        type: 'gateway' as const,
        status: 'checking' as any
      };
    } else if (trimmed.includes('Runtime:')) {
      if (trimmed.includes('running')) {
        currentInstance.status = 'running';
        const pidMatch = trimmed.match(/pid\s+(\d+)/);
        if (pidMatch) {
          currentInstance.pid = parseInt(pidMatch[1], 10);
        }
      } else if (trimmed.includes('stopped')) {
        currentInstance.status = 'stopped';
      } else if (trimmed.includes('error')) {
        currentInstance.status = 'error';
      }
    } else if (trimmed.includes('Listening:')) {
      const portMatch = trimmed.match(/:(\d+)/);
      if (portMatch) {
        currentInstance.port = parseInt(portMatch[1], 10);
      }
    } else if (trimmed.includes('Dashboard:')) {
      const url = trimmed.replace('Dashboard:', '').trim();
      currentInstance.configPath = url;
    }
  }
  
  // 添加最后一个实例
  if (currentInstance.id) {
    instances.push(currentInstance as InstanceInfo);
  }
  
  // 如果没有找到实例，添加一个默认的网关实例
  if (instances.length === 0) {
    instances.push({
      id: 'openclaw-gateway',
      name: 'OpenClaw Gateway',
      type: 'gateway',
      status: 'running',
      port: 18789,
      lastActive: new Date().toISOString()
    });
  }
  
  return instances;
}

// 获取所有 Agent 实例
async function getAgentInstances(): Promise<InstanceInfo[]> {
  const instances: InstanceInfo[] = [];
  const rootDir = getOpenClawRootDir();
  
  try {
    // 检查 ~/.openclaw/workspace-* 目录中的 Agent
    const { readdir } = require('fs/promises');
    const entries = await readdir(rootDir);
    
    for (const entry of entries) {
      if (entry.startsWith('workspace-')) {
        const agentPath = join(rootDir, entry);
        const configFile = join(agentPath, 'AGENTS.md');
        
        if (existsSync(configFile)) {
          try {
            const content = await readFile(configFile, 'utf-8');
            const nameMatch = content.match(/#\s+(.+?)\s+Workspace/) || 
                            content.match(/#\s+(.+?)\s+Agent/) ||
                            content.match(/##\s+(.+?)\s+-\s+cto/);
            
            const agentName = nameMatch ? nameMatch[1] : entry.replace('workspace-', '');
            
            instances.push({
              id: `agent-${entry}`,
              name: `${agentName} Agent`,
              type: 'agent',
              status: 'running', // 假设 workspace 存在则 Agent 在运行
              configPath: agentPath,
              lastActive: new Date().toISOString()
            });
          } catch (e) {
            // 忽略读取错误
          }
        }
      }
    }
  } catch (error) {
    console.error('Error getting agent instances:', error);
  }
  
  return instances;
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
      // 获取网关状态
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

  // 删除实例
  ipcMain.handle('instances:delete', async (_, instanceId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      if (instanceId.startsWith('agent-')) {
        const workspaceName = instanceId.replace('agent-', 'workspace-');
        const workspacePath = join(getOpenClawRootDir(), workspaceName);
        
        if (existsSync(workspacePath)) {
          const { rm } = require('fs/promises');
          await rm(workspacePath, { recursive: true, force: true });
          return { success: true };
        } else {
          return { success: false, error: `Workspace not found: ${workspacePath}` };
        }
      }
      
      return { success: false, error: `Cannot delete instance: ${instanceId}` };
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