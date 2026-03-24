/**
 * 环境自动修复模块
 *
 * 提供扫描版本管理器、修复 PATH 配置、一键安装运行时、升级 Node.js 等功能。
 * 通过 IPC 暴露 `system:fixEnvironment` handler，由渲染进程按需调用。
 */

import pkg from 'electron';
const { ipcMain } = pkg;
import os from 'os';
import path from 'path';
import { existsSync, statSync } from 'fs';
import fs from 'fs/promises';
import { spawn } from 'child_process';
import { getVersionManagerPaths, runCommand, getShellPath, resetShellPathCache } from './settings.js';
import { buildClawHubInstallCommand, validateInstallResult } from './clawhubInstallLogic.js';

// ─── 类型定义（与 src/types/setup.ts 中的 FixResult 保持一致）────────────────

/** 环境修复操作的执行结果 */
interface FixResult {
  /** 修复是否成功 */
  success: boolean;
  /** 结果描述信息 */
  message: string;
  /** 执行的修复动作描述 */
  action: string;
  /** 失败时的错误信息 */
  error?: string;
}

// ─── 内部缓存引用（用于清除 PATH 缓存）─────────────────────────────────────
// settings.ts 和 system.ts 各自维护 _resolvedShellPath 缓存，
// 修复 PATH 后需要清除以便下次调用重新解析。
// 由于无法直接访问其他模块的私有变量，这里通过重新导入触发模块重载的方式间接处理。
// 实际清除逻辑：将 null 写入模块级缓存变量（见下方 clearPathCache）。

/**
 * 清除 PATH 缓存
 * 调用 settings.ts 导出的 resetShellPathCache() 真正重置 _resolvedShellPath 缓存，
 * 使下次调用 getShellPath() 重新通过 login shell 解析完整 PATH。
 */
async function clearPathCache(): Promise<void> {
  resetShellPathCache();
}

// ─── 扫描版本管理器目录定位 Node.js ─────────────────────────────────────────

/**
 * 扫描版本管理器目录，定位已安装的 Node.js
 *
 * 使用 getVersionManagerPaths() 获取所有版本管理器的路径列表，
 * 对每个路径检查 node 可执行文件是否存在，找到后获取版本号。
 *
 * @returns 找到的 Node.js 信息，未找到时返回 null
 */
export async function scanVersionManagerForNode(): Promise<{
  found: boolean;
  path: string;
  version: string;
} | null> {
  const versionManagerPaths = getVersionManagerPaths();
  // 确定可执行文件名
  const nodeExe = process.platform === 'win32' ? 'node.exe' : 'node';

  for (const dir of versionManagerPaths) {
    const nodePath = path.join(dir, nodeExe);
    try {
      // 检查文件是否存在且为普通文件
      const stats = statSync(nodePath);
      if (!stats.isFile()) continue;

      // 尝试获取版本号
      const result = await verifyNodeVersion(nodePath);
      if (result.success) {
        return {
          found: true,
          path: dir,
          version: result.version,
        };
      }
    } catch {
      // 文件不存在或无权限，继续扫描下一个路径
    }
  }

  return null;
}

/**
 * 验证指定路径的 Node.js 可执行文件并获取版本号
 */
async function verifyNodeVersion(
  nodePath: string,
): Promise<{ success: boolean; version: string }> {
  return new Promise((resolve) => {
    try {
      const child = spawn(nodePath, ['--version'], { timeout: 5000 });
      let output = '';

      child.stdout.on('data', (data: Buffer) => {
        output += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0 && output.trim()) {
          resolve({ success: true, version: output.trim() });
        } else {
          resolve({ success: false, version: '' });
        }
      });

      child.on('error', () => {
        resolve({ success: false, version: '' });
      });

      // 超时保护
      setTimeout(() => {
        try { child.kill(); } catch {}
        resolve({ success: false, version: '' });
      }, 5000);
    } catch {
      resolve({ success: false, version: '' });
    }
  });
}

// ─── 修复 PATH 配置 ────────────────────────────────────────────────────────

