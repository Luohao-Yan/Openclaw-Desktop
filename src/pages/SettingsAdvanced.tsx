import React, { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, RotateCcw, Download, FolderOpen, HardDrive, Trash2, RefreshCw, FileText, ChevronDown, ChevronUp } from 'lucide-react';
import AppButton from '../components/AppButton';
import GlassCard from '../components/GlassCard';
import { useI18n } from '../i18n/I18nContext';
import UninstallOpenclawCard from './settings/UninstallOpenclawCard';
import OpenClawVersionPanel from './settings/OpenClawVersionPanel';
import type { DesktopDirPaths } from '../../types/electron';

const SettingsAdvanced: React.FC = () => {
  const { t } = useI18n();

  // 重置状态
  const [isResetting, setIsResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState('');
  const [resetConfirm, setResetConfirm] = useState(false);

  // 重装状态
  const [isReinstalling, setIsReinstalling] = useState(false);
  const [reinstallMessage, setReinstallMessage] = useState('');
  const [reinstallOutput, setReinstallOutput] = useState('');
  const [reinstallConfirm, setReinstallConfirm] = useState(false);

  // 运行模式和远程主机地址（用于传入 UninstallOpenclawCard）
  const [runMode, setRunMode] = useState<'local' | 'remote'>('local');
  const [remoteHost, setRemoteHost] = useState<string | undefined>(undefined);

  // 本地数据目录路径状态
  const [desktopPaths, setDesktopPaths] = useState<DesktopDirPaths | null>(null);
  const [pathsLoading, setPathsLoading] = useState(false);
  const [clearingLogs, setClearingLogs] = useState(false);
  const [clearLogsMsg, setClearLogsMsg] = useState('');

  // 日志查看器状态
  const [logViewerOpen, setLogViewerOpen] = useState(false);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [logLoading, setLogLoading] = useState(false);

  /** 从 settings 读取 runMode 和远程连接地址 */
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const result = await window.electronAPI.settingsGet<{
          runMode?: 'local' | 'remote';
          remoteConnection?: { host?: string };
        }>();
        if (result.success && result.settings) {
          setRunMode(result.settings.runMode || 'local');
          setRemoteHost(result.settings.remoteConnection?.host);
        }
      } catch {
        // 读取失败时保持默认值 local
      }
    };
    void loadSettings();
  }, []);

  /** 加载本地数据目录路径 */
  const loadDesktopPaths = useCallback(async () => {
    setPathsLoading(true);
    try {
      const result = await window.electronAPI.desktopDirGetPaths();
      if (result.success && result.paths) {
        setDesktopPaths(result.paths);
      }
    } catch {
      // 静默失败
    } finally {
      setPathsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDesktopPaths();
  }, [loadDesktopPaths]);

  /** 在 Finder/Explorer 中打开指定目录 */
  const handleOpenInFinder = async (subPath?: string) => {
    try {
      await window.electronAPI.desktopDirOpenInFinder(subPath);
    } catch {
      // 静默失败
    }
  };

  /** 加载最近日志行 */
  const handleLoadLogs = useCallback(async () => {
    setLogLoading(true);
    try {
      const result = await window.electronAPI.appLoggerGetRecentLines(200);
      if (result.success && result.lines) {
        setLogLines(result.lines);
      } else {
        setLogLines([]);
      }
    } catch {
      setLogLines([]);
    } finally {
      setLogLoading(false);
    }
  }, []);

  /** 切换日志查看器展开状态 */
  const handleToggleLogViewer = () => {
    const next = !logViewerOpen;
    setLogViewerOpen(next);
    if (next && logLines.length === 0) void handleLoadLogs();
  };

  /** 清除所有桌面端日志文件 */
  const handleClearLogs = async () => {
    setClearingLogs(true);
    setClearLogsMsg('');
    try {
      const result = await window.electronAPI.appLoggerClearAll();
      if (result.success) {
        setLogLines([]);
        setClearLogsMsg(`已清除 ${result.deletedCount} 个日志文件`);
      } else {
        setClearLogsMsg(`清除失败：${result.error || '未知错误'}`);
      }
    } catch (err: any) {
      setClearLogsMsg(`清除失败：${err.message}`);
    } finally {
      setClearingLogs(false);
      setTimeout(() => setClearLogsMsg(''), 3000);
    }
  };

  /** 重置应用配置 */
  const handleReset = async () => {
    if (!resetConfirm) {
      setResetConfirm(true);
      return;
    }
    try {
      setIsResetting(true);
      setResetMessage('');
      const result = await window.electronAPI.appConfigReset();
      if (result.success) {
        setResetMessage(t('settings.advanced.resetAppSuccess'));
      } else {
        setResetMessage(`错误：${result.error || '重置失败'}`);
      }
    } catch (err: any) {
      setResetMessage(`错误：${err.message}`);
    } finally {
      setIsResetting(false);
      setResetConfirm(false);
    }
  };

  /** 重装 OpenClaw */
  const handleReinstall = async () => {
    if (!reinstallConfirm) {
      setReinstallConfirm(true);
      return;
    }
    try {
      setIsReinstalling(true);
      setReinstallMessage(t('settings.advanced.reinstallOpenclawRunning'));
      setReinstallOutput('');
      const result = await window.electronAPI.appConfigReinstallOpenclaw();
      if (result.success) {
        setReinstallMessage(t('settings.advanced.reinstallOpenclawSuccess'));
      } else {
        setReinstallMessage(`错误：${result.error || '重装失败'}`);
      }
      if (result.output) {
        setReinstallOutput(result.output);
      }
    } catch (err: any) {
      setReinstallMessage(`错误：${err.message}`);
    } finally {
      setIsReinstalling(false);
      setReinstallConfirm(false);
    }
  };

  return (
    <div className="space-y-6 p-1">
      {/* OpenClaw 版本管理 */}
      <OpenClawVersionPanel />

      {/* 本地数据存储路径 */}
      <GlassCard className="rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HardDrive size={16} style={{ color: 'var(--app-accent)' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--app-text)' }}>
              本地数据存储
            </span>
          </div>
          <button
            onClick={loadDesktopPaths}
            disabled={pathsLoading}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-opacity hover:opacity-70"
            style={{ color: 'var(--app-text-muted)' }}
          >
            <RefreshCw size={12} className={pathsLoading ? 'animate-spin' : ''} />
            刷新
          </button>
        </div>

        {desktopPaths ? (
          <div className="space-y-3">
            {/* 路径列表 */}
            {([
              { label: '桌面端数据根目录', path: desktopPaths.desktopDir, subPath: undefined },
              { label: '远程实例配置', path: desktopPaths.instancesFile, subPath: 'instances.json' },
              { label: '应用日志目录', path: desktopPaths.logsDir, subPath: 'logs' },
              { label: '缓存目录', path: desktopPaths.cacheDir, subPath: 'cache' },
            ] as const).map(({ label, path: p, subPath }) => (
              <div
                key={label}
                className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5"
                style={{ backgroundColor: 'var(--app-bg-subtle)', border: '1px solid var(--app-border)' }}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium mb-0.5" style={{ color: 'var(--app-text-muted)' }}>
                    {label}
                  </div>
                  <div
                    className="text-xs font-mono truncate"
                    style={{ color: 'var(--app-text)' }}
                    title={p}
                  >
                    {p}
                  </div>
                </div>
                <button
                  onClick={() => handleOpenInFinder(subPath)}
                  className="shrink-0 flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg transition-opacity hover:opacity-70"
                  style={{
                    backgroundColor: 'rgba(var(--app-accent-rgb, 99,102,241), 0.12)',
                    color: 'var(--app-accent)',
                  }}
                  title="在文件管理器中打开"
                >
                  <FolderOpen size={12} />
                  打开
                </button>
              </div>
            ))}

            {/* 日志查看器 */}
            <div
              className="rounded-xl border overflow-hidden"
              style={{ borderColor: 'var(--app-border)' }}
            >
              <button
                onClick={handleToggleLogViewer}
                className="flex w-full items-center justify-between px-4 py-3 text-sm transition-opacity hover:opacity-80"
                style={{ backgroundColor: 'var(--app-bg-subtle)' }}
              >
                <div className="flex items-center gap-2">
                  <FileText size={13} style={{ color: 'var(--app-accent)' }} />
                  <span className="font-medium" style={{ color: 'var(--app-text)' }}>应用日志查看器</span>
                  {logLines.length > 0 && (
                    <span className="text-xs" style={{ color: 'var(--app-text-muted)' }}>
                      ({logLines.length} 行)
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {logViewerOpen && (
                    <button
                      onClick={(e) => { e.stopPropagation(); void handleLoadLogs(); }}
                      disabled={logLoading}
                      className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-md transition-opacity hover:opacity-70"
                      style={{ color: 'var(--app-text-muted)' }}
                      title="刷新"
                    >
                      <RefreshCw size={11} className={logLoading ? 'animate-spin' : ''} />
                      刷新
                    </button>
                  )}
                  {logViewerOpen ? <ChevronUp size={14} style={{ color: 'var(--app-text-muted)' }} /> : <ChevronDown size={14} style={{ color: 'var(--app-text-muted)' }} />}
                </div>
              </button>

              {logViewerOpen && (
                <div
                  className="max-h-64 overflow-y-auto px-4 py-3"
                  style={{ backgroundColor: 'var(--app-bg-subtle)' }}
                >
                  {logLoading ? (
                    <div className="text-xs py-4 text-center" style={{ color: 'var(--app-text-muted)' }}>加载中...</div>
                  ) : logLines.length === 0 ? (
                    <div className="text-xs py-4 text-center" style={{ color: 'var(--app-text-muted)' }}>暂无日志</div>
                  ) : (
                    <pre
                      className="text-xs leading-5 whitespace-pre-wrap break-all"
                      style={{ color: 'var(--app-text-muted)', fontFamily: 'monospace' }}
                    >
                      {logLines.join('\n')}
                    </pre>
                  )}
                </div>
              )}
            </div>

            {/* 清除日志按钮 */}
            <div className="flex items-center gap-3 pt-1">
              <AppButton
                variant="secondary"
                onClick={handleClearLogs}
                disabled={clearingLogs}
                icon={<Trash2 size={13} />}
              >
                {clearingLogs ? '清除中...' : '清除应用日志'}
              </AppButton>
              {clearLogsMsg && (
                <span
                  className="text-xs"
                  style={{
                    color: clearLogsMsg.startsWith('清除失败')
                      ? '#FB7185'
                      : '#4ADE80',
                  }}
                >
                  {clearLogsMsg}
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="text-xs" style={{ color: 'var(--app-text-muted)' }}>
            {pathsLoading ? '加载中...' : '无法获取路径信息'}
          </div>
        )}
      </GlassCard>

      {/* 危险操作区域标题 */}
      <div className="flex items-center gap-2">
        <AlertTriangle size={16} style={{ color: '#FB7185' }} />
        <span className="text-sm font-semibold uppercase tracking-widest" style={{ color: '#FB7185' }}>
          {t('settings.advanced.dangerZone')}
        </span>
      </div>

      {/* 重置应用配置 */}
      <GlassCard
        className="rounded-2xl p-5 space-y-4"
        style={{
          border: '1px solid rgba(251, 113, 133, 0.25)',
          background: 'linear-gradient(135deg, rgba(244, 63, 94, 0.06) 0%, var(--app-bg-elevated) 100%)',
        }}
      >
        <div className="flex items-start gap-4">
          {/* 图标 */}
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: 'rgba(244, 63, 94, 0.12)', color: '#FB7185' }}
          >
            <RotateCcw size={18} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-semibold" style={{ color: 'var(--app-text)' }}>
              {t('settings.advanced.resetApp')}
            </div>
            <div className="mt-1 text-sm leading-6" style={{ color: 'var(--app-text-muted)' }}>
              {t('settings.advanced.resetAppDescription')}
            </div>

            {/* 二次确认提示 */}
            {resetConfirm && (
              <div
                className="mt-3 rounded-xl px-4 py-3 text-sm"
                style={{
                  backgroundColor: 'rgba(244, 63, 94, 0.10)',
                  border: '1px solid rgba(244, 63, 94, 0.30)',
                  color: '#FB7185',
                }}
              >
                {t('settings.advanced.resetAppConfirm')}
              </div>
            )}

            {/* 操作结果 */}
            {resetMessage && (
              <div
                className="mt-3 rounded-xl px-4 py-3 text-sm"
                style={{
                  backgroundColor: resetMessage.startsWith('错误')
                    ? 'rgba(244, 63, 94, 0.10)'
                    : 'rgba(34, 197, 94, 0.10)',
                  border: `1px solid ${resetMessage.startsWith('错误') ? 'rgba(244, 63, 94, 0.30)' : 'rgba(34, 197, 94, 0.30)'}`,
                  color: resetMessage.startsWith('错误') ? '#FB7185' : '#4ADE80',
                }}
              >
                {resetMessage}
              </div>
            )}

            <div className="mt-4 flex gap-2">
              <AppButton
                variant="danger"
                onClick={handleReset}
                disabled={isResetting}
                icon={<RotateCcw size={14} />}
              >
                {isResetting ? '重置中...' : resetConfirm ? '确认重置' : t('settings.advanced.resetApp')}
              </AppButton>
              {resetConfirm && (
                <AppButton
                  variant="secondary"
                  onClick={() => setResetConfirm(false)}
                >
                  取消
                </AppButton>
              )}
            </div>
          </div>
        </div>
      </GlassCard>

      {/* 重装 OpenClaw */}
      <GlassCard
        className="rounded-2xl p-5 space-y-4"
        style={{
          border: '1px solid rgba(251, 113, 133, 0.25)',
          background: 'linear-gradient(135deg, rgba(244, 63, 94, 0.06) 0%, var(--app-bg-elevated) 100%)',
        }}
      >
        <div className="flex items-start gap-4">
          {/* 图标 */}
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: 'rgba(244, 63, 94, 0.12)', color: '#FB7185' }}
          >
            <Download size={18} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-semibold" style={{ color: 'var(--app-text)' }}>
              {t('settings.advanced.reinstallOpenclaw')}
            </div>
            <div className="mt-1 text-sm leading-6" style={{ color: 'var(--app-text-muted)' }}>
              {t('settings.advanced.reinstallOpenclawDescription')}
            </div>

            {/* 二次确认提示 */}
            {reinstallConfirm && (
              <div
                className="mt-3 rounded-xl px-4 py-3 text-sm"
                style={{
                  backgroundColor: 'rgba(244, 63, 94, 0.10)',
                  border: '1px solid rgba(244, 63, 94, 0.30)',
                  color: '#FB7185',
                }}
              >
                {t('settings.advanced.reinstallOpenclawConfirm')}
              </div>
            )}

            {/* 操作结果 */}
            {reinstallMessage && (
              <div
                className="mt-3 rounded-xl px-4 py-3 text-sm"
                style={{
                  backgroundColor: reinstallMessage.startsWith('错误')
                    ? 'rgba(244, 63, 94, 0.10)'
                    : 'rgba(34, 197, 94, 0.10)',
                  border: `1px solid ${reinstallMessage.startsWith('错误') ? 'rgba(244, 63, 94, 0.30)' : 'rgba(34, 197, 94, 0.30)'}`,
                  color: reinstallMessage.startsWith('错误') ? '#FB7185' : '#4ADE80',
                }}
              >
                {reinstallMessage}
              </div>
            )}

            {/* 安装输出日志 */}
            {reinstallOutput && (
              <pre
                className="mt-3 rounded-xl px-4 py-3 text-xs overflow-auto max-h-48"
                style={{
                  backgroundColor: 'var(--app-bg-subtle)',
                  border: '1px solid var(--app-border)',
                  color: 'var(--app-text-muted)',
                  fontFamily: 'monospace',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}
              >
                {reinstallOutput}
              </pre>
            )}

            <div className="mt-4 flex gap-2">
              <AppButton
                variant="danger"
                onClick={handleReinstall}
                disabled={isReinstalling}
                icon={<Download size={14} />}
              >
                {isReinstalling
                  ? t('settings.advanced.reinstallOpenclawRunning')
                  : reinstallConfirm
                    ? '确认重装'
                    : t('settings.advanced.reinstallOpenclaw')}
              </AppButton>
              {reinstallConfirm && (
                <AppButton
                  variant="secondary"
                  onClick={() => setReinstallConfirm(false)}
                >
                  取消
                </AppButton>
              )}
            </div>
          </div>
        </div>
      </GlassCard>

      {/* 卸载 OpenClaw — 第三张危险操作卡片 */}
      <UninstallOpenclawCard runMode={runMode} remoteHost={remoteHost} />
    </div>
  );
};

export default SettingsAdvanced;
