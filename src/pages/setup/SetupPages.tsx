import React from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, ChevronRight, Laptop, Link2, RefreshCw, Server, ShieldCheck } from 'lucide-react';
import AppButton from '../../components/AppButton';
import SetupLayout from '../../components/setup/SetupLayout';
import { useSetupFlow } from '../../contexts/SetupFlowContext';
import type { SetupMode, SetupRemoteDraft } from '../../types/setup';

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

  return (
    <SetupLayout
      title="本机安装流程"
      description="这个流程会先检查你当前机器上是否已经安装 OpenClaw。如果已安装，会直接复用；如果没有安装，则按照官方步骤继续引导。"
      stepLabel="步骤 1 / 6"
    >
      <SetupInfoList items={[
        '先做系统环境自检，确认当前设备满足安装 OpenClaw Desktop 的基础要求。',
        '系统将优先检测 OpenClaw 命令是否存在，以及当前根目录是否有效。',
        '如果已经存在可用安装，你可以直接采用当前安装，无需重复配置。',
        '如果未安装或安装损坏，将进入安装指导页，并在完成后继续验证。',
      ]} />
      <SetupActionBar>
        <AppButton variant="primary" onClick={() => navigate('/setup/local/environment')}>
          开始环境自检
        </AppButton>
      </SetupActionBar>
    </SetupLayout>
  );
};

export const SetupLocalEnvironmentPage: React.FC = () => {
  const navigate = useNavigate();
  const { environmentCheck } = useSetupFlow();

  const platformLabel = environmentCheck.platformLabel || '检测中…';

  return (
    <SetupLayout
      title="确认运行平台"
      description="桌面端已识别当前设备平台，确认后继续安装流程。"
      stepLabel="步骤 2 / 6"
    >
      <div
        className="rounded-2xl border p-5"
        style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)' }}
      >
        <div className="text-sm font-medium" style={{ color: 'var(--app-text-muted)' }}>当前平台</div>
        <div className="mt-2 text-2xl font-semibold">{platformLabel}</div>
      </div>

      <SetupActionBar>
        <AppButton variant="primary" onClick={() => navigate('/setup/local/check')}>
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
    navigate('/setup/local/verify');
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
  const {
    completeSetup,
    isBusy,
    mode,
  } = useSetupFlow();

  return (
    <SetupLayout
      title="初始化已完成"
      description="当前初始化流程已经准备就绪。点击下方按钮后，桌面端会正式进入主应用，并保持当前初始化模式。"
      stepLabel="完成"
    >
      <div className="rounded-2xl border p-6" style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)' }}>
        <div className="flex items-center gap-3 text-lg font-semibold">
          <CheckCircle2 size={22} />
          OpenClaw Desktop 已准备完成
        </div>
        <div className="mt-3 text-sm leading-7" style={{ color: 'var(--app-text-muted)' }}>
          当前模式：{mode === 'remote' ? '连接远程 OpenClaw' : '本机 OpenClaw'}
        </div>
      </div>
      <SetupActionBar>
        <AppButton variant="primary" onClick={() => void completeSetup()} disabled={isBusy}>
          进入应用
        </AppButton>
      </SetupActionBar>
    </SetupLayout>
  );
};
