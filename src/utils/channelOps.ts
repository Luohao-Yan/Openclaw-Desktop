/**
 * 渠道操作纯函数模块
 * 提取渠道 CRUD 的核心逻辑，便于属性测试验证
 * 所有函数均为纯函数，返回新配置副本，不修改原对象
 */

import type { OpenClawConfig } from './bindingOps';

// ============================================================
// 类型定义
// ============================================================

/** 渠道类型定义 */
export interface ChannelTypeDefinition {
  /** 渠道类型标识符，与 openclaw.json 中的 key 对应 */
  id: string;
  /** 显示名称 */
  name: string;
  /** 是否有专用表单模板 */
  hasForm: boolean;
}

/** 渠道状态摘要 */
export interface ChannelSummary {
  /** 已配置渠道总数 */
  totalChannels: number;
  /** 已启用渠道数量 */
  enabledChannels: number;
  /** 所有渠道的账号总数 */
  totalAccounts: number;
  /** 绑定记录总数 */
  totalBindings: number;
}

// ============================================================
// 常量：支持的 22 种渠道类型
// ============================================================

/** OpenClaw 官方支持的全部 22 种渠道类型 */
export const SUPPORTED_CHANNEL_TYPES: ChannelTypeDefinition[] = [
  { id: 'bluebubbles', name: 'BlueBubbles', hasForm: false },
  { id: 'discord', name: 'Discord', hasForm: false },
  { id: 'feishu', name: 'Feishu', hasForm: true },
  { id: 'googlechat', name: 'Google Chat', hasForm: false },
  { id: 'imessage', name: 'iMessage', hasForm: false },
  { id: 'irc', name: 'IRC', hasForm: false },
  { id: 'line', name: 'LINE', hasForm: false },
  { id: 'matrix', name: 'Matrix', hasForm: false },
  { id: 'mattermost', name: 'Mattermost', hasForm: false },
  { id: 'msteams', name: 'Microsoft Teams', hasForm: false },
  { id: 'nextcloudtalk', name: 'Nextcloud Talk', hasForm: false },
  { id: 'nostr', name: 'Nostr', hasForm: false },
  { id: 'signal', name: 'Signal', hasForm: false },
  { id: 'synologychat', name: 'Synology Chat', hasForm: false },
  { id: 'slack', name: 'Slack', hasForm: false },
  { id: 'telegram', name: 'Telegram', hasForm: false },
  { id: 'tlon', name: 'Tlon', hasForm: false },
  { id: 'twitch', name: 'Twitch', hasForm: false },
  { id: 'webchat', name: 'WebChat', hasForm: false },
  { id: 'whatsapp', name: 'WhatsApp', hasForm: false },
  { id: 'zalo', name: 'Zalo', hasForm: false },
  { id: 'zalopersonal', name: 'Zalo Personal', hasForm: false },
];

// ============================================================
// 渠道 CRUD 函数
// ============================================================

/**
 * 添加渠道：在 channels 对象中创建初始配置
 * 初始配置为 { enabled: false, accounts: {} }
 * 返回新配置副本，不修改原对象
 */
export function addChannelToConfig(
  config: OpenClawConfig,
  channelType: string,
): OpenClawConfig {
  const channels = { ...(config.channels || {}) };
  channels[channelType] = { enabled: false, accounts: {} };
  return { ...config, channels };
}

/**
 * 删除渠道：从 channels 中移除指定渠道，同时清理关联的 bindings
 * 移除 bindings 数组中 match.channel === channelType 的记录
 * 保持其他渠道和绑定不变
 */
export function deleteChannelFromConfig(
  config: OpenClawConfig,
  channelType: string,
): OpenClawConfig {
  // 移除指定渠道
  const channels = { ...(config.channels || {}) };
  delete channels[channelType];

  // 清理关联的绑定记录
  const bindings = config.bindings.filter(
    (b) => b.match.channel !== channelType,
  );

  return { ...config, channels, bindings };
}

