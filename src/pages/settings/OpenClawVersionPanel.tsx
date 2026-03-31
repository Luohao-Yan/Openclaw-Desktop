/**
 * OpenClawVersionPanel — OpenClaw 版本管理面板
 *
 * 嵌入「设置 → 高级」页面，放置在危险操作区域之前。
 * 功能包括：
 * - 显示当前已安装版本
 * - 可用版本下拉列表（标记当前版本）
 * - 升级到最新版本按钮
 * - 切换到指定版本按钮
 * - 二次确认（内联，非弹窗）
 * - 安装进度和实时日志输出
 * - 成功/失败/超时结果提示
 * - 最近 5 条版本切换历史记录
 * - 加载指示器和网络错误重试
 * - 未检测到 OpenClaw 时的提示
 * - 所有文案通过 useI18n hook 获取
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Download,
  RefreshCw,
  ChevronDown,
  Clock,
  ArrowUpCircle,
  Check,
  X,
  Loader2,
} from 'lucide-react';
import GlassCard from '../../components/GlassCard';
import AppButton from '../../components/AppButton';
import { useI18n } from '../../i18n/I18nContext';
import type { VersionHistoryRecord } from '../../types/electron';

// ── 类型定义 ──────────────────────────────────────────────────────────────────

/** 安装结果状态 */
type InstallResult = null | 'success' | 'error' | 'timeout';

// ── 组件 ──────────────────────────────────────────────────────────────────────

