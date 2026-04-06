/**
 * 连接管理器运行时模块
 *
 * 维护远程连接状态和心跳检测。
 * 纯逻辑函数已提取到 connectionManagerLogic.ts，便于属性测试。
 *
 * 依赖 electron-store 读取连接配置，依赖 fetch 发送心跳请求，
 * 依赖 Electron BrowserWindow 发送 IPC 事件通知渲染进程。
 */

import Store from 'electron-store';
import { BrowserWindow } from 'electron';
import { remoteRequest } from './remoteApiProxy.js';
import {
  HeartbeatStateMachine,
  HEARTBEAT_INTERVAL_MS,
  buildStatusEvent,
  calculateLatency,
} from './connectionManagerLogic.js';
import type {
  ConnectionStatus,
  ConnectionStatusEvent,
  RemoteInstanceConfig,
} from '../../types/remote.js';

// 重新导出纯逻辑，供其他模块使用
export {
  HeartbeatStateMachine,
  HEARTBEAT_INTERVAL_MS,
  buildStatusEvent,
  calculateLatency,
} from './connectionManagerLogic.js';

// ─── electron-store 实例 ─────────────────────────────────────────────────────

/** 连接管理器持久化配置结构 */
interface ConnectionManagerStore {
  remoteConnection?: {
    host: string;
    port: number;
    protocol: 'http' | 'https';
    token?: string;
    instanceId?: string;
  };
  runMode?: 'local' | 'remote';
  remoteInstances?: RemoteInstanceConfig[];
}

const store = new Store<ConnectionManagerStore>();

// ─── 状态变更回调类型 ────────────────────────────────────────────────────────

type StatusChangeCallback = (event: ConnectionStatusEvent) => void;

// ─── ConnectionManager 单例 ─────────────────────────────────────────────────

/**
 * 连接管理器
 *
 * 单例模式，维护当前活跃连接配置和状态。
 * 提供心跳检测、实例切换、断开连接、状态变更通知等功能。
 */
export class ConnectionManager {
  /** 单例实例 */
  private static _instance: ConnectionManager | null = null;

  /** 心跳状态机 */
  private _heartbeat: HeartbeatStateMachine;
  /** 心跳定时器 ID */
  private _heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  /** 最近一次延迟（毫秒） */
  private _latencyMs: number | undefined;
  /** 状态变更回调列表 */
  private _callbacks: StatusChangeCallback[] = [];

  private constructor() {
    this._heartbeat = new HeartbeatStateMachine('disconnected');
  }

  /** 获取单例实例 */
  static getInstance(): ConnectionManager {
    if (!ConnectionManager._instance) {
      ConnectionManager._instance = new ConnectionManager();
    }
    return ConnectionManager._instance;
  }

  /** 获取当前连接状态 */
  getStatus(): ConnectionStatus {
    return this._heartbeat.getStatus();
  }

  /** 获取当前活跃实例的连接配置 */
  getActiveConnection(): RemoteInstanceConfig | null {
    const conn = store.get('remoteConnection');
    if (!conn) return null;

    const instances = store.get('remoteInstances', []) as RemoteInstanceConfig[];
    if (conn.instanceId) {
      return instances.find((i) => i.id === conn.instanceId) ?? null;
    }
    return null;
  }

  /** 获取最近一次延迟（毫秒） */
  getLatency(): number | undefined {
    return this._latencyMs;
  }

  // ─── 心跳检测 ──────────────────────────────────────────────────────────

  /** 启动心跳检测（每 30 秒一次） */
  startHeartbeat(): void {
    // 避免重复启动
    this.stopHeartbeat();
    // 立即执行一次心跳
    this._performHeartbeat();
    // 设置定时器
    this._heartbeatTimer = setInterval(
      () => this._performHeartbeat(),
      HEARTBEAT_INTERVAL_MS,
    );
  }

  /** 停止心跳检测 */
  stopHeartbeat(): void {
    if (this._heartbeatTimer !== null) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
  }

  /** 执行一次心跳请求 */
  private async _performHeartbeat(): Promise<void> {
    const startTime = Date.now();
    try {
      const result = await remoteRequest<unknown>({
        method: 'GET',
        path: '/status',
        timeoutMs: 10_000,
      });

      const endTime = Date.now();
      const latency = calculateLatency(startTime, endTime);
      const previousStatus = this._heartbeat.getStatus();

      if (result.success) {
        this._latencyMs = latency;
        const newStatus = this._heartbeat.processHeartbeatResult(true);
        // 状态变更时通知
        if (previousStatus !== newStatus) {
          this._notifyStatusChange(
            buildStatusEvent(newStatus, undefined, latency),
          );
        }
      } else {
        const newStatus = this._heartbeat.processHeartbeatResult(false);
        if (previousStatus !== newStatus) {
          this._notifyStatusChange(
            buildStatusEvent(newStatus, undefined, undefined, result.error),
          );
        }
      }
    } catch {
      const previousStatus = this._heartbeat.getStatus();
      const newStatus = this._heartbeat.processHeartbeatResult(false);
      if (previousStatus !== newStatus) {
        this._notifyStatusChange(
          buildStatusEvent(newStatus, undefined, undefined, '心跳请求异常'),
        );
      }
    }
  }

  // ─── 实例切换与断开 ────────────────────────────────────────────────────

  /**
   * 切换到指定实例
   *
   * @param instanceId 目标实例 ID
   */
  async switchInstance(instanceId: string): Promise<void> {
    // 停止当前心跳
    this.stopHeartbeat();
    // 重置状态机
    this._heartbeat.reset();
    this._latencyMs = undefined;

    // 查找目标实例配置
    const instances = store.get('remoteInstances', []) as RemoteInstanceConfig[];
    const target = instances.find((i) => i.id === instanceId);
    if (!target) {
      this._notifyStatusChange(
        buildStatusEvent('error', instanceId, undefined, '未找到指定实例'),
      );
      return;
    }

    // 更新 remoteConnection 配置
    store.set('remoteConnection', {
      host: target.host,
      port: target.port,
      protocol: target.protocol,
      token: target.token,
      instanceId: target.id,
    });

    // 通知状态变为 connecting
    this._notifyStatusChange(buildStatusEvent('connecting', instanceId));

    // 启动心跳（首次心跳会立即执行，验证连接）
    this.startHeartbeat();
  }

  /** 断开当前连接 */
  disconnect(): void {
    this.stopHeartbeat();
    this._heartbeat = new HeartbeatStateMachine('disconnected');
    this._latencyMs = undefined;

    this._notifyStatusChange(buildStatusEvent('disconnected'));
  }

  // ─── 状态变更通知 ──────────────────────────────────────────────────────

  /**
   * 注册状态变更回调
   *
   * @param callback 状态变更回调函数
   * @returns 取消注册的函数
   */
  onStatusChange(callback: StatusChangeCallback): () => void {
    this._callbacks.push(callback);
    return () => {
      this._callbacks = this._callbacks.filter((cb) => cb !== callback);
    };
  }

  /** 通知所有回调和渲染进程 */
  private _notifyStatusChange(event: ConnectionStatusEvent): void {
    // 通知注册的回调
    for (const cb of this._callbacks) {
      try {
        cb(event);
      } catch {
        // 忽略回调异常
      }
    }

    // 通过 IPC 事件通知渲染进程
    try {
      const windows = BrowserWindow.getAllWindows();
      for (const win of windows) {
        if (!win.isDestroyed()) {
          win.webContents.send('remote:connectionStatus', event);
        }
      }
    } catch {
      // 忽略 IPC 发送异常（可能在测试环境中）
    }
  }
}
