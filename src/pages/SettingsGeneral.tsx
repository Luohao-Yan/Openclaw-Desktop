import React, { useEffect, useMemo, useState } from 'react';
import {
  RefreshCw,
} from 'lucide-react';
import AppButton from '../components/AppButton';
import RuntimeUpdateNotice from '../components/RuntimeUpdateNotice';
import { useDesktopRuntime } from '../contexts/DesktopRuntimeContext';
import GatewayHealthAlert from './settings/general/GatewayHealthAlert';
import GatewaySection from './settings/general/GatewaySection';
import GeneralOverviewCards from './settings/general/GeneralOverviewCards';
import IntegrationStatusCard from './settings/general/IntegrationStatusCard';
import PermissionsSection from './settings/general/PermissionsSection';
import PreferencesSection from './settings/general/PreferencesSection';
import { runGatewayRepair } from '../services/gatewayRepair';
import TailscaleSection from './settings/general/TailscaleSection';
import {
  defaultGatewayStatus,
  defaultSettings,
  defaultTailscaleStatus,
  exposureOptions,
} from './settings/general/constants';
import type { OpenClawCommandDiagnostic } from '../types/electron';
import type {
  ExposureMode,
  GeneralSettings,
  GatewayStatusModel,
  TailscaleStatusModel,
} from './settings/general/types';

