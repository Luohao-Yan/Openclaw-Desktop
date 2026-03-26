/**
 * GroupExportDialog — 分组批量导出对话框
 *
 * 支持：
 * - 显示分组名称和包含的 Agent 列表
 * - Passphrase 输入（最少 8 字符，显示/隐藏切换）
 * - 导出过程中显示进度条（当前 Agent 名称和序号）
 * - 导出完成后显示结果摘要（成功数量、失败列表）
 * - 取消操作
 * - 使用 AppModal、AppButton
 * - i18n 国际化
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  Download,
  Lock,
  Eye,
  EyeOff,
  CheckCircle,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import type { AgentGroup, GroupExportProgressEvent } from '../../types/electron';
import AppModal from '../AppModal';
import AppButton from '../AppButton';
import { useI18n } from '../../i18n/I18nContext';

interface GroupExportDialogProps {
  /** 是否显示 */
  open: boolean;
  /** 关闭回调 */
  onClose: () => void;
  /** 要导出的分组 */
  group: AgentGroup;
  /** 分组中的 Agent 名称列表 */
  agentNames: string[];
}

/** 导出阶段 */
type ExportPhase = 'input' | 'exporting' | 'done';

/** 导出结果 */
interface ExportResult {
  success: boolean;
  filePath?: string;
  failedAgents?: Array<{ name: string; error: string }>;
  error?: string;
}