/**
 * 更新渠道顶层配置（排除 accounts 子对象）
 * 仅更新 channels[channelType] 的顶层字段，保留 accounts 不变
 * 其他渠道配置不受影响
 */
export function updateChannelConfig(
  config: OpenClawConfig,
  channelType: string,
  updates: Record<string, any>,
): OpenClawConfig {
  const existingChannel = config.channels?.[channelType] || {};
  // 提取 updates 中除 accounts 以外的字段
  const { accounts: _ignoredAccounts, ...topLevelUpdates } = updates;

  const updatedChannel = {
    ...existingChannel,
    ...topLevelUpdates,
    // 始终保留原有的 accounts 子对象
    accounts: existingChannel.accounts || {},
  };

  const channels = {
    ...(config.channels || {}),
    [channelType]: updatedChannel,
  };

  return { ...config, channels };
}

// ============================================================
// 账号管理函数
// ============================================================

/**
 * 添加账号：在 channels[channelType].accounts 下创建新条目
 * 返回新配置副本
 */
export function addAccountToChannel(
  config: OpenClawConfig,
  channelType: string,
  accountId: string,
  initialConfig?: Record<string, any>,
): OpenClawConfig {
  const existingChannel = config.channels?.[channelType] || {};
  const existingAccounts = existingChannel.accounts || {};

  const updatedChannel = {
    ...existingChannel,
    accounts: {
      ...existingAccounts,
      [accountId]: initialConfig || {},
    },
  };

  const channels = {
    ...(config.channels || {}),
    [channelType]: updatedChannel,
  };

  return { ...config, channels };
}

/**
 * 删除账号：从 channels[channelType].accounts 中移除指定账号
 * 其他账号保持不变
 */
export function deleteAccountFromChannel(
  config: OpenClawConfig,
  channelType: string,
  accountId: string,
): OpenClawConfig {
  const existingChannel = config.channels?.[channelType] || {};
  const existingAccounts = { ...(existingChannel.accounts || {}) };
  delete existingAccounts[accountId];

  const updatedChannel = {
    ...existingChannel,
    accounts: existingAccounts,
  };

  const channels = {
    ...(config.channels || {}),
    [channelType]: updatedChannel,
  };

  return { ...config, channels };
}

/**
 * 更新账号配置：更新 channels[channelType].accounts[accountId] 的配置
 * 采用合并策略，保留未被覆盖的字段
 */
export function updateAccountConfig(
  config: OpenClawConfig,
  channelType: string,
  accountId: string,
  updates: Record<string, any>,
): OpenClawConfig {
  const existingChannel = config.channels?.[channelType] || {};
  const existingAccounts = existingChannel.accounts || {};
  const existingAccount = existingAccounts[accountId] || {};

  const updatedChannel = {
    ...existingChannel,
    accounts: {
      ...existingAccounts,
      [accountId]: { ...existingAccount, ...updates },
    },
  };

  const channels = {
    ...(config.channels || {}),
    [channelType]: updatedChannel,
  };

  return { ...config, channels };
}

// ============================================================
// 辅助函数
// ============================================================

/**
 * 验证渠道类型是否在支持列表中
 */
export function isSupportedChannelType(channelType: string): boolean {
  return SUPPORTED_CHANNEL_TYPES.some((t) => t.id === channelType);
}

/**
 * 验证账号 ID 是否在指定渠道中已存在
 * 返回 true 表示重复
 */
export function isAccountIdDuplicate(
  config: OpenClawConfig,
  channelType: string,
  accountId: string,
): boolean {
  const accounts = config.channels?.[channelType]?.accounts;
  if (!accounts || typeof accounts !== 'object') return false;
  return accountId in accounts;
}

/**
 * 计算渠道状态摘要
 * 返回 { totalChannels, enabledChannels, totalAccounts, totalBindings }
 */
