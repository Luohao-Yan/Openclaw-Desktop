import React from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, ChevronRight, Loader2, SkipForward, Terminal, XCircle, Zap } from 'lucide-react';
import AppButton from '../../components/AppButton';
import SetupLayout from '../../components/setup/SetupLayout';
import VirtualChannelList from '../../components/setup/VirtualChannelList';
import { useSetupFlow } from '../../contexts/SetupFlowContext';
import type { ChannelAddResult, ChannelConfig } from '../../types/setup';

/** 渠道图标颜色映射（key 与 SUPPORTED_CHANNEL_TYPES 一致） */
const channelColors: Record<string, string> = {
  // 内置渠道
  telegram: '#26A5E4',
  whatsapp: '#25D366',
  discord: '#5865F2',
  signal: '#3A76F0',
  slack: '#E01E5A',
  bluebubbles: '#34C759',
  imessage: '#5AC8FA',
  googlechat: '#00AC47',
  irc: '#8B8B8B',
  webchat: '#FF6B35',
  // 插件渠道
  feishu: '#3370FF',
  line: '#06C755',
  matrix: '#0DBD8B',
  mattermost: '#0058CC',
  msteams: '#6264A7',
  nextcloudtalk: '#0082C9',
  nostr: '#8B5CF6',
  synologychat: '#B5B5B6',
  tlon: '#1A1A1A',
  twitch: '#9146FF',
  zalo: '#0068FF',
  zalopersonal: '#0068FF',
};

/** 底部操作栏组件 */
const SetupActionBar: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="mt-6 flex flex-wrap items-center gap-3">
    {children}
  </div>
);

/** 渠道开关组件 — 开启绿色/关闭灰色，带文字标签 */
const ChannelToggle: React.FC<{
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}> = ({ enabled, onChange }) => (
  <button
    type="button"
    role="switch"
    aria-checked={enabled}
    onClick={() => onChange(!enabled)}
    className="relative inline-flex h-7 w-14 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2"
    style={{
      backgroundColor: enabled ? '#22c55e' : '#d1d5db',
      outlineColor: enabled ? '#16a34a' : '#9ca3af',
    }}
  >
    {/* 开/关文字标签 */}
    <span
      className="absolute text-[10px] font-semibold select-none"
      style={{
        color: '#fff',
        left: enabled ? '6px' : undefined,
        right: enabled ? undefined : '6px',
      }}
    >
      {enabled ? 'ON' : 'OFF'}
    </span>
    {/* 滑块圆点 */}
    <span
      className="pointer-events-none inline-block h-5 w-5 rounded-full shadow-md transition-transform duration-200"
      style={{
        backgroundColor: '#fff',
        marginLeft: '3px',
        transform: enabled ? 'translateX(28px)' : 'translateX(0)',
      }}
    />
  </button>
);