/**
 * 修复 PATH 配置：将找到的 Node.js 路径写入用户的 shell 配置文件
 *
 * 检测用户使用的 shell 类型，选择对应的配置文件（.zshrc / .bashrc / .profile），
 * 在文件末尾追加 export PATH 行。修复完成后清除 PATH 缓存。
 *
 * @param nodePath 需要添加到 PATH 的 Node.js 所在目录路径
 * @returns 修复结果
 */
export async function fixPathConfiguration(nodePath: string): Promise<FixResult> {
  const action = 'fixPath';

  try {
    // 确定 shell 配置文件路径
    const home = os.homedir();
    const shellConfigFile = getShellConfigFile(home);

    if (!shellConfigFile) {
      return {
        success: false,
        message: '无法确定 shell 配置文件路径',
        action,
        error: '未找到 .zshrc、.bashrc 或 .profile 配置文件',
      };
    }

    // 构建 export 行
    const exportLine = `export PATH="${nodePath}:$PATH"`;
    const comment = '# 由 OpenClaw Desktop 自动添加 — Node.js PATH 修复';
    const contentToAppend = `\n${comment}\n${exportLine}\n`;

    // 检查是否已存在相同的 export 行，避免重复写入
    try {
      const existingContent = await fs.readFile(shellConfigFile, 'utf-8');
      if (existingContent.includes(exportLine)) {
        // 已存在，无需重复添加，但仍清除缓存
        await clearPathCache();
        return {
          success: true,
          message: `PATH 配置已存在于 ${path.basename(shellConfigFile)} 中，无需重复添加`,
          action,
        };
      }
    } catch {
      // 文件不存在，后续会创建
    }

    // 追加到配置文件
    await fs.appendFile(shellConfigFile, contentToAppend, 'utf-8');

    // 清除 PATH 缓存，使下次环境检测使用最新 PATH
    await clearPathCache();

    return {
      success: true,
      message: `已将 Node.js 路径写入 ${path.basename(shellConfigFile)}，请重启终端或应用以生效`,
      action,
    };
  } catch (err: any) {
    return {
      success: false,
      message: 'PATH 配置修复失败',
      action,
      error: err.message || String(err),
    };
  }
}

/**
 * 确定用户的 shell 配置文件路径
 *
 * 优先级：.zshrc > .bashrc > .profile
 * 如果文件都不存在，根据当前 SHELL 环境变量选择默认文件
 */
function getShellConfigFile(home: string): string | null {
  // Windows 不使用 shell 配置文件
  if (process.platform === 'win32') {
    return null;
  }

  const candidates = [
    path.join(home, '.zshrc'),
    path.join(home, '.bashrc'),
    path.join(home, '.profile'),
  ];

  // 优先选择已存在的配置文件
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  // 都不存在时，根据当前 shell 选择默认文件
  const shell = process.env.SHELL || '';
  if (shell.includes('zsh')) {
    return path.join(home, '.zshrc');
  }
  if (shell.includes('bash')) {
    return path.join(home, '.bashrc');
  }

  // 兜底使用 .profile
  return path.join(home, '.profile');
}

// ─── 一键安装运行时 ─────────────────────────────────────────────────────────

/**
 * 发送修复进度事件到渲染进程
 *
 * @param sender 渲染进程的 WebContents 实例
 * @param status 当前状态
 * @param message 进度描述信息
 */
function sendFixProgress(
  sender: Electron.WebContents,
  status: 'running' | 'done' | 'error',
  message: string,
): void {
  try {
    sender.send('fix:progress', { status, message });
  } catch {
    // sender 可能已销毁，静默忽略
  }
}

/**
 * 一键安装 Node.js 22 + OpenClaw CLI
 *
 * macOS/Linux: 使用 `curl -fsSL https://openclaw.ai/install.sh | bash`
 * Windows: 使用 `winget install OpenJS.NodeJS.LTS` 或提示手动安装
 *
 * 通过 `fix:progress` 事件推送进度到渲染进程。
 * 安装完成后自动触发环境重新检测。
 *
 * @param sender 渲染进程的 WebContents 实例
 * @returns 修复结果
 */
