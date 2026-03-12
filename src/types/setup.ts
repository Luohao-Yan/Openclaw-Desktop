export type SetupMode = 'local' | 'remote';

export interface SetupEnvironmentCheck {
  source: 'ipc' | 'fallback';
  platform: string;
  platformLabel: string;
  runtimeMode: 'bundled' | 'system' | 'missing';
  runtimeCommand?: string;
  bundledRuntimeAvailable: boolean;
  nodeInstalled: boolean;
  nodeVersion?: string;
  nodeVersionSatisfies: boolean;
  npmInstalled: boolean;
  npmVersion?: string;
  openclawInstalled: boolean;
  openclawVersion?: string;
  openclawConfigExists: boolean;
  openclawRootDir: string;
  recommendedInstallCommand: string;
  recommendedInstallLabel: string;
  notes: string[];
  diagnosticError?: string;
}

export interface SetupSettings {
  runMode?: SetupMode;
  setupCompleted?: boolean;
  setupMode?: SetupMode;
  setupCurrentStep?: string;
  setupLastVisitedAt?: string;
  setupInstallStatus?: 'idle' | 'running' | 'succeeded' | 'failed';
  setupInstallMessage?: string;
  localInstallValidated?: boolean;
  remoteConnectionValidated?: boolean;
  openclawPath?: string;
  openclawRootDir?: string;
  remoteHost?: string;
  remotePort?: number;
  remoteProtocol?: 'http' | 'https';
  remoteToken?: string;
  detectedPlatform?: string;
  detectedPlatformLabel?: string;
}

export interface SetupLocalCheckResult {
  commandDetected: boolean;
  commandPath: string;
  rootDirDetected: boolean;
  rootDir: string;
  versionSuccess: boolean;
  versionOutput: string;
  error: string;
}

export interface SetupRemoteDraft {
  host: string;
  port: string;
  protocol: 'http' | 'https';
  token: string;
}

export interface SetupRemoteVerificationResult {
  authenticated?: boolean;
  error?: string;
  host?: string;
  port?: number;
  success: boolean;
  version?: string;
}

export interface SetupInstallResult {
  success: boolean;
  message: string;
  command: string;
  output?: string;
  error?: string;
}
