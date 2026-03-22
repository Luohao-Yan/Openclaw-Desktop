// ============================================================================
// 渠道账户字段定义 — 引导流程中"添加渠道账户"步骤使用
// 定义每种渠道的账户配置字段和平台配置指导信息
// ============================================================================

/** 账户字段选项（用于 select 类型） */
export interface AccountFieldOption {
  /** 选项显示标签 */
  label: string;
  /** 选项值 */
  value: string;
}

/** 账户配置字段定义 */
export interface AccountField {
  /** 字段唯一标识 */
  id: string;
  /** 字段显示标签 */
  label: string;
  /** 输入类型 */
  type: 'text' | 'password' | 'select';
  /** 是否必填 */
  required: boolean;
  /** 输入框占位提示 */
  placeholder?: string;
  /** 默认值 */
  defaultValue?: string;
  /** select 类型的选项列表 */
  options?: AccountFieldOption[];
}

/** 渠道平台配置指导 */
export interface ChannelGuide {
  /** 指导标题 */
  title: string;
  /** 外部文档 URL */
  url?: string;
  /** 简要步骤列表（内嵌显示） */
  steps: string[];
}

// ============================================================================
// 各渠道的账户配置字段定义
// ============================================================================

/** 飞书 DM 策略选项 */
const feishuDmPolicyOptions: AccountFieldOption[] = [
  { label: 'Open（允许所有人私聊）', value: 'open' },
  { label: 'Pairing（需配对码）', value: 'pairing' },
  { label: 'Allowlist（仅允许列表中的用户）', value: 'allowlist' },
  { label: 'Disabled（禁用私聊）', value: 'disabled' },
];

/**
 * 各渠道的账户配置字段映射
 * 仅包含需要用户在引导流程中填写的字段
 * 未列出的渠道使用默认配置（仅需 accountId）
 */
export const channelAccountFields: Record<string, AccountField[]> = {
  feishu: [
    { id: 'accountId', label: '账户 ID', type: 'text', required: true, placeholder: '例如 my-bot（仅允许字母、数字、连字符、下划线）' },
    { id: 'appId', label: 'App ID', type: 'text', required: true, placeholder: '飞书开放平台应用的 App ID' },
    { id: 'appSecret', label: 'App Secret', type: 'password', required: true, placeholder: '飞书开放平台应用的 App Secret' },
    { id: 'botName', label: '机器人名称', type: 'text', required: false, placeholder: '可选，机器人在飞书中的显示名称' },
    { id: 'dmPolicy', label: 'DM 策略', type: 'select', required: false, defaultValue: 'open', options: feishuDmPolicyOptions },
    { id: 'allowFrom', label: '允许的用户', type: 'text', required: false, defaultValue: '*', placeholder: '逗号分隔的用户 ID，* 表示所有人' },
  ],
  telegram: [
    { id: 'accountId', label: '账户 ID', type: 'text', required: true, placeholder: '例如 my-tg-bot' },
  ],
  discord: [
    { id: 'accountId', label: '账户 ID', type: 'text', required: true, placeholder: '例如 my-discord-bot' },
  ],
  slack: [
    { id: 'accountId', label: '账户 ID', type: 'text', required: true, placeholder: '例如 my-slack-bot' },
  ],
};

// ============================================================================
// channelKey 规范化映射
// addEnabledChannels 返回的 key（如 feishu_bot）与 channelAccountFields 中的
// key（feishu）不一致，需要规范化映射以正确匹配字段定义
// ============================================================================

/** _bot 后缀到规范化 key 的映射表 */
const channelKeyNormalizeMap: Record<string, string> = {
  feishu_bot: 'feishu',
  telegram_bot: 'telegram',
  discord_bot: 'discord',
  slack_bot: 'slack',
};

/**
 * 规范化渠道 key
 * 将 addEnabledChannels 返回的 _bot 后缀 key 映射为 channelAccountFields 中使用的 key
 * 已规范化的 key 保持不变（幂等）
 *
 * @example normalizeChannelKey('feishu_bot') // → 'feishu'
 * @example normalizeChannelKey('feishu')     // → 'feishu'
 */
export function normalizeChannelKey(channelKey: string): string {
  return channelKeyNormalizeMap[channelKey] ?? channelKey;
}

/**
 * 获取指定渠道的账户配置字段
 * 自动对 channelKey 进行规范化映射
 * 未定义的渠道返回仅含 accountId 的默认字段
 */
export function getAccountFields(channelKey: string): AccountField[] {
  const normalized = normalizeChannelKey(channelKey);
  return channelAccountFields[normalized] || [
    { id: 'accountId', label: '账户 ID', type: 'text', required: true, placeholder: '例如 my-bot' },
  ];
}

// ============================================================================
// 各渠道的平台配置指导
// ============================================================================

/**
 * 各渠道的平台配置指导映射
 * 包含外部文档链接和内嵌的简要步骤说明
 */
