/**
 * 三级运行时解析模块
 *
 * 按优先级依次尝试：
 *   第一级：内置 Node.js + 内置 OpenClaw CLI（完全离线可用）
 *   第二级：系统 Node.js (>= 22) + 系统 OpenClaw CLI
 *   第三级：标记为 'online'（有网络）或 'missing'（无网络）
 */

import pkg from 'electron';
const { app, ipcMain } = pkg;
import path from 'path';
import { spawn } from 'child_process';
import { statSync } from 'fs';
import dns from 'dns';
import { getBundledOpenClawPath, runCommand } from './settings.js';
import { parseMajorVersion } from './runtimeLogic.js';
import type { RuntimeTier } from './runtimeLogic.js';

// 重新导出纯逻辑模块的公共 API，便于外部统一引用
export { determineRuntimeTier, parseMajorVersion } from './runtimeLogic.js';
export type { RuntimeScenario, RuntimeTier } from './runtimeLogic.js';

// ─── 类型定义（与 src/types/setup.ts 中的 RuntimeResolution 保持一致）────────

/** 运行时解析结果，描述当前生效的运行时来源与状态 */
interface RuntimeResolution {
  /** 当前生效的运行时层级 */
  tier: RuntimeTier;
  /** Node.js 可执行文件路径，未找到时为 null */
  nodePath: string | null;
  /** OpenClaw CLI 可执行文件路径，未找到时为 null */
  openclawPath: string | null;
  /** 内置 Node.js 是否可用 */
  bundledNodeAvailable: boolean;
  /** 内置 OpenClaw CLI 是否可用 */
  bundledOpenClawAvailable: boolean;
  /** 系统 Node.js 版本号，未检测到时为 null */
  systemNodeVersion: string | null;
  /** 系统 Node.js 版本是否满足最低要求（>= 22） */
  systemNodeSatisfies: boolean;
  /** 系统是否已安装 OpenClaw CLI */
  systemOpenClawInstalled: boolean;
  /** 解析过程中的错误信息 */
  error?: string;
}

// ─── 内置 Node.js 路径检测 ───────────────────────────────────────────────────

/**
 * 检测内置 Node.js 是否存在且可执行
 *
 * macOS/Linux 路径: {resourcesPath}/node/{platform}-{arch}/bin/node
 * Windows 路径:     {resourcesPath}/node/{platform}-{arch}/node.exe
 *
 * 同时检查开发模式路径: {appRoot}/resources/node/{platform}-{arch}/
 *
 * @returns 找到的 Node.js 可执行文件路径，未找到时返回 null
 */
export function getBundledNodePath(): string | null {
  const platform = process.platform;
  const arch = process.arch;
  const platformArch = `${platform}-${arch}`;

  // 根据平台确定可执行文件的相对路径
  const relBin = platform === 'win32'
    ? 'node.exe'
    : path.join('bin', 'node');

  // 候选根目录：打包后的 resourcesPath 和开发模式的 appRoot/resources
  const roots = [
    process.resourcesPath,
    path.join(app.getAppPath(), 'resources'),
  ];

  for (const root of roots) {
    const candidate = path.join(root, 'node', platformArch, relBin);
    try {
      const stats = statSync(candidate);
      if (stats.isFile()) {
        return candidate;
      }
    } catch {
      // 文件不存在，继续尝试下一个候选路径
    }
  }

  return null;
}

// ─── 内置 OpenClaw CLI 路径检测 ──────────────────────────────────────────────

/**
 * 获取内置 OpenClaw CLI 路径
 *
 * 复用 settings.ts 中已有的 getBundledOpenClawPath() 逻辑，
 * 当返回空字符串时视为不可用，返回 null。
 *
 * @returns 找到的 OpenClaw CLI 路径，未找到时返回 null
 */
export function getBundledOpenClawCLIPath(): string | null {
  const resolved = getBundledOpenClawPath();
  return resolved || null;
}

// parseMajorVersion 和 determineRuntimeTier 已移至 runtimeLogic.ts

// ─── 辅助：检测网络连通性 ───────────────────────────────────────────────────

/**
 * 通过 DNS 解析检测网络是否可用
 * 超时 5 秒后视为无网络
 */
async function checkNetworkAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), 5000);
    dns.resolve('dns.google', (err) => {
      clearTimeout(timer);
      resolve(!err);
    });
  });
}

// ─── 三级运行时解析 ─────────────────────────────────────────────────────────

/**
 * 按三级优先级解析运行时，返回 RuntimeResolution 对象
 *
 * 第一级：内置 Node.js + 内置 OpenClaw CLI → tier = 'bundled'
 * 第二级：系统 Node.js (>= 22) + 系统 OpenClaw CLI → tier = 'system'
 * 第三级：有网络 → tier = 'online'；无网络 → tier = 'missing'
 */
