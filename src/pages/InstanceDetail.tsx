/**
 * InstanceDetail — 实例详情页
 *
 * 路由：/instances/:instanceId
 *
 * 展示内容：
 * 1. 实例概览（别名、连接状态、版本、延迟、地址）
 * 2. 服务进程卡片（LaunchAgent + OpenClaw Gateway），含启停/重启操作
 * 3. 连接配置编辑（远程实例可修改 alias/host/port/token，本地实例只读）
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Server, MonitorCheck, RefreshCw, AlertCircle,
  CheckCircle, XCircle, Clock, StopCircle, Play, Trash2,
  Wifi, WifiOff, Edit3, Save, X, Settings, Loader2,
  Globe, Zap, Info,
} from 'lucide-react';
import GlassCard from '../components/GlassCard';
import AppBadge from '../components/AppBadge';
import AppButton from '../components/AppButton';
import AppInput from '../components/AppInput';
import GlobalLoading from '../components/GlobalLoading';
import { useI18n } from '../i18n/I18nContext';
import type { SubProcessInfo, SubProcessStatus, InstanceConnectionStatus } from '../types/instanceManager';
import type { RemoteInstanceConfig } from '../../types/remote';

// ─── 类型 ─────────────────────────────────────────────────────────────────────

/** 本地原始实例信息（来自 instancesGetAll IPC） */
interface RawLocalInstance {
  id: string;
  name: string;
  type: 'gateway' | 'agent' | 'node' | 'service';
  status: 'running' | 'stopped' | 'starting' | 'error';
  pid?: number;
  port?: number;
  lastActive?: string;
  error?: string;
}

/** 详情页内部使用的实例数据 */
interface InstanceDetailState {
  id: string;
  alias: string;
  source: 'local' | 'remote';
  protocol: 'http' | 'https' | 'local';
  host: string;
  port?: number;
  connectionStatus: InstanceConnectionStatus;
  version?: string;
  latencyMs?: number;
  createdAt: string;
  lastConnectedAt?: string;
  subProcesses: SubProcessInfo[];
  /** 完整远程配置（编辑用，仅远程实例有） */
  remoteConfig?: RemoteInstanceConfig;
}

// ─── 辅助函数 ─────────────────────────────────────────────────────────────────

/** 将本地 RawLocalInstance 转换为 SubProcessInfo */
function rawToSubProcess(raw: RawLocalInstance): SubProcessInfo {
  const typeMap: Record<string, SubProcessInfo['type']> = {
    service: 'launchagent',
    gateway: 'gateway',
  };
  return {
    id: raw.id,
    name: raw.name,
    type: typeMap[raw.type] ?? 'gateway',
    status: raw.status as SubProcessStatus,
    pid: raw.pid,
    port: raw.port,
    lastActive: raw.lastActive,
    error: raw.error,
  };
}

/** 子进程状态 → AppBadge variant */
function getSubProcessVariant(status: SubProcessStatus): 'success' | 'neutral' | 'warning' | 'danger' {
  switch (status) {
    case 'running':  return 'success';
    case 'stopped':  return 'neutral';
    case 'starting': return 'warning';
    case 'error':    return 'danger';
    default:         return 'neutral';
  }
}

/** 子进程状态 → 图标 */
function getSubProcessIcon(status: SubProcessStatus): React.ReactNode {
  switch (status) {
    case 'running':  return <CheckCircle size={13} />;
    case 'stopped':  return <XCircle size={13} />;
    case 'starting': return <Clock size={13} />;
    case 'error':    return <AlertCircle size={13} />;
    default:         return <Clock size={13} />;
  }
}

/** 连接状态 → 图标 */
function getConnectionIcon(status: InstanceConnectionStatus): React.ReactNode {
  switch (status) {
    case 'connected':    return <Wifi size={14} />;
    case 'connecting':   return <Clock size={14} />;
    case 'error':        return <AlertCircle size={14} />;
    case 'disconnected': return <WifiOff size={14} />;
    default:             return <WifiOff size={14} />;
  }
}

