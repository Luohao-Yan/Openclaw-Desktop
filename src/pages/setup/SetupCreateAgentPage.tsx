import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, Loader2, Plus, SkipForward } from 'lucide-react';
import AppButton from '../../components/AppButton';
import SetupLayout from '../../components/setup/SetupLayout';
import { useSetupFlow } from '../../contexts/SetupFlowContext';
import { validateBasicInfo, generateWorkspacePath } from '../../utils/agentCreation';

/** 已有 agent 的简要信息，用于"复制已有 agent"下拉选择器 */
interface ExistingAgentInfo {
  id: string;
  name: string;
  model?: string;
  workspace?: string;
}

/**
 * 简易翻译函数，用于 validateBasicInfo 校验
 * 由于这是 Setup 页面，使用内联翻译而非 i18n 上下文
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
 * 对常见错误（如名称重复）提供友好的中文提示
 *
 * @param rawError - CLI 返回的原始错误信息
 * @param agentName - 用户输入的 Agent 名称
 * @returns 用户友好的错误信息
 */
function formatCreateError(rawError: string, agentName: string): string {
  // Agent 名称已存在
  if (rawError.toLowerCase().includes('already exists')) {
    return `智能体 "${agentName}" 已存在，请更换一个名称或跳过此步骤。`;
  }
  // 过滤掉 Config warnings 前缀噪音，只保留实际错误
  const lines = rawError.split(/[;\n]/).map((l) => l.trim()).filter(Boolean);
  const meaningful = lines.filter((l) => !l.toLowerCase().startsWith('config warning'));
  return meaningful.length > 0 ? meaningful.join('；') : rawError;
}

/**
 * 创建第一个 Agent 页面组件
 * 路由: /setup/local/create-agent
 * 位于渠道配置之后、验证页面之前
 * 提供简化的 Agent 创建表单：名称、工作区路径、模型选择
 */