export function computeChannelSummary(config: OpenClawConfig): ChannelSummary {
  const channels = config.channels || {};
  const channelKeys = Object.keys(channels);

  let enabledChannels = 0;
  let totalAccounts = 0;

  for (const key of channelKeys) {
    const ch = channels[key];
    if (ch && ch.enabled === true) {
      enabledChannels++;
    }
    if (ch && ch.accounts && typeof ch.accounts === 'object') {
      totalAccounts += Object.keys(ch.accounts).length;
    }
  }

  return {
    totalChannels: channelKeys.length,
    enabledChannels,
    totalAccounts,
    totalBindings: config.bindings.length,
  };
}

/**
 * 获取指定渠道关联的绑定数量
 * 统计 bindings 数组中 match.channel === channelType 的记录数
 */
export function getChannelBindingCount(
  config: OpenClawConfig,
  channelType: string,
): number {
  return config.bindings.filter(
    (b) => b.match.channel === channelType,
  ).length;
}

// ============================================================
// 高级配置类型定义
// ============================================================

/** 节点配对记录 */
export interface PairingNode {
  /** 节点 ID */
  id: string;
  /** 节点名称 */
  name?: string;
  /** 节点状态 */
  status?: 'active' | 'inactive';
}

/** 群消息渠道覆盖配置 */
export interface GroupMessagesOverride {
  /** 启用状态 */
  enabled?: boolean;
  /** 是否需要 @提及 */
  requireMention?: boolean;
  /** 关键词触发列表 */
  keywords?: string[];
  /** 前缀触发 */
  prefix?: string;
}

/** 群组记录 */
export interface GroupRecord {
  /** 所属渠道类型 */
  channel: string;
  /** 群组名称 */
  name?: string;
  /** 启用状态 */
  enabled?: boolean;
  /** 群组级消息处理策略 */
  messagePolicy?: Partial<GroupMessagesOverride>;
  [key: string]: any;
}

/** 广播目标 */
export interface BroadcastTarget {
  /** 目标类型：渠道或群组 */
  type: 'channel' | 'group';
  /** 渠道类型或群组 ID */
  id: string;
  /** 账号 ID（渠道目标时可选） */
  accountId?: string;
}

/** 广播群组记录 */
export interface BroadcastGroupRecord {
  /** 广播群组名称 */
  name: string;
  /** 目标渠道和群组列表 */
  targets: BroadcastTarget[];
  /** 启用状态 */
  enabled?: boolean;
}

/** 渠道路由规则 */
export interface RoutingRule {
  /** 规则名称 */
  name: string;
  /** 匹配条件 */
  match: {
    channel?: string;
    accountId?: string;
    source?: string;
    [key: string]: any;
  };
  /** 目标 Agent ID */
  agentId: string;
  /** 优先级（数字越大越优先） */
  priority: number;
  /** 启用状态 */
  enabled?: boolean;
}

/** 位置解析规则 */
export interface LocationParsingRule {
  /** 解析模式 */
  mode: 'regex' | 'predefined';
  /** 正则表达式（mode 为 regex 时） */
  pattern?: string;
  /** 预定义格式名称（mode 为 predefined 时） */
  format?: string;
  /** 输出字段映射 */
  fieldMapping?: Record<string, string>;
}

// ============================================================
// 20.1 配对管理函数（Pairing）
// ============================================================

/**
 * 更新 DM 配对审批策略
 * 支持 auto / manual / deny 三种策略
 * 返回新配置副本，不修改原对象
 */
export function updatePairingDmPolicy(
  config: OpenClawConfig,
  policy: 'auto' | 'manual' | 'deny',
): OpenClawConfig {
  const pairing = (config as any).pairing || {};
  return {
    ...config,
    pairing: {
      ...pairing,
      dm: { ...pairing.dm, policy },
    },
  } as OpenClawConfig;
}

