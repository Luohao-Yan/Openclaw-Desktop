/**
 * ImportAgentDialog — Agent 配置加密导入对话框
 *
 * 使用 AppModal 统一弹窗结构，包含 4 个视图状态：
 * - form：文件选择 + 密钥输入
 * - progress：5 步导入进度实时展示
 * - success：导入成功结果 + 后续配置引导
 * - failed：导入失败 + 回滚结果 + 重试按钮
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ImportProgress } from '../../types/electron';
import {
  Upload, Lock, FileArchive, CheckCircle, XCircle,
  Eye, EyeOff, Clock, RefreshCw, RotateCcw, Trash2,
  AlertTriangle, ArrowRight, FolderOpen,
} from 'lucide-react';
import AppButton from '../../components/AppButton';
import AppModal from '../../components/AppModal';
import { useI18n } from '../../i18n/I18nContext';

interface ImportAgentDialogProps {
  open: boolean;
  onClose: () => void;
  onImported?: (agent: any) => void;
}

/** 对话框视图状态 */
type ImportView = 'form' | 'progress' | 'success' | 'failed';

/** 导入步骤定义 */
const IMPORT_STEPS = [
  { step: 1, name: '解密验证' },
  { step: 2, name: '创建 Agent' },
  { step: 3, name: '写入配置文件' },
  { step: 4, name: '安装 Skills' },
  { step: 5, name: '配置 Channel 绑定' },
];

/** 步骤状态图标 */
function StepStatusIcon({ status }: { status: ImportProgress['status'] }) {
  switch (status) {
    case 'pending':    return <Clock className="w-4 h-4" style={{ color: 'var(--app-text-muted)' }} />;
    case 'running':    return <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />;
    case 'success':    return <CheckCircle className="w-4 h-4 text-emerald-400" />;
    case 'failed':     return <XCircle className="w-4 h-4 text-red-400" />;
    case 'rolling-back': return <RotateCcw className="w-4 h-4 animate-spin text-yellow-400" />;
    case 'rolled-back':  return <Trash2 className="w-4 h-4 text-yellow-400" />;
    default:           return <Clock className="w-4 h-4" style={{ color: 'var(--app-text-muted)' }} />;
  }
}

