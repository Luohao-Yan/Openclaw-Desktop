// ============================================================================
// Setup Flow 类型定义
// 本文件包含引导流程的所有核心类型，采用判别联合 + Result 模式增强类型安全
// ============================================================================

/** 安装模式：本机安装 / 远程连接 */
export type SetupMode = 'local' | 'remote';

/** 运行时层级：内置 > 系统 > 在线安装 > 缺失 */
export type RuntimeTier = 'bundled' | 'system' | 'online' | 'missing';

// ============================================================================
// 错误处理类型
// ============================================================================

/**
 * 错误代码枚举
 * 用于程序化处理不同类型的错误
 */
export type SetupErrorCode =
  | 'IPC_UNAVAILABLE'           // IPC 方法不可用
  | 'IPC_CALL_FAILED'           // IPC 调用执行失败
  | 'NETWORK_TIMEOUT'           // 网络连接超时
  | 'ENVIRONMENT_CHECK_FAILED'  // 环境检测失败
  | 'INSTALL_FAILED'            // 安装失败
  | 'VERIFY_FAILED'             // 验证失败
  | 'CHANNEL_TEST_FAILED'       // 渠道测试失败
  | 'REMOTE_CONNECTION_FAILED'  // 远程连接失败
  | 'UNKNOWN';                  // 未知错误

/**
 * 结构化错误对象
 * 包含错误代码、用户可读消息、建议操作和技术细节
 */
export interface SetupError {
  /** 错误代码，用于程序化处理 */
  code: SetupErrorCode;
  /** 用户可读的错误消息 */
  message: string;
  /** 建议的解决操作 */
  suggestion: string;
  /** 技术细节（开发者调试用） */
  details?: string;
}

// ============================================================================
// Result 模式
// ============================================================================

/**
 * 通用 Result 类型
 * 用于 IPC 返回值，明确区分成功和失败情况
 * - success=true 时必有 data
 * - success=false 时必有 error
 */
export type Result<T, E = SetupError> =
  | { success: true; data: T }
  | { success: false; error: E };

// ============================================================================
// 环境检测相关类型
// ============================================================================

/** 可自动修复的环境问题 */
export interface FixableIssue {
  /** 问题唯一标识 */
  id: string;
  /** 问题描述标签 */
  label: string;
  /** 修复动作类型：安装 / 升级 / 修复 PATH */
  action: 'install' | 'upgrade' | 'fixPath';
  /** 严重程度：必要 / 可选 */
  severity: 'required' | 'optional';
}

/** 环境修复操作的执行结果 */
export interface FixResult {
  /** 修复是否成功 */
  success: boolean;
  /** 结果描述信息 */
  message: string;
  /** 执行的修复动作描述 */
  action: string;
  /** 失败时的错误信息 */
  error?: string;
}

/**
 * 环境检测纯数据接口
 * 从 SetupEnvironmentCheck 中提取的纯数据字段，不含状态标识
 */
export interface SetupEnvironmentCheckData {
  /** 操作系统平台标识 */
  platform: string;
  /** 操作系统平台显示名称 */
  platformLabel: string;
  /** 当前生效的运行时层级 */
  runtimeTier: RuntimeTier;
  /** 内置 Node.js 是否可用 */
  bundledNodeAvailable: boolean;
  /** 内置 Node.js 路径 */
  bundledNodePath?: string;
  /** 内置 OpenClaw CLI 是否可用 */
  bundledOpenClawAvailable: boolean;
  /** 内置 OpenClaw CLI 路径 */
  bundledOpenClawPath?: string;
  /** 系统是否已安装 Node.js */
  nodeInstalled: boolean;
  /** 系统 Node.js 版本号 */
  nodeVersion?: string;
  /** 系统 Node.js 版本是否满足最低要求 */
  nodeVersionSatisfies: boolean;
  /** 系统是否已安装 npm */
  npmInstalled: boolean;
  /** 系统 npm 版本号 */
  npmVersion?: string;
  /** 系统是否已安装 OpenClaw CLI */
  openclawInstalled: boolean;
  /** 系统 OpenClaw CLI 版本号 */
  openclawVersion?: string;
  /** OpenClaw 配置文件是否存在 */
  openclawConfigExists: boolean;
  /** OpenClaw 根目录路径 */
  openclawRootDir: string;
  /** 推荐的安装命令 */
  recommendedInstallCommand: string;
  /** 推荐的安装命令标签 */
  recommendedInstallLabel: string;
  /** 诊断备注信息列表 */
  notes: string[];
  /** 可自动修复的问题列表 */
  fixableIssues: FixableIssue[];
  /** ClawHub CLI 是否已安装 */
  clawhubInstalled: boolean;
  /** ClawHub CLI 版本号 */
  clawhubVersion?: string;
}

