import pkg from 'electron';
const { app, ipcMain } = pkg;
import os from 'os';
import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import {
  getBundledOpenClawPath,
  detectOpenClawInstallation,
  getOpenClawRootDir,
  resolveOpenClawCommand,
  resolveNpmGlobalBin,
  getVersionManagerPaths,
} from './settings.js';
import { resolveRuntime, getBundledNodePath, getBundledOpenClawCLIPath } from './runtime.js';
import type { RuntimeTier } from './runtimeLogic.js';

/** 可自动修复的环境问题 */
interface FixableIssue {
  /** 问题唯一标识 */
  id: string;
  /** 问题描述标签 */
  label: string;
  /** 修复动作类型：安装 / 升级 / 修复 PATH */
  action: 'install' | 'upgrade' | 'fixPath';
  /** 严重程度：必要 / 可选 */
  severity: 'required' | 'optional';
}

interface SystemStats {
  cpu: number; // CPU使用率百分比
  memory: number; // 内存使用率百分比
  disk: number; // 磁盘使用率百分比（OpenClaw目录所在磁盘）
  network: number; // 网络活动百分比
  uptime: number; // 网关运行时间（秒）
}

interface RuntimeInfo {
  appVersion: string;
  appVersionLabel: string;
  channel: 'preview';
  userName: string;
  openclawCompatTail: number;
  runtimeVersion: string;
  preloadVersion: string;
  mainVersion: string;
  capabilitiesVersion: number;
}

interface RuntimeCapabilities {
  gateway: {
    status: boolean;
    start: boolean;
    stop: boolean;
    restart: boolean;
    repairCompatibility: boolean;
  };
  settings: {
    diagnoseRoot: boolean;
  };
  system: {
    runtimeInfo: boolean;
    capabilities: boolean;
    stats: boolean;
  };
}

// 安装进度阶段定义
type InstallStage = 'download' | 'install' | 'init' | 'verify';

function sendInstallProgress(
  sender: Electron.WebContents,
  stage: InstallStage,
  status: 'running' | 'done' | 'error',
  message?: string,
) {
  try {
    sender.send('install:progress', { stage, status, message });
  } catch {
    // sender 可能已销毁，忽略
  }
}

