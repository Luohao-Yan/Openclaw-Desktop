import pkg from 'electron';
const { ipcMain } = pkg;
import os from 'os';
import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { getOpenClawRootDir } from './settings.js';

interface SystemStats {
  cpu: number; // CPU使用率百分比
  memory: number; // 内存使用率百分比
  disk: number; // 磁盘使用率百分比（OpenClaw目录所在磁盘）
  network: number; // 网络活动百分比
  uptime: number; // 网关运行时间（秒）
}

async function runCommand(cmd: string, args: string[]): Promise<{ success: boolean; output: string; error?: string }> {
  return new Promise((resolve) => {
    try {
      const child = spawn(cmd, args);
      let output = '';
      let errorOutput = '';
      let settled = false;

      const finish = (result: { success: boolean; output: string; error?: string }) => {
        if (settled) {
          return;
        }
        settled = true;
        resolve(result);
      };

      child.stdout.on('data', (data) => {
        output += data.toString();
      });

      child.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          finish({ success: true, output });
          return;
        }
        finish({
          success: false,
          output,
          error: errorOutput || `Command exited with code ${code}`,
        });
      });

      child.on('error', (error) => {
        finish({ success: false, output, error: error.message });
      });

      setTimeout(() => {
        try {
          child.kill();
        } catch {
        }
        finish({ success: false, output, error: 'Command timeout' });
      }, 5000);
    } catch (error: any) {
      resolve({ success: false, output: '', error: error.message });
    }
  });
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function parseElapsedTimeToSeconds(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) {
    return 0;
  }

  const parts = trimmed.split(':');
  let seconds = 0;
  if (parts.length === 3) {
    const dayHourPart = parts[0] || '0';
    if (dayHourPart.includes('-')) {
      const [days, hours] = dayHourPart.split('-').map((item) => Number(item) || 0);
      seconds += days * 86400 + hours * 3600;
    } else {
      seconds += (Number(dayHourPart) || 0) * 3600;
    }
    seconds += (Number(parts[1]) || 0) * 60 + (Number(parts[2]) || 0);
    return seconds;
  }

  if (parts.length === 2) {
    return (Number(parts[0]) || 0) * 60 + (Number(parts[1]) || 0);
  }

  return Number(trimmed) || 0;
}

// 获取CPU使用率
async function getCpuUsage(): Promise<number> {
  try {
    if (process.platform === 'darwin') {
      const result = await runCommand('ps', ['-A', '-o', '%cpu']);
      if (result.success) {
        const total = result.output
          .split('\n')
          .slice(1)
          .map((line) => Number.parseFloat(line.trim()))
          .filter((value) => Number.isFinite(value))
          .reduce((sum, value) => sum + value, 0);
        const normalized = total / Math.max(1, os.cpus().length);
        return Math.min(100, round1(normalized));
      }
    }

    const loadavg = os.loadavg()[0];
    const cpus = os.cpus().length;
    const usagePercent = (loadavg / Math.max(1, cpus)) * 100;
    return Math.min(100, round1(usagePercent));
  } catch (error) {
    console.error('Failed to get CPU usage:', error);
    return 0;
  }
}

// 获取内存使用率
async function getMemoryUsage(): Promise<number> {
  try {
    if (process.platform === 'darwin') {
      const result = await runCommand('vm_stat', []);
      if (result.success) {
        const pageSizeMatch = result.output.match(/page size of (\d+) bytes/i);
        const pageSize = pageSizeMatch ? Number.parseInt(pageSizeMatch[1], 10) : 4096;
        const pages = Object.fromEntries(
          result.output
            .split('\n')
            .map((line) => {
              const match = line.match(/^(.+?):\s+(\d+)\./);
              return match ? [match[1].trim(), Number.parseInt(match[2], 10)] : null;
            })
            .filter((entry): entry is [string, number] => Boolean(entry)),
        );
        const freePages = (pages['Pages free'] || 0) + (pages['Pages speculative'] || 0);
        const totalMem = os.totalmem();
        const freeMem = freePages * pageSize;
        const usedMem = Math.max(0, totalMem - freeMem);
        return round1((usedMem / totalMem) * 100);
      }
    }

    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const usagePercent = (usedMem / totalMem) * 100;
    return round1(usagePercent);
  } catch (error) {
    console.error('Failed to get memory usage:', error);
    return 0;
  }
}

