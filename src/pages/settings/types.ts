import type { ComponentType } from 'react';

export interface SettingsSectionAccent {
  bg: string;
  icon: string;
  glow: string;
}

export interface SettingsSection {
  id: string;
  name: string;
  description: string;
  icon: ComponentType<{ size?: number }>;
  component?: ComponentType;
  translateKey: string;
}