export const channelGuides: Record<string, ChannelGuide> = {
  feishu: {
    title: '飞书开放平台配置指南',
    url: 'https://bytedance.larkoffice.com/docx/MFK7dDFLFoVlOGxWCv5cTXKmnMh',
    steps: [
      '登录飞书开放平台 (open.feishu.cn)',
      '点击"创建企业自建应用"',
      '在"凭证与基础信息"页面获取 App ID 和 App Secret',
      '在"应用能力"中添加"机器人"能力',
      '在"权限管理"中开通 im:message、im:chat 等所需权限',
      '在"事件与回调"中配置事件订阅（选择 WebSocket 模式无需公网地址）',
      '创建应用版本并发布',
    ],
  },
  telegram: {
    title: 'Telegram Bot 配置指南',
    url: 'https://core.telegram.org/bots#how-do-i-create-a-bot',
    steps: [
      '在 Telegram 中搜索 @BotFather',
      '发送 /newbot 创建新机器人',
      '按提示设置机器人名称和用户名',
      '获取 Bot Token（已在上一步填写）',
    ],
  },
  discord: {
    title: 'Discord Bot 配置指南',
    url: 'https://discord.com/developers/docs/getting-started',
    steps: [
      '访问 Discord Developer Portal',
      '创建新应用（Application）',
      '在 Bot 页面创建机器人并获取 Token（已在上一步填写）',
      '在 OAuth2 页面生成邀请链接，将机器人添加到服务器',
    ],
  },
  slack: {
    title: 'Slack App 配置指南',
    url: 'https://api.slack.com/start/quickstart',
    steps: [
      '访问 Slack API 网站创建新应用',
      '在 OAuth & Permissions 中配置 Bot Token Scopes',
      '安装应用到工作区',
      '获取 Bot Token 和 App Token（已在上一步填写）',
    ],
  },
};

/**
 * 获取指定渠道的平台配置指导
 * 自动对 channelKey 进行规范化映射
 * 未定义的渠道返回 undefined
 */
export function getChannelGuide(channelKey: string): ChannelGuide | undefined {
  const normalized = normalizeChannelKey(channelKey);
  return channelGuides[normalized];
}

// ============================================================================
// accountId 校验逻辑
// ============================================================================

/** accountId 格式校验正则：仅允许 ASCII 字母、数字、连字符、下划线 */
const ACCOUNT_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

/** accountId 最大长度（作为 JSON key 使用，保持简短） */
export const ACCOUNT_ID_MAX_LENGTH = 32;

/**
 * 校验 accountId 的合法性
 * 规则：非空、长度不超过 32、仅 ASCII 字母/数字/连字符/下划线、同 provider 内唯一
 *
 * @param accountId - 待校验的账户 ID
 * @param existingIds - 同一 provider 下已有的 accountId 列表
 * @returns 校验结果，valid 为 true 时表示合法
 */
export function validateAccountId(
  accountId: string,
  existingIds: string[],
): { valid: boolean; error?: string } {
  if (!accountId.trim()) {
    return { valid: false, error: '账户 ID 不能为空' };
  }
  if (accountId.length > ACCOUNT_ID_MAX_LENGTH) {
    return { valid: false, error: `账户 ID 不能超过 ${ACCOUNT_ID_MAX_LENGTH} 个字符` };
  }
  if (!ACCOUNT_ID_PATTERN.test(accountId)) {
    return { valid: false, error: '账户 ID 仅允许 ASCII 字母、数字、连字符和下划线' };
  }
  if (existingIds.includes(accountId)) {
    return { valid: false, error: '该账户 ID 在当前渠道下已存在' };
  }
  return { valid: true };
}

// ============================================================================
// 飞书账户默认配置（写入 openclaw.json 时使用）
// ============================================================================

/**
 * 构建飞书账户的完整配置对象
 * 用于写入 openclaw.json 的 channels.feishu.accounts.<accountId>
 *
 * @param fieldValues - 用户在表单中填写的字段值
 * @returns 完整的飞书账户配置对象
 */
export function buildFeishuAccountConfig(fieldValues: Record<string, string>): Record<string, unknown> {
  // 解析 allowFrom 字段：逗号分隔字符串转数组
  const allowFromRaw = fieldValues.allowFrom || '*';
  const allowFrom = allowFromRaw.split(',').map((s) => s.trim()).filter(Boolean);

  return {
    enabled: true,
    domain: 'feishu',
    appId: fieldValues.appId || '',
    appSecret: fieldValues.appSecret || '',
    botName: fieldValues.botName || undefined,
    dmPolicy: fieldValues.dmPolicy || 'open',
    allowFrom: allowFrom.length > 0 ? allowFrom : ['*'],
    requireMention: true,
    streaming: true,
    typingIndicator: true,
    resolveSenderNames: true,
    footer: { elapsed: true, status: true },
    groupPolicy: 'open',
  };
}

/**
 * 构建通用渠道账户的默认配置对象
 * 用于非飞书渠道，写入 openclaw.json
 */
export function buildDefaultAccountConfig(_channelKey: string, _fieldValues: Record<string, string>): Record<string, unknown> {
  return {
    enabled: true,
  };
}