/** 连接状态 → Badge variant */
function getConnectionVariant(status: InstanceConnectionStatus): 'success' | 'neutral' | 'warning' | 'danger' {
  switch (status) {
    case 'connected':    return 'success';
    case 'connecting':   return 'warning';
    case 'error':        return 'danger';
    case 'disconnected': return 'neutral';
    default:             return 'neutral';
  }
}

// ─── 子进程卡片 ───────────────────────────────────────────────────────────────

interface SubProcessCardProps {
  process: SubProcessInfo;
  isLocal: boolean;
  onStart?: (id: string) => Promise<void>;
  onStop?: (id: string) => Promise<void>;
  onRestart?: (id: string) => Promise<void>;
}

const SubProcessCard: React.FC<SubProcessCardProps> = ({
  process,
  isLocal,
  onStart,
  onStop,
  onRestart,
}) => {
  const { t } = useI18n();
  const [actionLoading, setActionLoading] = useState<'start' | 'stop' | 'restart' | null>(null);

  const handleAction = async (
    action: 'start' | 'stop' | 'restart',
    fn?: (id: string) => Promise<void>,
  ) => {
    if (!fn) return;
    setActionLoading(action);
    try {
      await fn(process.id);
    } finally {
      setActionLoading(null);
    }
  };

  const isGateway = process.type === 'gateway';

  return (
    <GlassCard className="p-5">
      {/* 标题行 */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          {/* 类型图标 */}
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{
              background: isGateway
                ? 'linear-gradient(135deg, rgba(99,102,241,0.18) 0%, rgba(139,92,246,0.12) 100%)'
                : 'linear-gradient(135deg, rgba(20,184,166,0.18) 0%, rgba(6,182,212,0.12) 100%)',
              border: `1px solid ${isGateway ? 'rgba(99,102,241,0.25)' : 'rgba(20,184,166,0.25)'}`,
            }}
          >
            {isGateway ? (
              <Server size={16} style={{ color: '#818cf8' }} />
            ) : (
              <Settings size={16} style={{ color: '#2dd4bf' }} />
            )}
          </div>

          <div>
            <h4 className="text-sm font-semibold" style={{ color: 'var(--app-text)' }}>
              {process.name}
            </h4>
            <div className="flex items-center gap-2 mt-1">
              <AppBadge
                variant={getSubProcessVariant(process.status)}
                size="sm"
                icon={getSubProcessIcon(process.status)}
              >
                {t(`instances.status.${process.status}` as any)}
              </AppBadge>
              <AppBadge variant="neutral" size="sm">
                {isGateway ? 'Gateway' : 'Service'}
              </AppBadge>
              {process.pid && (
                <AppBadge variant="neutral" size="sm">
                  PID: {process.pid}
                </AppBadge>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 元数据行 */}
      <div className="space-y-1.5 mb-4">
        {process.port && (
          <div className="flex items-center gap-2 text-sm">
            <Globe size={13} style={{ color: 'var(--app-text-muted)' }} />
            <span style={{ color: 'var(--app-text-muted)' }}>端口</span>
            <span className="font-mono font-medium" style={{ color: 'var(--app-text)' }}>
              {process.port}
            </span>
          </div>
        )}
        {process.lastActive && (
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--app-text-muted)' }}>
            <Clock size={12} />
            <span>Last Active: {new Date(process.lastActive).toLocaleString()}</span>
          </div>
        )}
        {process.error && (
          <div className="flex items-start gap-2 text-xs text-red-400">
            <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
            <span>{process.error}</span>
          </div>
        )}
      </div>

      {/* 操作按钮（仅本地实例） */}
      {isLocal && (
        <div className="flex items-center gap-2">
          {process.status === 'stopped' && (
            <button
              onClick={() => handleAction('start', onStart)}
              disabled={!!actionLoading}
              className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backgroundColor: 'var(--app-bg-elevated)',
                border: '1px solid var(--app-border)',
                color: 'var(--app-text)',
              }}
            >
              {actionLoading === 'start' ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Play size={14} />
              )}
              {t('instances.start')}
            </button>
          )}

          {process.status === 'running' && (
            <>
              <button
                onClick={() => handleAction('stop', onStop)}
                disabled={!!actionLoading}
                className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: 'var(--app-bg-elevated)',
                  border: '1px solid var(--app-border)',
                  color: 'var(--app-text)',
                }}
              >
                {actionLoading === 'stop' ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <StopCircle size={14} />
                )}
                {t('instances.stop')}
              </button>

              <button
                onClick={() => handleAction('restart', onRestart)}
                disabled={!!actionLoading}
                className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: 'var(--app-bg-elevated)',
                  border: '1px solid var(--app-border)',
                  color: 'var(--app-text)',
                }}
              >
                {actionLoading === 'restart' ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <RefreshCw size={14} />
                )}
                {t('instances.restart')}
              </button>
            </>
          )}

          {/* 删除/卸载按钮 */}
          <button
            onClick={() => handleAction('stop', onStop)}
            disabled={!!actionLoading}
            className="p-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.18)',
              color: '#f87171',
            }}
            title={t('instances.stop')}
          >
            {actionLoading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Trash2 size={14} />
            )}
          </button>
        </div>
      )}
    </GlassCard>
  );
};

