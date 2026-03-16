import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Bot, CheckCircle2, ChevronRight, ExternalLink, Laptop, Link2, Loader2, MessageSquare, RefreshCw, Server, Settings2, Shield, ShieldCheck, Stethoscope, Wrench, XCircle } from 'lucide-react';
import SetupSkeleton from '../../components/setup/SetupSkeleton';
import AppButton from '../../components/AppButton';
import SetupLayout from '../../components/setup/SetupLayout';
import { useSetupFlow } from '../../contexts/SetupFlowContext';
import type { FixableIssue, SetupMode, SetupRemoteDraft } from '../../types/setup';

const SetupActionBar: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="mt-6 flex flex-wrap items-center gap-3">
      {children}
    </div>
  );
};

const SetupModeCard: React.FC<{
  title: string;
  description: string;
  icon: React.ReactNode;
  onClick: () => void;
}> = ({ title, description, icon, onClick }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-h-[176px] flex-1 cursor-pointer flex-col justify-between rounded-2xl border p-5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(0,0,0,0.12)] focus:outline-none focus:ring-2"
      style={{
        backgroundColor: 'var(--app-bg)',
        borderColor: 'var(--app-border)',
        boxShadow: '0 8px 20px rgba(0, 0, 0, 0.08)',
        outlineColor: 'var(--app-active-border)',
      }}
    >
      <div
        className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border transition-colors duration-200 group-hover:border-[var(--app-active-border)]"
        style={{ borderColor: 'var(--app-border)' }}
      >
        {icon}
      </div>
      <div className="mt-4">
        <div className="text-lg font-semibold md:text-xl">{title}</div>
        <p className="mt-2 text-sm leading-6" style={{ color: 'var(--app-text-muted)' }}>
          {description}
        </p>
      </div>
      <div className="mt-4 inline-flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--app-active-text)' }}>
        开始初始化
        <ChevronRight size={16} />
      </div>
    </button>
  );
};

const SetupInfoList: React.FC<{ items: string[] }> = ({ items }) => {
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div
          key={item}
          className="rounded-xl border px-4 py-3 text-sm leading-6"
          style={{
            backgroundColor: 'var(--app-bg)',
            borderColor: 'var(--app-border)',
            color: 'var(--app-text-muted)',
          }}
        >
          {item}
        </div>
      ))}
    </div>
  );
};


