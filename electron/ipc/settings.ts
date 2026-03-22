import pkg from 'electron';
const { app, ipcMain } = pkg;
import Store from 'electron-store';
import { spawn } from 'child_process';
import os from 'os';
import path from 'path';
import { statSync, readdirSync } from 'fs';
import fs from 'fs/promises';

interface AppSettings {
  // General Settings
  autoStart?: boolean;
  startMinimized?: boolean;
  appearance?: 'system' | 'light' | 'dark';
  glassEffect?: boolean;
  language?: string;
  showTrayIcon?: boolean;
  trayIconAction?: 'openWindow' | 'showMenu';
  openclawActive?: boolean;
  runMode?: 'local';
  launchAtLogin?: boolean;
  showDockIcon?: boolean;
  playMenuBarAnimations?: boolean;
  allowCanvas?: boolean;
  allowCamera?: boolean;
  enablePeekabooBridge?: boolean;
  enableDebugTools?: boolean;
  exposureMode?: 'off' | 'tailnet' | 'public';
  requireCredentials?: boolean;
  voiceWakeEnabled?: boolean;
  holdToTalk?: boolean;
  recognitionLanguage?: string;
  additionalLanguages?: string[];
  microphoneId?: string;
  triggerSound?: string;
  sendSound?: string;
  triggerWords?: string[];
  
  // Existing Settings
  openclawPath?: string;
  openclawRootDir?: string;
  theme?: 'light' | 'dark' | 'system';
  sidebarCollapsed?: boolean;
  sidebarWidth?: number;
}

interface OpenClawRootDiagnostic {
  rootDir: string;
  exists: boolean;
  openclawPath: string;
  hasOpenClawJson: boolean;
  hasNodeJson: boolean;
  entries: string[];
  error?: string;
}

interface OpenClawPathDetection {
  path: string;
  source: 'configured' | 'bundled' | 'common-path' | 'path-env' | 'directory' | 'not-found';
  type: 'executable' | 'directory' | 'not-found';
}

interface OpenClawCommandDiagnostic {
  configuredPath: string;
  resolvedCommand: string;
  rootDir: string;
  pathEnvHit: boolean;
  pathEnvCommand?: string;
  detectedPath?: string;
  detectedSource?: OpenClawPathDetection['source'];
  commandExists: boolean;
  versionSuccess: boolean;
  versionOutput?: string;
  error?: string;
}

const store = new Store<AppSettings>({
  defaults: {
    // General Settings Defaults
    autoStart: false,
    startMinimized: false,
    appearance: 'system',
    glassEffect: true,
    language: 'system',
    showTrayIcon: true,
    trayIconAction: 'openWindow',
    openclawActive: true,
    runMode: 'local',
    launchAtLogin: false,
    showDockIcon: false,
    playMenuBarAnimations: true,
    allowCanvas: true,
    allowCamera: true,
    enablePeekabooBridge: true,
    enableDebugTools: false,
    exposureMode: 'tailnet',
    requireCredentials: false,
    voiceWakeEnabled: true,
    holdToTalk: false,
    recognitionLanguage: 'zh-CN',
    additionalLanguages: ['en-US'],
    microphoneId: 'system-default',
    triggerSound: 'glass',
    sendSound: 'glass',
    triggerWords: ['openclaw', 'claude', 'computer'],
    
    // Existing Settings Defaults
    openclawPath: '',
    openclawRootDir: '',
    theme: 'system',
    sidebarCollapsed: false,
    sidebarWidth: 200,
  },
});

export function getSettings(): AppSettings {
  return store.store;
}

export function updateSettings(updates: Partial<AppSettings>): void {
  store.set(updates);
}

export function getOpenClawPath(): string {
  const customPath = store.get('openclawPath');
  if (customPath && typeof customPath === 'string' && customPath.trim() !== '') {
    return customPath.trim();
  }
  
  return '';
}