const SettingsGeneral: React.FC = () => {
  const {
    repairCapabilityAvailable,
    runtimeInfo,
  } = useDesktopRuntime();
  const [settings, setSettings] = useState<GeneralSettings>(defaultSettings);
  const [gatewayStatus, setGatewayStatus] = useState<GatewayStatusModel>(defaultGatewayStatus);
  const [tailscaleStatus, setTailscaleStatus] = useState<TailscaleStatusModel>(defaultTailscaleStatus);
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isGatewayActionPending, setIsGatewayActionPending] = useState(false);
  const [isTailscaleActionPending, setIsTailscaleActionPending] = useState(false);
  const [message, setMessage] = useState('');
  const [gatewayRepairDetails, setGatewayRepairDetails] = useState<string[]>([]);
  const [commandDiagnostic, setCommandDiagnostic] = useState<OpenClawCommandDiagnostic | null>(null);
  const [pathDraft, setPathDraft] = useState({
    openclawPath: '',
    openclawRootDir: '',
  });

  const memoizedExposureOptions = useMemo(() => exposureOptions, []);

  useEffect(() => {
    void loadAll();
  }, []);

  const showMessage = (nextMessage: string) => {
    setMessage(nextMessage);
    window.setTimeout(() => {
      setMessage((currentMessage) => currentMessage === nextMessage ? '' : currentMessage);
    }, 4000);
  };

  const handleTestOpenClawCommand = async () => {
    try {
      setIsGatewayActionPending(true);
      const result = await window.electronAPI.testOpenClawCommand();
      if (result.diagnostic) {
        setCommandDiagnostic(result.diagnostic);
      }

      if (!result.success) {
        throw new Error(result.error || result.message || 'OpenClaw CLI 测试失败');
      }

      showMessage(result.message || 'OpenClaw CLI 可用。');
    } catch (error) {
      showMessage(`Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsGatewayActionPending(false);
    }
  };

  const handlePathDraftChange = (key: 'openclawPath' | 'openclawRootDir', value: string) => {
    setPathDraft((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleSavePathSettings = async () => {
    try {
      setIsGatewayActionPending(true);
      const updates: Partial<GeneralSettings> = {
        openclawPath: pathDraft.openclawPath.trim(),
        openclawRootDir: pathDraft.openclawRootDir.trim(),
      };
      const saved = await persistSettings(updates);
      if (!saved) {
        return;
      }

      await Promise.all([fetchCommandDiagnostic(), fetchGatewayStatus(), loadSettings()]);
      showMessage('OpenClaw 路径配置已保存。');
    } finally {
      setIsGatewayActionPending(false);
    }
  };

  const handleResetPathDraft = () => {
    setPathDraft({
      openclawPath: settings.openclawPath || '',
      openclawRootDir: settings.openclawRootDir || '',
    });
  };

  const handleUseDetectedCommandPath = () => {
    setPathDraft((prev) => ({
      ...prev,
      openclawPath: commandDiagnostic?.detectedPath || commandDiagnostic?.pathEnvCommand || '',
    }));
  };

  const isPathDraftDirty = pathDraft.openclawPath !== (settings.openclawPath || '')
    || pathDraft.openclawRootDir !== (settings.openclawRootDir || '');

  const handleAutoRepairOpenClawCommand = async () => {
    try {
      setIsGatewayActionPending(true);
      setGatewayRepairDetails([]);
      const result = await window.electronAPI.autoRepairOpenClawCommand();
      if (result.diagnostic) {
        setCommandDiagnostic(result.diagnostic);
      }
      setGatewayRepairDetails(Array.isArray(result.steps) ? result.steps : []);
      await Promise.all([fetchGatewayStatus(), fetchCommandDiagnostic(), loadSettings()]);

      if (!result.success) {
        throw new Error(result.error || result.message || 'OpenClaw 命令自动修复失败');
      }

      showMessage(result.message || 'OpenClaw 命令路径已修复。');
    } catch (error) {
      showMessage(`Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsGatewayActionPending(false);
    }
  };

  const loadSettings = async () => {
    const result = await window.electronAPI.settingsGet();
    if (!result.success || !result.settings) {
      throw new Error(result.error || 'Failed to load settings');
    }

    const savedSettings = result.settings as Partial<GeneralSettings>;
    setSettings((prev) => ({
      ...prev,
      ...savedSettings,
    }));
    setPathDraft({
      openclawPath: typeof savedSettings.openclawPath === 'string' ? savedSettings.openclawPath : '',
      openclawRootDir: typeof savedSettings.openclawRootDir === 'string' ? savedSettings.openclawRootDir : '',
    });

    return savedSettings;
  };

  const fetchGatewayStatus = async () => {
    const nextStatus = await window.electronAPI.gatewayStatus();
    setGatewayStatus(nextStatus);
    return nextStatus;
  };

  const fetchTailscaleStatus = async () => {
    const nextStatus = await window.electronAPI.tailscaleStatus();
    setTailscaleStatus(nextStatus);
    return nextStatus;
  };

  const fetchCommandDiagnostic = async () => {
    const result = await window.electronAPI.diagnoseOpenClawCommand();
    if (!result.success || !result.diagnostic) {
      throw new Error(result.error || result.message || 'Failed to diagnose OpenClaw command');
    }

    setCommandDiagnostic(result.diagnostic);
    return result.diagnostic;
  };

  const loadAll = async () => {
    try {
      setIsRefreshing(true);
      const [savedSettings, nextGatewayStatus, nextTailscaleStatus] = await Promise.all([
        loadSettings(),
        fetchGatewayStatus(),
        fetchTailscaleStatus(),
      ]);
      await fetchCommandDiagnostic();

      if (savedSettings.exposureMode && savedSettings.exposureMode !== nextTailscaleStatus.exposureMode) {
        setTailscaleStatus((prev) => ({
          ...prev,
          exposureMode: savedSettings.exposureMode || prev.exposureMode,
        }));
      }

      if (typeof savedSettings.openclawActive === 'boolean') {
        setSettings((prev) => ({
          ...prev,
          openclawActive: savedSettings.openclawActive ?? (nextGatewayStatus.status === 'running'),
        }));
      } else {
        setSettings((prev) => ({
          ...prev,
          openclawActive: nextGatewayStatus.status === 'running',
        }));
      }
    } catch (error) {
      console.error('Failed to refresh general settings:', error);
      showMessage(`Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleGatewayRepairCompatibility = async () => {
    try {
      setIsGatewayActionPending(true);
      setGatewayRepairDetails([]);

      const result = await runGatewayRepair({
        issueHint: gatewayStatus.error,
        repairCapabilityAvailable,
        runtimeInfo,
      });

      setGatewayRepairDetails(result.steps);
      await Promise.all([fetchGatewayStatus(), fetchCommandDiagnostic()]);

      if (!result.success) {
        throw new Error(result.message || 'Failed to repair gateway compatibility');
      }

      showMessage(result.message || 'Gateway compatibility repaired.');
    } catch (error) {
      showMessage(`Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsGatewayActionPending(false);
    }
  };

  const persistSettings = async (updates: Partial<GeneralSettings>) => {
    try {
      setIsSaving(true);
      const nextSettings = { ...settings, ...updates };
      const result = await window.electronAPI.settingsSet(nextSettings);
      if (!result.success) {
        throw new Error(result.error || 'Failed to save settings');
      }

      setSettings(nextSettings);
      return true;
    } catch (error) {
      console.error('Failed to save settings:', error);
      showMessage(`Error: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleSettingChange = async <K extends keyof GeneralSettings>(
    key: K,
    value: GeneralSettings[K],
  ) => {
    const previousSettings = settings;
    const updates: Partial<GeneralSettings> = { [key]: value };
    setSettings((prev) => ({ ...prev, ...updates }));

    const saved = await persistSettings(updates);
    if (!saved) {
      setSettings(previousSettings);
    }
  };

  const handleResetSettings = async () => {
    const previousSettings = settings;
    setSettings(defaultSettings);
    const saved = await persistSettings(defaultSettings);
    if (!saved) {
      setSettings(previousSettings);
      return;
    }

    showMessage('Settings reset to defaults.');
  };

  const handleGatewayToggle = async (enabled: boolean) => {
    const previousValue = settings.openclawActive;
    setSettings((prev) => ({ ...prev, openclawActive: enabled }));

    const saved = await persistSettings({ openclawActive: enabled });
    if (!saved) {
      setSettings((prev) => ({ ...prev, openclawActive: previousValue }));
      return;
    }

    try {
      setIsGatewayActionPending(true);
      const result = enabled
        ? await window.electronAPI.gatewayStart()
        : await window.electronAPI.gatewayStop();

      if (!result.success) {
        throw new Error(result.error || result.message || 'Gateway action failed');
      }

      await fetchGatewayStatus();
      showMessage(enabled ? 'Gateway started.' : 'Gateway stopped.');
    } catch (error) {
      setSettings((prev) => ({ ...prev, openclawActive: previousValue }));
      await persistSettings({ openclawActive: previousValue });
      await fetchGatewayStatus();
      showMessage(`Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsGatewayActionPending(false);
    }
  };

  const handleGatewayRestart = async () => {
    try {
      setIsGatewayActionPending(true);
      const result = await window.electronAPI.gatewayRestart();
      if (!result.success) {
        throw new Error(result.error || result.message || 'Failed to restart gateway');
      }

      await fetchGatewayStatus();
      showMessage(result.message || 'Gateway restarted.');
    } catch (error) {
      showMessage(`Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsGatewayActionPending(false);
    }
  };

  const handleOpenLogs = async () => {
    try {
      const result = await window.electronAPI.openGatewayLog();
      if (!result.success) {
        throw new Error(result.error || 'Failed to open gateway log');
      }

      showMessage(`Opened logs: ${result.path}`);
    } catch (error) {
      showMessage(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleStartTailscale = async () => {
    try {
      setIsTailscaleActionPending(true);
      const result = await window.electronAPI.tailscaleStart();
      if (!result.success) {
        throw new Error(result.error || 'Failed to start Tailscale');
      }

      await fetchTailscaleStatus();
      showMessage('Tailscale launch requested.');
    } catch (error) {
      showMessage(`Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsTailscaleActionPending(false);
    }
  };

  const handleExposureModeChange = async (mode: ExposureMode) => {
    const previousMode = settings.exposureMode;
    setSettings((prev) => ({ ...prev, exposureMode: mode }));

    const saved = await persistSettings({ exposureMode: mode });
    if (!saved) {
      setSettings((prev) => ({ ...prev, exposureMode: previousMode }));
      return;
    }

    try {
      setIsTailscaleActionPending(true);
      const result = await window.electronAPI.tailscaleApplyExposure(mode, gatewayStatus.port || 18789);
      if (!result.success) {
        throw new Error(result.error || 'Failed to apply Tailscale exposure');
      }

      const nextTailscaleStatus = await fetchTailscaleStatus();
      setTailscaleStatus((prev) => ({
        ...prev,
        exposureMode: nextTailscaleStatus.exposureMode || mode,
      }));
      showMessage(`Exposure mode updated to ${mode}.`);
    } catch (error) {
      setSettings((prev) => ({ ...prev, exposureMode: previousMode }));
      await persistSettings({ exposureMode: previousMode });
      showMessage(`Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsTailscaleActionPending(false);
    }
  };

  const gatewayDotColor = gatewayStatus.status === 'running'
    ? '#34D399'
    : gatewayStatus.status === 'error'
      ? '#F87171'
      : '#FB923C';

  const tailscaleDotColor = !tailscaleStatus.installed
    ? '#F87171'
    : tailscaleStatus.running
      ? '#34D399'
      : '#FB923C';

  const gatewayHeadline = gatewayStatus.status === 'running'
    ? `Gateway is running on ${gatewayStatus.host || '127.0.0.1'}:${gatewayStatus.port || 18789}.`
    : gatewayStatus.status === 'stopped'
      ? `Gateway is not currently reachable at ${gatewayStatus.host || '127.0.0.1'}:${gatewayStatus.port || 18789}.`
      : gatewayStatus.error || 'Gateway status could not be determined.';

  const healthFailure = gatewayStatus.status !== 'running';
  const tailscaleSummary = tailscaleStatus.dnsName
    ? `已连接到 ${tailscaleStatus.dnsName}`
    : tailscaleStatus.installed
      ? '可以用来开启安全远程访问'
      : '未检测到 Tailscale 客户端';
  const exposureDescription = settings.exposureMode === 'tailnet'
    ? '仅在 Tailnet 内安全访问控制台。'
    : settings.exposureMode === 'public'
      ? '通过 Funnel 对公网开放访问入口。'
      : '关闭远程暴露，仅保留本地访问。';

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--app-text-muted)' }}>
            Everyday essentials
          </div>
          <h1 className="mt-2 text-3xl font-semibold leading-tight" style={{ color: 'var(--app-text)' }}>
            General Settings
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-7" style={{ color: 'var(--app-text-muted)' }}>
            调整 OpenClaw 的日常使用体验，包括本地运行、远程访问、桌面行为和权限偏好。
          </p>
        </div>

        <div className="flex items-center gap-2">
          <AppButton
            variant="secondary"
            onClick={loadAll}
            disabled={isRefreshing || isSaving || isGatewayActionPending || isTailscaleActionPending}
            icon={<RefreshCw size={14} />}
          >
            Refresh
          </AppButton>
          <AppButton
            variant="secondary"
            onClick={handleResetSettings}
            disabled={isSaving || isGatewayActionPending || isTailscaleActionPending}
          >
            Reset to Defaults
          </AppButton>
          <AppButton
            variant="success"
            onClick={handleGatewayRepairCompatibility}
            disabled={isRefreshing || isSaving || isGatewayActionPending || isTailscaleActionPending || !repairCapabilityAvailable}
          >
            {repairCapabilityAvailable ? '修复兼容性' : '重启后可用'}
          </AppButton>
        </div>
      </div>

      {message && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${message.includes('Error') ? 'border-red-700 text-red-300' : 'border-emerald-700 text-emerald-300'}`}
          style={{
            backgroundColor: message.includes('Error')
              ? 'rgba(239, 68, 68, 0.12)'
              : 'rgba(16, 185, 129, 0.12)',
          }}
        >
          {message}
        </div>
      )}

      {!repairCapabilityAvailable && runtimeInfo && (
        <RuntimeUpdateNotice
          message={`当前是 ${runtimeInfo.appVersionLabel}，修复能力还未完成加载。请先重启桌面应用完成更新。`}
          runtimeInfo={runtimeInfo}
        />
      )}

      {gatewayRepairDetails.length > 0 && (
        <div
          className="rounded-lg border px-4 py-3 text-sm"
          style={{
            backgroundColor: 'rgba(59, 130, 246, 0.08)',
            borderColor: 'rgba(59, 130, 246, 0.18)',
            color: 'var(--app-text)',
          }}
        >
          <div className="font-medium">兼容性修复步骤</div>
          <div className="mt-2 space-y-1" style={{ color: 'var(--app-text-muted)' }}>
            {gatewayRepairDetails.map((item, index) => (
              <div key={`${index}-${item}`}>{index + 1}. {item}</div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-6">
        <GeneralOverviewCards
          gatewayDotColor={gatewayDotColor}
          gatewayHeadline={gatewayHeadline}
          gatewayStatus={gatewayStatus}
          settings={settings}
        />

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <GatewaySection
            commandDiagnostic={commandDiagnostic}
            gatewayDotColor={gatewayDotColor}
            gatewayHeadline={gatewayHeadline}
            gatewayStatus={gatewayStatus}
            isGatewayActionPending={isGatewayActionPending}
            loadAll={loadAll}
            onChangePathDraft={handlePathDraftChange}
            onAutoRepairOpenClawCommand={handleAutoRepairOpenClawCommand}
            onGatewayRestart={handleGatewayRestart}
            onGatewayToggle={handleGatewayToggle}
            onOpenLogs={handleOpenLogs}
            onResetPathDraft={handleResetPathDraft}
            onSettingChange={handleSettingChange}
            onSavePathSettings={handleSavePathSettings}
            onTestOpenClawCommand={handleTestOpenClawCommand}
            onUseDetectedCommandPath={handleUseDetectedCommandPath}
            pathDraft={pathDraft}
            pathDraftDirty={isPathDraftDirty}
            settings={settings}
          />

          <TailscaleSection
            exposureDescription={exposureDescription}
            exposureOptions={memoizedExposureOptions}
            fetchTailscaleStatus={fetchTailscaleStatus}
            isRefreshing={isRefreshing}
            isSaving={isSaving}
            isTailscaleActionPending={isTailscaleActionPending}
            onExposureModeChange={handleExposureModeChange}
            onSettingChange={handleSettingChange}
            onStartTailscale={handleStartTailscale}
            settings={settings}
            tailscaleDotColor={tailscaleDotColor}
            tailscaleStatus={tailscaleStatus}
            tailscaleSummary={tailscaleSummary}
          />
        </div>

        {healthFailure && (
          <GatewayHealthAlert
            gatewayDotColor={gatewayDotColor}
            gatewayStatus={gatewayStatus}
            isGatewayActionPending={isGatewayActionPending}
            onOpenLogs={handleOpenLogs}
            onRetry={loadAll}
          />
        )}

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <PreferencesSection
            onSettingChange={handleSettingChange}
            settings={settings}
          />

          <PermissionsSection
            onSettingChange={handleSettingChange}
            settings={settings}
          />
        </div>

        <IntegrationStatusCard onOpenLogs={handleOpenLogs} />
      </div>
    </div>
  );
};

export default SettingsGeneral;