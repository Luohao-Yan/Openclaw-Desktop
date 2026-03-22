import React, { useState, useEffect } from 'react';
import { 
  Server, Cpu, HardDrive, Clock, 
  RefreshCw, Play, StopCircle, Trash2,
  AlertCircle, CheckCircle, XCircle,
  Plus, Settings,
  Activity, Database, Users
} from 'lucide-react';
import GlassCard from '../components/GlassCard';
import GlobalLoading from '../components/GlobalLoading';
import AppBadge from '../components/AppBadge';
import { useI18n } from '../i18n/I18nContext';

interface InstanceInfo {
  id: string;
  name: string;
  type: 'gateway' | 'agent' | 'node' | 'service';
  status: 'running' | 'stopped' | 'starting' | 'error';
  pid?: number;
  memoryUsage?: number;
  cpuUsage?: number;
  uptime?: number;
  port?: number;
  version?: string;
  lastActive?: string;
  configPath?: string;
}

const Instances: React.FC = () => {
  const { t } = useI18n();
  const [instances, setInstances] = useState<InstanceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  const loadInstances = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.electronAPI.instancesGetAll();
      if (result.success && result.instances) {
        setInstances(result.instances);
      } else {
        setError(result.error || t('instances.loadFailed'));
      }
    } catch (error) {
      console.error('Failed to load instances:', error);
      setError(t('instances.connectionFailed'));
    } finally {
      setLoading(false);
    }
  };

  const startInstance = async (instanceId: string) => {
    setActionLoading({ ...actionLoading, [instanceId]: true });
    try {
      const result = await window.electronAPI.instancesStart(instanceId);
      if (result.success) {
        await loadInstances();
      } else {
        alert(result.error || t('instances.startFailed'));
      }
    } catch (error) {
      console.error('Failed to start instance:', error);
      alert(t('instances.startFailed'));
    } finally {
      setActionLoading({ ...actionLoading, [instanceId]: false });
    }
  };

  const stopInstance = async (instanceId: string) => {
    setActionLoading({ ...actionLoading, [instanceId]: true });
    try {
      const result = await window.electronAPI.instancesStop(instanceId);
      if (result.success) {
        await loadInstances();
      } else {
        alert(result.error || t('instances.stopFailed'));
      }
    } catch (error) {
      console.error('Failed to stop instance:', error);
      alert(t('instances.stopFailed'));
    } finally {
      setActionLoading({ ...actionLoading, [instanceId]: false });
    }
  };

  const restartInstance = async (instanceId: string) => {
    setActionLoading({ ...actionLoading, [instanceId]: true });
    try {
      const result = await window.electronAPI.instancesRestart(instanceId);
      if (result.success) {
        await loadInstances();
      } else {
        alert(result.error || t('instances.restartFailed'));
      }
    } catch (error) {
      console.error('Failed to restart instance:', error);
      alert(t('instances.restartFailed'));
    } finally {
      setActionLoading({ ...actionLoading, [instanceId]: false });
    }
  };

  const deleteInstance = async (instanceId: string) => {
    if (!confirm(t('instances.confirmDelete'))) return;
    
    setActionLoading({ ...actionLoading, [instanceId]: true });
    try {
      const result = await window.electronAPI.instancesDelete(instanceId);
      if (result.success) {
        await loadInstances();
      } else {
        alert(result.error || t('instances.deleteFailed'));
      }
    } catch (error) {
      console.error('Failed to delete instance:', error);
      alert(t('instances.deleteFailed'));
    } finally {
      setActionLoading({ ...actionLoading, [instanceId]: false });
    }
  };

  useEffect(() => {
    loadInstances();
  }, []);

  /** 将实例状态映射到 AppBadge variant */
  const getStatusVariant = (status: InstanceInfo['status']): 'success' | 'neutral' | 'warning' | 'danger' => {
    switch (status) {
      case 'running':  return 'success';
      case 'stopped':  return 'neutral';
      case 'starting': return 'warning';
      case 'error':    return 'danger';
      default:         return 'neutral';
    }
  };

  const getStatusIcon = (status: InstanceInfo['status']) => {
    switch (status) {
      case 'running': return <CheckCircle className="w-4 h-4" />;
      case 'stopped': return <XCircle className="w-4 h-4" />;
      case 'starting': return <Clock className="w-4 h-4" />;
      case 'error': return <AlertCircle className="w-4 h-4" />;
      default: return <Activity className="w-4 h-4" />;
    }
  };

  const getTypeIcon = (type: InstanceInfo['type']) => {
    switch (type) {
      case 'gateway': return <Server className="w-5 h-5" />;
      case 'agent': return <Users className="w-5 h-5" />;
      case 'node': return <Database className="w-5 h-5" />;
      case 'service': return <Settings className="w-5 h-5" />;
      default: return <Server className="w-5 h-5" />;
    }
  };

  const InstanceCard = ({ instance }: { instance: InstanceInfo }) => (
    <GlassCard className="p-6 hover:shadow-xl transition-all duration-300">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-lg" style={{ backgroundColor: 'var(--app-bg-subtle)' }}>
            {getTypeIcon(instance.type)}
          </div>
          <div>
            <h3 className="text-lg font-semibold" style={{ color: 'var(--app-text)' }}>{instance.name}</h3>
            <div className="flex items-center space-x-2 mt-1">
              {/* 实例状态 badge */}
              <AppBadge
                variant={getStatusVariant(instance.status)}
                size="sm"
                icon={getStatusIcon(instance.status)}
              >
                {t(`instances.status.${instance.status}`)}
              </AppBadge>
              <AppBadge variant="neutral" size="sm">
                {instance.type.charAt(0).toUpperCase() + instance.type.slice(1)}
              </AppBadge>
              {instance.pid && (
                <AppBadge variant="neutral" size="sm">PID: {instance.pid}</AppBadge>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Instance Metrics */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        {instance.cpuUsage !== undefined && (
          <div className="flex items-center space-x-2">
            <Cpu className="w-4 h-4" style={{ color: 'var(--app-text-muted)' }} />
            <div className="flex-1">
              <div className="text-xs" style={{ color: 'var(--app-text-muted)' }}>CPU</div>
              <div className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>{instance.cpuUsage}%</div>
            </div>
          </div>
        )}
        
        {instance.memoryUsage !== undefined && (
          <div className="flex items-center space-x-2">
            <HardDrive className="w-4 h-4" style={{ color: 'var(--app-text-muted)' }} />
            <div className="flex-1">
              <div className="text-xs" style={{ color: 'var(--app-text-muted)' }}>Memory</div>
              <div className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>{instance.memoryUsage} MB</div>
            </div>
          </div>
        )}
        
        {instance.uptime !== undefined && (
          <div className="flex items-center space-x-2">
            <Clock className="w-4 h-4" style={{ color: 'var(--app-text-muted)' }} />
            <div className="flex-1">
              <div className="text-xs" style={{ color: 'var(--app-text-muted)' }}>Uptime</div>
              <div className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>
                {Math.floor(instance.uptime / 3600)}h {Math.floor((instance.uptime % 3600) / 60)}m
              </div>
            </div>
          </div>
        )}
        
        {instance.port && (
          <div className="flex items-center space-x-2">
            <Server className="w-4 h-4" style={{ color: 'var(--app-text-muted)' }} />
            <div className="flex-1">
              <div className="text-xs" style={{ color: 'var(--app-text-muted)' }}>Port</div>
              <div className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>{instance.port}</div>
            </div>
          </div>
        )}
      </div>

      {/* Instance Info */}
      <div className="text-xs space-y-1 mb-4" style={{ color: 'var(--app-text-muted)' }}>
        {instance.version && (
          <div>Version: {instance.version}</div>
        )}
        {instance.lastActive && (
          <div>Last Active: {new Date(instance.lastActive).toLocaleString()}</div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex space-x-2">
        {instance.status === 'stopped' && (
          <button
            onClick={() => startInstance(instance.id)}
            disabled={actionLoading[instance.id]}
            className="flex-1 inline-flex items-center justify-center px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: 'var(--app-bg-elevated)',
              border: '1px solid var(--app-border)',
              color: 'var(--app-text)',
            }}
          >
            {actionLoading[instance.id] ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Play className="w-4 h-4 mr-2" />
                {t('instances.start')}
              </>
            )}
          </button>
        )}
        
        {instance.status === 'running' && (
          <>
            <button
              onClick={() => stopInstance(instance.id)}
              disabled={actionLoading[instance.id]}
              className="flex-1 inline-flex items-center justify-center px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backgroundColor: 'var(--app-bg-elevated)',
                border: '1px solid var(--app-border)',
                color: 'var(--app-text)',
              }}
            >
              {actionLoading[instance.id] ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <StopCircle className="w-4 h-4 mr-2" />
                  {t('instances.stop')}
                </>
              )}
            </button>
            
            <button
              onClick={() => restartInstance(instance.id)}
              disabled={actionLoading[instance.id]}
              className="flex-1 inline-flex items-center justify-center px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backgroundColor: 'var(--app-bg-elevated)',
                border: '1px solid var(--app-border)',
                color: 'var(--app-text)',
              }}
            >
              {actionLoading[instance.id] ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  {t('instances.restart')}
                </>
              )}
            </button>
          </>
        )}
        
        <button
          onClick={() => deleteInstance(instance.id)}
          disabled={actionLoading[instance.id]}
          className="px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            color: '#EF4444',
          }}
        >
          {actionLoading[instance.id] ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Trash2 className="w-4 h-4" />
          )}
        </button>
      </div>
    </GlassCard>
  );

  return (
    <div className="h-full overflow-y-auto p-6" style={{ backgroundColor: 'var(--app-bg)', color: 'var(--app-text)' }}>
      <div className="max-w-7xl mx-auto">
        {/* 顶部渐变标题卡片 */}
        <GlassCard
          variant="gradient"
          className="relative rounded-[28px] px-6 py-5 mb-8"
          style={{
            background: 'linear-gradient(135deg, rgba(20, 184, 166, 0.12) 0%, rgba(6, 182, 212, 0.08) 48%, rgba(255, 255, 255, 0.02) 100%)',
            backdropFilter: 'blur(18px)',
            border: 'none',
          }}
        >
          {/* 装饰性光晕 */}
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full blur-3xl" style={{ backgroundColor: 'rgba(20, 184, 166, 0.18)' }} />
          <div className="pointer-events-none absolute bottom-0 right-20 h-32 w-32 rounded-full blur-3xl" style={{ backgroundColor: 'rgba(6, 182, 212, 0.14)' }} />

          <div className="relative flex items-start justify-between gap-4">
            <div className="max-w-2xl">
              {/* 页面标题 badge */}
              <AppBadge
                variant="neutral"
                icon={<Server size={13} />}
                style={{ backgroundColor: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.08)' }}
              >
                运行时实例
              </AppBadge>
              <h1 className="mt-2 text-3xl font-semibold leading-tight" style={{ color: 'var(--app-text)' }}>
                {t('instances.title')}
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-7" style={{ color: 'var(--app-text-muted)' }}>
                实例是 OpenClaw 系统中运行的各类服务进程，包括网关、智能体节点、后台服务等。在这里可以查看它们的运行状态、资源占用，并进行启停控制。
              </p>
              {/* 内联统计指标 badge 组 */}
              <div className="mt-4 flex flex-wrap gap-2.5">
                {[
                  { label: '总实例', value: instances.length, color: '#2dd4bf', icon: Server },
                  { label: '运行中', value: instances.filter(i => i.status === 'running').length, color: '#34d399', icon: CheckCircle },
                  { label: '已停止', value: instances.filter(i => i.status === 'stopped').length, color: '#94a3b8', icon: XCircle },
                  { label: '异常', value: instances.filter(i => i.status === 'error').length, color: '#f87171', icon: AlertCircle },
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
              <button
                onClick={loadInstances}
                disabled={loading}
                className="inline-flex items-center px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105 active:scale-95"
                style={{
                  backgroundColor: 'var(--app-bg-elevated)',
                  border: '1px solid var(--app-border)',
                  color: 'var(--app-text)',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
                }}
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                {loading ? t('common.loading') : t('common.refresh')}
              </button>
              <button
                onClick={() => alert('新建实例功能即将推出')}
                className="inline-flex items-center px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 hover:scale-105 active:scale-95"
                style={{
                  background: 'linear-gradient(135deg, #00B4FF 0%, #22C55E 100%)',
                  color: 'white',
                  boxShadow: '0 4px 12px rgba(0, 180, 255, 0.3)',
                }}
              >
                <Plus className="w-4 h-4 mr-2" />
                {t('instances.createNew')}
              </button>
            </div>
          </div>
        </GlassCard>

        {/* 错误提示 */}
        {error && (
          <div className="mb-6 p-4 border rounded-lg" style={{ backgroundColor: 'rgba(239, 68, 68, 0.08)', borderColor: 'rgba(239, 68, 68, 0.22)' }}>
            <div className="flex items-center">
              <AlertCircle className="w-5 h-5 text-red-500 mr-2" />
              <span className="text-red-500">{error}</span>
            </div>
          </div>
        )}

        {/* Instances Grid */}
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <GlobalLoading visible text="加载实例中" overlay={false} size="md" />
          </div>
        ) : instances.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {instances.map((instance) => (
              <InstanceCard key={instance.id} instance={instance} />
            ))}
          </div>
        ) : (
          <GlassCard className="p-12 text-center">
            <Server className="w-16 h-16 mx-auto mb-4" style={{ color: 'var(--app-text-muted)' }} />
            <h3 className="text-xl font-semibold mb-2" style={{ color: 'var(--app-text)' }}>{t('instances.noInstances')}</h3>
            <p className="mb-6" style={{ color: 'var(--app-text-muted)' }}>
              {t('instances.noInstancesDescription')}
            </p>
            <button
              onClick={() => alert('Create new instance feature coming soon')}
              className="inline-flex items-center px-4 py-2 bg-tech-cyan hover:bg-tech-green text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4 mr-2" />
              {t('instances.createFirstInstance')}
            </button>
          </GlassCard>
        )}

        {/* 页脚信息 */}
        <div className="mt-8 text-center text-sm" style={{ color: 'var(--app-text-muted)' }}>
          <p>
            {t('instances.footerInfo')}
          </p>
        </div>
      </div>
    </div>
  );
};

export default Instances;