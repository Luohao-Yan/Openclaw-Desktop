import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ImportProgress } from '../../types/electron';
import {
  Upload,
  Lock,
  FileArchive,
  CheckCircle,
  XCircle,
  X,
  Eye,
  EyeOff,
  Clock,
  RefreshCw,
  RotateCcw,
  Trash2,
  AlertTriangle,
  ArrowRight,
  FolderOpen,
} from 'lucide-react';
import AppButton from '../../components/AppButton';
import { useI18n } from '../../i18n/I18nContext';

/**
 * 导入 Agent 配置对话框的属性接口
 */
interface ImportAgentDialogProps {
  /** 是否显示对话框 */
  open: boolean;
  /** 关闭对话框回调 */
  onClose: () => void;
  /** 导入成功后的回调，传入新创建的 Agent 信息 */
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

/**
 * 获取步骤状态对应的图标组件
 */
function StepStatusIcon({ status }: { status: ImportProgress['status'] }) {
  switch (status) {
    case 'pending':
      // 待处理：灰色时钟图标
      return <Clock className="w-4 h-4" style={{ color: 'var(--app-text-muted)' }} />;
    case 'running':
      // 执行中：蓝色旋转图标
      return <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />;
    case 'success':
      // 成功：绿色勾选图标
      return <CheckCircle className="w-4 h-4 text-emerald-400" />;
    case 'failed':
      // 失败：红色叉号图标
      return <XCircle className="w-4 h-4 text-red-400" />;
    case 'rolling-back':
      // 回滚中：黄色旋转图标
      return <RotateCcw className="w-4 h-4 animate-spin text-yellow-400" />;
    case 'rolled-back':
      // 已回滚：黄色清理图标
      return <Trash2 className="w-4 h-4 text-yellow-400" />;
    default:
      return <Clock className="w-4 h-4" style={{ color: 'var(--app-text-muted)' }} />;
  }
}


/**
 * ImportAgentDialog — Agent 配置加密导入对话框
 *
 * 单页模态对话框，包含 4 个视图状态：
 * - form：文件选择 + 密钥输入 + 导入按钮
 * - progress：5 步导入进度实时展示
 * - success：导入成功结果 + 后续配置引导
 * - failed：导入失败 + 回滚结果 + 重试按钮
 */
const ImportAgentDialog: React.FC<ImportAgentDialogProps> = ({
  open,
  onClose,
  onImported,
}) => {
  const { t } = useI18n();
  const navigate = useNavigate();

  // ── 状态 ──────────────────────────────────────────────────────────────────
  /** 当前视图状态 */
  const [view, setView] = useState<ImportView>('form');
  /** 选中的文件路径 */
  const [filePath, setFilePath] = useState('');
  /** 用户输入的 Passphrase */
  const [passphrase, setPassphrase] = useState('');
  /** 是否显示明文密码 */
  const [showPassphrase, setShowPassphrase] = useState(false);
  /** 表单视图中的错误提示（解密失败时使用） */
  const [formError, setFormError] = useState('');
  /** 各步骤的进度状态 */
  const [steps, setSteps] = useState<ImportProgress[]>(() =>
    IMPORT_STEPS.map((s) => ({ step: s.step, stepName: s.name, status: 'pending' as const })),
  );
  /** 导入成功后的 Agent 信息 */
  const [importedAgent, setImportedAgent] = useState<any>(null);
  /** 安装失败的 Skills 列表 */
  const [failedSkills, setFailedSkills] = useState<Array<{ id: string; name: string; error: string }>>([]);
  /** 导入失败的错误信息 */
  const [failError, setFailError] = useState('');
  /** 是否正在导入中 */
  const [importing, setImporting] = useState(false);

  /** 进度监听器清理函数引用 */
  const cleanupRef = useRef<(() => void) | null>(null);

  /** 导入按钮是否可用：文件和密钥都已填写 */
  const canImport = filePath.length > 0 && passphrase.length > 0;

  /**
   * 从文件路径中提取文件名
   */
  const fileName = filePath ? filePath.split(/[/\\]/).pop() || filePath : '';

  /**
   * 清理进度监听器
   */
  const cleanupListener = useCallback(() => {
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
  }, []);

  /**
   * 重置所有步骤为 pending 状态
   */
  const resetSteps = useCallback(() => {
    setSteps(IMPORT_STEPS.map((s) => ({ step: s.step, stepName: s.name, status: 'pending' as const })));
  }, []);

  /**
   * 完全重置对话框状态（关闭时调用）
   */
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

  /**
   * 关闭对话框
   */
  const handleClose = useCallback(() => {
    if (importing) return; // 导入中禁止关闭
    resetAll();
    onClose();
  }, [importing, resetAll, onClose]);

  /**
   * 组件卸载或对话框关闭时清理监听器
   */
  useEffect(() => {
    return () => cleanupListener();
  }, [cleanupListener]);

  /**
   * 选择 .ocagent 文件
   */
  const handleSelectFile = useCallback(async () => {
    try {
      const result = await window.electronAPI.agentsSelectImportFile();
      if (result.success && result.filePath) {
        setFilePath(result.filePath);
        // 选择新文件时清除之前的错误
        setFormError('');
      }
    } catch (err: any) {
      // 文件选择对话框异常，静默处理
    }
  }, []);

  /**
   * 执行导入流程
   */
  const handleImport = useCallback(async () => {
    if (!canImport || importing) return;

    setImporting(true);
    setFormError('');
    resetSteps();

    // 注册进度监听器
    cleanupListener();
    // onImportProgress 实际返回清理函数，但类型声明为 void，需要类型断言
    const removeListener = window.electronAPI.onImportProgress((progress: ImportProgress) => {
      setSteps((prev) =>
        prev.map((s) =>
          s.step === progress.step
            ? { ...progress }
            : s,
        ),
      );
    }) as unknown as (() => void) | undefined;
    if (removeListener) {
      cleanupRef.current = removeListener;
    }

    // 切换到进度视图
    setView('progress');

    try {
      // 调用 IPC 执行导入
      const result = await window.electronAPI.agentsImportBundle(filePath, passphrase);

      // 清理监听器
      cleanupListener();

      if (result.success && result.agent) {
        // 导入成功
        setImportedAgent(result.agent);
        setFailedSkills(result.failedSkills || []);
        setView('success');
        onImported?.(result.agent);
      } else if (!result.success) {
        // 判断是否为解密失败（Step 1 失败）
        const isDecryptionFailure =
          result.error?.includes('decrypt') ||
          result.error?.includes('密钥') ||
          result.error?.includes('passphrase') ||
          result.error?.includes('auth tag') ||
          result.error?.includes('Unsupported state');

        if (isDecryptionFailure && !result.rolledBack) {
          // 解密失败：回到 form 视图，显示错误
          setView('form');
          setFormError(result.error || '密钥错误或文件损坏，请重新输入密钥');
        } else {
          // 其他失败（含回滚）：切换到 failed 视图
          setFailError(result.error || '导入失败');
          setView('failed');
        }
      }
    } catch (err: any) {
      // 未预期的异常
      cleanupListener();
      setFailError(err?.message || '导入过程中发生未知错误');
      setView('failed');
    } finally {
      setImporting(false);
    }
  }, [canImport, importing, filePath, passphrase, resetSteps, cleanupListener, onImported]);

  /**
   * 重试导入（从 failed 视图回到 form 视图，保留文件和密钥）
   */
  const handleRetry = useCallback(() => {
    setView('form');
    setFormError('');
    resetSteps();
    setFailError('');
    setImportedAgent(null);
    setFailedSkills([]);
  }, [resetSteps]);

  /**
   * 前往 Agent 配置页面
   */
  const handleGoToConfig = useCallback(() => {
    if (importedAgent?.id) {
      resetAll();
      onClose();
      navigate(`/agent-workspace/${importedAgent.id}`);
    }
  }, [importedAgent, resetAll, onClose, navigate]);

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
              style={{ backgroundColor: 'rgba(16, 185, 129, 0.12)' }}
            >
              <Upload className="w-5 h-5 text-emerald-400" />
            </div>
            <h3 className="text-lg font-semibold">
              {t('exchange.import.title' as any) !== 'exchange.import.title'
                ? t('exchange.import.title' as any)
                : '导入 Agent 配置'}
            </h3>
          </div>
          <button
            onClick={handleClose}
            disabled={importing}
            className="p-1.5 rounded-lg transition-colors hover:opacity-80 disabled:opacity-40"
            style={{ color: 'var(--app-text-muted)' }}
            aria-label="关闭"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── 内容区域：根据视图状态切换 ─────────────────────────────────── */}
        {view === 'form' && (
          <FormView
            filePath={filePath}
            fileName={fileName}
            passphrase={passphrase}
            showPassphrase={showPassphrase}
            formError={formError}
            onSelectFile={handleSelectFile}
            onPassphraseChange={(v) => {
              setPassphrase(v);
              if (formError) setFormError('');
            }}
            onTogglePassphrase={() => setShowPassphrase((v) => !v)}
          />
        )}