/**
 * 添加节点配对
 * 向 pairing.nodes 数组追加节点记录
 * 返回新配置副本，不修改原对象
 */
export function addPairingNode(
  config: OpenClawConfig,
  node: PairingNode,
): OpenClawConfig {
  const pairing = (config as any).pairing || {};
  const existingNodes: PairingNode[] = pairing.nodes || [];
  return {
    ...config,
    pairing: {
      ...pairing,
      nodes: [...existingNodes, node],
    },
  } as OpenClawConfig;
}

/**
 * 删除节点配对
 * 从 pairing.nodes 数组中移除指定 nodeId 的节点
 * 返回新配置副本，不修改原对象
 */
export function deletePairingNode(
  config: OpenClawConfig,
  nodeId: string,
): OpenClawConfig {
  const pairing = (config as any).pairing || {};
  const existingNodes: PairingNode[] = pairing.nodes || [];
  return {
    ...config,
    pairing: {
      ...pairing,
      nodes: existingNodes.filter((n) => n.id !== nodeId),
    },
  } as OpenClawConfig;
}

// ============================================================
// 20.2 群消息配置函数（Group Messages）
// ============================================================

/**
 * 更新群消息全局配置
 * 合并更新 groupMessages 的顶层字段（enabled、requireMention、keywords、prefix）
 * 保留 overrides 不变
 * 返回新配置副本，不修改原对象
 */
export function updateGroupMessagesConfig(
  config: OpenClawConfig,
  updates: Partial<{
    enabled?: boolean;
    requireMention?: boolean;
    keywords?: string[];
    prefix?: string;
  }>,
): OpenClawConfig {
  const existing = (config as any).groupMessages || {};
  return {
    ...config,
    groupMessages: {
      ...existing,
      ...updates,
    },
  } as OpenClawConfig;
}

/**
 * 更新群消息渠道覆盖配置
 * 更新 groupMessages.overrides[channelType] 的配置
 * 返回新配置副本，不修改原对象
 */
export function updateGroupMessagesOverride(
  config: OpenClawConfig,
  channelType: string,
  override: Partial<GroupMessagesOverride>,
): OpenClawConfig {
  const existing = (config as any).groupMessages || {};
  const existingOverrides = existing.overrides || {};
  const existingChannelOverride = existingOverrides[channelType] || {};
  return {
    ...config,
    groupMessages: {
      ...existing,
      overrides: {
        ...existingOverrides,
        [channelType]: {
          ...existingChannelOverride,
          ...override,
        },
      },
    },
  } as OpenClawConfig;
}

/**
 * 验证关键词列表
 * 过滤掉空字符串和纯空白字符串，返回有效关键词列表
 */
export function validateKeywords(keywords: string[]): string[] {
  return keywords.filter((kw) => typeof kw === 'string' && kw.trim().length > 0);
}

// ============================================================
// 20.3 群组管理函数（Groups）
// ============================================================

/**
 * 添加群组
 * 在 groups 对象中创建新群组记录
 * 返回新配置副本，不修改原对象
 */
export function addGroup(
  config: OpenClawConfig,
  groupId: string,
  groupData: GroupRecord,
): OpenClawConfig {
  const existingGroups = (config as any).groups || {};
  return {
    ...config,
    groups: {
      ...existingGroups,
      [groupId]: { ...groupData },
    },
  } as OpenClawConfig;
}

/**
 * 更新群组配置
 * 合并更新指定群组的配置字段
 * 返回新配置副本，不修改原对象
 */
export function updateGroup(
  config: OpenClawConfig,
  groupId: string,
  updates: Partial<GroupRecord>,
): OpenClawConfig {
  const existingGroups = (config as any).groups || {};
  const existingGroup = existingGroups[groupId] || {};
  return {
    ...config,
    groups: {
      ...existingGroups,
      [groupId]: {
        ...existingGroup,
        ...updates,
      },
    },
  } as OpenClawConfig;
}