async function installOpenClawForSetup(sender: Electron.WebContents): Promise<SetupInstallResult> {
  const platform = process.platform;
  const INSTALL_TIMEOUT = 5 * 60 * 1000;

  // 实时输出回调
  const sendOutput = (data: string, isError: boolean) => {
    try {
      sender.send('install:output', { data, isError });
    } catch {
      // sender 可能已销毁，忽略
    }
  };

  // ── 阶段 1: 下载安装包 ──
  sendInstallProgress(sender, 'download', 'running', '正在下载安装脚本…');

  const isWindows = platform === 'win32';
  const shellBin = isWindows
    ? 'powershell'
    : (process.env.SHELL && process.env.SHELL.startsWith('/') ? process.env.SHELL : '/bin/bash');
  const installCmd = isWindows
    ? 'powershell -NoProfile -ExecutionPolicy Bypass -Command "iwr -useb https://openclaw.ai/install.ps1 | iex"'
    : 'curl -fsSL https://openclaw.ai/install.sh | bash';

  const installResult = isWindows
    ? await runShellCommand(installCmd, INSTALL_TIMEOUT, shellBin, sendOutput)
    : await runLoginShellCommand(wrapInstallCommand(installCmd), INSTALL_TIMEOUT, shellBin, true, sendOutput);

  // 脚本退出码非 0 时，先检测 openclaw 是否实际已安装
  // install.sh 在某些环境（无 TTY、--probe 失败等）会以非 0 退出，但安装本身可能已成功
  if (!installResult.success) {
    const fallbackDetection = await detectOpenClawInstallation();
    if (fallbackDetection.source === 'not-found') {
      sendInstallProgress(sender, 'download', 'error', installResult.error || '下载或安装脚本执行失败');
      return {
        success: false,
        message: `OpenClaw 自动安装失败：${installResult.error || '未知错误'}`,
        command: installCmd,
        output: installResult.output,
        error: installResult.error,
      };
    }
    // 检测到 openclaw，说明安装成功，忽略脚本非 0 退出码
  }

  sendInstallProgress(sender, 'download', 'done', '安装脚本执行完成');

  // ── 阶段 2: 安装 OpenClaw（脚本已执行，检测二进制是否就位）──
  sendInstallProgress(sender, 'install', 'running', '正在检测安装结果…');

  const detection = await detectOpenClawInstallation();
  if (detection.source === 'not-found') {
    sendInstallProgress(sender, 'install', 'error', '安装脚本执行完成但未找到 openclaw 可执行文件');
    return {
      success: false,
      message: '安装脚本执行完成，但未检测到 openclaw 命令。请检查安装脚本输出。',
      command: installCmd,
      output: installResult.output,
      error: '安装后未检测到 openclaw 可执行文件',
    };
  }

  sendInstallProgress(sender, 'install', 'done', `已检测到 openclaw: ${detection.path}`);

  // ── 阶段 3: 初始化数据目录 ──
  sendInstallProgress(sender, 'init', 'running', '正在检查数据目录…');

  const rootDir = getOpenClawRootDir();
  try {
    await fs.access(rootDir);
    sendInstallProgress(sender, 'init', 'done', `数据目录已就绪: ${rootDir}`);
  } catch {
    // 目录不存在，尝试创建
    try {
      await fs.mkdir(rootDir, { recursive: true });
      sendInstallProgress(sender, 'init', 'done', `已创建数据目录: ${rootDir}`);
    } catch (mkdirErr: any) {
      sendInstallProgress(sender, 'init', 'error', `无法创建数据目录: ${mkdirErr.message}`);
      // 不阻断，继续验证
    }
  }

  // ── 阶段 4: 验证安装结果 ──
  sendInstallProgress(sender, 'verify', 'running', '正在验证 openclaw 版本…');

  // 如果检测到的是目录而非可执行文件，重新通过 npm global bin 查找
  let effectiveCommand: string;
  if (detection.type === 'executable') {
    effectiveCommand = detection.path;
  } else {
    const npmBin = await resolveNpmGlobalBin();
    const npmCandidate = npmBin ? `${npmBin}/openclaw` : '';
    if (npmCandidate) {
      try {
        await fs.access(npmCandidate, fs.constants.X_OK);
        effectiveCommand = npmCandidate;
        sendInstallProgress(sender, 'verify', 'running', `找到可执行文件: ${npmCandidate}`);
      } catch {
        effectiveCommand = resolveOpenClawCommand();
      }
    } else {
      effectiveCommand = resolveOpenClawCommand();
    }
  }

  const versionResult = await runCommand(effectiveCommand, ['--version']);

  if (!versionResult.success) {
    sendInstallProgress(sender, 'verify', 'error', `openclaw --version 失败: ${versionResult.error || '未知错误'}`);
    return {
      success: false,
      message: '安装已完成但版本验证失败，openclaw 可能未正确安装。',
      command: installCmd,
      output: installResult.output,
      error: versionResult.error,
    };
  }

  sendInstallProgress(sender, 'verify', 'done', `版本: ${versionResult.output.trim()}`);

  return {
    success: true,
    message: 'OpenClaw 自动安装已完成，正在准备继续检测。',
    command: installCmd,
    output: installResult.output,
  };
}