const SetupRemoteForm: React.FC<{
  defaultValue: SetupRemoteDraft;
}> = ({ defaultValue }) => {
  const [draft, setDraft] = React.useState<SetupRemoteDraft>(defaultValue);
  const {
    isBusy,
    saveRemoteDraft,
  } = useSetupFlow();
  const navigate = useNavigate();

  React.useEffect(() => {
    setDraft(defaultValue);
  }, [defaultValue]);

  const updateDraft = (key: keyof SetupRemoteDraft, value: string) => {
    setDraft((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    await saveRemoteDraft(draft);
    navigate('/setup/remote/verify');
  };

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-[0.8fr_0.2fr]">
        <div>
          <label className="mb-2 block text-sm font-medium">服务器地址</label>
          <input
            value={draft.host}
            onChange={(event) => updateDraft('host', event.target.value)}
            className="w-full rounded-xl border px-4 py-3 text-sm outline-none transition-colors duration-200 focus:ring-2"
            style={{
              backgroundColor: 'var(--app-bg)',
              borderColor: 'var(--app-border)',
              color: 'var(--app-text)',
              outlineColor: 'var(--app-active-border)',
            }}
            placeholder="例如 192.168.1.10 或 api.example.com"
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium">端口</label>
          <input
            value={draft.port}
            onChange={(event) => updateDraft('port', event.target.value)}
            className="w-full rounded-xl border px-4 py-3 text-sm outline-none transition-colors duration-200 focus:ring-2"
            style={{
              backgroundColor: 'var(--app-bg)',
              borderColor: 'var(--app-border)',
              color: 'var(--app-text)',
              outlineColor: 'var(--app-active-border)',
            }}
            placeholder="3000"
          />
        </div>
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium">协议</label>
        <div className="flex gap-3">
          {(['http', 'https'] as const).map((protocol) => (
            <button
              key={protocol}
              type="button"
              onClick={() => updateDraft('protocol', protocol)}
              className="cursor-pointer rounded-xl border px-4 py-3 text-sm font-medium transition-all duration-200 hover:-translate-y-0.5 focus:outline-none focus:ring-2"
              style={{
                backgroundColor: draft.protocol === protocol ? 'var(--app-active-bg)' : 'var(--app-bg)',
                borderColor: draft.protocol === protocol ? 'var(--app-active-border)' : 'var(--app-border)',
                color: draft.protocol === protocol ? 'var(--app-active-text)' : 'var(--app-text)',
                boxShadow: draft.protocol === protocol ? '0 8px 20px rgba(59, 130, 246, 0.18)' : 'none',
                outlineColor: 'var(--app-active-border)',
              }}
            >
              {protocol.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium">访问令牌</label>
        <input
          value={draft.token}
          onChange={(event) => updateDraft('token', event.target.value)}
          className="w-full rounded-xl border px-4 py-3 text-sm outline-none transition-colors duration-200 focus:ring-2"
          style={{
            backgroundColor: 'var(--app-bg)',
            borderColor: 'var(--app-border)',
            color: 'var(--app-text)',
            outlineColor: 'var(--app-active-border)',
          }}
          placeholder="如官方文档要求，可在此填写 token"
        />
      </div>
      <SetupActionBar>
        <AppButton type="submit" variant="primary" disabled={isBusy || !draft.host.trim()}>
          保存并验证
        </AppButton>
      </SetupActionBar>
    </form>
  );
};


export const SetupWelcomePage: React.FC = () => {
  const navigate = useNavigate();
  const { selectMode } = useSetupFlow();

  const handleSelectMode = async (mode: SetupMode, path: string) => {
    await selectMode(mode);
    navigate(path);
  };

  return (
    <SetupLayout
      title="欢迎使用 OpenClaw Desktop"
      description="首次启动需要先完成初始化。你可以在本机安装 OpenClaw，也可以连接一台已经配置好的远程 OpenClaw 服务。"
      canGoBack={false}
      stepLabel="初始化向导"
    >
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <SetupModeCard
          title="在本机安装 OpenClaw"
          description="适合第一次接触 OpenClaw 的用户。桌面端会先检测本机安装情况，再引导你完成路径配置与可用性验证。"
          icon={<Laptop size={22} />}
          onClick={() => void handleSelectMode('local', '/setup/local/intro')}
        />
        <SetupModeCard
          title="连接远程 OpenClaw"
          description="适合已经在服务器、NAS 或另一台电脑上完成部署的用户。你只需要填写连接信息并验证连通性。"
          icon={<Server size={22} />}
          onClick={() => void handleSelectMode('remote', '/setup/remote/intro')}
        />
      </div>
    </SetupLayout>
  );
};

export const SetupLocalIntroPage: React.FC = () => {
  const navigate = useNavigate();
  const { runtimeResolution } = useSetupFlow();

  /** 内置运行时是否完整可用 */
  const isBundledReady = runtimeResolution?.tier === 'bundled';

  /**
   * 点击"开始"按钮的处理逻辑：
   * - 内置运行时完整可用时，跳过环境自检页和安装检测页，直接进入配置确认页
   * - 否则导航到环境自检页，走常规检测流程
   */
  const handleStart = () => {
    if (isBundledReady) {
      navigate('/setup/local/configure');
    } else {
      navigate('/setup/local/environment');
    }
  };

  return (
    <SetupLayout
      title="本机安装流程"
      description="这个流程会先检查你当前机器上是否已经安装 OpenClaw。如果已安装，会直接复用；如果没有安装，则按照官方步骤继续引导。"
      stepLabel="步骤 1 / 6"
    >
      {/* 内置运行时就绪时显示快速通道提示 */}
      {isBundledReady && (
        <div
          className="mb-4 flex items-center gap-3 rounded-2xl border p-4"
          style={{
            backgroundColor: 'rgba(34,197,94,0.08)',
            borderColor: 'rgba(34,197,94,0.35)',
          }}
        >
          <Shield size={20} style={{ color: '#22c55e', flexShrink: 0 }} />
          <div>
            <div className="text-sm font-semibold" style={{ color: '#22c55e' }}>
              内置运行环境已就绪
            </div>
            <div className="mt-0.5 text-xs" style={{ color: 'var(--app-text-muted)' }}>
              检测到完整的内置运行时，点击"开始"将跳过环境检测直接进入配置
            </div>
          </div>
        </div>
      )}

      <SetupInfoList items={[
        '先做系统环境自检，确认当前设备满足安装 OpenClaw Desktop 的基础要求。',
        '系统将优先检测 OpenClaw 命令是否存在，以及当前根目录是否有效。',
        '如果已经存在可用安装，你可以直接采用当前安装，无需重复配置。',
        '如果未安装或安装损坏，将进入安装指导页，并在完成后继续验证。',
      ]} />
      <SetupActionBar>
        <AppButton variant="primary" onClick={handleStart}>
          {isBundledReady ? '开始配置' : '开始环境自检'}
        </AppButton>

        {/* 环境诊断入口：无论内置运行时是否可用，始终可访问环境自检页 */}
        <button
          type="button"
          onClick={() => navigate('/setup/local/environment')}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-70"
          style={{ color: 'var(--app-text-muted)' }}
        >
          <Stethoscope size={13} />
          环境诊断
        </button>
      </SetupActionBar>
    </SetupLayout>
  );
};

/** 检测项数据结构 */
interface CheckItem {
  /** 检测项标签 */
  label: string;
  /** 是否通过 */
  ok: boolean;
  /** 状态说明文字 */
  detail: string;
  /** 是否为警告状态（通过但有问题） */
  warn?: boolean;
  /** 警告时的详细说明 */
  warnDetail?: string;
  /** 是否可修复 */
  fixable?: boolean;
  /** 修复动作类型 */
  fixAction?: 'install' | 'upgrade' | 'fixPath';
  /** 是否可选 */
  optional?: boolean;
  /** 是否被内置运行环境覆盖 */
  coveredByBundled?: boolean;
}

/** 检测项分组 */
interface CheckGroup {
  /** 分组标题 */
  title: string;
  /** 分组内的检测项 */
  items: CheckItem[];
}

/**
 * 根据 fixableIssues 查找指定 action 对应的可修复问题。
 */
const findFixableIssue = (
  issues: FixableIssue[],
  action: 'install' | 'upgrade' | 'fixPath',
): FixableIssue | undefined => issues.find((i) => i.action === action);

export const SetupLocalEnvironmentPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    environmentCheck,
    refreshEnvironmentCheck,
    fixEnvironment,
    fixProgress,
    isBusy,
  } = useSetupFlow();

  // 检测耗时计时器：超过 5 秒显示加载指示器
  const [showLoadingHint, setShowLoadingHint] = React.useState(false);
  const loadingTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // 当 isBusy 变化时管理计时器
  React.useEffect(() => {
    if (isBusy) {
      loadingTimerRef.current = setTimeout(() => {
        setShowLoadingHint(true);
      }, 5000);
    } else {
      // 检测完成，清除计时器和提示
      if (loadingTimerRef.current) {
        clearTimeout(loadingTimerRef.current);
        loadingTimerRef.current = null;
      }
      setShowLoadingHint(false);
    }
    return () => {
      if (loadingTimerRef.current) {
        clearTimeout(loadingTimerRef.current);
      }
    };
  }, [isBusy]);

  const platformLabel = environmentCheck.platformLabel || '检测中…';
  const bundled = environmentCheck.runtimeTier === 'bundled';
  const nodeOk = bundled || environmentCheck.nodeInstalled;
  const nodeVersionOk = bundled || environmentCheck.nodeVersionSatisfies;
  const npmOk = bundled || environmentCheck.npmInstalled;
  const openclawOk = environmentCheck.openclawInstalled;
  const fixableIssues = environmentCheck.fixableIssues || [];

  // 必要条件是否全部满足
  const requiredMet = bundled || (nodeOk && nodeVersionOk && openclawOk);
  // 允许继续的条件：内置运行时就绪，或必要条件满足
  const canContinue = bundled || (nodeOk && nodeVersionOk);

  // 修复进度是否正在运行
  const isFixing = fixProgress.status === 'running';

  /** 处理一键修复按钮点击 */
  const handleFix = (action: 'install' | 'upgrade' | 'fixPath') => {
    void fixEnvironment(action);
  };

  // ── 构建检测项分组 ──────────────────────────────────────────────────────

  /** 必要条件检测项 */
  const requiredItems: CheckItem[] = [
    {
      label: 'Node.js 运行环境',
      ok: nodeOk && nodeVersionOk,
      detail: bundled
        ? '已由内置运行环境覆盖'
        : environmentCheck.nodeInstalled
          ? nodeVersionOk
            ? `已就绪（${environmentCheck.nodeVersion || ''}）`
            : `版本过低（${environmentCheck.nodeVersion || '未知'}），需要 22 或更高版本`
          : '未检测到，需要安装后才能继续',
      warn: nodeOk && !nodeVersionOk && !bundled,
      warnDetail: `当前版本 ${environmentCheck.nodeVersion || '未知'}，需要 22 或更高版本`,
      fixable: !bundled && (
        (!nodeOk && Boolean(findFixableIssue(fixableIssues, 'install')))
        || (nodeOk && !nodeVersionOk && Boolean(findFixableIssue(fixableIssues, 'upgrade')))
      ),
      fixAction: !nodeOk
        ? 'install'
        : nodeOk && !nodeVersionOk
          ? 'upgrade'
          : undefined,
      coveredByBundled: bundled,
    },
    {
      label: 'OpenClaw 命令行工具',
      ok: bundled || openclawOk,
      detail: bundled
        ? '已由内置运行环境覆盖'
        : openclawOk
          ? `已就绪（${environmentCheck.openclawVersion || ''}）`
          : '未安装，后续步骤会引导安装',
      fixable: !bundled && !openclawOk && Boolean(findFixableIssue(fixableIssues, 'install')),
      fixAction: !openclawOk ? 'install' : undefined,
      coveredByBundled: bundled,
    },
  ];

  /** 可选条件检测项 */
  const optionalItems: CheckItem[] = [
    {
      label: 'npm 包管理器',
      ok: npmOk,
      detail: bundled
        ? '已由内置运行环境覆盖'
        : environmentCheck.npmInstalled
          ? `已就绪（${environmentCheck.npmVersion || ''}）`
          : '未检测到，请确认 Node.js 安装完整',
      optional: true,
      coveredByBundled: bundled,
    },
    {
      label: 'OpenClaw 配置文件',
      ok: environmentCheck.openclawConfigExists,
      detail: environmentCheck.openclawConfigExists
        ? '已存在'
        : '尚未创建，后续步骤会自动生成',
      optional: true,
    },
  ];

  // 检测 PATH 修复按钮：Node.js 已安装但 PATH 未检测到
  const hasPathIssue = !bundled && !nodeOk && Boolean(findFixableIssue(fixableIssues, 'fixPath'));

  const checkGroups: CheckGroup[] = [
    { title: '必要条件', items: requiredItems },
    { title: '可选条件', items: optionalItems },
  ];

  /** 渲染单个检测项 */
  const renderCheckItem = (item: CheckItem) => {
    const isWarn = item.warn && !item.coveredByBundled;
    const isFail = !item.ok && !item.optional && !item.coveredByBundled;
    const showFixButton = item.fixable && item.fixAction && !isFixing;

    return (
      <div
        key={item.label}
        className="flex items-start justify-between rounded-2xl border p-4"
        style={{
          backgroundColor: 'var(--app-bg)',
          borderColor: isFail
            ? 'rgba(239,68,68,0.35)'
            : isWarn
              ? 'rgba(234,179,8,0.35)'
              : 'var(--app-border)',
        }}
      >
        <div className="flex items-center gap-3">
          {/* 状态图标 */}
          {isFail ? (
            <XCircle size={16} style={{ color: '#f87171', flexShrink: 0 }} />
          ) : isWarn ? (
            <AlertTriangle size={16} style={{ color: '#facc15', flexShrink: 0 }} />
          ) : (
            <CheckCircle2
              size={16}
              style={{
                color: item.ok || item.coveredByBundled
                  ? 'var(--app-active-text)'
                  : 'var(--app-text-muted)',
                flexShrink: 0,
              }}
            />
          )}
          <div>
            <div className="text-sm font-medium">{item.label}</div>
            <div className="mt-0.5 text-xs" style={{ color: 'var(--app-text-muted)' }}>
              {isWarn ? item.warnDetail : item.detail}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* 可选标签 */}
          {item.optional && !item.ok && !item.coveredByBundled && (
            <span className="text-xs" style={{ color: 'var(--app-text-muted)' }}>可选</span>
          )}
          {/* 一键修复按钮 */}
          {showFixButton && (
            <AppButton
              size="xs"
              variant="primary"
              onClick={() => handleFix(item.fixAction!)}
              disabled={isBusy || isFixing}
              icon={<Wrench size={12} />}
            >
              一键修复
            </AppButton>
          )}
        </div>
      </div>
    );
  };

  return (
    <SetupLayout
      title="环境自检"
      description="正在检测当前设备的运行环境，确认满足要求后继续。"
      stepLabel="步骤 2 / 6"
    >
      {/* 加载中：显示骨架屏 */}
      {isBusy ? (
        <SetupSkeleton
          variant="environment-check"
          activeLabel={showLoadingHint ? '环境检测' : undefined}
          estimatedRemaining={showLoadingHint ? 5 : undefined}
        />
      ) : (
        <>
          {/* 内置运行环境就绪横幅 */}
          {bundled && (
            <div
              className="mb-4 flex items-center gap-3 rounded-2xl border p-4"
              style={{
                backgroundColor: 'rgba(34,197,94,0.08)',
                borderColor: 'rgba(34,197,94,0.35)',
              }}
            >
              <Shield size={20} style={{ color: '#22c55e', flexShrink: 0 }} />
              <div>
                <div className="text-sm font-semibold" style={{ color: '#22c55e' }}>
                  内置运行环境就绪
                </div>
                <div className="mt-0.5 text-xs" style={{ color: 'var(--app-text-muted)' }}>
                  应用已完全自包含，无需任何外部依赖，可直接使用
                </div>
              </div>
            </div>
          )}

          {/* 平台信息 */}
          <div
            className="rounded-2xl border p-4"
            style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)' }}
          >
            <div className="flex items-center gap-2">
              <Laptop size={16} style={{ color: 'var(--app-text-muted)' }} />
              <span className="text-sm font-medium" style={{ color: 'var(--app-text-muted)' }}>当前平台</span>
            </div>
            <div className="mt-1 text-xl font-semibold">{platformLabel}</div>
          </div>

          {/* 分组检测项 */}
          {checkGroups.map((group) => (
            <div key={group.title} className="mt-5">
              <div
                className="mb-2 text-xs font-semibold uppercase tracking-[0.12em]"
                style={{ color: 'var(--app-text-muted)' }}
              >
                {group.title}
              </div>
              <div className="space-y-3">
                {group.items.map(renderCheckItem)}
              </div>
            </div>
          ))}

          {/* PATH 修复按钮（独立显示） */}
          {hasPathIssue && (
            <div className="mt-4">
              <AppButton
                size="sm"
                variant="secondary"
                onClick={() => handleFix('fixPath')}
                disabled={isBusy || isFixing}
                icon={<Wrench size={14} />}
              >
                修复 PATH 配置
              </AppButton>
            </div>
          )}

          {/* 修复进度显示 */}
          {(fixProgress.status === 'running' || fixProgress.status === 'done' || fixProgress.status === 'error') && fixProgress.message && (
            <div
              className="mt-4 flex items-center gap-3 rounded-2xl border p-4 text-sm"
              style={{
                backgroundColor: fixProgress.status === 'error'
                  ? 'rgba(239,68,68,0.06)'
                  : fixProgress.status === 'done'
                    ? 'rgba(34,197,94,0.06)'
                    : 'var(--app-bg)',
                borderColor: fixProgress.status === 'error'
                  ? 'rgba(239,68,68,0.28)'
                  : fixProgress.status === 'done'
                    ? 'rgba(34,197,94,0.28)'
                : 'var(--app-border)',
          }}
        >
          {fixProgress.status === 'running' && (
            <Loader2 size={16} className="animate-spin" style={{ color: 'var(--app-active-text)', flexShrink: 0 }} />
          )}
          {fixProgress.status === 'done' && (
            <CheckCircle2 size={16} style={{ color: '#22c55e', flexShrink: 0 }} />
          )}
          {fixProgress.status === 'error' && (
            <XCircle size={16} style={{ color: '#f87171', flexShrink: 0 }} />
          )}
          <span style={{ color: 'var(--app-text-muted)' }}>{fixProgress.message}</span>
        </div>
      )}

      {/* 必要条件未满足时的引导信息 */}
      {!bundled && !requiredMet && (
        <div
          className="mt-4 rounded-2xl border p-4 text-sm"
          style={{
            backgroundColor: 'rgba(239,68,68,0.06)',
            borderColor: 'rgba(239,68,68,0.28)',
            color: 'var(--app-text)',
          }}
        >
          <div className="font-semibold" style={{ color: '#f87171' }}>部分必要条件尚未满足</div>
          <div className="mt-1 leading-6" style={{ color: 'var(--app-text-muted)' }}>
            你可以点击检测项旁的"一键修复"按钮让系统自动处理，也可以跳过此步骤进入安装流程。
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href="https://nodejs.org/zh-cn/download"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:opacity-80"
              style={{ borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
            >
              <ExternalLink size={12} />
              Node.js 官网下载
            </a>
            <a
              href="https://nodejs.org/zh-cn/download/package-manager"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:opacity-80"
              style={{ borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
            >
              <ExternalLink size={12} />
              通过包管理器安装
            </a>
          </div>
        </div>
      )}
        </>
      )}

      <SetupActionBar>
        {/* 重新检测按钮 */}
        <AppButton
          variant="secondary"
          onClick={() => void refreshEnvironmentCheck()}
          disabled={isBusy || isFixing}
          icon={<RefreshCw size={14} />}
        >
          重新检测
        </AppButton>

        {/* 跳过并继续按钮：仅在必要条件未满足时显示 */}
        {!bundled && !canContinue && (
          <AppButton
            variant="secondary"
            onClick={() => navigate('/setup/local/check')}
            disabled={isFixing}
          >
            跳过并继续
          </AppButton>
        )}

        {/* 继续按钮 */}
        <AppButton
          variant="primary"
          disabled={(!canContinue && !bundled) || isBusy || isFixing}
          onClick={() => navigate('/setup/local/check')}
          icon={<ChevronRight size={15} />}
        >
          继续
        </AppButton>
      </SetupActionBar>
    </SetupLayout>
  );
};

export const SetupLocalCheckPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    isBusy,
    localCheckResult,
    refreshLocalCheck,
  } = useSetupFlow();

  React.useEffect(() => {
    void refreshLocalCheck();
  }, [refreshLocalCheck]);

  const detectedAndReady = Boolean(localCheckResult?.commandDetected && localCheckResult?.rootDirDetected);

  return (
    <SetupLayout
      title="检查本机 OpenClaw 安装"
      description="系统正在结合命令探测、CLI 诊断与根目录诊断结果，判断是否可以直接使用本机安装。"
      stepLabel="步骤 3 / 6"
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {[
          {
            label: '命令存在',
            value: localCheckResult?.commandDetected ? '已检测到' : '未检测到',
          },
          {
            label: '根目录有效',
            value: localCheckResult?.rootDirDetected ? '可用' : '未发现',
          },
          {
            label: '版本检测',
            value: localCheckResult?.versionSuccess ? (localCheckResult.versionOutput || '成功') : '未通过',
          },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-2xl border p-4 transition-colors duration-200 hover:border-[var(--app-active-border)]"
            style={{
              backgroundColor: 'var(--app-bg)',
              borderColor: 'var(--app-border)',
            }}
          >
            <div className="text-sm font-medium">{item.label}</div>
            <div className="mt-3 text-sm" style={{ color: 'var(--app-text-muted)' }}>{item.value}</div>
          </div>
        ))}
      </div>

      {localCheckResult ? (
        <div
          className="mt-5 rounded-2xl border p-5 text-sm leading-7"
          style={{
            backgroundColor: 'var(--app-bg)',
            borderColor: 'var(--app-border)',
            color: 'var(--app-text-muted)',
          }}
        >
          <div>命令路径：{localCheckResult.commandPath || '未检测到'}</div>
          <div className="mt-2">根目录：{localCheckResult.rootDir || '未检测到'}</div>
          {localCheckResult.error ? <div className="mt-2">诊断信息：{localCheckResult.error}</div> : null}
        </div>
      ) : null}

      <SetupActionBar>
        <AppButton
          variant="secondary"
          onClick={() => void refreshLocalCheck()}
          disabled={isBusy}
          icon={<RefreshCw size={14} />}
        >
          重新检测
        </AppButton>
        <AppButton
          variant="primary"
          disabled={isBusy}
          onClick={() => navigate(detectedAndReady ? '/setup/local/confirm-existing' : '/setup/local/install-guide')}
        >
          {detectedAndReady ? '使用当前安装' : '进入安装指导'}
        </AppButton>
      </SetupActionBar>
    </SetupLayout>
  );
};

export const SetupLocalConfirmExistingPage: React.FC = () => {
  const navigate = useNavigate();
  const { localCheckResult } = useSetupFlow();

  return (
    <SetupLayout
      title="检测到可用的本机安装"
      description="你当前的机器上已经存在可用的 OpenClaw 安装。可以直接采用当前安装，也可以转到安装指导重新整理路径。"
      stepLabel="步骤 4 / 6"
    >
      <SetupInfoList items={[
        `命令路径：${localCheckResult?.commandPath || '未检测到'}`,
        `根目录：${localCheckResult?.rootDir || '未检测到'}`,
        `版本信息：${localCheckResult?.versionOutput || '尚未返回版本号'}`,
      ]} />
      <SetupActionBar>
        <AppButton variant="primary" onClick={() => navigate('/setup/local/configure')}>
          使用这个安装
        </AppButton>
        <AppButton variant="secondary" onClick={() => navigate('/setup/local/install-guide')}>
          重新安装或手动指定
        </AppButton>
      </SetupActionBar>
    </SetupLayout>
  );
};

export { SetupLocalInstallGuidePage } from './SetupLocalInstallGuidePage';

/** 渠道绑定页面：独立步骤，位于配置确认之后、最终验证之前 */
export { SetupChannelsPage } from './SetupChannelsPage';

export const SetupLocalConfigurePage: React.FC = () => {
  const navigate = useNavigate();
  const {
    localCheckResult,
    saveLocalConfiguration,
    setupSettings,
    isBusy,
  } = useSetupFlow();

  const detectedPath = localCheckResult?.commandPath || setupSettings.openclawPath || '';
  const detectedRootDir = localCheckResult?.rootDir || setupSettings.openclawRootDir || '';

  const handleContinue = async () => {
    await saveLocalConfiguration({
      openclawPath: detectedPath,
      openclawRootDir: detectedRootDir,
    });
    // 导航到渠道绑定步骤（配置确认 → 渠道绑定 → 最终验证）
    navigate('/setup/local/channels');
  };

  return (
    <SetupLayout
      title="确认安装配置"
      description="桌面端已自动识别 OpenClaw 的安装位置，确认后继续验证。"
      stepLabel="步骤 5 / 6"
    >
      <div className="space-y-4">
        <div
          className="rounded-2xl border p-5"
          style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)' }}
        >
          <div className="text-sm font-semibold" style={{ color: 'var(--app-text)' }}>检测结果</div>
          <div className="mt-4 space-y-3">
            <div
              className="flex items-center justify-between rounded-xl border px-4 py-3 text-sm"
              style={{ backgroundColor: 'var(--app-bg-elevated)', borderColor: 'var(--app-border)' }}
            >
              <span style={{ color: 'var(--app-text-muted)' }}>安装状态</span>
              <span style={{ color: detectedPath ? 'var(--app-active-text)' : 'var(--app-text-muted)' }}>
                {detectedPath ? '已检测到' : '未检测到'}
              </span>
            </div>
            <div
              className="flex items-center justify-between rounded-xl border px-4 py-3 text-sm"
              style={{ backgroundColor: 'var(--app-bg-elevated)', borderColor: 'var(--app-border)' }}
            >
              <span style={{ color: 'var(--app-text-muted)' }}>数据目录</span>
              <span style={{ color: detectedRootDir ? 'var(--app-active-text)' : 'var(--app-text-muted)' }}>
                {detectedRootDir ? '已就绪' : '未检测到'}
              </span>
            </div>
            {localCheckResult?.versionOutput ? (
              <div
                className="flex items-center justify-between rounded-xl border px-4 py-3 text-sm"
                style={{ backgroundColor: 'var(--app-bg-elevated)', borderColor: 'var(--app-border)' }}
              >
                <span style={{ color: 'var(--app-text-muted)' }}>版本</span>
                <span style={{ color: 'var(--app-text)' }}>{localCheckResult.versionOutput}</span>
              </div>
            ) : null}
          </div>
        </div>

        {!detectedPath && (
          <div
            className="rounded-2xl border p-5 text-sm leading-6"
            style={{
              backgroundColor: 'rgba(245, 158, 11, 0.08)',
              borderColor: 'rgba(245, 158, 11, 0.24)',
              color: 'var(--app-text-muted)',
            }}
          >
            未能自动检测到 OpenClaw 安装位置。请返回上一步完成安装后再继续。
          </div>
        )}
      </div>

      <SetupActionBar>
        <AppButton
          variant="primary"
          disabled={isBusy || !detectedPath}
          onClick={() => void handleContinue()}
        >
          确认并继续
        </AppButton>
      </SetupActionBar>
    </SetupLayout>
  );
};

export const SetupLocalVerifyPage: React.FC = () => {
  const {
    completeSetup,
    isBusy,
    verifyLocalSetup,
  } = useSetupFlow();

  const handleVerify = async () => {
    const success = await verifyLocalSetup();
    if (success) {
      await completeSetup();
    }
  };

  return (
    <SetupLayout
      title="验证本机 OpenClaw 可用性"
      description="桌面端会验证 CLI 是否可执行，以及当前网关状态是否已达到可用标准。"
      stepLabel="步骤 6 / 6"
    >
      <SetupInfoList items={[
        '先测试 OpenClaw CLI 是否可以返回有效结果。',
        '再检查 Desktop 当前连接到的网关状态，确认不是错误或检查中状态。',
        '验证成功后，初始化向导才会允许进入主应用。',
      ]} />
      <SetupActionBar>
        <AppButton variant="primary" onClick={() => void handleVerify()} disabled={isBusy} icon={<ShieldCheck size={16} />}>
          开始验证
        </AppButton>
      </SetupActionBar>
    </SetupLayout>
  );
};

export const SetupRemoteIntroPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <SetupLayout
      title="连接远程 OpenClaw"
      description="如果你已经在服务器或其他设备上部署好了 OpenClaw，可以在这里直接连接，无需本机安装。"
      stepLabel="步骤 1 / 3"
    >
      <SetupInfoList items={[
        '请准备好远程服务器地址、端口以及访问令牌。',
        '如果远程服务使用 HTTPS，请确认对应证书和访问方式已经按官方文档配置。',
        '验证成功后，桌面端会将远程连接保存为当前默认初始化模式。',
      ]} />
      <SetupActionBar>
        <AppButton variant="primary" onClick={() => navigate('/setup/remote/config')}>
          填写连接信息
        </AppButton>
      </SetupActionBar>
    </SetupLayout>
  );
};

