// ============================================================================
// Setup Flow Action 类型定义
// 所有引导流程状态变更通过 dispatch action 触发，每个 action 使用 type 字段区分
// ============================================================================

import type {
  ChannelAddResult,
  ChannelConfig,
  EnvironmentCheckResult,
  RuntimeResolution,
  SetupError,
  SetupInstallResult,
  SetupLocalCheckResult,
  SetupMode,
  SetupRemoteDraft,
  SetupRemoteVerificationResult,
  SetupSettings,
} from '../types/setup';

// ============================================================================
// 辅助类型
// ============================================================================

/**
 * 环境修复进度状态
 * 表示环境修复操作的当前执行状态
 */
export interface FixProgressState {
  /** 当前执行的修复动作描述 */
  action: string;
  /** 修复状态：空闲 / 执行中 / 完成 / 出错 */
  status: 'idle' | 'running' | 'done' | 'error';
  /** 状态描述信息 */
  message: string;
}

// ============================================================================
// SetupAction 判别联合类型
// ============================================================================

/**
 * 引导流程所有 action 类型的判别联合
 *
 * 每个 action 使用 `type` 字段作为判别标识，`payload` 类型严格匹配。
 * Reducer 通过 switch(action.type) 进行穷尽匹配，TypeScript 编译器
 * 会在 payload 类型不匹配时报错，确保 dispatch 调用时传入正确的参数。
 *
 * @see 需求 1.2 — Setup_Action 使用判别联合类型定义所有可能的 action 类型
 * @see 需求 5.4 — Setup_Action 使用 payload 类型推断确保 dispatch 调用时传入正确的参数
 */
export type SetupAction =
  /** 设置安装模式：本机安装 / 远程连接 */
  | { type: 'SET_MODE'; payload: SetupMode }
  /** 设置忙碌状态（加载中） */
  | { type: 'SET_BUSY'; payload: boolean }
  /** 设置引导初始化状态 */
  | { type: 'SET_BOOTSTRAPPING'; payload: boolean }
  /** 设置结构化错误对象，null 表示清除错误 */
  | { type: 'SET_ERROR'; payload: SetupError | null }
  /** 设置环境检测结果（判别联合：success / failed / fallback） */
  | { type: 'SET_ENVIRONMENT_CHECK'; payload: EnvironmentCheckResult }
  /** 设置本地安装检测结果，null 表示重置 */
  | { type: 'SET_LOCAL_CHECK'; payload: SetupLocalCheckResult | null }
  /** 设置远程连接草稿 */
  | { type: 'SET_REMOTE_DRAFT'; payload: SetupRemoteDraft }
  /** 设置远程连接验证结果，null 表示重置 */
  | { type: 'SET_REMOTE_VERIFICATION'; payload: SetupRemoteVerificationResult | null }
  /** 设置安装结果 */
  | { type: 'SET_INSTALL_RESULT'; payload: SetupInstallResult }
  /** 整体替换设置 */
  | { type: 'SET_SETTINGS'; payload: SetupSettings }
  /** 合并部分设置（浅合并） */
  | { type: 'MERGE_SETTINGS'; payload: Partial<SetupSettings> }
  /** 设置运行时解析结果，null 表示未解析 */
  | { type: 'SET_RUNTIME_RESOLUTION'; payload: RuntimeResolution | null }
  /** 设置环境修复进度状态 */
  | { type: 'SET_FIX_PROGRESS'; payload: FixProgressState }
  /** 整体替换渠道配置列表 */
  | { type: 'SET_CHANNEL_CONFIGS'; payload: ChannelConfig[] }
  /** 更新单个渠道的部分配置 */
  | { type: 'UPDATE_CHANNEL'; payload: { key: string; updates: Partial<ChannelConfig> } }
  /** 设置渠道批量添加结果 */
  | { type: 'SET_CHANNEL_ADD_RESULTS'; payload: ChannelAddResult[] }
  /** 设置引导流程中创建的 Agent 信息，null 表示清除 */
  | { type: 'SET_CREATED_AGENT'; payload: { id: string; name: string } | null };
