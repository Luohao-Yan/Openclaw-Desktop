/**
 * 环境修复纯逻辑模块
 *
 * 将 environmentFixer.ts 中 runSpawnCommand 和 runUpgradeCommand 的核心逻辑
 * 提取为纯函数，不依赖 Electron、child_process 等运行时环境，便于属性测试。
 *
 * 所有外部依赖（processEnv、platform、homedir、getShellPath）均通过参数注入。
 *
 * 修复内容：
 * 1. buildSpawnEnv 使用 shellPath 覆盖 PATH，并合并 extraEnv
 * 2. buildUpgradeCommand 在 nvm 场景下注入 NVM_DIR
 * 3. buildUpgradeVerificationOrder 返回正确顺序（先清缓存再验证）
 */

import path from 'path';

// ─── 类型定义 ────────────────────────────────────────────────────────────────

/** 版本管理器信息（与 environmentFixer.ts 中的 VersionManagerInfo 一致） */
export interface VersionManagerInfo {
  /** 版本管理器名称 */
  name: string;
  /** 升级命令 */
  command: string;
  /** 升级命令参数 */
  args: string[];
  /** 是否需要通过 login shell 执行 */
  useLoginShell: boolean;
}

/** buildSpawnEnv 的输入参数 */
export interface SpawnEnvParams {
  /** 当前进程环境变量 */
  processEnv: Record<string, string | undefined>;
  /** getShellPath() 返回的完整 PATH */
  shellPath: string;
  /** 额外需要注入的环境变量 */
  extraEnv?: Record<string, string>;
}

/** buildUpgradeCommand 的输入参数 */
export interface UpgradeCommandParams {
  /** 版本管理器信息 */
  versionManager: VersionManagerInfo;
  /** 运行平台标识 */
  platform: string;
  /** 用户主目录路径 */
  homedir: string;
  /** 当前进程环境变量 */
  processEnv: Record<string, string | undefined>;
  /** getShellPath() 返回的完整 PATH */
  shellPath: string;
}

/** buildUpgradeCommand 的返回结果 */
export interface UpgradeCommandResult {
  /** 要执行的命令 */
  command: string;
  /** 命令参数 */
  args: string[];
  /** spawn 使用的环境变量 */
  env: Record<string, string | undefined>;
}

/** 升级验证步骤 */
export type VerificationStep = 'clearPathCache' | 'verifyVersion';

// ─── 纯函数：构建 spawn 环境变量 ────────────────────────────────────────────

/**
 * 构建 spawn 子进程使用的环境变量
 *
 * 使用 shellPath 覆盖 PATH，确保子进程能访问版本管理器路径。
 * 同时合并 extraEnv 中的额外环境变量（如 NVM_DIR）。
 *
 * @param params 构建参数
 * @returns spawn 使用的环境变量对象
 */
export function buildSpawnEnv(params: SpawnEnvParams): Record<string, string | undefined> {
  const { processEnv, shellPath, extraEnv } = params;
  // 使用 shellPath 覆盖 PATH，合并 extraEnv
  return { ...processEnv, PATH: shellPath, ...extraEnv };
}

// ─── 纯函数：构建升级命令 ────────────────────────────────────────────────────

/**
 * 根据版本管理器类型构建升级命令、参数和环境变量
 *
 * - nvm 场景：通过 login shell 执行，注入 NVM_DIR 和完整 shellPath
 * - 非 nvm 场景：直接执行版本管理器命令
 *
 * @param params 构建参数
 * @returns 命令、参数和环境变量
 */
export function buildUpgradeCommand(params: UpgradeCommandParams): UpgradeCommandResult {
  const { versionManager: vm, platform, homedir, processEnv, shellPath } = params;

  if (vm.useLoginShell && platform !== 'win32') {
    // nvm 场景：需要通过 login shell 执行
    const shellBin = processEnv.SHELL && processEnv.SHELL.startsWith('/')
      ? processEnv.SHELL
      : '/bin/bash';
    const nvmDir = processEnv.NVM_DIR || path.join(homedir, '.nvm');
    const cmd = `source "${nvmDir}/nvm.sh" && ${vm.command} ${vm.args.join(' ')}`;

    // 注入 NVM_DIR 和完整 shellPath
    const env = buildSpawnEnv({
      processEnv,
      shellPath,
      extraEnv: { NVM_DIR: nvmDir },
    });

    return {
      command: shellBin,
      args: ['-l', '-c', cmd],
      env,
    };
  }

  // 非 nvm 场景：直接执行版本管理器命令
  const env = buildSpawnEnv({ processEnv, shellPath });

  return {
    command: vm.command,
    args: [...vm.args],
    env,
  };
}

// ─── 纯函数：构建升级验证步骤顺序 ──────────────────────────────────────────

/**
 * 返回升级后验证步骤的执行顺序
 *
 * 正确顺序：先清除 PATH 缓存，再验证版本。
 * 确保验证时使用最新的 PATH，能检测到新安装的 Node.js 版本。
 *
 * @returns 验证步骤的有序数组
 */
export function buildUpgradeVerificationOrder(): VerificationStep[] {
  // 先清除缓存，再验证版本
  return ['clearPathCache', 'verifyVersion'];
}