export const SetupRemoteConfigPage: React.FC = () => {
  const { remoteDraft } = useSetupFlow();

  return (
    <SetupLayout
      title="填写远程连接信息"
      description="这里先保存远程连接草稿，下一步会尝试通过 Electron IPC 测试连通性。"
      stepLabel="步骤 2 / 3"
    >
      <SetupRemoteForm defaultValue={remoteDraft} />
    </SetupLayout>
  );
};

export const SetupRemoteVerifyPage: React.FC = () => {
  const {
    completeSetup,
    isBusy,
    remoteVerification,
    verifyRemoteSetup,
  } = useSetupFlow();

  const handleVerify = async () => {
    const result = await verifyRemoteSetup();
    if (result.success) {
      await completeSetup();
    }
  };

  return (
    <SetupLayout
      title="验证远程 OpenClaw 连接"
      description="如果当前桌面端尚未实现远程连接测试 IPC，这一步会明确提示；后续补齐主进程能力后即可无缝接入。"
      stepLabel="步骤 3 / 3"
    >
      <div
        className="rounded-2xl border p-5 text-sm leading-7"
        style={{
          backgroundColor: 'var(--app-bg)',
          borderColor: 'var(--app-border)',
          color: 'var(--app-text-muted)',
        }}
      >
        {remoteVerification?.success ? (
          <div className="space-y-2">
            <div>连接状态：验证成功</div>
            <div>服务版本：{remoteVerification.version || '未返回'}</div>
            <div>认证结果：{remoteVerification.authenticated ? '已通过' : '未返回'}</div>
          </div>
        ) : (
          <div>
            {remoteVerification?.error || '点击下方按钮开始验证远程 OpenClaw 连接。'}
          </div>
        )}
      </div>
      <SetupActionBar>
        <AppButton variant="primary" onClick={() => void handleVerify()} disabled={isBusy} icon={<Link2 size={16} />}>
          开始验证
        </AppButton>
      </SetupActionBar>
    </SetupLayout>
  );
};

