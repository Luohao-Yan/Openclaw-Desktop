import pkg from 'electron';
const { ipcMain } = pkg;
import { spawn } from 'child_process';
import { readFile, stat } from 'fs/promises';
import net from 'net';
import path from 'path';
import { getOpenClawRootDir, resolveOpenClawCommand } from './settings.js';

export interface GatewayStatus {
  status: 'running' | 'stopped' | 'error';
  pid?: number;
  uptime?: string;
  version?: string;
  error?: string;
  host?: string;
  port?: number;
}

type OpenClawGatewayTarget = {
  host: string;
  port: number;
  mode: 'local' | 'remote';
};

type OpenClawConfigShape = {
  meta?: {
    lastTouchedVersion?: string;
  };
  gateway?: {
    port?: number;
    mode?: string;
    remote?: {
      url?: string;
    };
  };
};

type OpenClawNodeShape = {
  gateway?: {
    host?: string;
    port?: number;
  };
};

// 使用 spawn 运行命令的安全辅助函数
async function runCommand(cmd: string, args: string[]): Promise<{ success: boolean; output: string; error?: string }> {
  return new Promise((resolve) => {
    try {
      const process = spawn(cmd, args);
      
      let output = '';
      let errorOutput = '';
      
      process.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      process.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      process.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true, output });
        } else {
          resolve({ success: false, output: '', error: errorOutput || `Command exited with code ${code}` });
        }
      });
      
      process.on('error', (error) => {
        resolve({ success: false, output: '', error: error.message });
      });
      
      // 设置超时
      setTimeout(() => {
        try {
          process.kill();
        } catch (e) {
          // ignore
        }
        resolve({ success: false, output: '', error: 'Command timeout' });
      }, 10000);
      
    } catch (error: any) {
      resolve({ success: false, output: '', error: error.message });
    }
  });
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const content = await readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

async function resolveGatewayTarget(): Promise<OpenClawGatewayTarget> {
  const rootDir = getOpenClawRootDir();
  const configPath = path.join(rootDir, 'openclaw.json');
  const nodePath = path.join(rootDir, 'node.json');
  const config = await readJsonFile<OpenClawConfigShape>(configPath);
  const node = await readJsonFile<OpenClawNodeShape>(nodePath);
  const gatewayPort =
    typeof config?.gateway?.port === 'number' && config.gateway.port > 0
      ? config.gateway.port
      : typeof node?.gateway?.port === 'number' && node.gateway.port > 0
        ? node.gateway.port
        : 18789;
  const gatewayMode = config?.gateway?.mode === 'remote' ? 'remote' : 'local';

  if (gatewayMode === 'remote') {
    const remoteUrl = config?.gateway?.remote?.url?.trim();
    if (remoteUrl) {
      try {
        const parsed = new URL(remoteUrl);
        if (parsed.hostname) {
          return {
            host: parsed.hostname,
            port: parsed.port ? Number.parseInt(parsed.port, 10) : gatewayPort,
            mode: 'remote',
          };
        }
      } catch {
      }
    }
  }

  return {
    host: node?.gateway?.host?.trim() || '127.0.0.1',
    port: gatewayPort,
    mode: 'local',
  };
}

async function probeGatewayPort(host: string, port: number, timeoutMs = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const socket = new net.Socket();

    const finish = (value: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      resolve(value);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));

    try {
      socket.connect(port, host);
    } catch {
      finish(false);
    }
  });
}

async function resolveGatewayVersion(): Promise<string | undefined> {
  const rootDir = getOpenClawRootDir();
  const config = await readJsonFile<OpenClawConfigShape>(path.join(rootDir, 'openclaw.json'));
  const version = config?.meta?.lastTouchedVersion?.trim();
  if (version) {
    return version;
  }

  const result = await runCommand(resolveOpenClawCommand(), ['--version']);
  if (!result.success) {
    return undefined;
  }

  const versionText = result.output.trim();
  return versionText || undefined;
}

async function resolveGatewayPid(): Promise<number | undefined> {
  const openclawRootDir = getOpenClawRootDir();
  const pidFile = path.join(openclawRootDir, 'gateway.pid');

  try {
    const pid = await readFile(pidFile, 'utf-8');
    const pidNum = Number.parseInt(pid.trim(), 10);
    if (Number.isFinite(pidNum) && pidNum > 0) {
      return pidNum;
    }
  } catch {
  }

  return undefined;
}

async function resolveGatewayUptimeFromPid(pidNum?: number): Promise<string | undefined> {
  if (!pidNum) {
    return undefined;
  }

  const result = await runCommand('ps', ['-p', String(pidNum), '-o', 'etime=']);
  if (!result.success) {
    return undefined;
  }

  const uptime = result.output.trim();
  return uptime || undefined;
}

