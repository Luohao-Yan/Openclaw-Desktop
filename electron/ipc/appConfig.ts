/**
 * 应用配置管理模块
 *
 * 提供重置应用配置、重装 OpenClaw 运行时等功能。
 * 重装使用官方安装脚本（curl | bash），与 setup 流程保持一致。
 */

import { ipcMain, app } from 'electron';
import Store from 'electron-store';
import { spawn } from 'child_process';
import { getShellPath } from './settings.js';

const store = new Store();

/** 安装超时时间：5 分钟 */
const INSTALL_TIMEOUT = 5 * 60 * 1000;

/**
 * 在 login shell 中执行官方安装脚本
 *
 * 复用与 system.ts installOpenClawForSetup 相同的策略：
 * - 通过 login shell 继承用户完整 PATH
 * - 设置非交互式环境变量，避免脚本等待 TTY 输入
 * - 自动写入 'y\n' 应答交互式提示
 */
function runOfficialInstallScript(
  timeoutMs = INSTALL_TIMEOUT,
): Promise<{ success: boolean; output: string; error?: string }> {
  return new Promise(async (resolve) => {
    try {
      const shellPath = await getShellPath();
      const isWindows = process.platform === 'win32';

      // 官方安装命令（与 system.ts 中 installOpenClawForSetup 一致）
      const installCmd = isWindows
        ? 'powershell -NoProfile -ExecutionPolicy Bypass -Command "iwr -useb https://openclaw.ai/install.ps1 | iex"'
        : 'curl -fsSL https://openclaw.ai/install.sh | bash';

      const shellBin = isWindows
        ? 'powershell'
        : (process.env.SHELL && process.env.SHELL.startsWith('/') ? process.env.SHELL : '/bin/bash');

      const child = isWindows
        ? spawn(shellBin, ['-c', installCmd], {
            env: { ...process.env, PATH: shellPath },
            stdio: ['pipe', 'pipe', 'pipe'],
          })
        : spawn(shellBin, ['-l', '-c', installCmd], {
            env: {
              ...process.env,
              PATH: shellPath,
              NO_ONBOARD: '1',
              TERM: 'dumb',
              CI: '1',
              OPENCLAW_INSTALL_NON_INTERACTIVE: '1',
              YES: '1',
              OPENCLAW_YES: '1',
              FORCE_YES: '1',
            },
            stdio: ['pipe', 'pipe', 'pipe'],
          });

      // 自动回答交互式提示
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

      child.stdout?.on('data', (data: Buffer) => { output += data.toString(); });
      child.stderr?.on('data', (data: Buffer) => { errorOutput += data.toString(); });

      child.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) {
          finish({ success: true, output: (output + '\n' + errorOutput).trim() });
        } else {
          finish({
            success: false,
            output: (output + '\n' + errorOutput).trim(),
            error: errorOutput.trim() || `退出码 ${code}`,
          });
        }
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        finish({ success: false, output: '', error: err.message });
      });

      // 超时保护
      const timer = setTimeout(() => {
        try { child.kill(); } catch {}
        finish({ success: false, output, error: `安装超时（${timeoutMs / 1000}s）` });
      }, timeoutMs);
    } catch (err: any) {
      resolve({ success: false, output: '', error: err.message });
    }
  });
}

/** 卸载超时时间：300 秒 */
const UNINSTALL_TIMEOUT = 300 * 1000;

/**
 * 通过 SSH 在远程主机执行卸载命令
 *
 * 从 store 读取远程连接配置，使用系统 ssh 命令执行卸载。
 * SSH 失败（连接失败、认证失败、超时、非零退出码）时降级返回 manualRequired。
 */
function runSshUninstall(
  host: string,
  sshPort: number,
  user: string,
): Promise<{ success: boolean; output?: string; manualRequired?: boolean; sshError?: string }> {
  return new Promise((resolve) => {
    let settled = false;
    let output = '';
    let errorOutput = '';

    const finish = (result: { success: boolean; output?: string; manualRequired?: boolean; sshError?: string }) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    try {
      // 使用系统 ssh 命令，不引入额外 npm 依赖
      const child = spawn('ssh', [
        '-o', 'StrictHostKeyChecking=no',
        '-o', 'ConnectTimeout=30',
        '-p', String(sshPort),
        `${user}@${host}`,
        'openclaw uninstall --all --yes --non-interactive',
      ], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      child.stdout?.on('data', (data: Buffer) => { output += data.toString(); });
      child.stderr?.on('data', (data: Buffer) => { errorOutput += data.toString(); });

      child.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) {
          finish({ success: true, output: (output + '\n' + errorOutput).trim() });
        } else {
          // SSH 命令非零退出码，降级到手动引导
          finish({
            success: true,
            manualRequired: true,
            sshError: errorOutput.trim() || `SSH 命令退出码 ${code}`,
          });
        }
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        // SSH 进程启动失败（如系统未安装 ssh），降级到手动引导
        finish({ success: true, manualRequired: true, sshError: `SSH 启动失败: ${err.message}` });
      });

      // 超时保护：300 秒后降级到手动引导
      const timer = setTimeout(() => {
        try { child.kill(); } catch {}
        finish({ success: true, manualRequired: true, sshError: 'SSH 执行超时' });
      }, UNINSTALL_TIMEOUT);
    } catch (err: any) {
      finish({ success: true, manualRequired: true, sshError: `SSH 异常: ${err.message}` });
    }
  });
}

