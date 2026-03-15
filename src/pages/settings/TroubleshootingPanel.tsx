/**
 * 故障排查面板组件（TroubleshootingPanel）
 * 为每个已配置渠道提供诊断、日志查看和重新连接功能
 * - 诊断入口：调用 channelsDiagnose 展示连接状态和诊断信息
 * - 查看渠道日志：调用 logsFilter 展示最近日志
 * - 重新连接：调用 channelsReconnect 尝试重新建立连接
 * - 常见问题排查建议列表（静态内容）
 * - 错误处理：命令失败时显示 troubleshootingDiagnoseFailed 并建议检查运行时
 */
import React, { useState } from 'react';
import { Stethoscope, FileText, RefreshCw, AlertTriangle, Loader2 } from 'lucide-react';
import AppButton from '../../components/AppButton';
import GlassCard from '../../components/GlassCard';
import { useI18n } from '../../i18n/I18nContext';

// ============================================================
// 组件属性接口
// ============================================================

interface TroubleshootingPanelProps {
  /** 完整的 OpenClaw 配置对象 */
  config: any;
  /** 已配置的渠道类型列表 */
  configuredChannels: string[];
}

// ============================================================
// 常见问题排查建议 i18n 键列表
// ============================================================

const COMMON_ISSUE_KEYS = [
  'channels.troubleshootingConnectionTimeout',
  'channels.troubleshootingAuthFailed',
  'channels.troubleshootingPermissionDenied',
  'channels.troubleshootingConfigMissing',
] as const;

// ============================================================
// TroubleshootingPanel 组件
// ============================================================

