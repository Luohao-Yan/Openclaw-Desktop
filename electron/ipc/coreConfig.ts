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
  '3.24': new URL('../config/openclaw-manifests/3.24.json', import.meta.url),
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
    // 读取后执行 bindings.match schema 迁移，确保配置始终符合当前 schema
    return migrateBindingsSchema(JSON.parse(content));
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

  // 写入前执行 bindings.match schema 迁移，确保保存的配置不包含不兼容字段
  return {
    config: migrateBindingsSchema(nextConfig),
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

/** bindings.match 中需要移除的已废弃字段 */
const DEPRECATED_MATCH_FIELDS = ['dmScope', 'guildId', 'teamId'] as const;

/**
 * 判断 peer 字段是否为空值（空对象、null 或 undefined）
 * 空对象指 `{}` — 即 typeof 为 object 且非 null 且无自身属性
 */
const isPeerEmpty = (peer: unknown): boolean => {
  if (peer === null || peer === undefined) return true;
  if (typeof peer === 'object' && Object.keys(peer as object).length === 0) return true;
  return false;
};

/**
 * 迁移 openclaw.json 中 bindings.match 的 schema，移除不兼容字段。
 *
 * - 移除 match.peer 空值（`{}`、`null`、`undefined`）
 * - 移除已废弃字段：dmScope、guildId、teamId
 * - 保留 match.channel、match.accountId 等有效字段不变
 *
 * 纯函数：不修改输入对象，返回全新的配置对象。
 * 幂等：多次调用结果一致。
 *
 * @param config - openclaw.json 配置对象
 * @returns 迁移后的配置对象
 */
export const migrateBindingsSchema = (config: OpenClawConfigObject): OpenClawConfigObject => {
  // 深拷贝，确保不修改原始输入
  const result = JSON.parse(JSON.stringify(config));

  // 如果没有 bindings 数组或不是数组，直接返回
  if (!Array.isArray(result.bindings)) {
    return result;
  }

  result.bindings = result.bindings.map((binding: any) => {
    // 如果 binding 没有 match 字段，原样保留
    if (!binding.match || typeof binding.match !== 'object') {
      return binding;
    }

    // 构建清理后的 match 对象，仅保留非废弃且非空 peer 的字段
    const cleanedMatch: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(binding.match)) {
      // 跳过已废弃字段
      if ((DEPRECATED_MATCH_FIELDS as readonly string[]).includes(key)) {
        continue;
      }

      // 跳过空 peer 字段
      if (key === 'peer' && isPeerEmpty(value)) {
        continue;
      }

      // 保留有效字段
      cleanedMatch[key] = value;
    }

    // 解构出 enabled 和其他字段，丢弃 enabled（OpenClaw schema 不支持）
    const { enabled: _enabled, ...cleanedBinding } = binding;

    return {
      ...cleanedBinding,
      match: cleanedMatch,
    };
  });

  return result;
};

/**
 * 写入前创建 .bak 备份，仅在配置文件已存在时创建。
 * 写入失败时自动从 .bak 恢复原始配置。
 *
 * @param configPath - 配置文件路径
 * @param content - 要写入的内容
 */
const safeWriteConfigWithBackup = async (configPath: string, content: string): Promise<void> => {
  const backupPath = `${configPath}.bak`;

  // 仅在配置文件已存在时创建备份
  let hasBackup = false;
  try {
    await fs.access(configPath);
    await fs.copyFile(configPath, backupPath);
    hasBackup = true;
  } catch {
    // 配置文件不存在，无需备份
  }

  try {
    await fs.writeFile(configPath, content, 'utf8');
  } catch (writeError) {
    // 写入失败，尝试从备份恢复
    if (hasBackup) {
      try {
        await fs.copyFile(backupPath, configPath);
      } catch {
        // 恢复也失败，忽略（原始错误更重要）
      }
    }
    throw writeError;
  }
};

/**
 * 将 channel 配置写入 openclaw.json 的 channels 节点。
 *
 * 原子操作：先读取当前配置，深度合并 channel 配置，再写回文件。
 * 深度合并保留已有字段（如 token、webhookUrl），仅更新传入的字段。
 * 写入前创建 .bak 备份，写入失败时自动恢复。
 * 写入前自动执行 bindings schema 迁移，确保配置兼容。
 *
 * @param channelKey - 渠道标识（如 "telegram"、"discord"）
 * @param channelConfig - 渠道配置对象（如 { token: "xxx", ... }）
 * @returns 操作结果，包含 success 标志
 */