export function getOpenClawRootDir(): string {
  const customRootDir = store.get('openclawRootDir');
  if (customRootDir && typeof customRootDir === 'string' && customRootDir.trim() !== '') {
    return customRootDir.trim();
  }

  return path.join(os.homedir(), '.openclaw');
}

const getBundledOpenClawCandidates = (): string[] => {
  const executableName = process.platform === 'win32'
    ? 'openclaw.exe'
    : 'openclaw';
  const resourcesRoot = process.resourcesPath;
  const appRoot = app.getAppPath();

  return Array.from(new Set([
    path.join(resourcesRoot, 'bin', process.platform, process.arch, executableName),
    path.join(resourcesRoot, 'bin', `${process.platform}-${process.arch}`, executableName),
    path.join(resourcesRoot, 'bin', executableName),
    path.join(appRoot, 'resources', 'bin', process.platform, process.arch, executableName),
    path.join(appRoot, 'resources', 'bin', `${process.platform}-${process.arch}`, executableName),
    path.join(appRoot, 'resources', 'bin', executableName),
  ]));
};

const resolveBundledOpenClawPathSync = (): string => {
  for (const candidate of getBundledOpenClawCandidates()) {
    try {
      const stats = statSync(candidate);
      if (stats.isFile()) {
        return candidate;
      }
    } catch {
    }
  }

  return '';
};

export function getBundledOpenClawPath(): string {
  return resolveBundledOpenClawPathSync();
}

export function resolveOpenClawCommand(): string {
  const customPath = getOpenClawPath();
  if (!customPath) {
    return resolveBundledOpenClawPathSync() || 'openclaw';
  }

  try {
    const stats = statSync(customPath);
    if (stats.isFile()) {
      return customPath;
    }
  } catch {
  }

  return resolveBundledOpenClawPathSync() || 'openclaw';
}

/**
 * 安全扫描目录下的子目录名称列表
 * 目录不存在或无权限时静默返回空数组
 */
function safeScanDir(dirPath: string): string[] {
  try {
    return readdirSync(dirPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    // 目录不存在或无权限，静默跳过
    return [];
  }
}

/**
 * 获取版本管理器的常见安装路径
 * 覆盖: nvm、volta、fnm、asdf、nodenv、n
 * 对于包含通配符的路径，实际扫描目录获取具体路径
 */
export function getVersionManagerPaths(): string[] {
  const home = os.homedir();
  const paths: string[] = [];

  // --- nvm ---
  // 优先使用 NVM_DIR 环境变量，否则使用默认路径
  const nvmDir = process.env.NVM_DIR || path.join(home, '.nvm');
  const nvmVersionsDir = path.join(nvmDir, 'versions', 'node');
  // 扫描 ~/.nvm/versions/node/ 下所有已安装版本的 bin 目录
  for (const ver of safeScanDir(nvmVersionsDir)) {
    paths.push(path.join(nvmVersionsDir, ver, 'bin'));
  }

  // --- volta ---
  paths.push(path.join(home, '.volta', 'bin'));

  // --- fnm ---
  // 优先使用 FNM_DIR 环境变量，否则使用默认路径
  const fnmDir = process.env.FNM_DIR || path.join(home, '.fnm');
  const fnmVersionsDir = path.join(fnmDir, 'node-versions');
  // 扫描 ~/.fnm/node-versions/ 下所有版本的 installation/bin 目录
  for (const ver of safeScanDir(fnmVersionsDir)) {
    paths.push(path.join(fnmVersionsDir, ver, 'installation', 'bin'));
  }

  // --- asdf ---
  // shims 目录（统一入口）
  paths.push(path.join(home, '.asdf', 'shims'));
  // 扫描 ~/.asdf/installs/nodejs/ 下所有版本的 bin 目录
  const asdfNodeDir = path.join(home, '.asdf', 'installs', 'nodejs');
  for (const ver of safeScanDir(asdfNodeDir)) {
    paths.push(path.join(asdfNodeDir, ver, 'bin'));
  }

  // --- nodenv ---
  // shims 目录（统一入口）
  paths.push(path.join(home, '.nodenv', 'shims'));
  // 扫描 ~/.nodenv/versions/ 下所有版本的 bin 目录
  const nodenvVersionsDir = path.join(home, '.nodenv', 'versions');
  for (const ver of safeScanDir(nodenvVersionsDir)) {
    paths.push(path.join(nodenvVersionsDir, ver, 'bin'));
  }

  // --- n ---
  paths.push(path.join(home, 'n', 'bin'));
  // 支持自定义 N_PREFIX 环境变量
  const nPrefix = process.env.N_PREFIX;
  if (nPrefix) {
    paths.push(path.join(nPrefix, 'bin'));
  }

  // --- Windows 特定路径 ---
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || '';
    const localAppData = process.env.LOCALAPPDATA || '';
    const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const userProfile = process.env.USERPROFILE || home;

    paths.push(
      path.join(appData, 'nvm'),
      path.join(localAppData, 'volta', 'bin'),
      path.join(programFiles, 'nodejs'),
      path.join(programFilesX86, 'nodejs'),
      'C:\\ProgramData\\chocolatey\\bin',
      path.join(userProfile, 'scoop', 'shims'),
    );
  }

  return paths;
}

