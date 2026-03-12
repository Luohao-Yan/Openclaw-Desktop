import React from 'react';
import ToggleRow from './ToggleRow';
import type { GeneralSettings } from './types';

interface PreferencesSectionProps {
  onSettingChange: <K extends keyof GeneralSettings>(
    key: K,
    value: GeneralSettings[K],
  ) => Promise<void>;
  settings: GeneralSettings;
}

const PreferencesSection: React.FC<PreferencesSectionProps> = ({
  onSettingChange,
  settings,
}) => {
  return (
    <div
      className="rounded-[24px] border p-6"
      style={{ backgroundColor: 'var(--app-bg-elevated)', borderColor: 'var(--app-border)' }}
    >
      <div>
        <div className="text-sm font-medium" style={{ color: 'var(--app-text-muted)' }}>
          使用偏好
        </div>
        <div className="mt-2 text-2xl font-semibold" style={{ color: 'var(--app-text)' }}>
          桌面与工作方式
        </div>
        <div className="mt-2 text-sm leading-7" style={{ color: 'var(--app-text-muted)' }}>
          根据你的习惯调整启动方式、界面存在感和开发辅助能力。
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2">
        <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--app-border)', backgroundColor: 'rgba(255, 255, 255, 0.03)' }}>
          <ToggleRow
            checked={settings.launchAtLogin}
            label="Launch at login"
            description="登录系统后自动启动 OpenClaw。"
            onChange={(value) => void onSettingChange('launchAtLogin', value)}
          />
        </div>
        <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--app-border)', backgroundColor: 'rgba(255, 255, 255, 0.03)' }}>
          <ToggleRow
            checked={settings.showDockIcon}
            label="Show Dock icon"
            description="在 Dock 中显示图标，方便随时切回应用。"
            onChange={(value) => void onSettingChange('showDockIcon', value)}
          />
        </div>
        <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--app-border)', backgroundColor: 'rgba(255, 255, 255, 0.03)' }}>
          <ToggleRow
            checked={settings.playMenuBarAnimations}
            label="Play menu bar icon animations"
            description="保留状态图标的轻量动态反馈。"
            onChange={(value) => void onSettingChange('playMenuBarAnimations', value)}
          />
        </div>
        <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--app-border)', backgroundColor: 'rgba(255, 255, 255, 0.03)' }}>
          <ToggleRow
            checked={settings.enableDebugTools}
            label="Enable debug tools"
            description="显示调试工具与开发辅助入口。"
            onChange={(value) => void onSettingChange('enableDebugTools', value)}
          />
        </div>
      </div>
    </div>
  );
};

export default PreferencesSection;
