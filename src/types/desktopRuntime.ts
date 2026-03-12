export interface DesktopRuntimeInfo {
  appVersion: string;
  appVersionLabel: string;
  channel: 'preview';
  userName: string;
  openclawCompatTail: number;
  runtimeVersion: string;
  preloadVersion: string;
  mainVersion: string;
  capabilitiesVersion: number;
}

export interface DesktopRuntimeCapabilities {
  gateway?: {
    status?: boolean;
    start?: boolean;
    stop?: boolean;
    restart?: boolean;
    repairCompatibility?: boolean;
  };
  settings?: {
    diagnoseRoot?: boolean;
  };
  system?: {
    runtimeInfo?: boolean;
    capabilities?: boolean;
    stats?: boolean;
  };
}