/**
 * 环境检测结果 — 判别联合
 * 区分三种状态：成功 / 失败 / 降级
 */
export type EnvironmentCheckResult =
  | {
      /** 检测成功 */
      status: 'success';
      /** 完整的检测数据 */
      data: SetupEnvironmentCheckData;
    }
  | {
      /** 检测失败 */
      status: 'failed';
      /** 错误信息 */
      error: SetupError;
      /** 已成功获取的部分结果 */
      partialData?: Partial<SetupEnvironmentCheckData>;
    }
  | {
      /** 降级模式 */
      status: 'fallback';
      /** 降级后的检测数据（部分字段使用默认值） */
      data: SetupEnvironmentCheckData;
      /** 降级原因 */
      reason: string;
    };

// ============================================================================
// 运行时解析类型（判别联合）
// ============================================================================

/**
 * 运行时解析结果 — 判别联合
 * 区分四种层级：bundled / system / online / missing
 */
export type RuntimeResolution =
  | {
      /** 内置运行时层级 */
      tier: 'bundled';
      /** Node.js 可执行文件路径 */
      nodePath: string;
      /** OpenClaw CLI 可执行文件路径 */
      openclawPath: string;
      /** 内置 Node.js 可用 */
      bundledNodeAvailable: true;
      /** 内置 OpenClaw CLI 可用 */
      bundledOpenClawAvailable: true;
    }
  | {
      /** 系统运行时层级 */
      tier: 'system';
      /** Node.js 可执行文件路径 */
      nodePath: string;
      /** OpenClaw CLI 可执行文件路径，未安装时为 null */
      openclawPath: string | null;
      /** 系统 Node.js 版本号 */
      systemNodeVersion: string;
      /** 系统 Node.js 版本满足要求 */
      systemNodeSatisfies: true;
      /** 系统是否已安装 OpenClaw CLI */
      systemOpenClawInstalled: boolean;
    }
  | {
      /** 在线安装层级（需要下载安装） */
      tier: 'online';
      /** Node.js 可执行文件路径，未找到时为 null */
      nodePath: string | null;
      /** OpenClaw CLI 可执行文件路径，未找到时为 null */
      openclawPath: string | null;
      /** 系统 Node.js 版本号，未检测到时为 null */
      systemNodeVersion: string | null;
      /** 系统 Node.js 版本是否满足要求 */
      systemNodeSatisfies: boolean;
    }
  | {
      /** 缺失层级（无可用运行时） */
      tier: 'missing';
      /** 错误信息 */
      error?: string;
    };

// ============================================================================
// 渠道配置类型
// ============================================================================

/** 渠道配置字段定义（每个渠道可有多个输入字段） */
export interface ChannelField {
  /** 字段唯一标识 */
  id: string;
  /** 字段显示标签 */
  label: string;
  /** 输入框占位提示 */
  placeholder: string;
  /** 输入类型：密码 / 文本 / 只读提示 */
  type: 'password' | 'text' | 'info';
  /** 是否必填 */
  required: boolean;
}

/**
 * 渠道配置 — 泛型接口
 * 泛型约束确保 fieldValues 的键与 fields 定义一致
 * 运行时通过工厂函数 createChannelConfig 保证类型安全
 */
export interface ChannelConfig<F extends readonly ChannelField[] = ChannelField[]> {
  /** 渠道唯一标识 */
  key: string;
  /** 渠道显示名称 */
  label: string;
  /** 渠道配置提示信息 */
  hint: string;
  /** Token 输入框标签（兼容旧逻辑） */
  tokenLabel: string;
  /** 是否启用该渠道 */
  enabled: boolean;
  /** 渠道凭证 Token（兼容旧逻辑，存储第一个字段的值） */
  token: string;
  /** 渠道各字段的值映射，键应与 fields[].id 一致 */
  fieldValues: Record<F[number]['id'], string>;
  /** 渠道专属输入字段定义 */
  fields: F;
  /** 连接测试状态：空闲 / 测试中 / 成功 / 失败 */
  testStatus: 'idle' | 'testing' | 'ok' | 'error';
  /** 连接测试失败时的错误信息 */
  testError?: string;
  /** CLI 添加命令模板，如 "openclaw channels add --channel telegram --token {token}" */
  cliHint?: string;
}

/**
 * 创建渠道配置的工厂函数
 * 编译时确保 fieldValues 初始键与 fields 定义匹配
 *
 * @param config - 渠道配置参数（不含自动生成的字段）
 * @returns 完整的渠道配置对象
 */
