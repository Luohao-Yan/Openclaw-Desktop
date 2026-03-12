export type OpenClawRunMode = 'local' | 'remote';

export type ExposureMode = 'off' | 'tailnet' | 'public';

export interface GeneralSettings {
  openclawActive: boolean;
  runMode: OpenClawRunMode;
  openclawPath?: string;
  openclawRootDir?: string;
  launchAtLogin: boolean;
  showDockIcon: boolean;
  playMenuBarAnimations: boolean;
  allowCanvas: boolean;
  allowCamera: boolean;
  enablePeekabooBridge: boolean;
  enableDebugTools: boolean;
  exposureMode: ExposureMode;
  requireCredentials: boolean;
}

export interface ExposureOption {
  value: ExposureMode;
  label: string;
}

export interface GatewayStatusModel {
  status: 'running' | 'stopped' | 'error' | 'checking';
  error?: string;
  pid?: number;
  version?: string;
  uptime?: string;
  host?: string;
  port?: number;
}

export interface TailscaleStatusModel {
  installed: boolean;
  running: boolean;
  version?: string;
  dnsName?: string;
  tailnet?: string;
  exposureMode: ExposureMode;
  statusText: string;
  error?: string;
}
