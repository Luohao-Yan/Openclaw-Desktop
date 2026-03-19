import React, { useState, useCallback } from 'react';
import type { AgentInfo } from '../../../types/electron';
import {
  Download,
  Lock,
  CheckCircle,
  AlertCircle,
  X,
  Eye,
  EyeOff,
} from 'lucide-react';
import AppButton from '../../components/AppButton';
import { useI18n } from '../../i18n/I18nContext';

/**
 * 导出 Agent 配置对话框的属性接口
 */
interface ExportAgentDialogProps {
  /** 是否显示对话框 */
  open: boolean;
  /** 关闭对话框回调 */
  onClose: () => void;
  /** 要导出的 Agent 信息 */
  agent: AgentInfo;
  /** 导出成功后的回调 */
  onExported?: () => void;
}

/**
 * 导出结果状态类型
 */
type ExportResult =
  | { type: 'success'; filePath: string }
  | { type: 'error'; message: string }
  | null;

/**
 * ExportAgentDialog — Agent 配置加密导出对话框
 *
 * 用户输入 Passphrase（≥8 字符），确认后调用 IPC 导出加密的 .ocagent 文件。
 * 导出过程中显示加载状态，完成后显示成功/失败提示。
 */
const ExportAgentDialog: React.FC<ExportAgentDialogProps> = ({
  open,
  onClose,
  agent,
  onExported,
}) => {
  const { t } = useI18n();

  // ── 状态 ──────────────────────────────────────────────────────────────────
  /** 用户输入的 Passphrase */
  const [passphrase, setPassphrase] = useState('');
  /** 是否显示明文密码 */
  const [showPassphrase, setShowPassphrase] = useState(false);
  /** 是否正在导出 */
  const [loading, setLoading] = useState(false);
  /** 导出结果（成功/失败/空） */
  const [result, setResult] = useState<ExportResult>(null);

  /** Passphrase 是否满足最低长度要求 */
  const isPassphraseValid = passphrase.length >= 8;

  /**
   * 重置对话框内部状态
   */
  const resetState = useCallback(() => {
    setPassphrase('');
    setShowPassphrase(false);
    setLoading(false);
    setResult(null);
  }, []);

  /**
   * 关闭对话框并重置状态
   */
  const handleClose = useCallback(() => {
    if (loading) return; // 导出中禁止关闭
    resetState();
    onClose();
  }, [loading, resetState, onClose]);

  /**
   * 执行导出流程：
   * 1. 调用系统保存对话框选择路径
   * 2. 调用 IPC 加密导出
   * 3. 显示结果
   */
  const handleExport = useCallback(async () => {
    if (!isPassphraseValid || loading) return;

    setLoading(true);
    setResult(null);

    try {
      // 步骤 1：选择保存路径
      const pathResult = await window.electronAPI.agentsSelectExportPath(
        agent.name + '.ocagent',
      );

      // 用户取消了保存对话框
      if (!pathResult.success || !pathResult.filePath) {
        setLoading(false);
        return;
      }

      // 步骤 2：执行加密导出（传入已选择的保存路径）
      const exportResult = await window.electronAPI.agentsExportBundle(
        agent.id,
        passphrase,
        pathResult.filePath,
      );

      if (exportResult.success && exportResult.filePath) {
        // 导出成功
        setResult({ type: 'success', filePath: exportResult.filePath });
        onExported?.();
      } else {
        // 导出失败
        setResult({
          type: 'error',
          message: exportResult.error || '导出失败，请重试',
        });
      }
    } catch (err: any) {
      // 未预期的异常
      setResult({
        type: 'error',
        message: err?.message || '导出过程中发生未知错误',
      });
    } finally {
      setLoading(false);
    }
  }, [agent, passphrase, isPassphraseValid, loading, onExported]);

  // 不显示时不渲染
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ backgroundColor: 'rgba(15, 23, 42, 0.55)' }}
    >
      <div
        className="w-full max-w-md rounded-3xl border overflow-hidden"
        style={{
          backgroundColor: 'var(--app-bg-elevated)',
          borderColor: 'var(--app-border)',
          color: 'var(--app-text)',
        }}
      >
        {/* ── 头部：标题 + 关闭按钮 ──────────────────────────────────────── */}
        <div
          className="px-6 py-5 border-b flex items-center justify-between"
          style={{ borderColor: 'var(--app-border)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{ backgroundColor: 'rgba(59, 130, 246, 0.12)' }}
            >
              <Download className="w-5 h-5 text-blue-400" />
            </div>
            <h3 className="text-lg font-semibold">
              {t('exchange.export.title' as any) !== 'exchange.export.title'
                ? t('exchange.export.title' as any)
                : '导出 Agent 配置'}
            </h3>
          </div>
          <button
            onClick={handleClose}
            disabled={loading}
            className="p-1.5 rounded-lg transition-colors hover:opacity-80 disabled:opacity-40"
            style={{ color: 'var(--app-text-muted)' }}
            aria-label="关闭"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Agent 信息摘要 ─────────────────────────────────────────────── */}
        <div className="px-6 py-4 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs" style={{ color: 'var(--app-text-muted)' }}>
              {t('exchange.export.agentName' as any) !== 'exchange.export.agentName'
                ? t('exchange.export.agentName' as any)
                : '名称'}
            </span>
            <span className="text-sm font-semibold" style={{ color: 'var(--app-text)' }}>
              {agent.name}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs" style={{ color: 'var(--app-text-muted)' }}>ID</span>
            <span
              className="text-xs font-mono truncate max-w-[60%]"
              style={{ color: 'var(--app-text)' }}
            >
              {agent.id}
            </span>
          </div>
        </div>

        {/* ── 分隔线 ────────────────────────────────────────────────────── */}
        <div className="mx-6 border-t" style={{ borderColor: 'var(--app-border)' }} />

        {/* ── Passphrase 输入区域 ────────────────────────────────────────── */}
        <div className="px-6 py-4 space-y-3">
          <label className="block">
            <span className="text-sm font-medium flex items-center gap-1.5">
              <Lock className="w-4 h-4" style={{ color: 'var(--app-text-muted)' }} />
              {t('exchange.export.passphraseLabel' as any) !== 'exchange.export.passphraseLabel'
                ? t('exchange.export.passphraseLabel' as any)
                : '加密密钥'}
            </span>
            {/* 密码输入框 + 显示/隐藏切换 */}
            <div className="relative mt-2">
              <input
                type={showPassphrase ? 'text' : 'password'}
                value={passphrase}
                onChange={(e) => {
                  setPassphrase(e.target.value);
                  // 输入时清除之前的结果
                  if (result) setResult(null);
                }}
                disabled={loading}
                placeholder={
                  t('exchange.export.passphrasePlaceholder' as any) !== 'exchange.export.passphrasePlaceholder'
                    ? t('exchange.export.passphrasePlaceholder' as any)
                    : '请输入至少 8 位加密密钥'
                }
                className="w-full rounded-xl px-4 py-2.5 pr-10 text-sm outline-none transition-colors"
                style={{
                  backgroundColor: 'var(--app-bg-subtle)',
                  border: '1px solid var(--app-border)',
                  color: 'var(--app-text)',
                }}
                autoFocus
              />
              {/* 显示/隐藏密码切换按钮 */}
              <button
                type="button"
                onClick={() => setShowPassphrase((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded transition-colors hover:opacity-80"
                style={{ color: 'var(--app-text-muted)' }}
                tabIndex={-1}
                aria-label={showPassphrase ? '隐藏密钥' : '显示密钥'}
              >
                {showPassphrase ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </label>

          {/* 密钥强度提示 */}
          <p
            className="text-xs flex items-center gap-1"
            style={{
              color: passphrase.length === 0
                ? 'var(--app-text-muted)'
                : isPassphraseValid
                  ? '#10B981'
                  : '#F59E0B',
            }}
          >
            {isPassphraseValid ? (
              <CheckCircle className="w-3.5 h-3.5" />
            ) : (
              <AlertCircle className="w-3.5 h-3.5" />
            )}
            {t('exchange.export.passphraseHint' as any) !== 'exchange.export.passphraseHint'
              ? t('exchange.export.passphraseHint' as any)
              : `密钥长度至少 8 个字符（当前 ${passphrase.length} 个）`}
          </p>
        </div>

        {/* ── 导出结果提示区域 ───────────────────────────────────────────── */}
        {result && (
          <div className="px-6 pb-3">
            {result.type === 'success' ? (
              <div
                className="rounded-xl border px-4 py-3 text-xs flex items-start gap-2"
                style={{
                  backgroundColor: 'rgba(16, 185, 129, 0.08)',
                  borderColor: 'rgba(16, 185, 129, 0.22)',
                  color: '#6EE7B7',
                }}
              >
                <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-medium">
                    {t('exchange.export.successMessage' as any) !== 'exchange.export.successMessage'
                      ? t('exchange.export.successMessage' as any)
                      : '导出成功'}
                  </p>
                  <p className="break-all opacity-80">{result.filePath}</p>
                </div>
              </div>
            ) : (
              <div
                className="rounded-xl border px-4 py-3 text-xs flex items-start gap-2"
                style={{
                  backgroundColor: 'rgba(239, 68, 68, 0.08)',
                  borderColor: 'rgba(239, 68, 68, 0.22)',
                  color: '#FCA5A5',
                }}
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-medium">
                    {t('exchange.export.errorMessage' as any) !== 'exchange.export.errorMessage'
                      ? t('exchange.export.errorMessage' as any)
                      : '导出失败'}
                  </p>
                  <p className="opacity-80">{result.message}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── 底部操作按钮 ───────────────────────────────────────────────── */}
        <div
          className="px-6 py-4 border-t flex items-center justify-end gap-3"
          style={{ borderColor: 'var(--app-border)' }}
        >
          <AppButton variant="secondary" onClick={handleClose} disabled={loading}>
            {t('exchange.export.cancel' as any) !== 'exchange.export.cancel'
              ? t('exchange.export.cancel' as any)
              : '取消'}
          </AppButton>
          <AppButton
            variant="primary"
            onClick={() => void handleExport()}
            disabled={!isPassphraseValid || loading}
            icon={
              loading ? (
                <svg
                  className="w-4 h-4 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
              ) : (
                <Download className="w-4 h-4" />
              )
            }
          >
            {loading
              ? (t('exchange.export.exporting' as any) !== 'exchange.export.exporting'
                  ? t('exchange.export.exporting' as any)
                  : '导出中…')
              : (t('exchange.export.confirm' as any) !== 'exchange.export.confirm'
                  ? t('exchange.export.confirm' as any)
                  : '确认导出')}
          </AppButton>
        </div>
      </div>
    </div>
  );
};

export default ExportAgentDialog;