export async function autoInstallRuntime(
  sender: Electron.WebContents,
): Promise<FixResult> {
  const action = 'install';
  const isWindows = process.platform === 'win32';
  const INSTALL_TIMEOUT = 5 * 60 * 1000; // 5 分钟超时

  try {
    // ── 步骤 1: 安装 Node.js ──────────────────────────────────────────────
    sendFixProgress(sender, 'running', '正在安装 Node.js 22…');

    let nodeInstallResult: { success: boolean; output: string; error?: string };

    if (isWindows) {
      // Windows: 尝试 winget 安装
      nodeInstallResult = await runSpawnCommand(
        'winget',
        ['install', 'OpenJS.NodeJS.LTS', '--accept-source-agreements', '--accept-package-agreements'],
        INSTALL_TIMEOUT,
        sender,
      );

      if (!nodeInstallResult.success) {
        sendFixProgress(sender, 'error', 'winget 安装失败，请手动下载安装 Node.js');
        return {
          success: false,
          message: 'Windows 自动安装 Node.js 失败，请访问 https://nodejs.org 手动下载安装',
          action,
          error: nodeInstallResult.error || 'winget 安装失败',
        };
      }
    } else {
      // macOS/Linux: 使用安装脚本
      const shellBin = process.env.SHELL && process.env.SHELL.startsWith('/')
        ? process.env.SHELL
        : '/bin/bash';
      const installCmd = 'curl -fsSL https://openclaw.ai/install.sh | bash';

      nodeInstallResult = await runSpawnCommand(
        shellBin,
        ['-l', '-c', installCmd],
        INSTALL_TIMEOUT,
        sender,
      );
    }

    if (!nodeInstallResult.success) {
      sendFixProgress(sender, 'error', `安装失败: ${nodeInstallResult.error || '未知错误'}`);
      return {
        success: false,
        message: '运行时安装失败',
        action,
        error: nodeInstallResult.error || '安装脚本执行失败',
      };
    }

    sendFixProgress(sender, 'running', '安装脚本执行完成，正在验证…');

    // ── 步骤 2: 验证安装结果 ──────────────────────────────────────────────
    const nodeCheck = await runCommand('node', ['--version']);
    if (!nodeCheck.success) {
      sendFixProgress(sender, 'error', '安装完成但未检测到 Node.js，可能需要重启终端');
      return {
        success: false,
        message: '安装脚本已执行但未检测到 Node.js，请重启应用后重试',
        action,
        error: '安装后 node --version 失败',
      };
    }

    sendFixProgress(sender, 'running', `Node.js ${nodeCheck.output.trim()} 已安装，正在检测 OpenClaw CLI…`);

    // ── 步骤 3: 检测 OpenClaw CLI ────────────────────────────────────────
    const clawCheck = await runCommand('openclaw', ['--version']);
    if (!clawCheck.success) {
      sendFixProgress(sender, 'running', 'OpenClaw CLI 未检测到，可能已随安装脚本一并安装');
    }

    // 清除 PATH 缓存
    await clearPathCache();

    sendFixProgress(sender, 'done', '运行时安装完成');

    return {
      success: true,
      message: `Node.js ${nodeCheck.output.trim()} 安装成功${clawCheck.success ? '，OpenClaw CLI 已就绪' : ''}`,
      action,
    };
  } catch (err: any) {
    sendFixProgress(sender, 'error', `安装过程出错: ${err.message}`);
    return {
      success: false,
      message: '运行时安装过程中发生异常',
      action,
      error: err.message || String(err),
    };
  }
}

// ─── 升级 Node.js 版本 ─────────────────────────────────────────────────────

/**
 * 升级 Node.js 到 >= 22
 *
 * 检测当前使用的版本管理器，使用对应的升级命令：
 * - nvm: nvm install 22
 * - volta: volta install node@22
 * - fnm: fnm install 22
 * - n: n 22
 * - 无版本管理器: 提示手动升级
 *
 * 通过 `fix:progress` 事件推送进度到渲染进程。
 *
 * @param sender 渲染进程的 WebContents 实例
 * @returns 修复结果
 */