// 获取磁盘使用率（OpenClaw目录所在磁盘）
async function getDiskUsage(): Promise<number> {
  try {
    const openclawPath = getOpenClawRootDir();
    const result = await runCommand('df', ['-k', openclawPath]);
    if (!result.success) {
      return 0;
    }
    const lines = result.output.trim().split('\n');
    const parts = (lines[lines.length - 1] || '').trim().split(/\s+/);
    if (parts.length >= 5) {
      const used = parseInt(parts[2], 10);
      const total = parseInt(parts[1], 10);
      if (total > 0) {
        const usagePercent = (used / total) * 100;
        return round1(usagePercent);
      }
    }
    return 0;
  } catch (error) {
    console.error('Failed to get disk usage:', error);
    return 0;
  }
}

async function getNetworkActivity(): Promise<number> {
  try {
    if (process.platform === 'darwin') {
      const result = await runCommand('netstat', ['-ib']);
      if (!result.success) {
        return 0;
      }

      const lines = result.output.trim().split('\n').slice(1);
      let totalBytes = 0;
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 10) {
          continue;
        }
        const ibytes = Number.parseInt(parts[6] || '0', 10);
        const obytes = Number.parseInt(parts[9] || '0', 10);
        if (Number.isFinite(ibytes)) {
          totalBytes += ibytes;
        }
        if (Number.isFinite(obytes)) {
          totalBytes += obytes;
        }
      }

      const oneGb = 1024 * 1024 * 1024;
      return Math.min(100, round1((totalBytes / oneGb) * 100));
    }

    const interfaces = os.networkInterfaces();
    const activeCount = Object.values(interfaces)
      .flat()
      .filter((item) => item && !item.internal)
      .length;
    return Math.min(100, activeCount * 10);
  } catch (error) {
    console.error('Failed to get network activity:', error);
    return 0;
  }
}

async function getGatewayUptime(): Promise<number> {
  try {
    const pidFile = path.join(getOpenClawRootDir(), 'gateway.pid');
    const pid = (await fs.readFile(pidFile, 'utf-8')).trim();
    
    // 检查PID是否有效
    if (!pid || isNaN(parseInt(pid, 10))) {
      return 0;
    }

    const result = await runCommand('ps', ['-p', pid, '-o', 'etime=']);
    if (!result.success) {
      return 0;
    }
    const etime = result.output.trim();

    if (!etime) {
      return 0;
    }

    return parseElapsedTimeToSeconds(etime);
  } catch {
    return 0;
  }
}

export async function getSystemStats(): Promise<SystemStats> {
  try {
    const [cpu, memory, disk, network, uptime] = await Promise.allSettled([
      getCpuUsage(),
      getMemoryUsage(),
      getDiskUsage(),
      getNetworkActivity(),
      getGatewayUptime(),
    ]);
    
    return {
      cpu: cpu.status === 'fulfilled' ? cpu.value : 0,
      memory: memory.status === 'fulfilled' ? memory.value : 0,
      disk: disk.status === 'fulfilled' ? disk.value : 0,
      network: network.status === 'fulfilled' ? network.value : 0,
      uptime: uptime.status === 'fulfilled' ? uptime.value : 0,
    };
  } catch (error) {
    console.error('Failed to get system stats:', error);
    return { cpu: 0, memory: 0, disk: 0, network: 0, uptime: 0 };
  }
}

// IPC设置
export function setupSystemIPC() {
  ipcMain.handle('system:stats', getSystemStats);
}