// 专门用于执行 shell 命令（支持管道、重定向等 shell 特性）
async function runShellCommand(
  cmd: string,
  timeoutMs = 30000,
  shellBin = '/bin/sh',
  onOutput?: (data: string, isError: boolean) => void,
): Promise<{ success: boolean; output: string; error?: string }> {
  const shellPath = await getShellPath();
  return new Promise((resolve) => {
    try {
      const child = spawn(shellBin, ['-c', cmd], {
        env: { ...process.env, PATH: shellPath },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let output = '';
      let errorOutput = '';
      let settled = false;

      const finish = (result: { success: boolean; output: string; error?: string }) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      child.stdout?.on('data', (data: Buffer) => {
        const text = data.toString();
        output += text;
        if (onOutput) onOutput(text, false);
      });
      child.stderr?.on('data', (data: Buffer) => {
        const text = data.toString();
        errorOutput += text;
        if (onOutput) onOutput(text, true);
      });

      child.on('close', (code) => {
        if (code === 0) {
          finish({ success: true, output: output.trim() });
        } else {
          finish({ success: false, output: output.trim(), error: errorOutput.trim() || `exit code ${code}` });
        }
      });

      child.on('error', (err) => {
        finish({ success: false, output: '', error: err.message });
      });

      setTimeout(() => {
        try { child.kill(); } catch {}
        finish({ success: false, output, error: 'Installation timed out' });
      }, timeoutMs);
    } catch (err: any) {
      resolve({ success: false, output: '', error: err.message });
    }
  });
}

// 构建一个干净的环境变量集合，移除可能干扰安装的代理配置
function buildCleanInstallEnv(basePath: string): Record<string, string | undefined> {
  const env = { ...process.env, PATH: basePath };
  // 移除所有代理相关环境变量
  const proxyKeys = [
    'http_proxy', 'HTTP_PROXY',
    'https_proxy', 'HTTPS_PROXY',
    'all_proxy', 'ALL_PROXY',
    'no_proxy', 'NO_PROXY',
    'npm_config_proxy', 'npm_config_https_proxy',
    'NPM_CONFIG_PROXY', 'NPM_CONFIG_HTTPS_PROXY',
  ];
  for (const key of proxyKeys) {
    delete env[key];
  }
  return env;
}

// 在安装命令前注入 git 代理清理，避免 git config --global 中残留的代理阻断安装
// 直接备份并修改 ~/.gitconfig，安装完后恢复，确保 install.sh 内部 spawn 的子进程也能生效
function wrapInstallCommand(cmd: string): string {
  // 注意：这里的字符串会直接传给 shell 执行，$$ 是 shell 的 PID 变量，不是 JS 模板字符串
  // 所以用单引号拼接，避免 JS 解释 $ 符号
  const bakVar = 'GITCFG_BAK="$HOME/.gitconfig.openclaw-bak-$$"';
  const backup = 'cp "$HOME/.gitconfig" "$GITCFG_BAK" 2>/dev/null || true';
  const clearProxy = [
    'git config --global --unset-all http.proxy 2>/dev/null || true',
    'git config --global --unset-all https.proxy 2>/dev/null || true',
  ].join(' && ');
  const sshToHttps = [
    'git config --global url."https://github.com/".insteadOf "ssh://git@github.com/" 2>/dev/null || true',
    'git config --global url."https://github.com/".insteadOf "git@github.com:" 2>/dev/null || true',
  ].join(' && ');
  const restore = 'if [ -f "$GITCFG_BAK" ]; then mv "$GITCFG_BAK" "$HOME/.gitconfig"; fi';
  const setup = [bakVar, backup, clearProxy, sshToHttps].join(' && ');
  return `${setup} && (${cmd}); _exit_code=$?; ${restore}; exit $_exit_code`;
}

// Login shell 版本：用 -l -c 执行，确保 nvm/nodenv 等版本管理器的 PATH 完整
// 同时传入 NO_ONBOARD=1 和 TERM=dumb 避免安装脚本尝试交互
async function runLoginShellCommand(
  cmd: string,
  timeoutMs = 30000,
  shellBin = '/bin/bash',
  cleanProxy = false,
  onOutput?: (data: string, isError: boolean) => void,
): Promise<{ success: boolean; output: string; error?: string }> {
  const shellPath = await getShellPath();
  const baseEnv = cleanProxy ? buildCleanInstallEnv(shellPath) : { ...process.env, PATH: shellPath };
  return new Promise((resolve) => {
    try {
      const child = spawn(shellBin, ['-l', '-c', cmd], {
        env: {
          ...baseEnv,
          NO_ONBOARD: '1',
          TERM: 'dumb',
          CI: '1',
          // 避免安装脚本等待 TTY 输入
          OPENCLAW_INSTALL_NON_INTERACTIVE: '1',
          YES: '1',
          OPENCLAW_YES: '1',
          FORCE_YES: '1',
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // 自动回答所有交互式提示（写入 y 后关闭 stdin）
      try {
        child.stdin?.write('y\n');
        child.stdin?.end();
      } catch {}
      let output = '';
      let errorOutput = '';
      let settled = false;

      const finish = (result: { success: boolean; output: string; error?: string }) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      child.stdout?.on('data', (data: Buffer) => {
        const text = data.toString();
        output += text;
        if (onOutput) onOutput(text, false);
      });
      child.stderr?.on('data', (data: Buffer) => {
        const text = data.toString();
        errorOutput += text;
        if (onOutput) onOutput(text, true);
      });

      child.on('close', (code) => {
        if (code === 0) {
          finish({ success: true, output: output.trim() });
        } else {
          finish({ success: false, output: output.trim(), error: errorOutput.trim() || `exit code ${code}` });
        }
      });

      child.on('error', (err) => {
        finish({ success: false, output: '', error: err.message });
      });

      setTimeout(() => {
        try { child.kill(); } catch {}
        finish({ success: false, output, error: 'Installation timed out' });
      }, timeoutMs);
    } catch (err: any) {
      resolve({ success: false, output: '', error: err.message });
    }
  });
}

interface SetupEnvironmentCheckResult {
  platform: NodeJS.Platform;
  platformLabel: string;
  runtimeMode: 'bundled' | 'system' | 'missing';
  runtimeCommand?: string;
  bundledRuntimeAvailable: boolean;
  nodeInstalled: boolean;
  nodeVersion?: string;
  nodeVersionSatisfies: boolean;
  npmInstalled: boolean;
  npmVersion?: string;
  openclawInstalled: boolean;
  openclawVersion?: string;
  openclawCommand?: string;
  openclawConfigExists: boolean;
  openclawRootDir: string;
  recommendedInstallCommand: string;
  recommendedInstallLabel: string;
  notes: string[];
  /** 内置 Node.js 是否可用 */
  bundledNodeAvailable: boolean;
  /** 内置 Node.js 路径 */
  bundledNodePath?: string;
  /** 内置 OpenClaw CLI 是否可用 */
  bundledOpenClawAvailable: boolean;
  /** 内置 OpenClaw CLI 路径 */
  bundledOpenClawPath?: string;
  /** 当前生效的运行时层级 */
  runtimeTier: RuntimeTier;
  /** 可自动修复的问题列表 */
  fixableIssues: FixableIssue[];
}

interface SetupInstallResult {
  success: boolean;
  message: string;
  command: string;
  output?: string;
  error?: string;
}

const DESKTOP_APP_VERSION = '0.3.13-preview-2';
const OPENCLAW_COMPAT_TAIL = 8;
const DESKTOP_RUNTIME_VERSION = 'desktop-runtime-0.5.8';
const DESKTOP_PRELOAD_VERSION = 'desktop-preload-0.5.8';
const DESKTOP_MAIN_VERSION = 'desktop-main-0.5.8';
const CAPABILITIES_VERSION = 1;

function getDesktopAppVersion(): string {
  return app.getVersion?.() || DESKTOP_APP_VERSION;
}

function getDesktopAppVersionLabel(version: string): string {
  return `v${version}`;
}

function getDesktopUserName(): string {
  try {
    return os.userInfo().username || process.env.USER || 'OpenClaw';
  } catch {
    return process.env.USER || 'OpenClaw';
  }
}

// 通过 login shell 获取用户完整 PATH（解决 Electron 启动时不加载 .zshrc/.bashrc 的问题）
// 注意：只缓存非空结果，避免 shell 超时时缓存空值导致后续永远走 fallback
let _resolvedShellPath: string | null = null;
async function getShellPath(): Promise<string> {
  if (_resolvedShellPath && _resolvedShellPath.length > 0) return _resolvedShellPath;

  // 基础常见路径
  const extraPaths = [
    '/opt/homebrew/bin',
    '/opt/homebrew/sbin',
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin',
    `${os.homedir()}/.nvm/versions/node/current/bin`,
    `${os.homedir()}/.local/bin`,
    `${os.homedir()}/.cargo/bin`,
    // 合并版本管理器路径（nvm、volta、fnm、asdf、nodenv、n 等），与 settings.ts 保持一致
    ...getVersionManagerPaths(),
  ];

  // 用绝对路径避免 ENOENT，不依赖当前 PATH
  const shellBin = process.env.SHELL && process.env.SHELL.startsWith('/') ? process.env.SHELL : '/bin/sh';

  try {
    const result = await new Promise<string>((resolve) => {
      const child = spawn(shellBin, ['-l', '-c', 'echo $PATH'], { env: process.env });
      let out = '';
      child.stdout.on('data', (d: Buffer) => { out += d.toString(); });
      child.on('close', () => resolve(out.trim()));
      child.on('error', () => resolve(''));
      setTimeout(() => { try { child.kill(); } catch {} resolve(''); }, 3000);
    });

    if (result) {
      const combined = Array.from(new Set(result.split(':').concat(extraPaths))).join(':');
      _resolvedShellPath = combined;
      return combined;
    }
  } catch {}

  const fallback = Array.from(new Set((process.env.PATH || '').split(':').concat(extraPaths))).join(':');
  _resolvedShellPath = fallback;
  return fallback;
}

async function runCommand(cmd: string, args: string[], timeoutMs = 5000): Promise<{ success: boolean; output: string; error?: string }> {
  const shellPath = await getShellPath();
  return new Promise((resolve) => {
    try {
      const child = spawn(cmd, args, {
        env: { ...process.env, PATH: shellPath },
      });
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
      }, timeoutMs);
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

function extractElapsedTime(value: string): string | undefined {
  const lines = value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const matched = line.match(/(?:uptime|运行时间)[:：]?\s*([0-9:-]+)/i);
    if (matched?.[1]) {
      return matched[1].trim();
    }

    if (/^\d{1,2}:\d{2}$/.test(line) || /^\d{1,2}:\d{2}:\d{2}$/.test(line) || /^\d+-\d{1,2}:\d{2}:\d{2}$/.test(line)) {
      return line;
    }
  }

  return undefined;
}

async function resolveElapsedTimeFromPid(pid: string): Promise<number> {
  const result = await runCommand('ps', ['-p', pid, '-o', 'etime=']);
  if (!result.success) {
    return 0;
  }

  const etime = result.output.trim();
  if (!etime) {
    return 0;
  }

  return parseElapsedTimeToSeconds(etime);
}

function getPlatformLabel(platform: NodeJS.Platform): string {
  if (platform === 'darwin') {
    return 'macOS';
  }

  if (platform === 'win32') {
    return 'Windows';
  }

  if (platform === 'linux') {
    return 'Linux';
  }

  return platform;
}

function parseMajorVersion(version?: string): number | null {
  if (!version) {
    return null;
  }

  const cleaned = version.trim().replace(/^v/i, '');
  const major = Number.parseInt(cleaned.split('.')[0] || '', 10);
  return Number.isFinite(major) ? major : null;
}

async function getSetupEnvironmentCheck(): Promise<SetupEnvironmentCheckResult> {
  const platform = process.platform;
  const platformLabel = getPlatformLabel(platform);
  const openclawRootDir = getOpenClawRootDir();
  const configPath = path.join(openclawRootDir, 'openclaw.json');
  const resolvedCommand = resolveOpenClawCommand();
  const notes: string[] = [];
  const fixableIssues: FixableIssue[] = [];

  // ── 第一步：调用 Runtime Resolver 获取三级运行时解析结果 ──────────────────
  const runtime = await resolveRuntime();

  // 获取内置运行时路径信息
  const bundledNodePath = getBundledNodePath();
  const bundledOpenClawPath = getBundledOpenClawCLIPath();

  const recommendedInstallCommand = platform === 'win32'
    ? 'iwr -useb https://openclaw.ai/install.ps1 | iex'
    : 'curl -fsSL https://openclaw.ai/install.sh | bash';
  const recommendedInstallLabel = runtime.tier === 'bundled'
    ? '应用内置运行时（推荐）'
    : platform === 'win32'
      ? 'PowerShell 安装脚本（Windows / WSL）'
      : 'Shell 安装脚本（macOS / Linux）';

  // ── 第二步：当 bundled 完整可用时，跳过系统 Node.js/npm 检测 ──────────────
  if (runtime.tier === 'bundled') {
    // 内置运行时完整可用，仅检测 OpenClaw CLI 版本和配置文件
    const [openclawResult, configAccessResult] = await Promise.all([
      runCommand(runtime.openclawPath || resolvedCommand, ['--version']),
      fs.access(configPath).then(() => true).catch(() => false),
    ]);

    const openclawVersion = openclawResult.success ? openclawResult.output.trim() : undefined;

    notes.push('已使用应用内置 Node.js 运行时和内置 OpenClaw CLI，无需任何外部依赖。');

    if (configAccessResult) {
      notes.push('检测到现有 OpenClaw 配置，后续可选择直接复用当前安装。');
    } else {
      notes.push('尚未检测到 openclaw.json，首次安装完成后会自动生成配置。');
    }

    if (platform === 'win32') {
      notes.push('官方建议在 Windows 上通过 WSL2 使用 OpenClaw CLI。');
    }

    return {
      platform,
      platformLabel,
      runtimeMode: 'bundled',
      runtimeCommand: runtime.openclawPath || resolvedCommand,
      bundledRuntimeAvailable: true,
      nodeInstalled: true,
      nodeVersion: 'bundled',
      nodeVersionSatisfies: true,
      npmInstalled: true,
      npmVersion: 'bundled',
      openclawInstalled: openclawResult.success,
      openclawVersion,
      openclawCommand: runtime.openclawPath || undefined,
      openclawConfigExists: configAccessResult,
      openclawRootDir,
      recommendedInstallCommand,
      recommendedInstallLabel,
      notes,
      // 新增字段：Runtime Resolver 结果
      bundledNodeAvailable: runtime.bundledNodeAvailable,
      bundledNodePath: bundledNodePath || undefined,
      bundledOpenClawAvailable: runtime.bundledOpenClawAvailable,
      bundledOpenClawPath: bundledOpenClawPath || undefined,
      runtimeTier: runtime.tier,
      fixableIssues, // bundled 模式下无需修复
    };
  }

  // ── 第三步：非 bundled 模式，执行完整的系统环境检测 ────────────────────────

  // 先用完整路径扫描找到真实的 openclaw 可执行文件
  const detectedInstallation = await detectOpenClawInstallation();
  const effectiveOpenClawCommand = detectedInstallation.type === 'executable'
    ? detectedInstallation.path
    : resolvedCommand;

  const [nodeResult, npmResult, openclawResult, configAccessResult] = await Promise.all([
    runCommand('node', ['-v']),
    runCommand('npm', ['-v']),
    runCommand(effectiveOpenClawCommand, ['--version']),
    fs.access(configPath).then(() => true).catch(() => false),
  ]);

  const nodeVersion = nodeResult.success ? nodeResult.output.trim() : undefined;
  const nodeMajorVersion = parseMajorVersion(nodeVersion);
  const nodeVersionSatisfies = nodeMajorVersion !== null && nodeMajorVersion >= 22;
  const npmVersion = npmResult.success ? npmResult.output.trim() : undefined;
  const openclawVersion = openclawResult.success ? openclawResult.output.trim() : undefined;
  const openclawConfigExists = configAccessResult;
  const runtimeMode = openclawResult.success ? 'system' : 'missing';

  // ── 第四步：生成 fixableIssues 列表 ───────────────────────────────────────

  if (!nodeResult.success) {
    // Node.js 未安装 → 添加 install 修复动作
    fixableIssues.push({
      id: 'node-not-installed',
      label: '未检测到 Node.js，需要安装 Node.js 22 或更高版本',
      action: 'install',
      severity: 'required',
    });
    notes.push('未检测到 Node.js，请先安装 Node.js 22 或更高版本。');
  } else if (!nodeVersionSatisfies) {
    // Node.js 版本过低 → 添加 upgrade 修复动作
    fixableIssues.push({
      id: 'node-version-low',
      label: `当前 Node.js 版本 ${nodeVersion || '未知'} 低于最低要求 22`,
      action: 'upgrade',
      severity: 'required',
    });
    notes.push(`当前 Node 版本为 ${nodeVersion || '未知'}，OpenClaw 官方要求 Node >= 22。`);
  }

  // 检测 Node.js 是否已安装但 PATH 未正确配置（Runtime Resolver 检测到系统版本但 runCommand 未找到）
  if (!nodeResult.success && runtime.systemNodeVersion) {
    // Runtime Resolver 通过版本管理器路径找到了 Node.js，但当前 PATH 中未检测到
    fixableIssues.push({
      id: 'node-path-missing',
      label: '已安装 Node.js 但 PATH 环境变量未正确配置',
      action: 'fixPath',
      severity: 'required',
    });
    notes.push('检测到已安装的 Node.js 但 PATH 未正确配置，可尝试修复 PATH。');
  }

  if (!npmResult.success) {
    notes.push('未检测到 npm，请确认 Node.js 安装完整。');
  }

  if (!openclawResult.success) {
    notes.push('当前未检测到 openclaw 命令，建议先完成 CLI 安装。');
  } else {
    notes.push('当前使用系统中的 OpenClaw CLI。若要实现真正开箱即用，请在打包时附带内置运行时。');
  }

  if (platform === 'win32') {
    notes.push('官方建议在 Windows 上通过 WSL2 使用 OpenClaw CLI。');
  }

  if (openclawConfigExists) {
    notes.push('检测到现有 OpenClaw 配置，后续可选择直接复用当前安装。');
  } else {
    notes.push('尚未检测到 openclaw.json，首次安装完成后会自动生成配置。');
  }

  return {
    platform,
    platformLabel,
    runtimeMode,
    runtimeCommand: resolvedCommand,
    bundledRuntimeAvailable: runtime.bundledNodeAvailable && runtime.bundledOpenClawAvailable,
    nodeInstalled: nodeResult.success,
    nodeVersion,
    nodeVersionSatisfies,
    npmInstalled: npmResult.success,
    npmVersion,
    openclawInstalled: openclawResult.success,
    openclawVersion,
    openclawCommand: openclawResult.success ? effectiveOpenClawCommand : undefined,
    openclawConfigExists,
    openclawRootDir,
    recommendedInstallCommand,
    recommendedInstallLabel,
    notes,
    // 新增字段：Runtime Resolver 结果
    bundledNodeAvailable: runtime.bundledNodeAvailable,
    bundledNodePath: bundledNodePath || undefined,
    bundledOpenClawAvailable: runtime.bundledOpenClawAvailable,
    bundledOpenClawPath: bundledOpenClawPath || undefined,
    runtimeTier: runtime.tier,
    fixableIssues,
  };
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
    const pid = await fs.readFile(pidFile, 'utf-8')
      .then((value) => value.trim())
      .catch(() => '');

    if (pid && !isNaN(parseInt(pid, 10))) {
      const pidElapsed = await resolveElapsedTimeFromPid(pid);
      if (pidElapsed > 0) {
        return pidElapsed;
      }
    }

    const statusResult = await runCommand('openclaw', ['gateway', 'status']);
    if (statusResult.success) {
      const elapsed = extractElapsedTime(statusResult.output);
      if (elapsed) {
        const parsed = parseElapsedTimeToSeconds(elapsed);
        if (parsed > 0) {
          return parsed;
        }
      }
    }

    if (process.platform !== 'win32') {
      const pgrepResult = await runCommand('pgrep', ['-f', 'openclaw.*gateway']);
      if (pgrepResult.success) {
        const fallbackPid = pgrepResult.output
          .split('\n')
          .map((line) => line.trim())
          .find((line) => line && !isNaN(parseInt(line, 10)));

        if (fallbackPid) {
          const elapsed = await resolveElapsedTimeFromPid(fallbackPid);
          if (elapsed > 0) {
            return elapsed;
          }
        }
      }
    }

    return 0;
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

export function getRuntimeInfo(): RuntimeInfo {
  const appVersion = getDesktopAppVersion();

  return {
    appVersion,
    appVersionLabel: getDesktopAppVersionLabel(appVersion),
    channel: 'preview',
    userName: getDesktopUserName(),
    openclawCompatTail: OPENCLAW_COMPAT_TAIL,
    runtimeVersion: DESKTOP_RUNTIME_VERSION,
    preloadVersion: DESKTOP_PRELOAD_VERSION,
    mainVersion: DESKTOP_MAIN_VERSION,
    capabilitiesVersion: CAPABILITIES_VERSION,
  };
}

export function getRuntimeCapabilities(): RuntimeCapabilities {
  return {
    gateway: {
      status: true,
      start: true,
      stop: true,
      restart: true,
      repairCompatibility: true,
    },
    settings: {
      diagnoseRoot: true,
    },
    system: {
      runtimeInfo: true,
      capabilities: true,
      stats: true,
    },
  };
}

// 模型连通性测试
async function testModelConnection(params: {
  provider: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
}): Promise<{ success: boolean; error?: string; latencyMs?: number }> {
  const { provider, model, apiKey, baseUrl } = params;

  // 本地模型（Ollama/vLLM）直接测试端点可达性
  const localProviders = ['ollama', 'vllm'];
  const providerPrefix = model.split('/')[0]?.toLowerCase() ?? '';
  const isLocal = localProviders.includes(providerPrefix);

  const effectiveBaseUrl = baseUrl || (isLocal
    ? (providerPrefix === 'ollama' ? 'http://localhost:11434' : 'http://localhost:8000')
    : undefined);

  // 构建请求 URL 和 headers
  let url: string;
  let headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (effectiveBaseUrl) {
    const base = effectiveBaseUrl.replace(/\/$/, '');
    // if baseUrl already ends with /v1, append only /chat/completions
    url = /\/v1$/.test(base) ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
  } else {
    // 根据 provider 推断 API endpoint
    const endpointMap: Record<string, string> = {
      openai: 'https://api.openai.com/v1/chat/completions',
      anthropic: 'https://api.anthropic.com/v1/messages',
      google: 'https://generativelanguage.googleapis.com/v1beta/chat/completions',
      moonshot: 'https://api.moonshot.cn/v1/chat/completions',
      deepseek: 'https://api.deepseek.com/v1/chat/completions',
      qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
      glm: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
      groq: 'https://api.groq.com/openai/v1/chat/completions',
      mistral: 'https://api.mistral.ai/v1/chat/completions',
      xai: 'https://api.x.ai/v1/chat/completions',
      openrouter: 'https://openrouter.ai/api/v1/chat/completions',
    };
    url = endpointMap[providerPrefix] ?? `https://api.${providerPrefix}.com/v1/chat/completions`;
  }

  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  // 发送最小化测试请求
  const modelName = model.includes('/') ? model.split('/').slice(1).join('/') : model;
  const body = JSON.stringify({
    model: modelName,
    messages: [{ role: 'user', content: 'hi' }],
    max_tokens: 1,
  });

  const start = Date.now();
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(15000),
    });

    const latencyMs = Date.now() - start;

    // 401/403 说明 API Key 错误，但端点可达
    if (response.status === 401 || response.status === 403) {
      return { success: false, error: 'API Key 无效或无权限', latencyMs };
    }
    // 400 可能是模型名错误，但 API 可达
    if (response.status === 400) {
      const text = await response.text().catch(() => '');
      return { success: false, error: `请求参数错误：${text.slice(0, 200)}`, latencyMs };
    }
    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}`, latencyMs };
    }

    return { success: true, latencyMs };
  } catch (err: any) {
    const latencyMs = Date.now() - start;
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      return { success: false, error: '连接超时（15s）', latencyMs };
    }
    return { success: false, error: err.message ?? '网络错误', latencyMs };
  }
}

// IPC设置
export function setupSystemIPC() {
  ipcMain.handle('system:stats', getSystemStats);
  ipcMain.handle('system:setupEnvironmentCheck', getSetupEnvironmentCheck);
  ipcMain.handle('system:setupInstallOpenClaw', (event) => installOpenClawForSetup(event.sender));
  ipcMain.handle('system:testModelConnection', (_event, params) => testModelConnection(params));
  ipcMain.handle('runtime:info', getRuntimeInfo);
  ipcMain.handle('runtime:capabilities', getRuntimeCapabilities);
}