/**
 * GroupImportDialog — 分组批量导入对话框
 *
 * 支持：
 * - 选择 .ocgroup 文件（调用 agentGroupsPreviewImport 预览）
 * - 显示预览信息：分组名称、Agent 数量
 * - Passphrase 输入
 * - 导入过程中显示进度（监听 onAgentGroupsImportProgress）
 * - 导入完成后显示结果摘要（成功数量、失败列表、警告）
 * - 使用 AppModal、AppButton
 * - i18n 国际化
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  Upload,
  FolderOpen,
  Lock,
  Eye,
  EyeOff,
  CheckCircle,
  AlertCircle,
  Loader2,
  FileArchive,
} from 'lucide-react';
import type { GroupMetadata, GroupImportProgressEvent, GroupImportSummary } from '../../types/electron';
import AppModal from '../AppModal';
import AppButton from '../AppButton';
import { useI18n } from '../../i18n/I18nContext';

interface GroupImportDialogProps {
  /** 是否显示 */
  open: boolean;
  /** 关闭回调 */
  onClose: () => void;
  /** 导入完成回调（用于刷新列表） */
  onImported: () => void;
}

/** 导入阶段 */
type ImportPhase = 'select' | 'preview' | 'importing' | 'done';

/** 预览信息 */
interface PreviewInfo {
  filePath: string;
  groupMeta: GroupMetadata;
  agentCount: number;
}

/** 导入结果 */
interface ImportResult {
  success: boolean;
  summary?: GroupImportSummary;
  error?: string;
}

