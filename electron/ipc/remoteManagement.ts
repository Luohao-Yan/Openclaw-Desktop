/**
 * 远程管理 IPC 注册模块
 *
 * 注册远程管理相关的 IPC 通道，包括：
 * - 远程功能可用性查询
 * - 连接状态查询
 * - 实例切换
 * - 多实例 CRUD 操作
 *
 * 所有 handler 委托给 remoteApiProxyLogic、ConnectionManager、InstanceRegistry 等模块。
 */

import pkg from 'electron';
const { ipcMain } = pkg;
import { getRemoteCapabilities } from './remoteApiProxyLogic.js';
import { ConnectionManager, buildStatusEvent } from './connectionManager.js';
import { InstanceRegistry } from './instanceRegistry.js';
import type { RemoteInstanceConfig } from '../../types/remote.js';
import { resetWsConnection } from './remoteRpcProxy.js';

// ─── 实例注册表单例 ─────────────────────────────────────────────────────────

let _registry: InstanceRegistry | null = null;

/** 获取实例注册表单例 */
function getRegistry(): InstanceRegistry {
  if (!_registry) {
    _registry = new InstanceRegistry();
  }
  return _registry;
}

// ─── IPC 注册 ───────────────────────────────────────────────────────────────

/**
 * 注册远程管理相关的 IPC handler
 *
 * - `remote:getCapabilities` — 获取远程模式功能可用性映射
 * - `remote:getConnectionStatus` — 获取当前连接状态
 * - `remote:switchInstance` — 切换到指定远程实例
 * - `remote:instances:getAll` — 获取所有已注册实例
 * - `remote:instances:add` — 添加新远程实例
 * - `remote:instances:remove` — 删除远程实例
 * - `remote:instances:update` — 更新实例配置
 * - `remote:instances:refreshAll` — 并行刷新所有实例状态
 */
export function setupRemoteManagementIPC(): void {
  // 获取远程模式功能可用性映射
  ipcMain.handle('remote:getCapabilities', () => {
    return getRemoteCapabilities();
  });

  // 获取当前连接状态（构建 ConnectionStatusEvent）
  ipcMain.handle('remote:getConnectionStatus', () => {
    const cm = ConnectionManager.getInstance();
    const status = cm.getStatus();
    const latency = cm.getLatency();
    const activeConn = cm.getActiveConnection();
    return buildStatusEvent(status, activeConn?.id, latency);
  });

  // 切换到指定远程实例
  ipcMain.handle('remote:switchInstance', async (_event, instanceId: string) => {
    try {
      // 切换实例前重置 WS 连接，确保下次 RPC 调用使用新实例的连接参数
      resetWsConnection();
      const cm = ConnectionManager.getInstance();
      await cm.switchInstance(instanceId);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  // 获取所有已注册实例
  ipcMain.handle('remote:instances:getAll', () => {
    const registry = getRegistry();
    return { success: true, instances: registry.getAll() };
  });

  // 添加新远程实例（先测试连接，通过后持久化）
  ipcMain.handle(
    'remote:instances:add',
    async (_event, config: Omit<RemoteInstanceConfig, 'id' | 'createdAt'>) => {
      const registry = getRegistry();
      return registry.add(config);
    },
  );

  // 删除远程实例
  ipcMain.handle('remote:instances:remove', (_event, instanceId: string) => {
    try {
      const registry = getRegistry();
      registry.remove(instanceId);
      // 删除后重置 WS 连接，防止删除的实例连接划起
      resetWsConnection();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  // 更新实例配置
  ipcMain.handle(
    'remote:instances:update',
    (_event, instanceId: string, patch: Partial<RemoteInstanceConfig>) => {
      try {
        const registry = getRegistry();
        registry.update(instanceId, patch);
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message || String(err) };
      }
    },
  );

  // 并行刷新所有实例状态
  ipcMain.handle('remote:instances:refreshAll', async () => {
    try {
      const registry = getRegistry();
      const statuses = await registry.refreshAll();
      return { success: true, statuses };
    } catch (err: any) {
      return { success: false, error: err.message || String(err), statuses: [] };
    }
  });
}
