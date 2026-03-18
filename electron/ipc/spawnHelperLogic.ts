/**
 * Spawn Helper 纯逻辑模块
 *
 * 将子进程执行相关的核心逻辑提取为纯函数，
 * 不依赖 Electron、child_process、fs 等 Node.js API，便于属性测试。
 *
 * 所有外部依赖（spawn 调用、Shell PATH 获取）保留在 spawnHelper.ts 中，
 * 本模块仅包含可独立测试的纯计算逻辑。
 */

// ─── 类型定义 ────────────────────────────────────────────────────────────────

/** Spawn 错误码枚举 */
export type SpawnErrorCode =
  | 'ENOENT'         // 命令不存在
  | 'TIMEOUT'        // 执行超时
  | 'SPAWN_FAILED'   // 进程创建失败
  | 'NON_ZERO_EXIT'  // 非零退出码
  | 'UNKNOWN';       // 未知错误

/** 统一的命令执行结果 */
export interface SpawnResult {
  /** 是否成功（退出码为 0） */
  success: boolean;
  /** 标准输出内容 */
  output: string;
  /** 错误信息 */
  error?: string;
  /** 进程退出码 */
  exitCode?: number;
  /** 结构化错误码 */
  errorCode?: SpawnErrorCode;
}

/** Spawn 执行选项 */
export interface SpawnOptions {
  /** 超时时间（毫秒），默认 30000 */
  timeoutMs?: number;
  /** 是否以 detached 模式运行（后台进程） */
  detached?: boolean;
  /** 额外环境变量 */
  extraEnv?: Record<string, string>;
  /** Windows 平台是否使用 shell 模式，默认 true */
  windowsShell?: boolean;
  /** 实时输出回调 */
  onOutput?: (data: string, isError: boolean) => void;
}

// ─── 纯函数：错误分类 ───────────────────────────────────────────────────────

/**
 * 根据错误对象分类 Spawn 错误码
 *
 * 分类规则：
 *   1. code === 'ENOENT' → ENOENT（命令不存在）
 *   2. killed === true 或 code === 'ETIMEDOUT' → TIMEOUT（执行超时）
 *   3. code === 'EPERM' / 'EACCES' / 'SPAWN_FAILED' 或 message 包含 spawn → SPAWN_FAILED
 *   4. 其他情况 → UNKNOWN
 *
 * @param err 错误对象，包含可选的 code、message、killed 字段
 * @returns 对应的 SpawnErrorCode 枚举值
 */
export function classifySpawnError(err: {
  code?: string;
  message?: string;
  killed?: boolean;
}): SpawnErrorCode {
  const code = (err.code || '').toUpperCase();
  const message = (err.message || '').toLowerCase();

  // ENOENT：命令不存在
  if (code === 'ENOENT') {
    return 'ENOENT';
  }

  // TIMEOUT：进程被超时终止
  if (err.killed === true || code === 'ETIMEDOUT') {
    return 'TIMEOUT';
  }

  // SPAWN_FAILED：进程创建失败（权限、路径等问题）
  if (
    code === 'EPERM' ||
    code === 'EACCES' ||
    code === 'SPAWN_FAILED' ||
    message.includes('spawn')
  ) {
    return 'SPAWN_FAILED';
  }

  // 兜底：未知错误
  return 'UNKNOWN';
}

// ─── 纯函数：构建 ENOENT 结构化错误信息 ─────────────────────────────────────

/**
 * 构建 ENOENT 错误的结构化信息
 *
 * 包含命令名称和搜索路径，帮助用户定位问题。
 *
 * @param command 执行的命令名称
 * @param searchPath 搜索路径（PATH 环境变量内容）
 * @returns 包含上下文的错误描述字符串
 */
export function buildEnoentError(command: string, searchPath: string): string {
  return `命令 '${command}' 未找到。搜索路径: ${searchPath}`;
}

// ─── 纯函数：构建超时结构化错误信息 ─────────────────────────────────────────

/**
 * 构建超时错误的结构化信息
 *
 * 包含命令名称和超时时长，帮助用户了解超时配置。
 *
 * @param command 执行的命令名称
 * @param timeoutMs 超时时长（毫秒）
 * @returns 包含上下文的超时错误描述字符串
 */
export function buildTimeoutError(command: string, timeoutMs: number): string {
  return `命令 '${command}' 执行超时（${timeoutMs}ms）`;
}

// ─── 纯函数：构建统一 SpawnResult ───────────────────────────────────────────

/**
 * 构建统一的 SpawnResult 对象
 *
 * 根据退出码、输出内容和错误信息构建标准化的执行结果。
 * success 为 true 当且仅当 exitCode === 0 且无错误。
 *
 * @param params 构建参数
 * @returns 标准化的 SpawnResult 对象
 */
export function buildSpawnResult(params: {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
  killed?: boolean;
  timeoutMs?: number;
  command?: string;
}): SpawnResult {
  const { exitCode, stdout, stderr, error, killed, timeoutMs, command } = params;

  // 有异常错误对象时，分类并构建错误结果
  if (error) {
    const errorCode = classifySpawnError({
      code: (error as any).code,
      message: error.message,
      killed,
    });

    let errorMessage: string;
    if (errorCode === 'ENOENT' && command) {
      errorMessage = buildEnoentError(command, '(见 PATH 环境变量)');
    } else if (errorCode === 'TIMEOUT' && command && timeoutMs !== undefined) {
      errorMessage = buildTimeoutError(command, timeoutMs);
    } else {
      errorMessage = error.message || '未知错误';
    }

    return {
      success: false,
      output: stdout,
      error: errorMessage,
      exitCode: exitCode ?? undefined,
      errorCode,
    };
  }

  // 进程被超时终止（killed 但无 error 对象）
  if (killed) {
    return {
      success: false,
      output: stdout,
      error: command && timeoutMs !== undefined
        ? buildTimeoutError(command, timeoutMs)
        : '命令执行超时',
      exitCode: exitCode ?? undefined,
      errorCode: 'TIMEOUT',
    };
  }

  // 非零退出码
  if (exitCode !== 0) {
    return {
      success: false,
      output: stdout,
      error: stderr || `进程退出码: ${exitCode}`,
      exitCode: exitCode ?? undefined,
      errorCode: 'NON_ZERO_EXIT',
    };
  }

  // 成功：exitCode === 0
  return {
    success: true,
    output: stdout,
    exitCode: 0,
  };
}

// ─── 纯函数：构建注入 PATH 的环境变量 ───────────────────────────────────────

/**
 * 构建注入 Shell PATH 的环境变量对象
 *
 * 将 shellPath 设置为 PATH 环境变量，并合并额外的环境变量。
 * 额外环境变量中的 PATH 不会覆盖 shellPath（shellPath 优先）。
 *
 * @param shellPath 通过 login shell 解析得到的完整 PATH
 * @param extraEnv 额外需要注入的环境变量
 * @returns 合并后的环境变量对象
 */
export function buildSpawnEnv(
  shellPath: string,
  extraEnv?: Record<string, string>,
): Record<string, string> {
  const env: Record<string, string> = {};

  // 先合并额外环境变量
  if (extraEnv) {
    Object.assign(env, extraEnv);
  }

  // shellPath 始终覆盖 PATH，确保注入一致性
  env.PATH = shellPath;

  return env;
}
