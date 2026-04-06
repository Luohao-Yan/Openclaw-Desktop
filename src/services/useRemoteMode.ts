/**
 * 远程模式状态 Hook
 *
 * 提供远程模式下的连接状态、实例信息、延迟和功能可用性。
 * 监听 IPC 事件 `remote:connectionStatus` 实时更新连接状态，
 * 并在挂载时获取初始状态和远程功能映射。
 */

import { useState, useEffect, useCallback } from 'react';
import type { ConnectionStatus, RemoteCapabilities, ConnectionStatusEvent } from '../../types/remote';

/** 远程模式状态 */
export interface RemoteModeState {
  /** 是否处于远程模式 */
  isRemote: boolean;
  /** 当前连接状态 */
  connectionStatus: ConnectionStatus;
  /** 当前连接的实例标签（别名或 host:port） */
  instanceLabel: string;
  /** 延迟（毫秒） */
  latencyMs?: number;
  /** 远程模式功能可用性映射 */
  capabilities: RemoteCapabilities | null;
}

/** 默认初始状态 */
const DEFAULT_STATE: RemoteModeState = {
  isRemote: false,
  connectionStatus: 'disconnected',
  instanceLabel: '',
  latencyMs: undefined,
  capabilities: null,
};

/**
 * 远程模式 Hook
 *
 * 返回当前远程模式的完整状态，包括连接状态、实例信息和功能可用性。
 * 自动监听连接状态变更事件并更新。
 */
export function useRemoteMode(): RemoteModeState {
  const [state, setState] = useState<RemoteModeState>(DEFAULT_STATE);

  /** 获取初始连接状态 */
  const fetchInitialStatus = useCallback(async () => {
    try {
      // 获取连接状态
      const statusResult: ConnectionStatusEvent = await window.electronAPI.remoteGetConnectionStatus();

      // 获取功能可用性
      const capabilities: RemoteCapabilities = await window.electronAPI.remoteGetCapabilities();

      // 判断是否处于远程模式：有实例 ID 或状态非 disconnected 表示远程模式
      const isRemote = !!statusResult.instanceId || statusResult.status !== 'disconnected';

      setState({
        isRemote,
        connectionStatus: statusResult.status,
        instanceLabel: statusResult.instanceId || '',
        latencyMs: statusResult.latencyMs,
        capabilities: isRemote ? capabilities : null,
      });
    } catch {
      // IPC 调用失败时保持默认状态（本地模式）
    }
  }, []);

  useEffect(() => {
    // 挂载时获取初始状态
    fetchInitialStatus();

    // 监听连接状态变更事件
    const unsubscribe = window.electronAPI.onRemoteConnectionStatus(
      (event: ConnectionStatusEvent) => {
        setState((prev) => ({
          ...prev,
          isRemote: true,
          connectionStatus: event.status,
          instanceLabel: event.instanceId || prev.instanceLabel,
          latencyMs: event.latencyMs,
        }));
      },
    );

    // 清理订阅
    return () => {
      unsubscribe();
    };
  }, [fetchInitialStatus]);

  return state;
}

export default useRemoteMode;
