/**
 * 远程管理共享类型定义
 *
 * 定义远程 API 代理层、连接管理器、WebSocket 管理器、
 * 多实例注册表等模块使用的共享接口和类型。
 * 同时被主进程（electron/）和渲染进程（src/）引用。
 */

// ─── 远程 API 代理层类型 ──────────────────────────────────────────────────────

/** 远程 API 请求选项 */
export interface RemoteRequestOptions {
  /** HTTP 方法 */
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  /** API 路径（如 '/status'、'/v1/sessions'） */
  path: string;
  /** 请求体（POST/PUT 时使用） */
  body?: unknown;
  /** 自定义超时时间（毫秒），默认 15000 */
  timeoutMs?: number;
}

/** 远程 API 响应结果 */
export interface RemoteApiResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  /** 认证是否失败 */
  authenticated?: boolean;
  /** HTTP 状态码 */
  statusCode?: number;
}

/** 远程模式下的功能可用性映射 */
export interface RemoteCapabilities {
  gatewayStatus: boolean;       // WS RPC health / HTTP GET /status
  gatewayStartStop: boolean;    // 始终 false（远程无法控制 Gateway 进程）
  sessions: boolean;            // WS RPC sessions.list / sessions.get
  sessionSend: boolean;         // WS RPC sessions.send
  channels: boolean;            // WS RPC channels.status
  channelEnableDisable: boolean;// WS RPC channels.reconnect
  logs: boolean;                // WS RPC logs.tail
  config: boolean;              // WS RPC config.get / config.set
  skills: boolean;              // WS RPC skills.status
  skillInstall: boolean;        // WS RPC skills.install
  models: boolean;              // HTTP GET /v1/models
  cron: boolean;                // WS RPC cron.list / cron.add / cron.run 等
  approvals: boolean;           // WS RPC exec.approvals.get（写操作暂不支持）
  systemStats: boolean;         // 始终 false
  tailscale: boolean;           // 始终 false
  agentCreate: boolean;         // WS RPC agents.list / agents.create / agents.delete
  agentWorkspace: boolean;      // 始终 false（文件系统操作不可远程）
  environmentFix: boolean;      // 始终 false
  customSkills: boolean;        // 始终 false
  openLocalFile: boolean;       // 始终 false
}

// ─── 连接管理器类型 ──────────────────────────────────────────────────────────

/** 连接状态 */
export type ConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'error';

/** 连接状态变更事件 */
export interface ConnectionStatusEvent {
  status: ConnectionStatus;
  instanceId?: string;
  latencyMs?: number;
  error?: string;
}

// ─── WebSocket 管理器类型 ────────────────────────────────────────────────────

/** WebSocket 连接配置 */
export interface WsConnectionConfig {
  host: string;
  port: number;
  protocol: 'ws' | 'wss';
  token?: string;
}

/** WebSocket 事件类型 */
export type WsEventType =
  | 'agent.text' | 'agent.thinking' | 'agent.tool.start'
  | 'agent.tool.result' | 'agent.done'
  | 'presence' | 'typing' | 'message'
  | 'session.created' | 'session.updated' | 'session.pruned'
  | 'heartbeat';

// ─── 多实例注册表类型 ────────────────────────────────────────────────────────

/** 远程实例连接配置 */
export interface RemoteInstanceConfig {
  id: string;
  alias: string;
  host: string;
  port: number;
  protocol: 'http' | 'https';
  /** token 加密存储，此处为解密后的明文 */
  token?: string;
  createdAt: string;
  lastConnectedAt?: string;
}

/** 实例状态 */
export interface InstanceStatus {
  id: string;
  status: ConnectionStatus;
  version?: string;
  latencyMs?: number;
  lastCheckedAt: string;
}