        {view === 'progress' && <ProgressView steps={steps} />}

        {view === 'success' && (
          <SuccessView
            agent={importedAgent}
            failedSkills={failedSkills}
          />
        )}

        {view === 'failed' && <FailedView error={failError} />}

        {/* ── 底部操作按钮 ───────────────────────────────────────────────── */}
        <div
          className="px-6 py-4 border-t flex items-center justify-end gap-3"
          style={{ borderColor: 'var(--app-border)' }}
        >
          {view === 'form' && (
            <>
              <AppButton variant="secondary" onClick={handleClose}>
                取消
              </AppButton>
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
            <AppButton variant="secondary" disabled>
              导入中…
            </AppButton>
          )}

          {view === 'success' && (
            <>
              <AppButton variant="secondary" onClick={handleClose}>
                关闭
              </AppButton>
              <AppButton
                variant="primary"
                onClick={handleGoToConfig}
                icon={<ArrowRight className="w-4 h-4" />}
              >
                前往配置
              </AppButton>
            </>
          )}

          {view === 'failed' && (
            <>
              <AppButton variant="secondary" onClick={handleClose}>
                关闭
              </AppButton>
              <AppButton
                variant="primary"
                onClick={handleRetry}
                icon={<RefreshCw className="w-4 h-4" />}
              >
                重试
              </AppButton>
            </>
          )}
        </div>
      </div>
    </div>
  );
};


