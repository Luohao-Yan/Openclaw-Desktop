import pkg from 'electron';
const { ipcMain } = pkg;
import { spawn } from 'child_process';
import { readFile, stat, writeFile } from 'fs/promises';
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

export interface GatewayCompatibilityRepairResult {
  success: boolean;
  message: string;
  steps: string[];
  status: GatewayStatus;
}

type OpenClawGatewayTarget = {
  host: string;
  port: number;
  mode: 'local' | 'remote';
  bind?: string;
  authMode?: string;
  remoteUrl?: string;
};

type OpenClawConfigShape = {
  meta?: {
    lastTouchedVersion?: string;
  };
  gateway?: {
    port?: number;
    mode?: string;
    bind?: string;
    host?: string;
    url?: string;
    token?: string;
    auth?: {
      mode?: string;
      token?: string;
    };
    remote?: {
      url?: string;
      token?: string;
    };
  };
};

type OpenClawNodeShape = {
  gateway?: {
    host?: string;
    port?: number;
  };
};

type OpenClawBindingShape = {
  agentId?: string;
  type?: string;
  match?: {
    channel?: string;
    accountId?: string;
    peer?: {
      kind?: string;
      id?: string;
    } | Record<string, never>;
    guildId?: string;
    teamId?: string;
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

export async function gatewayRepairCompatibility(): Promise<GatewayCompatibilityRepairResult> {
  const steps: string[] = [];
  const command = resolveOpenClawCommand();
  const rootDir = getOpenClawRootDir();
  const configPath = path.join(rootDir, 'openclaw.json');

  try {
    let doctorResult = await runCommand(command, ['doctor', '--repair']);
    if (!doctorResult.success) {
      const doctorFallbackResult = await runCommand(command, ['doctor', '--fix']);
      if (doctorFallbackResult.success) {
        doctorResult = doctorFallbackResult;
        steps.push('已执行兼容回退修复：openclaw doctor --fix');
      }
    }

    if (doctorResult.success) {
      if (!steps.length) {
        steps.push('已执行官方修复：openclaw doctor --repair');
      }
    } else {
      steps.push(`官方修复返回异常：${doctorResult.error || doctorResult.output || 'unknown error'}`);
    }

    let status = await gatewayStatus();
    if (status.status === 'running') {
      steps.push('Gateway 状态检查通过。');
      return {
        success: true,
        message: '已按官方流程修复并恢复 Gateway 连接。',
        steps,
        status,
      };
    }

    const statusCommand = await runCommand(command, ['gateway', 'status']);
    const combinedStatusOutput = `${statusCommand.output || ''}
${statusCommand.error || ''}`.trim().toLowerCase();

    const needsServiceInstall = combinedStatusOutput.includes('service not installed')
      || combinedStatusOutput.includes('service unit not found')
      || combinedStatusOutput.includes('launchagent (not loaded)')
      || combinedStatusOutput.includes('path is not set');

    if (needsServiceInstall) {
      const installResult = await runCommand(command, ['gateway', 'install']);
      if (installResult.success) {
        steps.push('已执行 openclaw gateway install。');
      } else {
        steps.push(`Gateway 安装返回异常：${installResult.error || installResult.output || 'unknown error'}`);
      }

      const startResult = await runCommand(command, ['gateway', 'start']);
      if (startResult.success) {
        steps.push('已执行 openclaw gateway start。');
      } else {
        steps.push(`Gateway 启动返回异常：${startResult.error || startResult.output || 'unknown error'}`);
      }

      status = await waitForGatewayReady();
      if (status.status === 'running') {
        return {
          success: true,
          message: '已自动补齐 Gateway 服务安装并恢复运行。',
          steps,
          status,
        };
      }
    }

    if (combinedStatusOutput.includes('bindings.') || combinedStatusOutput.includes('invalid config at')) {
      const rawConfig = await readJsonFile<Record<string, any>>(configPath);
      if (rawConfig) {
        const sanitized = sanitizeBindingsForCompatibility(rawConfig);
        if (sanitized.changed) {
          await writeFile(configPath, `${JSON.stringify(sanitized.nextConfig, null, 2)}\n`, 'utf-8');
          steps.push(...sanitized.changes);
          steps.push('已应用最小 JSON 兼容修复，并保留其余配置内容不变。');
        }
      }
    }

    const restartResult = await runCommand(command, ['gateway', 'restart']);
    if (restartResult.success) {
      steps.push('已执行 openclaw gateway restart。');
    } else {
      steps.push(`Gateway 重启返回异常：${restartResult.error || restartResult.output || 'unknown error'}`);
    }

    status = await waitForGatewayReady();
    if (status.status === 'running') {
      return {
        success: true,
        message: '兼容性修复完成，Gateway 已恢复运行。',
        steps,
        status,
      };
    }

    return {
      success: false,
      message: status.error || '兼容性修复已执行，但 Gateway 仍未恢复。',
      steps,
      status,
    };
  } catch (error: any) {
    const status = await gatewayStatus().catch(() => ({
      status: 'error' as const,
      error: error.message,
    }));

    return {
      success: false,
      message: `兼容性修复失败：${error.message}`,
      steps,
      status,
    };
  }
}

function normalizeLoopbackHost(host?: string): string {
  const value = host?.trim();
  if (!value) {
    return '127.0.0.1';
  }

  if (value === 'localhost' || value === '::1') {
    return '127.0.0.1';
  }

  return value;
}

function inferHostFromBind(bind?: string): string | undefined {
  const normalizedBind = bind?.trim().toLowerCase();
  if (!normalizedBind) {
    return undefined;
  }

  if (normalizedBind === 'loopback' || normalizedBind === 'local') {
    return '127.0.0.1';
  }

  if (normalizedBind === 'lan' || normalizedBind === 'tailnet' || normalizedBind === 'custom') {
    return '0.0.0.0';
  }

  return undefined;
}

function hasConfiguredAuth(config?: OpenClawConfigShape): boolean {
  const authMode = config?.gateway?.auth?.mode?.trim();
  const authToken = config?.gateway?.auth?.token?.trim();
  const legacyToken = config?.gateway?.token?.trim();
  const remoteToken = config?.gateway?.remote?.token?.trim();

  return Boolean(authMode || authToken || legacyToken || remoteToken);
}

function isEmptyObject(value: unknown): value is Record<string, never> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && Object.keys(value as Record<string, unknown>).length === 0;
}

function sanitizeBindingsForCompatibility(config: Record<string, any>): { changed: boolean; changes: string[]; nextConfig: Record<string, any> } {
  const rawBindings = Array.isArray(config.bindings) ? config.bindings : null;
  if (!rawBindings) {
    return {
      changed: false,
      changes: [],
      nextConfig: config,
    };
  }

  let changed = false;
  const changes: string[] = [];
  const nextBindings = rawBindings.map((binding: OpenClawBindingShape, index: number) => {
    const nextBinding: OpenClawBindingShape = {
      ...binding,
      match: binding?.match ? { ...binding.match } : binding?.match,
    };

    if (nextBinding.match && isEmptyObject(nextBinding.match.peer)) {
      delete nextBinding.match.peer;
      changed = true;
      changes.push(`已移除 bindings.${index}.match.peer 空对象，以兼容新版 schema。`);
    }

    return nextBinding;
  });

  if (!changed) {
    return {
      changed: false,
      changes,
      nextConfig: config,
    };
  }

  return {
    changed: true,
    changes,
    nextConfig: {
      ...config,
      bindings: nextBindings,
    },
  };
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
  const bind = config?.gateway?.bind?.trim();
  const authMode = config?.gateway?.auth?.mode?.trim();
  const explicitGatewayUrl = config?.gateway?.url?.trim();

  if (gatewayMode === 'remote') {
    const remoteUrl = config?.gateway?.remote?.url?.trim() || explicitGatewayUrl;
    if (remoteUrl) {
      try {
        const parsed = new URL(remoteUrl);
        if (parsed.hostname) {
          return {
            host: normalizeLoopbackHost(parsed.hostname),
            port: parsed.port ? Number.parseInt(parsed.port, 10) : gatewayPort,
            mode: 'remote',
            bind,
            authMode,
            remoteUrl,
          };
        }
      } catch {
      }
    }
  }

  const configuredHost =
    config?.gateway?.host?.trim() ||
    inferHostFromBind(bind) ||
    node?.gateway?.host?.trim() ||
    '127.0.0.1';

  return {
    host: normalizeLoopbackHost(configuredHost),
    port: gatewayPort,
    mode: 'local',
    bind,
    authMode,
    remoteUrl: explicitGatewayUrl,
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

async function waitForGatewayReady(maxAttempts: number = 8, delayMs: number = 1500): Promise<GatewayStatus> {
  let lastStatus: GatewayStatus = {
    status: 'error',
    error: 'Gateway warm-up timed out',
  };

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    lastStatus = await gatewayStatus();
    if (lastStatus.status === 'running') {
      return lastStatus;
    }
  }

  return lastStatus;
}

function diagnoseGatewayFailure(target: OpenClawGatewayTarget, commandOutput?: string): string {
  const output = commandOutput?.trim() || '';
  const lowerOutput = output.toLowerCase();
  const bind = target.bind?.trim().toLowerCase();
  const authMode = target.authMode?.trim();
  const isRemote = target.mode === 'remote';
  const isNonLoopbackBind = bind === 'lan' || bind === 'tailnet' || bind === 'custom';

  if (lowerOutput.includes('unauthorized')) {
    return isRemote
      ? `Gateway 已可达，但远程认证失败。请检查 remote URL 与认证配置：${target.remoteUrl || `${target.host}:${target.port}`}`
      : `Gateway 已可达，但当前认证失败。请检查 gateway.auth.mode 与凭据配置。`;
  }

  if (lowerOutput.includes('config invalid') || lowerOutput.includes('invalid config at')) {
    if (lowerOutput.includes('bindings.')) {
      return '当前 OpenClaw 配置已不兼容新版 schema，bindings 项存在无效结构。请修正 bindings.match 字段后再重启 Gateway。';
    }

    return '当前 OpenClaw 配置无法通过新版校验。请先修复 openclaw.json，再重新启动 Gateway。';
  }

  if (lowerOutput.includes('device identity required') || lowerOutput.includes('connect.challenge')) {
    return '检测到新版设备认证流程。当前客户端或本地状态未完成 connect.challenge / 设备身份校验，请升级客户端并重新配对设备。';
  }

  if (lowerOutput.includes('pairing required')) {
    return 'Gateway 要求设备配对后才能连接。请在 Gateway 侧批准当前设备或重新执行 pairing。';
  }

  if (lowerOutput.includes('service not installed') || lowerOutput.includes('service unit not found')) {
    return '当前 Gateway 服务尚未安装。请先执行 openclaw gateway install，再重新启动 Gateway。';
  }

  if (lowerOutput.includes('launchagent (not loaded)') || lowerOutput.includes('not loaded')) {
    return '当前 macOS LaunchAgent 没有加载，Gateway 没有真正驻留运行。请先修复服务安装状态，再重新启动。';
  }

  if (lowerOutput.includes('path is not set')) {
    return '当前 Gateway 服务配置已过期：服务环境没有正确设置 PATH。请执行 openclaw doctor --repair 或重新安装 Gateway 服务。';
  }

  if (lowerOutput.includes('refusing to bind gateway') || lowerOutput.includes('without auth')) {
    return '当前 Gateway 使用了非 loopback 暴露，但没有正确配置 gateway.auth.*。新版会拒绝此类绑定。';
  }

  if (lowerOutput.includes('rpc probe: failed')) {
    return isRemote
      ? `远程 Gateway 似乎正在运行，但当前 URL 或认证不可用：${target.remoteUrl || `${target.host}:${target.port}`}`
      : `Gateway 似乎正在运行，但当前本地连接不可用，可能是认证、绑定或设备身份不匹配。`;
  }

  if (lowerOutput.includes('gateway connect failed')) {
    return isRemote
      ? `远程 Gateway 连接失败。请检查 gateway.mode=remote 时的 gateway.remote.url 与认证信息。`
      : `本地 Gateway 连接失败。请检查 host/port、gateway.bind 以及认证配置。`;
  }

  if (isNonLoopbackBind && !authMode) {
    return `检测到 Gateway bind=${bind}。新版对非 loopback 暴露强制要求 gateway.auth.*，否则会拒绝连接。`;
  }

  if (isRemote && target.remoteUrl) {
    return `当前处于 remote 模式，目标为 ${target.remoteUrl}。如果本地 Gateway 正常但 desktop 仍报错，通常是 remote URL 或凭据未同步。`;
  }

  return `无法连接到 ${target.host}:${target.port}`;
}

function formatCommandMissingMessage(command: string, rootDir: string): string {
  return `未找到 OpenClaw 可执行命令：${command}。当前 root 目录是 ${rootDir}，但桌面端仍需能实际执行 OpenClaw CLI。请在设置中配置 openclaw 可执行文件绝对路径，或确保 openclaw 已安装并在 PATH 中可用。`;
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
        error: diagnoseGatewayFailure(target, output),
        version,
        host: target.host,
        port: target.port,
      };
    }

    const hasState = await hasGatewayStateArtifacts();
    const config = await readJsonFile<OpenClawConfigShape>(path.join(getOpenClawRootDir(), 'openclaw.json'));
    const authConfigured = hasConfiguredAuth(config);
    const bind = target.bind?.trim().toLowerCase();
    const isNonLoopbackBind = bind === 'lan' || bind === 'tailnet' || bind === 'custom';
    const commandFailureOutput = `${result.output || ''}\n${result.error || ''}`.trim();
    const diagnosedError = commandFailureOutput
      ? diagnoseGatewayFailure(target, commandFailureOutput)
      : undefined;

    return {
      status: hasState ? 'stopped' : 'error',
      version,
      host: target.host,
      port: target.port,
      error: hasState
        ? diagnosedError ||
          (isNonLoopbackBind && !authConfigured
            ? '检测到非 loopback Gateway 暴露，但未发现可用认证配置。新版 Gateway 会拒绝此类连接。'
            : target.mode === 'remote'
              ? `当前为 remote 模式，但无法访问目标 ${target.remoteUrl || `${target.host}:${target.port}`}`
              : `无法连接到 ${target.host}:${target.port}`)
        : diagnosedError ||
          `未找到 OpenClaw 状态目录或配置文件：${getOpenClawRootDir()}`,
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
    const command = resolveOpenClawCommand();
    const commandCheck = await runCommand(command, ['--version']);
    if (!commandCheck.success) {
      const errorText = `${commandCheck.output || ''}\n${commandCheck.error || ''}`;
      const lowerErrorText = errorText.toLowerCase();
      if (lowerErrorText.includes('enoent') || lowerErrorText.includes('not found')) {
        return {
          success: false,
          message: formatCommandMissingMessage(command, getOpenClawRootDir()),
        };
      }

      return {
        success: false,
        message: `启动失败：无法执行 OpenClaw 命令 ${command}。${commandCheck.error || '请检查可执行文件路径配置。'}`,
      };
    }

    const preflightStatus = await runCommand(command, ['gateway', 'status']);
    const preflightOutput = `${preflightStatus.output || ''}\n${preflightStatus.error || ''}`.trim();
    if (preflightOutput) {
      const preflightLower = preflightOutput.toLowerCase();
      if (preflightLower.includes('service not installed') || preflightLower.includes('service unit not found')) {
        return {
          success: false,
          message: 'Gateway 服务尚未安装。请先执行 openclaw gateway install，或在桌面端的一键修复中补齐服务。',
        };
      }
    }

    // 真实启动 gateway（后台运行）
    const child = spawn(command, ['gateway', 'start'], {
      detached: true,
      stdio: 'ignore',
    });

    const spawnResult = await new Promise<{ success: boolean; error?: string }>((resolve) => {
      let settled = false;

      const finish = (result: { success: boolean; error?: string }) => {
        if (settled) {
          return;
        }
        settled = true;
        resolve(result);
      };

      child.once('spawn', () => finish({ success: true }));
      child.once('error', (error) => finish({ success: false, error: error.message }));
    });

    if (!spawnResult.success) {
      const lowerError = spawnResult.error?.toLowerCase() || '';
      if (lowerError.includes('enoent') || lowerError.includes('not found')) {
        return {
          success: false,
          message: formatCommandMissingMessage(command, getOpenClawRootDir()),
        };
      }

      return {
        success: false,
        message: `启动失败: ${spawnResult.error || '无法创建 OpenClaw 进程'}`,
      };
    }

    child.unref();

    const status = await waitForGatewayReady();
    
    if (status.status === 'running') {
      return { success: true, message: 'Gateway 启动成功' };
    } else {
      return {
        success: false,
        message: status.error || `Gateway 启动失败：无法连接到 ${status.host || '127.0.0.1'}:${status.port || 18789}`,
      };
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
  ipcMain.handle('gateway:repairCompatibility', gatewayRepairCompatibility);
}