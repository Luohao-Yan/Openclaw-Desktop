import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, CheckCircle2, Loader2, Plus, SkipForward } from 'lucide-react';
import AppButton from '../../components/AppButton';
import SetupLayout from '../../components/setup/SetupLayout';
import { useSetupFlow } from '../../contexts/SetupFlowContext';
import { validateBasicInfo, generateWorkspacePath } from '../../utils/agentCreation';

// ============================================================================
// 类型定义
// ============================================================================

/** 已有 agent 的简要信息 */
interface ExistingAgentInfo {
  id: string;
  name: string;
  model?: string;
  workspace?: string;
}

/** 页面工作模式 */
type PageMode =
  | 'loading'           // 正在检测 agents.list
  | 'has-existing'      // 已有 agent（main agent 或其他），展示确认/选择界面
  | 'create-new';       // 无 agent，展示创建表单

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 简易翻译函数，用于 validateBasicInfo 校验
 */
const t = (key: string): string => {
  const map: Record<string, string> = {
    'agent.nameRequired': '请输入智能体名称',
    'agent.nameInvalid': '名称仅允许 ASCII 字母、数字、连字符和下划线',
    'agent.workspaceRequired': '请输入工作区路径',
  };
  return map[key] || key;
};

/**
 * 格式化创建 Agent 的错误信息
 */
function formatCreateError(rawError: string, agentName: string): string {
  if (rawError.toLowerCase().includes('already exists')) {
    return `智能体 "${agentName}" 已存在，请更换一个名称或选择已有智能体。`;
  }
  const lines = rawError.split(/[;\n]/).map((l) => l.trim()).filter(Boolean);
  const meaningful = lines.filter((l) => !l.toLowerCase().startsWith('config warning'));
  return meaningful.length > 0 ? meaningful.join('；') : rawError;
}

// ============================================================================
// 主页面组件
// ============================================================================

/**
 * 智能体配置页面（自适应）
 * 路由: /setup/local/create-agent
 *
 * 逻辑：
 * - 进入时先检测 agents.list
 * - 有 agent（包括 openclaw onboard 创建的 main agent）→ 展示"选择/确认已有智能体"界面
 * - 无 agent → 展示创建表单
 */