export const SetupCompletePage: React.FC = () => {
  const navigate = useNavigate();
  const {
    completeSetup,
    createdAgent,
    isBusy,
    mode,
    persistPartialState,
    setupSettings,
  } = useSetupFlow();

  /** 已添加的渠道列表 */
  const addedChannels = setupSettings.addedChannels ?? [];
  /** 已创建的 Agent 名称（优先取 createdAgent，其次取 setupSettings） */
  const agentName = createdAgent?.name ?? setupSettings.createdAgentName ?? null;

  /** 后续操作引导卡片配置 */
  const guidanceCards: Array<{
    title: string;
    description: string;
    icon: React.ReactNode;
    route: string;
  }> = [
    {
      title: '管理智能体',
      description: '查看、创建和管理你的 AI 智能体',
      icon: <Bot size={20} />,
      route: '/agents',
    },
    {
      title: '查看会话',
      description: '浏览和管理智能体的对话会话',
      icon: <MessageSquare size={20} />,
      route: '/sessions',
    },
    {
      title: '系统设置',
      description: '配置渠道、模型和系统参数',
      icon: <Settings2 size={20} />,
      route: '/settings',
    },
  ];

  /**
   * 引导卡片点击处理：先持久化完成状态，再导航到目标页面
   * 使用 persistPartialState 而非 completeSetup，避免 completeSetup 内部导航到 '/' 的冲突
   */
  const handleGuidanceClick = async (route: string) => {
    await persistPartialState({
      runMode: mode || 'local',
      setupCompleted: true,
      setupCurrentStep: '/setup/complete',
    });
    navigate(route);
  };

  return (
    <SetupLayout
      title="初始化已完成"
      description="当前初始化流程已经准备就绪。你可以点击下方引导卡片快速进入对应功能，或点击「进入应用」按钮进入主界面。"
      stepLabel="完成"
    >
      {/* 初始化摘要卡片 */}
      <div
        className="rounded-2xl border p-6"
        style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)' }}
      >
        <div className="flex items-center gap-3 text-lg font-semibold">
          <CheckCircle2 size={22} />
          OpenClaw Desktop 已准备完成
        </div>

        <div className="mt-4 space-y-2 text-sm leading-7" style={{ color: 'var(--app-text-muted)' }}>
          {/* 运行模式 */}
          <div>
            <span className="font-medium" style={{ color: 'var(--app-text)' }}>运行模式：</span>
            {mode === 'remote' ? '连接远程 OpenClaw' : '本机 OpenClaw'}
          </div>

          {/* 已添加渠道 */}
          <div>
            <span className="font-medium" style={{ color: 'var(--app-text)' }}>已添加渠道：</span>
            {addedChannels.length > 0
              ? `${addedChannels.length} 个（${addedChannels.map((ch) => ch.label).join('、')}）`
              : '未添加渠道'}
          </div>

          {/* 已创建 Agent */}
          <div>
            <span className="font-medium" style={{ color: 'var(--app-text)' }}>已创建智能体：</span>
            {agentName ?? '未创建智能体'}
          </div>
        </div>
      </div>

      {/* 后续操作引导卡片 */}
      <div className="mt-5">
        <div className="mb-3 text-sm font-medium" style={{ color: 'var(--app-text-muted)' }}>
          接下来可以做什么
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {guidanceCards.map((card) => (
            <button
              key={card.route}
              type="button"
              disabled={isBusy}
              onClick={() => void handleGuidanceClick(card.route)}
              className="group flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 disabled:opacity-50 disabled:pointer-events-none"
              style={{
                backgroundColor: 'var(--app-bg)',
                borderColor: 'var(--app-border)',
              }}
            >
              <div
                className="flex h-9 w-9 items-center justify-center rounded-lg"
                style={{ backgroundColor: 'var(--app-bg-elevated)' }}
              >
                {card.icon}
              </div>
              <div className="text-sm font-semibold">{card.title}</div>
              <div className="text-xs leading-5" style={{ color: 'var(--app-text-muted)' }}>
                {card.description}
              </div>
              <div
                className="mt-auto flex items-center gap-1 text-xs font-medium opacity-0 transition-opacity group-hover:opacity-100"
                style={{ color: 'var(--app-text-muted)' }}
              >
                前往 <ChevronRight size={12} />
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* 主操作按钮 */}
      <SetupActionBar>
        <AppButton variant="primary" onClick={() => void completeSetup()} disabled={isBusy}>
          进入应用
        </AppButton>
      </SetupActionBar>
    </SetupLayout>
  );
};

