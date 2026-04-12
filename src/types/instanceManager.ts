/**
 * 实例管理器统一数据类型
 *
 * 定义多实例管理页面所需的数据结构，
 * 融合本地进程状态（InstanceInfo）与远程连接配置（RemoteInstanceConfig）。
 */

// ─── 实例来源类型 ────────────────────────────────────────────────────────────

/** 实例来源：本地安装 / 远程连接 */
export type InstanceSource = 'local' | 'remote';

// ─── 子进程信息 ──────────────────────────────────────────────────────────────

/** 子进程类型：LaunchAgent 服务 / OpenClaw Gateway */
export type SubProcessType = 'launchagent' | 'gateway';

/** 子进程运行状态 */
export type SubProcessStatus = 'running' | 'stopped' | 'starting' | 'error';

/** 子进程信息（LaunchAgent / OpenClaw Gateway） */
export interface SubProcessInfo {
  /** 子进程唯一标识，对应 IPC instanceId（如 'openclaw-launchagent' / 'openclaw-gateway'） */
  id: string;
  /** 显示名称 */
  name: string;
  /** 子进程类型 */
  type: SubProcessType;
  /** 当前运行状态 */
  status: SubProcessStatus;
  /** 进程 PID（仅 Gateway 有） */
  pid?: number;
  /** 监听端口（仅 Gateway 有） */
  port?: number;
  /** 最后活跃时间（ISO 8601） */
  lastActive?: string;
  /** 错误信息（status 为 error 时） */
  error?: string;
}

// ─── 实例连接状态 ────────────────────────────────────────────────────────────

/** 实例整体连接状态 */
export type InstanceConnectionStatus =
  | 'connected'      // 已连接
  | 'disconnected'   // 断开连接
  | 'connecting'     // 连接中
  | 'error';         // 连接错误

// ─── 托管实例（列表页展示单元） ─────────────────────────────────────────────

/**
 * 托管实例
 *
 * 实例列表页的展示单元，同时承载本地进程实例和远程实例两种场景。
 * - `source === 'local'`：本地安装，id 固定为 'local'，不可删除
 * - `source === 'remote'`：通过表单添加的远程/Docker 实例，使用 UUID
 */
export interface ManagedInstance {
  /** 实例唯一 ID。本地实例固定为 'local'；远程实例为 UUID */
  id: string;
  /** 实例来源 */
  source: InstanceSource;
  /** 别名（用户设置的显示名称） */
  alias: string;
  /** 连接协议（本地实例为 'local'，远程实例为 'http'/'https'） */
  protocol: 'http' | 'https' | 'local';
  /** 远程 host（本地实例为 'localhost'） */
  host: string;
  /** 远程端口（本地实例使用 Gateway 实际端口） */
  port?: number;
  /** 当前连接状态 */
  connectionStatus: InstanceConnectionStatus;
  /** OpenClaw 版本号 */
  version?: string;
  /** 连接延迟（毫秒，仅远程实例有） */
  latencyMs?: number;
  /** 创建时间（ISO 8601） */
  createdAt: string;
  /** 最后连接时间（ISO 8601） */
  lastConnectedAt?: string;
  /** 子进程列表（LaunchAgent + Gateway），详情页加载 */
  subProcesses?: SubProcessInfo[];
}

// ─── 添加实例表单数据 ────────────────────────────────────────────────────────

/** 添加远程实例的表单提交数据 */
export interface AddInstanceFormData {
  /** 别名（用户自定义显示名称） */
  alias: string;
  /** 连接协议 */
  protocol: 'http' | 'https';
  /** 远程 host */
  host: string;
  /** 远程端口 */
  port: number;
  /** 认证 Token（可选） */
  token?: string;
}

// ─── 实例详情页数据 ──────────────────────────────────────────────────────────

/** 实例详情页展示数据（含子进程列表和完整连接配置） */
export interface InstanceDetailData extends ManagedInstance {
  /** 子进程列表（已加载） */
  subProcesses: SubProcessInfo[];
  /** 连接配置（用于编辑表单，远程实例可修改） */
  connectionConfig: {
    alias: string;
    protocol: 'http' | 'https' | 'local';
    host: string;
    port?: number;
    token?: string;
  };
}
