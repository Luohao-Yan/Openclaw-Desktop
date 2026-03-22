/**
 * CreateAgentWizard - 多步骤智能体创建向导
 * 四步流程：基础信息 → 模板选择 → Identity 配置 → 确认创建
 * 复用现有 IPC 接口，新增 agents:updateIdentity 用于写入 Identity
 */
import React, { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Plus, Check, AlertCircle, Loader2, FileText, Palette, Smile, Image } from 'lucide-react';
import type { AgentInfo } from '../../../types/electron';
import AppButton from '../../components/AppButton';
import AppModal from '../../components/AppModal';
import AppSelect from '../../components/AppSelect';
import type { TranslationKey } from '../../i18n/I18nContext';
import { useI18n } from '../../i18n/I18nContext';
import {
  validateBasicInfo,
  generateWorkspacePath,
  getStepStatus,
  getDefaultSelectedFiles,
  filterEmptyIdentityFields,
  shouldSkipIdentityWrite,
} from '../../utils/agentCreation';

// ── 类型定义 ──────────────────────────────────────────────────────────

/** 向导表单状态 */
interface WizardFormData {
  name: string;
  workspace: string;
  model: string;
  templateMode: 'blank' | 'copy';
  templateSourceAgentId: string;
  selectedFiles: string[];
  identity: {
    name: string;
    theme: string;
    emoji: string;
    avatar: string;
  };
}

/** 创建执行进度 */
interface CreationProgress {
  stage: 'creating' | 'copying-templates' | 'initializing-files' | 'writing-identity' | 'done' | 'error';
  error?: string;
  skippedFiles?: string[];
}

/** 组件 Props */
interface CreateAgentWizardProps {
  open: boolean;
  onClose: () => void;
  agents: AgentInfo[];
  availableModels: { label: string; value: string; description?: string }[];
  onCreated: (agent: AgentInfo) => void;
}

// ── 常量 ──────────────────────────────────────────────────────────────

/** 智能体名称正则：仅允许 ASCII 字母、数字、连字符、下划线 */
const AGENT_NAME_REGEX = /^[a-zA-Z0-9_-]+$/;

/** Workspace 核心文件默认模板 */
const DEFAULT_WORKSPACE_TEMPLATES: Record<string, string> = {
  'AGENTS.md': '# Agents\n\n定义此 Agent 可调用的子智能体列表。\n',
  'SOUL.md': '# Soul\n\n定义此 Agent 的人格特征和行为准则。\n',
  'USER.md': '# User\n\n描述此 Agent 服务的用户画像和偏好。\n',
  'TOOLS.md': '# Tools\n\n列出此 Agent 可使用的工具和技能。\n',
  'IDENTITY.md': '# Identity\n\n此 Agent 的身份标识信息。\n',
};

/** 所有核心文件名列表 */
const CORE_FILES = Object.keys(DEFAULT_WORKSPACE_TEMPLATES);

/** 预设主题色 */
const PRESET_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
  '#8B5CF6', '#EC4899', '#06B6D4', '#F97316',
];

/** 表单初始值 */
const INITIAL_FORM: WizardFormData = {
  name: '',
  workspace: '',
  model: '',
  templateMode: 'blank',
  templateSourceAgentId: '',
  selectedFiles: [],
  identity: { name: '', theme: '', emoji: '', avatar: '' },
};

// ── 步骤指示器组件 ──────────────────────────────────────────────────

