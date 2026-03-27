import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  ChevronRight,
  Circle,
  Download,
  FolderOpen,
  Link2,
  Loader2,
  Laptop,
  MessageSquare,
  Plus,
  Settings2,
  Shield,
  SkipForward,
  Trash2,
  UserCheck,
  Wrench,
  XCircle,
  Zap,
  Package,
} from 'lucide-react';
import AppButton from '../../components/AppButton';
import SetupLayout from '../../components/setup/SetupLayout';
import { useSetupFlow } from '../../contexts/SetupFlowContext';
import type { InstallProgressEvent, InstallStage } from '../../types/electron';
// 导入 sanitizeSetupConfig，用于过滤 openclaw.json schema 不兼容字段
// 注意：renderer 无法直接 import electron/ipc/，因此使用 src/utils/ 下的副本
import { sanitizeSetupConfig } from '../../utils/setupConfigLogic';
// 导入 agent 创建工具函数：校验基础信息和自动生成工作区路径
import { validateBasicInfo, generateWorkspacePath } from '../../utils/agentCreation';
// 导入渠道账户字段定义和校验函数，用于 channels 子步骤的多账户配置模式
import { getAccountFields, validateAccountId } from '../../config/channelAccountFields';

// 子步骤联合类型：在 skills 和 done 之间新增 agent（智能体配置）和 bind（渠道绑定）
type SubStep = 'platform' | 'install' | 'model' | 'workspace' | 'gateway' | 'channels' | 'daemon' | 'skills' | 'agent' | 'bind' | 'done';

type StepStatus = 'pending' | 'running' | 'done' | 'error';

interface InstallStepState {
  stage: InstallStage;
  label: string;
  status: StepStatus;
  message?: string;
}

const INITIAL_INSTALL_STEPS: InstallStepState[] = [
  { stage: 'download', label: '下载安装包', status: 'pending' },
  { stage: 'install', label: '安装 OpenClaw', status: 'pending' },
  { stage: 'init', label: '初始化数据目录', status: 'pending' },
  { stage: 'verify', label: '验证安装结果', status: 'pending' },
];

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
 * 对 "already exists" 类错误显示友好提示
 */
function formatCreateError(rawError: string, agentName: string): string {
  if (rawError.toLowerCase().includes('already exists')) {
    return `智能体 "${agentName}" 已存在，请更换名称或选择已有智能体。`;
  }
  // 过滤 config warning 行，只保留有意义的错误信息
  const lines = rawError.split(/[;\n]/).map((l) => l.trim()).filter(Boolean);
  const meaningful = lines.filter((l) => !l.toLowerCase().startsWith('config warning'));
  return meaningful.length > 0 ? meaningful.join('；') : rawError;
}

// 子步骤数组：在 skills 和 done 之间插入 agent（智能体配置）和 bind（渠道绑定），共 11 项
const SUB_STEPS: Array<{ key: SubStep; label: string }> = [
  { key: 'platform', label: '确认平台' },
  { key: 'install', label: '下载安装' },
  { key: 'model', label: '模型 / Auth' },
  { key: 'workspace', label: 'Workspace' },
  { key: 'gateway', label: 'Gateway' },
  { key: 'channels', label: 'Channels' },
  { key: 'daemon', label: 'Daemon' },
  { key: 'skills', label: 'Skills' },
  { key: 'agent', label: 'Agent' },
  { key: 'bind', label: '绑定' },
  { key: 'done', label: '完成' },
];

