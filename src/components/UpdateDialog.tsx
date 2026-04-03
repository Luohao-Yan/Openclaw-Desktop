import { useState, useEffect, useRef, useCallback } from 'react';
import { useI18n } from '../i18n/I18nContext';

/**
 * 弹窗状态机类型
 * - idle: 初始状态，显示版本信息和操作按钮
 * - installing: 安装中，显示进度和实时日志
 * - success: 安装成功，显示重启按钮
 * - error: 安装失败，显示错误信息和重试按钮
 */
export type UpdateDialogStatus = 'idle' | 'installing' | 'success' | 'error';

/**
 * UpdateDialog 组件 Props
 */
export interface UpdateDialogProps {
  /** 是否显示弹窗 */
  open: boolean;
  /** 关闭弹窗回调 */
  onClose: () => void;
  /** 当前版本号 */
  currentVersion: string;
  /** 最新版本号 */
  latestVersion: string;
}

/**
 * 升级弹窗组件
 * 用于展示版本更新信息，执行安装操作，显示实时安装日志
 */
export function UpdateDialog({ open, onClose, currentVersion, latestVersion }: UpdateDialogProps) {
  const { t } = useI18n();

  // 弹窗状态机
  const [status, setStatus] = useState<UpdateDialogStatus>('idle');
  // 安装日志
  const [installLog, setInstallLog] = useState<string[]>([]);
  // 错误信息
  const [errorMessage, setErrorMessage] = useState('');
  // 日志滚动区域引用
  const logContainerRef = useRef<HTMLPreElement>(null);

  // 弹窗打开时重置状态
  useEffect(() => {
    if (open) {
      setStatus('idle');
      setInstallLog([]);
      setErrorMessage('');
    }
  }, [open]);

  // 日志自动滚动到底部
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [installLog]);

  // 监听安装日志输出事件
  useEffect(() => {
    if (status !== 'installing') return;

    const unsubscribe = window.electronAPI.onOpenclawVersionInstallOutput((data: string) => {
      setInstallLog((prev) => [...prev, data]);
    });

    // 组件卸载或状态变化时取消监听
    return () => {
      unsubscribe();
    };
  }, [status]);

  // Escape 键关闭弹窗（安装中不允许关闭）
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && status !== 'installing') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, status, onClose]);

  /**
   * 执行安装操作
   * 1. 切换到 installing 状态
   * 2. 清空日志
   * 3. 调用 IPC 安装接口
   * 4. 根据结果切换到 success 或 error 状态
   */
  const handleInstall = useCallback(async () => {
    setStatus('installing');
    setInstallLog([]);
    setErrorMessage('');

    try {
      const result = await window.electronAPI.openclawVersionInstall(latestVersion);
      if (result.success) {
        setStatus('success');
      } else {
        setStatus('error');
        setErrorMessage(result.error || t('versionUpdate.installFailed'));
      }
    } catch (err) {
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : t('versionUpdate.installFailed'));
    }
  }, [latestVersion, t]);

  /**
   * 重启应用（退出后用户手动重新打开）
   */
  const handleRestart = useCallback(async () => {
    try {
      await window.electronAPI.appConfigQuit();
    } catch {
      // 静默处理退出失败
    }
  }, []);

  /**
   * 点击遮罩层关闭弹窗（安装中不允许关闭）
   */
  const handleBackdropClick = useCallback(() => {
    if (status !== 'installing') {
      onClose();
    }
  }, [status, onClose]);

  // 弹窗未打开时不渲染
  if (!open) return null;

  return (
    /* 遮罩层 */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(4px)' }}
      onClick={handleBackdropClick}
      role="presentation"
    >
      {/* 弹窗容器 */}
      <div
        className="relative w-full max-w-md rounded-2xl border shadow-2xl"
        style={{
          backgroundColor: 'var(--app-bg-elevated)',
          borderColor: 'var(--app-border)',
          color: 'var(--app-text)',
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-dialog-title"
      >
        {/* 标题栏 */}
        <div className="px-6 pt-6 pb-4">
          <h2
            id="update-dialog-title"
            className="text-lg font-semibold"
            style={{ color: 'var(--app-text)' }}
          >
            {t('versionUpdate.title')}
          </h2>
        </div>

        {/* 版本信息 */}
        <div className="px-6 pb-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span style={{ color: 'var(--app-text-muted)' }}>{t('versionUpdate.currentVersion')}</span>
            <span className="font-mono font-medium" style={{ color: 'var(--app-text)' }}>{currentVersion}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span style={{ color: 'var(--app-text-muted)' }}>{t('versionUpdate.latestVersion')}</span>
            <span className="font-mono font-medium" style={{ color: '#22C55E' }}>{latestVersion}</span>
          </div>
        </div>

        {/* 安装日志区域（仅在 installing 状态显示） */}
        {status === 'installing' && (
          <div className="px-6 pb-4">
            <div className="text-xs font-medium mb-2" style={{ color: 'var(--app-text-muted)' }}>
              {t('versionUpdate.installLog')}
            </div>
            <pre
              ref={logContainerRef}
              className="rounded-lg border p-3 text-xs font-mono overflow-auto"
              style={{
                backgroundColor: 'var(--app-bg)',
                borderColor: 'var(--app-border)',
                color: 'var(--app-text-muted)',
                maxHeight: '200px',
                minHeight: '80px',
              }}
            >
              {installLog.length > 0 ? installLog.join('\n') : '...'}
            </pre>
          </div>
        )}

        {/* 成功提示 */}
        {status === 'success' && (
          <div className="px-6 pb-4">
            <div
              className="rounded-lg border p-3 text-sm"
              style={{
                backgroundColor: 'rgba(34, 197, 94, 0.08)',
                borderColor: 'rgba(34, 197, 94, 0.2)',
                color: '#22C55E',
              }}
            >
              {t('versionUpdate.installSuccess')}
            </div>
          </div>
        )}

        {/* 错误提示 */}
        {status === 'error' && (
          <div className="px-6 pb-4">
            <div
              className="rounded-lg border p-3 text-sm"
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.08)',
                borderColor: 'rgba(239, 68, 68, 0.2)',
                color: '#EF4444',
              }}
            >
              {errorMessage || t('versionUpdate.installFailed')}
            </div>
          </div>
        )}

        {/* 操作按钮区域 */}
        <div className="px-6 pb-6 flex items-center justify-end gap-3">
          {/* idle 状态：立即升级 + 稍后再说 */}
          {status === 'idle' && (
            <>
              <button
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
                style={{
                  backgroundColor: 'transparent',
                  color: 'var(--app-text-muted)',
                  border: '1px solid var(--app-border)',
                }}
                onClick={onClose}
              >
                {t('versionUpdate.later')}
              </button>
              <button
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
                style={{
                  backgroundColor: '#22C55E',
                  color: '#fff',
                  border: 'none',
                }}
                onClick={handleInstall}
              >
                {t('versionUpdate.upgradeNow')}
              </button>
            </>
          )}

          {/* installing 状态：安装中（按钮禁用） */}
          {status === 'installing' && (
            <button
              className="px-4 py-2 rounded-lg text-sm font-medium cursor-not-allowed opacity-60"
              style={{
                backgroundColor: '#22C55E',
                color: '#fff',
                border: 'none',
              }}
              disabled
            >
              {t('versionUpdate.installing')}
            </button>
          )}

          {/* success 状态：重启应用 */}
          {status === 'success' && (
            <button
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
              style={{
                backgroundColor: '#22C55E',
                color: '#fff',
                border: 'none',
              }}
              onClick={handleRestart}
            >
              {t('versionUpdate.restartApp')}
            </button>
          )}

          {/* error 状态：重试 + 关闭 */}
          {status === 'error' && (
            <>
              <button
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
                style={{
                  backgroundColor: 'transparent',
                  color: 'var(--app-text-muted)',
                  border: '1px solid var(--app-border)',
                }}
                onClick={onClose}
              >
                {t('versionUpdate.close')}
              </button>
              <button
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
                style={{
                  backgroundColor: '#22C55E',
                  color: '#fff',
                  border: 'none',
                }}
                onClick={handleInstall}
              >
                {t('versionUpdate.retry')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default UpdateDialog;
