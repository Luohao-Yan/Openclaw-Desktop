import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Server, RefreshCw, Plus, AlertCircle, CheckCircle,
  XCircle, Wifi, WifiOff, Clock, ChevronRight, Trash2,
  MonitorCheck,
} from 'lucide-react';
import GlassCard from '../components/GlassCard';
import GlobalLoading from '../components/GlobalLoading';
import AppBadge from '../components/AppBadge';
import AppButton from '../components/AppButton';
import AddInstanceModal from '../components/instances/AddInstanceModal';
import { useI18n } from '../i18n/I18nContext';
import type { ManagedInstance, InstanceConnectionStatus } from '../types/instanceManager';
import type { RemoteInstanceConfig, InstanceStatus } from '../../types/remote';

// ─── 辅助函数 ─────────────────────────────────────────────────────────────────

/** 将连接状态映射到 AppBadge variant */
function getConnectionVariant(
  status: InstanceConnectionStatus,
): 'success' | 'neutral' | 'warning' | 'danger' {
  switch (status) {
    case 'connected':    return 'success';
    case 'connecting':   return 'warning';
    case 'error':        return 'danger';
    case 'disconnected': return 'neutral';
    default:             return 'neutral';
  }
}

/** 将连接状态映射到图标 */
function getConnectionIcon(status: InstanceConnectionStatus): React.ReactNode {
  switch (status) {
    case 'connected':    return <Wifi size={13} />;
    case 'connecting':   return <Clock size={13} />;
    case 'error':        return <AlertCircle size={13} />;
    case 'disconnected': return <WifiOff size={13} />;
    default:             return <WifiOff size={13} />;
  }
}

/** 构建本地实例的 ManagedInstance 对象 */
function buildLocalInstance(gatewayPort?: number): ManagedInstance {
  return {
    id: 'local',
    source: 'local',
    alias: '本地实例',
    protocol: 'local',
    host: 'localhost',
    port: gatewayPort,
    connectionStatus: 'connected',
    createdAt: new Date().toISOString(),
  };
}

/** 将 RemoteInstanceConfig + InstanceStatus 合并为 ManagedInstance */
function mergeRemoteInstance(
  config: RemoteInstanceConfig,
  status?: InstanceStatus,
): ManagedInstance {
  let connectionStatus: InstanceConnectionStatus = 'disconnected';
  if (status?.status === 'connected') {
    connectionStatus = 'connected';
  } else if (status?.status === 'error') {
    connectionStatus = 'error';
  }

  return {
    id: config.id,
    source: 'remote',
    alias: config.alias,
    protocol: config.protocol,
    host: config.host,
    port: config.port,
    connectionStatus,
    version: status?.version,
    latencyMs: status?.latencyMs,
    createdAt: config.createdAt,
    lastConnectedAt: config.lastConnectedAt,
  };
}

// ─── 实例卡片子组件 ───────────────────────────────────────────────────────────

interface InstanceCardProps {
  instance: ManagedInstance;
  onDelete?: (id: string) => void;
  onNavigate: (id: string) => void;
}