/** 向导步骤指示器，水平排列四步标签 */
function WizardStepIndicator({ currentStep, steps }: { currentStep: number; steps: { label: string; key: string }[] }) {
  return (
    <div className="flex items-center gap-1 px-6 py-3" style={{ borderBottom: '1px solid var(--app-border)' }}>
      {steps.map((step, idx) => {
        const status = getStepStatus(idx, currentStep);
        return (
          <React.Fragment key={step.key}>
            {idx > 0 && (
              <div className="flex-1 h-px mx-2" style={{ backgroundColor: status === 'upcoming' ? 'var(--app-border)' : 'var(--app-accent, #3B82F6)' }} />
            )}
            <div className="flex items-center gap-2">
              {/* 步骤编号圆圈 */}
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium shrink-0"
                style={
                  status === 'completed'
                    ? { backgroundColor: 'var(--app-accent, #3B82F6)', color: '#fff' }
                    : status === 'current'
                      ? { backgroundColor: 'var(--app-accent, #3B82F6)', color: '#fff' }
                      : { backgroundColor: 'var(--app-bg-subtle)', color: 'var(--app-text-muted)' }
                }
              >
                {status === 'completed' ? <Check className="w-3.5 h-3.5" /> : idx + 1}
              </div>
              {/* 步骤标签 */}
              <span
                className="text-sm font-medium whitespace-nowrap"
                style={{ color: status === 'upcoming' ? 'var(--app-text-muted)' : 'var(--app-text)' }}
              >
                {step.label}
              </span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ── BasicInfoStep 组件 ──────────────────────────────────────────────

/** 步骤 1：基础信息（名称、workspace、模型） */
function BasicInfoStep({
  form, setForm, errors, availableModels, t,
}: {
  form: WizardFormData;
  setForm: React.Dispatch<React.SetStateAction<WizardFormData>>;
  errors: Record<string, string>;
  availableModels: { label: string; value: string; description?: string }[];
  t: (key: TranslationKey) => string;
}) {
  return (
    <div className="space-y-4">
      {/* 名称输入 */}
      <div>
        <div className="text-sm mb-2" style={{ color: 'var(--app-text-muted)' }}>{t('agent.nameLabel')}</div>
        <input
          value={form.name}
          onChange={(e) => {
            const name = e.target.value;
            setForm((prev) => ({
              ...prev,
              name,
              // 自动生成 workspace 路径（仅当用户未手动修改时）
              workspace:
                prev.workspace === '' || prev.workspace === generateWorkspacePath(prev.name)
                  ? name ? generateWorkspacePath(name) : ''
                  : prev.workspace,
              // 同步 identity 显示名称默认值
              identity: prev.identity.name === prev.name || prev.identity.name === ''
                ? { ...prev.identity, name }
                : prev.identity,
            }));
          }}
          className="w-full rounded-xl px-4 py-3 outline-none"
          style={{
            backgroundColor: 'var(--app-bg)',
            border: `1px solid ${errors.name ? 'rgba(239, 68, 68, 0.6)' : 'var(--app-border)'}`,
            color: 'var(--app-text)',
          }}
          placeholder="例如：data-analyst"
        />
        {errors.name ? (
          <div className="text-xs mt-1.5 text-red-500">{errors.name}</div>
        ) : (
          <div className="text-xs mt-1.5" style={{ color: 'var(--app-text-muted)' }}>{t('agent.nameHint')}</div>
        )}
      </div>

      {/* Workspace 路径 */}
      <div>
        <div className="text-sm mb-2" style={{ color: 'var(--app-text-muted)' }}>Workspace 路径</div>
        <input
          value={form.workspace}
          onChange={(e) => setForm((prev) => ({ ...prev, workspace: e.target.value }))}
          className="w-full rounded-xl px-4 py-3 outline-none"
          style={{
            backgroundColor: 'var(--app-bg)',
            border: `1px solid ${errors.workspace ? 'rgba(239, 68, 68, 0.6)' : 'var(--app-border)'}`,
            color: 'var(--app-text)',
          }}
          placeholder="例如：~/.openclaw/workspace-data-analyst"
        />
        {errors.workspace && <div className="text-xs mt-1.5 text-red-500">{errors.workspace}</div>}
      </div>

      {/* 模型选择 */}
      <div>
        <div className="text-sm mb-2" style={{ color: 'var(--app-text-muted)' }}>{t('agent.modelLabel')}</div>
        <AppSelect
          options={availableModels}
          value={form.model}
          onChange={(val) => setForm((prev) => ({ ...prev, model: val as string }))}
          placeholder={t('agent.modelPlaceholder')}
          searchPlaceholder={t('agent.modelSearchPlaceholder')}
          emptyText={t('agent.modelEmpty')}
          size="md"
        />
        <div className="text-xs mt-1.5" style={{ color: 'var(--app-text-muted)' }}>{t('agent.modelHint')}</div>
      </div>
    </div>
  );
}

// ── TemplateStep 组件 ──────────────────────────────────────────────

/** 步骤 2：模板选择（从空白开始 / 从现有 Agent 复制） */
function TemplateStep({
  form, setForm, agents, t,
}: {
  form: WizardFormData;
  setForm: React.Dispatch<React.SetStateAction<WizardFormData>>;
  agents: AgentInfo[];
  t: (key: TranslationKey) => string;
}) {
  // 源 Agent 的文件存在状态
  const [fileStatus, setFileStatus] = useState<Record<string, boolean>>({});
  const [loadingFiles, setLoadingFiles] = useState(false);

  // 当选择模板来源 Agent 时，加载其 workspace 文件状态
  useEffect(() => {
    if (form.templateMode !== 'copy' || !form.templateSourceAgentId) return;
    let cancelled = false;
    setLoadingFiles(true);
    window.electronAPI.agentsGetWorkspaceDetails(form.templateSourceAgentId).then((res) => {
      if (cancelled) return;
      if (res.success && res.details) {
        const status: Record<string, boolean> = {};
        for (const f of res.details.files || []) {
          status[f.name] = f.exists;
        }
        setFileStatus(status);
      }
      setLoadingFiles(false);
    }).catch(() => { if (!cancelled) setLoadingFiles(false); });
    return () => { cancelled = true; };
  }, [form.templateSourceAgentId, form.templateMode]);

  // Agent 下拉选项
  const agentOptions = agents.map((a) => ({ label: `${a.name} (${a.id})`, value: a.id }));

  return (
    <div className="space-y-4">
      {/* 模式选择 */}
      <div className="flex gap-3">
        {(['blank', 'copy'] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => {
              setForm((prev) => ({
                ...prev,
                templateMode: mode,
                ...(mode === 'blank' ? { templateSourceAgentId: '', selectedFiles: [] } : {}),
              }));
            }}
            className="flex-1 rounded-xl px-4 py-3 text-sm font-medium transition-colors"
            style={{
              backgroundColor: form.templateMode === mode ? 'rgba(59, 130, 246, 0.12)' : 'var(--app-bg)',
              border: `1px solid ${form.templateMode === mode ? 'rgba(59, 130, 246, 0.4)' : 'var(--app-border)'}`,
              color: form.templateMode === mode ? 'var(--app-accent, #3B82F6)' : 'var(--app-text)',
            }}
          >
            {mode === 'blank' ? t('agent.wizard.templateBlank') : t('agent.wizard.templateCopy')}
          </button>
        ))}
      </div>

      {/* 复制模式：选择源 Agent 和文件 */}
      {form.templateMode === 'copy' && (
        <div className="space-y-4">
          <div>
            <div className="text-sm mb-2" style={{ color: 'var(--app-text-muted)' }}>{t('agent.wizard.templateSource')}</div>
            <AppSelect
              options={agentOptions}
              value={form.templateSourceAgentId}
              onChange={(val) => {
                setForm((prev) => ({
                  ...prev,
                  templateSourceAgentId: val as string,
                  selectedFiles: getDefaultSelectedFiles(),
                }));
              }}
              placeholder="选择一个 Agent"
              size="md"
            />
          </div>

          {/* 文件勾选列表 */}
          {form.templateSourceAgentId && (
            <div>
              <div className="text-sm mb-2" style={{ color: 'var(--app-text-muted)' }}>{t('agent.wizard.templateFiles')}</div>
              {loadingFiles ? (
                <div className="flex items-center gap-2 py-3" style={{ color: 'var(--app-text-muted)' }}>
                  <Loader2 className="w-4 h-4 animate-spin" /> 加载中...
                </div>
              ) : (
                <div className="space-y-1">
                  {CORE_FILES.map((fileName) => {
                    const exists = fileStatus[fileName] ?? false;
                    const checked = form.selectedFiles.includes(fileName);
                    return (
                      <label
                        key={fileName}
                        className="flex items-center gap-3 rounded-lg px-3 py-2 cursor-pointer transition-colors"
                        style={{ backgroundColor: checked ? 'rgba(59, 130, 246, 0.06)' : 'transparent' }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setForm((prev) => ({
                              ...prev,
                              selectedFiles: e.target.checked
                                ? [...prev.selectedFiles, fileName]
                                : prev.selectedFiles.filter((f) => f !== fileName),
                            }));
                          }}
                          className="rounded"
                        />
                        <FileText className="w-4 h-4 shrink-0" style={{ color: 'var(--app-text-muted)' }} />
                        <span className="text-sm flex-1" style={{ color: 'var(--app-text)' }}>{fileName}</span>
                        <span
                          className="text-xs px-2 py-0.5 rounded-full"
                          style={{
                            backgroundColor: exists ? 'rgba(16, 185, 129, 0.12)' : 'rgba(156, 163, 175, 0.12)',
                            color: exists ? '#10B981' : 'var(--app-text-muted)',
                          }}
                        >
                          {exists ? t('agent.wizard.templateFileExists') : t('agent.wizard.templateFileNotExists')}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── IdentityStep 组件 ──────────────────────────────────────────────

/** 步骤 3：Identity 配置（显示名称、主题色、emoji、头像） */
function IdentityStep({
  form, setForm, t,
}: {
  form: WizardFormData;
  setForm: React.Dispatch<React.SetStateAction<WizardFormData>>;
  t: (key: TranslationKey) => string;
}) {
  const updateIdentity = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, identity: { ...prev.identity, [field]: value } }));
  };

  return (
    <div className="space-y-4">
      <div className="text-xs" style={{ color: 'var(--app-text-muted)' }}>{t('agent.wizard.identityAllOptional')}</div>

      {/* 显示名称 */}
      <div>
        <div className="text-sm mb-2 flex items-center gap-2" style={{ color: 'var(--app-text-muted)' }}>
          <FileText className="w-3.5 h-3.5" /> {t('agent.wizard.identityName')}
        </div>
        <input
          value={form.identity.name}
          onChange={(e) => updateIdentity('name', e.target.value)}
          className="w-full rounded-xl px-4 py-3 outline-none"
          style={{ backgroundColor: 'var(--app-bg)', border: '1px solid var(--app-border)', color: 'var(--app-text)' }}
          placeholder={form.name || 'Agent 显示名称'}
        />
      </div>

      {/* 主题色 */}
      <div>
        <div className="text-sm mb-2 flex items-center gap-2" style={{ color: 'var(--app-text-muted)' }}>
          <Palette className="w-3.5 h-3.5" /> {t('agent.wizard.identityTheme')}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {PRESET_COLORS.map((color) => (
            <button
              key={color}
              onClick={() => updateIdentity('theme', color)}
              className="w-8 h-8 rounded-full transition-transform"
              style={{
                backgroundColor: color,
                border: form.identity.theme === color ? '3px solid var(--app-text)' : '2px solid transparent',
                transform: form.identity.theme === color ? 'scale(1.15)' : 'scale(1)',
              }}
              title={color}
            />
          ))}
          {/* 自定义颜色输入 */}
          <input
            type="text"
            value={form.identity.theme}
            onChange={(e) => updateIdentity('theme', e.target.value)}
            className="rounded-lg px-3 py-1.5 text-xs w-24 outline-none"
            style={{ backgroundColor: 'var(--app-bg)', border: '1px solid var(--app-border)', color: 'var(--app-text)' }}
            placeholder="#hex"
          />
        </div>
      </div>

      {/* Emoji */}
      <div>
        <div className="text-sm mb-2 flex items-center gap-2" style={{ color: 'var(--app-text-muted)' }}>
          <Smile className="w-3.5 h-3.5" /> {t('agent.wizard.identityEmoji')}
        </div>
        <input
          value={form.identity.emoji}
          onChange={(e) => updateIdentity('emoji', e.target.value)}
          className="w-full rounded-xl px-4 py-3 outline-none"
          style={{ backgroundColor: 'var(--app-bg)', border: '1px solid var(--app-border)', color: 'var(--app-text)' }}
          placeholder="🤖"
        />
      </div>

      {/* 头像路径 */}
      <div>
        <div className="text-sm mb-2 flex items-center gap-2" style={{ color: 'var(--app-text-muted)' }}>
          <Image className="w-3.5 h-3.5" /> {t('agent.wizard.identityAvatar')}
        </div>
        <input
          value={form.identity.avatar}
          onChange={(e) => updateIdentity('avatar', e.target.value)}
          className="w-full rounded-xl px-4 py-3 outline-none"
          style={{ backgroundColor: 'var(--app-bg)', border: '1px solid var(--app-border)', color: 'var(--app-text)' }}
          placeholder="头像文件路径或 URL"
        />
      </div>
    </div>
  );
}

// ── SummaryStep 组件 ──────────────────────────────────────────────

/** 步骤 4：确认摘要，展示所有配置信息 */
function SummaryStep({
  form, onGoToStep, t,
}: {
  form: WizardFormData;
  onGoToStep: (step: number) => void;
  t: (key: TranslationKey) => string;
}) {
  /** 摘要分区卡片 */
  const SectionCard = ({ title, step, children }: { title: string; step: number; children: React.ReactNode }) => (
    <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--app-bg)', border: '1px solid var(--app-border)' }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>{title}</span>
        <button
          onClick={() => onGoToStep(step)}
          className="text-xs px-2 py-1 rounded-lg transition-colors"
          style={{ color: 'var(--app-accent, #3B82F6)', backgroundColor: 'rgba(59, 130, 246, 0.08)' }}
        >
          {t('agent.wizard.summaryEdit')}
        </button>
      </div>
      {children}
    </div>
  );

  const InfoRow = ({ label, value }: { label: string; value: string }) => (
    <div className="flex items-center justify-between py-1">
      <span className="text-xs" style={{ color: 'var(--app-text-muted)' }}>{label}</span>
      <span className="text-xs font-mono" style={{ color: 'var(--app-text)' }}>{value || '-'}</span>
    </div>
  );

  const identityFields = filterEmptyIdentityFields(form.identity);
  const hasIdentity = Object.keys(identityFields).length > 0;

  return (
    <div className="space-y-4">
      {/* 基础信息 */}
      <SectionCard title={t('agent.wizard.summaryBasicInfo')} step={0}>
        <InfoRow label={t('agent.nameLabel')} value={form.name} />
        <InfoRow label="Workspace" value={form.workspace} />
        <InfoRow label={t('agent.modelLabel')} value={form.model} />
      </SectionCard>

      {/* 模板选择 */}
      <SectionCard title={t('agent.wizard.summaryTemplate')} step={1}>
        <InfoRow
          label="模式"
          value={form.templateMode === 'blank' ? t('agent.wizard.templateBlank') : t('agent.wizard.templateCopy')}
        />
        {form.templateMode === 'copy' && (
          <>
            <InfoRow label={t('agent.wizard.templateSource')} value={form.templateSourceAgentId} />
            <div className="mt-1">
              <span className="text-xs" style={{ color: 'var(--app-text-muted)' }}>{t('agent.wizard.templateFiles')}：</span>
              <span className="text-xs font-mono" style={{ color: 'var(--app-text)' }}>
                {form.selectedFiles.join(', ') || '-'}
              </span>
            </div>
          </>
        )}
      </SectionCard>

      {/* Identity 配置 */}
      <SectionCard title={t('agent.wizard.summaryIdentity')} step={2}>
        {hasIdentity ? (
          Object.entries(identityFields).map(([key, value]) => (
            <InfoRow key={key} label={key} value={value} />
          ))
        ) : (
          <div className="text-xs py-1" style={{ color: 'var(--app-text-muted)' }}>未配置</div>
        )}
      </SectionCard>
    </div>
  );
}

// ── 主组件 ──────────────────────────────────────────────────────────

/** 多步骤智能体创建向导 */
const CreateAgentWizard: React.FC<CreateAgentWizardProps> = ({ open, onClose, agents, availableModels, onCreated }) => {
  const { t } = useI18n();
  const [currentStep, setCurrentStep] = useState(0);
  const [form, setForm] = useState<WizardFormData>({ ...INITIAL_FORM });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState<CreationProgress | null>(null);

  // 步骤定义
  const steps = [
    { label: t('agent.wizard.stepBasicInfo'), key: 'basic' },
    { label: t('agent.wizard.stepTemplate'), key: 'template' },
    { label: t('agent.wizard.stepIdentity'), key: 'identity' },
    { label: t('agent.wizard.stepSummary'), key: 'summary' },
  ];

  // 关闭时重置所有状态
  const handleClose = useCallback(() => {
    setForm({ ...INITIAL_FORM });
    setCurrentStep(0);
    setErrors({});
    setProgress(null);
    onClose();
  }, [onClose]);

  // 下一步（含校验）
  const handleNext = () => {
    if (currentStep === 0) {
      const validationErrors = validateBasicInfo({ name: form.name, workspace: form.workspace }, t as (key: string) => string);
      if (Object.keys(validationErrors).length > 0) {
        setErrors(validationErrors);
        return;
      }
      setErrors({});
    }
    if (currentStep < steps.length - 1) {
      setCurrentStep((s) => s + 1);
    }
  };

  // 上一步
  const handlePrev = () => {
    if (currentStep > 0) setCurrentStep((s) => s - 1);
  };

  // 跳转到指定步骤（摘要页编辑按钮用）
  const goToStep = (step: number) => setCurrentStep(step);

  // ── 创建执行流程 ──────────────────────────────────────────────────

  const handleCreate = async () => {
    setProgress({ stage: 'creating' });

    try {
      // 1. 调用 agents:create 创建 Agent（核心操作，必须成功）
      const createResult = await window.electronAPI.agentsCreate({
        name: form.name.trim(),
        workspace: form.workspace.trim(),
        model: form.model.trim() || undefined,
      });

      if (!createResult.success || !createResult.agent) {
        setProgress({ stage: 'error', error: createResult.error || t('agent.wizard.createFailed') });
        return;
      }

      const newAgent = createResult.agent;
      const skippedFiles: string[] = [];

      // 2. 模板文件复制（增强操作，单个失败不阻断）
      if (form.templateMode === 'copy' && form.templateSourceAgentId && form.selectedFiles.length > 0) {
        setProgress({ stage: 'copying-templates' });
        for (const fileName of form.selectedFiles) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const readRes = await window.electronAPI.agentsReadWorkspaceFile(form.templateSourceAgentId, fileName as any);
            if (readRes.success && readRes.file?.content) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              await window.electronAPI.agentsSaveWorkspaceFile(newAgent.id, fileName as any, readRes.file.content);
            } else {
              skippedFiles.push(fileName);
            }
          } catch {
            skippedFiles.push(fileName);
          }
        }
      }

      // 3. 默认文件初始化（对未复制的核心文件写入默认模板）
      setProgress({ stage: 'initializing-files' });
      const copiedFiles = form.templateMode === 'copy' ? form.selectedFiles.filter((f) => !skippedFiles.includes(f)) : [];
      for (const [fileName, content] of Object.entries(DEFAULT_WORKSPACE_TEMPLATES)) {
        if (!copiedFiles.includes(fileName)) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await window.electronAPI.agentsSaveWorkspaceFile(newAgent.id, fileName as any, content);
          } catch {
            // 尽力而为，失败不阻断
          }
        }
      }

      // 4. Identity 写入（全空时跳过）
      if (!shouldSkipIdentityWrite(form.identity)) {
        setProgress({ stage: 'writing-identity' });
        try {
          await window.electronAPI.agentsUpdateIdentity(newAgent.id, filterEmptyIdentityFields(form.identity));
        } catch {
          // 尽力而为，失败不阻断
        }
      }

      // 完成
      setProgress({ stage: 'done', skippedFiles });
      onCreated(newAgent);
      handleClose();
    } catch (err) {
      setProgress({
        stage: 'error',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  // 是否正在创建中
  const isCreating = progress !== null && progress.stage !== 'error' && progress.stage !== 'done';

  if (!open) return null;

  return (
    <AppModal
      open={open}
      onClose={handleClose}
      title={t('agent.wizard.title')}
      icon={<Plus size={20} />}
      variant="default"
      size="xl"
      disableClose={isCreating}
      /* 底部导航按钮 */
      footer={
        <div className="flex items-center justify-between w-full">
          <div>
            {currentStep > 0 && (
              <AppButton
                onClick={handlePrev}
                disabled={isCreating}
                variant="secondary"
                icon={<ChevronLeft className="w-4 h-4" />}
              >
                {t('agent.wizard.prev')}
              </AppButton>
            )}
          </div>
          <div>
            {currentStep < steps.length - 1 ? (
              <AppButton
                onClick={handleNext}
                variant="primary"
                icon={<ChevronRight className="w-4 h-4" />}
              >
                {t('agent.wizard.next')}
              </AppButton>
            ) : (
              <AppButton
                onClick={handleCreate}
                disabled={isCreating}
                variant="primary"
                icon={isCreating
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Plus className="w-4 h-4" />
                }
              >
                {isCreating ? t('agent.wizard.creating') : t('agent.wizard.create')}
              </AppButton>
            )}
          </div>
        </div>
      }
    >
      {/* 步骤指示器 */}
      <WizardStepIndicator currentStep={currentStep} steps={steps} />

      {/* 内容区域（可滚动） */}
      <div className="overflow-y-auto overflow-x-hidden py-5" style={{ maxHeight: '60vh' }}>
        {/* 创建错误提示 */}
        {progress?.stage === 'error' && (
          <div
            className="mb-4 p-4 border rounded-lg"
            style={{
              backgroundColor: 'rgba(239, 68, 68, 0.08)',
              borderColor: 'rgba(239, 68, 68, 0.22)',
            }}
          >
            <div className="flex items-center gap-2" style={{ color: '#EF4444' }}>
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span className="text-sm">{progress.error}</span>
            </div>
          </div>
        )}

        {currentStep === 0 && (
          <BasicInfoStep form={form} setForm={setForm} errors={errors} availableModels={availableModels} t={t} />
        )}
        {currentStep === 1 && (
          <TemplateStep form={form} setForm={setForm} agents={agents} t={t} />
        )}
        {currentStep === 2 && (
          <IdentityStep form={form} setForm={setForm} t={t} />
        )}
        {currentStep === 3 && (
          <SummaryStep form={form} onGoToStep={goToStep} t={t} />
        )}
      </div>
    </AppModal>
  );
};

export default CreateAgentWizard;
