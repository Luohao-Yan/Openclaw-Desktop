// ============================================================================
// Setup Flow Reducer
// 引导流程状态管理 reducer，使用 useReducer 模式实现可预测的状态变更
// ============================================================================

import type {
  ChannelAddResult,
  ChannelConfig,
  EnvironmentCheckResult,
  RuntimeResolution,
  SetupError,
  SetupErrorCode,
  SetupInstallResult,
  SetupLocalCheckResult,
  SetupMode,
  SetupRemoteDraft,
  SetupRemoteVerificationResult,
  SetupSettings,
} from '../types/setup';
import type { FixProgressState, SetupAction } from './setupActions';
import { isValidTransition, type StateChangeLog } from './stateTransitionLogic';

// ============================================================================
// SetupState 接口定义
// ============================================================================

/**
 * 引导流程完整状态
 * 将相关状态分组为嵌套对象，便于管理和维护
 *
 * @see 需求 1.4 — Setup_State 将相关状态分组为嵌套对象
 */
export interface SetupState {
  /** 安装模式：本机安装 / 远程连接 */
  mode: SetupMode | null;

  /** 环境检测相关状态 */
  environment: {
    /** 环境检测结果（判别联合：success / failed / fallback） */
    check: EnvironmentCheckResult;
    /** 运行时解析结果 */
    runtimeResolution: RuntimeResolution | null;
    /** 环境修复进度状态 */
    fixProgress: FixProgressState;
  };

  /** 本机安装相关状态 */
  local: {
    /** 本地安装检测结果 */
    checkResult: SetupLocalCheckResult | null;
    /** 安装结果 */
    installResult: SetupInstallResult;
  };

  /** 远程连接相关状态 */
  remote: {
    /** 远程连接草稿（用户输入的连接信息） */
    draft: SetupRemoteDraft;
    /** 远程连接验证结果 */
    verification: SetupRemoteVerificationResult | null;
  };

  /** 渠道配置相关状态 */
  channels: {
    /** 渠道配置列表 */
    configs: ChannelConfig[];
    /** 渠道批量添加结果 */
    addResults: ChannelAddResult[];
  };

  /** Agent 创建相关状态 */
  agent: {
    /** 引导流程中创建的 Agent 信息 */
    created: { id: string; name: string } | null;
  };

  /** UI 状态 */
  ui: {
    /** 是否正在初始化引导流程 */
    isBootstrapping: boolean;
    /** 是否正在执行异步操作 */
    isBusy: boolean;
    /** 结构化错误对象 */
    error: SetupError | null;
  };

  /** 持久化设置 */
  settings: SetupSettings;

  /** 状态变更日志（用于崩溃恢复诊断） */
  changeLogs: StateChangeLog[];
}

// ============================================================================
// 默认值常量
// ============================================================================

/** 默认远程连接草稿 */
const defaultRemoteDraft: SetupRemoteDraft = {
  host: '',
  port: '3000',
  protocol: 'http',
  token: '',
};

/** 默认安装结果 */
const defaultInstallResult: SetupInstallResult = {
  success: false,
  message: '',
  command: '',
};

/** 默认环境修复进度状态 */
const defaultFixProgress: FixProgressState = {
  action: '',
  status: 'idle',
  message: '',
};

/** 默认环境检测结果（降级模式） */
const defaultEnvironmentCheck: EnvironmentCheckResult = {
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
    notes: ['尚未执行环境检测'],
    fixableIssues: [],
  },
  reason: '初始化状态',
};

/**
 * 初始引导流程状态
 * 所有状态字段的默认值
 *
 * @see 需求 1.1 — Setup_Reducer 接收 Setup_State 和 Setup_Action 并返回新的 Setup_State
 */
export const initialSetupState: SetupState = {
  mode: null,

  environment: {
    check: defaultEnvironmentCheck,
    runtimeResolution: null,
    fixProgress: defaultFixProgress,
  },

  local: {
    checkResult: null,
    installResult: defaultInstallResult,
  },

  remote: {
    draft: defaultRemoteDraft,
    verification: null,
  },

  channels: {
    configs: [],
    addResults: [],
  },

  agent: {
    created: null,
  },

  ui: {
    isBootstrapping: true,
    isBusy: false,
    error: null,
  },

  settings: {},

  changeLogs: [],
};

// ============================================================================
// 错误工厂函数
// ============================================================================

/**
 * 创建结构化错误对象的工厂函数
 * 确保所有错误对象包含必需的字段
 *
 * @param code - 错误代码，用于程序化处理
 * @param message - 用户可读的错误消息
 * @param suggestion - 建议的解决操作
 * @param details - 可选的技术细节（开发者调试用）
 * @returns 结构化错误对象
 *
 * @see 需求 2.1 — 返回包含错误类型、错误消息、建议操作的结构化错误对象
 * @see 需求 2.4 — Error_Object 包含 code、message、suggestion、details 字段
 */
export function createSetupError(
  code: SetupErrorCode,
  message: string,
  suggestion: string,
  details?: string,
): SetupError {
  return { code, message, suggestion, details };
}

/**
 * 创建 IPC 不可用时的标准错误
 * 当 window.electronAPI 上的函数不存在时使用
 *
 * @param methodName - 不可用的 IPC 方法名称
 * @returns 结构化错误对象
 *
 * @see 需求 2.2 — IPC 不可用时显示明确的降级提示
 */
export function createIPCUnavailableError(methodName: string): SetupError {
  return createSetupError(
    'IPC_UNAVAILABLE',
    `桌面端功能不可用：${methodName}`,
    '请更新到最新版本的 OpenClaw Desktop',
    `window.electronAPI.${methodName} is not a function`,
  );
}