// ═══════════════════════════════════════════════════════════════════════════
// 子视图组件
// ═══════════════════════════════════════════════════════════════════════════

/**
 * FormView — 文件选择 + 密钥输入表单视图
 */
function FormView({
  filePath,
  fileName,
  passphrase,
  showPassphrase,
  formError,
  onSelectFile,
  onPassphraseChange,
  onTogglePassphrase,
}: {
  filePath: string;
  fileName: string;
  passphrase: string;
  showPassphrase: boolean;
  formError: string;
  onSelectFile: () => void;
  onPassphraseChange: (v: string) => void;
  onTogglePassphrase: () => void;
}) {
  return (
    <div className="px-6 py-4 space-y-4">
      {/* 文件选择区域 */}
      <div className="space-y-2">
        <span className="text-sm font-medium flex items-center gap-1.5">
          <FileArchive className="w-4 h-4" style={{ color: 'var(--app-text-muted)' }} />
          选择配置文件
        </span>
        <div
          className="flex items-center gap-3 rounded-xl px-4 py-3 cursor-pointer transition-colors"
          style={{
            backgroundColor: 'var(--app-bg-subtle)',
            border: '1px solid var(--app-border)',
          }}
          onClick={onSelectFile}
        >
          <FolderOpen className="w-5 h-5 shrink-0" style={{ color: 'var(--app-text-muted)' }} />
          {filePath ? (
            <span className="text-sm truncate flex-1" style={{ color: 'var(--app-text)' }}>
              {fileName}
            </span>
          ) : (
            <span className="text-sm flex-1" style={{ color: 'var(--app-text-muted)' }}>
              点击选择 .ocagent 文件
            </span>
          )}
        </div>
      </div>

      {/* Passphrase 输入区域 */}
      <div className="space-y-2">
        <span className="text-sm font-medium flex items-center gap-1.5">
          <Lock className="w-4 h-4" style={{ color: 'var(--app-text-muted)' }} />
          解密密钥
        </span>
        <div className="relative">
          <input
            type={showPassphrase ? 'text' : 'password'}
            value={passphrase}
            onChange={(e) => onPassphraseChange(e.target.value)}
            placeholder="请输入分享者提供的解密密钥"
            className="w-full rounded-xl px-4 py-2.5 pr-10 text-sm outline-none transition-colors"
            style={{
              backgroundColor: 'var(--app-bg-subtle)',
              border: formError
                ? '1px solid rgba(239, 68, 68, 0.5)'
                : '1px solid var(--app-border)',
              color: 'var(--app-text)',
            }}
          />
          {/* 显示/隐藏密码切换按钮 */}
          <button
            type="button"
            onClick={onTogglePassphrase}
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
          style={{
            backgroundColor: 'rgba(239, 68, 68, 0.08)',
            borderColor: 'rgba(239, 68, 68, 0.22)',
            color: '#FCA5A5',
          }}
        >
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{formError}</span>
        </div>
      )}
    </div>
  );
}

/**
 * ProgressView — 导入进度视图，显示 5 个步骤的实时状态
 */