export async function upgradeNodeVersion(
  sender: Electron.WebContents,
): Promise<FixResult> {
  const action = 'upgrade';

  try {
    sendFixProgress(sender, 'running', '正在检测版本管理器…');

    // 检测当前使用的版本管理器
    const versionManager = await detectVersionManager();

    if (!versionManager) {
      sendFixProgress(sender, 'error', '未检测到版本管理器，无法自动升级');
      return {
        success: false,
        message: '未检测到 Node.js 版本管理器（nvm/volta/fnm/n），请手动升级到 Node.js 22 或更高版本',
        action,
        error: '未找到支持的版本管理器',
      };
    }

    sendFixProgress(sender, 'running', `检测到 ${versionManager.name}，正在升级 Node.js…`);

    // 执行升级命令
    const upgradeResult = await runUpgradeCommand(versionManager, sender);

    if (!upgradeResult.success) {
      sendFixProgress(sender, 'error', `升级失败: ${upgradeResult.error || '未知错误'}`);
      return {
        success: false,
        message: `通过 ${versionManager.name} 升级 Node.js 失败`,
        action,
        error: upgradeResult.error || '升级命令执行失败',
      };
    }

    // 先清除 PATH 缓存，确保验证时使用最新 PATH
    sendFixProgress(sender, 'running', '正在验证升级结果…');
    await clearPathCache();

    // 验证升级结果
    const nodeCheck = await runCommand('node', ['--version']);

    if (nodeCheck.success) {
      sendFixProgress(sender, 'done', `Node.js 已升级到 ${nodeCheck.output.trim()}`);
      return {
        success: true,
        message: `Node.js 已通过 ${versionManager.name} 升级到 ${nodeCheck.output.trim()}`,
        action,
      };
    }

    sendFixProgress(sender, 'done', '升级命令已执行，请重启应用以生效');
    return {
      success: true,
      message: `升级命令已通过 ${versionManager.name} 执行，请重启应用以使新版本生效`,
      action,
    };
  } catch (err: any) {
    sendFixProgress(sender, 'error', `升级过程出错: ${err.message}`);
    return {
      success: false,
      message: 'Node.js 升级过程中发生异常',
      action,
      error: err.message || String(err),
    };
  }
}

// ─── 版本管理器检测 ─────────────────────────────────────────────────────────

/** 版本管理器信息 */
interface VersionManagerInfo {
  /** 版本管理器名称 */
  name: string;
  /** 升级命令 */
  command: string;
  /** 升级命令参数 */
  args: string[];
  /** 是否需要通过 login shell 执行 */
  useLoginShell: boolean;
}

/**
 * 检测当前系统使用的 Node.js 版本管理器
 *
 * 按优先级检测：nvm > volta > fnm > n
 *
 * @returns 检测到的版本管理器信息，未找到时返回 null
 */
async function detectVersionManager(): Promise<VersionManagerInfo | null> {
  const home = os.homedir();

  // 检测 nvm（通过 NVM_DIR 环境变量或默认目录）
  const nvmDir = process.env.NVM_DIR || path.join(home, '.nvm');
  if (existsSync(path.join(nvmDir, 'nvm.sh'))) {
    return {
      name: 'nvm',
      command: 'nvm',
      args: ['install', '22'],
      useLoginShell: true,
    };
  }

  // 检测 volta
  const voltaCheck = await runCommand('volta', ['--version']);
  if (voltaCheck.success) {
    return {
      name: 'volta',
      command: 'volta',
      args: ['install', 'node@22'],
      useLoginShell: false,
    };
  }

  // 检测 fnm
  const fnmCheck = await runCommand('fnm', ['--version']);
  if (fnmCheck.success) {
    return {
      name: 'fnm',
      command: 'fnm',
      args: ['install', '22'],
      useLoginShell: false,
    };
  }

  // 检测 n
  const nCheck = await runCommand('n', ['--version']);
  if (nCheck.success) {
    return {
      name: 'n',
      command: 'n',
      args: ['22'],
      useLoginShell: false,
    };
  }

  return null;
}

/**
 * 执行版本管理器的升级命令
 *
 * nvm 场景下注入 NVM_DIR 环境变量，确保 nvm.sh 能正确初始化。
 */
