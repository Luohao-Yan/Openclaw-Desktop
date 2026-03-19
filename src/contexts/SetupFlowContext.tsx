// ============================================================================
// Setup Flow Context — 重构版
// 使用 useReducer 替代 15+ 个 useState，通过 dispatch(action) 驱动状态变更
// 保持向后兼容：现有消费者无需修改
// ============================================================================

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
  ChannelAddResult,
  ChannelConfig,
  EnvironmentCheckResult,
  FixResult,
  LegacyRuntimeResolution,
  SetupEnvironmentCheck,
  SetupEnvironmentCheckData,
  SetupError,
  SetupInstallResult as SetupInstallFlowResult,
  SetupLocalCheckResult,
  SetupMode,
  SetupRemoteDraft,
  SetupRemoteVerificationResult,
  SetupSettings,
} from '../types/setup';
import type { SetupAction } from './setupActions';
import type { FixProgressState } from './setupActions';
import {
  setupReducer,
  initialSetupState,
  createSetupError,
} from './setupReducer';
import {
  selectIsBusy,
  selectError,
  selectEnvironmentCheck,
  selectChannelConfigs,
  selectHasCompletedSetup,
} from './setupSelectors';
import { getPreviousStep } from './setupNavigationGraph';
import { createFallbackEnvironmentCheck } from './setupFallback';
import { createLazyChannelConfigs } from '../config/channelFieldDefinitions';
import { classifyVerifyError } from '../../electron/ipc/verifyLogic';
import { parseDoctorOutput, shouldEscalateToRepair } from '../../electron/ipc/doctorLogic';

// ============================================================================
// Context Value 接口定义
// ============================================================================

/**
 * SetupFlowContext 暴露给消费者的值接口
 *
 * 重构要点：
 * - 新增 error: SetupError | null（结构化错误对象）
 * - 新增 dispatch: React.Dispatch<SetupAction>（直接 dispatch 场景）
 * - 保留 errorMessage: string（向后兼容，从 error?.message 派生）
 * - 保留 environmentCheck: SetupEnvironmentCheck（向后兼容，从新类型映射回旧类型）
 * - 新增 environmentCheckResult: EnvironmentCheckResult（新判别联合类型）
 *
 * @see 需求 1.1 — useReducer 模式
 * @see 需求 2.4 — 结构化错误对象
 */
interface SetupFlowContextValue {
  completeSetup: () => Promise<void>;
  currentStep: string;
  /** 旧版环境检测接口（向后兼容） */
  environmentCheck: SetupEnvironmentCheck;
  /** 新版环境检测结果（判别联合） */
  environmentCheckResult: EnvironmentCheckResult;
  /** 结构化错误对象 */
  error: SetupError | null;
  /** 向后兼容：从 error?.message 派生的错误消息字符串 */
  errorMessage: string;
  /** dispatch 函数，供需要直接 dispatch 的场景使用 */
  dispatch: React.Dispatch<SetupAction>;
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

  // 运行时解析
  runtimeResolution: LegacyRuntimeResolution | null;

  // 环境修复
  fixEnvironment: (action: 'install' | 'upgrade' | 'fixPath') => Promise<FixResult>;
  fixProgress: FixProgressState;

  // 渠道绑定
  channelConfigs: ChannelConfig[];
  updateChannelConfig: (key: string, updates: Partial<ChannelConfig>) => void;
  testChannelConnection: (key: string) => Promise<boolean>;
  saveChannelConfigs: () => Promise<void>;

  /** 批量添加已启用渠道到 OpenClaw 系统 */
  addEnabledChannels: () => Promise<ChannelAddResult[]>;
  /** 渠道添加结果列表 */
  channelAddResults: ChannelAddResult[];
  /** 引导流程中创建的 Agent 信息 */
  createdAgent: { id: string; name: string } | null;
  /** 设置已创建的 Agent */
  setCreatedAgent: (agent: { id: string; name: string } | null) => void;
  /** 渠道账户实例映射：provider → ChannelAccountInstance[]，供页面组件使用 */
  channelAccounts: Record<string, import('./setupActions').ChannelAccountInstance[]>;
}

const SetupFlowContext = React.createContext<SetupFlowContextValue | undefined>(undefined);

// ============================================================================
// 默认值常量
// ============================================================================

/** 默认本地检测结果 */
const defaultLocalCheckResult: SetupLocalCheckResult = {
  commandDetected: false,
  commandPath: '',
  rootDirDetected: false,
  rootDir: '',
  versionSuccess: false,
  versionOutput: '',
  error: '',
};

// ============================================================================
// 路由匹配辅助
// ============================================================================

/** 引导流程所有路由模式 */
const setupRoutePatterns = [
  '/setup/welcome',
  '/setup/local/intro',
  '/setup/local/environment',
  '/setup/local/check',
  '/setup/local/confirm-existing',
  '/setup/local/install-guide',
  '/setup/local/configure',
  '/setup/local/channels',
  '/setup/local/create-agent',
  '/setup/local/bind-channels',
  '/setup/local/verify',
  '/setup/remote/intro',
  '/setup/remote/config',
  '/setup/remote/verify',
  '/setup/complete',
] as const;

/** 根据当前路径匹配引导步骤 */
const getCurrentStepFromPath = (pathname: string) => {
  const matchedPattern = setupRoutePatterns.find((pattern) => matchPath(pattern, pathname));
  return matchedPattern || '/setup/welcome';
};

// ============================================================================
// 类型映射辅助函数
// ============================================================================

/**
 * 将新版 EnvironmentCheckResult 映射为旧版 SetupEnvironmentCheck
 * 确保现有消费者页面无需修改即可继续使用旧接口
 */
