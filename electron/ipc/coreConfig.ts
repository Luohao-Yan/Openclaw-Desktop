import pkg from 'electron';
const { ipcMain } = pkg;
import fs from 'fs/promises';
import path from 'path';
import type { ChildProcessWithoutNullStreams } from 'child_process';
import { fileURLToPath } from 'url';
import { getOpenClawRootDir, resolveOpenClawCommand } from './settings.js';
import { CURRENT_MANIFEST_VERSION } from '../config/manifest-version.js';

interface OpenClawConfigObject {
  [key: string]: any;
}

interface CommandPreviewItem {
  id: string;
  label: string;
  command: string;
}

interface ManifestFieldOption {
  label: string;
  value: string;
}

interface ManifestField {
  id: string;
  label: string;
  type: 'readonly' | 'text' | 'number' | 'select' | 'password';
  source?: string;
  path?: string;
  defaultValue?: string | number;
  options?: ManifestFieldOption[];
}

interface ManifestCommand {
  id: string;
  label: string;
  command: string;
  subcommands: string[];
}

interface ManifestSection {
  id: string;
  title: string;
  description: string;
  fields: ManifestField[];
  commands: ManifestCommand[];
}

interface OpenClawManifest {
  manifestVersion: string;
  openclawVersionRange: string;
  capabilities: Record<string, boolean>;
  sections: ManifestSection[];
}

/** manifest 文件 URL 映射，使用集中配置的版本号 */
const manifestFileUrls: Record<string, URL> = {
  '3.8': new URL('../config/openclaw-manifests/3.8.json', import.meta.url),
  '3.13': new URL('../config/openclaw-manifests/3.13.json', import.meta.url),
};

const OPENCLAW_VERSION_TIMEOUT_MS = 5000;

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirPath = path.dirname(currentFilePath);

const getConfigPath = () => path.join(getOpenClawRootDir(), 'openclaw.json');

const safeParseVersion = (rawVersionOutput: string) => {
  const matched = rawVersionOutput.match(/(\d+\.\d+(?:\.\d+)?)/);
  return matched?.[1] || '';
};

/** 根据检测到的 OpenClaw 版本号选择对应的 manifest 版本 */
const pickManifestVersion = (version: string) => {
  // 检查是否匹配已知的 manifest 版本前缀
  for (const key of Object.keys(manifestFileUrls)) {
    if (version.startsWith(key)) {
      return key;
    }
  }
  // 默认使用集中配置的当前版本
  return CURRENT_MANIFEST_VERSION;
};

const loadManifest = async (version: string): Promise<OpenClawManifest> => {
  /** 加载指定版本的 manifest 文件，找不到时回退到当前默认版本 */
  const manifestUrl = manifestFileUrls[version] || manifestFileUrls[CURRENT_MANIFEST_VERSION];
  const candidatePaths = [
    fileURLToPath(manifestUrl),
    path.resolve(currentDirPath, '../config/openclaw-manifests', `${version}.json`),
    path.resolve(currentDirPath, '../../electron/config/openclaw-manifests', `${version}.json`),
    path.resolve(process.cwd(), 'electron/config/openclaw-manifests', `${version}.json`),
  ];

  for (const candidatePath of candidatePaths) {
    try {
      const content = await fs.readFile(candidatePath, 'utf8');
      return JSON.parse(content) as OpenClawManifest;
    } catch {
    }
  }

  throw new Error(`Manifest file not found for OpenClaw version ${version}`);
};

const readConfigFile = async (): Promise<OpenClawConfigObject> => {
  const configPath = getConfigPath();
  try {
    const content = await fs.readFile(configPath, 'utf8');
    return JSON.parse(content);
  } catch {
    return {};
  }
};

const setByPath = (target: OpenClawConfigObject, pathValue: string, value: unknown) => {
  const segments = pathValue.split('.').filter(Boolean);
  if (!segments.length) {
    return;
  }

  let cursor: OpenClawConfigObject = target;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    if (typeof cursor[segment] !== 'object' || cursor[segment] === null) {
      cursor[segment] = {};
    }
    cursor = cursor[segment];
  }

  cursor[segments[segments.length - 1]] = value;
};

const getByPath = (target: OpenClawConfigObject, pathValue: string) => {
  return pathValue.split('.').filter(Boolean).reduce<unknown>((current, segment) => {
    if (typeof current !== 'object' || current === null) {
      return undefined;
    }

    return (current as OpenClawConfigObject)[segment];
  }, target);
};