// 通过 login shell 获取用户完整 PATH（解决 Electron 启动时不加载 .zshrc/.bashrc 的问题）
let _resolvedShellPath: string | null = null;

/**
 * 重置 shell PATH 缓存
 * 将 _resolvedShellPath 置为 null，使下次调用 getShellPath() 重新解析。
 * 供 environmentFixer.ts 在升级完成后清除缓存使用。
 */
export function resetShellPathCache(): void {
  _resolvedShellPath = null;
}

/**
 * 清除 Shell PATH 缓存，强制下次调用 getShellPath() 重新解析
 *
 * 统一命名的别名，与 resetShellPathCache() 功能相同。
 * 供外部模块调用以强制刷新 PATH 缓存（如用户安装或切换了版本管理器版本后）。
 *
 * @see resetShellPathCache
 */
export const clearPathCache = resetShellPathCache;

/**
 * 获取 Windows 平台的完整 PATH
 *
 * 使用 cmd.exe /c echo %PATH% 获取系统完整 PATH，
 * 失败时回退到 process.env.PATH。
 * 合并版本管理器路径，使用 `;` 作为 PATH 分隔符（Windows 约定）。
 *
 * @returns 合并后的 Windows PATH 字符串
 */
async function getWindowsShellPath(): Promise<string> {
  // Windows 版本管理器路径
  const versionManagerPaths = getVersionManagerPaths();

  try {
    // 通过 cmd.exe 获取 Windows 完整 PATH
    const result = await new Promise<string>((resolve) => {
      const child = spawn('cmd.exe', ['/c', 'echo', '%PATH%'], {
        env: process.env,
      });
      let out = '';
      child.stdout.on('data', (d: Buffer) => { out += d.toString(); });
      child.on('close', () => resolve(out.trim()));
      child.on('error', () => resolve(''));
      // 3 秒超时保护
      setTimeout(() => { try { child.kill(); } catch {} resolve(''); }, 3000);
    });

    if (result) {
      // 使用 `;` 分隔符合并 PATH（Windows 约定）
      const combined = Array.from(
        new Set(result.split(';').concat(versionManagerPaths)),
      ).join(';');
      return combined;
    }
  } catch {
    // cmd.exe 执行失败，使用 process.env.PATH 兜底
  }

  // 回退：使用 process.env.PATH 合并版本管理器路径
  const fallback = Array.from(
    new Set((process.env.PATH || '').split(';').concat(versionManagerPaths)),
  ).join(';');
  return fallback;
}