const GroupExportDialog: React.FC<GroupExportDialogProps> = ({
  open,
  onClose,
  group,
  agentNames,
}) => {
  const { t } = useI18n();

  // 表单状态
  const [passphrase, setPassphrase] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);

  // 导出状态
  const [phase, setPhase] = useState<ExportPhase>('input');
  const [progress, setProgress] = useState<GroupExportProgressEvent | null>(null);
  const [result, setResult] = useState<ExportResult | null>(null);

  const isPassphraseValid = passphrase.length >= 8;

  /** 重置状态 */
  const resetState = useCallback(() => {
    setPassphrase('');
    setShowPassphrase(false);
    setPhase('input');
    setProgress(null);
    setResult(null);
  }, []);

  /** 关闭对话框 */
  const handleClose = useCallback(() => {
    if (phase === 'exporting') return; // 导出中不允许关闭
    resetState();
    onClose();
  }, [phase, resetState, onClose]);

  /** 监听导出进度事件 */
  useEffect(() => {
    if (!open || phase !== 'exporting') return;
    const unsubscribe = window.electronAPI.onAgentGroupsExportProgress((event) => {
      setProgress(event);
    });
    return () => unsubscribe();
  }, [open, phase]);

  /** 重置状态当对话框打开时 */
  useEffect(() => {
    if (open) resetState();
  }, [open, resetState]);

  /** 执行导出 */
  const handleExport = useCallback(async () => {
    if (!isPassphraseValid) return;
    setPhase('exporting');
    setProgress(null);
    setResult(null);

    try {
      const res = await window.electronAPI.agentGroupsExportGroup({
        groupId: group.id,
        passphrase,
      });

      setResult({
        success: res.success,
        filePath: res.filePath,
        failedAgents: res.failedAgents,
        error: res.error,
      });
    } catch (err: any) {
      setResult({
        success: false,
        error: err?.message || '导出过程中发生未知错误',
      });
    } finally {
      setPhase('done');
    }
  }, [group.id, passphrase, isPassphraseValid]);

  /** 进度百分比 */
  const progressPercent =
    progress && progress.total > 0
      ? Math.round((progress.current / progress.total) * 100)
      : 0;

  /** 成功导出的数量 */
  const successCount = result
    ? agentNames.length - (result.failedAgents?.length || 0)
    : 0;

  return (
    <AppModal
      open={open}
      onClose={handleClose}
      title={t('agentGroups.exportTitle' as any)}
      icon={<Download size={20} />}
      variant="info"
      disableClose={phase === 'exporting'}
      footer={
        phase === 'input' ? (
          <>
            <AppButton variant="secondary" onClick={handleClose}>
              {t('agentGroups.cancel' as any)}
            </AppButton>
            <AppButton
              variant="primary"
              onClick={() => void handleExport()}
              disabled={!isPassphraseValid || agentNames.length === 0}
              icon={<Download className="w-4 h-4" />}
            >
              {t('agentGroups.confirm' as any)}
            </AppButton>
          </>
        ) : phase === 'done' ? (
          <AppButton variant="secondary" onClick={handleClose}>
            {t('agentGroups.close' as any)}
          </AppButton>
        ) : undefined
      }
    >
      <div className="space-y-4">
        {/* 分组信息摘要 */}
        <div
          className="rounded-xl border px-4 py-3 space-y-2"
          style={{ backgroundColor: 'var(--app-bg-subtle)', borderColor: 'var(--app-border)' }}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs" style={{ color: 'var(--app-text-muted)' }}>
              {t('agentGroups.name' as any)}
            </span>
            <span className="text-sm font-semibold flex items-center gap-1.5" style={{ color: 'var(--app-text)' }}>
              {group.emoji && <span>{group.emoji}</span>}
              {group.color && !group.emoji && (
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: group.color }} />
              )}
              {group.name}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs" style={{ color: 'var(--app-text-muted)' }}>
              Agent
            </span>
            <span className="text-sm" style={{ color: 'var(--app-text)' }}>
              {agentNames.length}
            </span>
          </div>
        </div>

        {/* Agent 列表 */}
        {phase === 'input' && agentNames.length > 0 && (
          <div
            className="rounded-xl border px-4 py-3 max-h-32 overflow-y-auto"
            style={{ backgroundColor: 'var(--app-bg-subtle)', borderColor: 'var(--app-border)' }}
          >
            <div className="flex flex-wrap gap-1.5">
              {agentNames.map((name) => (
                <span
                  key={name}
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-xs"
                  style={{
                    backgroundColor: 'var(--app-bg-elevated)',
                    border: '1px solid var(--app-border)',
                    color: 'var(--app-text)',
                  }}
                >
                  {name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 空分组提示 */}
        {agentNames.length === 0 && phase === 'input' && (
          <div
            className="rounded-xl border px-4 py-3 text-xs flex items-center gap-2"
            style={{
              backgroundColor: 'rgba(251, 191, 36, 0.08)',
              borderColor: 'rgba(251, 191, 36, 0.2)',
              color: '#FBBF24',
            }}
          >
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {t('agentGroups.exportEmpty' as any)}
          </div>
        )}

        {/* Passphrase 输入 */}
        {phase === 'input' && (
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
        )}

        {/* 导出进度 */}
        {phase === 'exporting' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--app-text)' }}>
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--app-text-muted)' }} />
              <span>
                {t('agentGroups.exportProgress' as any)}{' '}
                {progress ? `${progress.current}/${progress.total}: ${progress.agentName}` : '...'}
              </span>
            </div>
            {/* 进度条 */}
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
          </div>
        )}

        {/* 导出结果 */}
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
                  <p className="font-medium">{t('agentGroups.exportSuccess' as any)}</p>
                  <p style={{ color: 'var(--app-text-muted)' }}>
                    {t('agentGroups.successCount' as any)}: {successCount}
                    {result.failedAgents && result.failedAgents.length > 0 && (
                      <> · {t('agentGroups.failedCount' as any)}: {result.failedAgents.length}</>
                    )}
                  </p>
                  {result.filePath && (
                    <p className="break-all" style={{ color: 'var(--app-text-muted)' }}>
                      {result.filePath}
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
                  <p className="font-medium">{t('agentGroups.exportFailed' as any)}</p>
                  <p style={{ color: 'var(--app-text-muted)' }}>{result.error}</p>
                </div>
              </div>
            )}

            {/* 失败列表 */}
            {result.failedAgents && result.failedAgents.length > 0 && (
              <div
                className="rounded-xl border px-4 py-3 space-y-1.5 max-h-28 overflow-y-auto"
                style={{ backgroundColor: 'var(--app-bg-subtle)', borderColor: 'var(--app-border)' }}
              >
                <p className="text-xs font-medium" style={{ color: '#F87171' }}>
                  {t('agentGroups.failedCount' as any)}: {result.failedAgents.length}
                </p>
                {result.failedAgents.map((fa) => (
                  <div key={fa.name} className="text-xs" style={{ color: 'var(--app-text-muted)' }}>
                    <span className="font-medium" style={{ color: 'var(--app-text)' }}>{fa.name}</span>
                    {' — '}
                    {fa.error}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </AppModal>
  );
};

export default GroupExportDialog;
export type { GroupExportDialogProps };