function ProgressView({ steps }: { steps: ImportProgress[] }) {
  return (
    <div className="px-6 py-4">
      <div className="space-y-1">
        {steps.map((step) => (
          <div
            key={step.step}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5"
            style={{
              backgroundColor:
                step.status === 'running'
                  ? 'rgba(59, 130, 246, 0.06)'
                  : step.status === 'failed'
                    ? 'rgba(239, 68, 68, 0.06)'
                    : 'transparent',
            }}
          >
            {/* 步骤状态图标 */}
            <StepStatusIcon status={step.status} />
            {/* 步骤名称 */}
            <span
              className="text-sm flex-1"
              style={{
                color:
                  step.status === 'pending'
                    ? 'var(--app-text-muted)'
                    : 'var(--app-text)',
              }}
            >
              {step.stepName}
            </span>
            {/* 可选详情信息 */}
            {step.message && (
              <span
                className="text-xs truncate max-w-[40%]"
                style={{ color: 'var(--app-text-muted)' }}
                title={step.message}
              >
                {step.message}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * SuccessView — 导入成功视图
 * 显示 Agent 名称、failedSkills 列表、后续配置引导
 */
function SuccessView({
  agent,
  failedSkills,
}: {
  agent: any;
  failedSkills: Array<{ id: string; name: string; error: string }>;
}) {
  return (
    <div className="px-6 py-4 space-y-4">
      {/* 成功提示 */}
      <div
        className="rounded-xl border px-4 py-4 flex items-start gap-3"
        style={{
          backgroundColor: 'rgba(16, 185, 129, 0.08)',
          borderColor: 'rgba(16, 185, 129, 0.22)',
        }}
      >
        <CheckCircle className="w-5 h-5 shrink-0 mt-0.5 text-emerald-400" />
        <div className="space-y-1">
          <p className="text-sm font-semibold" style={{ color: '#6EE7B7' }}>
            导入成功
          </p>
          <p className="text-xs" style={{ color: '#6EE7B7' }}>
            Agent「{agent?.name || '未知'}」已成功导入
          </p>
        </div>
      </div>

      {/* 安装失败的 Skills 列表 */}
      {failedSkills.length > 0 && (
        <div
          className="rounded-xl border px-4 py-3 space-y-2"
          style={{
            backgroundColor: 'rgba(245, 158, 11, 0.08)',
            borderColor: 'rgba(245, 158, 11, 0.22)',
          }}
        >
          <p className="text-xs font-medium text-yellow-400">
            以下 Skills 安装失败，可稍后手动安装：
          </p>
          {failedSkills.map((skill) => (
            <div key={skill.id} className="text-xs flex items-start gap-1.5" style={{ color: 'var(--app-text-muted)' }}>
              <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-yellow-400" />
              <span>
                {skill.name}
                {skill.error ? ` — ${skill.error}` : ''}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* 后续配置引导 */}
      <div
        className="rounded-xl border px-4 py-3 space-y-1.5"
        style={{
          backgroundColor: 'var(--app-bg-subtle)',
          borderColor: 'var(--app-border)',
        }}
      >
        <p className="text-xs font-medium" style={{ color: 'var(--app-text)' }}>
          后续配置
        </p>
        <p className="text-xs" style={{ color: 'var(--app-text-muted)' }}>
          请前往 Agent 配置页面完成以下设置：
        </p>
        <ul className="text-xs space-y-1 pl-3" style={{ color: 'var(--app-text-muted)' }}>
          <li>• 绑定 Channel 账户（当前仅导入了绑定模板）</li>
          <li>• 配置 Model API 密钥（如需使用导入的模型配置）</li>
        </ul>
      </div>
    </div>
  );
}

/**
 * FailedView — 导入失败视图
 * 显示失败原因 + 安全提示
 */
function FailedView({ error }: { error: string }) {
  return (
    <div className="px-6 py-4 space-y-4">
      {/* 失败原因 */}
      <div
        className="rounded-xl border px-4 py-4 flex items-start gap-3"
        style={{
          backgroundColor: 'rgba(239, 68, 68, 0.08)',
          borderColor: 'rgba(239, 68, 68, 0.22)',
        }}
      >
        <XCircle className="w-5 h-5 shrink-0 mt-0.5 text-red-400" />
        <div className="space-y-1">
          <p className="text-sm font-semibold" style={{ color: '#FCA5A5' }}>
            导入失败
          </p>
          <p className="text-xs" style={{ color: '#FCA5A5' }}>
            {error}
          </p>
        </div>
      </div>

      {/* 安全提示：已自动清理 */}
      <div
        className="rounded-xl border px-4 py-3 flex items-start gap-2"
        style={{
          backgroundColor: 'rgba(16, 185, 129, 0.06)',
          borderColor: 'rgba(16, 185, 129, 0.18)',
        }}
      >
        <CheckCircle className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
        <p className="text-xs" style={{ color: '#6EE7B7' }}>
          已自动清理，未影响现有配置。你可以重新输入密钥或选择其他文件后重试。
        </p>
      </div>
    </div>
  );
}

export default ImportAgentDialog;