/**
 * 删除群组
 * 从 groups 对象中移除指定群组
 * 返回新配置副本，不修改原对象
 */
export function deleteGroup(
  config: OpenClawConfig,
  groupId: string,
): OpenClawConfig {
  const existingGroups = { ...((config as any).groups || {}) };
  delete existingGroups[groupId];
  return {
    ...config,
    groups: existingGroups,
  } as OpenClawConfig;
}

/**
 * 检查群组 ID 是否已存在
 * 返回 true 表示重复
 */
export function isGroupIdDuplicate(
  config: OpenClawConfig,
  groupId: string,
): boolean {
  const groups = (config as any).groups;
  if (!groups || typeof groups !== 'object') return false;
  return groupId in groups;
}

// ============================================================
// 20.4 广播群组函数（Broadcast Groups）
// ============================================================

/**
 * 添加广播群组
 * 在 broadcastGroups 对象中创建新广播群组
 * 返回新配置副本，不修改原对象
 */
export function addBroadcastGroup(
  config: OpenClawConfig,
  groupId: string,
  groupData: BroadcastGroupRecord,
): OpenClawConfig {
  const existing = (config as any).broadcastGroups || {};
  return {
    ...config,
    broadcastGroups: {
      ...existing,
      [groupId]: { ...groupData },
    },
  } as OpenClawConfig;
}

/**
 * 更新广播群组
 * 合并更新广播群组的名称、目标列表、启用状态
 * 返回新配置副本，不修改原对象
 */
export function updateBroadcastGroup(
  config: OpenClawConfig,
  groupId: string,
  updates: Partial<BroadcastGroupRecord>,
): OpenClawConfig {
  const existing = (config as any).broadcastGroups || {};
  const existingGroup = existing[groupId] || {};
  return {
    ...config,
    broadcastGroups: {
      ...existing,
      [groupId]: {
        ...existingGroup,
        ...updates,
      },
    },
  } as OpenClawConfig;
}

/**
 * 删除广播群组
 * 从 broadcastGroups 对象中移除指定广播群组
 * 返回新配置副本，不修改原对象
 */
export function deleteBroadcastGroup(
  config: OpenClawConfig,
  groupId: string,
): OpenClawConfig {
  const existing = { ...((config as any).broadcastGroups || {}) };
  delete existing[groupId];
  return {
    ...config,
    broadcastGroups: existing,
  } as OpenClawConfig;
}

// ============================================================
// 20.5 渠道路由函数（Channel Routing）
// ============================================================

/**
 * 添加路由规则
 * 向 channelRouting.rules 数组追加路由规则
 * 返回新配置副本，不修改原对象
 */
export function addRoutingRule(
  config: OpenClawConfig,
  rule: RoutingRule,
): OpenClawConfig {
  const routing = (config as any).channelRouting || {};
  const existingRules: RoutingRule[] = routing.rules || [];
  return {
    ...config,
    channelRouting: {
      ...routing,
      rules: [...existingRules, rule],
    },
  } as OpenClawConfig;
}

/**
 * 更新路由规则
 * 合并更新指定索引的路由规则
 * 如果索引越界则返回原配置不做修改
 * 返回新配置副本，不修改原对象
 */
export function updateRoutingRule(
  config: OpenClawConfig,
  ruleIndex: number,
  updates: Partial<RoutingRule>,
): OpenClawConfig {
  const routing = (config as any).channelRouting || {};
  const existingRules: RoutingRule[] = routing.rules || [];

  // 索引越界，返回原配置
  if (ruleIndex < 0 || ruleIndex >= existingRules.length) {
    return config;
  }

  const newRules = [...existingRules];
  newRules[ruleIndex] = {
    ...newRules[ruleIndex],
    ...updates,
  };

  return {
    ...config,
    channelRouting: {
      ...routing,
      rules: newRules,
    },
  } as OpenClawConfig;
}