export async function resolveRuntime(): Promise<RuntimeResolution> {
  // 基础结果模板
  const result: RuntimeResolution = {
    tier: 'missing',
    nodePath: null,
    openclawPath: null,
    bundledNodeAvailable: false,
    bundledOpenClawAvailable: false,
    systemNodeVersion: null,
    systemNodeSatisfies: false,
    systemOpenClawInstalled: false,
  };

  // ── 第一级：检测内置运行时 ──────────────────────────────────────────────

  const bundledNode = getBundledNodePath();
  const bundledClaw = getBundledOpenClawCLIPath();

  result.bundledNodeAvailable = bundledNode !== null;
  result.bundledOpenClawAvailable = bundledClaw !== null;

  if (bundledNode && bundledClaw) {
    // 验证内置 Node.js 是否可执行
    const nodeCheck = await verifyExecutable(bundledNode, ['--version']);
    if (nodeCheck.success) {
      // 验证内置 OpenClaw CLI 是否可执行（通过内置 Node.js 运行）
      const clawCheck = await runBundledOpenClaw(['--version']);
      if (clawCheck.success) {
        result.tier = 'bundled';
        result.nodePath = bundledNode;
        result.openclawPath = bundledClaw;
        return result;
      }
      // 内置 CLI 不可执行，记录日志，尝试系统 CLI
      console.error('[runtime] 内置 OpenClaw CLI 不可执行，尝试系统 CLI:', clawCheck.error);
      const systemClawResult = await runCommand('openclaw', ['--version']);
      if (systemClawResult.success) {
        result.tier = 'bundled';
        result.nodePath = bundledNode;
        result.openclawPath = 'openclaw'; // 使用系统 CLI
        result.systemOpenClawInstalled = true;
        return result;
      }
    } else {
      // 内置 Node.js 不可执行，记录日志并回退到第二级
      console.error('[runtime] 内置 Node.js 不可执行，回退到系统检测:', nodeCheck.error);
    }
  }

  // ── 第二级：检测系统 Node.js + 系统 OpenClaw CLI ────────────────────────

  const sysNodeResult = await runCommand('node', ['--version']);
  if (sysNodeResult.success) {
    const version = sysNodeResult.output.trim();
    result.systemNodeVersion = version;
    const major = parseMajorVersion(version);
    result.systemNodeSatisfies = major !== null && major >= 22;

    if (result.systemNodeSatisfies) {
      result.nodePath = 'node'; // 系统 PATH 中的 node

      // 检测系统 OpenClaw CLI
      const sysClawResult = await runCommand('openclaw', ['--version']);
      if (sysClawResult.success) {
        result.tier = 'system';
        result.openclawPath = 'openclaw';
        result.systemOpenClawInstalled = true;
        return result;
      }

      // 系统 Node.js 可用但 CLI 未安装，仍标记为 system 层级
      result.tier = 'system';
      return result;
    }
  }

  // ── 第三级：检测网络可用性 ──────────────────────────────────────────────

  const online = await checkNetworkAvailable();
  result.tier = online ? 'online' : 'missing';

  return result;
}

// ─── 内置 OpenClaw CLI 执行 ─────────────────────────────────────────────────

/**
 * 使用内置 Node.js 执行内置 OpenClaw CLI
 * 等效于: {bundledNodePath} {bundledOpenClawPath} [args]
 *
 * @param args 传递给 OpenClaw CLI 的参数列表
 * @returns 执行结果，包含 success、output 和可选的 error
 */
export async function runBundledOpenClaw(
  args: string[],
): Promise<{ success: boolean; output: string; error?: string }> {
  const nodePath = getBundledNodePath();
  const clawPath = getBundledOpenClawCLIPath();

  if (!nodePath) {
    return { success: false, output: '', error: '内置 Node.js 不可用' };
  }
  if (!clawPath) {
    return { success: false, output: '', error: '内置 OpenClaw CLI 不可用' };
  }

  return new Promise((resolve) => {
    try {
      const child = spawn(nodePath, [clawPath, ...args], {
        env: { ...process.env },
        timeout: 15000,
      });

      let output = '';
      let errorOutput = '';
      let settled = false;

      const finish = (res: { success: boolean; output: string; error?: string }) => {
        if (settled) return;
        settled = true;
        resolve(res);
      };

      child.stdout.on('data', (data) => {
        output += data.toString();
      });

      child.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          finish({ success: true, output: output.trim() });
          return;
        }
        finish({
          success: false,
          output: output.trim(),
          error: errorOutput.trim() || `进程退出码 ${code}`,
        });
      });

      child.on('error', (err) => {
        finish({ success: false, output: '', error: err.message });
      });

      // 超时保护
      setTimeout(() => {
        try { child.kill(); } catch {}
        finish({ success: false, output: output.trim(), error: '执行超时' });
      }, 15000);
    } catch (err: any) {
      resolve({ success: false, output: '', error: err.message });
    }
  });
}

// ─── 辅助：验证可执行文件 ───────────────────────────────────────────────────

/**
 * 验证指定路径的可执行文件是否能正常运行
 * 通过执行给定命令并检查退出码判断
 */
async function verifyExecutable(
  execPath: string,
  args: string[],
): Promise<{ success: boolean; output: string; error?: string }> {
  return new Promise((resolve) => {
    try {
      const child = spawn(execPath, args, { timeout: 5000 });
      let output = '';
      let errorOutput = '';
      let settled = false;

      const finish = (res: { success: boolean; output: string; error?: string }) => {
        if (settled) return;
        settled = true;
        resolve(res);
      };

      child.stdout.on('data', (d) => { output += d.toString(); });
      child.stderr.on('data', (d) => { errorOutput += d.toString(); });

      child.on('close', (code) => {
        if (code === 0) {
          finish({ success: true, output: output.trim() });
          return;
        }
        finish({
          success: false,
          output: output.trim(),
          error: errorOutput.trim() || `退出码 ${code}`,
        });
      });

      child.on('error', (err) => {
        finish({ success: false, output: '', error: err.message });
      });

      setTimeout(() => {
        try { child.kill(); } catch {}
        finish({ success: false, output: '', error: '验证超时' });
      }, 5000);
    } catch (err: any) {
      resolve({ success: false, output: '', error: err.message });
    }
  });
}

// ─── IPC 注册 ───────────────────────────────────────────────────────────────

/**
 * 注册运行时解析相关的 IPC handler
 * - system:resolveRuntime → 返回三级运行时解析结果
 */
export function setupRuntimeIPC(): void {
  ipcMain.handle('system:resolveRuntime', () => resolveRuntime());
}
