import React from 'react';
import ToggleRow from './ToggleRow';
import type { GeneralSettings } from './types';

interface PermissionsSectionProps {
  onSettingChange: <K extends keyof GeneralSettings>(
    key: K,
    value: GeneralSettings[K],
  ) => Promise<void>;
  settings: GeneralSettings;
}

const PermissionsSection: React.FC<PermissionsSectionProps> = ({
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
          能力授权
        </div>
        <div className="mt-2 text-2xl font-semibold" style={{ color: 'var(--app-text)' }}>
          交互权限
        </div>
        <div className="mt-2 text-sm leading-7" style={{ color: 'var(--app-text-muted)' }}>
          你可以控制 Agent 能否访问相机、Canvas 以及桌面桥接能力。
        </div>
      </div>

      <div className="mt-6 space-y-4">
        <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--app-border)', backgroundColor: 'rgba(255, 255, 255, 0.03)' }}>
          <ToggleRow
            checked={settings.allowCanvas}
            label="Allow Canvas"
            description="允许智能体展示和操作 Canvas 面板。"
            onChange={(value) => void onSettingChange('allowCanvas', value)}
          />
        </div>
        <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--app-border)', backgroundColor: 'rgba(255, 255, 255, 0.03)' }}>
          <ToggleRow
            checked={settings.allowCamera}
            label="允许摄像头"
            description="允许调用本机摄像头进行拍照或短视频捕捉。"
            onChange={(value) => void onSettingChange('allowCamera', value)}
          />
        </div>
        <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--app-border)', backgroundColor: 'rgba(255, 255, 255, 0.03)' }}>
          <ToggleRow
            checked={settings.enablePeekabooBridge}
            label="Enable Peekaboo Bridge"
            description="允许已签名工具调用桌面自动化桥接能力。"
            onChange={(value) => void onSettingChange('enablePeekabooBridge', value)}
          />
        </div>
      </div>
    </div>
  );
};

export default PermissionsSection;