export function createChannelConfig<const F extends readonly ChannelField[]>(
  config: Omit<ChannelConfig<F>, 'fieldValues' | 'testStatus' | 'enabled' | 'token'> & {
    /** 可选的初始字段值 */
    fieldValues?: Partial<Record<F[number]['id'], string>>;
  },
): ChannelConfig<F> {
  // 根据 fields 定义初始化 fieldValues，确保所有字段都有对应的键
  const fieldValues = {} as Record<F[number]['id'], string>;
  for (const field of config.fields) {
    const fieldId = field.id as F[number]['id'];
    fieldValues[fieldId] = config.fieldValues?.[fieldId] ?? '';
  }

  return {
    ...config,
    enabled: false,
    token: '',
    fieldValues,
    testStatus: 'idle',
  };
}

/** 单个渠道的 CLI 添加结果 */
export interface ChannelAddResult {
  /** 渠道标识 */
  channelKey: string;
  /** 渠道显示名称 */
  channelLabel: string;
  /** CLI 命令是否执行成功 */
  success: boolean;
  /** CLI 标准输出 */
  output?: string;
  /** 错误信息 */
  error?: string;
  /** 该添加操作对应的 Account_ID，用于追溯具体账户 */
  accountId?: string;
}

// ============================================================================
// 设置类型（必填/可选分离）
// ============================================================================

/**
 * 必填设置字段
 * 引导完成后这些字段必须存在
 */
export interface SetupSettingsRequired {
  /** 运行模式：本机 / 远程 */
  runMode: SetupMode;
  /** 引导是否已完成 */
  setupCompleted: boolean;
  /** 安装模式：本机 / 远程 */
  setupMode: SetupMode;
}

/**
 * 可选设置字段
 * 引导过程中逐步填充的字段
 */
export interface SetupSettingsOptional {
  /** 当前引导步骤路径 */
  setupCurrentStep?: string;
  /** 最后访问时间 */
  setupLastVisitedAt?: string;
  /** 安装状态 */
  setupInstallStatus?: 'idle' | 'running' | 'succeeded' | 'failed';
  /** 安装消息 */
  setupInstallMessage?: string;
  /** 本地安装是否已验证 */
  localInstallValidated?: boolean;
  /** 远程连接是否已验证 */
  remoteConnectionValidated?: boolean;
  /** OpenClaw CLI 路径 */
  openclawPath?: string;
  /** OpenClaw 根目录 */
  openclawRootDir?: string;
  /** 远程主机地址 */
  remoteHost?: string;
  /** 远程端口 */
  remotePort?: number;
  /** 远程协议 */
  remoteProtocol?: 'http' | 'https';
  /** 远程 Token */
  remoteToken?: string;
  /** 检测到的平台标识 */
  detectedPlatform?: string;
  /** 检测到的平台显示名称 */
  detectedPlatformLabel?: string;
  /** 当前生效的运行时层级 */
  runtimeTier?: RuntimeTier;
  /** 消息渠道绑定配置 */
  channelBindings?: Record<string, { enabled: boolean; token?: string; fieldValues?: Record<string, string> }>;
  /** 引导流程中成功添加的渠道列表 */
  addedChannels?: Array<{ key: string; label: string }>;
  /** 引导流程中创建的 Agent 名称 */
  createdAgentName?: string;
  /** 引导流程中创建的 Agent ID */
  createdAgentId?: string;
  /** 引导流程中创建的 Agent 工作区路径 */
  createdAgentWorkspace?: string;
  /** 引导流程中创建的 Agent 模型配置 */
  createdAgentModel?: string;
}

/**
 * 引导进行中的设置
 * 所有字段可选，用于引导流程中的状态管理
 */
export type SetupSettings = Partial<SetupSettingsRequired> & SetupSettingsOptional;

/**
 * 引导完成后的设置
 * 必填字段已确认存在
 */
export type CompletedSetupSettings = SetupSettingsRequired & SetupSettingsOptional;

// ============================================================================
// 兼容性类型（保持向后兼容）
// ============================================================================

/**
 * 旧版环境检测接口
 * @deprecated 请使用 EnvironmentCheckResult 判别联合类型
 * 保留此接口以确保现有代码的向后兼容性
 */
