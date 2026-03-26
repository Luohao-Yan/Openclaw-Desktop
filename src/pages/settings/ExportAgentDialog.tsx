/**
 * ExportAgentDialog — Agent 配置加密导出对话框
 *
 * 使用 AppModal 统一弹窗结构。
 * 用户输入 Passphrase（≥8 字符），确认后调用 IPC 导出加密的 .ocagent 文件。
 */
import React, { useState, useCallback } from 'react';
import type { AgentInfo } from '../../../types/electron';
import { Download, Lock, CheckCircle, AlertCircle, Eye, EyeOff } from 'lucide-react';
import AppButton from '../../components/AppButton';
import AppModal from '../../components/AppModal';
import { useI18n } from '../../i18n/I18nContext';

interface ExportAgentDialogProps {
  open: boolean;
  onClose: () => void;
  agent: AgentInfo;
  onExported?: () => void;
}

/** 导出结果状态类型 */
type ExportResult =
  | { type: 'success'; filePath: string }
  | { type: 'error'; message: string }
  | null;

const ExportAgentDialog: React.FC<ExportAgentDialogProps> = ({
  open,
  onClose,
  agent,
  onExported,
}) => {
  const { t } = useI18n();

  const [passphrase, setPassphrase] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ExportResult>(null);

  const isPassphraseValid = passphrase.length >= 8;

  /** 重置并关闭 */
  const handleClose = useCallback(() => {
    if (loading) return;
    setPassphrase('');
    setShowPassphrase(false);
    setLoading(false);
    setResult(null);
    onClose();
  }, [loading, onClose]);

  /** 执行导出 */
  const handleExport = useCallback(async () => {
    if (!isPassphraseValid || loading) return;
    setLoading(true);
    setResult(null);
    try {
      // 步骤1：选择保存路径
      const pathResult = await window.electronAPI.agentsSelectExportPath(agent.name + '.ocagent');
      if (!pathResult.success || !pathResult.filePath) {
        setLoading(false);
        return;
      }
      // 步骤2：执行加密导出
      const exportResult = await window.electronAPI.agentsExportBundle(
        agent.id, passphrase, pathResult.filePath,
      );
      if (exportResult.success && exportResult.filePath) {
        setResult({ type: 'success', filePath: exportResult.filePath });
        onExported?.();
      } else {
        setResult({ type: 'error', message: exportResult.error || '导出失败，请重试' });
      }
    } catch (err: any) {
      setResult({ type: 'error', message: err?.message || '导出过程中发生未知错误' });
    } finally {
      setLoading(false);
    }
  }, [agent, passphrase, isPassphraseValid, loading, onExported]);

  const exportTitle = t('exchange.export.title' as any) !== 'exchange.export.title'
    ? t('exchange.export.title' as any) : '导出 Agent 配置';

  return (
    <AppModal
      open={open}
      onClose={handleClose}
      title={exportTitle}
      icon={<Download size={20} />}
      variant="info"
      disableClose={loading}
      footer={
        <>
          <AppButton variant="secondary" onClick={handleClose} disabled={loading}>
            {t('exchange.export.cancel' as any) !== 'exchange.export.cancel'
              ? t('exchange.export.cancel' as any) : '取消'}
          </AppButton>
          <AppButton
            variant="primary"
            onClick={() => void handleExport()}
            disabled={!isPassphraseValid || loading}
            loading={loading}
            icon={<Download className="w-4 h-4" />}
          >
            {t('exchange.export.confirm' as any) !== 'exchange.export.confirm'
              ? t('exchange.export.confirm' as any) : '确认导出'}
          </AppButton>
        </>
      }
    >
      <div className="space-y-4">
        {/* Agent 信息摘要 */}
        <div
          className="rounded-xl border px-4 py-3 space-y-2"
          style={{ backgroundColor: 'var(--app-bg-subtle)', borderColor: 'var(--app-border)' }}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs" style={{ color: 'var(--app-text-muted)' }}>名称</span>
            <span className="text-sm font-semibold" style={{ color: 'var(--app-text)' }}>{agent.name}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs" style={{ color: 'var(--app-text-muted)' }}>ID</span>
            <span className="text-xs font-mono truncate max-w-[60%]" style={{ color: 'var(--app-text)' }}>{agent.id}</span>
          </div>
        </div>

        {/* Passphrase 输入 */}
        <div className="space-y-2">
          <label className="text-sm font-medium flex items-center gap-1.5" style={{ color: 'var(--app-text)' }}>
            <Lock className="w-4 h-4" style={{ color: 'var(--app-text-muted)' }} />
            加密密钥
          </label>
          <div className="relative">
            <input
              type={showPassphrase ? 'text' : 'password'}
              value={passphrase}
              onChange={(e) => { setPassphrase(e.target.value); if (result) setResult(null); }}
              disabled={loading}
              placeholder="请输入至少 8 位加密密钥"
              className="w-full rounded-xl px-4 py-2.5 pr-10 text-sm outline-none transition-colors"
              style={{
                backgroundColor: 'var(--app-bg-subtle)',
                border: '1px solid var(--app-border)',
                color: 'var(--app-text)',
              }}
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowPassphrase((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded transition-colors hover:opacity-80"
              style={{ color: 'var(--app-text-muted)' }}
              tabIndex={-1}
              aria-label={showPassphrase ? '隐藏密钥' : '显示密钥'}
            >
              {showPassphrase ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {/* 密钥强度提示 */}
          <p
            className="text-xs flex items-center gap-1"
            style={{
              color: passphrase.length === 0
                ? 'var(--app-text-muted)'
                : isPassphraseValid ? '#10B981' : '#F59E0B',
            }}
          >
            {isPassphraseValid
              ? <CheckCircle className="w-3.5 h-3.5" />
              : <AlertCircle className="w-3.5 h-3.5" />}
            {`密钥长度至少 8 个字符（当前 ${passphrase.length} 个）`}
          </p>
        </div>

        {/* 导出结果提示 */}
        {result && (
          result.type === 'success' ? (
            <div
              className="rounded-xl border px-4 py-3 text-xs flex items-start gap-2"
              style={{ backgroundColor: 'var(--app-toast-success-bg)', borderColor: 'var(--app-toast-success-border)', color: 'var(--app-toast-success-text)' }}
            >
              <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-medium">导出成功</p>
                <p className="break-all opacity-80">{result.filePath}</p>
              </div>
            </div>
          ) : (
            <div
              className="rounded-xl border px-4 py-3 text-xs flex items-start gap-2"
              style={{ backgroundColor: 'var(--app-toast-error-bg)', borderColor: 'var(--app-toast-error-border)', color: 'var(--app-toast-error-text)' }}
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-medium">导出失败</p>
                <p className="opacity-80">{result.message}</p>
              </div>
            </div>
          )
        )}
      </div>
    </AppModal>
  );
};

export default ExportAgentDialog;