/**
 * 删除路由规则
 * 从 channelRouting.rules 数组中移除指定索引的规则
 * 如果索引越界则返回原配置不做修改
 * 返回新配置副本，不修改原对象
 */
export function deleteRoutingRule(
  config: OpenClawConfig,
  ruleIndex: number,
): OpenClawConfig {
  const routing = (config as any).channelRouting || {};
  const existingRules: RoutingRule[] = routing.rules || [];

  // 索引越界，返回原配置
  if (ruleIndex < 0 || ruleIndex >= existingRules.length) {
    return config;
  }

  const newRules = existingRules.filter((_, i) => i !== ruleIndex);

  return {
    ...config,
    channelRouting: {
      ...routing,
      rules: newRules,
    },
  } as OpenClawConfig;
}

/**
 * 按优先级降序排列路由规则（数字越大越优先）
 * 返回排序后的新数组，不修改原数组
 */
export function sortRoutingRulesByPriority(
  rules: RoutingRule[],
): RoutingRule[] {
  return [...rules].sort((a, b) => b.priority - a.priority);
}

// ============================================================
// 20.6 位置解析函数（Location Parsing）
// ============================================================

/**
 * 更新位置解析全局配置
 * 合并更新 locationParsing 的顶层字段（如 enabled）
 * 保留 rules 不变
 * 返回新配置副本，不修改原对象
 */
export function updateLocationParsingConfig(
  config: OpenClawConfig,
  updates: Partial<{ enabled?: boolean; [key: string]: any }>,
): OpenClawConfig {
  const existing = (config as any).locationParsing || {};
  return {
    ...config,
    locationParsing: {
      ...existing,
      ...updates,
    },
  } as OpenClawConfig;
}

/**
 * 更新渠道级位置解析规则
 * 更新 locationParsing.rules[channelType] 的解析规则
 * 返回新配置副本，不修改原对象
 */
export function updateLocationParsingRule(
  config: OpenClawConfig,
  channelType: string,
  rule: LocationParsingRule,
): OpenClawConfig {
  const existing = (config as any).locationParsing || {};
  const existingRules = existing.rules || {};
  return {
    ...config,
    locationParsing: {
      ...existing,
      rules: {
        ...existingRules,
        [channelType]: { ...rule },
      },
    },
  } as OpenClawConfig;
}

/**
 * 验证正则表达式格式
 * 返回 { valid: boolean; error?: string }
 * valid 为 true 表示正则合法，false 表示无效并附带错误信息
 */
export function validateRegexPattern(
  pattern: string,
): { valid: boolean; error?: string } {
  try {
    new RegExp(pattern);
    return { valid: true };
  } catch (e: any) {
    return { valid: false, error: e.message || '正则表达式格式无效' };
  }
}

// ============================================================
// CLI 参数构建函数
// ============================================================

/**
 * 将 camelCase 字段 ID 转换为 kebab-case CLI flag
 * 例如：appSecret → --app-secret，botToken → --bot-token
 * 纯函数，无副作用
 */
export function fieldIdToCliFlag(fieldId: string): string {
  return '--' + fieldId.replace(/([A-Z])/g, '-$1').toLowerCase();
}

/**
 * 根据渠道类型和字段值构建 CLI 参数数组
 * 基础参数为 ['channels', 'add', '--channel', channelType]
 * 遍历 fieldValues，将非空值转换为 --kebab-case flag value 对追加到参数列表
 * 纯函数，无副作用
 */
export function buildChannelAddArgs(
  channelType: string,
  fieldValues: Record<string, string>,
): string[] {
  const args = ['channels', 'add', '--channel', channelType];
  for (const [fieldId, value] of Object.entries(fieldValues)) {
    if (value && value.trim()) {
      args.push(fieldIdToCliFlag(fieldId), value.trim());
    }
  }
  return args;
}
