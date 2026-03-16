// ============================================================================
// Setup Flow 降级环境检测工厂函数
// 用于在 IPC 不可用或环境检测失败时创建降级模式的环境检测结果
// ============================================================================

import type {
  EnvironmentCheckResult,
  SetupEnvironmentCheckData,
} from '../types/setup';

// ============================================================================
// 平台检测辅助函数
// ============================================================================

/**
 * 在渲染进程中检测当前操作系统平台
 * 使用 navigator.userAgent 进行推断
 *
 * @returns 平台标识和显示名称
 */
function detectRendererPlatform(): { platform: string; platformLabel: string } {
  const ua = navigator.userAgent.toLowerCase();

  if (ua.includes('win')) {
    return { platform: 'win32', platformLabel: 'Windows' };
  }
  if (ua.includes('mac')) {
    return { platform: 'darwin', platformLabel: 'macOS' };
  }
  if (ua.includes('linux')) {
    return { platform: 'linux', platformLabel: 'Linux' };
  }

  return { platform: 'unknown', platformLabel: '未知系统' };
}

// ============================================================================
// 默认值常量
// ============================================================================

/**
 * 获取默认的环境检测数据
 * 根据当前平台生成合适的默认值
 *
 * @returns 默认的 SetupEnvironmentCheckData 对象
 */
function getDefaultEnvironmentCheckData(): SetupEnvironmentCheckData {
  const platformInfo = detectRendererPlatform();
  const isWindows = platformInfo.platform === 'win32';

  return {
    // 平台信息
    platform: platformInfo.platform,
    platformLabel: platformInfo.platformLabel,

    // 运行时层级（降级模式默认为 missing）
    runtimeTier: 'missing',

    // 内置运行时状态
    bundledNodeAvailable: false,
    bundledOpenClawAvailable: false,

    // 系统 Node.js 状态
    nodeInstalled: false,
    nodeVersionSatisfies: false,

    // 系统 npm 状态
    npmInstalled: false,

    // 系统 OpenClaw CLI 状态
    openclawInstalled: false,
    openclawConfigExists: false,
    openclawRootDir: '',

    // 推荐安装命令（根据平台选择）
    recommendedInstallCommand: isWindows
      ? 'iwr -useb https://openclaw.ai/install.ps1 | iex'
      : 'curl -fsSL https://openclaw.ai/install.sh | bash',
    recommendedInstallLabel: isWindows
      ? 'PowerShell 安装脚本（Windows / WSL）'
      : 'Shell 安装脚本（macOS / Linux）',

    // 诊断信息
    notes: ['尚未执行环境检测'],
    fixableIssues: [],
  };
}

// ============================================================================
// 降级环境检测工厂函数
// ============================================================================

/**
 * 创建降级模式的环境检测结果
 *
 * 当 IPC 不可用或环境检测失败时，使用此函数创建降级结果。
 * 函数会保留 partialData 中所有已有的非空字段值，同时为缺失字段提供默认值。
 *
 * @param partialData - 已成功获取的部分检测数据（可选）
 * @param reason - 降级原因描述（可选，默认为 '降级模式'）
 * @returns 降级模式的环境检测结果（status: 'fallback'）
 *
 * @see 需求 2.5 — 环境检测失败时保留已成功获取的部分检测结果
 * @see Property 4 — 环境检测部分结果保留
 */
export function createFallbackEnvironmentCheck(
  partialData?: Partial<SetupEnvironmentCheckData>,
  reason?: string,
): EnvironmentCheckResult {
  // 获取默认值
  const defaults = getDefaultEnvironmentCheckData();

  // 如果没有部分数据，直接返回默认值
  if (!partialData) {
    return {
      status: 'fallback',
      data: defaults,
      reason: reason || '降级模式',
    };
  }

  // 合并数据：保留 partialData 中已有的非空字段值，缺失字段使用默认值
  const mergedData: SetupEnvironmentCheckData = {
    // 平台信息：优先使用 partialData 中的非空值
    platform: isNonEmptyString(partialData.platform)
      ? partialData.platform
      : defaults.platform,
    platformLabel: isNonEmptyString(partialData.platformLabel)
      ? partialData.platformLabel
      : defaults.platformLabel,

    // 运行时层级：优先使用 partialData 中的值
    runtimeTier: partialData.runtimeTier ?? defaults.runtimeTier,

    // 内置运行时状态：优先使用 partialData 中的值
    bundledNodeAvailable: partialData.bundledNodeAvailable ?? defaults.bundledNodeAvailable,
    bundledNodePath: partialData.bundledNodePath,
    bundledOpenClawAvailable: partialData.bundledOpenClawAvailable ?? defaults.bundledOpenClawAvailable,
    bundledOpenClawPath: partialData.bundledOpenClawPath,

    // 系统 Node.js 状态：优先使用 partialData 中的值
    nodeInstalled: partialData.nodeInstalled ?? defaults.nodeInstalled,
    nodeVersion: partialData.nodeVersion,
    nodeVersionSatisfies: partialData.nodeVersionSatisfies ?? defaults.nodeVersionSatisfies,

    // 系统 npm 状态：优先使用 partialData 中的值
    npmInstalled: partialData.npmInstalled ?? defaults.npmInstalled,
    npmVersion: partialData.npmVersion,

    // 系统 OpenClaw CLI 状态：优先使用 partialData 中的值
    openclawInstalled: partialData.openclawInstalled ?? defaults.openclawInstalled,
    openclawVersion: partialData.openclawVersion,
    openclawConfigExists: partialData.openclawConfigExists ?? defaults.openclawConfigExists,
    openclawRootDir: isNonEmptyString(partialData.openclawRootDir)
      ? partialData.openclawRootDir
      : defaults.openclawRootDir,

    // 推荐安装命令：优先使用 partialData 中的非空值
    recommendedInstallCommand: isNonEmptyString(partialData.recommendedInstallCommand)
      ? partialData.recommendedInstallCommand
      : defaults.recommendedInstallCommand,
    recommendedInstallLabel: isNonEmptyString(partialData.recommendedInstallLabel)
      ? partialData.recommendedInstallLabel
      : defaults.recommendedInstallLabel,

    // 诊断信息：合并 notes，优先使用 partialData 中的 fixableIssues
    notes: mergeNotes(defaults.notes, partialData.notes),
    fixableIssues: partialData.fixableIssues ?? defaults.fixableIssues,
  };

  return {
    status: 'fallback',
    data: mergedData,
    reason: reason || '降级模式',
  };
}

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 检查字符串是否为非空
 *
 * @param value - 要检查的值
 * @returns 如果值是非空字符串则返回 true
 */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * 合并 notes 数组
 * 将默认 notes 和部分数据中的 notes 合并，去除重复项
 *
 * @param defaultNotes - 默认的 notes 数组
 * @param partialNotes - 部分数据中的 notes 数组
 * @returns 合并后的 notes 数组
 */
function mergeNotes(defaultNotes: string[], partialNotes?: string[]): string[] {
  if (!partialNotes || partialNotes.length === 0) {
    return defaultNotes;
  }

  // 合并并去重
  const merged = [...defaultNotes];
  for (const note of partialNotes) {
    if (!merged.includes(note)) {
      merged.push(note);
    }
  }

  return merged;
}
