// ============================================================================
// 状态转换校验纯逻辑模块
// 提供引导流程状态转换合法性校验、持久化状态完整性检测、崩溃恢复等纯函数
// ============================================================================

import type { SetupSettings } from '../types/setup';
import type { SetupAction } from './setupActions';
import type { SetupState } from './setupReducer';

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 状态转换规则
 * 定义某个 action 类型在什么条件下才允许执行
 */
export interface TransitionRule {
  /** action 类型 */
  actionType: SetupAction['type'];
  /** 前置条件：state 必须满足的条件，返回 true 表示允许转换 */
  precondition: (state: SetupState) => boolean;
  /** 前置条件不满足时的原因描述 */
  failReason: string;
}

/**
 * 状态变更日志条目
 * 记录每次 dispatch 的 action 类型和时间戳，用于崩溃恢复
 */
export interface StateChangeLog {
  /** dispatch 的 action 类型 */
  actionType: string;
  /** 变更时间戳（毫秒） */
  timestamp: number;
  /** 变更前的引导步骤 */
  previousStep?: string;
  /** 变更后的引导步骤 */
  nextStep?: string;
}

// ============================================================================
// 状态转换规则定义
// ============================================================================

/**
 * 需要前置条件的 action 转换规则列表
 * 未列出的 action 类型默认始终合法（无前置条件）
 *
 * @see 需求 7.1 — 验证状态转换合法性，拒绝不合法的 action 序列
 */
const TRANSITION_RULES: TransitionRule[] = [
  {
    actionType: 'SET_LOCAL_CHECK',
    precondition: (state) => state.mode !== null,
    failReason: '必须先选择安装模式（SET_MODE）才能执行本地检测',
  },
  {
    actionType: 'SET_INSTALL_RESULT',
    precondition: (state) => state.mode !== null,
    failReason: '必须先选择安装模式（SET_MODE）才能设置安装结果',
  },
  {
    actionType: 'SET_REMOTE_VERIFICATION',
    precondition: (state) => state.mode !== null,
    failReason: '必须先选择安装模式（SET_MODE）才能验证远程连接',
  },
  {
    actionType: 'SET_CHANNEL_CONFIGS',
    precondition: (state) => state.environment.check.status !== 'fallback',
    failReason: '必须先完成环境检测才能配置渠道',
  },
  {
    actionType: 'SET_CREATED_AGENT',
    precondition: (state) => state.mode !== null,
    failReason: '必须先选择安装模式（SET_MODE）才能创建 Agent',
  },
];

// ============================================================================
// 稳定检查点定义
// ============================================================================

/**
 * 稳定检查点映射表
 * 将 action 类型映射到对应的检查点名称
 * 用于崩溃恢复时定位最近的稳定状态
 */
const STABLE_CHECKPOINTS: Record<string, string> = {
  SET_MODE: 'mode_selected',
  SET_ENVIRONMENT_CHECK: 'environment_checked',
  SET_LOCAL_CHECK: 'local_checked',
  SET_INSTALL_RESULT: 'install_completed',
  SET_CHANNEL_CONFIGS: 'channels_configured',
  SET_CREATED_AGENT: 'agent_created',
};

/**
 * 检查点优先级顺序（从最早到最晚）
 * 用于确定检查点的先后关系
 */
const CHECKPOINT_ORDER: string[] = [
  'mode_selected',
  'environment_checked',
  'local_checked',
  'install_completed',
  'channels_configured',
  'agent_created',
];

// ============================================================================
// 核心函数
// ============================================================================

/**
 * 验证状态转换是否合法
 * 检查给定的 action 在当前 state 下是否满足前置条件
 *
 * @param state - 当前引导流程状态
 * @param action - 要执行的 action
 * @returns 包含 valid 标志和可选原因描述的对象
 *
 * @see 需求 7.1 — 验证状态转换合法性
 */
export function isValidTransition(
  state: SetupState,
  action: SetupAction,
): { valid: boolean; reason?: string } {
  // 查找该 action 类型对应的转换规则
  const rule = TRANSITION_RULES.find((r) => r.actionType === action.type);

  // 没有对应规则的 action 类型默认始终合法
  if (!rule) {
    return { valid: true };
  }

  // 检查前置条件是否满足
  if (!rule.precondition(state)) {
    return { valid: false, reason: rule.failReason };
  }

  return { valid: true };
}

/**
 * 检测持久化状态的完整性
 * 验证 SetupSettings 中的字段是否一致、必填字段是否存在
 *
 * @param settings - 持久化的设置对象
 * @returns 包含 valid 标志和问题列表的对象
 *
 * @see 需求 7.2 — 检测持久化状态完整性，对不完整状态执行回滚
 */