/** 单个渠道卡片组件 — 根据 fields 定义渲染多字段表单，支持显示 CLI 添加结果 */
const ChannelCard: React.FC<{
  config: ChannelConfig;
  addResult?: ChannelAddResult;
  onToggle: (enabled: boolean) => void;
  onFieldChange: (fieldId: string, value: string) => void;
  onTest: () => void;
}> = ({ config, addResult, onToggle, onFieldChange, onTest }) => {
  const accentColor = channelColors[config.key] || 'var(--app-active-text)';
  /** 是否有可填写的输入字段（排除 info 类型） */
  const inputFields = config.fields.filter((f) => f.type !== 'info');
  /** 所有必填字段是否已填写 */
  const allRequiredFilled = config.fields
    .filter((f) => f.required)
    .every((f) => (config.fieldValues[f.id] || '').trim() !== '');

  return (
    <div
      className={`rounded-2xl border transition-all duration-200${config.enabled ? ' col-span-2' : ''}`}
      style={{
        backgroundColor: 'var(--app-bg)',
        borderColor: config.enabled ? accentColor : 'var(--app-border)',
        boxShadow: config.enabled ? `0 0 0 1px ${accentColor}22` : 'none',
      }}
    >
      {/* 渠道标题行：名称 + 开关 */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          {/* 渠道颜色标识点 */}
          <div
            className="h-3 w-3 rounded-full"
            style={{ backgroundColor: accentColor }}
          />
          <div>
            <div className="text-sm font-semibold">{config.label}</div>
            {!config.enabled && (
              <div className="mt-0.5 text-xs" style={{ color: 'var(--app-text-muted)' }}>
                {config.hint}
              </div>
            )}
          </div>
        </div>
        <ChannelToggle enabled={config.enabled} onChange={onToggle} />
        {/* CLI 添加结果状态标记 */}
        {addResult && (
          addResult.success ? (
            <CheckCircle2 size={16} style={{ color: '#22c55e' }} aria-label="添加成功" />
          ) : (
            <XCircle size={16} style={{ color: '#ef4444' }} aria-label="添加失败" />
          )
        )}
      </div>

      {/* 启用后展开的凭证输入区域 — 根据 fields 动态渲染 */}
      {config.enabled && (
        <div
          className="border-t px-4 pb-4 pt-3 space-y-3"
          style={{ borderColor: 'var(--app-border)' }}
        >
          {/* CLI 命令提示 */}
          {config.cliHint && (
            <div
              className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs font-mono"
              style={{ backgroundColor: 'var(--app-bg-subtle, rgba(0,0,0,0.03))', color: 'var(--app-text-muted)' }}
            >
              <Terminal size={12} className="mt-0.5 shrink-0" />
              <span className="break-all">{config.cliHint}</span>
            </div>
          )}

          {/* 逐字段渲染 */}
          {config.fields.map((field) => (
            <div key={field.id}>
              {field.type === 'info' ? (
                /* 只读提示信息（如 WhatsApp QR 配对说明） */
                <div
                  className="rounded-lg px-3 py-2.5 text-xs leading-relaxed"
                  style={{ backgroundColor: 'var(--app-bg-subtle, rgba(0,0,0,0.03))', color: 'var(--app-text-muted)' }}
                >
                  {field.placeholder}
                </div>
              ) : (
                /* 可编辑输入字段 */
                <>
                  <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--app-text-muted)' }}>
                    {field.label}
                    {field.required && <span style={{ color: '#ef4444' }}> *</span>}
                  </label>
                  <input
                    type={field.type === 'password' ? 'password' : 'text'}
                    value={config.fieldValues[field.id] || ''}
                    onChange={(e) => onFieldChange(field.id, e.target.value)}
                    placeholder={field.placeholder}
                    className="w-full rounded-xl border px-3 py-2 text-sm outline-none transition-colors duration-200 focus:ring-2"
                    style={{
                      backgroundColor: 'var(--app-bg)',
                      borderColor: 'var(--app-border)',
                      color: 'var(--app-text)',
                      outlineColor: 'var(--app-active-border)',
                    }}
                  />
                </>
              )}
            </div>
          ))}

          {/* 测试连接按钮（仅当有可填写字段时显示） */}
          {inputFields.length > 0 && (
            <div className="flex items-center gap-3">
              <AppButton
                size="sm"
                variant="secondary"
                onClick={onTest}
                disabled={!allRequiredFilled || config.testStatus === 'testing'}
                icon={config.testStatus === 'testing'
                  ? <Loader2 size={14} className="animate-spin" />
                  : <Zap size={14} />
                }
              >
                测试连接
              </AppButton>

              {/* 测试状态反馈 */}
              {config.testStatus === 'ok' && (
                <span className="flex items-center gap-1.5 text-xs" style={{ color: '#22c55e' }}>
                  <CheckCircle2 size={13} /> 连接成功
                </span>
              )}
              {config.testStatus === 'error' && (
                <span className="flex items-center gap-1.5 text-xs" style={{ color: '#f87171' }}>
                  <XCircle size={13} /> {config.testError || '连接测试失败'}
                </span>
              )}
            </div>
          )}

          {/* CLI 添加失败时显示错误信息 */}
          {addResult && !addResult.success && (
            <div
              className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs"
              style={{ backgroundColor: 'rgba(239, 68, 68, 0.08)', color: '#ef4444' }}
            >
              <XCircle size={13} className="mt-0.5 shrink-0" />
              <span>{addResult.error || '渠道添加失败'}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * 渠道绑定页面组件。
 * 路由: /setup/local/channels
 * 位于配置确认之后、创建 Agent 之前。
 * 显示所有支持的消息渠道，允许用户启用/禁用并配置凭证。
 * "继续"按钮会调用 CLI 添加已启用渠道，"跳过"仅保存配置。
 */
export const SetupChannelsPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    channelConfigs,
    updateChannelConfig,
    testChannelConnection,
    saveChannelConfigs,
    addEnabledChannels,
    channelAddResults,
    isBusy,
  } = useSetupFlow();

  /** 是否正在执行 CLI 添加渠道 */
  const [isAdding, setIsAdding] = React.useState(false);

  /** 按钮禁用状态：上下文忙碌或正在添加渠道时禁用 */
  const buttonsDisabled = isBusy || isAdding;

  /** 跳过渠道配置，仅保存配置到 electron-store 并导航到创建 Agent 页 */
  const handleSkip = async () => {
    await saveChannelConfigs();
    navigate('/setup/local/create-agent');
  };

  /** 执行 CLI 添加已启用渠道，保存配置后导航到创建 Agent 页 */
  const handleContinue = async () => {
    setIsAdding(true);
    try {
      await addEnabledChannels();
      await saveChannelConfigs();
    } finally {
      setIsAdding(false);
    }
    navigate('/setup/local/create-agent');
  };

  /** 已启用的渠道数量 */
  const enabledCount = channelConfigs.filter((ch) => ch.enabled).length;

  return (
    <SetupLayout
      title="渠道绑定"
      description="配置消息渠道连接，让 OpenClaw 能够接收和发送消息。你可以稍后在设置中修改。"
      stepLabel="渠道配置"
    >
      {/* 渠道列表 — 虚拟滚动，仅渲染视口内可见的卡片 */}
      <VirtualChannelList
        configs={channelConfigs}
        addResults={channelAddResults}
        height={Math.max(300, typeof window !== 'undefined' ? window.innerHeight - 380 : 500)}
        itemHeight={64}
        bufferSize={2}
        onToggle={(key, enabled) => updateChannelConfig(key, {
          enabled,
          ...(!enabled ? { testStatus: 'idle' as const, testError: undefined } : {}),
        })}
        onFieldChange={(key, fieldId, value) => updateChannelConfig(key, {
          fieldValues: { ...channelConfigs.find((c) => c.key === key)?.fieldValues, [fieldId]: value },
          testStatus: 'idle',
          testError: undefined,
        })}
        onTest={(key) => void testChannelConnection(key)}
        renderItem={(config, addResult) => (
          <ChannelCard
            config={config}
            addResult={addResult}
            onToggle={(enabled) => updateChannelConfig(config.key, {
              enabled,
              ...(!enabled ? { testStatus: 'idle' as const, testError: undefined } : {}),
            })}
            onFieldChange={(fieldId, value) => updateChannelConfig(config.key, {
              fieldValues: { ...config.fieldValues, [fieldId]: value },
              testStatus: 'idle',
              testError: undefined,
            })}
            onTest={() => void testChannelConnection(config.key)}
          />
        )}
      />

      {/* 已启用渠道计数提示 */}
      {enabledCount > 0 && (
        <div
          className="mt-4 rounded-xl px-4 py-2.5 text-xs"
          style={{ backgroundColor: 'var(--app-bg)', color: 'var(--app-text-muted)' }}
        >
          已启用 {enabledCount} 个渠道。凭证测试失败不会阻止你继续。
        </div>
      )}

      {/* 底部操作栏：始终可见，不随渠道列表滚动 */}
      <SetupActionBar>
        <AppButton
          variant="secondary"
          onClick={() => void handleSkip()}
          disabled={buttonsDisabled}
          icon={<SkipForward size={14} />}
        >
          跳过
        </AppButton>
        <AppButton
          variant="primary"
          onClick={() => void handleContinue()}
          disabled={buttonsDisabled}
          icon={isAdding
            ? <Loader2 size={15} className="animate-spin" />
            : <ChevronRight size={15} />
          }
        >
          {isAdding ? '添加中…' : '继续'}
        </AppButton>
      </SetupActionBar>
    </SetupLayout>
  );
};

export default SetupChannelsPage;