const OpenClawVersionPanel: React.FC = () => {
  const { t } = useI18n();

  // ── 状态 ────────────────────────────────────────────────────────────────────

  // 当前版本
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [loadingCurrent, setLoadingCurrent] = useState(true);
  const [notDetected, setNotDetected] = useState(false);

  // 可用版本列表
  const [versions, setVersions] = useState<string[]>([]);
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [loadingVersions, setLoadingVersions] = useState(true);
  const [versionsError, setVersionsError] = useState(false);

  // 下拉选择
  const [selectedVersion, setSelectedVersion] = useState<string>('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 确认操作
  const [confirmAction, setConfirmAction] = useState<'upgrade' | 'switch' | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<string>('');

  // 安装状态
  const [installing, setInstalling] = useState(false);
  const [installLog, setInstallLog] = useState('');
  const [installResult, setInstallResult] = useState<InstallResult>(null);
  const [resultVersion, setResultVersion] = useState<string>('');
  const logRef = useRef<HTMLPreElement>(null);

  // 历史记录
  const [history, setHistory] = useState<VersionHistoryRecord[]>([]);

  // ── 数据加载 ────────────────────────────────────────────────────────────────

  /** 获取当前版本 */
  const fetchCurrentVersion = useCallback(async () => {
    setLoadingCurrent(true);
    setNotDetected(false);
    try {
      const res = await window.electronAPI.openclawVersionGetCurrent();
      if (res.success && res.version) {
        setCurrentVersion(res.version);
        setNotDetected(false);
      } else {
        setCurrentVersion(null);
        setNotDetected(true);
      }
    } catch {
      setCurrentVersion(null);
      setNotDetected(true);
    } finally {
      setLoadingCurrent(false);
    }
  }, []);

  /** 获取可用版本列表 */
  const fetchVersions = useCallback(async () => {
    setLoadingVersions(true);
    setVersionsError(false);
    try {
      const res = await window.electronAPI.openclawVersionListAvailable();
      if (res.success && res.versions) {
        setVersions(res.versions);
        setLatestVersion(res.latest || (res.versions.length > 0 ? res.versions[0] : null));
      } else {
        setVersionsError(true);
      }
    } catch {
      setVersionsError(true);
    } finally {
      setLoadingVersions(false);
    }
  }, []);

  /** 获取历史记录 */
  const fetchHistory = useCallback(async () => {
    try {
      const res = await window.electronAPI.openclawVersionGetHistory();
      if (res.success && res.history) {
        // 只显示最近 5 条
        setHistory(res.history.slice(0, 5));
      }
    } catch {
      // 历史记录加载失败不阻断核心功能
    }
  }, []);

  // 组件挂载时加载数据
  useEffect(() => {
    void fetchCurrentVersion();
    void fetchVersions();
    void fetchHistory();
  }, [fetchCurrentVersion, fetchVersions, fetchHistory]);

  // 监听安装输出事件
  useEffect(() => {
    if (!installing) return;
    const unsubscribe = window.electronAPI.onOpenclawVersionInstallOutput((data: string) => {
      setInstallLog((prev) => prev + data);
      // 自动滚动到底部
      requestAnimationFrame(() => {
        if (logRef.current) {
          logRef.current.scrollTop = logRef.current.scrollHeight;
        }
      });
    });
    return unsubscribe;
  }, [installing]);

  // 点击外部关闭下拉
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ── 操作处理 ────────────────────────────────────────────────────────────────

  /** 判断是否有更新版本可用 */
  const hasUpgrade = currentVersion && latestVersion && latestVersion !== currentVersion;

  /** 判断选中版本是否与当前版本不同 */
  const canSwitch = selectedVersion && selectedVersion !== currentVersion;

  /** 发起升级确认 */
  const handleUpgradeClick = () => {
    if (!latestVersion) return;
    setConfirmAction('upgrade');
    setConfirmTarget(latestVersion);
  };

  /** 发起切换确认 */
  const handleSwitchClick = () => {
    if (!selectedVersion) return;
    setConfirmAction('switch');
    setConfirmTarget(selectedVersion);
  };

  /** 取消确认 */
  const handleCancelConfirm = () => {
    setConfirmAction(null);
    setConfirmTarget('');
  };

  /** 执行安装 */
  const handleConfirmInstall = async () => {
    if (!confirmTarget) return;
    setConfirmAction(null);
    setInstalling(true);
    setInstallLog('');
    setInstallResult(null);
    setResultVersion('');

    try {
      const res = await window.electronAPI.openclawVersionInstall(confirmTarget);
      if (res.success) {
        setInstallResult('success');
        setResultVersion(res.version || confirmTarget);
        // 刷新当前版本和历史记录
        await fetchCurrentVersion();
        await fetchHistory();
      } else {
        // 区分超时和普通失败
        if (res.error && res.error.toLowerCase().includes('timeout')) {
          setInstallResult('timeout');
        } else {
          setInstallResult('error');
        }
      }
    } catch {
      setInstallResult('error');
    } finally {
      setInstalling(false);
    }
  };

  // ── 渲染 ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 mb-6">
      {/* 区域标题 */}
      <div className="flex items-center gap-2">
        <ArrowUpCircle size={16} style={{ color: '#818CF8' }} />
        <span
          className="text-sm font-semibold uppercase tracking-widest"
          style={{ color: '#818CF8' }}
        >
          {t('settings.advanced.versionManagement.title')}
        </span>
      </div>

      <GlassCard
        className="rounded-2xl p-5 space-y-5"
        style={{
          border: '1px solid rgba(99, 102, 241, 0.25)',
          background:
            'linear-gradient(135deg, rgba(99, 102, 241, 0.06) 0%, var(--app-bg-elevated) 100%)',
        }}
      >
        <div className="flex items-start gap-4">
          {/* 图标 */}
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: 'rgba(99, 102, 241, 0.12)', color: '#818CF8' }}
          >
            <Download size={18} />
          </div>

          <div className="flex-1 min-w-0 space-y-4">
            {/* ── 当前版本显示 ──────────────────────────────────────────── */}
            <div>
              <div
                className="text-[15px] font-semibold"
                style={{ color: 'var(--app-text)' }}
              >
                {t('settings.advanced.versionManagement.currentVersion')}
              </div>
              <div className="mt-1 text-sm" style={{ color: 'var(--app-text-muted)' }}>
                {loadingCurrent ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Loader2 size={14} className="animate-spin" />
                    {t('settings.advanced.versionManagement.loading')}
                  </span>
                ) : notDetected ? (
                  <span style={{ color: '#F59E0B' }}>
                    {t('settings.advanced.versionManagement.notDetected')}
                  </span>
                ) : (
                  <span className="font-mono font-medium" style={{ color: '#818CF8' }}>
                    v{currentVersion}
                  </span>
                )}
              </div>
            </div>

            {/* ── 可用版本下拉 + 操作按钮 ──────────────────────────────── */}
            {!notDetected && (
              <div className="space-y-3">
                {/* 版本下拉 */}
                {loadingVersions ? (
                  <div className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--app-text-muted)' }}>
                    <Loader2 size={14} className="animate-spin" />
                    {t('settings.advanced.versionManagement.loading')}
                  </div>
                ) : versionsError ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm" style={{ color: '#F87171' }}>
                      {t('settings.advanced.versionManagement.networkError')}
                    </span>
                    <AppButton
                      variant="secondary"
                      size="xs"
                      icon={<RefreshCw size={12} />}
                      onClick={() => void fetchVersions()}
                    >
                      {t('settings.advanced.versionManagement.retry')}
                    </AppButton>
                  </div>
                ) : (
                  <>
                    {/* 下拉选择器 */}
                    <div className="relative" ref={dropdownRef}>
                      <button
                        type="button"
                        disabled={installing}
                        className="w-full max-w-xs flex items-center justify-between rounded-lg px-3 py-2 text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{
                          background: 'var(--app-bg-subtle)',
                          border: '1px solid var(--app-border)',
                          color: 'var(--app-text)',
                        }}
                        onClick={() => setDropdownOpen(!dropdownOpen)}
                      >
                        <span>
                          {selectedVersion
                            ? `v${selectedVersion}${selectedVersion === currentVersion ? ' ' + t('settings.advanced.versionManagement.currentTag') : ''}`
                            : t('settings.advanced.versionManagement.selectVersion')}
                        </span>
                        <ChevronDown
                          size={14}
                          className={`transition-transform ${dropdownOpen ? 'rotate-180' : ''}`}
                          style={{ color: 'var(--app-text-muted)' }}
                        />
                      </button>

                      {/* 下拉列表 */}
                      {dropdownOpen && (
                        <div
                          className="absolute z-20 mt-1 w-full max-w-xs max-h-48 overflow-auto rounded-lg shadow-lg"
                          style={{
                            background: 'var(--app-bg-elevated)',
                            border: '1px solid var(--app-border)',
                          }}
                        >
                          {versions.map((v) => (
                            <button
                              key={v}
                              type="button"
                              className="w-full text-left px-3 py-2 text-sm cursor-pointer hover:brightness-110"
                              style={{
                                color: v === currentVersion ? '#818CF8' : 'var(--app-text)',
                                background: v === selectedVersion ? 'rgba(99, 102, 241, 0.08)' : 'transparent',
                              }}
                              onClick={() => {
                                setSelectedVersion(v);
                                setDropdownOpen(false);
                              }}
                            >
                              v{v}
                              {v === currentVersion && (
                                <span className="ml-1.5 text-xs" style={{ color: '#818CF8' }}>
                                  {t('settings.advanced.versionManagement.currentTag')}
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* 操作按钮 */}
                    <div className="flex flex-wrap gap-2">
                      {/* 升级到最新版本 */}
                      {hasUpgrade && (
                        <AppButton
                          variant="primary"
                          size="sm"
                          icon={<ArrowUpCircle size={14} />}
                          disabled={installing}
                          onClick={handleUpgradeClick}
                        >
                          {t('settings.advanced.versionManagement.upgradeToLatest').replace(
                            '{version}',
                            latestVersion!
                          )}
                        </AppButton>
                      )}

                      {/* 切换版本 */}
                      <AppButton
                        variant="secondary"
                        size="sm"
                        icon={<RefreshCw size={14} />}
                        disabled={installing || !canSwitch}
                        onClick={handleSwitchClick}
                      >
                        {t('settings.advanced.versionManagement.switchVersion')}
                      </AppButton>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── 二次确认区域（内联） ─────────────────────────────────── */}
            {confirmAction && (
              <div
                className="rounded-xl px-4 py-3 text-sm space-y-3"
                style={{
                  backgroundColor: 'rgba(99, 102, 241, 0.10)',
                  border: '1px solid rgba(99, 102, 241, 0.30)',
                  color: '#818CF8',
                }}
              >
                <div>
                  {confirmAction === 'upgrade'
                    ? t('settings.advanced.versionManagement.confirmUpgrade')
                        .replace('{from}', currentVersion || '')
                        .replace('{to}', confirmTarget)
                    : t('settings.advanced.versionManagement.confirmSwitch')
                        .replace('{from}', currentVersion || '')
                        .replace('{to}', confirmTarget)}
                </div>
                <div className="flex gap-2">
                  <AppButton
                    variant="primary"
                    size="sm"
                    icon={<Check size={14} />}
                    onClick={() => void handleConfirmInstall()}
                  >
                    {t('settings.advanced.versionManagement.confirm')}
                  </AppButton>
                  <AppButton
                    variant="secondary"
                    size="sm"
                    icon={<X size={14} />}
                    onClick={handleCancelConfirm}
                  >
                    {t('settings.advanced.versionManagement.cancel')}
                  </AppButton>
                </div>
              </div>
            )}

            {/* ── 安装进度区域 ─────────────────────────────────────────── */}
            {(installing || installLog) && (
              <div className="space-y-2">
                {installing && (
                  <div
                    className="flex items-center gap-1.5 text-sm"
                    style={{ color: '#818CF8' }}
                  >
                    <Loader2 size={14} className="animate-spin" />
                    {t('settings.advanced.versionManagement.installing')}
                  </div>
                )}
                {installLog && (
                  <pre
                    ref={logRef}
                    className="rounded-xl px-4 py-3 text-xs overflow-auto max-h-48"
                    style={{
                      backgroundColor: 'var(--app-bg-subtle)',
                      border: '1px solid var(--app-border)',
                      color: 'var(--app-text-muted)',
                      fontFamily: 'monospace',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all',
                    }}
                  >
                    {installLog}
                  </pre>
                )}
              </div>
            )}

            {/* ── 安装结果提示 ─────────────────────────────────────────── */}
            {installResult && (
              <div
                className="rounded-xl px-4 py-3 text-sm"
                style={{
                  backgroundColor:
                    installResult === 'success'
                      ? 'rgba(34, 197, 94, 0.10)'
                      : 'rgba(244, 63, 94, 0.10)',
                  border: `1px solid ${
                    installResult === 'success'
                      ? 'rgba(34, 197, 94, 0.30)'
                      : 'rgba(244, 63, 94, 0.30)'
                  }`,
                  color: installResult === 'success' ? '#4ADE80' : '#FB7185',
                }}
              >
                {installResult === 'success'
                  ? t('settings.advanced.versionManagement.installSuccess').replace(
                      '{version}',
                      resultVersion
                    )
                  : installResult === 'timeout'
                    ? t('settings.advanced.versionManagement.installTimeout')
                    : t('settings.advanced.versionManagement.installFailed')}
              </div>
            )}

            {/* ── 版本切换历史记录 ─────────────────────────────────────── */}
            {history.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--app-text)' }}>
                  <Clock size={14} style={{ color: '#818CF8' }} />
                  {t('settings.advanced.versionManagement.history')}
                </div>
                <div className="space-y-1">
                  {history.map((record, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 text-xs rounded-lg px-3 py-1.5"
                      style={{
                        backgroundColor: 'var(--app-bg-subtle)',
                        color: 'var(--app-text-muted)',
                      }}
                    >
                      <span
                        className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium"
                        style={{
                          backgroundColor:
                            record.type === 'upgrade'
                              ? 'rgba(99, 102, 241, 0.15)'
                              : 'rgba(148, 163, 184, 0.15)',
                          color:
                            record.type === 'upgrade' ? '#818CF8' : 'var(--app-text-muted)',
                        }}
                      >
                        {record.type === 'upgrade'
                          ? t('settings.advanced.versionManagement.historyUpgrade')
                          : t('settings.advanced.versionManagement.historySwitch')}
                      </span>
                      <span className="font-mono">
                        v{record.fromVersion} → v{record.toVersion}
                      </span>
                      <span className="ml-auto shrink-0">
                        {new Date(record.timestamp).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </GlassCard>
    </div>
  );
};

export default OpenClawVersionPanel;