async function runUpgradeCommand(
  vm: VersionManagerInfo,
  sender: Electron.WebContents,
): Promise<{ success: boolean; output: string; error?: string }> {
  const UPGRADE_TIMEOUT = 3 * 60 * 1000; // 3 分钟超时

  if (vm.useLoginShell && process.platform !== 'win32') {
    // nvm 需要通过 login shell 执行（因为 nvm 是 shell 函数，不是可执行文件）
    const shellBin = process.env.SHELL && process.env.SHELL.startsWith('/')
      ? process.env.SHELL
      : '/bin/bash';
    const nvmDir = process.env.NVM_DIR || path.join(os.homedir(), '.nvm');
    const cmd = `source "${nvmDir}/nvm.sh" && ${vm.command} ${vm.args.join(' ')}`;

    // 注入 NVM_DIR 环境变量，确保子进程中 nvm.sh 能正确定位自身目录
    const extraEnv: Record<string, string> = { NVM_DIR: nvmDir };

    return runSpawnCommand(shellBin, ['-l', '-c', cmd], UPGRADE_TIMEOUT, sender, extraEnv);
  }

  return runSpawnCommand(vm.command, vm.args, UPGRADE_TIMEOUT, sender);
}

// ─── 通用命令执行 ───────────────────────────────────────────────────────────

/**
 * 执行 spawn 命令并推送进度
 *
 * 使用 getShellPath() 获取完整 PATH，确保子进程能访问版本管理器路径。
 *
 * @param command 命令
 * @param args 参数列表
 * @param timeoutMs 超时时间（毫秒）
 * @param sender 渲染进程 WebContents（用于推送输出）
 * @param extraEnv 额外注入的环境变量（如 NVM_DIR）
 * @returns 执行结果
 */
async function runSpawnCommand(
  command: string,
  args: string[],
  timeoutMs: number,
  sender: Electron.WebContents,
  extraEnv?: Record<string, string>,
): Promise<{ success: boolean; output: string; error?: string }> {
  // 获取完整的 shell PATH（包含版本管理器路径）
  const shellPath = await getShellPath();

  return new Promise((resolve) => {
    try {
      const child = spawn(command, args, {
        env: { ...process.env, PATH: shellPath, ...extraEnv },
        stdio: ['pipe', 'pipe', 'pipe'],
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
        // 推送实时输出到渲染进程
        sendFixProgress(sender, 'running', text.trim().slice(-200));
      });

      child.stderr?.on('data', (data: Buffer) => {
        const text = data.toString();
        errorOutput += text;
      });

      child.on('close', (code) => {
        if (code === 0) {
          finish({ success: true, output: output.trim() });
        } else {
          finish({
            success: false,
            output: output.trim(),
            error: errorOutput.trim() || `进程退出码 ${code}`,
          });
        }
      });

      child.on('error', (err) => {
        finish({ success: false, output: '', error: err.message });
      });

      // 自动回答交互式提示
      try {
        child.stdin?.write('y\n');
        child.stdin?.end();
      } catch {}

      // 超时保护
      setTimeout(() => {
        try { child.kill(); } catch {}
        finish({ success: false, output: output.trim(), error: '操作超时' });
      }, timeoutMs);
    } catch (err: any) {
      resolve({ success: false, output: '', error: err.message });
    }
  });
}

// ─── ClawHub CLI 安装 ───────────────────────────────────────────────────────

/** 3 分钟超时保护 */
const CLAWHUB_INSTALL_TIMEOUT_MS = 3 * 60 * 1000;

/**
 * 自动安装 ClawHub CLI
 *
 * 执行 npm install -g @nicepkg/clawhub，使用完整 shell PATH。
 * 安装完成后验证 clawhub --version，并清除 PATH 缓存。
 *
 * @param sender - 渲染进程 WebContents，用于推送进度事件
 * @returns 修复结果
 */
