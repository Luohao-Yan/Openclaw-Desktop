import pkg from 'electron';
const { ipcMain, BrowserWindow } = pkg;
import { join } from 'path';
import { existsSync } from 'fs';
import { getOpenClawRootDir, resolveOpenClawCommand, runCommand as runShellCommand } from './settings.js';
import { rm } from 'fs/promises';

// ============================================================================
// LocalInstancePoller — 后台轮询器
//
// 应用启动后立即开始轮询本地 OpenClaw 状态，将结果缓存在内存中。
// instances:getAll IPC 直接返回缓存，无需等待 CLI，实现零延迟响应。
// 状态变化时通过 IPC 事件主动推送到所有渲染进程窗口。
// ============================================================================

/** 轮询间隔（ms）。正常运行时 10s 刷新一次，够用且不影响系统性能 */
const POLL_INTERVAL_MS = 10_000;
/** 轮询 CLI 超时（ms）。控制在 5s，确保首次缓存尽快就绪 */
const POLL_TIMEOUT_MS = 5_000;

class LocalInstancePoller {
  /** 内存缓存：最新实例列表 */
  private _cache: InstanceInfo[] = [];
  /** 缓存是否已就绪（首次轮询完成后为 true） */
  private _ready = false;
  /** 轮询定时器 */
  private _timer: ReturnType<typeof setInterval> | null = null;
  /** 是否有轮询正在进行（防止并发） */
  private _polling = false;

  /** 获取缓存数据。若缓存未就绪返回 null，调用方应降级等待 */
  getCache(): InstanceInfo[] | null {
    return this._ready ? this._cache : null;
  }

  /** 启动后台轮询 */
  start(): void {
    // 立即执行首次轮询，使缓存尽快就绪；首次轮询完成后再启动定期器
    void this._poll().then(() => {
      this._timer = setInterval(() => this._poll(), POLL_INTERVAL_MS);
    });
  }

