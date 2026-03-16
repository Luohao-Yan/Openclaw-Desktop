// ============================================================================
// Setup Flow Selectors
// 状态选择器，用于从 SetupState 中提取派生状态
// 所有选择器都是纯函数，便于测试和记忆化
// ============================================================================

import type { ChannelConfig, EnvironmentCheckResult, SetupError } from '../types/setup';
import type { SetupState } from './setupReducer';

// ============================================================================
// UI 状态选择器
// ============================================================================

/**
 * 选择当前是否处于忙碌状态（加载中）
 * 用于显示加载指示器或禁用交互
 *
 * @param state - 引导流程完整状态
 * @returns 是否正在执行异步操作
 *
 * @see 需求 1.4 — Setup_State 将相关状态分组为嵌套对象
 */
export function selectIsBusy(state: SetupState): boolean {
  return state.ui.isBusy;
}

/**
 * 选择当前错误对象
 * 返回结构化错误对象或 null（无错误）
 *
 * @param state - 引导流程完整状态
 * @returns 结构化错误对象或 null
 *
 * @see 需求 1.4 — Setup_State 将相关状态分组为嵌套对象
 */
export function selectError(state: SetupState): SetupError | null {
  return state.ui.error;
}

// ============================================================================
// 环境检测选择器
// ============================================================================

/**
 * 选择环境检测结果
 * 返回判别联合类型（success / failed / fallback）
 *
 * @param state - 引导流程完整状态
 * @returns 环境检测结果
 *
 * @see 需求 1.4 — Setup_State 将相关状态分组为嵌套对象
 */
export function selectEnvironmentCheck(state: SetupState): EnvironmentCheckResult {
  return state.environment.check;
}

// ============================================================================
// 渠道配置选择器
// ============================================================================

/**
 * 选择渠道配置列表
 * 返回所有渠道的配置数组
 *
 * @param state - 引导流程完整状态
 * @returns 渠道配置数组
 *
 * @see 需求 1.4 — Setup_State 将相关状态分组为嵌套对象
 */
export function selectChannelConfigs(state: SetupState): ChannelConfig[] {
  return state.channels.configs;
}

/**
 * 选择已启用的渠道数量
 * 派生状态：统计 configs 中 enabled 为 true 的渠道数量
 *
 * @param state - 引导流程完整状态
 * @returns 已启用的渠道数量
 *
 * @see 需求 1.6 — Setup_Flow_Context 将 40+ 个独立 useState 调用合并为单一 useReducer 调用
 */
export function selectEnabledChannelCount(state: SetupState): number {
  return state.channels.configs.filter((config) => config.enabled).length;
}

// ============================================================================
// 设置选择器
// ============================================================================

/**
 * 选择引导是否已完成
 * 用于判断是否需要显示引导流程或直接进入主界面
 *
 * @param state - 引导流程完整状态
 * @returns 引导是否已完成
 *
 * @see 需求 1.4 — Setup_State 将相关状态分组为嵌套对象
 */
export function selectHasCompletedSetup(state: SetupState): boolean {
  return state.settings.setupCompleted === true;
}