const InstanceCard: React.FC<InstanceCardProps> = ({ instance, onDelete, onNavigate }) => {
  const { t } = useI18n();
  const isLocal = instance.source === 'local';

  return (
    <GlassCard
      className="p-5 hover:shadow-xl transition-token-normal cursor-pointer group"
      onClick={() => onNavigate(instance.id)}
    >
      <div className="flex items-start justify-between gap-3">
        {/* 左侧：图标 + 名称 + badge */}
        <div className="flex items-start gap-3 min-w-0">
          {/* 图标区域 */}
          <div
            className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
            style={{
              background: isLocal
                ? 'linear-gradient(135deg, rgba(20,184,166,0.18) 0%, rgba(6,182,212,0.12) 100%)'
                : 'linear-gradient(135deg, rgba(139,92,246,0.18) 0%, rgba(99,102,241,0.12) 100%)',
              border: `1px solid ${isLocal ? 'rgba(20,184,166,0.25)' : 'rgba(139,92,246,0.25)'}`,
            }}
          >
            {isLocal ? (
              <MonitorCheck size={18} style={{ color: '#2dd4bf' }} />
            ) : (
              <Server size={18} style={{ color: '#a78bfa' }} />
            )}
          </div>

          {/* 名称 + badge 区 */}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-semibold truncate" style={{ color: 'var(--app-text)' }}>
                {instance.alias}
              </h3>
              {/* 来源 badge */}
              <AppBadge
                variant="neutral"
                size="sm"
                style={{
                  backgroundColor: isLocal ? 'rgba(20,184,166,0.1)' : 'rgba(139,92,246,0.1)',
                  borderColor: isLocal ? 'rgba(20,184,166,0.2)' : 'rgba(139,92,246,0.2)',
                  color: isLocal ? '#2dd4bf' : '#a78bfa',
                }}
              >
                {isLocal ? t('instances.local' as any) : t('instances.remote' as any)}
              </AppBadge>
            </div>

            {/* 连接状态 + 地址 */}
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <AppBadge
                variant={getConnectionVariant(instance.connectionStatus)}
                size="sm"
                icon={getConnectionIcon(instance.connectionStatus)}
              >
                {t(`instances.${instance.connectionStatus}` as any)}
              </AppBadge>
              {!isLocal && (
                <span className="text-xs font-mono" style={{ color: 'var(--app-text-muted)' }}>
                  {instance.protocol}://{instance.host}:{instance.port}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 右侧：延迟 + 箭头 */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {instance.latencyMs !== undefined && (
            <span className="text-xs" style={{ color: 'var(--app-text-muted)' }}>
              {instance.latencyMs}ms
            </span>
          )}
          <ChevronRight
            size={16}
            className="opacity-40 group-hover:opacity-80 transition-opacity"
            style={{ color: 'var(--app-text-muted)' }}
          />
        </div>
      </div>

      {/* 底部：版本 + 端口 + 删除按钮（仅远程） */}
      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--app-text-muted)' }}>
          {instance.version && (
            <span>v{instance.version}</span>
          )}
          {instance.port && !isLocal && (
            <span>
              {t('instances.form.port' as any)}: {instance.port}
            </span>
          )}
          {instance.lastConnectedAt && (
            <span>
              {new Date(instance.lastConnectedAt).toLocaleString()}
            </span>
          )}
        </div>

        {/* 删除按钮（仅远程实例） */}
        {!isLocal && onDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(instance.id);
            }}
            className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
            style={{
              backgroundColor: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.18)',
              color: '#f87171',
            }}
            title={t('instances.detail.deleteInstance' as any)}
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </GlassCard>
  );
};

// ─── 主页面组件 ───────────────────────────────────────────────────────────────

