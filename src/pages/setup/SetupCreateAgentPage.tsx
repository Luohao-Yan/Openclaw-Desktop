import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Plus, SkipForward } from 'lucide-react';
import AppButton from '../../components/AppButton';
import SetupLayout from '../../components/setup/SetupLayout';
import { useSetupFlow } from '../../contexts/SetupFlowContext';
import { validateBasicInfo, generateWorkspacePath } from '../../utils/agentCreation';

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

  // ── 名称变化时自动更新工作区路径（除非用户手动编辑过） ────────────────────
  React.useEffect(() => {
    if (!workspaceManuallyEdited && name.trim()) {
      setWorkspace(generateWorkspacePath(name.trim()));
    }
  }, [name, workspaceManuallyEdited]);

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
        // 持久化到 electron-store
        await persistPartialState({
          createdAgentName: result.agent.name,
          createdAgentId: result.agent.id,
        });
        // 导航到验证页面
        navigate('/setup/local/verify');
      } else {
        // 创建失败，显示错误信息
        setCreateError(result.error || '创建智能体失败，请重试');
      }
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : '创建智能体时发生未知错误');
    } finally {
      setIsCreating(false);
    }
  };

  /** 跳过创建，直接进入验证页面 */
  const handleSkip = () => {
    navigate('/setup/local/verify');
  };

  /** 按钮禁用状态 */
  const buttonsDisabled = isBusy || isCreating;

  return (
    <SetupLayout
      title="创建第一个智能体"
      description="创建你的第一个 AI 智能体，开始使用 OpenClaw 系统。你也可以跳过此步骤，稍后在智能体页面创建。"
      stepLabel="创建 Agent"
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
              backgroundColor: 'rgba(239, 68, 68, 0.12)',
              borderColor: 'rgba(239, 68, 68, 0.28)',
              color: '#fecaca',
            }}
          >
            {createError}
          </div>
        )}
      </div>

      {/* 底部操作栏 */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
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
    </SetupLayout>
  );
};

export default SetupCreateAgentPage;