export const SetupCreateAgentPage: React.FC = () => {
  const navigate = useNavigate();
  const { setCreatedAgent, persistPartialState, isBusy } = useSetupFlow();

  // ── 表单状态 ──────────────────────────────────────────────────────────────
  /** Agent 名称 */
  const [name, setName] = React.useState('');
  /** 工作区路径 */
  const [workspace, setWorkspace] = React.useState('');
  /** 用户是否手动编辑过工作区路径 */
  const [workspaceManuallyEdited, setWorkspaceManuallyEdited] = React.useState(false);
  /** 选中的模型 */
  const [selectedModel, setSelectedModel] = React.useState('');
  /** 可用模型列表 */
  const [availableModels, setAvailableModels] = React.useState<string[]>([]);
  /** 表单校验错误 */
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  /** 创建错误信息 */
  const [createError, setCreateError] = React.useState('');
  /** 是否正在创建 */
  const [isCreating, setIsCreating] = React.useState(false);

  // ── 复制已有 agent 相关状态 ────────────────────────────────────────────────
  /** 已有 agent 列表 */
  const [existingAgents, setExistingAgents] = React.useState<ExistingAgentInfo[]>([]);
  /** 当前选中的复制源 agent ID（空字符串表示不复制） */
  const [copyFromAgentId, setCopyFromAgentId] = React.useState('');
  /** 是否已通过复制自动填充了模型 */
  const [modelCopiedFromAgent, setModelCopiedFromAgent] = React.useState(false);

  // ── 初始化：获取可用模型列表 ──────────────────────────────────────────────
  React.useEffect(() => {
    const fetchModels = async () => {
      try {
        if (typeof window.electronAPI?.modelsGetConfig === 'function') {
          const result = await window.electronAPI.modelsGetConfig();
          if (result.success) {
            // 从 configuredModels 和 providers 中收集可用模型标识
            const models: string[] = [];
            // 主模型
            if (result.primary) {
              models.push(result.primary);
            }
            // 备用模型
            if (result.fallbacks) {
              for (const fb of result.fallbacks) {
                if (!models.includes(fb)) models.push(fb);
              }
            }
            // configuredModels 中的模型别名
            if (result.configuredModels) {
              for (const key of Object.keys(result.configuredModels)) {
                if (!models.includes(key)) models.push(key);
              }
            }
            setAvailableModels(models);
            // 如果有主模型，默认选中
            if (result.primary) {
              setSelectedModel(result.primary);
            }
          }
        }
      } catch (err) {
        // 获取模型列表失败时静默处理，用户可手动输入
        console.warn('获取模型列表失败:', err);
      }
    };
    void fetchModels();
  }, []);

  // ── 初始化：获取已有 agent 列表（用于"复制已有 agent"选项） ────────────────
  // @see 需求 2.5 — 提供"复制已有 agent 配置"选项
  React.useEffect(() => {
    const fetchExistingAgents = async () => {
      try {
        if (typeof window.electronAPI?.agentsGetAll === 'function') {
          const result = await window.electronAPI.agentsGetAll();
          if (result.success && Array.isArray(result.agents)) {
            // 提取每个 agent 的基本信息
            const agents: ExistingAgentInfo[] = result.agents.map((a: any) => ({
              id: a.id ?? a.name ?? '',
              name: a.name ?? a.id ?? '',
              model: typeof a.model === 'string' ? a.model : a.model?.primary,
              workspace: a.workspace ?? '',
            }));
            setExistingAgents(agents);
          }
        }
      } catch (err) {
        // 获取已有 agent 列表失败时静默处理
        console.warn('获取已有 agent 列表失败:', err);
      }
    };
    void fetchExistingAgents();
  }, []);

  // ── 名称变化时自动更新工作区路径（除非用户手动编辑过） ────────────────────
  React.useEffect(() => {
    if (!workspaceManuallyEdited && name.trim()) {
      setWorkspace(generateWorkspacePath(name.trim()));
    }
  }, [name, workspaceManuallyEdited]);

  /** 处理"复制已有 agent"下拉选择变化 */
  const handleCopyFromAgentChange = (agentId: string) => {
    setCopyFromAgentId(agentId);

    if (!agentId) {
      // 用户选择"不复制（从零创建）"，清除自动填充标记
      // Preservation: 不复制时行为与当前版本完全一致
      setModelCopiedFromAgent(false);
      return;
    }

    // 查找选中的 agent，自动填充模型配置
    const agent = existingAgents.find((a) => a.id === agentId);
    if (agent?.model) {
      setSelectedModel(agent.model);
      setModelCopiedFromAgent(true);
    } else {
      setModelCopiedFromAgent(false);
    }
  };

  /** 处理工作区路径输入变化 */
  const handleWorkspaceChange = (value: string) => {
    setWorkspace(value);
    setWorkspaceManuallyEdited(true);
  };

  /** 校验表单 */
  const validateForm = (): boolean => {
    const validationErrors = validateBasicInfo({ name, workspace }, t);
    setErrors(validationErrors);
    return Object.keys(validationErrors).length === 0;
  };

  /** 创建 Agent */
  const handleCreate = async () => {
    // 清除之前的错误
    setCreateError('');

    // 校验表单
    if (!validateForm()) {
      return;
    }

    setIsCreating(true);
    try {
      const payload: { name: string; workspace: string; model?: string } = {
        name: name.trim(),
        workspace: workspace.trim(),
      };
      // 仅当选择了模型时才传递
      if (selectedModel) {
        payload.model = selectedModel;
      }

      const result = await window.electronAPI.agentsCreate(payload);

      if (result.success && result.agent) {
        // 保存创建的 Agent 信息到 Context
        setCreatedAgent({ id: result.agent.id, name: result.agent.name });

        // CLI 成功后，调用 IPC 验证 agent 是否已写入 openclaw.json
        // @see 需求 2.3 — 验证 agent 记录已正确写入 openclaw.json 的 agents.list
        let verifiedAgentInfo: Record<string, unknown> | undefined;
        if (typeof window.electronAPI?.coreConfigVerifyAgent === 'function') {
          try {
            const verifyResult = await window.electronAPI.coreConfigVerifyAgent(result.agent.id);
            if (verifyResult.success && verifyResult.exists) {
              // 验证成功：从 openclaw.json 获取完整 agent 信息
              verifiedAgentInfo = verifyResult.agent;
            } else {
              // 验证失败：agent 可能已通过 CLI 创建成功，但 openclaw.json 中未找到
              // 显示警告但不阻塞流程
              console.warn(
                '持久化验证警告: agent 未在 openclaw.json 中找到，可能需要手动检查配置',
                verifyResult.error,
              );
            }
          } catch (verifyErr) {
            // 验证调用异常，不阻塞流程
            console.warn('持久化验证调用异常:', verifyErr);
          }
        }

        // 持久化到 electron-store，包含完整 agent 信息
        await persistPartialState({
          createdAgentName: result.agent.name,
          createdAgentId: result.agent.id,
          // 同步完整 agent 信息（包括工作区路径、模型配置等）
          createdAgentWorkspace: verifiedAgentInfo?.workspace as string | undefined
            ?? payload.workspace,
          createdAgentModel: verifiedAgentInfo?.model as string | undefined
            ?? payload.model,
        });
        // 导航到绑定渠道页面（bind-channels 有跳过条件，无渠道或无 agent 时自动跳到 verify）
        navigate('/setup/local/bind-channels');
      } else {
        // 创建失败，解析并显示友好的错误信息
        const rawError = result.error || '创建智能体失败，请重试';
        setCreateError(formatCreateError(rawError, name.trim()));
      }
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : '创建智能体时发生未知错误');
    } finally {
      setIsCreating(false);
    }
  };

  /** 跳过创建，直接进入绑定渠道页面（bind-channels 有跳过条件，无渠道或无 agent 时自动跳到 verify） */
  const handleSkip = () => {
    navigate('/setup/local/bind-channels');
  };

  /** 按钮禁用状态 */
  const buttonsDisabled = isBusy || isCreating;

  return (
    <SetupLayout
      title="创建第一个智能体"
      description="创建你的第一个 AI 智能体，开始使用 OpenClaw 系统。你也可以跳过此步骤，稍后在智能体页面创建。"
      stepLabel="创建 Agent"
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
      {/* 表单区域 */}
      <div className="space-y-5">
        {/* Agent 名称输入 */}
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
              // 清除名称相关错误
              if (errors.name) {
                setErrors((prev) => ({ ...prev, name: '' }));
              }
            }}
            placeholder="例如：my-assistant"
            className="w-full rounded-xl border px-4 py-2.5 text-sm outline-none transition-colors duration-200 focus:ring-2"
            style={{
              backgroundColor: 'var(--app-bg)',
              borderColor: errors.name ? '#ef4444' : 'var(--app-border)',
              color: 'var(--app-text)',
            }}
          />
          {errors.name && (
            <p className="mt-1.5 text-xs" style={{ color: '#ef4444' }}>
              {errors.name}
            </p>
          )}
          <p className="mt-1.5 text-xs" style={{ color: 'var(--app-text-muted)' }}>
            仅允许 ASCII 字母、数字、连字符（-）和下划线（_）
          </p>
        </div>

        {/* 工作区路径输入 */}
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
              handleWorkspaceChange(e.target.value);
              // 清除工作区相关错误
              if (errors.workspace) {
                setErrors((prev) => ({ ...prev, workspace: '' }));
              }
            }}
            placeholder="例如：~/.openclaw/workspace-my-assistant"
            className="w-full rounded-xl border px-4 py-2.5 text-sm outline-none transition-colors duration-200 focus:ring-2"
            style={{
              backgroundColor: 'var(--app-bg)',
              borderColor: errors.workspace ? '#ef4444' : 'var(--app-border)',
              color: 'var(--app-text)',
            }}
          />
          {errors.workspace && (
            <p className="mt-1.5 text-xs" style={{ color: '#ef4444' }}>
              {errors.workspace}
            </p>
          )}
          <p className="mt-1.5 text-xs" style={{ color: 'var(--app-text-muted)' }}>
            智能体的工作目录，根据名称自动生成，可手动修改
          </p>
        </div>

        {/* 复制已有 agent 下拉选择器 */}
        {/* @see 需求 2.5 — 提供"复制已有 agent 配置"选项，自动填充模型配置 */}
        {existingAgents.length > 0 && (
          <div>
            <label
              htmlFor="copy-from-agent"
              className="mb-1.5 flex items-center gap-1.5 text-sm font-medium"
              style={{ color: 'var(--app-text)' }}
            >
              <Copy size={14} style={{ color: 'var(--app-text-muted)' }} />
              复制已有智能体配置 <span style={{ color: 'var(--app-text-muted)' }}>（可选）</span>
            </label>
            <select
              id="copy-from-agent"
              value={copyFromAgentId}
              onChange={(e) => handleCopyFromAgentChange(e.target.value)}
              className="w-full rounded-xl border px-4 py-2.5 text-sm outline-none transition-colors duration-200 focus:ring-2 cursor-pointer"
              style={{
                backgroundColor: 'var(--app-bg)',
                borderColor: 'var(--app-border)',
                color: 'var(--app-text)',
              }}
            >
              <option value="">不复制（从零创建）</option>
              {existingAgents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}{agent.model ? ` — 模型: ${agent.model}` : ''}
                </option>
              ))}
            </select>
            {/* 复制成功提示 */}
            {modelCopiedFromAgent && (
              <p className="mt-1.5 text-xs" style={{ color: 'var(--app-accent, #3b82f6)' }}>
                已从已有智能体复制模型配置
              </p>
            )}
            {!modelCopiedFromAgent && (
              <p className="mt-1.5 text-xs" style={{ color: 'var(--app-text-muted)' }}>
                选择一个已有智能体，自动填充其模型配置
              </p>
            )}
          </div>
        )}

        {/* 模型选择下拉框 */}
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
            className="w-full rounded-xl border px-4 py-2.5 text-sm outline-none transition-colors duration-200 focus:ring-2 cursor-pointer"
            style={{
              backgroundColor: 'var(--app-bg)',
              borderColor: 'var(--app-border)',
              color: 'var(--app-text)',
            }}
          >
            <option value="">使用系统默认模型</option>
            {availableModels.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs" style={{ color: 'var(--app-text-muted)' }}>
            选择智能体使用的 AI 模型，留空则使用系统默认配置
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