const GroupImportDialog: React.FC<GroupImportDialogProps> = ({
  open,
  onClose,
  onImported,
}) => {
  const { t } = useI18n();

  // 文件选择和预览
  const [preview, setPreview] = useState<PreviewInfo | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Passphrase
  const [passphrase, setPassphrase] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);

  // 导入状态
  const [phase, setPhase] = useState<ImportPhase>('select');
  const [progress, setProgress] = useState<GroupImportProgressEvent | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const isPassphraseValid = passphrase.length >= 8;

  /** 重置所有状态 */
  const resetState = useCallback(() => {
    setPreview(null);
    setPreviewLoading(false);
    setPreviewError(null);
    setPassphrase('');
    setShowPassphrase(false);
    setPhase('select');
    setProgress(null);
    setResult(null);
  }, []);

  /** 关闭对话框 */
  const handleClose = useCallback(() => {
    if (phase === 'importing') return; // 导入中不允许关闭
    resetState();
    onClose();
  }, [phase, resetState, onClose]);

  /** 对话框打开时重置 */
  useEffect(() => {
    if (open) resetState();
  }, [open, resetState]);

  /** 监听导入进度事件 */
  useEffect(() => {
    if (!open || phase !== 'importing') return;
    const unsubscribe = window.electronAPI.onAgentGroupsImportProgress((event) => {
      setProgress(event);
    });
    return () => unsubscribe();
  }, [open, phase]);

  /** 选择文件并预览 */
  const handleSelectFile = useCallback(async () => {
    setPreviewLoading(true);
    setPreviewError(null);

    try {
      // 调用系统文件选择对话框
      const fileResult = await window.electronAPI.agentsSelectImportFile();
      if (!fileResult.success || !fileResult.filePath) {
        setPreviewLoading(false);
        return;
      }

      // 预览文件内容
      const previewResult = await window.electronAPI.agentGroupsPreviewImport(fileResult.filePath);
      if (previewResult.success && previewResult.groupMeta) {
        setPreview({
          filePath: fileResult.filePath,
          groupMeta: previewResult.groupMeta,
          agentCount: previewResult.agentCount || 0,
        });
        setPhase('preview');
      } else {
        setPreviewError(previewResult.error || '无法解析文件');
      }
    } catch (err: any) {
      setPreviewError(err?.message || '文件选择失败');
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  /** 执行导入 */
  const handleImport = useCallback(async () => {
    if (!preview || !isPassphraseValid) return;
    setPhase('importing');
    setProgress(null);
    setResult(null);

    try {
      const res = await window.electronAPI.agentGroupsImportGroup({
        filePath: preview.filePath,
        passphrase,
      });

      setResult({
        success: res.success,
        summary: res.summary,
        error: res.error,
      });

      if (res.success) {
        onImported();
      }
    } catch (err: any) {
      setResult({
        success: false,
        error: err?.message || '导入过程中发生未知错误',
      });
    } finally {
      setPhase('done');
    }
  }, [preview, passphrase, isPassphraseValid, onImported]);

  /** 进度百分比 */
  const progressPercent =
    progress && progress.total > 0
      ? Math.round((progress.current / progress.total) * 100)
      : 0;

  /** 根据阶段渲染底部按钮 */
  const renderFooter = () => {
    if (phase === 'select') {
      return (
        <AppButton variant="secondary" onClick={handleClose}>
          {t('agentGroups.cancel' as any)}
        </AppButton>
      );
    }
    if (phase === 'preview') {
      return (
        <>
          <AppButton variant="secondary" onClick={handleClose}>
            {t('agentGroups.cancel' as any)}
          </AppButton>
          <AppButton
            variant="primary"
            onClick={() => void handleImport()}
            disabled={!isPassphraseValid}
            icon={<Upload className="w-4 h-4" />}
          >
            {t('agentGroups.confirmImport' as any)}
          </AppButton>
        </>
      );
    }
    if (phase === 'done') {
      return (
        <AppButton variant="secondary" onClick={handleClose}>
          {t('agentGroups.close' as any)}
        </AppButton>
      );
    }
    return undefined; // 导入中不显示按钮
  };

  return (
    <AppModal
      open={open}
      onClose={handleClose}
      title={t('agentGroups.importTitle' as any)}
      icon={<Upload size={20} />}
      variant="info"
      disableClose={phase === 'importing'}
      footer={renderFooter()}
    >
      <div className="space-y-4">
        {/* 文件选择阶段 */}
        {phase === 'select' && (
          <div className="space-y-3">
            {/* 选择文件按钮 */}
            <button
              type="button"
              className="w-full flex flex-col items-center justify-center gap-2 py-8 rounded-xl border-2 border-dashed transition-colors"
              style={{
                borderColor: 'var(--app-border)',
                color: 'var(--app-text-muted)',
                backgroundColor: 'transparent',
                cursor: 'pointer',
              }}
              onClick={() => void handleSelectFile()}
              disabled={previewLoading}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = 'var(--app-active-border, var(--app-border))';
                (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--app-bg-subtle)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = 'var(--app-border)';
                (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
              }}
            >
              {previewLoading ? (
                <Loader2 className="w-8 h-8 animate-spin" />
              ) : (
                <FolderOpen className="w-8 h-8" />
              )}
              <span className="text-sm">
                {previewLoading ? '...' : '.ocgroup'}
              </span>
            </button>

            {/* 预览错误 */}
            {previewError && (
              <div
                className="rounded-xl border px-4 py-3 text-xs flex items-start gap-2"
                style={{
                  backgroundColor: 'rgba(239, 68, 68, 0.08)',
                  borderColor: 'rgba(239, 68, 68, 0.2)',
                  color: '#F87171',
                }}
              >
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{previewError}</span>
              </div>
            )}
          </div>
        )}

        {/* 预览阶段 */}
        {phase === 'preview' && preview && (
          <div className="space-y-4">
            {/* 文件预览信息 */}
            <div
              className="rounded-xl border px-4 py-3 space-y-2"
              style={{ backgroundColor: 'var(--app-bg-subtle)', borderColor: 'var(--app-border)' }}
            >
              <div className="flex items-center gap-2 mb-2">
                <FileArchive size={16} style={{ color: 'var(--app-text-muted)' }} />
                <span className="text-xs truncate" style={{ color: 'var(--app-text-muted)' }}>
                  {preview.filePath.split(/[/\\]/).pop()}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: 'var(--app-text-muted)' }}>
                  {t('agentGroups.importGroupName' as any)}
                </span>
                <span className="text-sm font-semibold flex items-center gap-1.5" style={{ color: 'var(--app-text)' }}>
                  {preview.groupMeta.emoji && <span>{preview.groupMeta.emoji}</span>}
                  {preview.groupMeta.color && !preview.groupMeta.emoji && (
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: preview.groupMeta.color }} />
                  )}
                  {preview.groupMeta.name}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: 'var(--app-text-muted)' }}>
                  {t('agentGroups.importAgentCount' as any)}
                </span>
                <span className="text-sm" style={{ color: 'var(--app-text)' }}>
                  {preview.agentCount}
                </span>
              </div>
            </div>

            {/* Passphrase 输入 */}
            <div className="space-y-2">
              <label
                className="text-sm font-medium flex items-center gap-1.5"
                style={{ color: 'var(--app-text)' }}
              >
                <Lock className="w-4 h-4" style={{ color: 'var(--app-text-muted)' }} />
                {t('agentGroups.passphraseInput' as any)}
              </label>
              <div className="relative">
                <input
                  type={showPassphrase ? 'text' : 'password'}
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  placeholder={t('agentGroups.passphraseInput' as any)}
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
                >
                  {showPassphrase ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {/* 密钥长度提示 */}
              <p
                className="text-xs flex items-center gap-1"
                style={{
                  color:
                    passphrase.length === 0
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
                {`≥ 8 (${passphrase.length})`}
              </p>
            </div>
          </div>
        )}

        {/* 导入进度 */}
        {phase === 'importing' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--app-text)' }}>
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--app-text-muted)' }} />
              <span>
                {t('agentGroups.importProgress' as any)}{' '}
                {progress
                  ? `${progress.current}/${progress.total}: ${progress.agentName}`
                  : '...'}
              </span>
            </div>
            {/* 整体进度条 */}
            <div
              className="w-full h-2 rounded-full overflow-hidden"
              style={{ backgroundColor: 'var(--app-bg-subtle)' }}
            >
              <div
                className="h-full rounded-full transition-token-normal"
                style={{
                  width: `${progressPercent}%`,
                  backgroundColor: '#818CF8',
                }}
              />
            </div>
            {/* 当前 Agent 步骤信息 */}
            {progress && (
              <p className="text-xs" style={{ color: 'var(--app-text-muted)' }}>
                {progress.stepName}
                {progress.message && ` — ${progress.message}`}
              </p>
            )}
          </div>
        )}

        {/* 导入结果 */}
        {phase === 'done' && result && (
          <div className="space-y-3">
            {result.success ? (
              <div
                className="rounded-xl border px-4 py-3 text-xs flex items-start gap-2"
                style={{
                  backgroundColor: 'rgba(16, 185, 129, 0.08)',
                  borderColor: 'rgba(16, 185, 129, 0.2)',
                  color: '#34D399',
                }}
              >
                <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-medium">{t('agentGroups.importSuccess' as any)}</p>
                  {result.summary && (
                    <p style={{ color: 'var(--app-text-muted)' }}>
                      {t('agentGroups.successCount' as any)}: {result.summary.successCount}
                      {result.summary.failedAgents.length > 0 && (
                        <> · {t('agentGroups.failedCount' as any)}: {result.summary.failedAgents.length}</>
                      )}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div
                className="rounded-xl border px-4 py-3 text-xs flex items-start gap-2"
                style={{
                  backgroundColor: 'rgba(239, 68, 68, 0.08)',
                  borderColor: 'rgba(239, 68, 68, 0.2)',
                  color: '#F87171',
                }}
              >
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-medium">{t('agentGroups.importFailed' as any)}</p>
                  <p style={{ color: 'var(--app-text-muted)' }}>{result.error}</p>
                </div>
              </div>
            )}

            {/* 失败列表 */}
            {result.summary && result.summary.failedAgents.length > 0 && (
              <div
                className="rounded-xl border px-4 py-3 space-y-1.5 max-h-28 overflow-y-auto"
                style={{ backgroundColor: 'var(--app-bg-subtle)', borderColor: 'var(--app-border)' }}
              >
                <p className="text-xs font-medium" style={{ color: '#F87171' }}>
                  {t('agentGroups.failedCount' as any)}: {result.summary.failedAgents.length}
                </p>
                {result.summary.failedAgents.map((fa) => (
                  <div key={fa.name} className="text-xs" style={{ color: 'var(--app-text-muted)' }}>
                    <span className="font-medium" style={{ color: 'var(--app-text)' }}>{fa.name}</span>
                    {' — '}
                    {fa.error}
                  </div>
                ))}
              </div>
            )}

            {/* 警告信息 */}
            {result.summary && result.summary.warnings.length > 0 && (
              <div
                className="rounded-xl border px-4 py-3 space-y-1 max-h-20 overflow-y-auto"
                style={{
                  backgroundColor: 'rgba(251, 191, 36, 0.08)',
                  borderColor: 'rgba(251, 191, 36, 0.2)',
                }}
              >
                {result.summary.warnings.map((w, i) => (
                  <p key={i} className="text-xs" style={{ color: '#FBBF24' }}>
                    {w}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </AppModal>
  );
};

export default GroupImportDialog;
export type { GroupImportDialogProps };
