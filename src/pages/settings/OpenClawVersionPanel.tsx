/**
 * OpenClawVersionPanel — OpenClaw 版本管理面板
 *
 * 嵌入「设置 → 高级」页面，放置在危险操作区域之前。
 * 功能：当前版本显示、版本下拉切换、一键升级、安装进度弹窗、历史记录。
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
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

/** 安装结果状态 */
type InstallResult = null | 'success' | 'error' | 'timeout';

const OpenClawVersionPanel: React.FC = () => {
  const { t } = useI18n();

  // 当前版本
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [loadingCurrent, setLoadingCurrent] = useState(true);
  const [notDetected, setNotDetected] = useState(false);

  // 可用版本列表
  const [versions, setVersions] = useState<string[]>([]);
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [loadingVersions, setLoadingVersions] = useState(true);
  const [versionsError, setVersionsError] = useState(false);

  // 下拉选择（默认选中当前版本）
  const [selectedVersion, setSelectedVersion] = useState<string>('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });

  // 安装弹窗状态
  const [showModal, setShowModal] = useState(false);
  const [modalAction, setModalAction] = useState<'upgrade' | 'switch'>('upgrade');
  const [modalTarget, setModalTarget] = useState('');
  const [installing, setInstalling] = useState(false);
  const [installLog, setInstallLog] = useState('');
  const [installResult, setInstallResult] = useState<InstallResult>(null);
  const [resultVersion, setResultVersion] = useState('');
  const logRef = useRef<HTMLPreElement>(null);

  // 历史记录
  const [history, setHistory] = useState<VersionHistoryRecord[]>([]);

  // ── 数据加载 ────────────────────────────────────────────────────────────────

  const fetchCurrentVersion = useCallback(async () => {
    setLoadingCurrent(true);
    setNotDetected(false);
    try {
      const res = await window.electronAPI.openclawVersionGetCurrent();
      if (res.success && res.version) {
        setCurrentVersion(res.version);
        setSelectedVersion((prev) => prev || res.version!);
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

  const fetchVersions = useCallback(async () => {
    setLoadingVersions(true);
    setVersionsError(false);
    try {
      const res = await window.electronAPI.openclawVersionListAvailable();
      if (res.success && res.versions) {
        setVersions(res.versions);
        setLatestVersion(res.latest || res.versions[0] || null);
      } else {
        setVersionsError(true);
      }
    } catch {
      setVersionsError(true);
    } finally {
      setLoadingVersions(false);
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await window.electronAPI.openclawVersionGetHistory();
      if (res.success && res.history) {
        setHistory(res.history.slice(-5).reverse());
      }
    } catch { /* 不阻断核心功能 */ }
  }, []);

  useEffect(() => {
    void fetchCurrentVersion();
    void fetchVersions();
    void fetchHistory();
  }, [fetchCurrentVersion, fetchVersions, fetchHistory]);

  // 监听安装输出
  useEffect(() => {
    if (!installing) return;
    const unsub = window.electronAPI.onOpenclawVersionInstallOutput((data: string) => {
      setInstallLog((prev) => prev + data);
      requestAnimationFrame(() => {
        logRef.current?.scrollTo(0, logRef.current.scrollHeight);
      });
    });
    return unsub;
  }, [installing]);

  // 点击外部关闭下拉（需要同时检查触发按钮和 Portal 下拉列表）
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        dropdownRef.current && !dropdownRef.current.contains(target) &&
        triggerRef.current && !triggerRef.current.contains(target)
      ) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // 打开下拉时计算位置
  useEffect(() => {
    if (dropdownOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    }
  }, [dropdownOpen]);

  // ── 操作 ────────────────────────────────────────────────────────────────────

  const hasUpgrade = currentVersion && latestVersion && latestVersion !== currentVersion;
  const canSwitch = selectedVersion && selectedVersion !== currentVersion;

  /** 打开安装弹窗 */
  const openInstallModal = (action: 'upgrade' | 'switch', target: string) => {
    setModalAction(action);
    setModalTarget(target);
    setInstallLog('');
    setInstallResult(null);
    setResultVersion('');
    setShowModal(true);
  };

  /** 执行安装 */
  const doInstall = async () => {
    if (!modalTarget) return;
    setInstalling(true);
    setInstallLog('');
    setInstallResult(null);
    try {
      const res = await window.electronAPI.openclawVersionInstall(modalTarget);
      if (res.success) {
        setInstallResult('success');
        setResultVersion(res.version || modalTarget);
        await fetchCurrentVersion();
        await fetchHistory();
      } else {
        setInstallResult(res.error?.toLowerCase().includes('timeout') ? 'timeout' : 'error');
      }
    } catch {
      setInstallResult('error');
    } finally {
      setInstalling(false);
    }
  };

  /** 关闭弹窗 */
  const closeModal = () => {
    if (installing) return;
    setShowModal(false);
  };

  // ── 渲染 ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 mb-6">
      {/* 区域标题 */}
      <div className="flex items-center gap-2">
        <ArrowUpCircle size={16} style={{ color: '#818CF8' }} />
        <span className="text-sm font-semibold uppercase tracking-widest" style={{ color: '#818CF8' }}>
          {t('settings.advanced.versionManagement.title')}
        </span>
      </div>

      <GlassCard
        className="rounded-2xl p-5 space-y-5"
        style={{
          border: '1px solid rgba(99, 102, 241, 0.25)',
          background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.06) 0%, var(--app-bg-elevated) 100%)',
        }}
      >
        <div className="flex items-start gap-4">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: 'rgba(99, 102, 241, 0.12)', color: '#818CF8' }}
          >
            <Download size={18} />
          </div>

          <div className="flex-1 min-w-0 space-y-4">
            {/* 当前版本 */}
            <div>
              <div className="text-[15px] font-semibold" style={{ color: 'var(--app-text)' }}>
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

            {/* 版本下拉 + 操作按钮 */}
            {!notDetected && (
              <div className="space-y-3">
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
                    <AppButton variant="secondary" size="xs" icon={<RefreshCw size={12} />} onClick={() => void fetchVersions()}>
                      {t('settings.advanced.versionManagement.retry')}
                    </AppButton>
                  </div>
                ) : (
                  <>
                    {/* 下拉选择器 */}
                    <div className="relative">
                      <button
                        ref={triggerRef}
                        type="button"
                        disabled={installing}
                        className="w-full max-w-sm flex items-center justify-between rounded-lg px-3 py-2 text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{ background: 'var(--app-bg-subtle)', border: '1px solid var(--app-border)', color: 'var(--app-text)' }}
                        onClick={() => setDropdownOpen(!dropdownOpen)}
                      >
                        <span className="font-mono">
                          v{selectedVersion || currentVersion || ''}
                          {(selectedVersion || currentVersion) === currentVersion && (
                            <span className="ml-1.5 text-xs font-sans" style={{ color: '#818CF8' }}>
                              {t('settings.advanced.versionManagement.currentTag')}
                            </span>
                          )}
                        </span>
                        <ChevronDown size={14} className={`transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} style={{ color: 'var(--app-text-muted)' }} />
                      </button>

                      {/* Portal 下拉列表：渲染到 body，不受父级 overflow 限制 */}
                      {dropdownOpen && createPortal(
                        <div
                          ref={dropdownRef}
                          className="overflow-y-auto rounded-lg shadow-lg"
                          style={{
                            position: 'fixed',
                            top: dropdownPos.top,
                            left: dropdownPos.left,
                            width: dropdownPos.width,
                            maxHeight: '200px',
                            zIndex: 9999,
                            background: 'var(--app-bg-elevated)',
                            border: '1px solid var(--app-border)',
                          }}
                        >
                          {versions.map((v) => (
                            <button
                              key={v}
                              type="button"
                              className="w-full text-left px-3 py-2 text-sm cursor-pointer"
                              style={{
                                color: v === currentVersion ? '#818CF8' : 'var(--app-text)',
                                background: v === selectedVersion ? 'rgba(99, 102, 241, 0.08)' : 'transparent',
                              }}
                              onMouseEnter={(e) => { (e.target as HTMLElement).style.background = 'rgba(99, 102, 241, 0.12)'; }}
                              onMouseLeave={(e) => { (e.target as HTMLElement).style.background = v === selectedVersion ? 'rgba(99, 102, 241, 0.08)' : 'transparent'; }}
                              onClick={() => { setSelectedVersion(v); setDropdownOpen(false); }}
                            >
                              <span className="font-mono">v{v}</span>
                              {v === currentVersion && (
                                <span className="ml-1.5 text-xs" style={{ color: '#818CF8' }}>
                                  {t('settings.advanced.versionManagement.currentTag')}
                                </span>
                              )}
                            </button>
                          ))}
                        </div>,
                        document.body,
                      )}
                    </div>

                    {/* 操作按钮 */}
                    <div className="flex flex-wrap gap-2">
                      {hasUpgrade && (
                        <AppButton
                          variant="primary"
                          size="sm"
                          icon={<ArrowUpCircle size={14} />}
                          disabled={installing}
                          onClick={() => openInstallModal('upgrade', latestVersion!)}
                        >
                          {t('settings.advanced.versionManagement.upgradeToLatest').replace('{version}', latestVersion!)}
                        </AppButton>
                      )}
                      <AppButton
                        variant="secondary"
                        size="sm"
                        icon={<RefreshCw size={14} />}
                        disabled={installing || !canSwitch}
                        onClick={() => openInstallModal('switch', selectedVersion)}
                      >
                        {t('settings.advanced.versionManagement.switchVersion')}
                      </AppButton>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* 历史记录 */}
            {history.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--app-text)' }}>
                  <Clock size={14} style={{ color: '#818CF8' }} />
                  {t('settings.advanced.versionManagement.history')}
                </div>
                <div className="space-y-1">
                  {history.map((record, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-xs rounded-lg px-3 py-1.5" style={{ backgroundColor: 'var(--app-bg-subtle)', color: 'var(--app-text-muted)' }}>
                      <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium" style={{
                        backgroundColor: record.type === 'upgrade' ? 'rgba(99, 102, 241, 0.15)' : 'rgba(148, 163, 184, 0.15)',
                        color: record.type === 'upgrade' ? '#818CF8' : 'var(--app-text-muted)',
                      }}>
                        {record.type === 'upgrade' ? t('settings.advanced.versionManagement.historyUpgrade') : t('settings.advanced.versionManagement.historySwitch')}
                      </span>
                      <span className="font-mono">v{record.fromVersion} → v{record.toVersion}</span>
                      <span className="ml-auto shrink-0">{new Date(record.timestamp).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </GlassCard>

      {/* ── 安装进度弹窗 ──────────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center" style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}>
          <div
            className="relative w-full max-w-lg rounded-2xl p-6 shadow-2xl space-y-4"
            style={{ background: 'var(--app-bg-elevated)', border: '1px solid var(--app-border)', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}
          >
            {/* 弹窗标题 */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ArrowUpCircle size={18} style={{ color: '#818CF8' }} />
                <span className="text-[15px] font-semibold" style={{ color: 'var(--app-text)' }}>
                  {modalAction === 'upgrade'
                    ? t('settings.advanced.versionManagement.upgradeToLatest').replace('{version}', modalTarget)
                    : `${t('settings.advanced.versionManagement.switchVersion')} → v${modalTarget}`}
                </span>
              </div>
              {!installing && (
                <button type="button" className="cursor-pointer" style={{ color: 'var(--app-text-muted)' }} onClick={closeModal}>
                  <X size={18} />
                </button>
              )}
            </div>

            {/* 确认提示（安装前） */}
            {!installing && !installResult && (
              <div className="space-y-4">
                <div className="rounded-xl px-4 py-3 text-sm" style={{ backgroundColor: 'rgba(99, 102, 241, 0.10)', border: '1px solid rgba(99, 102, 241, 0.30)', color: '#818CF8' }}>
                  {modalAction === 'upgrade'
                    ? t('settings.advanced.versionManagement.confirmUpgrade').replace('{from}', currentVersion || '').replace('{to}', modalTarget)
                    : t('settings.advanced.versionManagement.confirmSwitch').replace('{from}', currentVersion || '').replace('{to}', modalTarget)}
                </div>
                <div className="flex justify-end gap-2">
                  <AppButton variant="secondary" size="sm" icon={<X size={14} />} onClick={closeModal}>
                    {t('settings.advanced.versionManagement.cancel')}
                  </AppButton>
                  <AppButton variant="primary" size="sm" icon={<Check size={14} />} onClick={() => void doInstall()}>
                    {t('settings.advanced.versionManagement.confirm')}
                  </AppButton>
                </div>
              </div>
            )}

            {/* 安装进度 */}
            {(installing || installLog) && (
              <div className="flex-1 min-h-0 space-y-2 flex flex-col">
                {installing && (
                  <div className="flex items-center gap-1.5 text-sm shrink-0" style={{ color: '#818CF8' }}>
                    <Loader2 size={14} className="animate-spin" />
                    {t('settings.advanced.versionManagement.installing')}
                  </div>
                )}
                <pre
                  ref={logRef}
                  className="flex-1 rounded-xl px-4 py-3 text-xs overflow-auto"
                  style={{
                    backgroundColor: 'var(--app-bg-subtle)',
                    border: '1px solid var(--app-border)',
                    color: 'var(--app-text-muted)',
                    fontFamily: 'monospace',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                    minHeight: '120px',
                    maxHeight: '300px',
                  }}
                >
                  {installLog || '等待安装输出...'}
                </pre>
              </div>
            )}

            {/* 安装结果 */}
            {installResult && (
              <div className="space-y-3">
                <div
                  className="rounded-xl px-4 py-3 text-sm"
                  style={{
                    backgroundColor: installResult === 'success' ? 'rgba(34, 197, 94, 0.10)' : 'rgba(244, 63, 94, 0.10)',
                    border: `1px solid ${installResult === 'success' ? 'rgba(34, 197, 94, 0.30)' : 'rgba(244, 63, 94, 0.30)'}`,
                    color: installResult === 'success' ? '#4ADE80' : '#FB7185',
                  }}
                >
                  {installResult === 'success'
                    ? t('settings.advanced.versionManagement.installSuccess').replace('{version}', resultVersion)
                    : installResult === 'timeout'
                      ? t('settings.advanced.versionManagement.installTimeout')
                      : t('settings.advanced.versionManagement.installFailed')}
                </div>
                <div className="flex justify-end">
                  <AppButton variant="secondary" size="sm" onClick={closeModal}>
                    {t('settings.advanced.versionManagement.cancel')}
                  </AppButton>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default OpenClawVersionPanel;
