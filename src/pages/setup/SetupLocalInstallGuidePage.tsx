import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Circle,
  Download,
  FolderOpen,
  Loader2,
  Laptop,
  MessageSquare,
  Settings2,
  Shield,
  Wrench,
  XCircle,
  Zap,
} from 'lucide-react';
import AppButton from '../../components/AppButton';
import SetupLayout from '../../components/setup/SetupLayout';
import { useSetupFlow } from '../../contexts/SetupFlowContext';
import type { InstallProgressEvent, InstallStage } from '../../types/electron';

type SubStep = 'platform' | 'install' | 'model' | 'workspace' | 'gateway' | 'channels' | 'daemon' | 'skills' | 'done';

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

const SUB_STEPS: Array<{ key: SubStep; label: string }> = [
  { key: 'platform', label: '确认平台' },
  { key: 'install', label: '下载安装' },
  { key: 'model', label: '模型 / Auth' },
  { key: 'workspace', label: 'Workspace' },
  { key: 'gateway', label: 'Gateway' },
  { key: 'channels', label: 'Channels' },
  { key: 'daemon', label: 'Daemon' },
  { key: 'skills', label: 'Skills' },
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
              className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors duration-200"
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
  const { environmentCheck, installOpenClawForSetup, isBusy, setupSettings } = useSetupFlow();

  const [subStep, setSubStep] = React.useState<SubStep>('platform');
  const [modelProvider, setModelProvider] = React.useState('');
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

  const handleInstall = async () => {
    setInstallSteps(INITIAL_INSTALL_STEPS);
    setInstallLogs([]);
    setHasStartedInstall(true);
    setHasAutoJumpedToModel(false);
    await installOpenClawForSetup();
  };

  const cardStyle = { backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)' };
  const mutedText = { color: 'var(--app-text-muted)' };
  const elevatedBg = { backgroundColor: 'var(--app-bg-elevated)', borderColor: 'var(--app-border)' };

  return (
    <SetupLayout
      title="安装 OpenClaw"
      description="桌面端将自动完成 OpenClaw 的安装与初始配置，全程无需打开终端或输入任何命令。"
      stepLabel="步骤 4 / 6"
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

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <AppButton variant="secondary" onClick={() => navigate('/setup/local/check')}>返回检测</AppButton>
            <AppButton variant="primary" onClick={() => setSubStep('install')} icon={<ChevronRight size={15} />}>
              确认，开始安装
            </AppButton>
          </div>
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

          <div className="mt-6 flex flex-wrap items-center gap-3">
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
                    className="rounded-xl border px-4 py-3 text-sm font-medium transition-all duration-200 hover:-translate-y-0.5 focus:outline-none"
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
              {modelProvider === '自定义' && (
                <div>
                  <label className="mb-2 block text-sm font-medium">Base URL</label>
                  <input type="text" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder="例如 https://api.example.com/v1"
                    className="w-full rounded-xl border px-4 py-3 text-sm outline-none transition-colors duration-200 focus:ring-2"
                    style={{ ...elevatedBg, color: 'var(--app-text)', outlineColor: 'var(--app-active-border)' }} />
                </div>
              )}

              {!['Ollama (本地)', 'vLLM (本地)'].includes(modelProvider) && (
                <div>
                  <label className="mb-2 block text-sm font-medium">
                    {modelProvider === '自定义' ? 'API Key' : `${modelProvider} API Key`}
                    {modelProvider === '自定义' && (
                      <span className="ml-2 text-xs font-normal" style={mutedText}>（可选）</span>
                    )}
                  </label>
                  <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
                    placeholder={modelProvider === '自定义' ? '本地模型可留空' : '请输入 API Key'}
                    className="w-full rounded-xl border px-4 py-3 text-sm outline-none transition-colors duration-200 focus:ring-2"
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
                  className="w-full rounded-xl border px-4 py-3 font-mono text-sm outline-none transition-colors duration-200 focus:ring-2"
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
              className="w-full rounded-xl border px-4 py-3 font-mono text-sm outline-none transition-colors duration-200 focus:ring-2"
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

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <AppButton variant="secondary" onClick={() => setSubStep('model')}>上一步</AppButton>
            <AppButton variant="primary" onClick={() => setSubStep('gateway')} disabled={!workspaceDir.trim()} icon={<ChevronRight size={15} />}>
              继续
            </AppButton>
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
                      className="flex-1 rounded-xl border px-4 py-3 text-sm font-medium transition-all duration-200 focus:outline-none"
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
                    className="flex-1 rounded-xl border px-3 py-2 text-xs font-medium transition-all duration-200 focus:outline-none"
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
                    className="flex-1 rounded-xl border px-3 py-2 text-xs font-medium transition-all duration-200 focus:outline-none"
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
                    className="flex-1 rounded-xl border px-3 py-2 text-xs font-medium transition-all duration-200 focus:outline-none"
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

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <AppButton variant="secondary" onClick={() => setSubStep('workspace')}>上一步</AppButton>
            <AppButton variant="primary" onClick={() => setSubStep('channels')} icon={<ChevronRight size={15} />}>
              确认配置
            </AppButton>
          </div>
        </div>
      )}

      {/* ── Channels ── */}
      {subStep === 'channels' && (
        <div className="space-y-4">
          <div className="rounded-2xl border p-5" style={cardStyle}>
            <div className="mb-1 flex items-center gap-2 text-sm font-semibold">
              <MessageSquare size={14} /> 消息渠道
            </div>
            <div className="mb-4 text-xs leading-5" style={mutedText}>
              选择你希望通过哪些渠道与 Agent 对话。可跳过，稍后在设置中配置。
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {([
                { key: 'telegram', label: 'Telegram', hint: 'Bot Token' },
                { key: 'discord', label: 'Discord', hint: 'Bot Token' },
                { key: 'whatsapp', label: 'WhatsApp', hint: '需要插件' },
                { key: 'signal', label: 'Signal', hint: '需要 signal-cli' },
                { key: 'googlechat', label: 'Google Chat', hint: 'Webhook URL' },
                { key: 'mattermost', label: 'Mattermost', hint: 'Webhook URL' },
                { key: 'imessage', label: 'iMessage', hint: 'macOS 专属' },
              ] as Array<{ key: ChannelKey; label: string; hint: string }>).map(({ key, label, hint }) => {
                const active = enabledChannels.has(key);
                return (
                  <button key={key} type="button"
                    onClick={() => setEnabledChannels((prev) => {
                      const next = new Set(prev);
                      active ? next.delete(key) : next.add(key);
                      return next;
                    })}
                    className="rounded-xl border px-4 py-3 text-left transition-all duration-200 focus:outline-none"
                    style={{
                      backgroundColor: active ? 'var(--app-active-bg)' : 'var(--app-bg-elevated)',
                      borderColor: active ? 'var(--app-active-border)' : 'var(--app-border)',
                    }}>
                    <div className="text-sm font-medium" style={{ color: active ? 'var(--app-active-text)' : 'var(--app-text)' }}>{label}</div>
                    <div className="mt-0.5 text-xs" style={mutedText}>{hint}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Token inputs for enabled channels */}
          {(['telegram', 'discord', 'googlechat', 'mattermost'] as ChannelKey[]).filter(k => enabledChannels.has(k)).map((key) => (
            <div key={key} className="rounded-2xl border p-5" style={cardStyle}>
              <label className="mb-2 block text-sm font-medium">
                {key === 'telegram' ? 'Telegram Bot Token' : key === 'discord' ? 'Discord Bot Token' : key === 'googlechat' ? 'Google Chat Webhook URL' : 'Mattermost Webhook URL'}
              </label>
              <input type="password" value={channelTokens[key] ?? ''}
                onChange={(e) => setChannelTokens((prev) => ({ ...prev, [key]: e.target.value }))}
                placeholder="请输入…"
                className="w-full rounded-xl border px-4 py-3 text-sm outline-none focus:ring-2"
                style={{ ...elevatedBg, color: 'var(--app-text)', outlineColor: 'var(--app-active-border)' }} />
            </div>
          ))}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <AppButton variant="secondary" onClick={() => setSubStep('gateway')}>上一步</AppButton>
            <AppButton variant="primary" onClick={() => setSubStep('daemon')} icon={<ChevronRight size={15} />}>
              {enabledChannels.size === 0 ? '跳过' : '继续'}
            </AppButton>
          </div>
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
                  className="flex-1 rounded-xl border px-4 py-3 text-sm font-medium transition-all duration-200 focus:outline-none"
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
                    className="flex-1 rounded-xl border px-4 py-3 text-sm font-medium transition-all duration-200 focus:outline-none"
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

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <AppButton variant="secondary" onClick={() => setSubStep('channels')}>上一步</AppButton>
            <AppButton variant="primary" onClick={() => setSubStep('skills')} icon={<ChevronRight size={15} />}>继续</AppButton>
          </div>
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
                  className="flex-1 rounded-xl border px-4 py-3 text-sm font-medium transition-all duration-200 focus:outline-none"
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

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <AppButton variant="secondary" onClick={() => setSubStep('daemon')}>上一步</AppButton>
            <AppButton variant="primary" onClick={() => setSubStep('done')} icon={<ChevronRight size={15} />}>继续</AppButton>
          </div>
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

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <AppButton variant="secondary" onClick={() => setSubStep('gateway')}>返回修改</AppButton>
            <AppButton variant="primary" disabled={isSaving} icon={isSaving ? <Loader2 size={14} className="animate-spin" /> : <ChevronRight size={15} />}
              onClick={async () => {
                setIsSaving(true);
                setSaveError('');
                try {
                  // 读取现有配置
                  const existing = await window.electronAPI?.configGet?.();
                  const base = existing?.success && existing.config ? existing.config : {};

                  // 合并写入
                  const updated = {
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
                      port: parseInt(gatewayPort, 10) || 18789,
                      // 写入对象格式，与 gateway.ts 读取 auth.mode 保持一致
                      auth: gatewayAuth === 'none' ? undefined : { mode: gatewayAuth },
                      bind: gatewayBind,
                      tailscale: gatewayTailscale,
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
                    daemon: {
                      ...(base.daemon ?? {}),
                      install: installDaemon,
                      runtime: daemonRuntime,
                    },
                    skills: {
                      ...(base.skills ?? {}),
                      install: {
                        ...((base.skills as any)?.install ?? {}),
                        recommended: installRecommendedSkills,
                      },
                    },
                  };

                  const saveResult = await window.electronAPI?.configSet?.(updated);
                  if (!saveResult?.success) {
                    setSaveError(saveResult?.error ?? '保存配置失败，请重试。');
                    return;
                  }

                  navigate('/setup/local/configure');
                } catch (e) {
                  setSaveError(String(e));
                } finally {
                  setIsSaving(false);
                }
              }}>
              {isSaving ? '保存中…' : '继续'}
            </AppButton>
          </div>
        </div>
      )}
    </SetupLayout>
  );
};