const buildCommandPreviews = (manifest: OpenClawManifest, commandPath: string): CommandPreviewItem[] => {
  return (manifest.sections || []).flatMap((section) => {
    return (section.commands || []).map((item) => ({
      id: `${section.id}.${item.id}`,
      label: `${section.title} · ${item.label}`,
      command: [commandPath || 'openclaw', ...(item.subcommands || [])].join(' '),
    }));
  });
};

const buildDraftFromManifest = (
  manifest: OpenClawManifest,
  config: OpenClawConfigObject,
  settings: Record<string, unknown>,
  openclawVersion: string,
) => {
  const values: Record<string, unknown> = {};

  (manifest.sections || []).forEach((section) => {
    (section.fields || []).forEach((field) => {
      if (field.path?.startsWith('desktop.')) {
        const settingsKey = field.path.replace(/^desktop\./, '');
        values[field.id] = settings[settingsKey] ?? field.defaultValue ?? '';
        return;
      }

      if (field.source === 'runtime.version') {
        values[field.id] = openclawVersion || 'unknown';
        return;
      }

      if (field.source === 'runtime.manifestVersion') {
        values[field.id] = manifest.manifestVersion;
        return;
      }

      if (field.source === 'runtime.configPath') {
        values[field.id] = getConfigPath();
        return;
      }

      if (field.path) {
        const configValue = getByPath(config, field.path);
        values[field.id] = configValue ?? field.defaultValue ?? '';
      }
    });
  });

  return values;
};

const buildPatchedConfig = (
  manifest: OpenClawManifest,
  config: OpenClawConfigObject,
  values: Record<string, unknown>,
  openclawVersion?: string,
) => {
  const nextConfig = JSON.parse(JSON.stringify(config || {}));
  const desktopUpdates: Record<string, unknown> = {};

  (manifest.sections || []).forEach((section) => {
    (section.fields || []).forEach((field) => {
      if (field.type === 'readonly') {
        return;
      }

      if (!field.path) {
        return;
      }

      const nextValue = values[field.id];
      if (typeof nextValue === 'undefined') {
        return;
      }

      if (field.path.startsWith('desktop.')) {
        const settingsKey = field.path.replace(/^desktop\./, '');
        desktopUpdates[settingsKey] = nextValue;
        return;
      }

      setByPath(nextConfig, field.path, nextValue);
    });
  });

  // 处理 auth 图形化编辑的特殊字段（不在 manifest 中，直接写入 auth.*）
  if (typeof values['__authProfileOrder'] !== 'undefined') {
    setByPath(nextConfig, 'auth.profileOrder', values['__authProfileOrder']);
  }
  if (typeof values['__authProfiles'] !== 'undefined') {
    setByPath(nextConfig, 'auth.profiles', values['__authProfiles']);
  }
  // 处理 auth cooldowns 数字字段
  if (typeof values['authBillingBackoffHours'] !== 'undefined') {
    setByPath(nextConfig, 'auth.cooldowns.billingBackoffHours', values['authBillingBackoffHours']);
  }
  if (typeof values['authBillingBackoffCapHours'] !== 'undefined') {
    setByPath(nextConfig, 'auth.cooldowns.billingBackoffCapHours', values['authBillingBackoffCapHours']);
  }
  if (typeof values['authFailoverWindowHours'] !== 'undefined') {
    setByPath(nextConfig, 'auth.cooldowns.failoverWindowHours', values['authFailoverWindowHours']);
  }

  setByPath(nextConfig, 'metadata.configLastTouchedAt', new Date().toISOString());
  setByPath(
    nextConfig,
    'metadata.configLastTouchedVersion',
    openclawVersion || manifest.manifestVersion,
  );

  return {
    config: nextConfig,
    desktopUpdates,
  };
};

const detectOpenClawVersion = async () => {
  const commandPath = resolveOpenClawCommand();

  try {
    const { spawn } = await import('child_process');
    const result = await new Promise<string>((resolve) => {
      let child: ChildProcessWithoutNullStreams | null = null;
      let output = '';
      let errorOutput = '';
      let settled = false;
      let timeoutId: NodeJS.Timeout | null = null;

      const finish = (value: string) => {
        if (settled) {
          return;
        }
        settled = true;
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        resolve(value);
      };

      try {
        child = spawn(commandPath, ['--version']);
      } catch {
        finish('');
        return;
      }

      timeoutId = setTimeout(() => {
        try {
          child?.kill('SIGTERM');
        } catch {
        }
        finish('');
      }, OPENCLAW_VERSION_TIMEOUT_MS);

      child.stdout.on('data', (data) => {
        output += data.toString();
      });

      child.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      child.once('error', () => {
        finish('');
      });

      child.once('close', () => {
        finish((output || errorOutput).trim());
      });
    });

    return safeParseVersion(result);
  } catch {
    return '';
  }
};

