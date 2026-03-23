import React from 'react';
import { Activity, Globe } from 'lucide-react';
import AppButton from '../../../components/AppButton';
import ToggleRow from './ToggleRow';
import type {
  ExposureOption,
  ExposureMode,
  GeneralSettings,
  TailscaleStatusModel,
} from './types';
import { statusDotStyle } from './utils';

interface TailscaleSectionProps {
  exposureDescription: string;
  exposureOptions: ExposureOption[];
  fetchTailscaleStatus: () => Promise<TailscaleStatusModel>;
  isRefreshing: boolean;
  isSaving: boolean;
  isTailscaleActionPending: boolean;
  onExposureModeChange: (mode: ExposureMode) => Promise<void>;
  onSettingChange: <K extends keyof GeneralSettings>(
    key: K,
    value: GeneralSettings[K],
  ) => Promise<void>;
  onStartTailscale: () => Promise<void>;
  settings: GeneralSettings;
  tailscaleDotColor: string;
  tailscaleStatus: TailscaleStatusModel;
  tailscaleSummary: string;
}

const TailscaleSection: React.FC<TailscaleSectionProps> = ({
  exposureDescription,
  exposureOptions,
  fetchTailscaleStatus,
  isRefreshing,
  isSaving,
  isTailscaleActionPending,
  onExposureModeChange,
  onSettingChange,
  onStartTailscale,
  settings,
  tailscaleDotColor,
  tailscaleStatus,
  tailscaleSummary,
}) => {
  return (
    <div
      className="rounded-[24px] border p-6"
      style={{ backgroundColor: 'var(--app-bg-elevated)', borderColor: 'var(--app-border)' }}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-medium" style={{ color: 'var(--app-text-muted)' }}>
            远程访问
          </div>
          <div className="mt-2 text-2xl font-semibold" style={{ color: 'var(--app-text)' }}>
            Tailscale Access
          </div>
          <div className="mt-2 text-sm leading-7" style={{ color: 'var(--app-text-muted)' }}>
            通过 Tailnet 或 Funnel 让你从其他设备更安全地访问 OpenClaw 控制台。
          </div>
        </div>
        <div
          className="flex h-11 w-11 items-center justify-center rounded-2xl"
          style={{ backgroundColor: 'rgba(45, 212, 191, 0.12)' }}
        >
          <Globe size={20} style={{ color: '#2DD4BF' }} />
        </div>
      </div>

      <div
        className="mt-5 rounded-[20px] border p-5"
        style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)', borderColor: 'var(--app-border)' }}
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="h-3 w-3 rounded-full" style={statusDotStyle(tailscaleDotColor)} />
              <span className="text-base font-medium" style={{ color: 'var(--app-text)' }}>
                {tailscaleStatus.statusText}
              </span>
            </div>
            <div className="mt-2 text-sm" style={{ color: 'var(--app-text-muted)' }}>
              {tailscaleSummary}
            </div>
            <div className="mt-1 text-sm" style={{ color: 'var(--app-text-muted)' }}>
              版本：{tailscaleStatus.version || 'unknown'}
              {tailscaleStatus.tailnet ? ` · Tailnet: ${tailscaleStatus.tailnet}` : ''}
            </div>
          </div>

          <AppButton
            variant="secondary"
            size="sm"
            onClick={() => void fetchTailscaleStatus()}
            disabled={isTailscaleActionPending || isRefreshing}
          >
            Refresh
          </AppButton>
        </div>

        <div className="mt-5">
          <div className="text-sm font-medium" style={{ color: 'var(--app-text)' }}>
            Exposure mode
          </div>
          <div className="mt-3 inline-flex rounded-2xl p-1" style={{ backgroundColor: 'var(--app-segment-bg)' }}>
            {exposureOptions.map((option) => {
              const active = settings.exposureMode === option.value;

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => void onExposureModeChange(option.value)}
                  disabled={isTailscaleActionPending || !tailscaleStatus.installed}
                  className="rounded-xl px-5 py-2.5 text-sm font-semibold transition-all duration-200 disabled:opacity-50"
                  style={active
                    ? {
                        backgroundColor: 'var(--app-segment-active-bg)',
                        color: 'var(--app-active-text)',
                      }
                    : {
                        color: 'var(--app-text-muted)',
                      }}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <div className="mt-3 text-sm leading-7" style={{ color: 'var(--app-text-muted)' }}>
            {exposureDescription}
          </div>
          <div className="mt-1 text-sm" style={{ color: 'var(--app-text-muted)' }}>
            {tailscaleStatus.dnsName
              ? `当前主机名：${tailscaleStatus.dnsName}`
              : '启动 Tailscale 后可自动显示你的 Tailnet 主机名。'}
          </div>
          {tailscaleStatus.error && (
            <div className="mt-3 text-sm text-orange-300">{tailscaleStatus.error}</div>
          )}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <AppButton
            variant="primary"
            icon={<Activity size={14} />}
            disabled={isTailscaleActionPending || tailscaleStatus.running}
            onClick={() => void onStartTailscale()}
          >
            启动 Tailscale
          </AppButton>
        </div>

        <div className="mt-5">
          <ToggleRow
            checked={settings.requireCredentials}
            label="需要凭据认证"
            description="使用 Tailscale 身份信息保护访问请求，无需单独设置密码。"
            disabled={settings.exposureMode === 'off' || isSaving}
            onChange={(value) => void onSettingChange('requireCredentials', value)}
          />
        </div>
      </div>
    </div>
  );
};

export default TailscaleSection;
