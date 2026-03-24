/**
 * ClawHub CLI 检测与安装纯逻辑模块
 *
 * 将 clawhub CLI 的检测、安装命令构建、结果验证和错误格式化
 * 提取为纯函数，不依赖 Electron、child_process 等运行时环境，便于属性测试。
 *
 * 遵循 environmentFixerLogic.ts 的模式，所有外部依赖通过参数注入。
 */

// ─── 类型定义 ────────────────────────────────────────────────────────────────

/** 命令执行结果（由调用方提供） */
export interface CommandResult {
  /** 命令是否执行成功 */
  success: boolean;
  /** 命令输出内容 */
  output: string;
}

/** clawhub 检测结果 */
export interface ClawHubDetectResult {
  /** clawhub CLI 是否已安装 */
  installed: boolean;
  /** 检测到的版本号 */
  version?: string;
  /** 检测来源：openclaw 子命令 或 独立命令 */
  source?: 'openclaw' | 'standalone';
}

/** FixableIssue 类型（与 system.ts 中的定义一致） */
export interface FixableIssue {
  /** 问题唯一标识 */
  id: string;
  /** 问题描述标签 */
  label: string;
  /** 修复动作类型 */
  action: 'install' | 'upgrade' | 'fixPath';
  /** 严重程度 */
  severity: 'required' | 'optional';
}

/** 安装命令构建结果 */
export interface InstallCommandResult {
  /** 要执行的命令 */
  command: string;
  /** 命令参数 */
  args: string[];
  /** spawn 使用的环境变量 */
  env: Record<string, string | undefined>;
}

/** 安装验证结果 */
export interface InstallValidationResult {
  /** 验证是否成功 */
  success: boolean;
  /** 成功时的版本号 */
  version?: string;
  /** 失败时的错误信息 */
  error?: string;
}

// ─── 纯函数：解析 clawhub 检测状态 ──────────────────────────────────────────

/**
 * 根据两种检测方式的命令执行结果，判断 clawhub CLI 是否可用
 *
 * 优先取 openclaw 子命令的结果；任一方式成功即视为已安装。
 * 版本号从成功的命令输出中提取（去除首尾空白）。
 *
 * @param openclawResult - `openclaw clawhub --version` 的执行结果
 * @param standaloneResult - 独立 `clawhub --version` 的执行结果
 * @returns clawhub 检测结果
 */
export function resolveClawHubStatus(
  openclawResult: CommandResult,
  standaloneResult: CommandResult,
): ClawHubDetectResult {
  // 优先使用 openclaw 子命令结果
  if (openclawResult.success) {
    const version = openclawResult.output.trim() || undefined;
    return { installed: true, version, source: 'openclaw' };
  }

  // 回退到独立 clawhub 命令
  if (standaloneResult.success) {
    const version = standaloneResult.output.trim() || undefined;
    return { installed: true, version, source: 'standalone' };
  }

  // 两种方式均失败
  return { installed: false };
}

// ─── 纯函数：生成 FixableIssue ──────────────────────────────────────────────

/**
 * 根据检测结果和运行时层级生成 FixableIssue
 *
 * 仅当 clawhub 未安装且运行时层级不为 bundled 时，才生成可修复问题项。
 * severity 为 optional，因为 clawhub 不是核心运行依赖。
 *
 * @param detected - clawhub 检测结果
 * @param runtimeTier - 当前运行时层级（bundled / system / missing）
 * @returns FixableIssue 或 null
 */
export function buildClawHubFixableIssue(
  detected: ClawHubDetectResult,
  runtimeTier: string,
): FixableIssue | null {
  // 已安装或 bundled 模式下无需生成修复项
  if (detected.installed || runtimeTier === 'bundled') {
    return null;
  }

  return {
    id: 'clawhub-not-installed',
    label: 'ClawHub CLI 未安装',
    action: 'install',
    severity: 'optional',
  };
}

// ─── 纯函数：构建安装命令 ────────────────────────────────────────────────────

/**
 * 构建 npm install -g @nicepkg/clawhub 命令的参数和环境变量
 *
 * 使用传入的 shellPath 覆盖 PATH，确保能找到通过版本管理器安装的 npm。
 *
 * @param processEnv - 当前进程环境变量
 * @param shellPath - getShellPath() 返回的完整 PATH
 * @returns 命令、参数和环境变量
 */
export function buildClawHubInstallCommand(
  processEnv: Record<string, string | undefined>,
  shellPath: string,
): InstallCommandResult {
  return {
    command: 'npm',
    args: ['install', '-g', '@nicepkg/clawhub'],
    env: { ...processEnv, PATH: shellPath },
  };
}

// ─── 纯函数：验证安装结果 ────────────────────────────────────────────────────

/**
 * 验证安装后 clawhub --version 的执行结果
 *
 * success 为 true 且 output 非空时视为安装成功，提取版本号。
 * 否则视为安装失败，返回错误信息。
 *
 * @param versionCheckResult - clawhub --version 的执行结果
 * @returns 验证结果
 */
export function validateInstallResult(
  versionCheckResult: CommandResult,
): InstallValidationResult {
  if (versionCheckResult.success && versionCheckResult.output.trim()) {
    return {
      success: true,
      version: versionCheckResult.output.trim(),
    };
  }

  return {
    success: false,
    error: versionCheckResult.success
      ? 'clawhub --version 返回了空输出'
      : `clawhub --version 执行失败: ${versionCheckResult.output || '未知错误'}`,
  };
}

// ─── 纯函数：格式化搜索错误信息 ─────────────────────────────────────────────

/**
 * 当错误信息包含 ENOENT 或 not found 时，返回用户友好的安装引导信息
 *
 * 引导信息包含手动安装命令和 Setup 向导引导，不包含原始错误堆栈。
 * 如果错误信息不匹配 ENOENT/not found，返回 null 表示不处理。
 *
 * @param errorMessage - 原始错误信息
 * @returns 用户友好的错误信息，或 null（不匹配时）
 */
export function formatClawHubSearchError(
  errorMessage: string,
): string | null {
  const lower = errorMessage.toLowerCase();
  if (lower.includes('enoent') || lower.includes('not found')) {
    return 'ClawHub CLI 未安装。请前往「设置 → 环境自检」页面安装，或手动执行 npm install -g @nicepkg/clawhub';
  }
  return null;
}
