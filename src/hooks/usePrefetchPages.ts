/**
 * usePrefetchPages.ts
 *
 * 页面数据预加载 Hook —— 在 MainAppLayout 挂载时后台预热所有页面的 IPC 缓存，
 * 使用户点击侧边栏任意页面时数据已就绪，无需等待 loading。
 */

import { useEffect, useRef } from 'react';
import { prefillCache, clearCache } from './useIpcCache';

/** 安全调用 IPC 并写入缓存，失败时静默忽略 */
async function safePrefetch<T>(key: string, fetcher: () => Promise<T>): Promise<void> {
  try {
    const data = await fetcher();
    prefillCache(key, data);
  } catch {
    // 预加载失败不影响用户体验
  }
}

/** 空闲回调调度器（降级到 setTimeout） */
const scheduleIdle = (fn: () => void, delay = 0) => {
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(() => fn(), { timeout: 3000 });
  } else {
    setTimeout(fn, delay);
  }
};

/**
 * 预加载所有页面数据到 useIpcCache 全局缓存
 * 在 MainAppLayout 挂载后自动执行，仅执行一次
 */
export function usePrefetchPages(): void {
  const prefetchedRef = useRef(false);

  useEffect(() => {
    if (prefetchedRef.current) return;
    prefetchedRef.current = true;

    const api = window.electronAPI as any;

    // 第一批（高优先级）：仪表板数据
    scheduleIdle(() => {
      void safePrefetch('dashboard:gateway-status', async () => {
        const s = await api.gatewayStatus();
        return { status: s.status, error: s.error, pid: s.pid, uptime: s.uptime, version: s.version, host: s.host, port: s.port };
      });
    }, 0);

    // 第二批（中优先级）：智能体 — 延迟 500ms
    scheduleIdle(() => {
      void safePrefetch('agents:page-data', async () => {
        const [agentsR, configR, statsR, bindingsR, groupsR, mappingsR] = await Promise.allSettled([
          api.agentsGetAll(), api.configGet(), api.sessionsAgentDetailedStats(),
          api.skillsGetAllBindings(), api.agentGroupsList(), api.agentGroupsGetMappings(),
        ]);
        const agents = agentsR.status === 'fulfilled' && agentsR.value.success ? (agentsR.value.agents ?? []) : [];
        const config = configR.status === 'fulfilled' && configR.value.success ? configR.value.config : null;
        const stats = statsR.status === 'fulfilled' && statsR.value.success ? (statsR.value.stats ?? {}) : {};
        const bindings = bindingsR.status === 'fulfilled' && bindingsR.value.success ? (bindingsR.value.bindings ?? {}) : {};
        const groups = groupsR.status === 'fulfilled' && groupsR.value.success ? (groupsR.value.groups ?? []) : [];
        const mappings = mappingsR.status === 'fulfilled' && mappingsR.value.success ? (mappingsR.value.mappings ?? {}) : {};
        const counts: Record<string, number> = {};
        if (typeof bindings === 'object' && bindings !== null) {
          for (const [, agentIds] of Object.entries(bindings)) {
            if (Array.isArray(agentIds)) { for (const aid of agentIds) { counts[aid] = (counts[aid] || 0) + 1; } }
          }
        }
        return {
          agents, globalBindings: Array.isArray(config?.bindings) ? config.bindings : [],
          globalChannels: config?.channels || {}, agentStats: stats,
          agentBindingCounts: counts, groups, groupMappings: mappings,
        };
      });
    }, 500);

    // 第三批（低优先级）：技能、任务、实例、日志 — 延迟 1500ms
    scheduleIdle(() => {
      void Promise.allSettled([
        safePrefetch('skills:list', async () => {
          const r = await api.skillsGetAll();
          return (r.success && 'skills' in r) ? (r.skills ?? []) : [];
        }),
        safePrefetch('tasks:jobs', async () => {
          const r = await api.cronList(true);
          return r.success ? (r.jobs || []) : [];
        }),
        safePrefetch('tasks:overview', async () => {
          const r = await api.coreConfigGetOverview();
          return (r.success && r.overview) ? r.overview : null;
        }),
        safePrefetch('tasks:agents', async () => {
          const r = await api.agentsGetAll();
          if (!r?.success || !Array.isArray(r.agents)) return [];
          return r.agents.map((item: any) => ({ id: String(item.id || item.name || ''), name: String(item.name || item.id || '') }));
        }),
        safePrefetch('instances:list', async () => {
          const r = await api.instancesGetAll();
          return (r.success && r.instances) ? r.instances : [];
        }),
        safePrefetch('logs:list:100', async () => {
          const r = await api.logsGet(100);
          return (r.success && Array.isArray(r.logs)) ? r.logs : [];
        }),
      ]);
    }, 1500);
  }, []);

  // 配置文件变更监听：外部修改 openclaw.json 时清空缓存
  useEffect(() => {
    const unsub = window.electronAPI?.onConfigChanged?.(() => {
      clearCache();
      prefetchedRef.current = false;
    });
    return () => { unsub?.(); };
  }, []);
}

export default usePrefetchPages;
