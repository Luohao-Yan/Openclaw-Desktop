import React, { useState, useEffect, useCallback } from 'react';
import {
  Terminal, Download, Upload, RefreshCw, Shield, RotateCcw,
  CheckCircle, AlertTriangle, XCircle
} from 'lucide-react';
import GlassCard from './GlassCard';
import GlobalLoading from './GlobalLoading';
import AppButton from './AppButton';
import HistoryStatsPanel from './HistoryStatsPanel';
import { useI18n } from '../i18n/I18nContext';
import type { DailyStats, SecurityCheckResult } from '../types/electron';

/** 组件 Props：仅需 agentId 和 agentName */
interface AgentEnhancerProps {
  agentId: string;
  agentName: string;
}

/** 工具箱按钮配置 */
interface ToolboxAction {
  key: string;
  label: string;
  icon: React.ReactNode;
  handler: () => Promise<void>;
  /** 按钮背景色 */
  bg: string;
}

const AgentEnhancer: React.FC<AgentEnhancerProps> = ({ agentId, agentName }) => {
  const { t } = useI18n();

  // ── 状态 ──────────────────────────────────────────────────────────────────
  /** 历史统计数据 */
  const [stats, setStats] = useState<DailyStats[]>([]);
  /** 独立会话总数 */
  const [totalSessions, setTotalSessions] = useState(0);
  /** 统计数据加载中 */
  const [statsLoading, setStatsLoading] = useState(true);
  /** 各操作按钮的加载状态 */
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  /** 安全检查结果（null 表示尚未执行） */
  const [securityResults, setSecurityResults] = useState<SecurityCheckResult[] | null>(null);
  /** 操作反馈消息 */
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // ── 辅助方法 ──────────────────────────────────────────────────────────────

  /** 设置单个操作按钮的加载状态 */
  const setActionBusy = (key: string, busy: boolean) => {
    setActionLoading(prev => ({ ...prev, [key]: busy }));
  };

  /** 显示反馈消息，3 秒后自动清除 */
  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 3000);
  };

  // ── 数据加载 ──────────────────────────────────────────────────────────────

  /** 加载历史统计数据 */
  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const result = await window.electronAPI.agentsGetHistoryStats(agentId);
      if (result.success && result.stats) {
        setStats(result.stats);
        setTotalSessions(result.totalSessions ?? 0);
      } else {
        console.error('加载历史统计失败:', result.error);
      }
    } catch (error) {
      console.error('加载历史统计异常:', error);
    } finally {
      setStatsLoading(false);
    }
  }, [agentId]);

  /** 页面初始化：加载统计数据 */
  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // ── 工具箱操作 ────────────────────────────────────────────────────────────

  /** 打开调试终端 */
  const handleDebugTerminal = async () => {
    setActionBusy('debug', true);
    try {
      const result = await window.electronAPI.agentsOpenDebugTerminal(agentId);
      if (result.success) {
        showFeedback('success', '调试终端已打开');
      } else {
        showFeedback('error', result.error || '打开调试终端失败');
      }
    } catch (error) {
      showFeedback('error', '打开调试终端异常');
    } finally {
      setActionBusy('debug', false);
    }
  };

  /** 导出配置 */
  const handleExportConfig = async () => {
    setActionBusy('export', true);
    try {
      const result = await window.electronAPI.agentsExportConfig(agentId);
      if (result.success) {
        showFeedback('success', `配置已导出到: ${result.filePath || '指定路径'}`);
      } else {
        showFeedback('error', result.error || '导出配置失败');
      }
    } catch (error) {
      showFeedback('error', '导出配置异常');
    } finally {
      setActionBusy('export', false);
    }
  };

  /** 导入配置 */
  const handleImportConfig = async () => {
    setActionBusy('import', true);
    try {
      const result = await window.electronAPI.agentsImportConfig(agentId);
      if (result.success) {
        showFeedback('success', '配置导入成功，正在刷新数据...');
        // 导入成功后刷新统计数据
        await loadStats();
      } else {
        showFeedback('error', result.error || '导入配置失败');
      }
    } catch (error) {
      showFeedback('error', '导入配置异常');
    } finally {
      setActionBusy('import', false);
    }
  };

  /** 重启 Agent（需确认） */
  const handleRestart = async () => {
    // 弹出确认对话框
    const confirmed = window.confirm('重启将中断当前会话，确定要重启该 Agent 吗？');
    if (!confirmed) return;

    setActionBusy('restart', true);
    try {
      const result = await window.electronAPI.agentsRestart(agentId);
      if (result.success) {
        showFeedback('success', 'Agent 重启成功');
        // 重启后刷新统计数据
        await loadStats();
      } else {
        showFeedback('error', result.error || '重启 Agent 失败');
      }
    } catch (error) {
      showFeedback('error', '重启 Agent 异常');
    } finally {
      setActionBusy('restart', false);
    }
  };

  /** 安全检查 */
  const handleSecurityCheck = async () => {
    setActionBusy('security', true);
    setSecurityResults(null);
    try {
      const result = await window.electronAPI.agentsSecurityCheck(agentId);
      if (result.success && result.results) {
        setSecurityResults(result.results);
        showFeedback('success', `安全检查完成，共 ${result.results.length} 项`);
      } else {
        showFeedback('error', result.error || '安全检查失败');
      }
    } catch (error) {
      showFeedback('error', '安全检查异常');
    } finally {
      setActionBusy('security', false);
    }
  };

  /** 刷新按钮：重新加载统计数据 */
  const handleRefresh = () => {
    loadStats();
  };

  // ── 工具箱按钮配置 ────────────────────────────────────────────────────────

  const toolboxActions: ToolboxAction[] = [
    {
      key: 'debug',
      label: '调试终端',
      icon: <Terminal className="w-6 h-6" style={{ color: '#6366f1' }} />,
      handler: handleDebugTerminal,
      bg: 'rgba(99,102,241,0.10)',
    },
    {
      key: 'export',
      label: '导出配置',
      icon: <Download className="w-6 h-6" style={{ color: '#10b981' }} />,
      handler: handleExportConfig,
      bg: 'rgba(16,185,129,0.10)',
    },
    {
      key: 'import',
      label: '导入配置',
      icon: <Upload className="w-6 h-6" style={{ color: '#3b82f6' }} />,
      handler: handleImportConfig,
      bg: 'rgba(59,130,246,0.10)',
    },
    {
      key: 'restart',
      label: '重启 Agent',
      icon: <RefreshCw className="w-6 h-6" style={{ color: '#f59e0b' }} />,
      handler: handleRestart,
      bg: 'rgba(245,158,11,0.10)',
    },
    {
      key: 'security',
      label: '安全检查',
      icon: <Shield className="w-6 h-6" style={{ color: '#ef4444' }} />,
      handler: handleSecurityCheck,
      bg: 'rgba(239,68,68,0.10)',
    },
  ];

  // ── 安全检查结果辅助 ──────────────────────────────────────────────────────

  /** 根据检查状态返回图标 */
  const getStatusIcon = (status: SecurityCheckResult['status']) => {
    switch (status) {
      case 'pass': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'warning': return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      case 'fail': return <XCircle className="w-4 h-4 text-red-500" />;
    }
  };

  /** 根据风险等级返回样式类 */
  const getRiskBadgeClass = (level: SecurityCheckResult['riskLevel']) => {
    switch (level) {
      case 'low': return 'bg-green-500/10 text-green-500';
      case 'medium': return 'bg-yellow-500/10 text-yellow-500';
      case 'high': return 'bg-red-500/10 text-red-500';
    }
  };

  // ── 渲染 ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* 顶部：Agent 名称 + 刷新按钮 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--app-text)' }}>
            {agentName}
          </h2>
          <p className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
            {t('agent.enhancement.title')}
          </p>
        </div>
        <AppButton
          variant="secondary"
          size="sm"
          onClick={handleRefresh}
          loading={statsLoading}
          icon={<RotateCcw className="w-4 h-4" />}
        >
          {t('agent.enhancement.refresh')}
        </AppButton>
      </div>

      {/* 操作反馈消息 */}
      {feedback && (
        <div
          className={`px-4 py-3 rounded-lg text-sm flex items-center gap-2 ${
            feedback.type === 'success'
              ? 'bg-green-500/10 text-green-500'
              : 'bg-red-500/10 text-red-500'
          }`}
        >
          {feedback.type === 'success'
            ? <CheckCircle className="w-4 h-4 flex-shrink-0" />
            : <XCircle className="w-4 h-4 flex-shrink-0" />}
          {feedback.message}
        </div>
      )}

      {/* 中部：运维工具箱 */}
      <GlassCard className="p-6">
        <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--app-text)' }}>
          {t('agent.enhancement.quickActions')}
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {toolboxActions.map((action) => (
            <button
              key={action.key}
              type="button"
              className="flex flex-col items-center justify-center p-4 rounded-xl transition-all duration-200 hover:scale-[1.03] active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer outline-none focus:outline-none"
              style={{
                backgroundColor: action.bg,
                color: 'var(--app-text)',
              }}
              disabled={!!actionLoading[action.key]}
              onClick={() => { void action.handler(); }}
            >
              {actionLoading[action.key] ? (
                <GlobalLoading visible overlay={false} size="sm" />
              ) : (
                action.icon
              )}
              <span className="text-sm mt-2 font-medium">{action.label}</span>
            </button>
          ))}
        </div>
      </GlassCard>

      {/* 安全检查结果列表 */}
      {securityResults && securityResults.length > 0 && (
        <GlassCard className="p-6">
          <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--app-text)' }}>
            安全检查结果
          </h3>
          <div className="space-y-3">
            {securityResults.map((item, index) => (
              <div
                key={item.checkId || index}
                className="flex items-start gap-3 p-3 rounded-lg border"
                style={{
                  backgroundColor: 'var(--app-bg-elevated)',
                  borderColor: 'var(--app-border)',
                }}
              >
                {/* 状态图标 */}
                <div className="mt-0.5 flex-shrink-0">
                  {getStatusIcon(item.status)}
                </div>
                {/* 检查详情 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm" style={{ color: 'var(--app-text)' }}>
                      {item.name}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getRiskBadgeClass(item.riskLevel)}`}>
                      {item.riskLevel}
                    </span>
                  </div>
                  <p className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
                    {item.message}
                  </p>
                  {item.recommendation && (
                    <p className="text-xs mt-1" style={{ color: 'var(--app-text-muted)' }}>
                      💡 {item.recommendation}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {/* 下部：运行统计面板 */}
      <HistoryStatsPanel
        agentId={agentId}
        stats={stats}
        totalSessions={totalSessions}
        loading={statsLoading}
        title="运行统计"
      />
    </div>
  );
};

export default AgentEnhancer;