/**
 * 通过 login shell 解析用户完整 PATH（包含版本管理器路径）
 * 结果会被缓存，可通过 resetShellPathCache() 清除。
 *
 * Windows 平台使用 cmd.exe 获取 PATH，macOS/Linux 使用 login shell。
 */
export async function getShellPath(): Promise<string> {
  if (_resolvedShellPath) return _resolvedShellPath;

  // Windows 平台分发到专用实现
  if (process.platform === 'win32') {
    const winPath = await getWindowsShellPath();
    _resolvedShellPath = winPath;
    return winPath;
  }

  // macOS/Linux：基础常见路径
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
    // 合并版本管理器路径（nvm、volta、fnm、asdf、nodenv、n 等）
    ...getVersionManagerPaths(),
  ];

  const shellBin = process.env.SHELL && process.env.SHELL.startsWith('/') ? process.env.SHELL : '/bin/sh';

  try {
    const result = await new Promise<string>((resolve) => {
      const child = spawn(shellBin, ['-l', '-c', 'echo $PATH'], {
        env: process.env,
      });
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

// 导出供其他 IPC 模块复用，确保打包后也能获取完整 shell PATH
export async function runCommand(
  command: string,
  args: string[],
  options?: { timeoutMs?: number },
): Promise<{ success: boolean; output: string; error?: string }> {
  // 默认超时 10s，避免命令挂起导致验证流程卡死
  const timeoutMs = options?.timeoutMs ?? 10_000;
  const shellPath = await getShellPath();
  return new Promise((resolve) => {
    try {
      const child = spawn(command, args, {
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

      // 超时保护：超时后 kill 子进程并返回失败
      const timer = setTimeout(() => {
        try { child.kill(); } catch { /* 忽略 kill 失败 */ }
        finish({ success: false, output: output.trim(), error: `命令执行超时（${timeoutMs}ms）` });
      }, timeoutMs);

      child.stdout.on('data', (data) => {
        output += data.toString();
      });

      child.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      child.once('error', (error) => {
        clearTimeout(timer);
        finish({ success: false, output: '', error: error.message });
      });

      child.once('close', (code) => {
        clearTimeout(timer);
        if (code === 0) {
          finish({ success: true, output: output.trim() });
          return;
        }

        finish({
          success: false,
          output: output.trim(),
          error: errorOutput.trim() || `Command exited with code ${code}`,
        });
      });
    } catch (error) {
      finishWithError(error, resolve);
    }
  });
}

function finishWithError(
  error: unknown,
  resolve: (value: { success: boolean; output: string; error?: string }) => void,
) {
  resolve({
    success: false,
    output: '',
    error: error instanceof Error ? error.message : String(error),
  });
}

async function detectCommandInPath(commandName: string): Promise<string> {
  // Windows 使用 where 命令，macOS/Linux 使用 which 命令
  const cmd = process.platform === 'win32' ? 'where' : 'which';
  const result = await runCommand(cmd, [commandName]);
  if (!result.success) {
    return '';
  }

  // where 命令可能返回多行结果（多个匹配路径），取第一行
  const output = result.output.trim();
  const firstLine = output.split('\n')[0]?.trim() || output;
  return firstLine;
}

async function diagnoseOpenClawRoot(): Promise<OpenClawRootDiagnostic> {
  const rootDir = getOpenClawRootDir();
  try {
    await fs.access(rootDir);
    const entries = (await fs.readdir(rootDir)).sort((a, b) => a.localeCompare(b));
    return {
      rootDir,
      exists: true,
      openclawPath: getOpenClawPath(),
      hasOpenClawJson: entries.includes('openclaw.json'),
      hasNodeJson: entries.includes('node.json'),
      entries,
    };
  } catch (error) {
    return {
      rootDir,
      exists: false,
      openclawPath: getOpenClawPath(),
      hasOpenClawJson: false,
      hasNodeJson: false,
      entries: [],
      error: String(error),
    };
  }
}

// 检测 OpenClaw 安装路径
export // 通过 login shell 解析 npm global bin 目录（处理 nvm/nodenv 等版本管理器）
async function resolveNpmGlobalBin(): Promise<string> {
  const shellBin = process.env.SHELL?.startsWith('/') ? process.env.SHELL : '/bin/sh';
  return new Promise((resolve) => {
    const child = spawn(shellBin, ['-l', '-c', 'npm prefix -g 2>/dev/null'], { env: process.env });
    let out = '';
    child.stdout.on('data', (d: Buffer) => { out += d.toString(); });
    child.on('close', () => {
      const prefix = out.trim();
      resolve(prefix ? `${prefix}/bin` : '');
    });
    child.on('error', () => resolve(''));
    setTimeout(() => { try { child.kill(); } catch {} resolve(''); }, 5000);
  });
}

export async function detectOpenClawInstallation(): Promise<OpenClawPathDetection> {
  const homeDir = os.homedir();

  // 1. 用户配置的路径
  const userConfiguredPath = getOpenClawPath();
  if (userConfiguredPath) {
    try {
      await fs.access(userConfiguredPath);
      const stat = await fs.stat(userConfiguredPath);
      return {
        path: userConfiguredPath,
        source: 'configured',
        type: stat.isDirectory() ? 'directory' : 'executable',
      };
    } catch {
      // 配置路径无效，继续
    }
  }

  // 2. 常见固定路径（含 install.sh 实际写入的位置）
  const fixedCandidates: string[] = process.platform === 'win32'
    ? ['C:\\Program Files\\openclaw\\openclaw.exe']
    : [
        `${homeDir}/.local/bin/openclaw`,   // install.sh git 安装方式
        '/opt/homebrew/bin/openclaw',        // macOS Apple Silicon Homebrew
        '/usr/local/bin/openclaw',           // macOS Intel Homebrew / Linux
        '/usr/bin/openclaw',                 // Linux 系统包
        `${homeDir}/.npm-global/bin/openclaw`, // Linux npm 用户级安装
      ];

  for (const p of fixedCandidates) {
    try {
      await fs.access(p, fs.constants.X_OK);
      return { path: p, source: 'common-path', type: 'executable' };
    } catch {
      // 继续
    }
  }

  // 3. 通过 login shell 解析 npm global bin（处理 nvm/nodenv）
  const npmGlobalBin = await resolveNpmGlobalBin();
  if (npmGlobalBin) {
    const npmCandidate = path.join(npmGlobalBin, 'openclaw');
    try {
      await fs.access(npmCandidate, fs.constants.X_OK);
      return { path: npmCandidate, source: 'common-path', type: 'executable' };
    } catch {
      // 继续
    }
  }

  // 4. 检查 Electron 进程 PATH
  const pathHit = await detectCommandInPath('openclaw');
  if (pathHit) {
    return { path: pathHit, source: 'path-env', type: 'executable' };
  }

  // 5. ~/.openclaw 目录存在则认为已安装（无可执行文件时的兜底）
  const defaultOpenClawDir = getOpenClawRootDir();
  try {
    await fs.access(defaultOpenClawDir);
    const files = await fs.readdir(defaultOpenClawDir);
    const hasConfig = files.includes('openclaw.json') || files.includes('config.json');
    const hasAgentsDir = files.includes('agents');
    if (hasConfig || hasAgentsDir) {
      return { path: defaultOpenClawDir, source: 'directory', type: 'directory' };
    }
  } catch {
    // 目录不存在
  }

  return {
    path: '',
    source: 'not-found' as const,
    type: 'not-found' as const,
  };
}

async function diagnoseOpenClawCommand(): Promise<OpenClawCommandDiagnostic> {
  const configuredPath = getOpenClawPath();
  const resolvedCommand = resolveOpenClawCommand();
  const rootDir = getOpenClawRootDir();
  const detected = await detectOpenClawInstallation();
  const pathEnvCommand = await detectCommandInPath('openclaw');
  const versionResult = await runCommand(resolvedCommand, ['--version'], { timeoutMs: 5_000 });

  return {
    configuredPath,
    resolvedCommand,
    rootDir,
    pathEnvHit: Boolean(pathEnvCommand),
    pathEnvCommand: pathEnvCommand || undefined,
    detectedPath: detected.path || undefined,
    detectedSource: detected.source,
    commandExists: detected.type === 'executable' || versionResult.success,
    versionSuccess: versionResult.success,
    versionOutput: versionResult.success
      ? versionResult.output || undefined
      : undefined,
    error: versionResult.success
      ? undefined
      : versionResult.error || (detected.type === 'not-found' ? detected.path : undefined),
  };
}

async function autoRepairOpenClawCommand(): Promise<{ success: boolean; message: string; steps: string[]; diagnostic: OpenClawCommandDiagnostic }> {
  const before = await diagnoseOpenClawCommand();
  const steps: string[] = [];

  if (before.versionSuccess) {
    steps.push(`当前命令已可执行：${before.resolvedCommand}`);
    return {
      success: true,
      message: 'OpenClaw CLI 已可用，无需修复。',
      steps,
      diagnostic: before,
    };
  }

  if (before.detectedSource === 'common-path' || before.detectedSource === 'path-env') {
    if (before.detectedPath && before.configuredPath !== before.detectedPath) {
      updateSettings({ openclawPath: before.detectedPath });
      steps.push(`已自动将 openclawPath 设置为 ${before.detectedPath}`);
    }

    const after = await diagnoseOpenClawCommand();
    return {
      success: after.versionSuccess,
      message: after.versionSuccess
        ? '已自动修复 OpenClaw 命令路径。'
        : '已找到候选命令路径，但仍无法执行，请检查该文件权限或安装状态。',
      steps,
      diagnostic: after,
    };
  }

  steps.push('未发现可直接自动修复的 OpenClaw 可执行文件。');
  steps.push('请先安装 OpenClaw CLI，或在设置中手动填写 openclaw 可执行文件绝对路径。');

  return {
    success: false,
    message: '未找到可自动修复的 OpenClaw 命令路径。',
    steps,
    diagnostic: before,
  };
}

// IPC 设置
export function setupSettingsIPC() {
  ipcMain.handle('settings:get', async () => {
    try {
      const settings = {
        ...getSettings(),
        openclawRootDir: getOpenClawRootDir(),
      };
      return { success: true, settings };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('settings:set', async (_, updates: Partial<AppSettings>) => {
    try {
      updateSettings(updates);
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('settings:getOpenClawPath', async () => {
    try {
      const path = getOpenClawPath();
      return { success: true, path };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('settings:getOpenClawRootDir', async () => {
    try {
      const rootDir = getOpenClawRootDir();
      return { success: true, rootDir };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('detect:openclawPath', async () => {
    try {
      const detection = await detectOpenClawInstallation();
      if (detection.type === 'not-found') {
        return { success: false, error: detection.path };
      }
      return { success: true, path: detection.path };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('settings:diagnoseOpenClawRoot', async () => {
    try {
      const diagnostic = await diagnoseOpenClawRoot();
      return { success: true, diagnostic };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('settings:diagnoseOpenClawCommand', async () => {
    try {
      const diagnostic = await diagnoseOpenClawCommand();
      return { success: true, diagnostic };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('settings:testOpenClawCommand', async () => {
    try {
      const diagnostic = await diagnoseOpenClawCommand();
      return {
        success: diagnostic.versionSuccess,
        diagnostic,
        message: diagnostic.versionSuccess
          ? `OpenClaw CLI 可用：${diagnostic.versionOutput || diagnostic.resolvedCommand}`
          : diagnostic.error || 'OpenClaw CLI 测试失败',
      };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('settings:autoRepairOpenClawCommand', async () => {
    try {
      const result = await autoRepairOpenClawCommand();
      return result;
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });
}