const StepBar: React.FC<{ current: SubStep }> = ({ current }) => {
  const idx = SUB_STEPS.findIndex((s) => s.key === current);
  // 修复 Bug 2: 使用 gap-2 增大间距，overflow-x-auto 允许窄窗口下水平滚动
  return (
    <div className="mb-6 flex items-center gap-2 overflow-x-auto">
      {SUB_STEPS.map((s, i) => {
        const done = i < idx;
        const active = i === idx;
        return (
          <React.Fragment key={s.key}>
            <div
              className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-token-normal"
              style={{
                backgroundColor: active ? 'var(--app-active-bg)' : done ? 'rgba(16,185,129,0.08)' : 'var(--app-bg)',
                border: '1px solid',
                borderColor: active ? 'var(--app-active-border)' : done ? 'rgba(16,185,129,0.3)' : 'var(--app-border)',
                color: active ? 'var(--app-active-text)' : done ? '#34d399' : 'var(--app-text-muted)',
              }}
            >
              {done ? <CheckCircle2 size={12} /> : null}
              <span className="hidden sm:inline whitespace-nowrap">{s.label}</span>
            </div>
            {i < SUB_STEPS.length - 1 && (
              <div className="h-px flex-1" style={{ backgroundColor: done ? 'rgba(16,185,129,0.3)' : 'var(--app-border)' }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

export const SetupLocalInstallGuidePage: React.FC = () => {
  const navigate = useNavigate();
  // Task 2.3: 从 useSetupFlow 解构所有需要的字段
  const {
    environmentCheck, installOpenClawForSetup, isBusy, setupSettings,
    setCreatedAgent, createdAgent, persistPartialState, dispatch,
    channelConfigs, updateChannelConfig, channelAccounts,
    addEnabledChannels, channelAddResults, saveChannelConfigs,
  } = useSetupFlow();

  const [subStep, setSubStep] = React.useState<SubStep>('platform');

  // ── Agent 子步骤状态 ──────────────────────────────────────────────────────
  // 页面模式：loading（检测中）/ has-existing（已有 agent）/ create-new（创建新 agent）
  const [agentPageMode, setAgentPageMode] = React.useState<'loading' | 'has-existing' | 'create-new'>('loading');
  // 已有 agent 列表
  const [existingAgents, setExistingAgents] = React.useState<Array<{ id: string; name: string; model?: string; workspace?: string }>>([]);
  // 选中的 agent ID
  const [selectedAgentId, setSelectedAgentId] = React.useState('');
  // 创建表单字段
  const [agentName, setAgentName] = React.useState('');
  const [agentWorkspace, setAgentWorkspace] = React.useState('');
  const [agentWorkspaceManuallyEdited, setAgentWorkspaceManuallyEdited] = React.useState(false);
  const [agentModel, setAgentModel] = React.useState('');
  // 创建表单校验错误
  const [agentErrors, setAgentErrors] = React.useState<Record<string, string>>({});
  // 创建 API 错误
  const [agentCreateError, setAgentCreateError] = React.useState('');
  // 是否正在创建 agent
  const [isCreatingAgent, setIsCreatingAgent] = React.useState(false);

  // ── Agent 完整性检查与认领相关状态 ──────────────────────────────────────
  // agent 完整性检查结果映射：agentId → CompletenessReport
  const [agentCompletenessMap, setAgentCompletenessMap] = React.useState<Record<string, any>>({});
  // 认领表单：用户输入的新名称
  const [claimAgentName, setClaimAgentName] = React.useState('');
  // 认领表单：名称校验错误
  const [claimNameError, setClaimNameError] = React.useState('');
  // 是否显示认领表单
  const [showClaimForm, setShowClaimForm] = React.useState(false);
  // 修复进行中标志
  const [isRepairing, setIsRepairing] = React.useState(false);
  // 修复错误信息
  const [repairError, setRepairError] = React.useState('');

  // ── Bind 子步骤状态 ──────────────────────────────────────────────────────
  // 可绑定的渠道账户列表
  const [bindableAccounts, setBindableAccounts] = React.useState<Array<{
    channelKey: string;
    accountId: string;
    checkKey: string;
    displayLabel: string;
    boundAgentId: string;
  }>>([]);
  // 已绑定 key 集合（channelKey/accountId 格式）
  const [existingBindingKeys, setExistingBindingKeys] = React.useState<Set<string>>(new Set());
  // 勾选状态
  const [bindChecked, setBindChecked] = React.useState<Record<string, boolean>>({});
  // 是否正在加载绑定信息
  const [isLoadingBindInfo, setIsLoadingBindInfo] = React.useState(false);
  // 是否正在写入绑定
  const [isBinding, setIsBinding] = React.useState(false);
  // 绑定写入错误
  const [bindError, setBindError] = React.useState('');
  // 绑定信息查询错误
  const [bindLoadError, setBindLoadError] = React.useState('');
  // 已完成绑定的渠道数量（用于 done 子步骤配置摘要展示）
  const [completedBindings, setCompletedBindings] = React.useState(0);
  const [modelProvider, setModelProvider] = React.useState('');
  // 版本选择状态：默认使用推荐版本
  const [selectedVersion, setSelectedVersion] = React.useState(
    environmentCheck.recommendedVersion || ''
  );
  const [modelName, setModelName] = React.useState('');
  const [apiKey, setApiKey] = React.useState('');
  const [baseUrl, setBaseUrl] = React.useState('');
  const [workspaceDir, setWorkspaceDir] = React.useState('~/.openclaw/workspace');
  const [gatewayPort, setGatewayPort] = React.useState('18789');
  const [gatewayAuth, setGatewayAuth] = React.useState<'token' | 'none'>('token');
  // 使用 'lan' 而非 'all'，与 gateway.ts inferHostFromBind 期望的值保持一致
  const [gatewayBind, setGatewayBind] = React.useState<'loopback' | 'lan'>('loopback');
  const [gatewayTailscale, setGatewayTailscale] = React.useState(false);
  const [dmScope, setDmScope] = React.useState<'per-channel-peer' | 'per-channel'>('per-channel-peer');

  // Channels state
  type ChannelKey = 'telegram' | 'discord' | 'whatsapp' | 'signal' | 'imessage' | 'googlechat' | 'mattermost';
  const [enabledChannels, setEnabledChannels] = React.useState<Set<ChannelKey>>(new Set());
  const [channelTokens, setChannelTokens] = React.useState<Partial<Record<ChannelKey, string>>>({});

  // ── Channels 子步骤增强状态：CLI 添加渠道 ──────────────────────────────
  // 是否正在执行 CLI 添加渠道
  const [isAddingChannels, setIsAddingChannels] = React.useState(false);
  // 是否已完成渠道添加操作（用于控制「继续」按钮行为：第一次点击添加，第二次导航）
  const [channelAddCompleted, setChannelAddCompleted] = React.useState(false);

  // Daemon state
  const [installDaemon, setInstallDaemon] = React.useState(true);
  const [daemonRuntime, setDaemonRuntime] = React.useState<'node' | 'bundled'>('node');

  // Skills state
  const [installRecommendedSkills, setInstallRecommendedSkills] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState('');
  const [modelTestStatus, setModelTestStatus] = React.useState<'idle' | 'testing' | 'ok' | 'error'>('idle');
  const [modelTestError, setModelTestError] = React.useState('');
  const [existingInstall, setExistingInstall] = React.useState<{ version: string; path: string } | null>(null);
  const [existingInstallChecked, setExistingInstallChecked] = React.useState(false);

  const DEFAULT_MODELS: Record<string, string> = {
    'OpenAI': 'openai/gpt-4o',
    'Anthropic': 'anthropic/claude-opus-4-6',
    'Google (Gemini)': 'google/gemini-2.5-pro',
    'Mistral': 'mistral/mistral-large-latest',
    'OpenRouter': 'openrouter/anthropic/claude-sonnet-4-5',
    'Together AI': 'together/meta-llama/Llama-3-70b-chat-hf',
    'Groq': 'groq/llama-3.3-70b-versatile',
    'xAI (Grok)': 'xai/grok-3',
    'Ollama (本地)': 'ollama/llama3.2',
    'vLLM (本地)': 'vllm/your-model-name',
    'Amazon Bedrock': 'bedrock/anthropic.claude-opus-4-6-v1:0',
    'Cloudflare AI': 'cloudflare/@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    'LiteLLM': 'litellm/your-model-name',
    'Moonshot (Kimi)': 'moonshot/moonshot-v1-8k',
    'Qwen': 'qwen/qwen-max',
    'GLM': 'glm/glm-4',
    'Deepseek': 'deepseek/deepseek-chat',
    'MiniMax': 'minimax/abab6.5s-chat',
    'Qianfan': 'qianfan/ernie-4.0-8k',
    'NVIDIA': 'nvidia/meta/llama-3.3-70b-instruct',
    'Hugging Face': 'huggingface/meta-llama/Llama-3.3-70B-Instruct',
    'Venice AI': 'venice/llama-3.3-70b',
    'Z.AI': 'zai/your-model-name',
    '自定义': '',
  };
  const [installSteps, setInstallSteps] = React.useState<InstallStepState[]>(INITIAL_INSTALL_STEPS);
  const [hasStartedInstall, setHasStartedInstall] = React.useState(false);
  const [installLogs, setInstallLogs] = React.useState<string[]>([]);
  const [hasAutoJumpedToModel, setHasAutoJumpedToModel] = React.useState(false);
  const logEndRef = React.useRef<HTMLDivElement>(null);

  // 本地安装状态：只在用户点了"开始安装"后才跟踪
  const localInstallStatus: string | undefined = hasStartedInstall
    ? setupSettings.setupInstallStatus
    : undefined;
  const platform = environmentCheck.platform || setupSettings.detectedPlatform || 'darwin';
  const isWindows = platform === 'win32';
  const platformLabel = isWindows ? 'Windows (WSL2)' : (environmentCheck.platformLabel || 'macOS / Linux');

  // 自动滚动到日志底部
  React.useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [installLogs]);

  // 监听实时输出
  React.useEffect(() => {
    if (typeof window.electronAPI?.onInstallOutput !== 'function') return;
    const unsubscribe = window.electronAPI.onInstallOutput((event) => {
      if (event.data) {
        // 过滤 ANSI 转义码
        const clean = event.data.replace(/\x1b\[[0-9;]*m/g, '').trim();
        if (clean) setInstallLogs((prev) => [...prev, clean]);
      }
    });
    return unsubscribe;
  }, []);

  // 监听安装进度事件
  React.useEffect(() => {
    if (typeof window.electronAPI?.onInstallProgress !== 'function') return;
    const unsubscribe = window.electronAPI.onInstallProgress((event: InstallProgressEvent) => {
      setInstallSteps((prev) =>
        prev.map((step) =>
          step.stage === event.stage
            ? { ...step, status: event.status, message: event.message }
            : step,
        ),
      );
      if (event.message) {
        const prefix = event.status === 'error' ? '[错误] ' : event.status === 'done' ? '[完成] ' : '[进行中] ';
        setInstallLogs((prev) => [...prev, `${prefix}${event.message}`]);
      }
    });
    return unsubscribe;
  }, []);

  React.useEffect(() => {
    if (subStep === 'install' && hasStartedInstall && setupSettings.setupInstallStatus === 'succeeded' && !hasAutoJumpedToModel) {
      setHasAutoJumpedToModel(true);
      setSubStep('model');
    }
  }, [setupSettings.setupInstallStatus, subStep, hasStartedInstall, hasAutoJumpedToModel]);

  // 进入 install 步骤时检测是否已安装
  React.useEffect(() => {
    if (subStep !== 'install' || existingInstallChecked) return;
    setExistingInstallChecked(true);
    window.electronAPI?.setupEnvironmentCheck?.().then((res) => {
      if (res?.openclawInstalled && res.openclawVersion) {
        setExistingInstall({ version: res.openclawVersion.trim(), path: res.openclawCommand ?? res.openclawRootDir ?? '' });
      }
    }).catch(() => {});
  }, [subStep, existingInstallChecked]);

  // ── Task 3.1: Agent 子步骤进入时检测已有 agent ──────────────────────────
  // 当 subStep 切换到 'agent' 时，调用 agentsGetAll 查询系统中已有的 agent 列表
  const [agentLoadError, setAgentLoadError] = React.useState('');
  React.useEffect(() => {
    if (subStep !== 'agent') return;
    const detectAgents = async () => {
      setAgentPageMode('loading');
      setAgentLoadError('');
      try {
        if (typeof window.electronAPI?.agentsGetAll === 'function') {
          const result = await window.electronAPI.agentsGetAll();
          if (result.success && Array.isArray(result.agents) && result.agents.length > 0) {
            // 已有 agent（包括 openclaw onboard 创建的 main agent）
            const agents = result.agents.map((a: any) => ({
              id: a.id ?? a.name ?? '',
              name: a.name ?? a.id ?? '',
              model: typeof a.model === 'string' ? a.model : a.model?.primary,
              workspace: a.workspace ?? '',
            }));
            setExistingAgents(agents);
            // 默认选中第一个（通常是 main agent）
            setSelectedAgentId(agents[0]?.id ?? '');
            setAgentPageMode('has-existing');

            // ── 对每个 agent 调用 agents:checkCompleteness 获取完整性报告 ──
            const completenessMap: Record<string, any> = {};
            for (const agent of agents) {
              try {
                const checkResult = await window.electronAPI?.agentsCheckCompleteness?.(agent.id);
                if (checkResult?.success && checkResult.report) {
                  completenessMap[agent.id] = checkResult.report;
                }
              } catch (err) {
                // IPC 不可用时降级处理：不显示完整性状态
                console.warn(`[SetupLocalInstallGuidePage] 检查 agent ${agent.id} 完整性失败:`, err);
              }
            }
            setAgentCompletenessMap(completenessMap);
            return;
          }
        }
      } catch (err) {
        console.warn('[SetupLocalInstallGuidePage] 检测 agents 失败:', err);
        setAgentLoadError(err instanceof Error ? err.message : '查询智能体列表失败');
        // 检测失败时保持 loading 状态，由 UI 显示错误提示和重试按钮
        return;
      }
      // 无 agent 或检测失败，进入创建模式
      setAgentPageMode('create-new');
    };
    void detectAgents();
  }, [subStep]);

  // ── Agent 创建表单：名称变化时自动生成工作区路径 ──────────────────────────
  React.useEffect(() => {
    if (!agentWorkspaceManuallyEdited && agentName.trim()) {
      setAgentWorkspace(generateWorkspacePath(agentName.trim()));
    }
  }, [agentName, agentWorkspaceManuallyEdited]);

  // ── Task 6.1: Bind 子步骤进入时查询可绑定渠道信息 ──────────────────────────
  // 当 subStep 切换到 'bind' 且 createdAgent 存在时，调用 IPC 查询可绑定的渠道账户
  React.useEffect(() => {
    if (subStep !== 'bind') return;

    // 无 createdAgent 时不查询（UI 会显示「请先配置智能体」提示）
    if (!createdAgent) return;

    const fetchBindableInfo = async () => {
      setIsLoadingBindInfo(true);
      setBindLoadError('');

      try {
        if (typeof window.electronAPI?.coreConfigGetAgentBindableInfo !== 'function') {
          // IPC 不可用时，回退到空列表
          setBindableAccounts([]);
          setExistingBindingKeys(new Set());
          return;
        }

        const result = await window.electronAPI.coreConfigGetAgentBindableInfo(createdAgent.id);

        if (!result.success) {
          setBindLoadError(result.error || '查询绑定信息失败');
          return;
        }

        // 构建已绑定 key 集合（channelKey/accountId 格式）
        const boundKeys = new Set(
          result.existingBindings
            .filter((b: any) => b.channel)
            .map((b: any) => `${b.channel}/${b.accountId || 'default'}`),
        );
        setExistingBindingKeys(boundKeys);

        // 全局绑定映射（channelKey/accountId → agentId）
        const accountBindings = result.accountBindings || {};

        // 从 channelAccounts 构建可绑定的账户列表
        const accounts: Array<{
          channelKey: string;
          accountId: string;
          checkKey: string;
          displayLabel: string;
          boundAgentId: string;
        }> = [];
        const channelAccountsMap = result.channelAccounts || {};

        for (const channelKey of result.availableChannels) {
          const accountIds = channelAccountsMap[channelKey];
          if (accountIds && accountIds.length > 0) {
            // 渠道下有账户：为每个账户创建一个条目
            for (const accountId of accountIds) {
              const checkKey = `${channelKey}/${accountId}`;
              accounts.push({
                channelKey,
                accountId,
                checkKey,
                displayLabel: `${channelKey} / ${accountId}`,
                boundAgentId: accountBindings[checkKey] || '',
              });
            }
          } else {
            // 渠道下无账户配置：回退到 provider 级别（使用 default）
            const checkKey = `${channelKey}/default`;
            accounts.push({
              channelKey,
              accountId: 'default',
              checkKey,
              displayLabel: channelKey,
              boundAgentId: accountBindings[checkKey] || '',
            });
          }
        }
        setBindableAccounts(accounts);
      } catch (err) {
        setBindLoadError(err instanceof Error ? err.message : '查询绑定信息时发生未知错误');
      } finally {
        setIsLoadingBindInfo(false);
      }
    };

    void fetchBindableInfo();
  }, [subStep, createdAgent]);

  const handleInstall = async () => {
    setInstallSteps(INITIAL_INSTALL_STEPS);
    setInstallLogs([]);
    setHasStartedInstall(true);
    setHasAutoJumpedToModel(false);
    await installOpenClawForSetup(selectedVersion || undefined);
  };

  // ── Channels 子步骤：渠道颜色映射 ──────────────────────────────────────
  /** 渠道图标颜色映射 */
  const channelColors: Record<string, string> = {
    telegram: '#26A5E4', whatsapp: '#25D366', discord: '#5865F2',
    signal: '#3A76F0', googlechat: '#00AC47', mattermost: '#0058CC',
    imessage: '#5AC8FA', feishu: '#3370FF', slack: '#E01E5A',
  };

  // ── Channels 子步骤：Provider 启用/禁用切换 ────────────────────────────
  /** 切换 provider 启用状态，启用时自动创建默认账户实例 */
  const handleChannelToggle = React.useCallback((key: string, enabled: boolean) => {
    updateChannelConfig(key, {
      enabled,
      ...(!enabled ? { testStatus: 'idle' as const, testError: undefined } : {}),
    });
    if (enabled) {
      // 启用时：如果该 provider 还没有账户，自动创建一个默认账户
      const existing = channelAccounts[key] || [];
      if (existing.length === 0) {
        dispatch({
          type: 'ADD_CHANNEL_ACCOUNT',
          payload: {
            provider: key,
            account: { _stableKey: crypto.randomUUID(), accountId: 'default', fieldValues: {} },
          },
        });
      }
    }
  }, [updateChannelConfig, channelAccounts, dispatch]);

  // ── Channels 子步骤：账户管理操作 ──────────────────────────────────────
  /** 添加新账户到指定 provider */
  const handleChannelAddAccount = React.useCallback((provider: string) => {
    const existing = channelAccounts[provider] || [];
    let suffix = existing.length + 1;
    let newId = `account-${suffix}`;
    const existingIds = existing.map((a) => a.accountId);
    while (existingIds.includes(newId)) { suffix++; newId = `account-${suffix}`; }
    dispatch({
      type: 'ADD_CHANNEL_ACCOUNT',
      payload: {
        provider,
        account: { _stableKey: crypto.randomUUID(), accountId: newId, fieldValues: {} },
      },
    });
  }, [channelAccounts, dispatch]);

  /** 更新账户字段值 */
  const handleChannelFieldChange = React.useCallback((provider: string, accountId: string, fieldId: string, value: string) => {
    dispatch({
      type: 'UPDATE_CHANNEL_ACCOUNT',
      payload: {
        provider,
        accountId,
        updates: {
          fieldValues: {
            ...(channelAccounts[provider]?.find((a) => a.accountId === accountId)?.fieldValues || {}),
            [fieldId]: value,
          },
        },
      },
    });
  }, [channelAccounts, dispatch]);

  /** 更新 accountId */
  const handleChannelAccountIdChange = React.useCallback((provider: string, oldAccountId: string, newAccountId: string) => {
    dispatch({
      type: 'UPDATE_CHANNEL_ACCOUNT',
      payload: {
        provider,
        accountId: oldAccountId,
        updates: { accountId: newAccountId },
      },
    });
  }, [dispatch]);

  /** 删除账户 */
  const handleChannelDeleteAccount = React.useCallback((provider: string, accountId: string) => {
    dispatch({
      type: 'REMOVE_CHANNEL_ACCOUNT',
      payload: { provider, accountId },
    });
  }, [dispatch]);

  // ── Channels 子步骤：已启用渠道计数 ────────────────────────────────────
  /** 已启用的渠道 provider 数量 */
  const enabledProviderCount = channelConfigs.filter((ch) => ch.enabled).length;

  // ── Channels 子步骤：CLI 添加渠道 ──────────────────────────────────────
  /** 点击「继续」按钮时的处理逻辑（两阶段：第一次添加渠道，第二次导航） */
  const handleChannelsContinue = async () => {
    // 阶段二：已完成添加，用户查看结果后再次点击「继续」，导航到 daemon 子步骤
    if (channelAddCompleted) {
      setSubStep('daemon');
      return;
    }
    // 没有启用任何渠道时，直接导航
    if (enabledProviderCount === 0) {
      await saveChannelConfigs();
      setSubStep('daemon');
      return;
    }
    // 阶段一：执行 CLI 批量添加渠道
    setIsAddingChannels(true);
    try {
      await addEnabledChannels();
      await saveChannelConfigs();
      // 标记添加完成，停留在当前页面展示结果摘要
      setChannelAddCompleted(true);
    } finally {
      setIsAddingChannels(false);
    }
  };

  // ── Task 3.4: Agent 创建提交逻辑 ──────────────────────────────────────────
  const handleCreateAgent = async () => {
    setAgentCreateError('');
    // 使用 validateBasicInfo 校验名称和工作区路径
    const validationErrors = validateBasicInfo({ name: agentName, workspace: agentWorkspace }, t);
    setAgentErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;

    setIsCreatingAgent(true);
    try {
      const payload: { name: string; workspace: string; model?: string } = {
        name: agentName.trim(),
        workspace: agentWorkspace.trim(),
      };
      if (agentModel) payload.model = agentModel;

      const result = await window.electronAPI.agentsCreate(payload);

      if (result.success && result.agent) {
        // 创建成功：写入引导流程状态并持久化
        setCreatedAgent({ id: result.agent.id, name: result.agent.name });

        // 验证 agent 是否已写入 openclaw.json（失败仅 console.warn，不阻塞流程）
        let verifiedAgentInfo: Record<string, unknown> | undefined;
        if (typeof window.electronAPI?.coreConfigVerifyAgent === 'function') {
          try {
            const verifyResult = await window.electronAPI.coreConfigVerifyAgent(result.agent.id);
            if (verifyResult.success && verifyResult.exists) {
              verifiedAgentInfo = verifyResult.agent;
            }
          } catch (verifyErr) {
            console.warn('[SetupLocalInstallGuidePage] agent 持久化验证异常:', verifyErr);
          }
        }

        await persistPartialState({
          createdAgentName: result.agent.name,
          createdAgentId: result.agent.id,
          createdAgentWorkspace: (verifiedAgentInfo?.workspace as string | undefined) ?? payload.workspace,
          createdAgentModel: (verifiedAgentInfo?.model as string | undefined) ?? payload.model,
        });

        // 创建成功后自动导航到 bind 子步骤
        setSubStep('bind');
      } else {
        // 创建失败：格式化错误信息
        const rawError = result.error || '创建智能体失败，请重试';
        setAgentCreateError(formatCreateError(rawError, agentName.trim()));
      }
    } catch (err) {
      setAgentCreateError(err instanceof Error ? err.message : '创建智能体时发生未知错误');
    } finally {
      setIsCreatingAgent(false);
    }
  };

  // ── Task 3.5: 已有 Agent 选择提交逻辑 ─────────────────────────────────────
  // ── Task 3.5: 已有 Agent 选择提交逻辑 ─────────────────────────────────────
  /** 认领表单：确认并修复逻辑 */
  const handleClaimAndRepair = async () => {
    const agent = existingAgents.find((a) => a.id === selectedAgentId);
    if (!agent) return;

    // 前端名称校验：非空、仅 ASCII 字母/数字/连字符/下划线
    const trimmed = claimAgentName.trim();
    if (!trimmed) {
      setClaimNameError('请输入智能体名称');
      return;
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
      setClaimNameError('名称仅允许 ASCII 字母、数字、连字符和下划线');
      return;
    }
    setClaimNameError('');
    setIsRepairing(true);
    setRepairError('');

    try {
      // 若名称有变更，先调用 agents:rename 更新名称
      if (trimmed !== agent.name) {
        const renameResult = await window.electronAPI?.agentsRename?.(agent.id, trimmed);
        if (renameResult && !renameResult.success) {
          setRepairError(renameResult.error || '重命名失败');
          setIsRepairing(false);
          return;
        }
      }

      // 调用 agents:repairCompleteness 补全缺失配置
      const repairResult = await window.electronAPI?.agentsRepairCompleteness?.(agent.id);
      if (repairResult && !repairResult.success) {
        setRepairError(repairResult.error || '修复配置失败');
        setIsRepairing(false);
        return;
      }

      // 修复成功：写入引导流程状态并导航到 bind 子步骤
      const finalName = trimmed || agent.name;
      setCreatedAgent({ id: agent.id, name: finalName });
      await persistPartialState({
        createdAgentName: finalName,
        createdAgentId: agent.id,
        createdAgentWorkspace: agent.workspace,
        createdAgentModel: agent.model,
      });
      setShowClaimForm(false);
      setSubStep('bind');
    } catch (err) {
      setRepairError(err instanceof Error ? err.message : '修复过程中发生未知错误');
    } finally {
      setIsRepairing(false);
    }
  };

  const handleUseExistingAgent = async () => {
    const agent = existingAgents.find((a) => a.id === selectedAgentId);
    if (!agent) return;

    // 选择不完整 agent 时，显示认领表单而非直接导航
    if (isAgentComplete(agent.id) === false) {
      setClaimAgentName(agent.name);
      setClaimNameError('');
      setRepairError('');
      setShowClaimForm(true);
      return;
    }

    // 选择已完整 agent 时，直接导航到 bind 子步骤（现有行为不变）
    setCreatedAgent({ id: agent.id, name: agent.name });
    await persistPartialState({
      createdAgentName: agent.name,
      createdAgentId: agent.id,
      createdAgentWorkspace: agent.workspace,
      createdAgentModel: agent.model,
    });

    // 选择后自动导航到 bind 子步骤
    setSubStep('bind');
  };

  const cardStyle = { backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)' };
  const mutedText = { color: 'var(--app-text-muted)' };
  const elevatedBg = { backgroundColor: 'var(--app-bg-elevated)', borderColor: 'var(--app-border)' };

  // ── 完整性状态辅助函数 ──────────────────────────────────────────────────
  /** 判断 agent 配置是否完整 */
  const isAgentComplete = (agentId: string): boolean | null => {
    const report = agentCompletenessMap[agentId];
    if (!report) return null; // 无报告时返回 null（IPC 不可用或未检查）
    if (report.workspaceDir === 'missing') return false;
    if (report.agentConfigDir === 'missing') return false;
    if (report.modelsJson === 'missing') return false;
    const wf = report.workspaceFiles || {};
    for (const key of Object.keys(wf)) {
      if (wf[key] === 'missing') return false;
    }
    return true;
  };

  /** 生成缺失项摘要文本 */
  const getMissingSummary = (agentId: string): string => {
    const report = agentCompletenessMap[agentId];
    if (!report) return '';
    const parts: string[] = [];
    // 统计缺失的 workspace 文件数量
    const wf = report.workspaceFiles || {};
    const missingFileCount = Object.values(wf).filter((v) => v === 'missing').length;
    if (report.workspaceDir === 'missing') {
      parts.push('workspace 目录');
    } else if (missingFileCount > 0) {
      parts.push(`${missingFileCount} 个 workspace 文件`);
    }
    if (report.agentConfigDir === 'missing') {
      parts.push('配置目录');
    }
    if (report.modelsJson === 'missing') {
      parts.push('models.json');
    }
    return parts.length > 0 ? `缺少 ${parts.join('、')}` : '';
  };

  // ── 各 subStep 对应的底部固定按钮区域 ──────────────────────────────────────
  const footer = React.useMemo(() => {
    if (subStep === 'platform') {
      return (
        <div className="flex flex-wrap items-center gap-3">
          <AppButton variant="secondary" onClick={() => navigate('/setup/local/check')}>返回检测</AppButton>
          <AppButton variant="primary" onClick={() => setSubStep('install')} icon={<ChevronRight size={15} />}>
            确认，开始安装
          </AppButton>
        </div>
      );
    }
    if (subStep === 'install') {
      return (
        <div className="flex flex-wrap items-center gap-3">
          <AppButton variant="secondary" onClick={() => setSubStep('platform')} disabled={isBusy}>上一步</AppButton>
          {(!existingInstall || hasStartedInstall) && localInstallStatus !== 'succeeded' && (
            <AppButton variant="primary" onClick={() => void handleInstall()} disabled={isBusy}
              icon={isBusy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}>
              {isBusy ? '正在安装…' : hasStartedInstall && localInstallStatus === 'failed' ? '重新安装' : '开始安装'}
            </AppButton>
          )}
          {localInstallStatus === 'succeeded' && (
            <AppButton variant="primary" onClick={() => setSubStep('model')} icon={<ChevronRight size={15} />}>
              继续
            </AppButton>
          )}
        </div>
      );
    }
    if (subStep === 'model') {
      return (
        <div className="flex flex-wrap items-center gap-3">
          <AppButton variant="secondary" onClick={() => setSubStep('install')}>上一步</AppButton>
          <AppButton
            variant={modelTestStatus === 'ok' ? 'secondary' : 'primary'}
            disabled={!modelProvider || modelTestStatus === 'testing'}
            icon={modelTestStatus === 'testing' ? <Loader2 size={14} className="animate-spin" /> : undefined}
            onClick={async () => {
              setModelTestStatus('testing');
              setModelTestError('');
              const result = await window.electronAPI?.testModelConnection?.({
                provider: modelProvider,
                model: modelName,
                apiKey: apiKey || undefined,
                baseUrl: baseUrl || undefined,
              });
              if (result?.success) {
                setModelTestStatus('ok');
              } else {
                setModelTestStatus('error');
                setModelTestError(result?.error ?? '连通性测试失败');
              }
            }}
          >
            {modelTestStatus === 'testing' ? '测试中…' : '测试连通性'}
          </AppButton>
          {modelTestStatus === 'ok' && (
            <AppButton variant="primary" onClick={() => setSubStep('workspace')} icon={<ChevronRight size={15} />}>
              继续
            </AppButton>
          )}
        </div>
      );
    }
    if (subStep === 'workspace') {
      return (
        <div className="flex flex-wrap items-center gap-3">
          <AppButton variant="secondary" onClick={() => setSubStep('model')}>上一步</AppButton>
          <AppButton variant="primary" onClick={() => setSubStep('gateway')} disabled={!workspaceDir.trim()} icon={<ChevronRight size={15} />}>
            继续
          </AppButton>
        </div>
      );
    }
    if (subStep === 'gateway') {
      return (
        <div className="flex flex-wrap items-center gap-3">
          <AppButton variant="secondary" onClick={() => setSubStep('workspace')}>上一步</AppButton>
          <AppButton variant="primary" onClick={() => setSubStep('channels')} icon={<ChevronRight size={15} />}>
            确认配置
          </AppButton>
        </div>
      );
    }
    if (subStep === 'channels') {
      // 渠道子步骤底部按钮：两阶段逻辑
      // 阶段一：点击「继续」执行 CLI 添加渠道
      // 阶段二：添加完成后再次点击「继续」导航到 daemon
      const channelsButtonsDisabled = isBusy || isAddingChannels;
      return (
        <div className="flex flex-wrap items-center gap-3">
          <AppButton variant="secondary" onClick={() => setSubStep('gateway')} disabled={channelsButtonsDisabled}>上一步</AppButton>
          {enabledProviderCount === 0 && !channelAddCompleted && (
            <AppButton
              variant="secondary"
              onClick={() => { void saveChannelConfigs(); setSubStep('daemon'); }}
              disabled={channelsButtonsDisabled}
              icon={<SkipForward size={14} />}
            >
              跳过
            </AppButton>
          )}
          <AppButton
            variant="primary"
            onClick={() => void handleChannelsContinue()}
            disabled={channelsButtonsDisabled}
            icon={isAddingChannels
              ? <Loader2 size={15} className="animate-spin" />
              : <ChevronRight size={15} />
            }
          >
            {isAddingChannels ? '添加中…' : '继续'}
          </AppButton>
        </div>
      );
    }
    if (subStep === 'daemon') {
      return (
        <div className="flex flex-wrap items-center gap-3">
          <AppButton variant="secondary" onClick={() => setSubStep('channels')}>上一步</AppButton>
          <AppButton variant="primary" onClick={() => setSubStep('skills')} icon={<ChevronRight size={15} />}>继续</AppButton>
        </div>
      );
    }
    if (subStep === 'skills') {
      return (
        <div className="flex flex-wrap items-center gap-3">
          <AppButton variant="secondary" onClick={() => setSubStep('daemon')}>上一步</AppButton>
          <AppButton variant="primary" onClick={() => setSubStep('agent')} icon={<ChevronRight size={15} />}>继续</AppButton>
        </div>
      );
    }
    if (subStep === 'agent') {
      // 根据 agentPageMode 显示不同的操作按钮
      if (agentPageMode === 'loading' && agentLoadError) {
        // 加载失败：显示重试和跳过按钮
        return (
          <div className="flex flex-wrap items-center gap-3">
            <AppButton variant="secondary" onClick={() => setSubStep('skills')}>上一步</AppButton>
            <AppButton variant="secondary" onClick={() => { setAgentLoadError(''); setSubStep('bind'); }} icon={<SkipForward size={14} />}>跳过</AppButton>
            <AppButton variant="primary" onClick={() => { setAgentLoadError(''); setSubStep('agent'); }}>重试</AppButton>
          </div>
        );
      }
      if (agentPageMode === 'has-existing') {
        return (
          <div className="flex flex-wrap items-center gap-3">
            <AppButton variant="secondary" onClick={() => setSubStep('skills')}>上一步</AppButton>
            <AppButton variant="secondary" onClick={() => setSubStep('bind')} icon={<SkipForward size={14} />}>跳过</AppButton>
            <AppButton
              variant="primary"
              onClick={() => void handleUseExistingAgent()}
              disabled={!selectedAgentId}
              icon={<CheckCircle2 size={15} />}
            >
              使用此智能体
            </AppButton>
          </div>
        );
      }
      if (agentPageMode === 'create-new') {
        return (
          <div className="flex flex-wrap items-center gap-3">
            <AppButton variant="secondary" onClick={() => setSubStep('skills')}>上一步</AppButton>
            <AppButton variant="secondary" onClick={() => setSubStep('bind')} icon={<SkipForward size={14} />}>跳过</AppButton>
            <AppButton
              variant="primary"
              onClick={() => void handleCreateAgent()}
              disabled={isCreatingAgent}
              icon={isCreatingAgent ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
            >
              {isCreatingAgent ? '创建中…' : '创建'}
            </AppButton>
          </div>
        );
      }
      // loading 状态：仅显示上一步
      return (
        <div className="flex flex-wrap items-center gap-3">
          <AppButton variant="secondary" onClick={() => setSubStep('skills')}>上一步</AppButton>
        </div>
      );
    }
    if (subStep === 'bind') {
      // ── Task 6.3: Bind 子步骤底部按钮 ──────────────────────────────────
      // 「上一步」→ agent，「继续」→ 执行绑定写入后导航到 done，「跳过」→ done
      const bindButtonsDisabled = isLoadingBindInfo || isBinding;
      return (
        <div className="flex flex-wrap items-center gap-3">
          <AppButton variant="secondary" onClick={() => setSubStep('agent')} disabled={bindButtonsDisabled}>上一步</AppButton>
          <AppButton
            variant="secondary"
            onClick={() => setSubStep('done')}
            disabled={bindButtonsDisabled}
            icon={<SkipForward size={14} />}
          >
            跳过
          </AppButton>
          <AppButton
            variant="primary"
            onClick={async () => {
              // 无 createdAgent 或无勾选项时直接导航
              if (!createdAgent) {
                setSubStep('done');
                return;
              }
              // 获取已勾选的未绑定账户
              const unboundAccts = bindableAccounts.filter((a) => !existingBindingKeys.has(a.checkKey));
              const checkedAccts = unboundAccts.filter((a) => bindChecked[a.checkKey]);
              if (checkedAccts.length === 0) {
                setSubStep('done');
                return;
              }

              // 逐个写入绑定
              setIsBinding(true);
              setBindError('');
              const successBindings: Array<{ agentId: string; channelKey: string; accountId: string }> = [];
              try {
                for (const a of checkedAccts) {
                  try {
                    const result = await window.electronAPI.coreConfigWriteBinding(
                      createdAgent.id,
                      a.channelKey,
                      a.accountId,
                    );
                    if (result.success) {
                      successBindings.push({
                        agentId: createdAgent.id,
                        channelKey: a.channelKey,
                        accountId: a.accountId,
                      });
                    } else {
                      console.warn(`绑定写入失败 [${a.checkKey}]:`, result.error);
                    }
                  } catch (err) {
                    console.warn(`绑定写入异常 [${a.checkKey}]:`, err);
                  }
                }

                // 将成功写入的绑定同步到引导流程状态
                if (successBindings.length > 0) {
                  dispatch({ type: 'SET_AGENT_CHANNEL_BINDINGS', payload: successBindings });
                }

                // 更新已完成绑定数量（用于 done 子步骤配置摘要展示）
                setCompletedBindings(successBindings.length);

                // 绑定完成后导航到 done 子步骤
                setSubStep('done');
              } catch (err) {
                setBindError(err instanceof Error ? err.message : '写入绑定时发生未知错误');
              } finally {
                setIsBinding(false);
              }
            }}
            disabled={bindButtonsDisabled}
            icon={isBinding ? <Loader2 size={15} className="animate-spin" /> : <Link2 size={15} />}
          >
            {isBinding ? '绑定中…' : '继续'}
          </AppButton>
        </div>
      );
    }
    if (subStep === 'done') {
      return (
        <div className="flex flex-wrap items-center gap-3">
          <AppButton variant="secondary" onClick={() => setSubStep('bind')}>返回修改</AppButton>
          <AppButton variant="primary" disabled={isSaving} icon={isSaving ? <Loader2 size={14} className="animate-spin" /> : <ChevronRight size={15} />}
            onClick={async () => {
              setIsSaving(true);
              setSaveError('');
              try {
                // ── 步骤 1：读取现有配置作为基础 ────────────────────────────
                const existing = await window.electronAPI?.configGet?.();
                const base = existing?.success && existing.config ? existing.config : {};

                // ── 步骤 2：构建原始配置对象 ─────────────────────────────────
                // 注意：此处仍包含不兼容字段（daemon、skills.install.recommended），
                // 将在步骤 3 中由 sanitizeSetupConfig 过滤
                const raw = {
                  ...base,
                  agents: {
                    ...(base.agents ?? {}),
                    defaults: {
                      ...((base.agents as any)?.defaults ?? {}),
                      model: { primary: modelName || undefined },
                    },
                  },
                  gateway: {
                    ...(base.gateway ?? {}),
                    // 显式设置本地模式，覆盖 base.gateway 中可能存在的任何值
                    mode: 'local',
                    // 为全新安装提供合理的默认 host 值
                    host: '127.0.0.1',
                    port: parseInt(gatewayPort, 10) || 18789,
                    auth: gatewayAuth === 'none' ? undefined : { mode: gatewayAuth },
                    bind: gatewayBind,
                  },
                  session: {
                    ...(base.session ?? {}),
                    dmScope,
                  },
                  channels: {
                    ...(base.channels ?? {}),
                    ...(channelTokens.telegram ? { telegram: { botToken: channelTokens.telegram } } : {}),
                    ...(channelTokens.discord ? { discord: { token: channelTokens.discord } } : {}),
                    ...(channelTokens.googlechat ? { googlechat: { webhookUrl: channelTokens.googlechat } } : {}),
                    ...(channelTokens.mattermost ? { mattermost: { webhookUrl: channelTokens.mattermost } } : {}),
                  },
                  // daemon 为根级字段，sanitizeSetupConfig 会将其过滤掉
                  // daemon 偏好将单独保存到 electron-store（步骤 4）
                  daemon: {
                    ...(base.daemon ?? {}),
                    install: installDaemon,
                    runtime: daemonRuntime,
                  },
                  skills: {
                    ...(base.skills ?? {}),
                    install: {
                      ...((base.skills as any)?.install ?? {}),
                      // recommended 字段 schema 不兼容，sanitizeSetupConfig 会将其过滤掉
                      // installRecommendedSkills 偏好将单独保存到 electron-store（步骤 4）
                      recommended: installRecommendedSkills,
                    },
                  },
                };

                // ── 步骤 3：过滤 schema 不兼容字段 ──────────────────────────
                // sanitizeSetupConfig 会移除：
                //   - skills.install.recommended（schema 不识别该 key）
                //   - 根级 daemon（schema 不包含该字段）
                const sanitized = sanitizeSetupConfig(raw as Record<string, unknown>);

                // ── 步骤 4：将 daemon 和 skills 偏好保存到 electron-store ────
                // 这些字段不写入 openclaw.json，仅在桌面端本地持久化
                await window.electronAPI?.settingsSet?.({
                  // daemon 安装偏好：是否安装后台服务
                  setupInstallDaemon: installDaemon,
                  // daemon 运行时偏好：node（系统 Node.js）或 bundled（内置运行时）
                  setupDaemonRuntime: daemonRuntime,
                  // 推荐 Skills 安装偏好：是否安装推荐 Skills 套件
                  setupInstallRecommendedSkills: installRecommendedSkills,
                });

                // ── 步骤 5：将过滤后的配置写入 openclaw.json ────────────────
                const saveResult = await window.electronAPI?.configSet?.(sanitized);
                if (!saveResult?.success) {
                  setSaveError(saveResult?.error ?? '保存配置失败，请重试。');
                  return;
                }

                // ── 步骤 5.5：将 model 配置写入选中 agent 的 models.json ────
                // 当用户在 Setup 流程中选择/创建了 agent 且配置了模型时，
                // 将 provider 信息和主模型名称写入该 agent 独立的 models.json，
                // 使 agent 拥有独立的模型配置而非仅依赖全局默认值。
                // 写入失败仅 console.warn，不阻断整体保存流程。
                if (createdAgent && modelName) {
                  try {
                    await window.electronAPI?.agentsWriteModelsJson?.(createdAgent.id, {
                      providers: {
                        [modelProvider]: {
                          apiKey: apiKey || undefined,
                          baseUrl: baseUrl || undefined,
                        },
                      },
                      primary: modelName,
                    });
                  } catch (err) {
                    console.warn('[done] 写入 agent models.json 失败:', err);
                  }
                }

                // ── 步骤 6：持久化 agent 信息和渠道绑定到 electron-store ────
                await persistPartialState({
                  ...(createdAgent ? {
                    createdAgentName: createdAgent.name,
                    createdAgentId: createdAgent.id,
                  } : {}),
                  setupCompleted: true,
                });

                // Bug 2 修复：保存成功后直接跳转到最终验证页面
                // 修复前：导航到 /setup/local/configure，该页面会继续引导进入
                //         /setup/local/channels（独立的 SetupChannelsPage），
                //         与本页内嵌的 channels 子步骤重复，用户需要配置两次。
                //         之后还会进入 /setup/local/create-agent，但 openclaw onboard
                //         已自动创建 main agent，用户输入 "main" 会报 reserved 错误。
                // 修复后：直接跳转到 /setup/local/verify，跳过重复的 channels、
                //         create-agent、bind-channels 路由。
                navigate('/setup/local/verify');
              } catch (e) {
                setSaveError(String(e));
              } finally {
                setIsSaving(false);
              }
            }}>
            {isSaving ? '保存中…' : '继续'}
          </AppButton>
        </div>
      );
    }
    return null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subStep, isBusy, existingInstall, hasStartedInstall, localInstallStatus, modelProvider, modelTestStatus, workspaceDir, enabledChannels, isSaving, agentPageMode, agentLoadError, selectedAgentId, isCreatingAgent, isAddingChannels, channelAddCompleted, enabledProviderCount, isLoadingBindInfo, isBinding, bindableAccounts, existingBindingKeys, bindChecked, createdAgent, bindError, completedBindings]);

  return (
    <SetupLayout
      title="安装 OpenClaw"
      description="桌面端将自动完成 OpenClaw 的安装与初始配置，全程无需打开终端或输入任何命令。"
      stepLabel="步骤 4 / 6"
      footer={footer}
    >
      <StepBar current={subStep} />

      {/* ── 平台确认 ── */}
      {subStep === 'platform' && (
        <div className="space-y-4">
          <div className="rounded-2xl border p-5" style={cardStyle}>
            <div className="flex items-center gap-3 text-sm font-semibold">
              <Laptop size={16} />
              检测到的平台：{platformLabel}
            </div>
            <div className="mt-3 text-sm leading-6" style={mutedText}>
              {isWindows
                ? '桌面端将在 Windows 上通过 WSL2 自动完成 OpenClaw 的安装���请确保已启用 WSL2。'
                : '桌面端将自动下载并安装 OpenClaw，安装过程完全在后台进行。'}
            </div>
          </div>

          <div className="rounded-2xl border p-5" style={cardStyle}>
            <div className="mb-3 text-sm font-semibold">安装将自动完成以下步骤</div>
            <div className="space-y-2">
              {[
                '检测当前系统环境',
                '下载 OpenClaw 安装包',
                '完成安装并初始化数据目录',
                '验证安装结果',
              ].map((item) => (
                <div key={item} className="flex items-center gap-3 rounded-xl border px-4 py-2.5 text-sm" style={{ ...elevatedBg, ...mutedText }}>
                  <CheckCircle2 size={13} style={{ color: 'var(--app-active-text)', flexShrink: 0 }} />
                  {item}
                </div>
              ))}
            </div>
          </div>

          {isWindows && (
            <div className="rounded-2xl border p-4 text-sm leading-6"
              style={{ backgroundColor: 'rgba(245,158,11,0.08)', borderColor: 'rgba(245,158,11,0.24)', ...mutedText }}>
              <div className="mb-1 flex items-center gap-2 font-medium" style={{ color: '#fbbf24' }}>
                <AlertCircle size={14} /> Windows 用户注意
              </div>
              请确保已安装并启用 WSL2，桌面端将通过 WSL2 完成安装。
            </div>
          )}

        </div>
      )}

      {/* ── 下载安装 ── */}
      {subStep === 'install' && (
        <div className="space-y-4">
          {/* 已检测到现有安装 */}
          {existingInstall && !hasStartedInstall && (
            <div className="rounded-2xl border p-5 space-y-3" style={{ ...cardStyle, borderColor: 'rgba(16,185,129,0.3)' }}>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <CheckCircle2 size={14} style={{ color: '#34d399' }} />
                检测到已安装的 OpenClaw
              </div>
              <div className="flex items-center justify-between rounded-xl border px-4 py-2.5 text-sm"
                style={{ backgroundColor: 'var(--app-bg-elevated)', borderColor: 'var(--app-border)' }}>
                <span style={mutedText}>版本</span>
                <span className="font-mono text-xs">{existingInstall.version}</span>
              </div>
              {existingInstall.path && (
                <div className="flex items-center justify-between rounded-xl border px-4 py-2.5 text-sm"
                  style={{ backgroundColor: 'var(--app-bg-elevated)', borderColor: 'var(--app-border)' }}>
                  <span style={mutedText}>路径</span>
                  <span className="font-mono text-xs truncate max-w-[60%]">{existingInstall.path}</span>
                </div>
              )}
              <div className="flex flex-wrap gap-3 pt-1">
                <AppButton variant="primary" onClick={() => setSubStep('model')} icon={<ChevronRight size={15} />}>
                  使用已安装版本
                </AppButton>
                <AppButton variant="secondary" onClick={() => setExistingInstall(null)}>
                  重新安装最新版
                </AppButton>
              </div>
            </div>
          )}

          {/* 安装进度 - 水平排列，仅在无已安装或用户选择重装时显示 */}
          {(!existingInstall || hasStartedInstall) && (
          <div className="space-y-4">
          {/* 版本选择器 — 仅在未开始安装时显示 */}
          {!hasStartedInstall && (
            <div className="rounded-2xl border p-5" style={cardStyle}>
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Package size={14} /> 选择安装版本
              </div>
              <div className="flex items-center gap-3">
                <select
                  className="text-sm rounded-lg px-3 py-2 border-0 outline-none cursor-pointer"
                  style={{
                    backgroundColor: 'var(--app-bg-elevated)',
                    color: 'var(--app-text)',
                    border: '1px solid var(--app-border)',
                  }}
                  value={selectedVersion}
                  onChange={(e) => setSelectedVersion(e.target.value)}
                >
                  {(environmentCheck.availableVersions || []).map((v: string) => (
                    <option key={v} value={v}>
                      {v}{v === environmentCheck.recommendedVersion ? ' (推荐)' : ''}
                    </option>
                  ))}
                </select>
                <span className="text-xs" style={mutedText}>
                  推荐版本与 Desktop {environmentCheck.recommendedVersion ? `v${environmentCheck.recommendedVersion}` : ''} 匹配
                </span>
              </div>
            </div>
          )}
          <div className="rounded-2xl border p-5" style={cardStyle}>
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
              <Download size={14} /> 安装进度
            </div>
            <div className="flex items-center gap-2">
              {installSteps.map((step, idx) => (
                <React.Fragment key={step.stage}>
                  <div className="flex flex-1 items-center gap-2 rounded-xl border px-3 py-2.5 text-sm"
                    style={{
                      ...elevatedBg,
                      color: step.status === 'running' || step.status === 'done' ? 'var(--app-text)' : 'var(--app-text-muted)',
                    }}>
                    {step.status === 'running'
                      ? <Loader2 size={13} className="animate-spin" style={{ color: 'var(--app-active-text)', flexShrink: 0 }} />
                      : step.status === 'done'
                        ? <CheckCircle2 size={13} style={{ color: '#34d399', flexShrink: 0 }} />
                        : step.status === 'error'
                          ? <XCircle size={13} style={{ color: '#f87171', flexShrink: 0 }} />
                          : <Circle size={13} style={{ color: 'var(--app-border)', flexShrink: 0 }} />}
                    <span className="truncate">{step.label}</span>
                  </div>
                  {idx < installSteps.length - 1 && (
                    <div className="h-px w-4 flex-shrink-0" style={{ backgroundColor: step.status === 'done' ? '#34d399' : 'var(--app-border)' }} />
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* 实时日志 */}
          <div className="rounded-2xl border p-5 flex flex-col" style={{
            ...cardStyle,
            borderColor: localInstallStatus === 'succeeded'
              ? 'rgba(16,185,129,0.24)'
              : localInstallStatus === 'failed'
                ? 'rgba(239,68,68,0.24)'
                : 'var(--app-border)',
          }}>
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold flex-shrink-0">
              {localInstallStatus === 'running' && <Loader2 size={13} className="animate-spin" style={{ color: 'var(--app-active-text)' }} />}
              {localInstallStatus === 'succeeded' && <CheckCircle2 size={13} style={{ color: '#34d399' }} />}
              {localInstallStatus === 'failed' && <AlertCircle size={13} style={{ color: '#f87171' }} />}
              {(!localInstallStatus || localInstallStatus === 'idle') && <Circle size={13} style={{ color: 'var(--app-border)' }} />}
              实时日志
            </div>
            <div
              className="flex-1 overflow-y-auto rounded-xl p-3 font-mono text-xs leading-5"
              style={{
                backgroundColor: 'var(--app-bg-elevated)',
                border: '1px solid var(--app-border)',
                minHeight: '140px',
                maxHeight: '180px',
                color: 'var(--app-text-muted)',
              }}
            >
              {installLogs.length === 0 ? (
                <span style={{ color: 'var(--app-text-muted)' }}>等待安装开始…</span>
              ) : (
                installLogs.map((log, i) => (
                  <div key={i} style={{
                    color: log.startsWith('[错误]') ? '#fca5a5' : log.startsWith('[完成]') ? '#34d399' : 'var(--app-text-muted)',
                  }}>
                    {log}
                  </div>
                ))
              )}
              <div ref={logEndRef} />
            </div>
          </div>
          </div>
          )}

        </div>
      )}

      {/* ── 模型 / Auth ── */}
      {subStep === 'model' && (
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border p-5 flex flex-col" style={{ ...cardStyle, height: '280px' }}>
            <div className="mb-1 flex items-center gap-2 text-sm font-semibold flex-shrink-0">
              <Zap size={14} /> 选择 AI 模型提供商
            </div>
            <div className="mb-4 text-xs leading-5 flex-shrink-0" style={mutedText}>
              选择你希望使用的 AI 模型，OpenClaw 将通过该模型处理任务和对话。
            </div>
            <div className="overflow-y-auto flex-1 pr-1">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {[
                  'OpenAI',
                  'Anthropic',
                  'Google (Gemini)',
                  'Mistral',
                  'OpenRouter',
                  'Together AI',
                  'Groq',
                  'xAI (Grok)',
                  'Ollama (本地)',
                  'vLLM (本地)',
                  'Amazon Bedrock',
                  'Cloudflare AI',
                  'LiteLLM',
                  'Moonshot (Kimi)',
                  'Qwen',
                  'GLM',
                  'Deepseek',
                  'MiniMax',
                  'Qianfan',
                  'NVIDIA',
                  'Hugging Face',
                  'Venice AI',
                  'Z.AI',
                  '自定义',
                ].map((p) => (
                  <button key={p} type="button" onClick={() => { setModelProvider(p); setModelName(DEFAULT_MODELS[p] ?? ''); setBaseUrl(''); }}
                    className="rounded-xl border px-4 py-3 text-sm font-medium transition-token-normal hover:-translate-y-0.5 focus:outline-none"
                    style={{
                      backgroundColor: modelProvider === p ? 'var(--app-active-bg)' : 'var(--app-bg-elevated)',
                      borderColor: modelProvider === p ? 'var(--app-active-border)' : 'var(--app-border)',
                      color: modelProvider === p ? 'var(--app-active-text)' : 'var(--app-text-muted)',
                    }}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {modelProvider && (
            <div className="rounded-2xl border p-5 flex-shrink-0 space-y-4" style={cardStyle}>
              {/* Bug 1 修复：Base URL 输入框对所有提供商可见（可选填）
                  修复前：仅在选择"自定义"提供商时显示，导致 GLM 等提供商的 baseUrl state
                  始终为空，testModelConnection 使用错误的默认 endpoint 导致第一次必定失败。
                  修复后：所有提供商均显示 Base URL 输入框，标注为可选填，
                  留空则使用 endpointMap 中的默认 endpoint，填写后将覆盖默认值。 */}
              <div>
                <label className="mb-2 block text-sm font-medium">
                  Base URL
                  <span className="ml-2 text-xs font-normal" style={mutedText}>（可选）</span>
                </label>
                <input type="text" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder={modelProvider === '自定义' ? '例如 https://api.example.com/v1' : '留空使用默认 endpoint，填写后将覆盖默认值'}
                  className="w-full rounded-xl border px-4 py-3 text-sm outline-none transition-token-normal focus:ring-2"
                  style={{ ...elevatedBg, color: 'var(--app-text)', outlineColor: 'var(--app-active-border)' }} />
                <div className="mt-2 text-xs" style={mutedText}>
                  留空则使用该提供商的默认 endpoint；如需使用私有部署或代理地址，请在此填写。
                </div>
              </div>

              {!['Ollama (本地)', 'vLLM (本地)'].includes(modelProvider) && (
                <div>
                  <label className="mb-2 block text-sm font-medium">
                    {modelProvider === '自定义' ? 'API Key' : `${modelProvider} API Key`}
                    {modelProvider === '自定义' && (
                      <span className="ml-2 text-xs font-normal" style={mutedText}>（可选）</span>
                    )}
                  </label>
                  <input type="text" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
                    placeholder={modelProvider === '自定义' ? '本地模型可留空' : '请输入 API Key'}
                    className="w-full rounded-xl border px-4 py-3 text-sm outline-none transition-token-normal focus:ring-2"
                    style={{ ...elevatedBg, color: 'var(--app-text)', outlineColor: 'var(--app-active-border)' }} />
                  <div className="mt-2 text-xs" style={mutedText}>
                    {modelProvider === '自定义'
                      ? '本地运行的模型无需 API Key，远程服务请填写对应密钥。密钥仅保存在本地。'
                      : 'API Key 仅保存在本地，不会上传到任何服务器。'}
                  </div>
                </div>
              )}

              <div>
                <label className="mb-2 block text-sm font-medium">默认模型</label>
                <input type="text" value={modelName} onChange={(e) => setModelName(e.target.value)}
                  placeholder="provider/model-name"
                  className="w-full rounded-xl border px-4 py-3 font-mono text-sm outline-none transition-token-normal focus:ring-2"
                  style={{ ...elevatedBg, color: 'var(--app-text)', outlineColor: 'var(--app-active-border)' }} />
                {modelProvider !== '自定义' && (
                  <div className="mt-2 text-xs" style={mutedText}>格式：<code>provider/model</code>，例如 <code>anthropic/claude-opus-4-6</code></div>
                )}
              </div>

              {['Ollama (本地)', 'vLLM (本地)'].includes(modelProvider) && (
                <div className="rounded-xl border px-4 py-3 text-xs leading-5"
                  style={{ backgroundColor: 'rgba(16,185,129,0.06)', borderColor: 'rgba(16,185,129,0.2)', ...mutedText }}>
                  {modelProvider} 本地模式无需 API Key，请确保服务已在本机运行。
                </div>
              )}
            </div>
          )}

          {/* 测试结果 */}
          {modelTestStatus !== 'idle' && (
            <div className="rounded-2xl border px-4 py-3 text-sm flex items-center gap-3" style={{
              backgroundColor: modelTestStatus === 'ok' ? 'rgba(16,185,129,0.06)' : modelTestStatus === 'error' ? 'rgba(239,68,68,0.06)' : 'var(--app-bg)',
              borderColor: modelTestStatus === 'ok' ? 'rgba(16,185,129,0.24)' : modelTestStatus === 'error' ? 'rgba(239,68,68,0.24)' : 'var(--app-border)',
            }}>
              {modelTestStatus === 'testing' && <Loader2 size={14} className="animate-spin flex-shrink-0" style={{ color: 'var(--app-active-text)' }} />}
              {modelTestStatus === 'ok' && <CheckCircle2 size={14} className="flex-shrink-0" style={{ color: '#34d399' }} />}
              {modelTestStatus === 'error' && <AlertCircle size={14} className="flex-shrink-0" style={{ color: '#f87171' }} />}
              <span style={{ color: modelTestStatus === 'ok' ? '#34d399' : modelTestStatus === 'error' ? '#f87171' : 'var(--app-text-muted)' }}>
                {modelTestStatus === 'testing' ? '正在测试连通性…' : modelTestStatus === 'ok' ? '连通性测试通过，可以继续' : modelTestError}
              </span>
            </div>
          )}

        </div>
      )}

      {/* ── Workspace ── */}
      {subStep === 'workspace' && (
        <div className="space-y-4">
          <div className="rounded-2xl border p-5" style={cardStyle}>
            <div className="mb-1 flex items-center gap-2 text-sm font-semibold">
              <FolderOpen size={14} /> 数据存储位置
            </div>
            <div className="mb-4 text-xs leading-5" style={mutedText}>
              这是 OpenClaw 存储 Agent 文件的目录，默认位置已为你自动填写，通常无需修改。
            </div>
            <input type="text" value={workspaceDir} onChange={(e) => setWorkspaceDir(e.target.value)}
              className="w-full rounded-xl border px-4 py-3 font-mono text-sm outline-none transition-token-normal focus:ring-2"
              style={{ ...elevatedBg, color: 'var(--app-text)', outlineColor: 'var(--app-active-border)' }} />
          </div>

          <div className="rounded-2xl border p-4" style={cardStyle}>
            <div className="mb-2 text-sm font-medium">该目录将包含</div>
            <div className="space-y-1.5">
              {['Agent 列表与配置', '首次启动引导文件', 'Agent 身份定义', '行为准则配置'].map((item) => (
                <div key={item} className="flex items-center gap-2 text-xs" style={mutedText}>
                  <CheckCircle2 size={11} style={{ color: '#34d399', flexShrink: 0 }} />
                  {item}
                </div>
              ))}
            </div>
          </div>

        </div>
      )}

      {/* ── Gateway ── */}
      {subStep === 'gateway' && (
        <div className="space-y-4">
          <div className="rounded-2xl border p-5" style={cardStyle}>
            <div className="mb-1 flex items-center gap-2 text-sm font-semibold">
              <Settings2 size={14} /> 服务配置
            </div>
            <div className="mb-4 text-xs leading-5" style={mutedText}>
              OpenClaw 核心服务的网络配置，默认设置适合大多数用户，通常无需修改。
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium">监听端口</label>
                <input type="text" value={gatewayPort} onChange={(e) => setGatewayPort(e.target.value)}
                  className="w-full rounded-xl border px-4 py-3 font-mono text-sm outline-none focus:ring-2"
                  style={{ ...elevatedBg, color: 'var(--app-text)', outlineColor: 'var(--app-active-border)' }} />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">安全认证</label>
                <div className="flex gap-3">
                  {(['token', 'none'] as const).map((mode) => (
                    <button key={mode} type="button" onClick={() => setGatewayAuth(mode)}
                      className="flex-1 rounded-xl border px-4 py-3 text-sm font-medium transition-token-normal focus:outline-none"
                      style={{
                        backgroundColor: gatewayAuth === mode ? 'var(--app-active-bg)' : 'var(--app-bg-elevated)',
                        borderColor: gatewayAuth === mode ? 'var(--app-active-border)' : 'var(--app-border)',
                        color: gatewayAuth === mode ? 'var(--app-active-text)' : 'var(--app-text-muted)',
                      }}>
                      {mode === 'token' ? 'Token（推荐）' : '无认证'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {/* 访问范围 */}
            <div className="rounded-2xl border p-4" style={cardStyle}>
              <div className="mb-2 text-xs font-medium" style={mutedText}>访问范围</div>
              <div className="flex gap-2">
                {(['loopback', 'lan'] as const).map((mode) => (
                  <button key={mode} type="button" onClick={() => setGatewayBind(mode)}
                    className="flex-1 rounded-xl border px-3 py-2 text-xs font-medium transition-token-normal focus:outline-none"
                    style={{
                      backgroundColor: gatewayBind === mode ? 'var(--app-active-bg)' : 'var(--app-bg-elevated)',
                      borderColor: gatewayBind === mode ? 'var(--app-active-border)' : 'var(--app-border)',
                      color: gatewayBind === mode ? 'var(--app-active-text)' : 'var(--app-text-muted)',
                    }}>
                    {mode === 'loopback' ? '仅本机' : '所有接口'}
                  </button>
                ))}
              </div>
            </div>
            {/* 外网暴露 */}
            <div className="rounded-2xl border p-4" style={cardStyle}>
              <div className="mb-2 text-xs font-medium" style={mutedText}>Tailscale 外网暴露</div>
              <div className="flex gap-2">
                {([false, true] as const).map((val) => (
                  <button key={String(val)} type="button" onClick={() => setGatewayTailscale(val)}
                    className="flex-1 rounded-xl border px-3 py-2 text-xs font-medium transition-token-normal focus:outline-none"
                    style={{
                      backgroundColor: gatewayTailscale === val ? 'var(--app-active-bg)' : 'var(--app-bg-elevated)',
                      borderColor: gatewayTailscale === val ? 'var(--app-active-border)' : 'var(--app-border)',
                      color: gatewayTailscale === val ? 'var(--app-active-text)' : 'var(--app-text-muted)',
                    }}>
                    {val ? '开启' : '关闭'}
                  </button>
                ))}
              </div>
            </div>
            {/* 消息隔离 */}
            <div className="rounded-2xl border p-4" style={cardStyle}>
              <div className="mb-2 text-xs font-medium" style={mutedText}>DM 消息隔离</div>
              <div className="flex gap-2">
                {(['per-channel-peer', 'per-channel'] as const).map((val) => (
                  <button key={val} type="button" onClick={() => setDmScope(val)}
                    className="flex-1 rounded-xl border px-3 py-2 text-xs font-medium transition-token-normal focus:outline-none"
                    style={{
                      backgroundColor: dmScope === val ? 'var(--app-active-bg)' : 'var(--app-bg-elevated)',
                      borderColor: dmScope === val ? 'var(--app-active-border)' : 'var(--app-border)',
                      color: dmScope === val ? 'var(--app-active-text)' : 'var(--app-text-muted)',
                    }}>
                    {val === 'per-channel-peer' ? '按联系人' : '按频道'}
                  </button>
                ))}
              </div>
            </div>
          </div>

        </div>
      )}

      {/* ── Channels（增强版：多账户配置模式 + CLI 添加） ── */}
      {subStep === 'channels' && (
        <div className="space-y-4">
          {/* 标题说明 */}
          <div className="rounded-2xl border p-5" style={cardStyle}>
            <div className="mb-1 flex items-center gap-2 text-sm font-semibold">
              <MessageSquare size={14} /> 消息渠道
            </div>
            <div className="text-xs leading-5" style={mutedText}>
              配置消息渠道连接，让 OpenClaw 能够接收和发送消息。每个渠道可添加多个账户。可跳过，稍后在设置中配置。
            </div>
          </div>

          {/* 渠道 Provider 列表（多账户卡片模式） */}
          <div className="space-y-3">
            {channelConfigs.map((config) => {
              const accentColor = channelColors[config.key] || 'var(--app-active-text)';
              const accounts = channelAccounts[config.key] || [];
              const existingIds = accounts.map((a) => a.accountId);

              return (
                <div
                  key={config.key}
                  className="rounded-2xl border transition-token-normal"
                  style={{
                    backgroundColor: 'var(--app-bg)',
                    borderColor: config.enabled ? accentColor : 'var(--app-border)',
                    boxShadow: config.enabled ? `0 0 0 1px ${accentColor}22` : 'none',
                  }}
                >
                  {/* Provider 标题行：名称 + 开关 */}
                  <div className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-3 w-3 rounded-full" style={{ backgroundColor: accentColor }} />
                      <div>
                        <div className="text-sm font-semibold">{config.label}</div>
                        {!config.enabled && (
                          <div className="mt-0.5 text-xs" style={{ color: 'var(--app-text-muted)' }}>{config.hint}</div>
                        )}
                      </div>
                    </div>
                    {/* 渠道开关 */}
                    <button
                      type="button"
                      role="switch"
                      aria-checked={config.enabled}
                      onClick={() => handleChannelToggle(config.key, !config.enabled)}
                      className="relative inline-flex h-7 w-14 shrink-0 cursor-pointer items-center rounded-full transition-token-normal focus:outline-none focus:ring-2 focus:ring-offset-2"
                      style={{
                        backgroundColor: config.enabled ? '#22c55e' : '#d1d5db',
                        outlineColor: config.enabled ? '#16a34a' : '#9ca3af',
                      }}
                    >
                      <span
                        className="absolute text-[10px] font-semibold select-none"
                        style={{ color: '#fff', left: config.enabled ? '6px' : undefined, right: config.enabled ? undefined : '6px' }}
                      >
                        {config.enabled ? 'ON' : 'OFF'}
                      </span>
                      <span
                        className="pointer-events-none inline-block h-5 w-5 rounded-full shadow-md transition-token-normal"
                        style={{ backgroundColor: '#fff', marginLeft: '3px', transform: config.enabled ? 'translateX(28px)' : 'translateX(0)' }}
                      />
                    </button>
                  </div>

                  {/* 启用后展开的多账户配置区域 */}
                  {config.enabled && (
                    <div className="border-t px-4 pb-4 pt-3 space-y-3" style={{ borderColor: 'var(--app-border)' }}>
                      {/* 账户列表 */}
                      {accounts.map((account, idx) => {
                        // 获取该渠道的账户配置字段定义（排除 accountId，单独渲染）
                        const accountFields = getAccountFields(config.key).filter((f) => f.id !== 'accountId');
                        // accountId 校验结果
                        const otherIds = existingIds.filter((id) => id !== account.accountId);
                        const accountIdValidation = account.accountId
                          ? validateAccountId(account.accountId, otherIds)
                          : { valid: true };

                        return (
                          <div
                            key={account._stableKey || `new-${idx}`}
                            className="rounded-xl border p-4 space-y-3"
                            style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)' }}
                          >
                            {/* 账户标题行 */}
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium" style={{ color: 'var(--app-text-muted)' }}>
                                账户 #{idx + 1}
                              </span>
                              {accounts.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleChannelDeleteAccount(config.key, account.accountId)}
                                  className="flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors hover:bg-red-50"
                                  style={{ color: '#ef4444' }}
                                  aria-label={`删除账户 ${account.accountId || idx + 1}`}
                                >
                                  <Trash2 size={12} />
                                  删除
                                </button>
                              )}
                            </div>

                            {/* accountId 输入字段 */}
                            <div>
                              <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--app-text-muted)' }}>
                                账户 ID <span style={{ color: '#ef4444' }}>*</span>
                              </label>
                              <input
                                type="text"
                                value={account.accountId}
                                onChange={(e) => {
                                  // 实时过滤：仅保留 ASCII 字母、数字、连字符、下划线
                                  const filtered = e.target.value.replace(/[^a-zA-Z0-9_-]/g, '');
                                  handleChannelAccountIdChange(config.key, account.accountId, filtered);
                                }}
                                maxLength={32}
                                placeholder="例如 my-bot（仅允许字母、数字、连字符、下划线）"
                                className="w-full rounded-xl border px-3 py-2 text-sm outline-none transition-token-normal focus:ring-2"
                                style={{
                                  backgroundColor: 'var(--app-bg)',
                                  borderColor: accountIdValidation.valid ? 'var(--app-border)' : '#ef4444',
                                  color: 'var(--app-text)',
                                }}
                              />
                              {/* accountId 校验错误提示 */}
                              {!accountIdValidation.valid && accountIdValidation.error && (
                                <p className="mt-1 text-xs" style={{ color: '#ef4444' }}>{accountIdValidation.error}</p>
                              )}
                            </div>

                            {/* 渠道凭证字段 */}
                            {accountFields.map((field) => (
                              <div key={field.id}>
                                <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--app-text-muted)' }}>
                                  {field.label}
                                  {field.required && <span style={{ color: '#ef4444' }}> *</span>}
                                </label>
                                {field.type === 'select' && field.options ? (
                                  <select
                                    value={account.fieldValues[field.id] || field.defaultValue || ''}
                                    onChange={(e) => handleChannelFieldChange(config.key, account.accountId, field.id, e.target.value)}
                                    className="w-full rounded-xl border px-3 py-2 text-sm outline-none transition-token-normal focus:ring-2"
                                    style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
                                  >
                                    {field.options.map((opt) => (
                                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                  </select>
                                ) : (
                                  <input
                                    type={field.type === 'password' ? 'password' : 'text'}
                                    value={account.fieldValues[field.id] || ''}
                                    onChange={(e) => handleChannelFieldChange(config.key, account.accountId, field.id, e.target.value)}
                                    placeholder={field.placeholder}
                                    className="w-full rounded-xl border px-3 py-2 text-sm outline-none transition-token-normal focus:ring-2"
                                    style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
                                  />
                                )}
                              </div>
                            ))}
                          </div>
                        );
                      })}

                      {/* 添加账户按钮 */}
                      <button
                        type="button"
                        onClick={() => handleChannelAddAccount(config.key)}
                        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed px-3 py-2.5 text-xs font-medium transition-colors hover:border-solid"
                        style={{ borderColor: 'var(--app-border)', color: 'var(--app-text-muted)' }}
                      >
                        <Plus size={14} />
                        添加账户
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* 已启用渠道计数提示 */}
          {enabledProviderCount > 0 && (
            <div
              className="rounded-xl px-4 py-2.5 text-xs"
              style={{ backgroundColor: 'var(--app-bg)', color: 'var(--app-text-muted)' }}
            >
              已启用 {enabledProviderCount} 个渠道，共 {Object.values(channelAccounts).reduce((sum, list) => sum + list.length, 0)} 个账户。
            </div>
          )}

          {/* CLI 添加结果摘要 */}
          {channelAddResults.length > 0 && (
            <div className="space-y-2">
              {/* 总结 */}
              <div
                className="rounded-xl px-4 py-2.5 text-xs"
                style={{ backgroundColor: 'var(--app-bg)', color: 'var(--app-text-muted)' }}
              >
                添加完成：{channelAddResults.filter((r) => r.success).length} 个成功
                {channelAddResults.filter((r) => !r.success).length > 0
                  ? `，${channelAddResults.filter((r) => !r.success).length} 个失败`
                  : ''}
              </div>
              {/* 失败详情 */}
              {channelAddResults.filter((r) => !r.success).map((r, i) => (
                <div
                  key={`${r.channelKey}-${r.accountId || i}`}
                  className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs"
                  style={{ backgroundColor: 'rgba(239, 68, 68, 0.08)', color: '#ef4444' }}
                >
                  <XCircle size={13} className="mt-0.5 shrink-0" />
                  <span>
                    {r.channelLabel}{r.accountId ? ` (${r.accountId})` : ''}: {r.error || '添加失败'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Daemon ── */}
      {subStep === 'daemon' && (
        <div className="space-y-4">
          <div className="rounded-2xl border p-5" style={cardStyle}>
            <div className="mb-1 flex items-center gap-2 text-sm font-semibold">
              <Shield size={14} /> 后台服务（Daemon）
            </div>
            <div className="mb-4 text-xs leading-5" style={mutedText}>
              将 OpenClaw Gateway 注册为系统服务，开机自动启动。macOS 使用 LaunchAgent，Linux/WSL2 使用 systemd user unit。
            </div>
            <div className="flex gap-3">
              {([true, false] as const).map((val) => (
                <button key={String(val)} type="button" onClick={() => setInstallDaemon(val)}
                  className="flex-1 rounded-xl border px-4 py-3 text-sm font-medium transition-token-normal focus:outline-none"
                  style={{
                    backgroundColor: installDaemon === val ? 'var(--app-active-bg)' : 'var(--app-bg-elevated)',
                    borderColor: installDaemon === val ? 'var(--app-active-border)' : 'var(--app-border)',
                    color: installDaemon === val ? 'var(--app-active-text)' : 'var(--app-text-muted)',
                  }}>
                  {val ? '安装（推荐）' : '跳过'}
                </button>
              ))}
            </div>
          </div>

          {installDaemon && (
            <div className="rounded-2xl border p-5" style={cardStyle}>
              <label className="mb-2 block text-sm font-medium">运行时</label>
              <div className="flex gap-3">
                {(['node', 'bundled'] as const).map((rt) => (
                  <button key={rt} type="button" onClick={() => setDaemonRuntime(rt)}
                    className="flex-1 rounded-xl border px-4 py-3 text-sm font-medium transition-token-normal focus:outline-none"
                    style={{
                      backgroundColor: daemonRuntime === rt ? 'var(--app-active-bg)' : 'var(--app-bg-elevated)',
                      borderColor: daemonRuntime === rt ? 'var(--app-active-border)' : 'var(--app-border)',
                      color: daemonRuntime === rt ? 'var(--app-active-text)' : 'var(--app-text-muted)',
                    }}>
                    {rt === 'node' ? 'Node.js（系统）' : '内置运行时'}
                  </button>
                ))}
              </div>
            </div>
          )}

        </div>
      )}

      {/* ── Skills ── */}
      {subStep === 'skills' && (
        <div className="space-y-4">
          <div className="rounded-2xl border p-5" style={cardStyle}>
            <div className="mb-1 flex items-center gap-2 text-sm font-semibold">
              <Wrench size={14} /> Skills
            </div>
            <div className="mb-4 text-xs leading-5" style={mutedText}>
              Skills 为 Agent 提供额外能力（代码执行、文件操作、网络搜索等）。推荐安装官方默认 Skills 套件。
            </div>
            <div className="flex gap-3">
              {([true, false] as const).map((val) => (
                <button key={String(val)} type="button" onClick={() => setInstallRecommendedSkills(val)}
                  className="flex-1 rounded-xl border px-4 py-3 text-sm font-medium transition-token-normal focus:outline-none"
                  style={{
                    backgroundColor: installRecommendedSkills === val ? 'var(--app-active-bg)' : 'var(--app-bg-elevated)',
                    borderColor: installRecommendedSkills === val ? 'var(--app-active-border)' : 'var(--app-border)',
                    color: installRecommendedSkills === val ? 'var(--app-active-text)' : 'var(--app-text-muted)',
                  }}>
                  {val ? '安装推荐 Skills（推荐）' : '跳过'}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border p-4" style={cardStyle}>
            <div className="mb-2 text-sm font-medium">推荐 Skills 包含</div>
            <div className="space-y-1.5">
              {['代码执行（沙箱）', '文件读写', '网络搜索', 'Shell 命令'].map((item) => (
                <div key={item} className="flex items-center gap-2 text-xs" style={mutedText}>
                  <CheckCircle2 size={11} style={{ color: installRecommendedSkills ? '#34d399' : 'var(--app-border)', flexShrink: 0 }} />
                  {item}
                </div>
              ))}
            </div>
          </div>

        </div>
      )}

      {/* ── Agent 智能体配置 ── */}
      {subStep === 'agent' && (
        <div className="space-y-4">
          {/* 加载中状态 */}
          {agentPageMode === 'loading' && !agentLoadError && (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin" style={{ color: 'var(--app-text-muted)' }} />
              <span className="ml-3 text-sm" style={{ color: 'var(--app-text-muted)' }}>正在检测系统中的智能体…</span>
            </div>
          )}

          {/* 加载失败：显示错误提示 */}
          {agentPageMode === 'loading' && agentLoadError && (
            <div className="rounded-2xl border p-5" style={{ ...cardStyle, borderColor: 'rgba(239,68,68,0.24)' }}>
              <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: '#f87171' }}>
                <AlertCircle size={14} />
                查询智能体列表失败
              </div>
              <div className="mt-2 text-xs" style={{ color: 'var(--app-text-muted)' }}>{agentLoadError}</div>
            </div>
          )}

          {/* Task 3.2: 已有 Agent 选择 UI */}
          {agentPageMode === 'has-existing' && (
            <div className="space-y-4">
              <div className="rounded-2xl border p-5" style={cardStyle}>
                <div className="mb-1 flex items-center gap-2 text-sm font-semibold">
                  <Bot size={14} /> 选择智能体
                </div>
                <div className="mb-4 text-xs leading-5" style={mutedText}>
                  检测到系统中已有智能体（通常由 openclaw onboard 创建）。选择一个作为当前引导流程的主智能体，或跳过此步骤。
                </div>
              </div>

              {/* agent 卡片列表 */}
              <div className="space-y-3">
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
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-semibold">{agent.name}</span>
                          {/* 完整性状态标识 */}
                          {isAgentComplete(agent.id) === true && (
                            <span
                              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                              style={{ backgroundColor: 'rgba(16,185,129,0.1)', color: '#34d399', border: '1px solid rgba(16,185,129,0.3)' }}
                            >
                              <CheckCircle2 size={10} />
                              配置完整
                            </span>
                          )}
                          {isAgentComplete(agent.id) === false && (
                            <span
                              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                              style={{ backgroundColor: 'rgba(245,158,11,0.1)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.3)' }}
                            >
                              <AlertCircle size={10} />
                              配置不完整
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 truncate text-xs" style={{ color: 'var(--app-text-muted)' }}>
                          {agent.model ? `模型: ${agent.model}` : '使用系统默认模型'}
                          {agent.workspace ? ` · ${agent.workspace}` : ''}
                        </div>
                        {/* 缺失项摘要 */}
                        {isAgentComplete(agent.id) === false && getMissingSummary(agent.id) && (
                          <div className="mt-1 truncate text-xs" style={{ color: '#fbbf24' }}>
                            {getMissingSummary(agent.id)}
                          </div>
                        )}
                      </div>
                      {/* 选中标记 */}
                      {selectedAgentId === agent.id && (
                        <CheckCircle2 size={16} style={{ color: 'var(--app-active-text)', flexShrink: 0 }} />
                      )}
                    </div>
                  </button>
                ))}
              </div>

              {/* 提示 */}
              <p className="pt-1 text-xs" style={{ color: 'var(--app-text-muted)' }}>
                如需创建额外的智能体，可在引导完成后前往「智能体」页面操作。
              </p>

              {/* ── 认领表单：用户选择不完整 agent 时显示 ── */}
              {showClaimForm && (() => {
                const agent = existingAgents.find((a) => a.id === selectedAgentId);
                if (!agent) return null;
                return (
                  <div className="rounded-2xl border p-5 space-y-4" style={cardStyle}>
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <UserCheck size={14} />
                      认领智能体
                    </div>
                    <div className="text-xs leading-5" style={mutedText}>
                      该智能体配置不完整，请确认名称后修复缺失的配置文件。
                    </div>

                    {/* 名称输入框 */}
                    <div>
                      <label htmlFor="claim-agent-name" className="mb-1.5 block text-sm font-medium" style={{ color: 'var(--app-text)' }}>
                        智能体名称
                      </label>
                      <input
                        id="claim-agent-name"
                        type="text"
                        value={claimAgentName}
                        onChange={(e) => {
                          setClaimAgentName(e.target.value);
                          if (claimNameError) setClaimNameError('');
                        }}
                        placeholder="例如：my-assistant"
                        disabled={isRepairing}
                        className="w-full rounded-xl border px-4 py-2.5 text-sm outline-none transition-token-normal focus:ring-2"
                        style={{
                          backgroundColor: 'var(--app-bg)',
                          borderColor: claimNameError ? '#ef4444' : 'var(--app-border)',
                          color: 'var(--app-text)',
                        }}
                      />
                      {claimNameError && (
                        <p className="mt-1.5 text-xs" style={{ color: '#ef4444' }}>{claimNameError}</p>
                      )}
                      <p className="mt-1.5 text-xs" style={{ color: 'var(--app-text-muted)' }}>
                        仅允许 ASCII 字母、数字、连字符（-）和下划线（_）
                      </p>
                    </div>

                    {/* 修复错误提示 */}
                    {repairError && (
                      <div
                        className="rounded-xl border px-4 py-3 text-sm"
                        style={{
                          backgroundColor: 'rgba(239, 68, 68, 0.08)',
                          borderColor: 'rgba(239, 68, 68, 0.25)',
                          color: '#dc2626',
                        }}
                      >
                        {repairError}
                      </div>
                    )}

                    {/* 操作按钮 */}
                    <div className="flex items-center gap-3">
                      <AppButton
                        variant="primary"
                        onClick={() => void handleClaimAndRepair()}
                        disabled={isRepairing}
                        icon={isRepairing ? <Loader2 size={14} className="animate-spin" /> : <Wrench size={14} />}
                      >
                        {isRepairing ? '修复中…' : '确认并修复'}
                      </AppButton>
                      {/* 修复失败时显示重试和跳过按钮 */}
                      {repairError && (
                        <>
                          <AppButton
                            variant="secondary"
                            onClick={() => { setRepairError(''); void handleClaimAndRepair(); }}
                            disabled={isRepairing}
                          >
                            重试
                          </AppButton>
                          <AppButton
                            variant="secondary"
                            onClick={() => {
                              // 跳过修复，直接使用当前 agent 导航到 bind
                              setCreatedAgent({ id: agent.id, name: agent.name });
                              void persistPartialState({
                                createdAgentName: agent.name,
                                createdAgentId: agent.id,
                                createdAgentWorkspace: agent.workspace,
                                createdAgentModel: agent.model,
                              });
                              setShowClaimForm(false);
                              setSubStep('bind');
                            }}
                            disabled={isRepairing}
                            icon={<SkipForward size={14} />}
                          >
                            跳过
                          </AppButton>
                        </>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Task 3.3: Agent 创建表单 UI */}
          {agentPageMode === 'create-new' && (
            <div className="space-y-4">
              <div className="rounded-2xl border p-5" style={cardStyle}>
                <div className="mb-1 flex items-center gap-2 text-sm font-semibold">
                  <Bot size={14} /> 创建第一个智能体
                </div>
                <div className="mb-4 text-xs leading-5" style={mutedText}>
                  系统中尚未检测到智能体。创建你的第一个 AI 智能体，或跳过此步骤稍后在智能体页面创建。
                </div>
              </div>

              <div className="rounded-2xl border p-5 space-y-5" style={cardStyle}>
                {/* 智能体名称 */}
                <div>
                  <label
                    htmlFor="agent-name-inline"
                    className="mb-1.5 block text-sm font-medium"
                    style={{ color: 'var(--app-text)' }}
                  >
                    智能体名称 <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    id="agent-name-inline"
                    type="text"
                    value={agentName}
                    onChange={(e) => {
                      setAgentName(e.target.value);
                      if (agentErrors.name) setAgentErrors((prev) => ({ ...prev, name: '' }));
                    }}
                    placeholder="例如：my-assistant"
                    className="w-full rounded-xl border px-4 py-2.5 text-sm outline-none transition-token-normal focus:ring-2"
                    style={{
                      backgroundColor: 'var(--app-bg)',
                      borderColor: agentErrors.name ? '#ef4444' : 'var(--app-border)',
                      color: 'var(--app-text)',
                    }}
                  />
                  {agentErrors.name && (
                    <p className="mt-1.5 text-xs" style={{ color: '#ef4444' }}>{agentErrors.name}</p>
                  )}
                  <p className="mt-1.5 text-xs" style={{ color: 'var(--app-text-muted)' }}>
                    仅允许 ASCII 字母、数字、连字符（-）和下划线（_）
                  </p>
                </div>

                {/* 工作区路径 */}
                <div>
                  <label
                    htmlFor="agent-workspace-inline"
                    className="mb-1.5 block text-sm font-medium"
                    style={{ color: 'var(--app-text)' }}
                  >
                    工作区路径 <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    id="agent-workspace-inline"
                    type="text"
                    value={agentWorkspace}
                    onChange={(e) => {
                      setAgentWorkspace(e.target.value);
                      setAgentWorkspaceManuallyEdited(true);
                      if (agentErrors.workspace) setAgentErrors((prev) => ({ ...prev, workspace: '' }));
                    }}
                    placeholder="例如：~/.openclaw/workspace-my-assistant"
                    className="w-full rounded-xl border px-4 py-2.5 text-sm outline-none transition-token-normal focus:ring-2"
                    style={{
                      backgroundColor: 'var(--app-bg)',
                      borderColor: agentErrors.workspace ? '#ef4444' : 'var(--app-border)',
                      color: 'var(--app-text)',
                    }}
                  />
                  {agentErrors.workspace && (
                    <p className="mt-1.5 text-xs" style={{ color: '#ef4444' }}>{agentErrors.workspace}</p>
                  )}
                  <p className="mt-1.5 text-xs" style={{ color: 'var(--app-text-muted)' }}>
                    智能体的工作目录，根据名称自动生成，可手动修改
                  </p>
                </div>

                {/* 模型选择 */}
                <div>
                  <label
                    htmlFor="agent-model-inline"
                    className="mb-1.5 block text-sm font-medium"
                    style={{ color: 'var(--app-text)' }}
                  >
                    模型 <span style={{ color: 'var(--app-text-muted)' }}>（可选）</span>
                  </label>
                  <input
                    id="agent-model-inline"
                    type="text"
                    value={agentModel}
                    onChange={(e) => setAgentModel(e.target.value)}
                    placeholder="留空使用系统默认模型"
                    className="w-full rounded-xl border px-4 py-2.5 text-sm outline-none transition-token-normal focus:ring-2"
                    style={{
                      backgroundColor: 'var(--app-bg)',
                      borderColor: 'var(--app-border)',
                      color: 'var(--app-text)',
                    }}
                  />
                  <p className="mt-1.5 text-xs" style={{ color: 'var(--app-text-muted)' }}>
                    留空则使用系统默认配置
                  </p>
                </div>
              </div>

              {/* 创建错误提示 */}
              {agentCreateError && (
                <div
                  className="rounded-xl border px-4 py-3 text-sm"
                  style={{
                    backgroundColor: 'rgba(239, 68, 68, 0.08)',
                    borderColor: 'rgba(239, 68, 68, 0.25)',
                    color: '#dc2626',
                  }}
                >
                  {agentCreateError}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Bind 渠道绑定 ── */}
      {subStep === 'bind' && (
        <div className="space-y-4">
          {/* 无 createdAgent 时：提示用户先配置智能体 */}
          {!createdAgent && (
            <div
              className="rounded-2xl border px-4 py-6 text-center text-sm"
              style={{
                backgroundColor: 'var(--app-bg)',
                borderColor: 'var(--app-border)',
                color: 'var(--app-text-muted)',
              }}
            >
              请先配置智能体，才能进行渠道绑定。你可以跳过此步骤，稍后在设置中配置。
            </div>
          )}

          {/* 有 createdAgent 时：加载中状态 */}
          {createdAgent && isLoadingBindInfo && (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin" style={{ color: 'var(--app-text-muted)' }} />
              <span className="ml-3 text-sm" style={{ color: 'var(--app-text-muted)' }}>正在查询渠道绑定信息…</span>
            </div>
          )}

          {/* 查询错误提示 */}
          {createdAgent && !isLoadingBindInfo && bindLoadError && (
            <div
              className="mb-4 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm"
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.08)',
                borderColor: 'rgba(239, 68, 68, 0.25)',
                color: '#dc2626',
              }}
            >
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{bindLoadError}</span>
            </div>
          )}

          {/* 有 createdAgent 且加载完成：渠道账户列表或空提示 */}
          {createdAgent && !isLoadingBindInfo && !bindLoadError && (() => {
            // 过滤出未绑定到当前 agent 的账户
            const unboundAccts = bindableAccounts.filter((a) => !existingBindingKeys.has(a.checkKey));

            if (bindableAccounts.length === 0) {
              // 系统中无可用渠道
              return (
                <div
                  className="rounded-2xl border px-4 py-6 text-center text-sm"
                  style={{
                    backgroundColor: 'var(--app-bg)',
                    borderColor: 'var(--app-border)',
                    color: 'var(--app-text-muted)',
                  }}
                >
                  尚未配置渠道。你可以跳过此步骤，稍后在设置中配置渠道并绑定到智能体。
                </div>
              );
            }

            if (unboundAccts.length === 0) {
              // 所有渠道已绑定到当前 agent
              return (
                <div
                  className="rounded-2xl border px-4 py-6 text-center text-sm"
                  style={{
                    backgroundColor: 'var(--app-bg)',
                    borderColor: 'var(--app-border)',
                    color: 'var(--app-text-muted)',
                  }}
                >
                  所有渠道账户已绑定到该智能体。
                </div>
              );
            }

            // 渠道账户复选框列表
            return (
              <>
                {/* 标题说明 */}
                <div className="rounded-2xl border p-5" style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)' }}>
                  <div className="mb-1 flex items-center gap-2 text-sm font-semibold">
                    <Link2 size={14} /> 绑定渠道到智能体
                  </div>
                  <div className="text-xs leading-5" style={{ color: 'var(--app-text-muted)' }}>
                    选择要绑定到智能体「{createdAgent.name}」的渠道账户。绑定后，该智能体将能接收对应渠道的消息。
                  </div>
                </div>

                {/* 复选框列表 */}
                <div className="space-y-2 overflow-y-auto pr-1">
                  {unboundAccts.map((a) => {
                    /** 该账户是否已被其他 agent 绑定 */
                    const isBoundByOther = !!a.boundAgentId && a.boundAgentId !== createdAgent?.id;
                    return (
                      <label
                        key={a.checkKey}
                        className="flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 transition-token-normal hover:-translate-y-0.5"
                        style={{
                          backgroundColor: 'var(--app-bg)',
                          borderColor: bindChecked[a.checkKey]
                            ? 'var(--app-active-border)'
                            : 'var(--app-border)',
                          boxShadow: bindChecked[a.checkKey]
                            ? '0 0 0 1px var(--app-active-border)'
                            : 'none',
                        }}
                      >
                        {/* 复选框 */}
                        <input
                          type="checkbox"
                          checked={!!bindChecked[a.checkKey]}
                          onChange={() => setBindChecked((prev) => ({ ...prev, [a.checkKey]: !prev[a.checkKey] }))}
                          className="h-4 w-4 shrink-0 rounded accent-[var(--app-active-text)]"
                        />
                        {/* 渠道-账户信息 */}
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{a.displayLabel}</div>
                          {/* 绑定状态提示 */}
                          {isBoundByOther ? (
                            <div className="mt-0.5 flex items-center gap-1 text-xs" style={{ color: 'var(--app-text-muted)' }}>
                              <UserCheck size={12} className="shrink-0" />
                              <span className="truncate">已绑定到 {a.boundAgentId}</span>
                            </div>
                          ) : (
                            <div className="mt-0.5 text-xs" style={{ color: 'var(--app-text-muted)' }}>
                              未绑定
                            </div>
                          )}
                        </div>
                        {/* 状态图标 */}
                        {isBoundByOther ? (
                          <UserCheck size={16} style={{ color: 'var(--app-text-muted)', flexShrink: 0 }} />
                        ) : (
                          <CheckCircle2 size={16} style={{ color: '#22c55e', flexShrink: 0 }} />
                        )}
                      </label>
                    );
                  })}
                </div>

                {/* 已勾选计数提示 */}
                <div
                  className="rounded-xl px-4 py-2.5 text-xs"
                  style={{ backgroundColor: 'var(--app-bg)', color: 'var(--app-text-muted)' }}
                >
                  已选择 {unboundAccts.filter((a) => bindChecked[a.checkKey]).length} / {unboundAccts.length} 个渠道账户
                </div>
              </>
            );
          })()}

          {/* 已绑定渠道提示 */}
          {createdAgent && !isLoadingBindInfo && existingBindingKeys.size > 0 && (
            <div
              className="rounded-xl px-4 py-2.5 text-xs"
              style={{ backgroundColor: 'var(--app-bg)', color: 'var(--app-text-muted)' }}
            >
              已绑定：{Array.from(existingBindingKeys).join('、')}
            </div>
          )}

          {/* 绑定错误提示 */}
          {bindError && (
            <div
              className="flex items-start gap-2 rounded-xl border px-4 py-3 text-sm"
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.08)',
                borderColor: 'rgba(239, 68, 68, 0.25)',
                color: '#dc2626',
              }}
            >
              <XCircle size={16} className="mt-0.5 shrink-0" />
              <span>{bindError}</span>
            </div>
          )}
        </div>
      )}

      {/* ── 完成 ── */}
      {subStep === 'done' && (
        <div className="space-y-4">
          <div className="rounded-2xl border p-6" style={{ backgroundColor: 'var(--app-bg)', borderColor: 'rgba(16,185,129,0.24)' }}>
            <div className="flex items-center gap-3 text-base font-semibold">
              <CheckCircle2 size={20} style={{ color: '#34d399' }} />
              安装与初始配置已完成
            </div>
            <div className="mt-4 space-y-2 text-sm">
              {[
                { label: '平台', value: platformLabel },
                { label: 'AI 模型', value: modelName || modelProvider, mono: !!modelName },
                { label: '数据目录', value: workspaceDir, mono: true },
                { label: '服务端口', value: gatewayPort },
                { label: '安全认证', value: gatewayAuth === 'token' ? 'Token（自动生成）' : '无认证' },
                { label: '访问范围', value: gatewayBind === 'loopback' ? '仅本机' : '所有接口' },
                { label: 'Tailscale', value: gatewayTailscale ? '开启' : '关闭' },
                { label: 'DM 隔离', value: dmScope === 'per-channel-peer' ? '按联系人' : '按频道' },
                { label: 'Channels', value: enabledChannels.size > 0 ? Array.from(enabledChannels).join(', ') : '未配置' },
                { label: 'Daemon', value: installDaemon ? `安装（${daemonRuntime}）` : '跳过' },
                { label: 'Skills', value: installRecommendedSkills ? '安装推荐套件' : '跳过' },
                { label: '智能体', value: createdAgent?.name || '未配置' },
                { label: '渠道绑定', value: completedBindings > 0 ? `${completedBindings} 个渠道` : '未配置' },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between rounded-xl border px-4 py-2.5"
                  style={{ backgroundColor: 'var(--app-bg-elevated)', borderColor: 'var(--app-border)' }}>
                  <span style={mutedText}>{row.label}</span>
                  <span className={row.mono ? 'font-mono text-xs' : ''}>{row.value}</span>
                </div>
              ))}
            </div>
          </div>

          {saveError && (
            <div className="rounded-xl border px-4 py-3 text-sm" style={{ borderColor: 'rgba(239,68,68,0.3)', backgroundColor: 'rgba(239,68,68,0.06)', color: '#f87171' }}>
              {saveError}
            </div>
          )}

        </div>
      )}
    </SetupLayout>
  );
};