const mapToLegacyEnvironmentCheck = (
  result: EnvironmentCheckResult,
  setupSettings: SetupSettings,
): SetupEnvironmentCheck => {
  // 提取数据：成功和降级模式有 data，失败模式使用 partialData 或默认值
  let data: Partial<SetupEnvironmentCheckData>;
  let source: 'ipc' | 'fallback';
  let diagnosticError: string | undefined;

  switch (result.status) {
    case 'success':
      data = result.data;
      source = 'ipc';
      break;
    case 'fallback':
      data = result.data;
      source = 'fallback';
      break;
    case 'failed':
      data = result.partialData || {};
      source = 'fallback';
      diagnosticError = result.error.message;
      break;
  }

  // 确定 runtimeMode（旧版字段，从 runtimeTier 映射）
  const runtimeTier = data.runtimeTier || 'missing';
  let runtimeMode: 'bundled' | 'system' | 'missing' = 'missing';
  if (runtimeTier === 'bundled') runtimeMode = 'bundled';
  else if (runtimeTier === 'system') runtimeMode = 'system';

  return {
    source,
    platform: data.platform || 'unknown',
    platformLabel: data.platformLabel || '未知系统',
    runtimeMode,
    runtimeCommand: undefined,
    bundledRuntimeAvailable: data.bundledNodeAvailable && data.bundledOpenClawAvailable ? true : false,
    nodeInstalled: data.nodeInstalled ?? false,
    nodeVersion: data.nodeVersion,
    nodeVersionSatisfies: data.nodeVersionSatisfies ?? false,
    npmInstalled: data.npmInstalled ?? false,
    npmVersion: data.npmVersion,
    openclawInstalled: data.openclawInstalled ?? false,
    openclawVersion: data.openclawVersion,
    openclawConfigExists: data.openclawConfigExists ?? false,
    openclawRootDir: data.openclawRootDir || setupSettings.openclawRootDir || '',
    recommendedInstallCommand: data.recommendedInstallCommand || '',
    recommendedInstallLabel: data.recommendedInstallLabel || '',
    notes: data.notes || [],
    diagnosticError,
    bundledNodeAvailable: data.bundledNodeAvailable ?? false,
    bundledNodePath: data.bundledNodePath,
    bundledOpenClawAvailable: data.bundledOpenClawAvailable ?? false,
    bundledOpenClawPath: data.bundledOpenClawPath,
    runtimeTier,
    fixableIssues: data.fixableIssues || [],
  };
};

/**
 * 将 IPC 返回的环境检测原始结果转换为新版 EnvironmentCheckResult（success 状态）
 */
const mapIpcResultToEnvironmentCheckResult = (
  raw: any,
): EnvironmentCheckResult & { status: 'success' } => {
  return {
    status: 'success',
    data: {
      platform: raw.platform || 'unknown',
      platformLabel: raw.platformLabel || '未知系统',
      runtimeTier: raw.runtimeTier || 'missing',
      bundledNodeAvailable: raw.bundledNodeAvailable || false,
      bundledNodePath: raw.bundledNodePath,
      bundledOpenClawAvailable: raw.bundledOpenClawAvailable || false,
      bundledOpenClawPath: raw.bundledOpenClawPath,
      nodeInstalled: raw.nodeInstalled || false,
      nodeVersion: raw.nodeVersion,
      nodeVersionSatisfies: raw.nodeVersionSatisfies || false,
      npmInstalled: raw.npmInstalled || false,
      npmVersion: raw.npmVersion,
      openclawInstalled: raw.openclawInstalled || false,
      openclawVersion: raw.openclawVersion,
      openclawConfigExists: raw.openclawConfigExists || false,
      openclawRootDir: raw.openclawRootDir || '',
      recommendedInstallCommand: raw.recommendedInstallCommand || '',
      recommendedInstallLabel: raw.recommendedInstallLabel || '',
      notes: raw.notes || [],
      fixableIssues: raw.fixableIssues || [],
    },
  };
};

/**
 * 规范化从持久化存储读取的设置
 */
const normalizeSettings = (
  result: SettingsGetResult<SetupSettings> | null,
): SetupSettings => {
  if (!result?.success || !result.settings) {
    return {};
  }
  return result.settings;
};

// ============================================================================
// SetupFlowProvider — 使用 useReducer 的重构版
// ============================================================================