async function installClawHub(sender: Electron.WebContents): Promise<FixResult> {
  try {
    sendFixProgress(sender, 'running', '正在安装 ClawHub CLI…');

    // 获取完整 shell PATH 并构建安装命令
    const shellPath = await getShellPath();
    const { command, args, env } = buildClawHubInstallCommand(
      process.env as Record<string, string | undefined>,
      shellPath,
    );

    // 执行 npm install -g @nicepkg/clawhub
    const installResult = await new Promise<{ success: boolean; output: string; error?: string }>((resolve) => {
      try {
        const child = spawn(command, args, {
          env,
          stdio: ['pipe', 'pipe', 'pipe'],
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
          sendFixProgress(sender, 'running', text.trim().slice(-200));
        });

        child.stderr?.on('data', (data: Buffer) => {
          errorOutput += data.toString();
        });

        child.on('close', (code) => {
          if (code === 0) {
            finish({ success: true, output: output.trim() });
          } else {
            finish({
              success: false,
              output: output.trim(),
              error: errorOutput.trim() || `进程退出码 ${code}`,
            });
          }
        });

        child.on('error', (err) => {
          finish({ success: false, output: '', error: err.message });
        });

        // 超时保护
        setTimeout(() => {
          try { child.kill(); } catch {}
          finish({ success: false, output: output.trim(), error: '安装超时（3 分钟）' });
        }, CLAWHUB_INSTALL_TIMEOUT_MS);
      } catch (err: any) {
        resolve({ success: false, output: '', error: err.message });
      }
    });

    if (!installResult.success) {
      const errMsg = installResult.error || '未知错误';
      // 权限不足（EACCES）时提供手动安装建议
      const hint = errMsg.includes('EACCES')
        ? '。建议使用 sudo npm install -g @nicepkg/clawhub 或修改 npm 全局目录权限'
        : '。可手动执行 npm install -g @nicepkg/clawhub';
      sendFixProgress(sender, 'error', `ClawHub CLI 安装失败: ${errMsg}`);
      return {
        success: false,
        message: `ClawHub CLI 安装失败: ${errMsg}${hint}`,
        action: 'install',
        error: errMsg,
      };
    }

    // 验证安装结果
    sendFixProgress(sender, 'running', '正在验证 ClawHub CLI…');
    const versionCheck = await runCommand('clawhub', ['--version']);
    const validation = validateInstallResult(versionCheck);

    // 清除 PATH 缓存
    resetShellPathCache();

    if (validation.success) {
      sendFixProgress(sender, 'done', `ClawHub CLI 安装成功 (${validation.version})`);
      return {
        success: true,
        message: `ClawHub CLI 安装成功 (${validation.version})`,
        action: 'install',
      };
    }

    sendFixProgress(sender, 'error', 'ClawHub CLI 安装后验证失败');
    return {
      success: false,
      message: 'ClawHub CLI 安装后验证失败，可能需要重启终端',
      action: 'install',
      error: validation.error,
    };
  } catch (err: any) {
    sendFixProgress(sender, 'error', `ClawHub CLI 安装异常: ${err.message}`);
    return {
      success: false,
      message: `ClawHub CLI 安装异常: ${err.message}`,
      action: 'install',
      error: err.message,
    };
  }
}

// ─── IPC 注册 ───────────────────────────────────────────────────────────────

/**
 * 注册环境修复相关的 IPC handler
 *
 * handler: system:fixEnvironment
 * 接收 action 参数（'install' | 'upgrade' | 'fixPath'），分发到对应函数
 */
export function setupEnvironmentFixerIPC(): void {
  ipcMain.handle(
    'system:fixEnvironment',
    async (event, action: 'install' | 'upgrade' | 'fixPath', issueId?: string) => {
      const sender = event.sender;

      // 当 action 为 install 且 issueId 为 clawhub-not-installed 时，分发到 clawhub 安装
      if (action === 'install' && issueId === 'clawhub-not-installed') {
        return installClawHub(sender);
      }

      switch (action) {
        case 'install':
          return autoInstallRuntime(sender);

        case 'upgrade':
          return upgradeNodeVersion(sender);

        case 'fixPath': {
          // 先扫描版本管理器目录找到 Node.js
          const scanResult = await scanVersionManagerForNode();
          if (!scanResult || !scanResult.found) {
            return {
              success: false,
              message: '未在版本管理器目录中找到 Node.js 安装',
              action: 'fixPath',
              error: '扫描所有版本管理器路径后未找到可用的 Node.js',
            } satisfies FixResult;
          }
          return fixPathConfiguration(scanResult.path);
        }

        default:
          return {
            success: false,
            message: `未知的修复动作: ${action}`,
            action: String(action),
            error: `不支持的 action 类型: ${action}`,
          } satisfies FixResult;
      }
    },
  );
}
