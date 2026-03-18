/**
 * Doctor 修复纯逻辑模块
 *
 * 将 doctor --fix / --repair CLI 输出解析、修复升级判断、回归检测等核心逻辑
 * 提取为纯函数，不依赖 Electron、child_process 等 Node.js API，便于属性测试。
 *
 * 所有函数均为纯函数，输入输出确定，无副作用。
 */

// ─── 类型定义 ────────────────────────────────────────────────────────────────

/** Doctor 修复级别：轻量级配置修复 / 深度服务修复 */
export type DoctorLevel = 'fix' | 'repair';

/** Doctor 修复结果 */
export interface DoctorFixResult {
  /** 修复是否成功（remainingIssues 为空时为 true） */
  success: boolean;
  /** 已修复的问题列表 */
  fixedIssues: string[];
  /** 仍然存在的问题列表 */
  remainingIssues: string[];
  /** 是否需要升级到 --repair */
  needsRepair: boolean;
  /** 是否检测到回归 */
  regressionDetected: boolean;
  /** 新出现的问题（修复后新增） */
  newIssues: string[];
}

/**
 * 简化的环境检测数据接口
 * 用于 detectRegression 对比修复前后的关键指标
 */
export interface EnvironmentSnapshot {
  /** Node.js 是否可用 */
  nodeAvailable: boolean;
  /** OpenClaw CLI 是否可用 */
  clawAvailable: boolean;
  /** Gateway 是否运行中 */
  gatewayRunning: boolean;
  /** 当前存在的问题列表 */
  issues: string[];
}

/** 默认最大重试次数 */
export const DEFAULT_MAX_RETRY = 2;

// ─── 纯函数：解析 doctor --fix CLI 输出 ─────────────────────────────────────

/**
 * 解析 doctor --fix CLI 输出，提取修复结果
 *
 * 解析规则：
 *   - "✓ Fixed: ..." 或 "✓ fixed: ..." → 已修复问题
 *   - "✗ Failed: ..." 或 "✗ failed: ..." → 仍存在的问题
 *   - "⚠ Remaining: ..." 或 "⚠ remaining: ..." → 仍存在的问题
 *
 * 属性保证（P8）：
 *   (a) fixedIssues ∪ remainingIssues 覆盖输出中所有识别到的问题
 *   (b) fixedIssues 和 remainingIssues 无交集
 *   (c) needsRepair = true 当且仅当 remainingIssues 非空
 *
 * @param output doctor --fix CLI 的标准输出内容
 * @returns 解析后的 DoctorFixResult
 */
export function parseDoctorOutput(output: string): DoctorFixResult {
  const fixedIssues: string[] = [];
  const remainingIssues: string[] = [];

  // 按行解析输出
  const lines = output.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // 匹配已修复的问题：✓ Fixed: <描述>
    const fixedMatch = trimmed.match(/^✓\s*[Ff]ixed:\s*(.+)$/);
    if (fixedMatch) {
      const issue = fixedMatch[1].trim();
      if (issue.length > 0) {
        fixedIssues.push(issue);
      }
      continue;
    }

    // 匹配失败的问题：✗ Failed: <描述>
    const failedMatch = trimmed.match(/^✗\s*[Ff]ailed:\s*(.+)$/);
    if (failedMatch) {
      const issue = failedMatch[1].trim();
      if (issue.length > 0) {
        remainingIssues.push(issue);
      }
      continue;
    }

    // 匹配残留的问题：⚠ Remaining: <描述>
    const remainingMatch = trimmed.match(/^⚠\s*[Rr]emaining:\s*(.+)$/);
    if (remainingMatch) {
      const issue = remainingMatch[1].trim();
      if (issue.length > 0) {
        remainingIssues.push(issue);
      }
      continue;
    }
  }

  // needsRepair 为 true 当且仅当 remainingIssues 非空
  const needsRepair = remainingIssues.length > 0;
  // success 为 true 当且仅当 remainingIssues 为空
  const success = !needsRepair;

  return {
    success,
    fixedIssues,
    remainingIssues,
    needsRepair,
    regressionDetected: false,
    newIssues: [],
  };
}

// ─── 纯函数：判断是否升级到 --repair ────────────────────────────────────────

/**
 * 判断是否应从 --fix 升级到 --repair
 *
 * 升级规则（P16）：
 *   (a) 当 remainingIssues 为空时返回 false（无需升级）
 *   (b) 当 retryCount >= DEFAULT_MAX_RETRY 且仍有残留问题时返回 true
 *   (c) 当 fixedIssues 非空但 remainingIssues 也非空时，根据重试次数决定
 *
 * @param fixResult 当前的修复结果
 * @param retryCount 已重试的次数（从 0 开始）
 * @param maxRetry 最大重试次数，默认为 DEFAULT_MAX_RETRY (2)
 * @returns 是否应升级到 --repair
 */
export function shouldEscalateToRepair(
  fixResult: DoctorFixResult,
  retryCount: number,
  maxRetry: number = DEFAULT_MAX_RETRY,
): boolean {
  // 无残留问题，无需升级
  if (fixResult.remainingIssues.length === 0) {
    return false;
  }

  // 已达最大重试次数且仍有残留问题，升级到 --repair
  if (retryCount >= maxRetry) {
    return true;
  }

  // 未达最大重试次数，继续重试 --fix
  return false;
}

// ─── 纯函数：对比修复前后环境检测结果，检测回归 ─────────────────────────────

/**
 * 对比修复前后的环境检测结果，检测回归
 *
 * 回归检测规则（P17）：
 *   (a) 当 after 中出现 before 中不存在的问题时，regressionDetected = true
 *   (b) 当 after 的所有指标均不劣于 before 时，regressionDetected = false
 *   (c) newIssues 精确列出 after 中新出现的问题
 *
 * 指标劣化判断：
 *   - nodeAvailable: true → false 为劣化
 *   - clawAvailable: true → false 为劣化
 *   - gatewayRunning: true → false 为劣化
 *   - issues: after 中出现 before 中不存在的条目为劣化
 *
 * @param before 修复前的环境快照
 * @param after 修复后的环境快照
 * @returns 回归检测结果
 */
export function detectRegression(
  before: EnvironmentSnapshot,
  after: EnvironmentSnapshot,
): { regressionDetected: boolean; newIssues: string[] } {
  const newIssues: string[] = [];

  // 检测 issues 列表中新出现的问题
  const beforeIssueSet = new Set(before.issues);
  for (const issue of after.issues) {
    if (!beforeIssueSet.has(issue)) {
      newIssues.push(issue);
    }
  }

  // 检测关键指标劣化（true → false）
  const nodeRegressed = before.nodeAvailable && !after.nodeAvailable;
  const clawRegressed = before.clawAvailable && !after.clawAvailable;
  const gatewayRegressed = before.gatewayRunning && !after.gatewayRunning;

  // 如果有指标劣化，生成对应的问题描述
  if (nodeRegressed) {
    newIssues.push('Node.js 在修复后变为不可用');
  }
  if (clawRegressed) {
    newIssues.push('OpenClaw CLI 在修复后变为不可用');
  }
  if (gatewayRegressed) {
    newIssues.push('Gateway 在修复后停止运行');
  }

  const regressionDetected = newIssues.length > 0;

  return { regressionDetected, newIssues };
}