export const SetupFlowProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();

  // ========================================================================
  // 核心状态：单一 useReducer 替代 15+ 个 useState
  // @see 需求 1.1, 1.6
  // ========================================================================
  const [state, dispatch] = React.useReducer(setupReducer, {
    ...initialSetupState,
    channels: {
      ...initialSetupState.channels,
      configs: createLazyChannelConfigs(),
      accounts: {},
    },
  });

  // 最新设置引用（用于异步回调中获取最新值）
  const latestSettingsRef = React.useRef<SetupSettings>({});

  // ========================================================================
  // 从 reducer state 中通过 selectors 提取派生状态
  // @see 需求 1.4, 1.6
  // ========================================================================
  const isBusy = selectIsBusy(state);
  const error = selectError(state);
  const environmentCheckResult = selectEnvironmentCheck(state);
  const channelConfigs = selectChannelConfigs(state);
  const hasCompletedSetup = selectHasCompletedSetup(state);

  // 向后兼容：从结构化错误对象派生错误消息字符串
  const errorMessage = error?.message || '';

  // 向后兼容：将新版 EnvironmentCheckResult 映射为旧版 SetupEnvironmentCheck
  const environmentCheck = React.useMemo(
    () => mapToLegacyEnvironmentCheck(environmentCheckResult, state.settings),
    [environmentCheckResult, state.settings],
  );

  const currentStep = React.useMemo(
    () => getCurrentStepFromPath(location.pathname),
    [location.pathname],
  );

  // 同步最新设置到 ref
  React.useEffect(() => {
    latestSettingsRef.current = state.settings;
  }, [state.settings]);

  // ========================================================================
  // 向后兼容：setErrorMessage 适配器
  // 将旧版 setErrorMessage(string) 调用转换为 dispatch SET_ERROR
  // ========================================================================
  const setErrorMessage = React.useCallback<React.Dispatch<React.SetStateAction<string>>>((action) => {
    if (typeof action === 'function') {
      // 函数式更新：基于当前 errorMessage 计算新值
      const currentMsg = error?.message || '';
      const newMsg = action(currentMsg);
      if (newMsg) {
        dispatch({ type: 'SET_ERROR', payload: createSetupError('UNKNOWN', newMsg, '请重试') });
      } else {
        dispatch({ type: 'SET_ERROR', payload: null });
      }
    } else if (action) {
      dispatch({ type: 'SET_ERROR', payload: createSetupError('UNKNOWN', action, '请重试') });
    } else {
      dispatch({ type: 'SET_ERROR', payload: null });
    }
  }, [error]);

  // ========================================================================
  // 持久化设置到 Electron Store
  // ========================================================================
  const persistPartialState = React.useCallback(async (updates: Partial<SetupSettings>) => {
    const nextSettings = {
      ...latestSettingsRef.current,
      ...updates,
      setupLastVisitedAt: new Date().toISOString(),
    };

    latestSettingsRef.current = nextSettings;
    dispatch({ type: 'SET_SETTINGS', payload: nextSettings });

    if (typeof window.electronAPI?.settingsSet === 'function') {
      await window.electronAPI.settingsSet(nextSettings);
    }
  }, []);

  // ========================================================================
  // 环境检测刷新
  // @see 需求 2.1, 2.2
  // ========================================================================
  const refreshEnvironmentCheck = React.useCallback(async () => {
    dispatch({ type: 'SET_BUSY', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });

    try {
      if (typeof window.electronAPI?.setupEnvironmentCheck !== 'function') {
        // IPC 不可用 — 使用降级结果并显示明确提示
        // @see 需求 2.2
        const fallbackResult = createFallbackEnvironmentCheck(
          undefined,
          '当前桌面端未暴露 setupEnvironmentCheck IPC',
        );
        dispatch({ type: 'SET_ENVIRONMENT_CHECK', payload: fallbackResult });

        const legacyResult = mapToLegacyEnvironmentCheck(fallbackResult, latestSettingsRef.current);
        return legacyResult;
      }

      const raw = await window.electronAPI.setupEnvironmentCheck();
      const newResult = mapIpcResultToEnvironmentCheckResult(raw);
      dispatch({ type: 'SET_ENVIRONMENT_CHECK', payload: newResult });

      // newResult 是 success 状态，可以安全访问 data
      await persistPartialState({
        detectedPlatform: newResult.data.platform,
        detectedPlatformLabel: newResult.data.platformLabel,
        openclawRootDir: newResult.data.openclawRootDir || latestSettingsRef.current.openclawRootDir,
        setupCurrentStep: '/setup/local/environment',
      });

      return mapToLegacyEnvironmentCheck(newResult, latestSettingsRef.current);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // 使用降级工厂函数保留部分结果
      const fallbackResult = createFallbackEnvironmentCheck(undefined, message);
      dispatch({ type: 'SET_ENVIRONMENT_CHECK', payload: fallbackResult });
      dispatch({
        type: 'SET_ERROR',
        payload: createSetupError(
          'ENVIRONMENT_CHECK_FAILED',
          '环境检测未能完成，请重试。',
          '请检查桌面端是否为最新版本',
          message,
        ),
      });

      // fallbackResult 始终是 fallback 状态，提取 data 用于持久化
      const fallbackData = fallbackResult.status !== 'failed' ? fallbackResult.data : undefined;
      await persistPartialState({
        detectedPlatform: fallbackData?.platform,
        detectedPlatformLabel: fallbackData?.platformLabel,
        openclawRootDir: fallbackData?.openclawRootDir || latestSettingsRef.current.openclawRootDir,
        setupCurrentStep: '/setup/local/environment',
      });

      return mapToLegacyEnvironmentCheck(fallbackResult, latestSettingsRef.current);
    } finally {
      dispatch({ type: 'SET_BUSY', payload: false });
    }
  }, [persistPartialState]);

  // ========================================================================
  // 本地安装检测刷新
  // ========================================================================
  const refreshLocalCheck = React.useCallback(async () => {
    dispatch({ type: 'SET_BUSY', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });

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

      dispatch({ type: 'SET_LOCAL_CHECK', payload: nextResult });
      await persistPartialState({
        localInstallValidated: nextResult.commandDetected && nextResult.rootDirDetected,
        openclawPath: nextResult.commandPath || latestSettingsRef.current.openclawPath,
        openclawRootDir: nextResult.rootDir || latestSettingsRef.current.openclawRootDir,
        setupCurrentStep: '/setup/local/check',
      });

      return nextResult;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      dispatch({
        type: 'SET_ERROR',
        payload: createSetupError(
          'IPC_CALL_FAILED',
          '检测过程中出现问题，请重试。',
          '请确认桌面端已正确安装',
          message,
        ),
      });
      const nextResult = {
        ...defaultLocalCheckResult,
        error: message,
      };
      dispatch({ type: 'SET_LOCAL_CHECK', payload: nextResult });
      return nextResult;
    } finally {
      dispatch({ type: 'SET_BUSY', payload: false });
    }
  }, [persistPartialState]);

  // ========================================================================
  // OpenClaw 自动安装
  // ========================================================================
  const installOpenClawForSetup = React.useCallback(async () => {
    dispatch({ type: 'SET_BUSY', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });

    const runningState: SetupInstallFlowResult = {
      success: false,
      message: '正在自动安装 OpenClaw，请稍候…',
      command: environmentCheck.recommendedInstallCommand,
    };

    dispatch({ type: 'SET_INSTALL_RESULT', payload: runningState });
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

      dispatch({ type: 'SET_INSTALL_RESULT', payload: result });

      await persistPartialState({
        setupInstallStatus: result.success ? 'succeeded' : 'failed',
        setupInstallMessage: result.message,
        setupCurrentStep: '/setup/local/install-guide',
      });

      if (!result.success) {
        dispatch({
          type: 'SET_ERROR',
          payload: createSetupError(
            'INSTALL_FAILED',
            '安装未能完成，请检查网络连接后重试。',
            '请确认网络连接正常',
            result.error,
          ),
        });
        return result;
      }

      await refreshEnvironmentCheck();
      await refreshLocalCheck();

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const failedResult: SetupInstallFlowResult = {
        success: false,
        message: 'OpenClaw 自动安装失败。',
        command: environmentCheck.recommendedInstallCommand,
        error: message,
      };
      dispatch({ type: 'SET_INSTALL_RESULT', payload: failedResult });
      dispatch({
        type: 'SET_ERROR',
        payload: createSetupError(
          'INSTALL_FAILED',
          '安装未能完成，请检查网络连接后重试。',
          '请确认网络连接正常',
          message,
        ),
      });
      await persistPartialState({
        setupInstallStatus: 'failed',
        setupInstallMessage: failedResult.message,
        setupCurrentStep: '/setup/local/install-guide',
      });
      return failedResult;
    } finally {
      dispatch({ type: 'SET_BUSY', payload: false });
    }
  }, [environmentCheck.recommendedInstallCommand, persistPartialState, refreshEnvironmentCheck, refreshLocalCheck]);

  // ========================================================================
  // 保存本地配置
  // ========================================================================
  const saveLocalConfiguration = React.useCallback(async (payload: {
    openclawPath: string;
    openclawRootDir: string;
  }) => {
    dispatch({ type: 'SET_BUSY', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });

    try {
      await persistPartialState({
        localInstallValidated: false,
        openclawPath: payload.openclawPath.trim(),
        openclawRootDir: payload.openclawRootDir.trim(),
        setupCurrentStep: '/setup/local/configure',
        setupMode: 'local',
      });
    } finally {
      dispatch({ type: 'SET_BUSY', payload: false });
    }
  }, [persistPartialState]);

  // ========================================================================
  // 验证本地安装
  // ========================================================================
  const verifyLocalSetup = React.useCallback(async () => {
    dispatch({ type: 'SET_BUSY', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });

    try {
      // 前置 doctor --fix：尝试自动修复配置文件中的 schema 不兼容问题
      // 使用 parseDoctorOutput 解析修复结果，shouldEscalateToRepair 决定是否升级
      if (typeof window.electronAPI?.doctorFix === 'function') {
        try {
          const doctorFixResult = await window.electronAPI.doctorFix();
          // 解析 doctor --fix 输出，提取修复详情
          const parsed = parseDoctorOutput(doctorFixResult.output || '');

          // 如果仍有残留问题，使用 shouldEscalateToRepair 判断是否升级到 --repair
          if (shouldEscalateToRepair(parsed, 0)) {
            // 升级到 --repair（通过 repairCompatibility IPC 执行深度修复）
            if (typeof window.electronAPI?.gatewayRepairCompatibility === 'function') {
              try {
                await window.electronAPI.gatewayRepairCompatibility();
              } catch {
                // --repair 失败不阻塞验证流程
              }
            }
          }
        } catch {
          // doctor --fix 失败不阻塞验证流程
        }
      }

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
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const errorInfo = classifyVerifyError(errorMsg);
      dispatch({
        type: 'SET_ERROR',
        payload: createSetupError(
          'VERIFY_FAILED',
          errorInfo.message,
          errorInfo.suggestion,
          errorMsg,
        ),
      });
      return false;
    } finally {
      dispatch({ type: 'SET_BUSY', payload: false });
    }
  }, [persistPartialState]);

  // ========================================================================
  // 保存远程连接草稿
  // ========================================================================
  const saveRemoteDraft = React.useCallback(async (payload: SetupRemoteDraft) => {
    dispatch({ type: 'SET_REMOTE_DRAFT', payload });
    dispatch({ type: 'SET_REMOTE_VERIFICATION', payload: null });
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

  // ========================================================================
  // 验证远程连接
  // @see 需求 2.3
  // ========================================================================
  const verifyRemoteSetup = React.useCallback(async () => {
    dispatch({ type: 'SET_BUSY', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });

    try {
      if (typeof window.electronAPI?.remoteOpenClawTestConnection !== 'function') {
        const unavailableResult: SetupRemoteVerificationResult = {
          success: false,
          error: '当前桌面端还未提供远程 OpenClaw 连接测试能力，请先完成 IPC 实现。',
        };
        dispatch({ type: 'SET_REMOTE_VERIFICATION', payload: unavailableResult });
        return unavailableResult;
      }

      const result = await window.electronAPI.remoteOpenClawTestConnection({
        host: state.remote.draft.host.trim(),
        port: Number(state.remote.draft.port) || undefined,
        protocol: state.remote.draft.protocol,
        token: state.remote.draft.token,
      });

      dispatch({ type: 'SET_REMOTE_VERIFICATION', payload: result });

      if (!result.success) {
        throw new Error(result.error || '远程 OpenClaw 连接验证失败');
      }

      if (typeof window.electronAPI?.remoteOpenClawSaveConnection === 'function') {
        await window.electronAPI.remoteOpenClawSaveConnection({
          host: state.remote.draft.host.trim(),
          port: Number(state.remote.draft.port) || undefined,
          protocol: state.remote.draft.protocol,
          token: state.remote.draft.token,
        });
      }

      await persistPartialState({
        remoteConnectionValidated: true,
        setupCurrentStep: '/setup/remote/verify',
      });

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const failedResult: SetupRemoteVerificationResult = {
        success: false,
        error: message,
      };
      dispatch({
        type: 'SET_ERROR',
        payload: createSetupError(
          'REMOTE_CONNECTION_FAILED',
          message,
          '请确认远程地址和端口正确',
          message,
        ),
      });
      dispatch({ type: 'SET_REMOTE_VERIFICATION', payload: failedResult });
      return failedResult;
    } finally {
      dispatch({ type: 'SET_BUSY', payload: false });
    }
  }, [persistPartialState, state.remote.draft]);

  // ========================================================================
  // 选择安装模式
  // ========================================================================
  const selectMode = React.useCallback(async (nextMode: SetupMode) => {
    dispatch({ type: 'SET_MODE', payload: nextMode });
    await persistPartialState({
      setupCurrentStep: nextMode === 'local' ? '/setup/local/intro' : '/setup/remote/intro',
      setupMode: nextMode,
    });
  }, [persistPartialState]);

  // ========================================================================
  // 完成引导流程
  // ========================================================================
  const completeSetup = React.useCallback(async () => {
    dispatch({ type: 'SET_BUSY', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });

    try {
      await persistPartialState({
        runMode: state.mode || 'local',
        setupCompleted: true,
        setupCurrentStep: '/setup/complete',
      });
      navigate('/');
    } finally {
      dispatch({ type: 'SET_BUSY', payload: false });
    }
  }, [navigate, persistPartialState, state.mode]);

  // ========================================================================
  // 返回上一步 — 使用导航图的 getPreviousStep
  // @see 需求 4.4
  // ========================================================================
  const goBackStep = React.useCallback(() => {
    const previousStep = getPreviousStep(location.pathname, state);
    if (previousStep) {
      navigate(previousStep);
    }
  }, [location.pathname, state, navigate]);

  // ========================================================================
  // 环境修复
  // ========================================================================
  const fixEnvironment = React.useCallback(async (action: 'install' | 'upgrade' | 'fixPath'): Promise<FixResult> => {
    // 重置进度状态为运行中
    dispatch({
      type: 'SET_FIX_PROGRESS',
      payload: { action, status: 'running', message: '正在执行修复…' },
    });

    // 订阅修复进度事件
    let unsubscribe: (() => void) | undefined;
    if (typeof window.electronAPI?.onFixProgress === 'function') {
      unsubscribe = window.electronAPI.onFixProgress((data) => {
        dispatch({
          type: 'SET_FIX_PROGRESS',
          payload: {
            action: data.action || action,
            status: data.status as FixProgressState['status'],
            message: data.message || '',
          },
        });
      });
    }

    try {
      if (typeof window.electronAPI?.fixEnvironment !== 'function') {
        const unavailable: FixResult = {
          success: false,
          message: '当前桌面端未提供环境修复能力。',
          action,
          error: 'fixEnvironment IPC 不可用',
        };
        dispatch({
          type: 'SET_FIX_PROGRESS',
          payload: { action, status: 'error', message: unavailable.message },
        });
        return unavailable;
      }

      const result = await window.electronAPI.fixEnvironment(action);

      // 更新最终进度状态
      dispatch({
        type: 'SET_FIX_PROGRESS',
        payload: {
          action,
          status: result.success ? 'done' : 'error',
          message: result.message,
        },
      });

      // 修复完成后自动刷新环境检测
      if (result.success) {
        await refreshEnvironmentCheck();
      }

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const failedResult: FixResult = {
        success: false,
        message: '环境修复失败。',
        action,
        error: message,
      };
      dispatch({
        type: 'SET_FIX_PROGRESS',
        payload: { action, status: 'error', message: failedResult.message },
      });
      return failedResult;
    } finally {
      // 清理进度事件订阅
      unsubscribe?.();
    }
  }, [refreshEnvironmentCheck]);

  // ========================================================================
  // 渠道配置更新（支持字段懒加载）
  // 当用户启用渠道且 fields 为空时，自动加载完整字段定义
  // @see 需求 3.6
  // ========================================================================
  const updateChannelConfig = React.useCallback((key: string, updates: Partial<ChannelConfig>) => {
    // 懒加载：启用渠道时加载字段定义
    if (updates.enabled === true) {
      const current = state.channels.configs.find((c) => c.key === key);
      if (current && current.fields.length === 0) {
        import('../config/channelFieldDefinitions').then(({ getChannelFields }) => {
          const fields = getChannelFields(key);
          dispatch({ type: 'UPDATE_CHANNEL', payload: { key, updates: { ...updates, fields } } });
        }).catch(() => {
          // 加载失败时仍然启用渠道，只是没有字段定义
          dispatch({ type: 'UPDATE_CHANNEL', payload: { key, updates } });
        });
        return;
      }
    }
    dispatch({ type: 'UPDATE_CHANNEL', payload: { key, updates } });
  }, [state.channels.configs]);

  // ========================================================================
  // 渠道连接测试
  // @see 需求 2.6
  // ========================================================================
  const testChannelConnection = React.useCallback(async (key: string): Promise<boolean> => {
    // 标记为测试中
    dispatch({ type: 'UPDATE_CHANNEL', payload: { key, updates: { testStatus: 'testing', testError: undefined } } });

    try {
      if (typeof window.electronAPI?.channelsDiagnose !== 'function') {
        dispatch({
          type: 'UPDATE_CHANNEL',
          payload: { key, updates: { testStatus: 'error', testError: '当前桌面端未提供渠道诊断能力，请升级到最新版本。' } },
        });
        return false;
      }

      const result = await window.electronAPI.channelsDiagnose(key);

      if (result.success) {
        dispatch({ type: 'UPDATE_CHANNEL', payload: { key, updates: { testStatus: 'ok', testError: undefined } } });
        return true;
      }

      // 区分具体失败原因
      // @see 需求 2.6
      const errorMsg = result.error || '';
      let userFriendlyError = '连接测试失败';

      // 解析错误类型，提供更友好的提示
      if (errorMsg.includes('ENOTFOUND') || errorMsg.includes('getaddrinfo')) {
        userFriendlyError = '无法解析服务器地址，请检查网络连接或服务器地址是否正确。';
      } else if (errorMsg.includes('ECONNREFUSED')) {
        userFriendlyError = '连接被拒绝，请确认服务器正在运行且端口正确。';
      } else if (errorMsg.includes('ETIMEDOUT') || errorMsg.includes('timeout')) {
        userFriendlyError = '连接超时，请检查网络状况或服务器响应。';
      } else if (errorMsg.includes('401') || errorMsg.includes('Unauthorized') || errorMsg.includes('invalid token')) {
        userFriendlyError = '凭证无效，请检查 Token 或密钥是否正确。';
      } else if (errorMsg.includes('403') || errorMsg.includes('Forbidden')) {
        userFriendlyError = '访问被禁止，请检查账号权限设置。';
      } else if (errorMsg.includes('404') || errorMsg.includes('Not Found')) {
        userFriendlyError = '资源不存在，请检查配置的 URL 或路径是否正确。';
      } else if (errorMsg.includes('500') || errorMsg.includes('Internal Server Error')) {
        userFriendlyError = '服务端错误，请稍后重试或联系服务提供商。';
      } else if (errorMsg.includes('CERT') || errorMsg.includes('certificate')) {
        userFriendlyError = 'SSL 证书验证失败，请检查服务器证书配置。';
      } else if (errorMsg) {
        userFriendlyError = errorMsg;
      }

      dispatch({
        type: 'UPDATE_CHANNEL',
        payload: { key, updates: { testStatus: 'error', testError: userFriendlyError } },
      });
      return false;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // 解析异常类型
      let userFriendlyError = message;
      if (message.includes('network') || message.includes('Network')) {
        userFriendlyError = '网络错误，请检查网络连接后重试。';
      }
      dispatch({
        type: 'UPDATE_CHANNEL',
        payload: { key, updates: { testStatus: 'error', testError: userFriendlyError } },
      });
      return false;
    }
  }, []);

  // ========================================================================
  // 保存渠道配置
  // ========================================================================
  const saveChannelConfigs = React.useCallback(async () => {
    // 构建渠道绑定映射：仅保存已启用的渠道及其字段值
    const channelBindings: Record<string, { enabled: boolean; token?: string; fieldValues?: Record<string, string> }> = {};
    for (const ch of channelConfigs) {
      if (ch.enabled) {
        channelBindings[ch.key] = {
          enabled: true,
          token: ch.token || undefined,
          fieldValues: Object.keys(ch.fieldValues).length > 0 ? ch.fieldValues : undefined,
        };
      }
    }

    await persistPartialState({ channelBindings });
  }, [channelConfigs, persistPartialState]);

  // ========================================================================
  // 批量添加已启用渠道
  // ========================================================================
  const addEnabledChannels = React.useCallback(async (): Promise<ChannelAddResult[]> => {
    /**
     * 过滤 CLI 输出中的 config warning 噪音
     */
    const filterConfigWarnings = (text: string | undefined): string | undefined => {
      if (!text) return text;
      const lines = text.split('\n').filter((line) => {
        const trimmed = line.trim().toLowerCase();
        if (trimmed.startsWith('config warning')) return false;
        if (trimmed.startsWith('- plugins.entries')) return false;
        if (trimmed.includes('stale config entry ignored')) return false;
        if (trimmed.includes('plugin not found')) return false;
        return true;
      });
      const filtered = lines.join('\n').trim();
      return filtered || undefined;
    };

    const results: ChannelAddResult[] = [];
    const accounts = state.channels.accounts;

    // 如果有按账户维度的配置，按 account 维度逐个调用 CLI
    const hasAccountConfigs = Object.keys(accounts).length > 0 &&
      Object.values(accounts).some((list) => list.length > 0);

    if (hasAccountConfigs) {
      // 按账户维度添加：仅遍历已启用 provider 的 account
      // 构建已启用 provider 的集合，过滤掉用户已禁用的渠道
      const enabledProviders = new Set(channelConfigs.filter((c) => c.enabled).map((c) => c.key));
      for (const [provider, accountList] of Object.entries(accounts)) {
        // 跳过未启用的 provider，避免对已禁用渠道发起无效 CLI 调用
        if (!enabledProviders.has(provider)) continue;
        for (const account of accountList) {
          try {
            if (typeof window.electronAPI?.channelsAdd !== 'function') {
              results.push({
                channelKey: provider,
                channelLabel: provider,
                success: false,
                error: 'channelsAdd IPC 不可用',
                accountId: account.accountId,
              });
              continue;
            }

            // CLI channels add 不传 --account，让 CLI 使用默认的 default account
            // 用户自定义的 accountId 通过 coreConfigWriteChannel 写入 openclaw.json
            const cliFieldValues: Record<string, string> = {};

            // 查找对应的渠道配置以获取 label
            const channelConfig = channelConfigs.find((c) => c.key === provider);
            const channelLabel = channelConfig?.label || provider;

            const result = await window.electronAPI.channelsAdd(provider, cliFieldValues);

            if (!result.success) {
              results.push({
                channelKey: provider,
                channelLabel,
                success: false,
                output: result.output,
                error: filterConfigWarnings(result.error) || result.error,
                accountId: account.accountId,
              });
              continue;
            }

            // CLI 添加成功后，将账户专有字段写入 openclaw.json
            // CLI 默认创建 default account，这里用用户自定义的 accountId 覆盖
            if (typeof window.electronAPI?.coreConfigWriteChannel === 'function') {
              const { buildFeishuAccountConfig, buildDefaultAccountConfig, normalizeChannelKey } = await import('../config/channelAccountFields');
              const normalizedKey = normalizeChannelKey(provider);
              const accountConfig = normalizedKey === 'feishu'
                ? buildFeishuAccountConfig(account.fieldValues)
                : buildDefaultAccountConfig(normalizedKey, account.fieldValues);

              // 构建 accounts 对象：写入用户自定义的 accountId
              const accountsPayload: Record<string, unknown> = {
                [account.accountId]: accountConfig,
              };

              // 如果用户的 accountId 不是 default，删除 CLI 创建的 default account
              // writeChannelToConfig 支持 null 值删除
              if (account.accountId !== 'default') {
                accountsPayload['default'] = null;
              }

              await window.electronAPI.coreConfigWriteChannel(provider, {
                accounts: accountsPayload,
              });
            }

            results.push({
              channelKey: provider,
              channelLabel,
              success: true,
              output: result.output,
              error: filterConfigWarnings(result.error),
              accountId: account.accountId,
            });
          } catch (err: any) {
            results.push({
              channelKey: provider,
              channelLabel: provider,
              success: false,
              error: err.message || '未知错误',
              accountId: account.accountId,
            });
          }
        }
      }
    } else {
      // 向后兼容：无账户配置时按旧逻辑（provider 维度）添加
      const eligibleChannels = channelConfigs.filter((ch) => {
        if (!ch.enabled) return false;
        const requiredFields = ch.fields.filter((f) => f.required);
        return requiredFields.every((f) => (ch.fieldValues[f.id] || '').trim() !== '');
      });

      for (const ch of eligibleChannels) {
        try {
          if (typeof window.electronAPI?.channelsAdd !== 'function') {
            results.push({
              channelKey: ch.key,
              channelLabel: ch.label,
              success: false,
              error: 'channelsAdd IPC 不可用',
            });
            continue;
          }

          const result = await window.electronAPI.channelsAdd(ch.key, ch.fieldValues);

          if (!result.success) {
            results.push({
              channelKey: ch.key,
              channelLabel: ch.label,
              success: false,
              output: result.output,
              error: filterConfigWarnings(result.error) || result.error,
            });
            continue;
          }

          results.push({
            channelKey: ch.key,
            channelLabel: ch.label,
            success: true,
            output: result.output,
            error: filterConfigWarnings(result.error),
          });
        } catch (err: any) {
          results.push({
            channelKey: ch.key,
            channelLabel: ch.label,
            success: false,
            error: err.message || '未知错误',
          });
        }
      }
    }

    dispatch({ type: 'SET_CHANNEL_ADD_RESULTS', payload: results });

    // 将成功添加的渠道保存到 setupSettings
    const addedChannels = results
      .filter((r) => r.success)
      .map((r) => ({ key: r.channelKey, label: r.channelLabel }));
    if (addedChannels.length > 0) {
      await persistPartialState({ addedChannels });
    }

    return results;
  }, [channelConfigs, state.channels.accounts, persistPartialState]);

  // ========================================================================
  // 设置已创建的 Agent
  // ========================================================================
  const setCreatedAgent = React.useCallback((agent: { id: string; name: string } | null) => {
    dispatch({ type: 'SET_CREATED_AGENT', payload: agent });
  }, []);

  // ========================================================================
  // 渠道账户配置
  // ========================================================================

  // ========================================================================
  // 引导初始化 Effect
  // ========================================================================
  React.useEffect(() => {
    const bootstrap = async () => {
      dispatch({ type: 'SET_BOOTSTRAPPING', payload: true });

      try {
        // 从持久化存储读取设置
        const result = typeof window.electronAPI?.settingsGet === 'function'
          ? await window.electronAPI.settingsGet<SetupSettings>()
          : null;
        const normalizedSettings = normalizeSettings(result);
        dispatch({ type: 'SET_SETTINGS', payload: normalizedSettings });
        latestSettingsRef.current = normalizedSettings;

        // 恢复安装模式
        if (normalizedSettings.setupMode) {
          dispatch({ type: 'SET_MODE', payload: normalizedSettings.setupMode });
        }

        // 用已持久化的平台信息更新环境检测状态
        if (normalizedSettings.detectedPlatform || normalizedSettings.detectedPlatformLabel) {
          const currentCheck = selectEnvironmentCheck(state);
          if (currentCheck.status === 'fallback' || currentCheck.status === 'success') {
            const updatedData = {
              ...currentCheck.data,
              platform: normalizedSettings.detectedPlatform || currentCheck.data.platform,
              platformLabel: normalizedSettings.detectedPlatformLabel || currentCheck.data.platformLabel,
              openclawRootDir: normalizedSettings.openclawRootDir || currentCheck.data.openclawRootDir,
            };
            dispatch({
              type: 'SET_ENVIRONMENT_CHECK',
              payload: { ...currentCheck, data: updatedData } as EnvironmentCheckResult,
            });
          }
        }

        // 从 electron-store 恢复 channelAddResults，确保跨页面导航后数据不丢失
        // addedChannels 仅包含成功添加的渠道（{ key, label }），需转换为 ChannelAddResult[] 格式
        if (normalizedSettings.addedChannels && normalizedSettings.addedChannels.length > 0) {
          const restoredResults: ChannelAddResult[] = normalizedSettings.addedChannels.map((ch) => ({
            channelKey: ch.key,
            channelLabel: ch.label,
            success: true,
          }));
          dispatch({ type: 'SET_CHANNEL_ADD_RESULTS', payload: restoredResults });
        }

        // 从 electron-store 恢复已创建的 Agent 信息
        // 确保页面刷新后 bind-channels 页面能正确识别已创建的 agent
        if (normalizedSettings.createdAgentId && normalizedSettings.createdAgentName) {
          dispatch({
            type: 'SET_CREATED_AGENT',
            payload: {
              id: normalizedSettings.createdAgentId,
              name: normalizedSettings.createdAgentName,
            },
          });
        }

        // 恢复远程连接草稿
        dispatch({
          type: 'SET_REMOTE_DRAFT',
          payload: {
            host: normalizedSettings.remoteHost || '',
            port: normalizedSettings.remotePort ? String(normalizedSettings.remotePort) : '3000',
            protocol: normalizedSettings.remoteProtocol || 'http',
            token: normalizedSettings.remoteToken || '',
          },
        });

        // 恢复本地检测结果
        if (normalizedSettings.openclawPath || normalizedSettings.openclawRootDir) {
          dispatch({
            type: 'SET_LOCAL_CHECK',
            payload: {
              ...defaultLocalCheckResult,
              commandDetected: Boolean(normalizedSettings.openclawPath),
              commandPath: normalizedSettings.openclawPath || '',
              rootDirDetected: Boolean(normalizedSettings.openclawRootDir),
              rootDir: normalizedSettings.openclawRootDir || '',
            },
          });
        }

        // 执行环境检测
        if (typeof window.electronAPI?.setupEnvironmentCheck === 'function') {
          const raw = await window.electronAPI.setupEnvironmentCheck();
          const newResult = mapIpcResultToEnvironmentCheckResult(raw);
          dispatch({ type: 'SET_ENVIRONMENT_CHECK', payload: newResult });
        }

        // 调用 resolveRuntime 获取运行时解析结果
        if (typeof window.electronAPI?.resolveRuntime === 'function') {
          try {
            const resolution = await window.electronAPI.resolveRuntime();
            // resolveRuntime 返回 LegacyRuntimeResolution，直接存储到 state
            // 通过 context value 映射时会转为 LegacyRuntimeResolution 类型
            dispatch({ type: 'SET_RUNTIME_RESOLUTION', payload: resolution as any });
          } catch {
            // 运行时解析失败不阻断引导流程，保持 null 状态
          }
        }
      } catch (err) {
        dispatch({
          type: 'SET_ERROR',
          payload: createSetupError(
            'UNKNOWN',
            err instanceof Error ? err.message : String(err),
            '请重试或重启应用',
          ),
        });
      } finally {
        dispatch({ type: 'SET_BOOTSTRAPPING', payload: false });
      }
    };

    void bootstrap();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ========================================================================
  // 路由同步 Effect
  // ========================================================================
  React.useEffect(() => {
    if (state.ui.isBootstrapping) {
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
      if (state.settings.setupCurrentStep === currentStep) {
        return;
      }

      void persistPartialState({
        setupCurrentStep: currentStep,
      });
    }
  }, [
    currentStep,
    hasCompletedSetup,
    state.ui.isBootstrapping,
    location.pathname,
    navigate,
    persistPartialState,
    state.settings.setupCurrentStep,
  ]);

  // ========================================================================
  // Context Value 组装
  // ========================================================================
  const value = React.useMemo<SetupFlowContextValue>(() => ({
    completeSetup,
    currentStep,
    environmentCheck,
    environmentCheckResult,
    error,
    errorMessage,
    dispatch,
    goBackStep,
    hasCompletedSetup,
    isBootstrapping: state.ui.isBootstrapping,
    isBusy,
    localCheckResult: state.local.checkResult,
    mode: state.mode,
    persistPartialState,
    refreshEnvironmentCheck,
    refreshLocalCheck,
    remoteDraft: state.remote.draft,
    remoteVerification: state.remote.verification,
    saveLocalConfiguration,
    saveRemoteDraft,
    selectMode,
    setErrorMessage,
    setupInstallResult: state.local.installResult,
    setupSettings: state.settings,
    installOpenClawForSetup,
    verifyLocalSetup,
    verifyRemoteSetup,
    // 运行时解析（向后兼容：映射为 LegacyRuntimeResolution）
    runtimeResolution: state.environment.runtimeResolution as LegacyRuntimeResolution | null,
    // 环境修复
    fixEnvironment,
    fixProgress: state.environment.fixProgress,
    // 渠道绑定
    channelConfigs,
    updateChannelConfig,
    testChannelConnection,
    saveChannelConfigs,
    // 渠道 CLI 添加
    addEnabledChannels,
    channelAddResults: state.channels.addResults,
    // 创建的 Agent
    createdAgent: state.agent.created,
    setCreatedAgent,
    // 渠道账户实例映射
    channelAccounts: state.channels.accounts,
  }), [
    completeSetup,
    currentStep,
    environmentCheck,
    environmentCheckResult,
    error,
    errorMessage,
    dispatch,
    goBackStep,
    hasCompletedSetup,
    state.ui.isBootstrapping,
    isBusy,
    state.local.checkResult,
    state.mode,
    persistPartialState,
    refreshEnvironmentCheck,
    refreshLocalCheck,
    state.remote.draft,
    state.remote.verification,
    saveLocalConfiguration,
    saveRemoteDraft,
    selectMode,
    setErrorMessage,
    state.local.installResult,
    state.settings,
    installOpenClawForSetup,
    verifyLocalSetup,
    verifyRemoteSetup,
    // 运行时解析
    state.environment.runtimeResolution,
    // 环境修复
    fixEnvironment,
    state.environment.fixProgress,
    // 渠道绑定
    channelConfigs,
    updateChannelConfig,
    testChannelConnection,
    saveChannelConfigs,
    // 渠道 CLI 添加
    addEnabledChannels,
    state.channels.addResults,
    // 创建的 Agent
    state.agent.created,
    setCreatedAgent,
    // 渠道账户实例映射
    state.channels.accounts,
  ]);

  return (
    <SetupFlowContext.Provider value={value}>
      {children}
    </SetupFlowContext.Provider>
  );
};

// ============================================================================
// Hook 导出
// ============================================================================

export const useSetupFlow = () => {
  const context = React.useContext(SetupFlowContext);

  if (!context) {
    throw new Error('useSetupFlow must be used within SetupFlowProvider');
  }

  return context;
};