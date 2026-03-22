/**
 * 应用配置管理模块
 *
 * 提供重置应用配置、重装 OpenClaw 运行时等功能。
 * 重装使用官方安装脚本（curl | bash），与 setup 流程保持一致。
 */

import { ipcMain } from 'electron';
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
}