export const writeChannelToConfig = async (
  channelKey: string,
  channelConfig: Record<string, unknown>,
): Promise<{ success: boolean; error?: string }> => {
  try {
    // 读取当前配置（已自动执行 schema 迁移）
    const config = await readConfigFile();

    // 确保 channels 节点存在
    if (!config.channels || typeof config.channels !== 'object') {
      config.channels = {};
    }

    // 深度合并：保留已有渠道配置字段，仅更新传入的字段
    const existingChannelConfig = config.channels[channelKey];
    if (existingChannelConfig && typeof existingChannelConfig === 'object') {
      // 逐字段合并，对 accounts 子对象做二级合并
      const merged = { ...existingChannelConfig };
      for (const [key, value] of Object.entries(channelConfig)) {
        if (
          key === 'accounts' &&
          value && typeof value === 'object' &&
          merged.accounts && typeof merged.accounts === 'object'
        ) {
          // accounts 子对象：合并已有账户与新账户
          // 值为 null 的 key 表示删除该账户
          const mergedAccounts = { ...merged.accounts, ...value };
          for (const [accKey, accVal] of Object.entries(mergedAccounts)) {
            if (accVal === null) {
              delete mergedAccounts[accKey];
            }
          }
          merged.accounts = mergedAccounts;
        } else {
          merged[key] = value;
        }
      }
      config.channels[channelKey] = merged;
    } else {
      // 渠道不存在，直接写入新配置
      config.channels[channelKey] = channelConfig;
    }

    // 写入前再次执行 schema 迁移，确保兼容
    const migratedConfig = migrateBindingsSchema(config);

    // 确保配置目录存在
    const configPath = getConfigPath();
    const configDir = path.dirname(configPath);
    await fs.mkdir(configDir, { recursive: true });

    // 带备份的安全写入
    await safeWriteConfigWithBackup(configPath, `${JSON.stringify(migratedConfig, null, 2)}\n`);

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

/**
 * 读取 openclaw.json 验证指定 agent 是否存在于 agents.list 数组中。
 *
 * @param agentId - 要验证的 agent ID
 * @returns 操作结果，包含 exists 标志和 agent 信息
 */
export const verifyAgentInConfig = async (
  agentId: string,
): Promise<{ success: boolean; exists?: boolean; agent?: Record<string, unknown>; error?: string }> => {
  try {
    // 读取当前配置（已自动执行 schema 迁移）
    const config = await readConfigFile();

    // 获取 agents.list 数组
    const agentsList = Array.isArray(config.agents?.list) ? config.agents.list : [];

    // 查找匹配的 agent
    const found = agentsList.find(
      (agent: any) => agent && (agent.id === agentId || agent.name === agentId),
    );

    return {
      success: true,
      exists: !!found,
      agent: found || undefined,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

/**
 * 将 agent-channel 绑定关系写入 openclaw.json 的 bindings 数组。
 *
 * 原子操作：先读取当前配置，追加绑定条目，再写回文件。
 * 写入前创建 .bak 备份，写入失败时自动恢复。
 * 写入前自动执行 bindings schema 迁移，确保配置兼容。
 * 如果相同的绑定已存在（agentId + channel + accountId 完全匹配），则跳过不重复写入。
 *
 * @param agentId - agent ID
 * @param channelKey - 渠道标识（如 "telegram"）
 * @param accountId - 账户 ID（如 "default"）
 * @returns 操作结果，包含 success 标志
 */
export const writeBindingToConfig = async (
  agentId: string,
  channelKey: string,
  accountId: string,
): Promise<{ success: boolean; error?: string }> => {
  try {
    // 读取当前配置（已自动执行 schema 迁移）
    const config = await readConfigFile();

    // ── 智能 accountId 解析 ──────────────────────────────────────────────
    // CLI 创建渠道时会生成类似 cli_xxx 的 accountId，而非 'default'。
    // 如果调用方传入 'default' 但渠道配置里没有 accounts.default，
    // 自动使用该渠道下第一个可用的 accountId，避免绑定不匹配。
    let resolvedAccountId = accountId;
    if (config.channels && typeof config.channels === 'object') {
      const channelConf = config.channels[channelKey];
      if (channelConf && typeof channelConf === 'object' && channelConf.accounts && typeof channelConf.accounts === 'object') {
        const accountKeys = Object.keys(channelConf.accounts);
        // 传入的 accountId 在渠道配置中不存在时，回退到第一个可用账户
        if (accountKeys.length > 0 && !channelConf.accounts[accountId]) {
          resolvedAccountId = accountKeys[0];
        }
      }
    }

    // 确保 bindings 数组存在
    if (!Array.isArray(config.bindings)) {
      config.bindings = [];
    }

    // 检查是否已存在相同绑定，避免重复写入
    const alreadyExists = config.bindings.some(
      (binding: any) =>
        binding.agentId === agentId &&
        binding.match?.channel === channelKey &&
        binding.match?.accountId === resolvedAccountId,
    );

    if (!alreadyExists) {
      // 追加新的绑定条目（使用解析后的 accountId）
      config.bindings.push({
        agentId,
        match: {
          channel: channelKey,
          accountId: resolvedAccountId,
        },
      });
    }

    // 写入前执行 schema 迁移，确保兼容
    const migratedConfig = migrateBindingsSchema(config);

    // 确保配置目录存在
    const configPath = getConfigPath();
    const configDir = path.dirname(configPath);
    await fs.mkdir(configDir, { recursive: true });

    // 带备份的安全写入
    await safeWriteConfigWithBackup(configPath, `${JSON.stringify(migratedConfig, null, 2)}\n`);

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

/**
 * 查询指定 agent 的渠道绑定信息和系统中所有可用渠道。
 * 用于引导流程 bind-channels 步骤判断是否需要展示绑定页面。
 *
 * @param agentId - agent ID
 * @returns 包含 agent 已有绑定列表和系统可用渠道列表
 */
export const getAgentBindableInfo = async (
  agentId: string,
): Promise<{
  success: boolean;
  /** 该 agent 已有的绑定条目 */
  existingBindings: Array<{ channel: string; accountId?: string }>;
  /** 系统中所有已配置的渠道（openclaw.json channels 节点的 key 列表） */
  availableChannels: string[];
  /** 每个渠道下的账户列表（channel key → accountId 数组） */
  channelAccounts: Record<string, string[]>;
  /** 所有渠道-账户的绑定映射（"channelKey/accountId" → agentId），用于显示哪些账户已被其他 agent 绑定 */
  accountBindings: Record<string, string>;
  error?: string;
}> => {
  try {
    const config = await readConfigFile();

    // 提取该 agent 已有的绑定
    const existingBindings: Array<{ channel: string; accountId?: string }> = [];
    // 构建全局绑定映射：channelKey/accountId → agentId
    const accountBindings: Record<string, string> = {};
    if (Array.isArray(config.bindings)) {
      for (const binding of config.bindings) {
        if (!binding) continue;
        const ch = binding.match?.channel || '';
        const acc = binding.match?.accountId || 'default';
        const boundAgent = binding.agentId || '';
        // 记录全局绑定映射
        if (ch && boundAgent) {
          accountBindings[`${ch}/${acc}`] = boundAgent;
        }
        // 提取当前 agent 的绑定
        if (boundAgent === agentId) {
          existingBindings.push({ channel: ch, accountId: acc });
        }
      }
    }

    // 提取系统中所有已配置的渠道 key 及其账户列表
    const availableChannels: string[] = [];
    const channelAccounts: Record<string, string[]> = {};
    if (config.channels && typeof config.channels === 'object') {
      for (const key of Object.keys(config.channels)) {
        availableChannels.push(key);
        // 读取该渠道下的 accounts 节点，提取所有 accountId
        const channelConf = config.channels[key];
        const accountIds: string[] = [];
        if (channelConf && typeof channelConf === 'object' && channelConf.accounts && typeof channelConf.accounts === 'object') {
          for (const accKey of Object.keys(channelConf.accounts)) {
            accountIds.push(accKey);
          }
        }
        channelAccounts[key] = accountIds;
      }
    }

    return { success: true, existingBindings, availableChannels, channelAccounts, accountBindings };
  } catch (error) {
    return {
      success: false,
      existingBindings: [],
      availableChannels: [],
      channelAccounts: {},
      accountBindings: {},
      error: error instanceof Error ? error.message : String(error),
    };
  }
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

  // ── 配置持久化 IPC handlers ──────────────────────────────────────────────

  /** 将 channel 配置写入 openclaw.json 的 channels 节点 */
  ipcMain.handle(
    'coreConfig:writeChannel',
    async (_, channelKey: string, channelConfig: Record<string, unknown>) => {
      return writeChannelToConfig(channelKey, channelConfig);
    },
  );

  /** 验证 agent 是否存在于 openclaw.json 的 agents.list 中 */
  ipcMain.handle('coreConfig:verifyAgent', async (_, agentId: string) => {
    return verifyAgentInConfig(agentId);
  });

  /** 将 agent-channel 绑定写入 openclaw.json 的 bindings 数组 */
  ipcMain.handle(
    'coreConfig:writeBinding',
    async (_, agentId: string, channelKey: string, accountId: string) => {
      return writeBindingToConfig(agentId, channelKey, accountId);
    },
  );

  /**
   * coreConfig:getAgentBindableInfo - 查询 agent 的绑定信息和系统可用渠道
   * 用于引导流程 bind-channels 步骤判断是否需要展示绑定页面
   */
  ipcMain.handle(
    'coreConfig:getAgentBindableInfo',
    async (_, agentId: string) => {
      return getAgentBindableInfo(agentId);
    },
  );
}