export function validatePersistedState(
  settings: SetupSettings,
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  // 检查 1: setupCompleted=true 时必须有 setupMode
  if (settings.setupCompleted === true && !settings.setupMode) {
    issues.push('setupCompleted 为 true 但 setupMode 缺失');
  }

  // 检查 2: setupCompleted=true 时必须有 runMode
  if (settings.setupCompleted === true && !settings.runMode) {
    issues.push('setupCompleted 为 true 但 runMode 缺失');
  }

  // 检查 3: setupMode 和 runMode 应一致（如果都存在）
  if (settings.setupMode && settings.runMode && settings.setupMode !== settings.runMode) {
    issues.push('setupMode 与 runMode 不一致');
  }

  // 检查 4: 本地模式下应有本地安装验证标记
  if (settings.setupCompleted === true && settings.setupMode === 'local' && settings.localInstallValidated !== true) {
    issues.push('本地模式已完成但 localInstallValidated 未标记');
  }

  // 检查 5: 远程模式下应有远程连接验证标记
  if (settings.setupCompleted === true && settings.setupMode === 'remote' && settings.remoteConnectionValidated !== true) {
    issues.push('远程模式已完成但 remoteConnectionValidated 未标记');
  }

  // 检查 6: 远程模式下应有远程主机地址
  if (settings.setupCompleted === true && settings.setupMode === 'remote' && !settings.remoteHost) {
    issues.push('远程模式已完成但 remoteHost 缺失');
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

/**
 * 从变更日志中找到最近的稳定检查点
 * 从日志末尾向前搜索，找到最近一个对应稳定检查点的 action
 *
 * 对于 SET_ENVIRONMENT_CHECK，仅当日志条目的 nextStep 为 'environment_checked' 时
 * 才视为稳定检查点（表示环境检测成功）
 *
 * 对于 SET_INSTALL_RESULT，仅当日志条目的 nextStep 为 'install_completed' 时
 * 才视为稳定检查点（表示安装成功）
 *
 * @param logs - 状态变更日志列表（按时间顺序排列）
 * @returns 最近稳定检查点名称，无稳定检查点时返回 null
 *
 * @see 需求 7.2 — 崩溃后回滚到最近的稳定检查点
 */
export function findLastStableCheckpoint(
  logs: StateChangeLog[],
): string | null {
  // 从日志末尾向前搜索
  for (let i = logs.length - 1; i >= 0; i--) {
    const log = logs[i];
    const checkpoint = STABLE_CHECKPOINTS[log.actionType];

    if (!checkpoint) {
      continue;
    }

    // SET_ENVIRONMENT_CHECK 需要检测成功才算稳定检查点
    if (log.actionType === 'SET_ENVIRONMENT_CHECK') {
      if (log.nextStep === 'environment_checked') {
        return checkpoint;
      }
      continue;
    }

    // SET_INSTALL_RESULT 需要安装成功才算稳定检查点
    if (log.actionType === 'SET_INSTALL_RESULT') {
      if (log.nextStep === 'install_completed') {
        return checkpoint;
      }
      continue;
    }

    // 其他检查点类型直接返回
    return checkpoint;
  }

  return null;
}

/**
 * 获取步骤失败时应重置的状态字段
 * 返回一个 Partial<SetupState>，可通过展开运算符合并到当前状态
 * 所有步骤都会重置 ui.error 为 null
 *
 * @param step - 引导步骤标识
 * @returns 应重置的状态字段（Partial<SetupState>）
 *
 * @see 需求 7.3 — 步骤失败时将相关状态重置为初始值
 * @see 需求 7.5 — 重试时清除当前步骤的错误状态和中间结果
 */
export function getResetFieldsForStep(
  step: string,
): Partial<SetupState> {
  // 基础重置：所有步骤都清除 ui.error
  const baseReset: Partial<SetupState> = {
    ui: {
      isBootstrapping: false,
      isBusy: false,
      error: null,
    },
  };

  switch (step) {
    case 'environment':
      return {
        ...baseReset,
        environment: {
          check: {
            status: 'fallback',
            data: {
              platform: 'unknown',
              platformLabel: '未知系统',
              runtimeTier: 'missing',
              bundledNodeAvailable: false,
              bundledOpenClawAvailable: false,
              nodeInstalled: false,
              nodeVersionSatisfies: false,
              npmInstalled: false,
              openclawInstalled: false,
              openclawConfigExists: false,
              openclawRootDir: '',
              recommendedInstallCommand: 'curl -fsSL https://openclaw.ai/install.sh | bash',
              recommendedInstallLabel: 'Shell 安装脚本（macOS / Linux）',
              notes: [],
              fixableIssues: [],
            },
            reason: '步骤重置',
          },
          runtimeResolution: null,
          fixProgress: { action: '', status: 'idle', message: '' },
        },
      };

    case 'local_check':
      return {
        ...baseReset,
        local: {
          checkResult: null,
          installResult: { success: false, message: '', command: '' },
        },
      };

    case 'install':
      return {
        ...baseReset,
        local: {
          checkResult: null,
          installResult: { success: false, message: '', command: '' },
        },
      };

    case 'remote_verify':
      return {
        ...baseReset,
        remote: {
          draft: { host: '', port: '3000', protocol: 'http', token: '' },
          verification: null,
        },
      };

    case 'channels':
      return {
        ...baseReset,
        channels: {
          configs: [],
          addResults: [],
        },
      };

    case 'agent':
      return {
        ...baseReset,
        agent: {
          created: null,
        },
      };

    default:
      // 未知步骤仅重置 UI 错误状态
      return baseReset;
  }
}

// ============================================================================
// 导出辅助常量（供测试使用）
// ============================================================================

/** 导出检查点顺序（供外部模块使用） */
export { CHECKPOINT_ORDER, STABLE_CHECKPOINTS, TRANSITION_RULES };
