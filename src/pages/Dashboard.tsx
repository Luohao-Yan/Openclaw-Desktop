import { useState, useEffect } from 'react';
import { Play, StopCircle, RotateCcw, RefreshCw, FolderOpen, Cpu, HardDrive, Network, Clock } from 'lucide-react';
import GlassCard from '../components/GlassCard';
import { useI18n } from '../i18n/I18nContext';
// OpenClawRootDiagnostic type should be defined locally
interface OpenClawRootDiagnostic {
  rootDir: string;
  exists: boolean;
  openclawPath: string;
  hasOpenClawJson: boolean;
  hasNodeJson: boolean;
  entries: string[];
  error?: string;
}
import { useNavigate } from 'react-router-dom';

interface GatewayStatus {
  status: 'running' | 'stopped' | 'error' | 'checking';
  error?: string;
  pid?: number;
  uptime?: string;
  version?: string;
  host?: string;
  port?: number;
}

function Dashboard() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [gatewayStatus, setGatewayStatus] = useState<GatewayStatus>({ status: 'checking' });
  const [systemStats, setSystemStats] = useState({
    cpu: 0,
    memory: 0,
    disk: 0,
    network: 0,
    uptime: 0,
  });
  const [systemError, setSystemError] = useState('');
  const [rootDiagnostic, setRootDiagnostic] = useState<OpenClawRootDiagnostic | null>(null);
  const [rootDiagnosticError, setRootDiagnosticError] = useState('');
  const [showRootDiagnosticDetails, setShowRootDiagnosticDetails] = useState(false);
  const [loading, setLoading] = useState(true);

  const shouldShowRootDiagnostic = Boolean(
    rootDiagnosticError
    || (rootDiagnostic && (!rootDiagnostic.exists || !rootDiagnostic.hasOpenClawJson || !rootDiagnostic.hasNodeJson))
  );

  const handleGatewayStart = async () => {
    setLoading(true);
    try {
      const result = await window.electronAPI.gatewayStart();
      if (result.success) {
        await fetchGatewayStatus();
      }
    } catch (error) {
      console.error('Error starting gateway:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleGatewayStop = async () => {
    setLoading(true);
    try {
      const result = await window.electronAPI.gatewayStop();
      if (result.success) {
        await fetchGatewayStatus();
      }
    } catch (error) {
      console.error('Error stopping gateway:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleGatewayRestart = async () => {
    setLoading(true);
    try {
      const result = await window.electronAPI.gatewayRestart();
      if (result.success) {
        await fetchGatewayStatus();
      }
    } catch (error) {
      console.error('Error restarting gateway:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshStats = async () => {
    setLoading(true);
    try {
      await Promise.all([fetchGatewayStatus(), fetchSystemStats(), fetchRootDiagnostic()]);
    } finally {
      setLoading(false);
    }
  };

  const fetchGatewayStatus = async () => {
    try {
      const status = await window.electronAPI.gatewayStatus();
      setGatewayStatus({
        status: status.status,
        error: status.error,
        pid: status.pid,
        uptime: status.uptime,
        version: status.version,
        host: status.host,
        port: status.port,
      });
    } catch (error) {
      console.error('Error fetching gateway status:', error);
      setGatewayStatus({
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const fetchSystemStats = async () => {
    try {
      const stats = await window.electronAPI.systemStats();
      setSystemError('');
      setSystemStats({
        cpu: stats.cpu,
        memory: stats.memory,
        disk: stats.disk,
        network: stats.network,
        uptime: stats.uptime,
      });
    } catch (error) {
      console.error('Error fetching system stats:', error);
      setSystemError(error instanceof Error ? error.message : String(error));
      setSystemStats({
        cpu: 0,
        memory: 0,
        disk: 0,
        network: 0,
        uptime: 0,
      });
    }
  };

  const fetchRootDiagnostic = async () => {
    try {
      const result = await window.electronAPI.diagnoseOpenClawRoot();
      if (result.success && result.diagnostic) {
        setRootDiagnostic(result.diagnostic);
        setRootDiagnosticError('');
        return;
      }
      setRootDiagnostic(null);
      setRootDiagnosticError(result.error || 'Failed to diagnose OpenClaw root');
    } catch (error) {
      console.error('Error diagnosing OpenClaw root:', error);
      setRootDiagnostic(null);
      setRootDiagnosticError(error instanceof Error ? error.message : String(error));
    }
  };

  useEffect(() => {
    const loadInitialData = async () => {
      setLoading(true);
      try {
        await Promise.all([fetchGatewayStatus(), fetchSystemStats(), fetchRootDiagnostic()]);
      } finally {
        setLoading(false);
      }
    };

    loadInitialData();
    const interval = setInterval(fetchSystemStats, 5000);
    return () => clearInterval(interval);
  }, []);

  const getStatusColor = (status: GatewayStatus['status']) => {
    switch (status) {
      case 'running': return 'text-green-500';
      case 'stopped': return 'text-red-500';
      case 'error': return 'text-red-500';
      case 'checking': return 'text-yellow-500';
      default: return 'text-gray-500';
    }
  };

  const getStatusBgColor = (status: GatewayStatus['status']) => {
    switch (status) {
      case 'running': return 'bg-green-500/10';
      case 'stopped': return 'bg-red-500/10';
      case 'error': return 'bg-red-500/10';
      case 'checking': return 'bg-yellow-500/10';
      default: return 'bg-gray-500/10';
    }
  };

  const getStatusText = (status: GatewayStatus['status']) => {
    switch (status) {
      case 'running': return t('running');
      case 'stopped': return t('stopped');
      case 'error': return t('error');
      case 'checking': return t('checking');
      default: return status;
    }
  };

  const formatUptime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const parseElapsedTimeToSeconds = (value?: string) => {
    if (!value) {
      return 0;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return 0;
    }

    const parts = trimmed.split(':');
    let seconds = 0;
    if (parts.length === 3) {
      const dayHourPart = parts[0] || '0';
      if (dayHourPart.includes('-')) {
        const [days, hours] = dayHourPart.split('-').map((item) => Number(item) || 0);
        seconds += days * 86400 + hours * 3600;
      } else {
        seconds += (Number(dayHourPart) || 0) * 3600;
      }
      seconds += (Number(parts[1]) || 0) * 60 + (Number(parts[2]) || 0);
      return seconds;
    }

    if (parts.length === 2) {
      return (Number(parts[0]) || 0) * 60 + (Number(parts[1]) || 0);
    }

    return Number(trimmed) || 0;
  };

  const displayUptimeSeconds = systemStats.uptime > 0
    ? systemStats.uptime
    : parseElapsedTimeToSeconds(gatewayStatus.uptime);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--app-text)' }}>{t('openclawDesktop')}</h1>
          <p className="mt-1" style={{ color: 'var(--app-text-muted)' }}>{t('monitorAndControl')}</p>
        </div>
        <button 
          onClick={handleRefreshStats}
          className="px-4 py-2 rounded-lg transition-colors flex items-center gap-2 cursor-pointer"
          style={{
            backgroundColor: 'var(--app-bg-elevated)',
            border: '1px solid var(--app-border)',
            color: 'var(--app-text)',
          }}
        >
          <RefreshCw size={18} /> {t('refreshStats')}
        </button>
      </div>

      {/* Gateway Status Card */}
      <GlassCard className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl ${getStatusBgColor(gatewayStatus.status)}`}>
              <Play className={`${getStatusColor(gatewayStatus.status)}`} size={24} />
            </div>
            <div>
              <h2 className="text-xl font-semibold" style={{ color: 'var(--app-text)' }}>{t('gatewayStatus')}</h2>
              <div className="flex items-center gap-2 mt-1">
                <div className={`w-2 h-2 rounded-full ${getStatusColor(gatewayStatus.status)}`} />
                <span className={`font-medium ${getStatusColor(gatewayStatus.status)}`}>
                  {getStatusText(gatewayStatus.status)}
                </span>
                {gatewayStatus.version && (
                  <span className="text-sm" style={{ color: 'var(--app-text-muted)' }}>v{gatewayStatus.version}</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={handleGatewayStart}
              disabled={loading || gatewayStatus.status === 'running'}
              className="px-4 py-2 rounded-lg bg-green-600/20 hover:bg-green-600/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2 cursor-pointer"
            >
              <Play size={18} /> {t('start')}
            </button>
            <button 
              onClick={handleGatewayStop}
              disabled={loading || gatewayStatus.status !== 'running'}
              className="px-4 py-2 rounded-lg bg-red-600/20 hover:bg-red-600/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2 cursor-pointer"
            >
              <StopCircle size={18} /> {t('stop')}
            </button>
            <button 
              onClick={handleGatewayRestart}
              disabled={loading}
              className="px-4 py-2 rounded-lg bg-tech-cyan/20 hover:bg-tech-cyan/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2 cursor-pointer"
            >
              <RotateCcw size={18} /> {t('restart')}
            </button>
          </div>
        </div>

        {gatewayStatus.error && (
          <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
            <p className="text-red-400 text-sm">{gatewayStatus.error}</p>
            {(gatewayStatus.host || gatewayStatus.port) && (
              <p className="text-red-300/80 text-xs mt-2">
                target: {gatewayStatus.host || 'unknown'}:{gatewayStatus.port || 'unknown'}
              </p>
            )}
          </div>
        )}

        {systemError && (
          <div className="mt-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
            <p className="text-yellow-300 text-sm">systemStats error: {systemError}</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
          <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--app-bg-subtle)' }}>
            <div className="flex items-center gap-3">
              <Cpu className="text-tech-cyan" size={24} />
              <div>
                <p className="text-sm" style={{ color: 'var(--app-text-muted)' }}>{t('cpuUsage')}</p>
                <p className="text-2xl font-semibold" style={{ color: 'var(--app-text)' }}>{systemStats.cpu}%</p>
              </div>
            </div>
          </div>
          
          <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--app-bg-subtle)' }}>
            <div className="flex items-center gap-3">
              <HardDrive className="text-tech-teal" size={24} />
              <div>
                <p className="text-sm" style={{ color: 'var(--app-text-muted)' }}>{t('memoryUsage')}</p>
                <p className="text-2xl font-semibold" style={{ color: 'var(--app-text)' }}>{systemStats.memory}%</p>
              </div>
            </div>
          </div>
          
          <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--app-bg-subtle)' }}>
            <div className="flex items-center gap-3">
              <Network className="text-tech-green" size={24} />
              <div>
                <p className="text-sm" style={{ color: 'var(--app-text-muted)' }}>{t('networkActivity')}</p>
                <p className="text-2xl font-semibold" style={{ color: 'var(--app-text)' }}>{systemStats.network}%</p>
              </div>
            </div>
          </div>
          
          <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--app-bg-subtle)' }}>
            <div className="flex items-center gap-3">
              <Clock className="text-tech-mint" size={24} />
              <div>
                <p className="text-sm" style={{ color: 'var(--app-text-muted)' }}>{t('uptime')}</p>
                <p className="text-2xl font-semibold" style={{ color: 'var(--app-text)' }}>{formatUptime(displayUptimeSeconds)}</p>
              </div>
            </div>
          </div>
        </div>

        {shouldShowRootDiagnostic && (
          <div className="mt-6 rounded-xl p-4 border" style={{ backgroundColor: 'var(--app-bg-subtle)', borderColor: 'var(--app-border)' }}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold" style={{ color: 'var(--app-text)' }}>
                  OpenClaw 目录需要确认
                </h3>
                <p className="text-sm mt-1" style={{ color: 'var(--app-text-muted)' }}>
                  当前未完整识别 OpenClaw 根目录或关键文件。你可以前往配置页手动设置真实目录。
                </p>
                <p className="text-xs mt-2" style={{ color: 'var(--app-text-muted)' }}>
                  current root: {rootDiagnostic?.rootDir || 'unknown'}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowRootDiagnosticDetails((value) => !value)}
                  className="px-3 py-2 rounded-lg text-sm"
                  style={{ backgroundColor: 'var(--app-bg-elevated)', color: 'var(--app-text)', border: '1px solid var(--app-border)' }}
                >
                  {showRootDiagnosticDetails ? '隐藏详情' : '查看详情'}
                </button>
                <button
                  onClick={() => navigate('/settings?section=config')}
                  className="px-3 py-2 rounded-lg text-sm"
                  style={{ backgroundColor: 'var(--app-active-bg)', color: 'var(--app-active-text)', border: '1px solid var(--app-active-border)' }}
                >
                  前往配置
                </button>
              </div>
            </div>

            {showRootDiagnosticDetails && (
              <div className="space-y-2 text-sm mt-4" style={{ color: 'var(--app-text-muted)' }}>
                {rootDiagnosticError && (
                  <p className="text-sm text-red-400">{rootDiagnosticError}</p>
                )}
                <p>
                  root: <span style={{ color: 'var(--app-text)' }}>{rootDiagnostic?.rootDir || 'unknown'}</span>
                </p>
                <p>
                  exists: <span style={{ color: 'var(--app-text)' }}>{rootDiagnostic ? String(rootDiagnostic.exists) : 'unknown'}</span>
                </p>
                <p>
                  openclaw.json: <span style={{ color: 'var(--app-text)' }}>{rootDiagnostic ? String(rootDiagnostic.hasOpenClawJson) : 'unknown'}</span>
                </p>
                <p>
                  node.json: <span style={{ color: 'var(--app-text)' }}>{rootDiagnostic ? String(rootDiagnostic.hasNodeJson) : 'unknown'}</span>
                </p>
                <p>
                  configured command: <span style={{ color: 'var(--app-text)' }}>{rootDiagnostic?.openclawPath || 'openclaw (PATH)'}</span>
                </p>
                <div>
                  <p className="mb-1">entries:</p>
                  <div className="rounded-lg p-3 max-h-40 overflow-auto" style={{ backgroundColor: 'var(--app-bg-elevated)', color: 'var(--app-text)' }}>
                    {rootDiagnostic?.entries?.length
                      ? rootDiagnostic.entries.join(', ')
                      : 'no entries'}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </GlassCard>

      {/* Quick Actions */}
      <div>
        <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--app-text)' }}>{t('quickActions')}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <button className="p-4 rounded-xl transition-all duration-300 border flex items-center gap-3 cursor-pointer" style={{ background: 'var(--app-active-bg)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}>
            <FolderOpen size={24} />
            <div className="text-left">
              <p className="font-medium">{t('openLogs')}</p>
              <p className="text-sm" style={{ color: 'var(--app-text-muted)' }}>{t('viewRecentActivity')}</p>
            </div>
          </button>
          
          <button className="p-4 rounded-xl transition-all duration-300 border flex items-center gap-3 cursor-pointer" style={{ background: 'var(--app-active-bg)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}>
            <RotateCcw size={24} />
            <div className="text-left">
              <p className="font-medium">{t('restartAgents')}</p>
              <p className="text-sm" style={{ color: 'var(--app-text-muted)' }}>{t('reloadAllRunningAgents')}</p>
            </div>
          </button>
          
          <button className="p-4 rounded-xl transition-all duration-300 border flex items-center gap-3 cursor-pointer" style={{ background: 'var(--app-active-bg)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}>
            <RefreshCw size={24} />
            <div className="text-left">
              <p className="font-medium">{t('cleanCache')}</p>
              <p className="text-sm" style={{ color: 'var(--app-text-muted)' }}>{t('freeUpSystemResources')}</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;