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
  gatewayStatus: boolean;       // GET /status
  gatewayStartStop: false;      // 不可用
  sessions: boolean;            // GET/DELETE /v1/sessions
  sessionSend: boolean;         // POST /v1/agent/run
  channels: boolean;            // GET /v1/channels
  channelEnableDisable: boolean;// POST /v1/channels/{id}/enable|disable
  logs: boolean;                // GET /api/v1/logs
  config: boolean;              // GET/PUT /api/v1/config
  skills: boolean;              // GET /api/v1/skills
  skillInstall: boolean;        // POST /api/v1/skills/install
  models: boolean;              // GET /v1/models
  cron: false;                  // 不可用
  approvals: false;             // 不可用
  systemStats: false;           // 不可用
  tailscale: false;             // 不可用
  agentCreate: false;           // 不可用
  agentWorkspace: false;        // 不可用
  environmentFix: false;        // 不可用
  customSkills: false;          // 不可用
  openLocalFile: false;         // 不可用
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