/**
 * 在本地执行卸载命令
 *
 * 复用 getShellPath() 获取 Shell PATH，通过 spawn 执行卸载命令。
 * 退出码 0 返回 success: true，非零返回 success: false。
 */
function runLocalUninstall(): Promise<{ success: boolean; output?: string; error?: string }> {
  return new Promise(async (resolve) => {
    let settled = false;
    let output = '';
    let errorOutput = '';

    const finish = (result: { success: boolean; output?: string; error?: string }) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    try {
      const shellPath = await getShellPath();
      const isWindows = process.platform === 'win32';
      const shellBin = isWindows
        ? 'powershell'
        : (process.env.SHELL && process.env.SHELL.startsWith('/') ? process.env.SHELL : '/bin/bash');

      // 卸载命令：非交互式全量卸载
      const uninstallCmd = isWindows
        ? 'openclaw uninstall --all --yes --non-interactive'
        : 'openclaw uninstall --all --yes --non-interactive';

      const child = isWindows
        ? spawn(shellBin, ['-c', uninstallCmd], {
            env: { ...process.env, PATH: shellPath },
            stdio: ['ignore', 'pipe', 'pipe'],
          })
        : spawn(shellBin, ['-l', '-c', uninstallCmd], {
            env: { ...process.env, PATH: shellPath },
            stdio: ['ignore', 'pipe', 'pipe'],
          });

      child.stdout?.on('data', (data: Buffer) => { output += data.toString(); });
      child.stderr?.on('data', (data: Buffer) => { errorOutput += data.toString(); });

      child.on('close', (code) => {
        clearTimeout(timer);
        const combined = (output + '\n' + errorOutput).trim();
        if (code === 0) {
          finish({ success: true, output: combined });
        } else {
          finish({
            success: false,
            output: combined,
            error: errorOutput.trim() || `退出码 ${code}`,
          });
        }
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        finish({ success: false, output: '', error: err.message });
      });

      // 超时保护：300 秒
      const timer = setTimeout(() => {
        try { child.kill(); } catch {}
        finish({ success: false, output, error: `卸载超时（${UNINSTALL_TIMEOUT / 1000}s）` });
      }, UNINSTALL_TIMEOUT);
    } catch (err: any) {
      finish({ success: false, output: '', error: err.message });
    }
  });
}

/**
 * 设置应用配置相关的 IPC 处理器
 */
export function setupAppConfigIPC() {
  // 清除应用配置（重置到初始状态）
  ipcMain.handle('app-config:reset', async () => {
    try {
      store.clear();
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // 重装 openclaw — 使用官方安装脚本（curl | bash）
  ipcMain.handle('app-config:reinstall-openclaw', async () => {
    try {
      const result = await runOfficialInstallScript();
      return result;
    } catch (error: any) {
      return { success: false, output: '', error: error.message };
    }
  });

  // 卸载 OpenClaw — 支持三种模式：local / remote-ssh / remote-manual
  ipcMain.handle('app-config:uninstall-openclaw', async (_event, params: { mode: 'local' | 'remote-ssh' | 'remote-manual' }) => {
    try {
      const { mode } = params || {};

      // remote-manual：直接返回手动引导标志，不执行任何命令
      if (mode === 'remote-manual') {
        return { success: true, manualRequired: true };
      }

      // remote-ssh：从 store 读取远程连接配置，通过 SSH 执行卸载
      if (mode === 'remote-ssh') {
        const remoteConn = store.get('remoteConnection') as Record<string, any> | undefined;
        const host = remoteConn?.host || 'localhost';
        const sshPort = remoteConn?.sshPort ?? 22;
        const user = remoteConn?.user || 'root';
        return await runSshUninstall(host, sshPort, user);
      }

      // local：在本地执行卸载命令
      if (mode === 'local') {
        return await runLocalUninstall();
      }

      // 未知 mode，返回错误
      return { success: false, error: `未知的执行模式: ${mode}` };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // 退出应用 — 由渲染进程在重置成功后调用
  ipcMain.handle('app-config:quit', async () => {
    try {
      app.quit();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });
}