// ─── 连接配置编辑区 ───────────────────────────────────────────────────────────

interface ConnectionConfigSectionProps {
  detail: InstanceDetailState;
  onSave: (patch: Partial<RemoteInstanceConfig>) => Promise<void>;
}

const ConnectionConfigSection: React.FC<ConnectionConfigSectionProps> = ({ detail, onSave }) => {
  const { t } = useI18n();
  const isLocal = detail.source === 'local';

  /** 编辑模式 */
  const [editing, setEditing] = useState(false);
  /** 保存中 */
  const [saving, setSaving] = useState(false);
  /** 编辑草稿 */
  const [draft, setDraft] = useState({
    alias: detail.alias,
    protocol: detail.protocol === 'local' ? 'http' : detail.protocol,
    host: detail.host,
    port: detail.port ?? 18789,
    token: '',
  });

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        alias: draft.alias.trim(),
        protocol: draft.protocol as 'http' | 'https',
        host: draft.host.trim(),
        port: draft.port,
        token: draft.token.trim() || undefined,
      });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setDraft({
      alias: detail.alias,
      protocol: detail.protocol === 'local' ? 'http' : detail.protocol,
      host: detail.host,
      port: detail.port ?? 18789,
      token: '',
    });
    setEditing(false);
  };

  return (
    <GlassCard className="p-5">
      {/* 标题行 */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--app-text)' }}>
          <Settings size={15} style={{ color: 'var(--app-text-muted)' }} />
          {t('instances.detail.connectionConfig' as any)}
        </h3>
        {!isLocal && !editing && (
          <AppButton
            variant="ghost"
            size="xs"
            icon={<Edit3 size={13} />}
            onClick={() => setEditing(true)}
          >
            {t('instances.detail.editConfig' as any)}
          </AppButton>
        )}
        {editing && (
          <div className="flex items-center gap-2">
            <AppButton
              variant="ghost"
              size="xs"
              icon={<X size={13} />}
              onClick={handleCancel}
              disabled={saving}
            >
              {t('instances.detail.cancelEdit' as any)}
            </AppButton>
            <AppButton
              variant="primary"
              size="xs"
              icon={saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              onClick={handleSave}
              disabled={saving}
            >
              {t('instances.detail.saveConfig' as any)}
            </AppButton>
          </div>
        )}
      </div>

      {/* 本地实例：只读提示 */}
      {isLocal && (
        <div
          className="flex items-start gap-2 p-3 rounded-lg text-xs mb-4"
          style={{
            backgroundColor: 'rgba(6,182,212,0.06)',
            border: '1px solid rgba(6,182,212,0.15)',
            color: 'var(--app-text-muted)',
          }}
        >
          <Info size={13} className="flex-shrink-0 mt-0.5" style={{ color: '#22d3ee' }} />
          <span>{t('instances.detail.localInstanceNote' as any)}</span>
        </div>
      )}

      {/* 配置字段 */}
      <div className="space-y-4">
        {/* 别名 */}
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--app-text-muted)' }}>
            {t('instances.form.alias' as any)}
          </label>
          {editing ? (
            <AppInput
              value={draft.alias}
              onChange={(e) => setDraft((p) => ({ ...p, alias: e.target.value }))}
              size="sm"
            />
          ) : (
            <p className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>{detail.alias}</p>
          )}
        </div>

        {/* 地址（非本地实例） */}
        {!isLocal && (
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--app-text-muted)' }}>
              {t('instances.form.host' as any)}
            </label>
            {editing ? (
              <div className="flex gap-2">
                <select
                  value={draft.protocol}
                  onChange={(e) => setDraft((p) => ({ ...p, protocol: e.target.value as 'http' | 'https' }))}
                  className="rounded-lg border text-sm px-2 py-2 outline-none transition-all duration-200 flex-shrink-0"
                  style={{
                    backgroundColor: 'var(--app-bg)',
                    borderColor: 'var(--app-border)',
                    color: 'var(--app-text)',
                    width: '90px',
                  }}
                >
                  <option value="http">http://</option>
                  <option value="https">https://</option>
                </select>
                <AppInput
                  value={draft.host}
                  onChange={(e) => setDraft((p) => ({ ...p, host: e.target.value }))}
                  size="sm"
                  className="flex-1"
                />
                <div style={{ width: '90px' }}>
                  <AppInput
                    type="number"
                    value={draft.port}
                    onChange={(e) => setDraft((p) => ({ ...p, port: parseInt(e.target.value, 10) || 0 }))}
                    size="sm"
                  />
                </div>
              </div>
            ) : (
              <p className="text-sm font-mono" style={{ color: 'var(--app-text)' }}>
                {detail.protocol}://{detail.host}:{detail.port}
              </p>
            )}
          </div>
        )}

        {/* Token（仅编辑模式下展示，不回显旧值） */}
        {editing && !isLocal && (
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--app-text-muted)' }}>
              {t('instances.form.token' as any)}
              <span className="ml-1 opacity-60">（留空则保持不变）</span>
            </label>
            <AppInput
              type="password"
              value={draft.token}
              onChange={(e) => setDraft((p) => ({ ...p, token: e.target.value }))}
              placeholder={t('instances.form.tokenPlaceholder' as any)}
              size="sm"
            />
          </div>
        )}

        {/* 只读：创建时间 */}
        {detail.createdAt && (
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--app-text-muted)' }}>
              创建时间
            </label>
            <p className="text-xs" style={{ color: 'var(--app-text-muted)' }}>
              {new Date(detail.createdAt).toLocaleString()}
            </p>
          </div>
        )}
      </div>
    </GlassCard>
  );
};