const toErrorMessage = (stage: string, error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  return `[${stage}] ${message}`;
};

export function setupCoreConfigIPC() {
  ipcMain.handle('coreConfig:getOverview', async () => {
    try {
      let settingsModule: typeof import('./settings.js');
      try {
        settingsModule = await import('./settings.js');
      } catch (error) {
        throw new Error(toErrorMessage('import settings.js', error));
      }

      let openclawVersion = '';
      try {
        openclawVersion = await detectOpenClawVersion();
      } catch (error) {
        throw new Error(toErrorMessage('detectOpenClawVersion', error));
      }

      let config: OpenClawConfigObject = {};
      try {
        config = await readConfigFile();
      } catch (error) {
        throw new Error(toErrorMessage('readConfigFile', error));
      }

      const settings = settingsModule.getSettings() as Record<string, unknown>;
      const manifestVersion = pickManifestVersion(openclawVersion);

      let manifest: OpenClawManifest;
      try {
        manifest = await loadManifest(manifestVersion);
      } catch (error) {
        throw new Error(toErrorMessage('loadManifest', error));
      }

      let draft: Record<string, unknown>;
      try {
        draft = buildDraftFromManifest(manifest, config, settings, openclawVersion);
      } catch (error) {
        throw new Error(toErrorMessage('buildDraftFromManifest', error));
      }

      let commandPath = 'openclaw';
      try {
        commandPath = settingsModule.resolveOpenClawCommand();
      } catch (error) {
        throw new Error(toErrorMessage('resolveOpenClawCommand', error));
      }

      let commandPreviews: CommandPreviewItem[] = [];
      try {
        commandPreviews = buildCommandPreviews(manifest, commandPath);
      } catch (error) {
        throw new Error(toErrorMessage('buildCommandPreviews', error));
      }

      return {
        success: true,
        overview: {
          manifest,
          openclawVersion: openclawVersion || 'unknown',
          manifestVersion,
          configPath: getConfigPath(),
          commandPath,
          draft,
          commandPreviews,
          rawConfig: config,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcMain.handle('coreConfig:saveOverview', async (_, payload: { values: Record<string, unknown> }) => {
    try {
      let settingsModule: typeof import('./settings.js');
      try {
        settingsModule = await import('./settings.js');
      } catch (error) {
        throw new Error(toErrorMessage('save.import settings.js', error));
      }

      let openclawVersion = '';
      try {
        openclawVersion = await detectOpenClawVersion();
      } catch (error) {
        throw new Error(toErrorMessage('save.detectOpenClawVersion', error));
      }

      const manifestVersion = pickManifestVersion(openclawVersion);

      let manifest: OpenClawManifest;
      try {
        manifest = await loadManifest(manifestVersion);
      } catch (error) {
        throw new Error(toErrorMessage('save.loadManifest', error));
      }

      let config: OpenClawConfigObject = {};
      try {
        config = await readConfigFile();
      } catch (error) {
        throw new Error(toErrorMessage('save.readConfigFile', error));
      }

      const nextValues = payload?.values || {};
      let patched: { config: OpenClawConfigObject; desktopUpdates: Record<string, unknown> };
      try {
        patched = buildPatchedConfig(manifest, config, nextValues, openclawVersion);
      } catch (error) {
        throw new Error(toErrorMessage('save.buildPatchedConfig', error));
      }

      let configPath = '';
      try {
        configPath = getConfigPath();
      } catch (error) {
        throw new Error(toErrorMessage('save.getConfigPath', error));
      }

      const configDir = path.dirname(configPath);

      try {
        await fs.mkdir(configDir, { recursive: true });
      } catch (error) {
        throw new Error(toErrorMessage('save.mkdir configDir', error));
      }

      try {
        await fs.access(configPath);
        const backupPath = `${configPath}.backup.${Date.now()}`;
        await fs.copyFile(configPath, backupPath);
      } catch (error) {
        if (error) {
        }
      }

      try {
        await fs.writeFile(configPath, `${JSON.stringify(patched.config, null, 2)}\n`, 'utf8');
      } catch (error) {
        throw new Error(toErrorMessage('save.writeFile configPath', error));
      }

      try {
        settingsModule.updateSettings(patched.desktopUpdates);
      } catch (error) {
        throw new Error(toErrorMessage('save.updateSettings', error));
      }

      return {
        success: true,
        saved: {
          configPath,
          desktopUpdates: patched.desktopUpdates,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
}