async function hasGatewayStateArtifacts(): Promise<boolean> {
  const rootDir = getOpenClawRootDir();
  const candidates = [
    path.join(rootDir, 'openclaw.json'),
    path.join(rootDir, 'node.json'),
    path.join(rootDir, 'logs'),
  ];

  for (const candidate of candidates) {
    try {
      await stat(candidate);
      return true;
    } catch {
    }
  }

  return false;
}

export async function gatewayStatus(): Promise<GatewayStatus> {
  try {
    const target = await resolveGatewayTarget();
    const [reachable, pid, version] = await Promise.all([
      probeGatewayPort(target.host, target.port),
      resolveGatewayPid(),
      resolveGatewayVersion(),
    ]);

    if (reachable) {
      return {
        status: 'running',
        pid,
        uptime: await resolveGatewayUptimeFromPid(pid),
        version,
        host: target.host,
        port: target.port,
      };
    }

    const result = await runCommand(resolveOpenClawCommand(), ['gateway', 'status']);
    console.log('Gateway status command result:', {
      success: result.success,
      output: result.output,
      error: result.error,
    });

    if (result.success) {
      const output = result.output;
      if (output.includes('running') || output.includes('正在运行')) {
        return {
          status: 'running',
          pid,
          uptime: extractUptime(output) || await resolveGatewayUptimeFromPid(pid),
          version: extractVersion(output) || version,
          host: target.host,
          port: target.port,
        };
      }

      if (output.includes('stopped') || output.includes('已停止')) {
        return {
          status: 'stopped',
          version,
          host: target.host,
          port: target.port,
        };
      }

      return {
        status: 'error',
        error: output.trim() || `无法连接到 ${target.host}:${target.port}`,
        version,
        host: target.host,
        port: target.port,
      };
    }

    const hasState = await hasGatewayStateArtifacts();
    return {
      status: hasState ? 'stopped' : 'error',
      version,
      host: target.host,
      port: target.port,
      error: hasState
        ? `无法连接到 ${target.host}:${target.port}`
        : `未找到 OpenClaw 状态目录或配置文件：${getOpenClawRootDir()}`,
    };
  } catch (error: any) {
    console.error('Unexpected error in gatewayStatus:', error);
    return { 
      status: 'error', 
      error: `Failed to get gateway status: ${error.message}` 
    };
  }
}

export async function gatewayStart(): Promise<{ success: boolean; message: string }> {
  try {
    // 真实启动 gateway（后台运行）
    const child = spawn(resolveOpenClawCommand(), ['gateway', 'start'], {
      detached: true,
      stdio: 'ignore'
    });
    child.unref();
    
    // 等待几秒后检查状态
    await new Promise(resolve => setTimeout(resolve, 2000));
    const status = await gatewayStatus();
    
    if (status.status === 'running') {
      return { success: true, message: 'Gateway 启动成功' };
    } else {
      return { success: false, message: 'Gateway 启动失败' };
    }
  } catch (error: any) {
    return { 
      success: false, 
      message: `启动失败: ${error.message}` 
    };
  }
}

export async function gatewayStop(): Promise<{ success: boolean; message: string }> {
  try {
    // 真实停止 gateway - 使用 spawn 代替 execSync
    const result = await runCommand(resolveOpenClawCommand(), ['gateway', 'stop']);
    
    if (result.success) {
      // 等待几秒后检查状态
      await new Promise(resolve => setTimeout(resolve, 1000));
      const status = await gatewayStatus();
      
      if (status.status === 'stopped') {
        return { success: true, message: 'Gateway 停止成功' };
      } else {
        return { success: false, message: 'Gateway 停止失败: process still running' };
      }
    } else {
      return { success: false, message: `停止失败: ${result.error}` };
    }
  } catch (error: any) {
    return { 
      success: false, 
      message: `停止失败: ${error.message}` 
    };
  }
}

export async function gatewayRestart(): Promise<{ success: boolean; message: string }> {
  try {
    // 先停止
    const stopResult = await gatewayStop();
    if (!stopResult.success) {
      return stopResult;
    }
    
    // 等待 2 秒
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 再启动
    const startResult = await gatewayStart();
    return startResult;
  } catch (error: any) {
    return { 
      success: false, 
      message: `重启失败: ${error.message}` 
    };
  }
}

// 辅助函数
function extractUptime(output: string): string {
  const match = output.match(/uptime[:：]\s*([^\n]+)/i);
  return match ? match[1].trim() : '';
}

function extractVersion(output: string): string {
  const match = output.match(/version[:：]\s*([^\n]+)/i);
  return match ? match[1].trim() : '';
}

// IPC 设置函数
export function setupGatewayIPC() {
  ipcMain.handle('gateway:status', gatewayStatus);
  ipcMain.handle('gateway:start', gatewayStart);
  ipcMain.handle('gateway:stop', gatewayStop);
  ipcMain.handle('gateway:restart', gatewayRestart);
}