export const SetupCreateAgentPage: React.FC = () => {
  const navigate = useNavigate();
  const { setCreatedAgent, persistPartialState, isBusy } = useSetupFlow();

  // ── 页面模式 ──────────────────────────────────────────────────────────────
  const [pageMode, setPageMode] = React.useState<PageMode>('loading');
  /** 系统中已有的 agent 列表 */
  const [existingAgents, setExistingAgents] = React.useState<ExistingAgentInfo[]>([]);
  /** 当前选中的已有 agent ID */
  const [selectedAgentId, setSelectedAgentId] = React.useState('');

  // ── 创建表单状态 ──────────────────────────────────────────────────────────
  const [name, setName] = React.useState('');
  const [workspace, setWorkspace] = React.useState('');
  const [workspaceManuallyEdited, setWorkspaceManuallyEdited] = React.useState(false);
  const [selectedModel, setSelectedModel] = React.useState('');
  const [availableModels, setAvailableModels] = React.useState<string[]>([]);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [createError, setCreateError] = React.useState('');
  const [isCreating, setIsCreating] = React.useState(false);

  // ── 初始化：检测 agents.list，决定页面模式 ────────────────────────────────
  React.useEffect(() => {
    const detectAgents = async () => {
      try {
        if (typeof window.electronAPI?.agentsGetAll === 'function') {
          const result = await window.electronAPI.agentsGetAll();
          if (result.success && Array.isArray(result.agents) && result.agents.length > 0) {
            // 已有 agent（包括 openclaw onboard 创建的 main agent）
            const agents: ExistingAgentInfo[] = result.agents.map((a: any) => ({
              id: a.id ?? a.name ?? '',
              name: a.name ?? a.id ?? '',
              model: typeof a.model === 'string' ? a.model : a.model?.primary,
              workspace: a.workspace ?? '',
            }));
            setExistingAgents(agents);
            // 默认选中第一个（通常是 main agent）
            setSelectedAgentId(agents[0]?.id ?? '');
            setPageMode('has-existing');
            return;
          }
        }
      } catch (err) {
        console.warn('[SetupCreateAgentPage] 检测 agents 失败:', err);
      }
      // 无 agent 或检测失败，进入创建模式
      setPageMode('create-new');
    };

    void detectAgents();
  }, []);

  // ── 初始化：获取可用模型列表（创建模式使用） ──────────────────────────────
  React.useEffect(() => {
    if (pageMode !== 'create-new') return;
    const fetchModels = async () => {
      try {
        if (typeof window.electronAPI?.modelsGetConfig === 'function') {
          const result = await window.electronAPI.modelsGetConfig();
          if (result.success) {
            const models: string[] = [];
            if (result.primary) models.push(result.primary);
            if (result.fallbacks) {
              for (const fb of result.fallbacks) {
                if (!models.includes(fb)) models.push(fb);
              }
            }
            if (result.configuredModels) {
              for (const key of Object.keys(result.configuredModels)) {
                if (!models.includes(key)) models.push(key);
              }
            }
            setAvailableModels(models);
            if (result.primary) setSelectedModel(result.primary);
          }
        }
      } catch (err) {
        console.warn('[SetupCreateAgentPage] 获取模型列表失败:', err);
      }
    };
    void fetchModels();
  }, [pageMode]);

  // ── 名称变化时自动更新工作区路径 ──────────────────────────────────────────
  React.useEffect(() => {
    if (!workspaceManuallyEdited && name.trim()) {
      setWorkspace(generateWorkspacePath(name.trim()));
    }
  }, [name, workspaceManuallyEdited]);

  // ── 处理器：选择已有 agent 并继续 ────────────────────────────────────────
  const handleUseExistingAgent = async () => {
    const agent = existingAgents.find((a) => a.id === selectedAgentId);
    if (!agent) return;

    // 将选中的 agent 写入引导流程状态
    setCreatedAgent({ id: agent.id, name: agent.name });
    await persistPartialState({
      createdAgentName: agent.name,
      createdAgentId: agent.id,
      createdAgentWorkspace: agent.workspace,
      createdAgentModel: agent.model,
    });
    navigate('/setup/local/bind-channels');
  };

  // ── 处理器：跳过（不选择任何 agent） ─────────────────────────────────────
  const handleSkip = () => {
    navigate('/setup/local/bind-channels');
  };

  // ── 处理器：创建新 agent ──────────────────────────────────────────────────
  const handleCreate = async () => {
    setCreateError('');
    const validationErrors = validateBasicInfo({ name, workspace }, t);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;

    setIsCreating(true);
    try {
      const payload: { name: string; workspace: string; model?: string } = {
        name: name.trim(),
        workspace: workspace.trim(),
      };
      if (selectedModel) payload.model = selectedModel;

      const result = await window.electronAPI.agentsCreate(payload);

      if (result.success && result.agent) {
        setCreatedAgent({ id: result.agent.id, name: result.agent.name });

        // 验证 agent 是否已写入 openclaw.json
        let verifiedAgentInfo: Record<string, unknown> | undefined;
        if (typeof window.electronAPI?.coreConfigVerifyAgent === 'function') {
          try {
            const verifyResult = await window.electronAPI.coreConfigVerifyAgent(result.agent.id);
            if (verifyResult.success && verifyResult.exists) {
              verifiedAgentInfo = verifyResult.agent;
            }
          } catch (verifyErr) {
            console.warn('[SetupCreateAgentPage] 持久化验证异常:', verifyErr);
          }
        }

        await persistPartialState({
          createdAgentName: result.agent.name,
          createdAgentId: result.agent.id,
          createdAgentWorkspace: verifiedAgentInfo?.workspace as string | undefined ?? payload.workspace,
          createdAgentModel: verifiedAgentInfo?.model as string | undefined ?? payload.model,
        });
        navigate('/setup/local/bind-channels');
      } else {
        const rawError = result.error || '创建智能体失败，请重试';
        setCreateError(formatCreateError(rawError, name.trim()));
      }
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : '创建智能体时发生未知错误');
    } finally {
      setIsCreating(false);
    }
  };

  const buttonsDisabled = isBusy || isCreating;

  // ── 加载中 ────────────────────────────────────────────────────────────────
  if (pageMode === 'loading') {
    return (
      <SetupLayout
        title="智能体配置"
        description="正在检测系统中的智能体…"
        stepLabel="智能体配置"
      >
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin" style={{ color: 'var(--app-text-muted)' }} />
        </div>
      </SetupLayout>
    );
  }

  // ── 已有 agent 模式：展示选择/确认界面 ───────────────────────────────────
  if (pageMode === 'has-existing') {
    return (
      <SetupLayout
        title="选择智能体"
        description="检测到系统中已有智能体（通常由 openclaw onboard 创建）。选择一个作为当前引导流程的主智能体，或跳过此步骤。"
        stepLabel="智能体配置"
        footer={
          <div className="flex flex-wrap items-center gap-3">
            <AppButton
              variant="secondary"
              onClick={handleSkip}
              disabled={buttonsDisabled}
              icon={<SkipForward size={14} />}
            >
              跳过
            </AppButton>
            <AppButton
              variant="primary"
              onClick={() => void handleUseExistingAgent()}
              disabled={buttonsDisabled || !selectedAgentId}
              icon={<CheckCircle2 size={15} />}
            >
              使用此智能体
            </AppButton>
          </div>
        }
      >
        <div className="space-y-3">
          {/* agent 列表 */}
          {existingAgents.map((agent) => (
            <button
              key={agent.id}
              type="button"
              onClick={() => setSelectedAgentId(agent.id)}
              className="w-full rounded-2xl border px-4 py-3.5 text-left transition-token-normal hover:-translate-y-0.5 focus:outline-none focus:ring-2"
              style={{
                backgroundColor: 'var(--app-bg)',
                borderColor: selectedAgentId === agent.id
                  ? 'var(--app-active-border)'
                  : 'var(--app-border)',
                boxShadow: selectedAgentId === agent.id
                  ? '0 0 0 1px var(--app-active-border)'
                  : 'none',
              }}
            >
              <div className="flex items-center gap-3">
                {/* 图标 */}
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border"
                  style={{
                    borderColor: selectedAgentId === agent.id
                      ? 'var(--app-active-border)'
                      : 'var(--app-border)',
                    backgroundColor: selectedAgentId === agent.id
                      ? 'var(--app-active-bg)'
                      : 'var(--app-bg-elevated, var(--app-bg))',
                  }}
                >
                  <Bot
                    size={16}
                    style={{
                      color: selectedAgentId === agent.id
                        ? 'var(--app-active-text)'
                        : 'var(--app-text-muted)',
                    }}
                  />
                </div>
                {/* 信息 */}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{agent.name}</div>
                  <div className="mt-0.5 truncate text-xs" style={{ color: 'var(--app-text-muted)' }}>
                    {agent.model ? `模型: ${agent.model}` : '使用系统默认模型'}
                    {agent.workspace ? ` · ${agent.workspace}` : ''}
                  </div>
                </div>
                {/* 选中标记 */}
                {selectedAgentId === agent.id && (
                  <CheckCircle2 size={16} style={{ color: 'var(--app-active-text)', flexShrink: 0 }} />
                )}
              </div>
            </button>
          ))}

          {/* 提示：如需创建新 agent，可稍后在智能体页面操作 */}
          <p className="pt-1 text-xs" style={{ color: 'var(--app-text-muted)' }}>
            如需创建额外的智能体，可在引导完成后前往「智能体」页面操作。
          </p>
        </div>
      </SetupLayout>
    );
  }

  // ── 创建模式：展示创建表单 ────────────────────────────────────────────────
  return (
    <SetupLayout
      title="创建第一个智能体"
      description="系统中尚未检测到智能体。创建你的第一个 AI 智能体，或跳过此步骤稍后在智能体页面创建。"
      stepLabel="智能体配置"
      footer={
        <div className="flex flex-wrap items-center gap-3">
          <AppButton
            variant="secondary"
            onClick={handleSkip}
            disabled={buttonsDisabled}
            icon={<SkipForward size={14} />}
          >
            跳过
          </AppButton>
          <AppButton
            variant="primary"
            onClick={() => void handleCreate()}
            disabled={buttonsDisabled}
            icon={
              isCreating ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <Plus size={15} />
              )
            }
          >
            {isCreating ? '创建中…' : '创建'}
          </AppButton>
        </div>
      }
    >
      <div className="space-y-5">
        {/* 智能体名称 */}
        <div>
          <label
            htmlFor="agent-name"
            className="mb-1.5 block text-sm font-medium"
            style={{ color: 'var(--app-text)' }}
          >
            智能体名称 <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <input
            id="agent-name"
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (errors.name) setErrors((prev) => ({ ...prev, name: '' }));
            }}
            placeholder="例如：my-assistant"
            className="w-full rounded-xl border px-4 py-2.5 text-sm outline-none transition-token-normal focus:ring-2"
            style={{
              backgroundColor: 'var(--app-bg)',
              borderColor: errors.name ? '#ef4444' : 'var(--app-border)',
              color: 'var(--app-text)',
            }}
          />
          {errors.name && (
            <p className="mt-1.5 text-xs" style={{ color: '#ef4444' }}>{errors.name}</p>
          )}
          <p className="mt-1.5 text-xs" style={{ color: 'var(--app-text-muted)' }}>
            仅允许 ASCII 字母、数字、连字符（-）和下划线（_）
          </p>
        </div>

        {/* 工作区路径 */}
        <div>
          <label
            htmlFor="agent-workspace"
            className="mb-1.5 block text-sm font-medium"
            style={{ color: 'var(--app-text)' }}
          >
            工作区路径 <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <input
            id="agent-workspace"
            type="text"
            value={workspace}
            onChange={(e) => {
              setWorkspace(e.target.value);
              setWorkspaceManuallyEdited(true);
              if (errors.workspace) setErrors((prev) => ({ ...prev, workspace: '' }));
            }}
            placeholder="例如：~/.openclaw/workspace-my-assistant"
            className="w-full rounded-xl border px-4 py-2.5 text-sm outline-none transition-token-normal focus:ring-2"
            style={{
              backgroundColor: 'var(--app-bg)',
              borderColor: errors.workspace ? '#ef4444' : 'var(--app-border)',
              color: 'var(--app-text)',
            }}
          />
          {errors.workspace && (
            <p className="mt-1.5 text-xs" style={{ color: '#ef4444' }}>{errors.workspace}</p>
          )}
          <p className="mt-1.5 text-xs" style={{ color: 'var(--app-text-muted)' }}>
            智能体的工作目录，根据名称自动生成，可手动修改
          </p>
        </div>

        {/* 模型选择 */}
        <div>
          <label
            htmlFor="agent-model"
            className="mb-1.5 block text-sm font-medium"
            style={{ color: 'var(--app-text)' }}
          >
            模型选择 <span style={{ color: 'var(--app-text-muted)' }}>（可选）</span>
          </label>
          <select
            id="agent-model"
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="w-full cursor-pointer rounded-xl border px-4 py-2.5 text-sm outline-none transition-token-normal focus:ring-2"
            style={{
              backgroundColor: 'var(--app-bg)',
              borderColor: 'var(--app-border)',
              color: 'var(--app-text)',
            }}
          >
            <option value="">使用系统默认模型</option>
            {availableModels.map((model) => (
              <option key={model} value={model}>{model}</option>
            ))}
          </select>
          <p className="mt-1.5 text-xs" style={{ color: 'var(--app-text-muted)' }}>
            留空则使用系统默认配置
          </p>
        </div>

        {/* 创建错误提示 */}
        {createError && (
          <div
            className="rounded-xl border px-4 py-3 text-sm"
            style={{
              backgroundColor: 'rgba(239, 68, 68, 0.08)',
              borderColor: 'rgba(239, 68, 68, 0.25)',
              color: '#dc2626',
            }}
          >
            {createError}
          </div>
        )}
      </div>
    </SetupLayout>
  );
};

export default SetupCreateAgentPage;