const ImportAgentDialog: React.FC<ImportAgentDialogProps> = ({ open, onClose, onImported }) => {
  const { t } = useI18n();
  const navigate = useNavigate();

  const [view, setView] = useState<ImportView>('form');
  const [filePath, setFilePath] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [formError, setFormError] = useState('');
  const [steps, setSteps] = useState<ImportProgress[]>(() =>
    IMPORT_STEPS.map((s) => ({ step: s.step, stepName: s.name, status: 'pending' as const })),
  );
  const [importedAgent, setImportedAgent] = useState<any>(null);
  const [failedSkills, setFailedSkills] = useState<Array<{ id: string; name: string; error: string }>>([]);
  const [failError, setFailError] = useState('');
  const [importing, setImporting] = useState(false);

  const cleanupRef = useRef<(() => void) | null>(null);
  const canImport = filePath.length > 0 && passphrase.length > 0;
  const fileName = filePath ? filePath.split(/[/\\]/).pop() || filePath : '';

  const cleanupListener = useCallback(() => {
    if (cleanupRef.current) { cleanupRef.current(); cleanupRef.current = null; }
  }, []);

  const resetSteps = useCallback(() => {
    setSteps(IMPORT_STEPS.map((s) => ({ step: s.step, stepName: s.name, status: 'pending' as const })));
  }, []);

  const resetAll = useCallback(() => {
    setView('form');
    setFilePath('');
    setPassphrase('');
    setShowPassphrase(false);
    setFormError('');
    resetSteps();
    setImportedAgent(null);
    setFailedSkills([]);
    setFailError('');
    setImporting(false);
    cleanupListener();
  }, [resetSteps, cleanupListener]);

  const handleClose = useCallback(() => {
    if (importing) return;
    resetAll();
    onClose();
  }, [importing, resetAll, onClose]);

  useEffect(() => () => cleanupListener(), [cleanupListener]);

  /** 选择 .ocagent 文件 */
  const handleSelectFile = useCallback(async () => {
    try {
      const result = await window.electronAPI.agentsSelectImportFile();
      if (result.success && result.filePath) {
        setFilePath(result.filePath);
        setFormError('');
      }
    } catch { /* 静默处理 */ }
  }, []);

  /** 执行导入 */
  const handleImport = useCallback(async () => {
    if (!canImport || importing) return;
    setImporting(true);
    setFormError('');
    resetSteps();
    cleanupListener();

    const removeListener = window.electronAPI.onImportProgress((progress: ImportProgress) => {
      setSteps((prev) => prev.map((s) => s.step === progress.step ? { ...progress } : s));
    });
    cleanupRef.current = removeListener;

    setView('progress');
    try {
      const result = await window.electronAPI.agentsImportBundle(filePath, passphrase);
      cleanupListener();
      if (result.success && result.agent) {
        setImportedAgent(result.agent);
        setFailedSkills(result.failedSkills || []);
        setView('success');
        onImported?.(result.agent);
      } else if (!result.success) {
        const isDecryptionFailure =
          result.error?.includes('decrypt') ||
          result.error?.includes('密钥') ||
          result.error?.includes('passphrase') ||
          result.error?.includes('auth tag') ||
          result.error?.includes('Unsupported state');
        if (isDecryptionFailure && !result.rolledBack) {
          setView('form');
          setFormError(result.error || '密钥错误或文件损坏，请重新输入密钥');
        } else {
          setFailError(result.error || '导入失败');
          setView('failed');
        }
      }
    } catch (err: any) {
      cleanupListener();
      setFailError(err?.message || '导入过程中发生未知错误');
      setView('failed');
    } finally {
      setImporting(false);
    }
  }, [canImport, importing, filePath, passphrase, resetSteps, cleanupListener, onImported]);

  const handleRetry = useCallback(() => {
    setView('form');
    setFormError('');
    resetSteps();
    setFailError('');
    setImportedAgent(null);
    setFailedSkills([]);
  }, [resetSteps]);

  const handleGoToConfig = useCallback(() => {
    if (importedAgent?.id) {
      resetAll();
      onClose();
      navigate(`/agent-workspace/${importedAgent.id}`);
    }
  }, [importedAgent, resetAll, onClose, navigate]);

  // 底部按钮根据视图状态切换
  const footer = (
    <>
      {view === 'form' && (
        <>
          <AppButton variant="secondary" onClick={handleClose}>取消</AppButton>
          <AppButton
            variant="primary"
            onClick={() => void handleImport()}
            disabled={!canImport || importing}
            icon={<Upload className="w-4 h-4" />}
          >
            导入
          </AppButton>
        </>
      )}
      {view === 'progress' && (
        <AppButton variant="secondary" disabled>导入中…</AppButton>
      )}
      {view === 'success' && (
        <>
          <AppButton variant="secondary" onClick={handleClose}>关闭</AppButton>
          <AppButton variant="primary" onClick={handleGoToConfig} icon={<ArrowRight className="w-4 h-4" />}>
            前往配置
          </AppButton>
        </>
      )}
      {view === 'failed' && (
        <>
          <AppButton variant="secondary" onClick={handleClose}>关闭</AppButton>
          <AppButton variant="primary" onClick={handleRetry} icon={<RefreshCw className="w-4 h-4" />}>
            重试
          </AppButton>
        </>
      )}
    </>
  );

  const importTitle = t('exchange.import.title' as any) !== 'exchange.import.title'
    ? t('exchange.import.title' as any) : '导入 Agent 配置';

  return (
    <AppModal
      open={open}
      onClose={handleClose}
      title={importTitle}
      icon={<Upload size={20} />}
      variant="success"
      disableClose={importing}
      footer={footer}
    >
      {/* form 视图：文件选择 + 密钥输入 */}
      {view === 'form' && (
        <div className="space-y-4">
          {/* 文件选择 */}
          <div className="space-y-2">
            <span className="text-sm font-medium flex items-center gap-1.5" style={{ color: 'var(--app-text)' }}>
              <FileArchive className="w-4 h-4" style={{ color: 'var(--app-text-muted)' }} />
              选择配置文件
            </span>
            <div
              className="flex items-center gap-3 rounded-xl px-4 py-3 cursor-pointer transition-token-normal hover:opacity-80"
              style={{ backgroundColor: 'var(--app-bg-subtle)', border: '1px solid var(--app-border)' }}
              onClick={() => void handleSelectFile()}
            >
              <FolderOpen className="w-5 h-5 shrink-0" style={{ color: 'var(--app-text-muted)' }} />
              {filePath ? (
                <span className="text-sm truncate flex-1" style={{ color: 'var(--app-text)' }}>{fileName}</span>
              ) : (
                <span className="text-sm flex-1" style={{ color: 'var(--app-text-muted)' }}>点击选择 .ocagent 文件</span>
              )}
            </div>
          </div>

          {/* 密钥输入 */}
          <div className="space-y-2">
            <span className="text-sm font-medium flex items-center gap-1.5" style={{ color: 'var(--app-text)' }}>
              <Lock className="w-4 h-4" style={{ color: 'var(--app-text-muted)' }} />
              解密密钥
            </span>
            <div className="relative">
              <input
                type={showPassphrase ? 'text' : 'password'}
                value={passphrase}
                onChange={(e) => { setPassphrase(e.target.value); if (formError) setFormError(''); }}
                placeholder="请输入分享者提供的解密密钥"
                className="w-full rounded-xl px-4 py-2.5 pr-10 text-sm outline-none transition-colors"
                style={{
                  backgroundColor: 'var(--app-bg-subtle)',
                  border: formError ? '1px solid rgba(239,68,68,0.5)' : '1px solid var(--app-border)',
                  color: 'var(--app-text)',
                }}
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
          </div>

          {/* 解密失败错误提示 */}
          {formError && (
            <div
              className="rounded-xl border px-4 py-3 text-xs flex items-start gap-2"
              style={{ backgroundColor: 'var(--app-toast-error-bg)', borderColor: 'var(--app-toast-error-border)', color: 'var(--app-toast-error-text)' }}
            >
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}
        </div>
      )}

      {/* progress 视图：5 步进度 */}
      {view === 'progress' && (
        <div className="space-y-1">
          {steps.map((step) => (
            <div
              key={step.step}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5"
              style={{
                backgroundColor: step.status === 'running'
                  ? 'rgba(59,130,246,0.06)'
                  : step.status === 'failed' ? 'rgba(239,68,68,0.06)' : 'transparent',
              }}
            >
              <StepStatusIcon status={step.status} />
              <span className="text-sm flex-1" style={{ color: step.status === 'pending' ? 'var(--app-text-muted)' : 'var(--app-text)' }}>
                {step.stepName}
              </span>
              {step.message && (
                <span className="text-xs truncate max-w-[40%]" style={{ color: 'var(--app-text-muted)' }} title={step.message}>
                  {step.message}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* success 视图 */}
      {view === 'success' && (
        <div className="space-y-4">
          <div
            className="rounded-xl border px-4 py-4 flex items-start gap-3"
            style={{ backgroundColor: 'var(--app-toast-success-bg)', borderColor: 'var(--app-toast-success-border)' }}
          >
            <CheckCircle className="w-5 h-5 shrink-0 mt-0.5 text-emerald-400" />
            <div className="space-y-1">
              <p className="text-sm font-semibold" style={{ color: 'var(--app-toast-success-text)' }}>导入成功</p>
              <p className="text-xs" style={{ color: 'var(--app-toast-success-text)' }}>Agent「{importedAgent?.name || '未知'}」已成功导入</p>
            </div>
          </div>

          {/* 安装失败的 Skills */}
          {failedSkills.length > 0 && (
            <div
              className="rounded-xl border px-4 py-3 space-y-2"
              style={{ backgroundColor: 'rgba(245,158,11,0.08)', borderColor: 'rgba(245,158,11,0.22)' }}
            >
              <p className="text-xs font-medium text-yellow-400">以下 Skills 安装失败，可稍后手动安装：</p>
              {failedSkills.map((skill) => (
                <div key={skill.id} className="text-xs flex items-start gap-1.5" style={{ color: 'var(--app-text-muted)' }}>
                  <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-yellow-400" />
                  <span>{skill.name}{skill.error ? ` — ${skill.error}` : ''}</span>
                </div>
              ))}
            </div>
          )}

          {/* 后续配置引导 */}
          <div
            className="rounded-xl border px-4 py-3 space-y-1.5"
            style={{ backgroundColor: 'var(--app-bg-subtle)', borderColor: 'var(--app-border)' }}
          >
            <p className="text-xs font-medium" style={{ color: 'var(--app-text)' }}>后续配置</p>
            <p className="text-xs" style={{ color: 'var(--app-text-muted)' }}>请前往 Agent 配置页面完成以下设置：</p>
            <ul className="text-xs space-y-1 pl-3" style={{ color: 'var(--app-text-muted)' }}>
              <li>• 绑定 Channel 账户（当前仅导入了绑定模板）</li>
              <li>• 配置 Model API 密钥（如需使用导入的模型配置）</li>
            </ul>
          </div>
        </div>
      )}

      {/* failed 视图 */}
      {view === 'failed' && (
        <div className="space-y-4">
          <div
            className="rounded-xl border px-4 py-4 flex items-start gap-3"
            style={{ backgroundColor: 'var(--app-toast-error-bg)', borderColor: 'var(--app-toast-error-border)' }}
          >
            <XCircle className="w-5 h-5 shrink-0 mt-0.5 text-red-400" />
            <div className="space-y-1">
              <p className="text-sm font-semibold" style={{ color: 'var(--app-toast-error-text)' }}>导入失败</p>
              <p className="text-xs" style={{ color: 'var(--app-toast-error-text)' }}>{failError}</p>
            </div>
          </div>
          <div
            className="rounded-xl border px-4 py-3 flex items-start gap-2"
            style={{ backgroundColor: 'var(--app-toast-success-bg)', borderColor: 'var(--app-toast-success-border)' }}
          >
            <CheckCircle className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
            <p className="text-xs" style={{ color: 'var(--app-toast-success-text)' }}>
              已自动清理，未影响现有配置。你可以重新输入密钥或选择其他文件后重试。
            </p>
          </div>
        </div>
      )}
    </AppModal>
  );
};

export default ImportAgentDialog;