// ─── 主页面 ───────────────────────────────────────────────────────────────────

const InstanceDetail: React.FC = () => {
  const { instanceId } = useParams<{ instanceId: string }>();
  const navigate = useNavigate();
  const { t } = useI18n();

  const isLocal = instanceId === 'local';

  /** 实例详情数据 */
  const [detail, setDetail] = useState<InstanceDetailState | null>(null);
  /** 页面框架加载状态（第一阶段，快速完成） */
  const [loading, setLoading] = useState(true);
  /** 子进程区单独加载状态（第二阶段，本地实例用） */
  const [subProcessesLoading, setSubProcessesLoading] = useState(false);
  /** 错误信息 */
  const [error, setError] = useState<string | null>(null);
  /** 子进程操作后刷新标志 */
  const [refreshing, setRefreshing] = useState(false);

  /**
   * 后台异步加载本地子进程详情（第二阶段）
   * 调用 instancesGetAll（最长 8s），完成后更新 detail.subProcesses
   */
  const loadLocalSubProcesses = useCallback(async () => {
    setSubProcessesLoading(true);
    try {
      const result = await window.electronAPI.instancesGetAll();
      const rawInstances: RawLocalInstance[] = result.instances ?? [];
      const subProcesses = rawInstances
        .filter((i) => i.id === 'openclaw-launchagent' || i.id === 'openclaw-gateway')
        .map(rawToSubProcess);
      const gatewayRaw = rawInstances.find((i) => i.id === 'openclaw-gateway');
      // 根据 Gateway 进程的真实状态同步更新顶部连接状态
      const connectionStatus: InstanceConnectionStatus =
        gatewayRaw?.status === 'running' ? 'connected' : 'disconnected';
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              port: gatewayRaw?.port ?? prev.port,
              connectionStatus,
              subProcesses,
            }
          : prev,
      );
    } catch {
      // 子进程加载失败时静默降级，页面框架已显示
    } finally {
      setSubProcessesLoading(false);
    }
  }, []);

  /**
   * 加载实例详情（两阶段策略）
   *
   * 第一阶段（快速，<3s）：
   *   - 本地：quickStatus 获取存活状态，立刻渲染页面框架
   *   - 远程：remoteInstancesGetAll 取配置，立刻渲染
   * 第二阶段（后台，不阻塞 UI）：
   *   - 本地：instancesGetAll 加载完整子进程数据
   *   - 远程：remoteInstancesRefreshAll 刷新连接状态
   */
  const loadDetail = useCallback(async () => {
    if (!instanceId) return;
    setLoading(true);
    setError(null);

    try {
      if (isLocal) {
        // ── 本地实例：第一阶段用 Promise.race + 2s timeout 快速渲染框架 ──
        // 2s 内拿到结果就展示实际端口，超时则直接进入页面
        const timeout2s = new Promise<{ success: boolean; instances: any[] }>(
          (resolve) => setTimeout(() => resolve({ success: false, instances: [] }), 2000),
        );
        const quickResult = await Promise.race([
          window.electronAPI.instancesGetAll().catch(() => ({ success: false, instances: [] })),
          timeout2s,
        ]);
        const gatewayRaw = (quickResult as any).instances?.find(
          (i: any) => i.id === 'openclaw-gateway',
        );

        // 根据 Gateway 真实状态判断连接状态，不硬编码 connected
        const initialConnectionStatus: InstanceConnectionStatus =
          gatewayRaw?.status === 'running' ? 'connected' : 'disconnected';
        const allInstances: any[] = (quickResult as any).instances ?? [];
        const initialSubProcesses = allInstances
          .filter((i: any) => i.id === 'openclaw-launchagent' || i.id === 'openclaw-gateway')
          .map(rawToSubProcess);

        setDetail({
          id: 'local',
          alias: '本地实例',
          source: 'local',
          protocol: 'local',
          host: 'localhost',
          port: gatewayRaw?.port,
          connectionStatus: allInstances.length > 0 ? initialConnectionStatus : 'disconnected',
          createdAt: new Date().toISOString(),
          subProcesses: initialSubProcesses,
        });
        setLoading(false);

        // 无论是否有缓存数据，都启动第二阶段以确保状态准确
        // （缓存可能是旧的，后台会拿最新数据并刷新）
        loadLocalSubProcesses();
      } else {
        // ── 远程实例：第一阶段先渲染配置，不等状态探测 ──
        const remoteResult = await window.electronAPI.remoteInstancesGetAll();
        const config = remoteResult.instances.find((i) => i.id === instanceId);
        if (!config) {
          setError('找不到此实例，可能已被删除。');
          setLoading(false);
          return;
        }

        // 先用 disconnected 渲染页面框架
        setDetail({
          id: config.id,
          alias: config.alias,
          source: 'remote',
          protocol: config.protocol,
          host: config.host,
          port: config.port,
          connectionStatus: 'connecting',
          createdAt: config.createdAt,
          lastConnectedAt: config.lastConnectedAt,
          subProcesses: [],
          remoteConfig: config,
        });
        setLoading(false);

        // 第二阶段：后台探测真实连接状态
        window.electronAPI.remoteInstancesRefreshAll()
          .then((statusResult) => {
            const status = statusResult.statuses?.find((s) => s.id === instanceId);
            const connectionStatus: InstanceConnectionStatus =
              status?.status === 'connected' ? 'connected'
              : status?.status === 'error' ? 'error'
              : 'disconnected';
            const subProcesses: SubProcessInfo[] = [];
            if (status?.status === 'connected') {
              subProcesses.push({
                id: `${instanceId}-gateway`,
                name: 'OpenClaw Gateway',
                type: 'gateway',
                status: 'running',
                port: config.port,
                lastActive: status.lastCheckedAt,
              });
            }
            setDetail((prev) =>
              prev
                ? {
                    ...prev,
                    connectionStatus,
                    version: status?.version ?? prev.version,
                    latencyMs: status?.latencyMs ?? prev.latencyMs,
                    subProcesses,
                  }
                : prev,
            );
          })
          .catch(() => {
            setDetail((prev) =>
              prev ? { ...prev, connectionStatus: 'disconnected' } : prev,
            );
          });
      }
    } catch (err: any) {
      setError(err?.message || t('instances.loadFailed'));
      setLoading(false);
    }
  }, [instanceId, isLocal, t, loadLocalSubProcesses]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  // 订阅后台轮询器推送：本地实例详情页实时接收最新子进程状态
  useEffect(() => {
    if (!isLocal) return;
    const api = window.electronAPI as any;
    const unsubscribe = api.onInstancesUpdated(({ instances }: { instances: any[] }) => {
      const subProcesses = instances
        .filter((i: any) => i.id === 'openclaw-launchagent' || i.id === 'openclaw-gateway')
        .map(rawToSubProcess);
      const gatewayRaw = instances.find((i: any) => i.id === 'openclaw-gateway');
      setDetail((prev) =>
        prev ? { ...prev, port: gatewayRaw?.port ?? prev.port, subProcesses } : prev,
      );
    });
    return unsubscribe;
  }, [isLocal]);

  // ─── 本地子进程操作 ─────────────────────────────────────────────────────────

  const handleStart = async (id: string) => {
    await window.electronAPI.instancesStart(id);
    setRefreshing(true);
    await loadDetail();
    setRefreshing(false);
  };

  const handleStop = async (id: string) => {
    await window.electronAPI.instancesStop(id);
    setRefreshing(true);
    await loadDetail();
    setRefreshing(false);
  };

  const handleRestart = async (id: string) => {
    await window.electronAPI.instancesRestart(id);
    setRefreshing(true);
    await loadDetail();
    setRefreshing(false);
  };

  // ─── 远程实例配置保存 ────────────────────────────────────────────────────────

  const handleSaveConfig = async (patch: Partial<RemoteInstanceConfig>) => {
    if (!instanceId || isLocal) return;
    await window.electronAPI.remoteInstancesUpdate(instanceId, patch);
    await loadDetail();
  };

  // ─── 删除实例 ─────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!instanceId || isLocal) return;
    if (!confirm(t('instances.detail.confirmDelete' as any))) return;
    await window.electronAPI.remoteInstancesRemove(instanceId);
    navigate('/instances');
  };

  // ─── 渲染 ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center" style={{ backgroundColor: 'var(--app-bg)' }}>
        <GlobalLoading visible text="加载实例详情" overlay={false} size="md" />
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="h-full overflow-y-auto page-content" style={{ backgroundColor: 'var(--app-bg)', color: 'var(--app-text)' }}>
        <div className="max-w-4xl mx-auto">
          <AppButton
            variant="secondary"
            size="sm"
            icon={<ArrowLeft size={15} />}
            onClick={() => navigate('/instances')}
            className="mb-6"
          >
            {t('instances.detail.back' as any)}
          </AppButton>
          <GlassCard className="p-8 text-center">
            <AlertCircle className="w-12 h-12 mx-auto mb-3" style={{ color: '#f87171' }} />
            <p style={{ color: 'var(--app-text-muted)' }}>{error || '实例不存在'}</p>
          </GlassCard>
        </div>
      </div>
    );
  }

  const isLocalInstance = detail.source === 'local';

  return (
    <div className="h-full overflow-y-auto page-content" style={{ backgroundColor: 'var(--app-bg)', color: 'var(--app-text)' }}>
      <div className="max-w-4xl mx-auto">

        {/* 顶部导航栏 */}
        <div className="flex items-center justify-between mb-6">
          <AppButton
            variant="secondary"
            size="sm"
            icon={<ArrowLeft size={15} />}
            onClick={() => navigate('/instances')}
          >
            {t('instances.detail.back' as any)}
          </AppButton>

          <div className="flex items-center gap-2">
            <AppButton
              variant="secondary"
              size="sm"
              icon={<RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />}
              onClick={loadDetail}
              disabled={refreshing}
            >
              {t('common.refresh')}
            </AppButton>
            {!isLocalInstance && (
              <AppButton
                variant="danger"
                size="sm"
                icon={<Trash2 size={14} />}
                onClick={handleDelete}
              >
                {t('instances.detail.deleteInstance' as any)}
              </AppButton>
            )}
          </div>
        </div>

        {/* 实例概览卡片 */}
        <GlassCard
          variant="gradient"
          className="relative rounded-[24px] px-6 py-5 mb-6"
          style={{
            background: isLocalInstance
              ? 'linear-gradient(135deg, rgba(20,184,166,0.12) 0%, rgba(6,182,212,0.08) 100%)'
              : 'linear-gradient(135deg, rgba(139,92,246,0.12) 0%, rgba(99,102,241,0.08) 100%)',
            backdropFilter: 'blur(18px)',
            border: 'none',
          }}
        >
          {/* 装饰光晕 */}
          <div
            className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full blur-3xl opacity-30"
            style={{ backgroundColor: isLocalInstance ? '#2dd4bf' : '#a78bfa' }}
          />

          <div className="relative flex items-start gap-4">
            {/* 图标 */}
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{
                background: isLocalInstance
                  ? 'rgba(20,184,166,0.2)'
                  : 'rgba(139,92,246,0.2)',
                border: `1px solid ${isLocalInstance ? 'rgba(20,184,166,0.35)' : 'rgba(139,92,246,0.35)'}`,
              }}
            >
              {isLocalInstance ? (
                <MonitorCheck size={22} style={{ color: '#2dd4bf' }} />
              ) : (
                <Server size={22} style={{ color: '#a78bfa' }} />
              )}
            </div>

            {/* 标题 + 元数据 */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-semibold" style={{ color: 'var(--app-text)' }}>
                  {detail.alias}
                </h1>
                <AppBadge
                  variant="neutral"
                  size="sm"
                  style={{
                    backgroundColor: isLocalInstance ? 'rgba(20,184,166,0.12)' : 'rgba(139,92,246,0.12)',
                    borderColor: isLocalInstance ? 'rgba(20,184,166,0.22)' : 'rgba(139,92,246,0.22)',
                    color: isLocalInstance ? '#2dd4bf' : '#a78bfa',
                  }}
                >
                  {isLocalInstance ? t('instances.local' as any) : t('instances.remote' as any)}
                </AppBadge>
                <AppBadge
                  variant={getConnectionVariant(detail.connectionStatus)}
                  size="sm"
                  icon={getConnectionIcon(detail.connectionStatus)}
                >
                  {t(`instances.${detail.connectionStatus}` as any)}
                </AppBadge>
              </div>

              {/* 元数据行 */}
              <div className="mt-2 flex flex-wrap gap-4 text-sm" style={{ color: 'var(--app-text-muted)' }}>
                {!isLocalInstance && (
                  <span className="flex items-center gap-1.5 font-mono">
                    <Globe size={13} />
                    {detail.protocol}://{detail.host}:{detail.port}
                  </span>
                )}
                {detail.version && (
                  <span className="flex items-center gap-1.5">
                    <Info size={13} />
                    v{detail.version}
                  </span>
                )}
                {detail.latencyMs !== undefined && (
                  <span className="flex items-center gap-1.5">
                    <Zap size={13} />
                    {detail.latencyMs}ms
                  </span>
                )}
              </div>
            </div>
          </div>
        </GlassCard>

        {/* 两栏布局：服务进程 + 连接配置 */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          {/* 左栏：服务进程（占 2/3） */}
          <div className="xl:col-span-2 space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide flex items-center gap-2" style={{ color: 'var(--app-text-muted)' }}>
              <Server size={13} />
              {t('instances.detail.subProcesses' as any)}
            </h2>

            {subProcessesLoading ? (
              /* 子进程数据加载中：显示骨架屏 */
              [0, 1].map((i) => (
                <GlassCard key={i} className="p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-9 h-9 rounded-lg animate-pulse" style={{ backgroundColor: 'var(--app-bg-subtle)' }} />
                    <div className="space-y-2 flex-1">
                      <div className="h-3.5 w-32 rounded animate-pulse" style={{ backgroundColor: 'var(--app-bg-subtle)' }} />
                      <div className="h-2.5 w-20 rounded animate-pulse" style={{ backgroundColor: 'var(--app-bg-subtle)' }} />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <div className="h-8 flex-1 rounded-lg animate-pulse" style={{ backgroundColor: 'var(--app-bg-subtle)' }} />
                    <div className="h-8 flex-1 rounded-lg animate-pulse" style={{ backgroundColor: 'var(--app-bg-subtle)' }} />
                  </div>
                </GlassCard>
              ))
            ) : detail.subProcesses.length > 0 ? (
              detail.subProcesses.map((proc) => (
                <SubProcessCard
                  key={proc.id}
                  process={proc}
                  isLocal={isLocalInstance}
                  onStart={isLocalInstance ? handleStart : undefined}
                  onStop={isLocalInstance ? handleStop : undefined}
                  onRestart={isLocalInstance ? handleRestart : undefined}
                />
              ))
            ) : (
              <GlassCard className="p-8 text-center">
                <Server className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--app-text-muted)' }} />
                <p className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
                  {detail.connectionStatus === 'disconnected'
                    ? '实例未连接，无法获取服务进程状态。'
                    : detail.connectionStatus === 'connecting'
                      ? '正在探测连接状态…'
                      : '暂无服务进程数据。'}
                </p>
              </GlassCard>
            )}
          </div>

          {/* 右栏：连接配置（占 1/3） */}
          <div className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide flex items-center gap-2" style={{ color: 'var(--app-text-muted)' }}>
              <Settings size={13} />
              {t('instances.detail.connectionConfig' as any)}
            </h2>
            <ConnectionConfigSection
              detail={detail}
              onSave={handleSaveConfig}
            />
          </div>
        </div>

      </div>
    </div>
  );
};

export default InstanceDetail;