  /** 停止轮询（应用退出时调用） */
  stop(): void {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  /** 触发一次立即轮询（例如：用户执行了 start/stop/restart 操作后） */
  async pollNow(): Promise<InstanceInfo[]> {
    await this._poll();
    return this._cache;
  }

  /** 内部：执行一次轮询并更新缓存 */
  private async _poll(): Promise<void> {
    if (this._polling) return;
    this._polling = true;
    try {
      const [statusResult, nodeInstances] = await Promise.all([
        runShellCommand(resolveOpenClawCommand(), ['--no-color', 'gateway', 'status'], { timeoutMs: POLL_TIMEOUT_MS })
          .then(r => ({ ...r, output: stripAnsiAndControlChars(r.output || '') }))
          .catch(() => ({ success: false, output: '', error: 'timeout' })),
        getNodeInstances().catch(() => [] as InstanceInfo[]),
      ]);

      const gatewayInstances = parseOpenClawStatus(statusResult.output);
      const agentInstances = await getAgentInstances().catch(() => [] as InstanceInfo[]);
      const fresh = [...gatewayInstances, ...agentInstances, ...nodeInstances];

      const changed = JSON.stringify(fresh) !== JSON.stringify(this._cache);
      this._cache = fresh;
      this._ready = true;

      // 只有状态变化时才推送，减少不必要的渲染刷新
      if (changed) {
        this._pushToWindows(fresh);
      }
    } catch {
      // 静默失败，保留旧缓存
    } finally {
      this._polling = false;
    }
  }

  /** 向所有已打开的渲染窗口推送最新状态 */
  private _pushToWindows(instances: InstanceInfo[]): void {
    BrowserWindow.getAllWindows().forEach(win => {
      if (!win.isDestroyed()) {
        win.webContents.send('instances:updated', { instances });
      }
    });
  }
}

/** 全局单例 */
export const localInstancePoller = new LocalInstancePoller();

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
// 使用短超时（4s），避免命令挂起拖慢整体加载
async function getNodeInstances(): Promise<InstanceInfo[]> {
  const instances: InstanceInfo[] = [];

  try {
    // 检查节点配置，限制超时 4s
    const result = await runShellCommand(resolveOpenClawCommand(), ['--no-color', 'nodes', 'status'], { timeoutMs: 4_000 });
    if (result.success) {
      const output = stripAnsiAndControlChars(result.output || '');
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
    // 节点状态获取失败时静默降级，不阻塞主流程
    console.error('Error getting node instances:', error);
  }

  return instances;
}

export function setupInstancesIPC() {
  // 获取所有实例
  // 优先返回 poller 缓存（零延迟）；缓存未就绪（首次启动 1.5s 内）才降级执行 CLI
  ipcMain.handle('instances:getAll', async (): Promise<{ success: boolean; instances?: InstanceInfo[]; error?: string }> => {
    try {
      const cached = localInstancePoller.getCache();
      if (cached !== null) {
        return { success: true, instances: cached };
      }

      // 缓存未就绪：降级同步执行（此场景仅在首次进入页面且轮询尚未完成时触发）
      const [statusResult, nodeInstances] = await Promise.all([
        runShellCommand(resolveOpenClawCommand(), ['--no-color', 'gateway', 'status'], { timeoutMs: 8_000 })
          .then(r => ({ ...r, output: stripAnsiAndControlChars(r.output || '') })),
        getNodeInstances(),
      ]);
      const gatewayInstances = parseOpenClawStatus(statusResult.output);
      const agentInstances = await getAgentInstances();
      const allInstances = [...gatewayInstances, ...agentInstances, ...nodeInstances];
      localInstancePoller.pollNow(); // 触发 pollNow 使缓存立即更新
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
        // 操作完成后立即刷新缓存并推送最新状态到前端
        localInstancePoller.pollNow();
        return result.success ? { success: true } : { success: false, error: result.error };
      }

      if (instanceId === 'openclaw-launchagent') {
        const result = await runOpenClawCommand(['gateway', 'install']);
        localInstancePoller.pollNow();
        return result.success ? { success: true } : { success: false, error: result.error };
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
        localInstancePoller.pollNow();
        return result.success ? { success: true } : { success: false, error: result.error };
      }

      if (instanceId === 'openclaw-launchagent') {
        const result = await runOpenClawCommand(['gateway', 'uninstall']);
        localInstancePoller.pollNow();
        return result.success ? { success: true } : { success: false, error: result.error };
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
        const stopResult = await runOpenClawCommand(['gateway', 'stop']);
        if (stopResult.success) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          const startResult = await runOpenClawCommand(['gateway', 'start']);
          localInstancePoller.pollNow();
          return startResult.success ? { success: true } : { success: false, error: `Failed to start: ${startResult.error}` };
        }
        return { success: false, error: `Failed to stop: ${stopResult.error}` };
      }

      if (instanceId === 'openclaw-launchagent') {
        await runOpenClawCommand(['gateway', 'uninstall']);
        await new Promise(resolve => setTimeout(resolve, 1000));
        const result = await runOpenClawCommand(['gateway', 'install']);
        localInstancePoller.pollNow();
        return result.success ? { success: true } : { success: false, error: result.error };
      }

      return { success: false, error: `Unsupported instance type or ID: ${instanceId}` };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // 删除实例（仅支持停止 Gateway 服务）
  ipcMain.handle('instances:delete', async (_, instanceId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      if (instanceId === 'openclaw-gateway' || instanceId === 'openclaw-launchagent') {
        const result = await runOpenClawCommand(['gateway', 'uninstall']);
        localInstancePoller.pollNow();
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
      // 并行获取 gateway status 和 node instances
      const [statusResult, nodeInstances] = await Promise.all([
        runShellCommand(resolveOpenClawCommand(), ['--no-color', 'gateway', 'status'], { timeoutMs: 8_000 })
          .then(r => ({ ...r, output: stripAnsiAndControlChars(r.output || '') })),
        getNodeInstances(),
      ]);

      const instances = parseOpenClawStatus(statusResult.output);
      const agentInstances = await getAgentInstances();

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

  // 快速本地状态查询（供实例列表页首次渲染使用）
  // 使用 3s 超时，仅判断 Gateway 是否存活，不做完整 status 解析
  ipcMain.handle('instances:quickStatus', async (): Promise<{
    success: boolean;
    gatewayRunning: boolean;
    gatewayPort?: number;
    error?: string;
  }> => {
    try {
      const result = await runShellCommand(
        resolveOpenClawCommand(),
        ['--no-color', 'gateway', 'status'],
        { timeoutMs: 3_000 },
      );
      const output = stripAnsiAndControlChars(result.output || '');
      const instances = parseOpenClawStatus(output);
      const gateway = instances.find((i) => i.id === 'openclaw-gateway');
      return {
        success: true,
        gatewayRunning: gateway?.status === 'running',
        gatewayPort: gateway?.port,
      };
    } catch {
      // 超时或命令不存在时，视为未运行
      return { success: true, gatewayRunning: false };
    }
  });
}