const Instances: React.FC = () => {
  const { t } = useI18n();
  const navigate = useNavigate();

  /** 所有托管实例列表（本地 + 远程） */
  const [instances, setInstances] = useState<ManagedInstance[]>([]);
  /** 页面整体加载状态 */
  const [loading, setLoading] = useState(true);
  /** 页面错误信息 */
  const [error, setError] = useState<string | null>(null);
  /** 是否显示添加实例弹窗 */
  const [showAddModal, setShowAddModal] = useState(false);

  /**
   * 加载所有实例数据（两阶段策略）
   *
   * 第一阶段（立即展示，~300ms 内）：
   *   - quickStatus：仅 3s 超时的本地存活检测
   *   - remoteInstancesGetAll：只读缓存，几乎无延迟
   *   → 拿到数据立刻 setLoading(false)，页面即时渲染
   *
   * 第二阶段（后台刷新，不阻塞 UI）：
   *   - remoteInstancesRefreshAll：并行 HTTP 探测远程实例延迟/版本
   *   → 静默更新远程实例状态，用户无感知
   */
  const loadAllInstances = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // ── 第一阶段：并行获取本地实例列表 + 远程实例列表 ──
      // instancesGetAll 优先用 poller 缓存（已就绪则零延迟），未就绪时降级同步执行
      // 设置 3s 超时防止渲染阻塞
      const timeout3s = new Promise<{ success: boolean; instances: any[] }>(
        (resolve) => setTimeout(() => resolve({ success: false, instances: [] }), 3000),
      );
      const [quickLocalResult, remoteResult] = await Promise.all([
        Promise.race([
          window.electronAPI.instancesGetAll().catch(() => ({ success: false, instances: [] })),
          timeout3s,
        ]),
        window.electronAPI.remoteInstancesGetAll().catch(() => ({ success: false, instances: [] })),
      ]);

      // 从 poller 缓存中提取 gateway 实例状态（就绪时就是当前真实状态）
      const localInstances: any[] = (quickLocalResult as any).instances ?? [];
      const gatewayInstance = localInstances.find((i: any) => i.id === 'openclaw-gateway');

      let localConnectionStatus: InstanceConnectionStatus;
      let localPort: number | undefined;

      if (localInstances.length > 0) {
        // poller 缓存就绪：直接用 gateway 实例状态
        localConnectionStatus =
          gatewayInstance?.status === 'running' ? 'connected'
          : gatewayInstance?.status === 'error'  ? 'error'
          : 'disconnected';
        localPort = gatewayInstance?.port;
      } else {
        // poller 缓存未就绪（首次启动 1.5s 内）或超时：先显示 connecting，等 onInstancesUpdated 将推送真实状态
        localConnectionStatus = 'connecting';
        localPort = undefined;
      }

      const localManagedInstance: ManagedInstance = {
        ...buildLocalInstance(localPort),
        connectionStatus: localConnectionStatus,
      };

      // 远程实例列表（此时状态暂为 disconnected，第二阶段刷新）
      const remoteConfigs: RemoteInstanceConfig[] = remoteResult.instances ?? [];
      const remoteManagedInstances = remoteConfigs.map((config) =>
        mergeRemoteInstance(config, undefined),
      );

      // 立刻渲染页面，不再等待远程探测
      setInstances([localManagedInstance, ...remoteManagedInstances]);
      setLoading(false);

      // ── 第二阶段：后台静默刷新远程实例连接状态 ──
      if (remoteConfigs.length > 0) {
        window.electronAPI.remoteInstancesRefreshAll()
          .then((statusResult) => {
            const statuses = statusResult?.statuses ?? [];
            setInstances((prev) =>
              prev.map((inst) => {
                if (inst.source !== 'remote') return inst;
                const s = statuses.find((st) => st.id === inst.id);
                if (!s) return inst;
                return {
                  ...inst,
                  connectionStatus:
                    s.status === 'connected' ? 'connected'
                    : s.status === 'error' ? 'error'
                    : 'disconnected',
                  version: s.version ?? inst.version,
                  latencyMs: s.latencyMs ?? inst.latencyMs,
                };
              }),
            );
          })
          .catch(() => {
            // 后台刷新失败时静默降级，不影响已渲染的列表
          });
      }
    } catch (err: any) {
      setError(err?.message || t('instances.loadFailed'));
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadAllInstances();
  }, [loadAllInstances]);

  // 订阅后台轮询推送：本地实例状态变化时自动更新列表卡片，无需用户手动刷新
  useEffect(() => {
    const api = window.electronAPI as any;
    const unsubscribe = api.onInstancesUpdated(({ instances }: { instances: any[] }) => {
      const gatewayRaw = instances.find((i: any) => i.id === 'openclaw-gateway');
      const connectionStatus: InstanceConnectionStatus =
        gatewayRaw?.status === 'running' ? 'connected'
        : gatewayRaw?.status === 'error'  ? 'error'
        : 'disconnected';
      setInstances((prev) =>
        prev.map((inst) =>
          inst.id === 'local'
            ? { ...inst, connectionStatus, port: gatewayRaw?.port ?? inst.port }
            : inst,
        ),
      );
    });
    return unsubscribe;
  }, []);

  /** 删除远程实例 */
  const handleDeleteRemote = async (instanceId: string) => {
    if (!confirm(t('instances.detail.confirmDelete' as any))) return;
    try {
      await window.electronAPI.remoteInstancesRemove(instanceId);
      await loadAllInstances();
    } catch (err: any) {
      alert(err?.message || t('instances.deleteFailed'));
    }
  };

  /** 添加实例成功回调 */
  const handleAddSuccess = (_newId: string) => {
    setShowAddModal(false);
    loadAllInstances();
  };

  /** 跳转到实例详情页 */
  const handleNavigate = (instanceId: string) => {
    navigate(`/instances/${instanceId}`);
  };

  // 统计数据
  const connectedCount = instances.filter((i) => i.connectionStatus === 'connected').length;
  const disconnectedCount = instances.filter((i) => i.connectionStatus === 'disconnected').length;
  const errorCount = instances.filter((i) => i.connectionStatus === 'error').length;

  // ─── 渲染 ──────────────────────────────────────────────────────────────────

  return (
    <div className="h-full overflow-y-auto page-content" style={{ backgroundColor: 'var(--app-bg)', color: 'var(--app-text)' }}>
      <div className="max-w-7xl mx-auto">

        {/* 顶部渐变标题卡片 */}
        <GlassCard
          variant="gradient"
          className="relative rounded-[28px] px-6 py-5 mb-8"
          style={{
            background: 'linear-gradient(135deg, rgba(20,184,166,0.12) 0%, rgba(6,182,212,0.08) 48%, rgba(255,255,255,0.02) 100%)',
            backdropFilter: 'blur(18px)',
            border: 'none',
          }}
        >
          {/* 装饰性光晕 */}
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full blur-3xl" style={{ backgroundColor: 'rgba(20,184,166,0.18)' }} />
          <div className="pointer-events-none absolute bottom-0 right-20 h-32 w-32 rounded-full blur-3xl" style={{ backgroundColor: 'rgba(6,182,212,0.14)' }} />

          <div className="relative flex items-start justify-between gap-4">
            <div className="max-w-2xl">
              <AppBadge
                variant="neutral"
                icon={<Server size={13} />}
                style={{ backgroundColor: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.08)' }}
              >
                实例管理
              </AppBadge>
              <h1 className="mt-2 text-3xl font-semibold leading-tight" style={{ color: 'var(--app-text)' }}>
                {t('instances.title')}
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-7" style={{ color: 'var(--app-text-muted)' }}>
                管理本地、Docker 及远程云服务器上的所有 OpenClaw 实例，点击实例卡片查看详情与服务进程状态。
              </p>

              {/* 统计 badge 组 */}
              <div className="mt-4 flex flex-wrap gap-2.5">
                {[
                  { label: '总实例', value: instances.length, color: '#2dd4bf', icon: Server },
                  { label: '已连接', value: connectedCount, color: '#34d399', icon: CheckCircle },
                  { label: '未连接', value: disconnectedCount, color: '#94a3b8', icon: XCircle },
                  { label: '异常', value: errorCount, color: '#f87171', icon: AlertCircle },
                ].map((m) => {
                  const Icon = m.icon;
                  return (
                    <AppBadge
                      key={m.label}
                      variant="neutral"
                      icon={<Icon size={13} style={{ color: m.color }} />}
                      style={{ backgroundColor: 'var(--app-bg-elevated)', backdropFilter: 'blur(10px)' }}
                    >
                      <span style={{ color: 'var(--app-text-muted)' }}>{m.label}</span>
                      <span className="font-semibold ml-1" style={{ color: m.color }}>{m.value}</span>
                    </AppBadge>
                  );
                })}
              </div>
            </div>

            {/* 操作按钮 */}
            <div className="flex items-center space-x-3 shrink-0">
              <AppButton
                onClick={loadAllInstances}
                disabled={loading}
                variant="secondary"
                icon={<RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />}
              >
                {loading ? t('common.loading') : t('common.refresh')}
              </AppButton>
              <AppButton
                onClick={() => setShowAddModal(true)}
                variant="primary"
                icon={<Plus className="w-4 h-4" />}
              >
                {t('instances.addInstance' as any)}
              </AppButton>
            </div>
          </div>
        </GlassCard>

        {/* 错误提示 */}
        {error && (
          <div className="mb-6 p-4 border rounded-lg" style={{ backgroundColor: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.22)' }}>
            <div className="flex items-center">
              <AlertCircle className="w-5 h-5 text-red-500 mr-2" />
              <span className="text-red-500">{error}</span>
            </div>
          </div>
        )}

        {/* 实例列表 */}
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <GlobalLoading visible text="加载实例中" overlay={false} size="md" />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {instances.map((instance) => (
              <InstanceCard
                key={instance.id}
                instance={instance}
                onDelete={instance.source === 'remote' ? handleDeleteRemote : undefined}
                onNavigate={handleNavigate}
              />
            ))}
          </div>
        )}

        {/* 页脚说明 */}
        <div className="mt-8 text-center text-sm" style={{ color: 'var(--app-text-muted)' }}>
          <p>{t('instances.footerInfo')}</p>
        </div>
      </div>

      {/* 添加实例弹窗 */}
      <AddInstanceModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={handleAddSuccess}
      />
    </div>
  );
};

export default Instances;