const TroubleshootingPanel: React.FC<TroubleshootingPanelProps> = ({
  config: _config,
  configuredChannels,
}) => {
  const { t } = useI18n();

  // ── 每个渠道的诊断输出与运行状态 ──────────────────────────
  const [diagnoseOutput, setDiagnoseOutput] = useState<Record<string, string>>({});
  const [diagnoseRunning, setDiagnoseRunning] = useState<Record<string, boolean>>({});

  // ── 每个渠道的日志输出与运行状态 ──────────────────────────
  const [logsOutput, setLogsOutput] = useState<Record<string, string>>({});
  const [logsRunning, setLogsRunning] = useState<Record<string, boolean>>({});

  // ── 每个渠道的重连运行状态 ────────────────────────────────
  const [reconnectRunning, setReconnectRunning] = useState<Record<string, boolean>>({});

  // ── 诊断处理：调用 channelsDiagnose IPC ────────────────────
  const handleDiagnose = async (channelType: string) => {
    setDiagnoseRunning((prev) => ({ ...prev, [channelType]: true }));
    setDiagnoseOutput((prev) => ({ ...prev, [channelType]: '' }));
    try {
      const result = await window.electronAPI.channelsDiagnose(channelType);
      if (result.success) {
        setDiagnoseOutput((prev) => ({ ...prev, [channelType]: result.output || '' }));
      } else {
        // 命令失败时显示 troubleshootingDiagnoseFailed 提示
        setDiagnoseOutput((prev) => ({
          ...prev,
          [channelType]: t('channels.troubleshootingDiagnoseFailed' as any),
        }));
      }
    } catch {
      setDiagnoseOutput((prev) => ({
        ...prev,
        [channelType]: t('channels.troubleshootingDiagnoseFailed' as any),
      }));
    } finally {
      setDiagnoseRunning((prev) => ({ ...prev, [channelType]: false }));
    }
  };

  // ── 查看日志处理：调用 logsFilter IPC ─────────────────────
  const handleViewLogs = async (channelType: string) => {
    setLogsRunning((prev) => ({ ...prev, [channelType]: true }));
    setLogsOutput((prev) => ({ ...prev, [channelType]: '' }));
    try {
      const result = await window.electronAPI.logsFilter('channel=' + channelType);
      if (result.success && result.logs) {
        // 将日志数组格式化为可读文本
        const formatted = result.logs
          .map((log: any) => (typeof log === 'string' ? log : JSON.stringify(log, null, 2)))
          .join('\n');
        setLogsOutput((prev) => ({ ...prev, [channelType]: formatted || '' }));
      } else {
        setLogsOutput((prev) => ({
          ...prev,
          [channelType]: t('channels.troubleshootingDiagnoseFailed' as any),
        }));
      }
    } catch {
      setLogsOutput((prev) => ({
        ...prev,
        [channelType]: t('channels.troubleshootingDiagnoseFailed' as any),
      }));
    } finally {
      setLogsRunning((prev) => ({ ...prev, [channelType]: false }));
    }
  };

  // ── 重新连接处理：调用 channelsReconnect IPC ──────────────
  const handleReconnect = async (channelType: string) => {
    setReconnectRunning((prev) => ({ ...prev, [channelType]: true }));
    try {
      const result = await window.electronAPI.channelsReconnect(channelType);
      if (result.success) {
        // 重连成功后自动触发一次诊断，刷新状态
        setDiagnoseOutput((prev) => ({ ...prev, [channelType]: result.output || '' }));
      } else {
        setDiagnoseOutput((prev) => ({
          ...prev,
          [channelType]: t('channels.troubleshootingDiagnoseFailed' as any),
        }));
      }
    } catch {
      setDiagnoseOutput((prev) => ({
        ...prev,
        [channelType]: t('channels.troubleshootingDiagnoseFailed' as any),
      }));
    } finally {
      setReconnectRunning((prev) => ({ ...prev, [channelType]: false }));
    }
  };

  return (
    <GlassCard className="rounded-2xl p-6">
      {/* 标题区域 */}
      <div className="mb-6">
        <h3
          className="text-lg font-semibold"
          style={{ color: 'var(--app-text)' }}
        >
          {t('channels.troubleshooting' as any)}
        </h3>
        <p
          className="mt-1 text-sm"
          style={{ color: 'var(--app-text-muted)' }}
        >
          {t('channels.troubleshootingDescription' as any)}
        </p>
      </div>

      {/* 渠道诊断卡片列表 */}
      {configuredChannels.length === 0 ? (
        <div
          className="rounded-lg py-8 text-center text-sm"
          style={{
            color: 'var(--app-text-muted)',
            backgroundColor: 'var(--app-bg-subtle)',
            border: '1px solid var(--app-border)',
          }}
        >
          {t('channels.noChannels' as any)}
        </div>
      ) : (
        <div className="space-y-4">
          {configuredChannels.map((channelType) => {
            const isAnyRunning =
              diagnoseRunning[channelType] ||
              logsRunning[channelType] ||
              reconnectRunning[channelType];

            return (
              <div
                key={channelType}
                className="rounded-lg p-4"
                style={{
                  backgroundColor: 'var(--app-bg-subtle)',
                  border: '1px solid var(--app-border)',
                }}
              >
                {/* 渠道名称和操作按钮 */}
                <div className="mb-3 flex items-center justify-between">
                  <span
                    className="text-sm font-medium"
                    style={{ color: 'var(--app-text)' }}
                  >
                    {channelType}
                  </span>
                  <div className="flex gap-2">
                    {/* 诊断按钮 */}
                    <AppButton
                      size="xs"
                      variant="primary"
                      disabled={isAnyRunning}
                      icon={
                        diagnoseRunning[channelType]
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Stethoscope className="h-3.5 w-3.5" />
                      }
                      onClick={() => handleDiagnose(channelType)}
                    >
                      {t('channels.troubleshootingDiagnose' as any)}
                    </AppButton>

                    {/* 查看日志按钮 */}
                    <AppButton
                      size="xs"
                      variant="secondary"
                      disabled={isAnyRunning}
                      icon={
                        logsRunning[channelType]
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <FileText className="h-3.5 w-3.5" />
                      }
                      onClick={() => handleViewLogs(channelType)}
                    >
                      {t('channels.troubleshootingViewLogs' as any)}
                    </AppButton>

                    {/* 重新连接按钮 */}
                    <AppButton
                      size="xs"
                      variant="secondary"
                      disabled={isAnyRunning}
                      icon={
                        reconnectRunning[channelType]
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <RefreshCw className="h-3.5 w-3.5" />
                      }
                      onClick={() => handleReconnect(channelType)}
                    >
                      {t('channels.troubleshootingReconnect' as any)}
                    </AppButton>
                  </div>
                </div>

                {/* 诊断输出区域 */}
                {diagnoseOutput[channelType] && (
                  <pre
                    className="mt-2 max-h-48 overflow-auto rounded-lg p-3 text-xs whitespace-pre-wrap"
                    style={{
                      backgroundColor: 'var(--app-bg)',
                      border: '1px solid var(--app-border)',
                      color: 'var(--app-text)',
                    }}
                  >
                    <code>{diagnoseOutput[channelType]}</code>
                  </pre>
                )}

                {/* 日志输出区域 */}
                {logsOutput[channelType] && (
                  <pre
                    className="mt-2 max-h-48 overflow-auto rounded-lg p-3 text-xs whitespace-pre-wrap"
                    style={{
                      backgroundColor: 'var(--app-bg)',
                      border: '1px solid var(--app-border)',
                      color: 'var(--app-text)',
                    }}
                  >
                    <code>{logsOutput[channelType]}</code>
                  </pre>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 常见问题排查建议列表 */}
      <div className="mt-6">
        <h4
          className="mb-3 text-sm font-medium"
          style={{ color: 'var(--app-text)' }}
        >
          {t('channels.troubleshootingCommonIssues' as any)}
        </h4>
        <div className="space-y-2">
          {COMMON_ISSUE_KEYS.map((key) => (
            <div
              key={key}
              className="flex items-start gap-2 rounded-lg px-3 py-2"
              style={{
                backgroundColor: 'var(--app-bg-subtle)',
                border: '1px solid var(--app-border)',
              }}
            >
              <AlertTriangle
                className="mt-0.5 h-4 w-4 shrink-0"
                style={{ color: 'var(--app-warning, #f59e0b)' }}
              />
              <span
                className="text-sm"
                style={{ color: 'var(--app-text-muted)' }}
              >
                {t(key as any)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </GlassCard>
  );
};

export default TroubleshootingPanel;