// ============================================================================
// Reducer 纯函数
// ============================================================================

/**
 * 引导流程状态 reducer
 * 纯函数，不产生副作用，所有异步操作在 Provider 的 action creator 中处理
 * 所有 case 使用展开运算符返回新对象，保持不可变性
 *
 * @param state - 当前状态
 * @param action - 要执行的 action
 * @returns 新的状态对象
 *
 * @see 需求 1.1 — Setup_Reducer 接收 Setup_State 和 Setup_Action 并返回新的 Setup_State
 * @see 需求 1.5 — reducer 处理后的状态保持不可变性（原状态不被修改）
 */
export function setupReducer(state: SetupState, action: SetupAction): SetupState {
  // 状态转换合法性校验（防御性编程：仅警告不阻断）
  const validation = isValidTransition(state, action);
  if (!validation.valid) {
    console.warn(`[SetupReducer] 不合法的状态转换: ${action.type} — ${validation.reason}`);
  }

  // 执行状态变更，将结果存入 newState
  let newState: SetupState;

  switch (action.type) {
    // ========================================================================
    // 模式设置
    // ========================================================================

    case 'SET_MODE':
      // 设置安装模式：本机安装 / 远程连接
      newState = {
        ...state,
        mode: action.payload,
      };
      break;

    // ========================================================================
    // UI 状态
    // ========================================================================

    case 'SET_BUSY':
      // 设置忙碌状态（加载中）
      newState = {
        ...state,
        ui: {
          ...state.ui,
          isBusy: action.payload,
        },
      };
      break;

    case 'SET_BOOTSTRAPPING':
      // 设置引导初始化状态
      newState = {
        ...state,
        ui: {
          ...state.ui,
          isBootstrapping: action.payload,
        },
      };
      break;

    case 'SET_ERROR':
      // 设置结构化错误对象，null 表示清除错误
      newState = {
        ...state,
        ui: {
          ...state.ui,
          error: action.payload,
        },
      };
      break;

    // ========================================================================
    // 环境检测相关
    // ========================================================================

    case 'SET_ENVIRONMENT_CHECK':
      // 设置环境检测结果（判别联合：success / failed / fallback）
      newState = {
        ...state,
        environment: {
          ...state.environment,
          check: action.payload,
        },
      };
      break;

    case 'SET_RUNTIME_RESOLUTION':
      // 设置运行时解析结果，null 表示未解析
      newState = {
        ...state,
        environment: {
          ...state.environment,
          runtimeResolution: action.payload,
        },
      };
      break;

    case 'SET_FIX_PROGRESS':
      // 设置环境修复进度状态
      newState = {
        ...state,
        environment: {
          ...state.environment,
          fixProgress: action.payload,
        },
      };
      break;

    // ========================================================================
    // 本机安装相关
    // ========================================================================

    case 'SET_LOCAL_CHECK':
      // 设置本地安装检测结果，null 表示重置
      newState = {
        ...state,
        local: {
          ...state.local,
          checkResult: action.payload,
        },
      };
      break;

    case 'SET_INSTALL_RESULT':
      // 设置安装结果
      newState = {
        ...state,
        local: {
          ...state.local,
          installResult: action.payload,
        },
      };
      break;

    // ========================================================================
    // 远程连接相关
    // ========================================================================

    case 'SET_REMOTE_DRAFT':
      // 设置远程连接草稿
      newState = {
        ...state,
        remote: {
          ...state.remote,
          draft: action.payload,
        },
      };
      break;

    case 'SET_REMOTE_VERIFICATION':
      // 设置远程连接验证结果，null 表示重置
      newState = {
        ...state,
        remote: {
          ...state.remote,
          verification: action.payload,
        },
      };
      break;

    // ========================================================================
    // 渠道配置相关
    // ========================================================================

    case 'SET_CHANNEL_CONFIGS':
      // 整体替换渠道配置列表
      newState = {
        ...state,
        channels: {
          ...state.channels,
          configs: action.payload,
        },
      };
      break;

    case 'UPDATE_CHANNEL': {
      // 更新单个渠道的部分配置
      const { key, updates } = action.payload;
      newState = {
        ...state,
        channels: {
          ...state.channels,
          configs: state.channels.configs.map((ch) =>
            ch.key === key ? { ...ch, ...updates } : ch,
          ),
        },
      };
      break;
    }

    case 'SET_CHANNEL_ADD_RESULTS':
      // 设置渠道批量添加结果
      newState = {
        ...state,
        channels: {
          ...state.channels,
          addResults: action.payload,
        },
      };
      break;

    // ========================================================================
    // Agent 创建相关
    // ========================================================================

    case 'SET_CREATED_AGENT':
      // 设置引导流程中创建的 Agent 信息，null 表示清除
      newState = {
        ...state,
        agent: {
          ...state.agent,
          created: action.payload,
        },
      };
      break;

    // ========================================================================
    // 设置相关
    // ========================================================================

    case 'SET_SETTINGS':
      // 整体替换设置
      newState = {
        ...state,
        settings: action.payload,
      };
      break;

    case 'MERGE_SETTINGS':
      // 合并部分设置（浅合并）
      newState = {
        ...state,
        settings: {
          ...state.settings,
          ...action.payload,
        },
      };
      break;

    // ========================================================================
    // 默认情况
    // ========================================================================

    default:
      // 未知 action 类型，返回原状态不变
      return state;
  }

  // 记录状态变更日志（保留最近 50 条，防止内存增长）
  const logEntry: StateChangeLog = {
    actionType: action.type,
    timestamp: Date.now(),
  };

  return {
    ...newState,
    changeLogs: [...state.changeLogs, logEntry].slice(-50),
  };
}
