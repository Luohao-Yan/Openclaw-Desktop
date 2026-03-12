import type {
  ExposureOption,
  GatewayStatusModel,
  GeneralSettings,
  TailscaleStatusModel,
} from './types';

export const defaultSettings: GeneralSettings = {
  openclawActive: true,
  runMode: 'local',
  openclawPath: '',
  openclawRootDir: '',
  launchAtLogin: false,
  showDockIcon: false,
  playMenuBarAnimations: true,
  allowCanvas: true,
  allowCamera: true,
  enablePeekabooBridge: true,
  enableDebugTools: false,
  exposureMode: 'tailnet',
  requireCredentials: false,
};

export const defaultGatewayStatus: GatewayStatusModel = {
  status: 'checking',
};

export const defaultTailscaleStatus: TailscaleStatusModel = {
  installed: false,
  running: false,
  exposureMode: 'off',
  statusText: 'Checking Tailscale status…',
};

export const exposureOptions: ExposureOption[] = [
  { value: 'off', label: 'Off' },
  { value: 'tailnet', label: 'Tailnet (Serve)' },
  { value: 'public', label: 'Public (Funnel)' },
];
