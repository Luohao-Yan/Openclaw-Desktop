import { useState, useEffect, useCallback } from 'react';
import {
  Play,
  StopCircle,
  RefreshCw,
  FolderOpen,
  Cpu,
  HardDrive,
  Clock,
  Sparkles,
  ShieldCheck,
  Settings2,
  Wrench,
  ExternalLink,
} from 'lucide-react';

import GlassCard from '../components/GlassCard';
import RuntimeUpdateNotice from '../components/RuntimeUpdateNotice';
import { useDesktopRuntime } from '../contexts/DesktopRuntimeContext';
import { useI18n } from '../i18n/I18nContext';
import { createGatewayRepairLoadingState, runGatewayRepair } from '../services/gatewayRepair';
import AppButton from '../components/AppButton';
import AppBadge from '../components/AppBadge';
import { useIpcCache } from '../hooks/useIpcCache';
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
  const {
    repairCapabilityAvailable,
    runtimeInfo,
  } = useDesktopRuntime();
  // ── 使用 useIpcCache 预加载并缓存网关状态（需求 3.6）──
  const {
    data: cachedGatewayStatus,
    loading: gatewayLoading,
    error: gatewayError,
    refresh: refreshGatewayStatus,
  } = useIpcCache<GatewayStatus>(
    'dashboard:gateway-status',
    async () => {
      const status = await window.electronAPI.gatewayStatus();
      return {
        status: status.status,
        error: status.error,
        pid: status.pid,
        uptime: status.uptime,
        version: status.version,
        host: status.host,
        port: status.port,
      };
    },
    { ttl: 15000, staleWhileRevalidate: true },
  );

  // ── 使用 useIpcCache 预加载并缓存系统信息（需求 3.6）──
  const {
    data: cachedSystemStats,
    error: systemStatsError,
    refresh: refreshSystemStats,
  } = useIpcCache<{ cpu: number; memory: number; disk: number; network: number; uptime: number }>(
    'dashboard:system-stats',
    async () => {
      const stats = await window.electronAPI.systemStats();
      return {
        cpu: stats.cpu,
        memory: stats.memory,
        disk: stats.disk,
        network: stats.network,
        uptime: stats.uptime,
      };
    },
    { ttl: 5000, staleWhileRevalidate: true },
  );

  // 从缓存数据派生当前状态，未加载时使用默认值
  const gatewayStatus: GatewayStatus = gatewayError
    ? { status: 'error', error: gatewayError.message }
    : (cachedGatewayStatus ?? { status: 'checking' });
  const systemStats = cachedSystemStats ?? { cpu: 0, memory: 0, disk: 0, network: 0, uptime: 0 };
  // 系统信息错误文本
  const systemError = systemStatsError?.message ?? '';
  const [rootDiagnostic, setRootDiagnostic] = useState<OpenClawRootDiagnostic | null>(null);
  const [rootDiagnosticError, setRootDiagnosticError] = useState('');
  const [showRootDiagnosticDetails, setShowRootDiagnosticDetails] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  // 综合加载状态：操作中或缓存首次加载中
  const loading = actionLoading || gatewayLoading;
  const [isRepairingGateway, setIsRepairingGateway] = useState(false);
  const [gatewayRepairSteps, setGatewayRepairSteps] = useState<string[]>([]);
  const [showGatewayErrorDetails, setShowGatewayErrorDetails] = useState(false);
  const [gatewayRepairMessage, setGatewayRepairMessage] = useState('');
  const [gatewayRepairTone, setGatewayRepairTone] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [dashboardMessage, setDashboardMessage] = useState('');
  const [dashboardMessageTone, setDashboardMessageTone] = useState<'idle' | 'success' | 'error' | 'info'>('idle');

  // 仅在确认存在问题时才显示诊断卡片：
  // 1. 诊断调用本身失败（rootDiagnosticError 有值）
  // 2. 根目录不存在或缺少 openclaw.json
  // 注意：node.json 缺失不视为问题（homebrew 安装不生成此文件）
  // 注意：rootDiagnostic 为 null 时（加载中）不显示，避免闪烁
  const shouldShowRootDiagnostic = Boolean(
    rootDiagnosticError
    || (rootDiagnostic && (!rootDiagnostic.exists || !rootDiagnostic.hasOpenClawJson))
  );

  const setActionMessage = (
    tone: 'idle' | 'success' | 'error' | 'info',
    message: string,
  ) => {
    setDashboardMessageTone(tone);
    setDashboardMessage(message);
    
    // 成功消息 3 秒后自动消失
    if (tone === 'success') {
      setTimeout(() => {
        setDashboardMessageTone('idle');
        setDashboardMessage('');
      }, 3000);
    }
  };

  const handleGatewayStart = async () => {
    setActionLoading(true);
    try {
      const result = await window.electronAPI.gatewayStart();
      // 无论成功失败都刷新状态
      await fetchGatewayStatus();
      if (!result.success) {
        setActionMessage('error', '启动服务时遇到问题，请稍后重试。');
      }
    } catch (error) {
      console.error('Error starting gateway:', error);
      setActionMessage('error', '启动服务时遇到问题，请稍后重试。');
    } finally {
      setActionLoading(false);
    }
  };

  const handleGatewayRepairCompatibility = async () => {
    setIsRepairingGateway(true);
    try {
      const loadingState = createGatewayRepairLoadingState();
      setGatewayRepairTone(loadingState.tone);
      setGatewayRepairMessage(loadingState.message);
      setGatewayRepairSteps(loadingState.steps);
      setShowGatewayErrorDetails(loadingState.shouldShowDetails);

      const result = await runGatewayRepair({
        issueHint: gatewayStatus.error,
        repairCapabilityAvailable,
        runtimeInfo,
      });

      setGatewayRepairTone(result.tone);
      setGatewayRepairMessage(result.message);
      setGatewayRepairSteps(result.steps);
      setShowGatewayErrorDetails(result.shouldShowDetails);
      await Promise.all([fetchGatewayStatus(), fetchSystemStats(), fetchRootDiagnostic()]);
    } catch (error) {
      console.error('Error repairing gateway compatibility:', error);
      setGatewayRepairTone('error');
      setGatewayRepairMessage('修复没有完成，请查看详情后重试。');
      setShowGatewayErrorDetails(true);
      setGatewayRepairSteps([
        error instanceof Error ? error.message : String(error),
      ]);
    } finally {
      setIsRepairingGateway(false);
    }
  };

  const handleGatewayStop = async () => {
    setActionLoading(true);
    try {
      const result = await window.electronAPI.gatewayStop();
      // 无论成功失败都刷新状态，让 UI 反映真实情况
      await fetchGatewayStatus();
      if (!result.success) {
        setActionMessage('error', '停止服务时遇到问题，请稍后重试。');
      }
    } catch (error) {
      console.error('Error stopping gateway:', error);
      setActionMessage('error', '停止服务时遇到问题，请稍后重试。');
    } finally {
      setActionLoading(false);
    }
  };

  const handleGatewayRestart = async (): Promise<boolean> => {
    setActionLoading(true);
    try {
      const result = await window.electronAPI.gatewayRestart();
      // 无论成功失败都刷新状态
      await fetchGatewayStatus();
      return result.success;
    } catch (error) {
      console.error('Error restarting gateway:', error);
      await fetchGatewayStatus();
      return false;
    } finally {
      setActionLoading(false);
    }
  };

  const handleRefreshStats = async () => {
    setActionLoading(true);
    try {
      await Promise.all([fetchGatewayStatus(), fetchSystemStats(), fetchRootDiagnostic()]);
      setActionMessage('success', '首页状态已经刷新完成。');
    } finally {
      setActionLoading(false);
    }
  };

  const handlePrimaryAssistAction = async () => {
    if (gatewayStatus.status === 'error') {
      setActionMessage('info', '正在执行一键修复，请稍候。');
      await handleGatewayRepairCompatibility();
      return;
    }

    if (gatewayStatus.status === 'stopped') {
      setActionMessage('info', '正在启动 OpenClaw 服务。');
      await handleGatewayStart();
      await Promise.all([fetchSystemStats(), fetchRootDiagnostic()]);
      // handleGatewayStart 内部已刷新 gatewayStatus，这里不再重复设置消息
      return;
    }

    // running 状态 → 重启
    setActionMessage('info', '正在重启 OpenClaw 服务，请稍候。');
    const restartOk = await handleGatewayRestart();
    await Promise.all([fetchSystemStats(), fetchRootDiagnostic()]);
    if (restartOk) {
      setActionMessage('success', 'OpenClaw 服务已重启成功。');
    } else {
      setActionMessage('error', '重启未能完成，请稍后重试或查看日志。');
    }
  };

  // ── 刷新函数：委托给 useIpcCache 的 refresh，利用缓存去重 ──
  const fetchGatewayStatus = useCallback(async () => {
    await refreshGatewayStatus();
  }, [refreshGatewayStatus]);

  const fetchSystemStats = useCallback(async () => {
    await refreshSystemStats();
  }, [refreshSystemStats]);

  const fetchRootDiagnostic = async () => {
    try {
      const result = await window.electronAPI.diagnoseOpenClawRoot();
      if (result.success && result.diagnostic) {
        setRootDiagnostic(result.diagnostic);
        setRootDiagnosticError('');
        return;
      }
      // 即使 success 为 false，如果 diagnostic 数据表明目录正常，也不显示错误
      if (result.diagnostic && result.diagnostic.exists && result.diagnostic.hasOpenClawJson) {
        setRootDiagnostic(result.diagnostic);
        setRootDiagnosticError('');
        return;
      }
      setRootDiagnostic(result.diagnostic || null);
      setRootDiagnosticError(result.error || '');
    } catch (error) {
      console.error('Error diagnosing OpenClaw root:', error);
      setRootDiagnostic(null);
      setRootDiagnosticError(error instanceof Error ? error.message : String(error));
    }
  };

  // 初始加载根目录诊断（网关状态和系统信息已由 useIpcCache 自动预加载）
  useEffect(() => {
    fetchRootDiagnostic();
  }, []);

  // 系统信息定时轮询：每 5 秒通过缓存 Hook 刷新
  useEffect(() => {
    const interval = setInterval(() => {
      void refreshSystemStats();
    }, 5000);
    return () => clearInterval(interval);
  }, [refreshSystemStats]);

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

  const getGatewayUserMessage = (error?: string) => {
    const text = (error || '').toLowerCase();

    if (!text) {
      return 'OpenClaw 当前暂时无法连接，你可以尝试一键修复。';
    }

    if (text.includes('bindings') || text.includes('schema') || text.includes('config invalid') || text.includes('invalid config')) {
      return 'OpenClaw 升级后，当前配置需要自动修复。点击“一键修复”即可继续使用。';
    }

    if (text.includes('connect.challenge') || text.includes('device identity required')) {
      return 'OpenClaw 升级后需要新的设备认证流程。点击“一键修复”自动检查并恢复连接。';
    }

    if (text.includes('pairing required')) {
      return '当前设备需要重新确认连接授权。点击“一键修复”继续处理。';
    }

    if (text.includes('unauthorized') || text.includes('auth')) {
      return '当前连接凭据需要更新。点击“一键修复”自动检查配置。';
    }

    return 'OpenClaw 当前无法正常连接。建议先点击“一键修复”。';
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

  const gatewayHeadline = gatewayStatus.status === 'running'
    ? 'OpenClaw 已连接，可以直接开始使用。'
    : gatewayStatus.status === 'checking'
      ? '正在确认 OpenClaw 当前状态。'
      : gatewayStatus.status === 'stopped'
        ? 'OpenClaw 当前未启动，点击下方即可恢复。'
        : getGatewayUserMessage(gatewayStatus.error);

  const primaryActionLabel = gatewayStatus.status === 'error'
    ? '一键修复连接'
    : gatewayStatus.status === 'stopped'
      ? '启动 OpenClaw'
      : '重启 OpenClaw';

  const gatewayStatusDetail = gatewayStatus.status === 'running'
    ? '服务正常'
    : gatewayStatus.status === 'checking'
      ? '状态检测中'
      : gatewayStatus.status === 'stopped'
        ? '等待启动'
        : '需要处理';

  const healthCards = [
    {
      icon: ShieldCheck,
      label: '服务状态',
      value: getStatusText(gatewayStatus.status),
      accent: gatewayStatus.status === 'running'
        ? '#34d399'
        : gatewayStatus.status === 'checking'
          ? '#fbbf24'
          : '#f87171',
    },
    {
      icon: Cpu,
      label: t('cpuUsage'),
      value: `${systemStats.cpu}%`,
      accent: '#60a5fa',
    },
    {
      icon: HardDrive,
      label: t('memoryUsage'),
      value: `${systemStats.memory}%`,
      accent: '#2dd4bf',
    },
    {
      icon: Clock,
      label: t('uptime'),
      value: formatUptime(displayUptimeSeconds),
      accent: '#a78bfa',
    },
  ];

  const quickActions = [
    {
      key: 'logs',
      title: '查看运行日志',
      description: '打开日志页，快速查看最近运行记录与错误。',
      icon: FolderOpen,
      accent: '#60a5fa',   // 蓝色
      onClick: () => navigate('/logs'),
    },
    {
      key: 'agents',
      title: '配置 Agent',
      description: '进入 Agent 管理页，查看、编辑或新建 Agent 配置。',
      icon: Settings2,
      accent: '#a78bfa',   // 紫色
      onClick: () => navigate('/agents'),
    },
    {
      key: 'channels',
      title: '配置模型渠道',
      description: '前往渠道设置，管理 AI 模型接入与 API 配置。',
      icon: Cpu,
      accent: '#2dd4bf',   // 青色
      onClick: () => navigate('/settings?section=channels'),
    },
  ];

  return (
    /* 页面内容区域：使用 page-content 统一内边距 --space-6 */
    <div className="page-content space-y-6">
      <GlassCard className="p-6">
        <div className="flex items-start justify-between gap-4">
          {/* 页面标签 badge */}
          <AppBadge variant="neutral" icon={<Sparkles size={13} />}>
            今日控制台
          </AppBadge>
          <AppButton
            variant="secondary"
            onClick={() => void handleRefreshStats()}
            loading={loading}
            icon={<RefreshCw size={16} />}
          >
            刷新首页状态
          </AppButton>
        </div>

        <div className="mt-2 flex flex-col gap-6">
          <div className="max-w-3xl">
            <h1 className="text-3xl font-semibold tracking-tight" style={{ color: 'var(--app-text)' }}>
              {t('openclawDesktop')}
            </h1>
            <p className="max-w-2xl text-sm leading-7" style={{ color: 'var(--app-text-muted)' }}>
              {gatewayHeadline}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              {/* Gateway 状态 badge：使用 AppBadge dot 模式 */}
              <AppBadge
                variant={
                  gatewayStatus.status === 'running' ? 'success'
                  : gatewayStatus.status === 'checking' ? 'warning'
                  : 'danger'
                }
                dot
              >
                {getStatusText(gatewayStatus.status)}
                <span style={{ color: 'var(--app-text-muted)', marginLeft: 4 }}>· {gatewayStatusDetail}</span>
              </AppBadge>
              {gatewayStatus.version ? (
                <AppBadge variant="neutral">{`版本 ${gatewayStatus.version}`}</AppBadge>
              ) : null}
              {(gatewayStatus.host || gatewayStatus.port) ? (
                <AppBadge variant="neutral">
                  {gatewayStatus.host || 'localhost'}:{gatewayStatus.port || 'unknown'}
                </AppBadge>
              ) : null}
            </div>
            {/* 服务控制 */}
            <div className="mt-5 flex flex-wrap gap-3">
              <AppButton
                variant="success"
                onClick={() => void handleGatewayStart()}
                disabled={loading || gatewayStatus.status === 'running'}
                icon={<Play size={16} />}
              >
                {t('start')}
              </AppButton>
              <AppButton
                variant="danger"
                onClick={() => void handleGatewayStop()}
                disabled={loading || gatewayStatus.status !== 'running'}
                icon={<StopCircle size={16} />}
              >
                {t('stop')}
              </AppButton>
              <AppButton
                variant={gatewayStatus.status === 'error' ? 'danger' : 'primary'}
                onClick={() => void handlePrimaryAssistAction()}
                disabled={loading || isRepairingGateway}
                icon={gatewayStatus.status === 'error' ? <Wrench size={16} /> : <RefreshCw size={16} />}
              >
                {primaryActionLabel}
              </AppButton>
            </div>
            {/* 导航跳转 */}
            <div className="mt-3 flex flex-wrap gap-3">
              <AppButton
                variant="secondary"
                onClick={() => navigate('/sessions')}
                icon={<FolderOpen size={16} />}
              >
                进入会话中心
              </AppButton>
              <AppButton
                variant="secondary"
                onClick={() => navigate('/settings?section=general')}
                icon={<Settings2 size={16} />}
              >
                查看高级设置
              </AppButton>
              <AppButton
                variant="secondary"
                onClick={() => {
                  // 构建 gateway web 控制页面 URL 并在浏览器中打开
                  const host = gatewayStatus.host || '127.0.0.1';
                  const port = gatewayStatus.port || 18789;
                  const url = `http://${host}:${port}`;
                  window.electronAPI.openExternal(url);
                }}
                disabled={gatewayStatus.status !== 'running'}
                icon={<ExternalLink size={16} />}
              >
                打开 Web 控制页面
              </AppButton>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-3">
            {healthCards.map((item) => {
              const Icon = item.icon;
              return (
                /* 玻璃液态统计卡片：半透明渐变背景 + backdrop-blur + 装饰光晕 */
                <div
                  key={item.label}
                  className="relative overflow-hidden rounded-2xl p-4 backdrop-blur-xl"
                  style={{
                    background: `linear-gradient(135deg, ${item.accent}14 0%, ${item.accent}08 100%)`,
                    border: `1px solid ${item.accent}22`,
                  }}
                >
                  {/* 右上角装饰光晕 */}
                  <div
                    className="pointer-events-none absolute -right-4 -top-4 h-16 w-16 rounded-full blur-2xl"
                    style={{ backgroundColor: `${item.accent}30` }}
                  />
                  <div className="relative z-10 flex items-center gap-3">
                    <div
                      className="flex h-11 w-11 items-center justify-center rounded-2xl"
                      style={{
                        background: `linear-gradient(135deg, ${item.accent}28 0%, ${item.accent}14 100%)`,
                        color: item.accent,
                      }}
                    >
                      <Icon size={20} />
                    </div>
                    <div>
                      <div className="text-sm" style={{ color: 'var(--app-text-muted)' }}>{item.label}</div>
                      <div className="mt-1 text-lg font-semibold" style={{ color: 'var(--app-text)' }}>{item.value}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {gatewayStatus.error && (
          <div className="mt-6 rounded-2xl border p-4" style={{ backgroundColor: 'rgba(239, 68, 68, 0.08)', borderColor: 'rgba(239, 68, 68, 0.18)' }}>
            <p className="text-sm font-medium" style={{ color: '#fca5a5' }}>{getGatewayUserMessage(gatewayStatus.error)}</p>

            {!repairCapabilityAvailable && runtimeInfo && (
              <RuntimeUpdateNotice
                className="mt-3"
                message={`当前是 ${runtimeInfo.appVersionLabel}，但修复能力还未完成加载。请重启桌面应用完成更新。`}
                runtimeInfo={runtimeInfo}
              />
            )}

            {gatewayRepairTone !== 'idle' && gatewayRepairMessage && (
              <div
                className="mt-3 rounded-lg px-3 py-2 text-sm"
                style={{
                  backgroundColor: gatewayRepairTone === 'success'
                    ? 'rgba(16, 185, 129, 0.14)'
                    : gatewayRepairTone === 'error'
                      ? 'rgba(239, 68, 68, 0.14)'
                      : 'rgba(59, 130, 246, 0.14)',
                  border: `1px solid ${gatewayRepairTone === 'success'
                    ? 'rgba(16, 185, 129, 0.24)'
                    : gatewayRepairTone === 'error'
                      ? 'rgba(239, 68, 68, 0.24)'
                      : 'rgba(59, 130, 246, 0.24)'}`,
                  color: gatewayRepairTone === 'success'
                    ? '#A7F3D0'
                    : gatewayRepairTone === 'error'
                      ? '#FCA5A5'
                      : '#BFDBFE',
                }}
              >
                {gatewayRepairMessage}
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <AppButton
                variant="danger"
                onClick={() => void handleGatewayRepairCompatibility()}
                loading={isRepairingGateway}
                disabled={isRepairingGateway || !repairCapabilityAvailable}
                icon={<RefreshCw size={16} />}
              >
                {repairCapabilityAvailable ? '立即修复' : '重启后可用'}
              </AppButton>
              <AppButton
                variant="secondary"
                onClick={() => setShowGatewayErrorDetails((value) => !value)}
              >
                {showGatewayErrorDetails ? '隐藏详情' : '查看详情'}
              </AppButton>
            </div>

            {showGatewayErrorDetails && (
              <div className="mt-4 rounded-lg p-3" style={{ backgroundColor: 'rgba(255, 255, 255, 0.04)' }}>
                <p className="text-xs font-medium" style={{ color: 'var(--app-text)' }}>技术详情</p>
                <div className="mt-2 space-y-2 text-xs" style={{ color: 'var(--app-text-muted)' }}>
                  {isRepairingGateway && (
                    <div>
                      <div style={{ color: 'var(--app-text)' }}>当前状态</div>
                      <div className="mt-1">正在执行官方修复流程，请不要关闭窗口。</div>
                    </div>
                  )}
                  {runtimeInfo && (
                    <div>
                      <div style={{ color: 'var(--app-text)' }}>运行时版本</div>
                      <div className="mt-1">{runtimeInfo.appVersionLabel} · compat tail {runtimeInfo.openclawCompatTail}</div>
                    </div>
                  )}
                  <div>
                    <div style={{ color: 'var(--app-text)' }}>原始错误</div>
                    <div className="mt-1 break-words">{gatewayStatus.error}</div>
                  </div>
                  {(gatewayStatus.host || gatewayStatus.port) && (
                    <div>
                      <div style={{ color: 'var(--app-text)' }}>连接目标</div>
                      <div className="mt-1">{gatewayStatus.host || 'unknown'}:{gatewayStatus.port || 'unknown'}</div>
                    </div>
                  )}
                  {gatewayRepairSteps.length > 0 && (
                    <div>
                      <div style={{ color: 'var(--app-text)' }}>修复进度</div>
                      <div className="mt-1 space-y-1">
                        {gatewayRepairSteps.map((step, index) => (
                          <div key={`${index}-${step}`}>{index + 1}. {step}</div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {systemError && (
          <div className="mt-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
            <p className="text-yellow-300 text-sm">systemStats error: {systemError}</p>
          </div>
        )}

        {dashboardMessage ? (
          <div
            className="mt-5 rounded-2xl border px-4 py-3 text-sm"
            style={{
              backgroundColor: dashboardMessageTone === 'success'
                ? 'rgba(16, 185, 129, 0.12)'
                : dashboardMessageTone === 'error'
                  ? 'rgba(239, 68, 68, 0.12)'
                  : 'rgba(59, 130, 246, 0.12)',
              borderColor: dashboardMessageTone === 'success'
                ? 'rgba(16, 185, 129, 0.24)'
                : dashboardMessageTone === 'error'
                  ? 'rgba(239, 68, 68, 0.24)'
                  : 'rgba(59, 130, 246, 0.24)',
              color: dashboardMessageTone === 'success'
                ? '#065f46'  /* 深绿色，与浅绿背景形成足够对比度 */
                : dashboardMessageTone === 'error'
                  ? '#991b1b'  /* 深红色 */
                  : '#1e40af',  /* 深蓝色 */
            }}
          >
            {dashboardMessage}
          </div>
        ) : null}
      </GlassCard>

      <div className="space-y-6">
        <GlassCard className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold" style={{ color: 'var(--app-text)' }}>快捷操作</h3>
              <p className="mt-1 text-sm" style={{ color: 'var(--app-text-muted)' }}>
                快速跳转到常用功能，或刷新当前状态。
              </p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            {quickActions.map((item) => {
              const Icon = item.icon;
              return (
                /* 玻璃液态快捷操作按钮：半透明背景 + backdrop-blur + accent 图标圆圈 */
                <button
                  key={item.key}
                  onClick={item.onClick}
                  className="relative w-full overflow-hidden rounded-xl px-4 py-3 text-left backdrop-blur-xl transition-token-normal cursor-pointer hover:-translate-y-0.5"
                  style={{
                    background: 'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)',
                    border: '1px solid var(--app-border)',
                    color: 'var(--app-text)',
                  }}
                >
                  {/* 右上角装饰光晕 */}
                  <div
                    className="pointer-events-none absolute -right-4 -top-4 h-14 w-14 rounded-full blur-2xl"
                    style={{ backgroundColor: `${item.accent}28` }}
                  />
                  <div className="relative z-10 flex items-start gap-3">
                    <div
                      className="flex h-9 w-9 items-center justify-center rounded-xl"
                      style={{
                        background: `linear-gradient(135deg, ${item.accent}28 0%, ${item.accent}14 100%)`,
                        color: item.accent,
                      }}
                    >
                      <Icon size={18} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{item.title}</div>
                      <div className="mt-1 text-xs leading-5" style={{ color: 'var(--app-text-muted)' }}>
                        {item.description}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </GlassCard>

        {shouldShowRootDiagnostic ? (
          <GlassCard className="p-6">
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
                <AppButton
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowRootDiagnosticDetails((value) => !value)}
                >
                  {showRootDiagnosticDetails ? '隐藏详情' : '查看详情'}
                </AppButton>
                <AppButton
                  variant="primary"
                  size="sm"
                  onClick={() => navigate('/settings?section=config')}
                >
                  前往配置
                </AppButton>
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
          </GlassCard>
        ) : null}
      </div>
    </div>
  );
}
export default Dashboard;