export interface SetupEnvironmentCheck {
  /** 数据来源：IPC / 降级 */
  source: 'ipc' | 'fallback';
  /** 操作系统平台标识 */
  platform: string;
  /** 操作系统平台显示名称 */
  platformLabel: string;
  /** 运行时模式（旧版字段） */
  runtimeMode: 'bundled' | 'system' | 'missing';
  /** 运行时命令 */
  runtimeCommand?: string;
  /** 内置运行时是否可用（旧版字段） */
  bundledRuntimeAvailable: boolean;
  /** 系统是否已安装 Node.js */
  nodeInstalled: boolean;
  /** 系统 Node.js 版本号 */
  nodeVersion?: string;
  /** 系统 Node.js 版本是否满足最低要求 */
  nodeVersionSatisfies: boolean;
  /** 系统是否已安装 npm */
  npmInstalled: boolean;
  /** 系统 npm 版本号 */
  npmVersion?: string;
  /** 系统是否已安装 OpenClaw CLI */
  openclawInstalled: boolean;
  /** 系统 OpenClaw CLI 版本号 */
  openclawVersion?: string;
  /** OpenClaw 配置文件是否存在 */
  openclawConfigExists: boolean;
  /** OpenClaw 根目录路径 */
  openclawRootDir: string;
  /** 推荐的安装命令 */
  recommendedInstallCommand: string;
  /** 推荐的安装命令标签 */
  recommendedInstallLabel: string;
  /** 诊断备注信息列表 */
  notes: string[];
  /** 诊断错误信息 */
  diagnosticError?: string;
  /** 内置 Node.js 是否可用 */
  bundledNodeAvailable: boolean;
  /** 内置 Node.js 路径 */
  bundledNodePath?: string;
  /** 内置 OpenClaw CLI 是否可用 */
  bundledOpenClawAvailable: boolean;
  /** 内置 OpenClaw CLI 路径 */
  bundledOpenClawPath?: string;
  /** 当前生效的运行时层级 */
  runtimeTier: RuntimeTier;
  /** 可自动修复的问题列表 */
  fixableIssues: FixableIssue[];
  /** ClawHub CLI 是否已安装 */
  clawhubInstalled: boolean;
  /** ClawHub CLI 版本号 */
  clawhubVersion?: string;
}

/** 本地安装检测结果 */
export interface SetupLocalCheckResult {
  /** 是否检测到 OpenClaw 命令 */
  commandDetected: boolean;
  /** OpenClaw 命令路径 */
  commandPath: string;
  /** 是否检测到根目录 */
  rootDirDetected: boolean;
  /** 根目录路径 */
  rootDir: string;
  /** 版本检测是否成功 */
  versionSuccess: boolean;
  /** 版本输出 */
  versionOutput: string;
  /** 错误信息 */
  error: string;
}

/** 远程连接草稿 */
export interface SetupRemoteDraft {
  /** 主机地址 */
  host: string;
  /** 端口号 */
  port: string;
  /** 协议 */
  protocol: 'http' | 'https';
  /** Token */
  token: string;
}

/** 远程连接验证结果 */
export interface SetupRemoteVerificationResult {
  /** 是否已认证 */
  authenticated?: boolean;
  /** 错误信息 */
  error?: string;
  /** 主机地址 */
  host?: string;
  /** 端口号 */
  port?: number;
  /** 验证是否成功 */
  success: boolean;
  /** 版本号 */
  version?: string;
}

/** 安装结果 */
export interface SetupInstallResult {
  /** 安装是否成功 */
  success: boolean;
  /** 结果消息 */
  message: string;
  /** 执行的命令 */
  command: string;
  /** 命令输出 */
  output?: string;
  /** 错误信息 */
  error?: string;
}

// ============================================================================
// 旧版运行时解析接口（保持向后兼容）
// ============================================================================

/**
 * 旧版运行时解析结果接口
 * @deprecated 请使用 RuntimeResolution 判别联合类型
 * 保留此接口以确保现有代码的向后兼容性
 */
export interface LegacyRuntimeResolution {
  /** 当前生效的运行时层级 */
  tier: RuntimeTier;
  /** Node.js 可执行文件路径，未找到时为 null */
  nodePath: string | null;
  /** OpenClaw CLI 可执行文件路径，未找到时为 null */
  openclawPath: string | null;
  /** 内置 Node.js 是否可用 */
  bundledNodeAvailable: boolean;
  /** 内置 OpenClaw CLI 是否可用 */
  bundledOpenClawAvailable: boolean;
  /** 系统 Node.js 版本号，未检测到时为 null */
  systemNodeVersion: string | null;
  /** 系统 Node.js 版本是否满足最低要求（>= 22） */
  systemNodeSatisfies: boolean;
  /** 系统是否已安装 OpenClaw CLI */
  systemOpenClawInstalled: boolean;
  /** 解析过程中的错误信息 */
  error?: string;
}
