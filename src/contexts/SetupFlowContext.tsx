import React from 'react';
import {
  matchPath,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import type {
  SettingsGetResult,
  SetupInstallResult,
} from '../types/electron';
import type {
  SetupEnvironmentCheck,
  SetupInstallResult as SetupInstallFlowResult,
  SetupLocalCheckResult,
  SetupMode,
  SetupRemoteDraft,
  SetupRemoteVerificationResult,
  SetupSettings,
} from '../types/setup';

interface SetupFlowContextValue {
  completeSetup: () => Promise<void>;
  currentStep: string;
  environmentCheck: SetupEnvironmentCheck;
  errorMessage: string;
  goBackStep: () => void;
  hasCompletedSetup: boolean;
  isBootstrapping: boolean;
  isBusy: boolean;
  localCheckResult: SetupLocalCheckResult | null;
  mode: SetupMode | null;
  persistPartialState: (updates: Partial<SetupSettings>) => Promise<void>;
  installOpenClawForSetup: () => Promise<SetupInstallFlowResult>;
  refreshEnvironmentCheck: () => Promise<SetupEnvironmentCheck>;
  refreshLocalCheck: () => Promise<SetupLocalCheckResult>;
  remoteDraft: SetupRemoteDraft;
  remoteVerification: SetupRemoteVerificationResult | null;
  setupInstallResult: SetupInstallFlowResult;
  saveLocalConfiguration: (payload: {
    openclawPath: string;
    openclawRootDir: string;
  }) => Promise<void>;
  saveRemoteDraft: (payload: SetupRemoteDraft) => Promise<void>;
  selectMode: (mode: SetupMode) => Promise<void>;
  setErrorMessage: React.Dispatch<React.SetStateAction<string>>;
  setupSettings: SetupSettings;
  verifyLocalSetup: () => Promise<boolean>;
  verifyRemoteSetup: () => Promise<SetupRemoteVerificationResult>;
}

const SetupFlowContext = React.createContext<SetupFlowContextValue | undefined>(undefined);

const defaultRemoteDraft: SetupRemoteDraft = {
  host: '',
  port: '3000',
  protocol: 'http',
  token: '',
};

const defaultLocalCheckResult: SetupLocalCheckResult = {
  commandDetected: false,
  commandPath: '',
  rootDirDetected: false,
  rootDir: '',
  versionSuccess: false,
  versionOutput: '',
  error: '',
};

const setupRoutePatterns = [
  '/setup/welcome',
  '/setup/local/intro',
  '/setup/local/environment',
  '/setup/local/check',
  '/setup/local/confirm-existing',
  '/setup/local/install-guide',
  '/setup/local/configure',
  '/setup/local/verify',
  '/setup/remote/intro',
  '/setup/remote/config',
  '/setup/remote/verify',
  '/setup/complete',
] as const;

const getCurrentStepFromPath = (pathname: string) => {
  const matchedPattern = setupRoutePatterns.find((pattern) => matchPath(pattern, pathname));
  return matchedPattern || '/setup/welcome';
};

const getPreviousStep = (
  pathname: string,
  setupSettings: SetupSettings,
  mode: SetupMode | null,
): string | null => {
  const step = getCurrentStepFromPath(pathname);

  if (step === '/setup/local/configure') {
    if (setupSettings.localInstallValidated) {
      return '/setup/local/confirm-existing';
    }

    return '/setup/local/install-guide';
  }

  if (step === '/setup/complete') {
    return mode === 'remote'
      ? '/setup/remote/verify'
      : '/setup/local/verify';
  }

  const backMap: Record<string, string | null> = {
    '/setup/welcome': null,
    '/setup/local/intro': '/setup/welcome',
    '/setup/local/environment': '/setup/local/intro',
    '/setup/local/check': '/setup/local/environment',
    '/setup/local/confirm-existing': '/setup/local/check',
    '/setup/local/install-guide': '/setup/local/check',
    '/setup/local/verify': '/setup/local/configure',
    '/setup/remote/intro': '/setup/welcome',
    '/setup/remote/config': '/setup/remote/intro',
    '/setup/remote/verify': '/setup/remote/config',
  };

  return backMap[step] || '/setup/welcome';
};

const normalizeSettings = (
  result: SettingsGetResult<SetupSettings> | null,
): SetupSettings => {
  if (!result?.success || !result.settings) {
    return {};
  }

  return result.settings;
};

const detectRendererPlatform = () => {
  const platform = navigator.platform || navigator.userAgent || 'unknown';
  const normalized = platform.toLowerCase();

  if (normalized.includes('mac')) {
    return {
      platform: 'darwin',
      platformLabel: 'macOS',
    };
  }

  if (normalized.includes('win')) {
    return {
      platform: 'win32',
      platformLabel: 'Windows',
    };
  }

  if (normalized.includes('linux')) {
    return {
      platform: 'linux',
      platformLabel: 'Linux',
    };
  }

  return {
    platform: 'unknown',
    platformLabel: '未知系统',
  };
};

const createFallbackEnvironmentCheck = (
  setupSettings: SetupSettings,
  errorMessage?: string,
): SetupEnvironmentCheck => {
  const platformInfo = detectRendererPlatform();
  const isWindows = platformInfo.platform === 'win32';
  const notes = [
    '当前未能从桌面端主进程拿到完整环境诊断结果，已切换为降级检测模式。',
    '你仍然可以查看后续安装检测；如需完整 Node / npm / CLI 诊断，请确认桌面端已更新到最新运行时代码。',
  ];

  if (errorMessage) {
    notes.unshift(`环境自检异常：${errorMessage}`);
  }

  return {
    source: 'fallback',
    platform: platformInfo.platform,
    platformLabel: platformInfo.platformLabel,
    runtimeMode: 'missing',
    runtimeCommand: undefined,
    bundledRuntimeAvailable: false,
    nodeInstalled: false,
    nodeVersionSatisfies: false,
    npmInstalled: false,
    openclawInstalled: false,
    openclawConfigExists: false,
    openclawRootDir: setupSettings.openclawRootDir || '',
    recommendedInstallCommand: isWindows
      ? 'iwr -useb https://openclaw.ai/install.ps1 | iex'
      : 'curl -fsSL https://openclaw.ai/install.sh | bash',
    recommendedInstallLabel: isWindows
      ? 'PowerShell 安装脚本（Windows / WSL）'
      : 'Shell 安装脚本（macOS / Linux）',
    notes,
    diagnosticError: errorMessage,
  };
};

const defaultSetupInstallResult: SetupInstallFlowResult = {
  success: false,
  message: '',
  command: '',
};

export const SetupFlowProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [isBootstrapping, setIsBootstrapping] = React.useState(true);
  const [isBusy, setIsBusy] = React.useState(false);
  const [setupSettings, setSetupSettings] = React.useState<SetupSettings>({});
  const [mode, setMode] = React.useState<SetupMode | null>(null);
  const [environmentCheck, setEnvironmentCheck] = React.useState<SetupEnvironmentCheck>(createFallbackEnvironmentCheck({}));
  const [localCheckResult, setLocalCheckResult] = React.useState<SetupLocalCheckResult | null>(null);
  const [remoteDraft, setRemoteDraft] = React.useState<SetupRemoteDraft>(defaultRemoteDraft);
  const [remoteVerification, setRemoteVerification] = React.useState<SetupRemoteVerificationResult | null>(null);
  const [setupInstallResult, setSetupInstallResult] = React.useState<SetupInstallFlowResult>(defaultSetupInstallResult);
  const [errorMessage, setErrorMessage] = React.useState('');
  const latestSettingsRef = React.useRef<SetupSettings>({});

  const currentStep = React.useMemo(
    () => getCurrentStepFromPath(location.pathname),
    [location.pathname],
  );

  const hasCompletedSetup = Boolean(setupSettings.setupCompleted);

  React.useEffect(() => {
    latestSettingsRef.current = setupSettings;
  }, [setupSettings]);

  const persistPartialState = React.useCallback(async (updates: Partial<SetupSettings>) => {
    const nextSettings = {
      ...latestSettingsRef.current,
      ...updates,
      setupLastVisitedAt: new Date().toISOString(),
    };

    latestSettingsRef.current = nextSettings;
    setSetupSettings(nextSettings);

    if (typeof window.electronAPI?.settingsSet === 'function') {
      await window.electronAPI.settingsSet(nextSettings);
    }
  }, []);

  const refreshEnvironmentCheck = React.useCallback(async () => {
    setIsBusy(true);
    setErrorMessage('');

    try {
      const result = typeof window.electronAPI?.setupEnvironmentCheck === 'function'
        ? await window.electronAPI.setupEnvironmentCheck()
        : createFallbackEnvironmentCheck(latestSettingsRef.current, '当前桌面端未暴露 setupEnvironmentCheck IPC');
      const normalizedResult: SetupEnvironmentCheck = (result as Partial<SetupEnvironmentCheck>).source
        ? result as SetupEnvironmentCheck
        : {
          ...result,
          source: 'ipc' as const,
        };

      setEnvironmentCheck(normalizedResult);

      await persistPartialState({
        detectedPlatform: normalizedResult.platform,
        detectedPlatformLabel: normalizedResult.platformLabel,
        openclawRootDir: normalizedResult.openclawRootDir || latestSettingsRef.current.openclawRootDir,
        setupCurrentStep: '/setup/local/environment',
      });

      return normalizedResult;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const fallbackResult = createFallbackEnvironmentCheck(latestSettingsRef.current, message);
      setEnvironmentCheck(fallbackResult);
      setErrorMessage('环境检测未能完成，请重试。');
      await persistPartialState({
        detectedPlatform: fallbackResult.platform,
        detectedPlatformLabel: fallbackResult.platformLabel,
        openclawRootDir: fallbackResult.openclawRootDir || latestSettingsRef.current.openclawRootDir,
        setupCurrentStep: '/setup/local/environment',
      });
      return fallbackResult;
    } finally {
      setIsBusy(false);
    }
  }, [persistPartialState]);

  const refreshLocalCheck = React.useCallback(async () => {
    setIsBusy(true);
    setErrorMessage('');

    try {
      const [detectedPathResult, commandResult, rootResult] = await Promise.all([
        typeof window.electronAPI?.detectOpenClawPath === 'function'
          ? window.electronAPI.detectOpenClawPath()
          : Promise.resolve(null),
        typeof window.electronAPI?.diagnoseOpenClawCommand === 'function'
          ? window.electronAPI.diagnoseOpenClawCommand()
          : Promise.resolve(null),
        typeof window.electronAPI?.diagnoseOpenClawRoot === 'function'
          ? window.electronAPI.diagnoseOpenClawRoot()
          : Promise.resolve(null),
      ]);

      const resolvedCommandPath = commandResult?.diagnostic?.detectedPath
        || commandResult?.diagnostic?.pathEnvCommand
        || commandResult?.diagnostic?.configuredPath
        || detectedPathResult?.path
        || '';
      const resolvedRootDir = rootResult?.diagnostic?.rootDir
        || commandResult?.diagnostic?.rootDir
        || latestSettingsRef.current.openclawRootDir
        || '';

      const nextResult: SetupLocalCheckResult = {
        commandDetected: Boolean(commandResult?.diagnostic?.commandExists || resolvedCommandPath),
        commandPath: resolvedCommandPath,
        rootDirDetected: Boolean(rootResult?.success && rootResult?.diagnostic?.exists),
        rootDir: resolvedRootDir,
        versionSuccess: Boolean(commandResult?.diagnostic?.versionSuccess),
        versionOutput: commandResult?.diagnostic?.versionOutput || '',
        error: commandResult?.error || rootResult?.error || '',
      };

      setLocalCheckResult(nextResult);
      await persistPartialState({
        localInstallValidated: nextResult.commandDetected && nextResult.rootDirDetected,
        openclawPath: nextResult.commandPath || latestSettingsRef.current.openclawPath,
        openclawRootDir: nextResult.rootDir || latestSettingsRef.current.openclawRootDir,
        setupCurrentStep: '/setup/local/check',
      });

      return nextResult;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setErrorMessage('检测过程中出现问题，请重试。');
      const nextResult = {
        ...defaultLocalCheckResult,
        error: message,
      };
      setLocalCheckResult(nextResult);
      return nextResult;
    } finally {
      setIsBusy(false);
    }
  }, [persistPartialState, setupSettings.openclawPath, setupSettings.openclawRootDir]);

  const installOpenClawForSetup = React.useCallback(async () => {
    setIsBusy(true);
    setErrorMessage('');

    const runningState: SetupInstallFlowResult = {
      success: false,
      message: '正在自动安装 OpenClaw，请稍候…',
      command: environmentCheck.recommendedInstallCommand,
    };

    setSetupInstallResult(runningState);
    await persistPartialState({
      setupInstallStatus: 'running',
      setupInstallMessage: runningState.message,
      setupCurrentStep: '/setup/local/install-guide',
    });

    try {
      const result: SetupInstallResult = typeof window.electronAPI?.setupInstallOpenClaw === 'function'
        ? await window.electronAPI.setupInstallOpenClaw()
        : {
          success: false,
          message: '当前桌面端未提供一键安装能力。',
          command: environmentCheck.recommendedInstallCommand,
          error: 'setupInstallOpenClaw IPC 不可用',
        };

      setSetupInstallResult(result);

      await persistPartialState({
        setupInstallStatus: result.success ? 'succeeded' : 'failed',
        setupInstallMessage: result.message,
        setupCurrentStep: '/setup/local/install-guide',
      });

      if (!result.success) {
        setErrorMessage('安装未能完成，请检查网络连接后重试。');
        return result;
      }

      await refreshEnvironmentCheck();
      await refreshLocalCheck();

      // 不在这里 navigate，让前端安装页面走完 model/workspace/gateway 子步骤后再跳转

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failedResult: SetupInstallFlowResult = {
        success: false,
        message: 'OpenClaw 自动安装失败。',
        command: environmentCheck.recommendedInstallCommand,
        error: message,
      };
      setSetupInstallResult(failedResult);
      setErrorMessage('安装未能完成，请检查网络连接后重试。');
      await persistPartialState({
        setupInstallStatus: 'failed',
        setupInstallMessage: failedResult.message,
        setupCurrentStep: '/setup/local/install-guide',
      });
      return failedResult;
    } finally {
      setIsBusy(false);
    }
  }, [environmentCheck.recommendedInstallCommand, navigate, persistPartialState, refreshEnvironmentCheck, refreshLocalCheck]);

  const saveLocalConfiguration = React.useCallback(async (payload: {
    openclawPath: string;
    openclawRootDir: string;
  }) => {
    setIsBusy(true);
    setErrorMessage('');

    try {
      await persistPartialState({
        localInstallValidated: false,
        openclawPath: payload.openclawPath.trim(),
        openclawRootDir: payload.openclawRootDir.trim(),
        setupCurrentStep: '/setup/local/configure',
        setupMode: 'local',
      });
      setSetupSettings((prev) => ({
        ...prev,
        openclawPath: payload.openclawPath.trim(),
        openclawRootDir: payload.openclawRootDir.trim(),
      }));
    } finally {
      setIsBusy(false);
    }
  }, [persistPartialState]);

  const verifyLocalSetup = React.useCallback(async () => {
    setIsBusy(true);
    setErrorMessage('');

    try {
      const commandResult = typeof window.electronAPI?.testOpenClawCommand === 'function'
        ? await window.electronAPI.testOpenClawCommand()
        : null;

      if (!commandResult?.success) {
        throw new Error(commandResult?.error || commandResult?.message || 'OpenClaw CLI 验证失败');
      }

      const gatewayStatus = typeof window.electronAPI?.gatewayStatus === 'function'
        ? await window.electronAPI.gatewayStatus()
        : null;

      if (gatewayStatus?.status === 'stopped' && typeof window.electronAPI?.gatewayStart === 'function') {
        const startResult = await window.electronAPI.gatewayStart();
        if (!startResult.success) {
          throw new Error(startResult.error || startResult.message || 'OpenClaw 网关启动失败');
        }
      }

      const nextGatewayStatus = typeof window.electronAPI?.gatewayStatus === 'function'
        ? await window.electronAPI.gatewayStatus()
        : gatewayStatus;

      const gatewayHealthy = nextGatewayStatus
        && nextGatewayStatus.status !== 'error'
        && nextGatewayStatus.status !== 'checking'
        && nextGatewayStatus.status !== 'stopped';

      if (!gatewayHealthy) {
        throw new Error(nextGatewayStatus?.error || 'OpenClaw 网关当前不可用，请先完成本地安装或配置。');
      }

      await persistPartialState({
        localInstallValidated: true,
        setupCurrentStep: '/setup/local/verify',
      });
      return true;
    } catch (error) {
      setErrorMessage('验证未能完成，请确认 OpenClaw 已正确安装后重试。');
      return false;
    } finally {
      setIsBusy(false);
    }
  }, [persistPartialState]);

  const saveRemoteDraft = React.useCallback(async (payload: SetupRemoteDraft) => {
    setRemoteDraft(payload);
    setRemoteVerification(null);
    await persistPartialState({
      remoteConnectionValidated: false,
      remoteHost: payload.host.trim(),
      remotePort: Number(payload.port) || undefined,
      remoteProtocol: payload.protocol,
      remoteToken: payload.token,
      setupCurrentStep: '/setup/remote/config',
      setupMode: 'remote',
    });
  }, [persistPartialState]);

  const verifyRemoteSetup = React.useCallback(async () => {
    setIsBusy(true);
    setErrorMessage('');

    try {
      if (typeof window.electronAPI?.remoteOpenClawTestConnection !== 'function') {
        const unavailableResult: SetupRemoteVerificationResult = {
          success: false,
          error: '当前桌面端还未提供远程 OpenClaw 连接测试能力，请先完成 IPC 实现。',
        };
        setRemoteVerification(unavailableResult);
        return unavailableResult;
      }

      const result = await window.electronAPI.remoteOpenClawTestConnection({
        host: remoteDraft.host.trim(),
        port: Number(remoteDraft.port) || undefined,
        protocol: remoteDraft.protocol,
        token: remoteDraft.token,
      });

      setRemoteVerification(result);

      if (!result.success) {
        throw new Error(result.error || '远程 OpenClaw 连接验证失败');
      }

      if (typeof window.electronAPI?.remoteOpenClawSaveConnection === 'function') {
        await window.electronAPI.remoteOpenClawSaveConnection({
          host: remoteDraft.host.trim(),
          port: Number(remoteDraft.port) || undefined,
          protocol: remoteDraft.protocol,
          token: remoteDraft.token,
        });
      }

      await persistPartialState({
        remoteConnectionValidated: true,
        setupCurrentStep: '/setup/remote/verify',
      });

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failedResult: SetupRemoteVerificationResult = {
        success: false,
        error: message,
      };
      setErrorMessage(message);
      setRemoteVerification(failedResult);
      return failedResult;
    } finally {
      setIsBusy(false);
    }
  }, [persistPartialState, remoteDraft]);

  const selectMode = React.useCallback(async (nextMode: SetupMode) => {
    setMode(nextMode);
    await persistPartialState({
      setupCurrentStep: nextMode === 'local' ? '/setup/local/intro' : '/setup/remote/intro',
      setupMode: nextMode,
    });
  }, [persistPartialState]);

  const completeSetup = React.useCallback(async () => {
    setIsBusy(true);
    setErrorMessage('');

    try {
      await persistPartialState({
        runMode: mode || 'local',
        setupCompleted: true,
        setupCurrentStep: '/setup/complete',
      });
      setSetupSettings((prev) => ({
        ...prev,
        runMode: mode || 'local',
        setupCompleted: true,
        setupCurrentStep: '/setup/complete',
      }));
      navigate('/');
    } finally {
      setIsBusy(false);
    }
  }, [navigate, persistPartialState]);

  const goBackStep = React.useCallback(() => {
    const previousStep = getPreviousStep(location.pathname, setupSettings, mode);
    if (previousStep) {
      navigate(previousStep);
    }
  }, [location.pathname, mode, navigate, setupSettings]);

  React.useEffect(() => {
    const bootstrap = async () => {
      setIsBootstrapping(true);

      try {
        const result = typeof window.electronAPI?.settingsGet === 'function'
          ? await window.electronAPI.settingsGet<SetupSettings>()
          : null;
        const normalizedSettings = normalizeSettings(result);
        setSetupSettings(normalizedSettings);
        setMode(normalizedSettings.setupMode || null);
        if (normalizedSettings.detectedPlatform || normalizedSettings.detectedPlatformLabel) {
          setEnvironmentCheck((prev) => ({
            source: prev?.source || 'fallback',
            platform: normalizedSettings.detectedPlatform || prev?.platform || 'unknown',
            platformLabel: normalizedSettings.detectedPlatformLabel || prev?.platformLabel || '未知系统',
            nodeInstalled: prev?.nodeInstalled || false,
            nodeVersion: prev?.nodeVersion,
            nodeVersionSatisfies: prev?.nodeVersionSatisfies || false,
            npmInstalled: prev?.npmInstalled || false,
            npmVersion: prev?.npmVersion,
            openclawInstalled: prev?.openclawInstalled || false,
            openclawVersion: prev?.openclawVersion,
            openclawConfigExists: prev?.openclawConfigExists || false,
            openclawRootDir: normalizedSettings.openclawRootDir || prev?.openclawRootDir || '',
            recommendedInstallCommand: prev?.recommendedInstallCommand || '',
            recommendedInstallLabel: prev?.recommendedInstallLabel || '',
            notes: prev?.notes || [],
            diagnosticError: prev?.diagnosticError,
          }));
        }
        setRemoteDraft({
          host: normalizedSettings.remoteHost || '',
          port: normalizedSettings.remotePort ? String(normalizedSettings.remotePort) : defaultRemoteDraft.port,
          protocol: normalizedSettings.remoteProtocol || defaultRemoteDraft.protocol,
          token: normalizedSettings.remoteToken || '',
        });
        if (normalizedSettings.openclawPath || normalizedSettings.openclawRootDir) {
          setLocalCheckResult({
            ...defaultLocalCheckResult,
            commandDetected: Boolean(normalizedSettings.openclawPath),
            commandPath: normalizedSettings.openclawPath || '',
            rootDirDetected: Boolean(normalizedSettings.openclawRootDir),
            rootDir: normalizedSettings.openclawRootDir || '',
          });
        }

        if (typeof window.electronAPI?.setupEnvironmentCheck === 'function') {
          const setupEnvironmentResult = await window.electronAPI.setupEnvironmentCheck();
          setEnvironmentCheck({
            ...setupEnvironmentResult,
            source: 'ipc',
          });
        }
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : String(error));
      } finally {
        setIsBootstrapping(false);
      }
    };

    void bootstrap();
  }, []);

  React.useEffect(() => {
    if (isBootstrapping) {
      return;
    }

    if (hasCompletedSetup && location.pathname.startsWith('/setup')) {
      navigate('/');
      return;
    }

    if (!hasCompletedSetup && !location.pathname.startsWith('/setup')) {
      navigate('/setup/welcome');
      return;
    }

    if (!hasCompletedSetup && location.pathname.startsWith('/setup')) {
      if (setupSettings.setupCurrentStep === currentStep) {
        return;
      }

      void persistPartialState({
        setupCurrentStep: currentStep,
      });
    }
  }, [
    currentStep,
    hasCompletedSetup,
    isBootstrapping,
    location.pathname,
    navigate,
    persistPartialState,
    setupSettings.setupCurrentStep,
  ]);

  const value = React.useMemo<SetupFlowContextValue>(() => ({
    completeSetup,
    currentStep,
    environmentCheck,
    errorMessage,
    goBackStep,
    hasCompletedSetup,
    isBootstrapping,
    isBusy,
    localCheckResult,
    mode,
    persistPartialState,
    refreshEnvironmentCheck,
    refreshLocalCheck,
    remoteDraft,
    remoteVerification,
    saveLocalConfiguration,
    saveRemoteDraft,
    selectMode,
    setErrorMessage,
    setupInstallResult,
    setupSettings,
    installOpenClawForSetup,
    verifyLocalSetup,
    verifyRemoteSetup,
  }), [
    completeSetup,
    currentStep,
    environmentCheck,
    errorMessage,
    goBackStep,
    hasCompletedSetup,
    isBootstrapping,
    isBusy,
    localCheckResult,
    mode,
    persistPartialState,
    refreshEnvironmentCheck,
    refreshLocalCheck,
    remoteDraft,
    remoteVerification,
    saveLocalConfiguration,
    saveRemoteDraft,
    selectMode,
    setupInstallResult,
    setupSettings,
    installOpenClawForSetup,
    verifyLocalSetup,
    verifyRemoteSetup,
  ]);

  return (
    <SetupFlowContext.Provider value={value}>
      {children}
    </SetupFlowContext.Provider>
  );
};

export const useSetupFlow = () => {
  const context = React.useContext(SetupFlowContext);

  if (!context) {
    throw new Error('useSetupFlow must be used within SetupFlowProvider');
  }

  return context;
};
