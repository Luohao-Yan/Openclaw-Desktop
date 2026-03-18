/**
 * 验证链纯逻辑模块
 *
 * 将验证链（Verify Chain）的结果构建逻辑提取为纯函数，
 * 不依赖 Electron、IPC 等运行时 API，便于属性测试。
 *
 * 验证链步骤：doctor_fix → cli_test → gateway_status → gateway_start → final_check
 */

// ─── 类型定义 ────────────────────────────────────────────────────────────────

/** 验证链步骤标识 */
export type VerifyStep =
  | 'doctor_fix'
  | 'cli_test'
  | 'gateway_status'
  | 'gateway_start'
  | 'final_check';

/** 单个验证步骤的执行结果 */
export interface VerifyStepResult {
  /** 步骤标识 */
  step: VerifyStep;
  /** 是否成功 */
  success: boolean;
  /** 结果描述信息 */
  message: string;
  /** 执行耗时（毫秒） */
  duration: number;
  /** 重试次数 */
  retryCount: number;
}

/** 完整验证链的执行结果 */
export interface VerifyChainResult {
  /** 整体是否成功（所有步骤均成功时为 true） */
  success: boolean;
  /** 每个步骤的执行结果 */
  steps: VerifyStepResult[];
  /** 总耗时（毫秒），所有步骤 duration 之和 */
  totalDuration: number;
  /** 第一个失败步骤的标识（全部成功时为 undefined） */
  failedStep?: VerifyStep;
  /** 针对失败步骤的修复建议（全部成功时为 undefined） */
  suggestion?: string;
}

// ─── 修复建议映射 ────────────────────────────────────────────────────────────

/** 根据失败步骤生成修复建议 */
const STEP_SUGGESTIONS: Record<VerifyStep, string> = {
  doctor_fix: '请尝试手动运行 `openclaw doctor --repair` 进行深度修复。',
  cli_test: '请确认 OpenClaw CLI 已正确安装，或在设置中配置正确的可执行文件路径。',
  gateway_status: '请检查 Gateway 服务是否已安装并正确配置。',
  gateway_start: '请检查端口是否被占用，或尝试运行 `openclaw doctor --repair` 修复服务。',
  final_check: '请检查 OpenClaw 运行状态后重试。',
};

// ─── 纯函数：构建验证链结果 ─────────────────────────────────────────────────

/**
 * 根据步骤结果列表构建完整的验证链结果
 *
 * 属性保证（P9）：
 *   (a) result.steps 包含所有输入步骤（顺序和内容一致）
 *   (b) result.success = true 当且仅当所有步骤 success = true
 *   (c) 当 success = false 时，failedStep 指向第一个失败步骤
 *
 * @param steps 各步骤的执行结果列表
 * @returns 完整的验证链结果
 */
export function buildVerifyChainResult(
  steps: VerifyStepResult[],
): VerifyChainResult {
  // 计算总耗时：所有步骤 duration 之和
  const totalDuration = steps.reduce((sum, s) => sum + s.duration, 0);

  // 判断整体是否成功：所有步骤均成功
  const allSuccess = steps.length > 0 && steps.every((s) => s.success);

  // 查找第一个失败步骤
  const firstFailed = steps.find((s) => !s.success);

  // 生成修复建议（仅在有失败步骤时）
  const suggestion = firstFailed
    ? STEP_SUGGESTIONS[firstFailed.step]
    : undefined;

  return {
    success: allSuccess,
    steps: [...steps],
    totalDuration,
    failedStep: firstFailed?.step,
    suggestion,
  };
}
