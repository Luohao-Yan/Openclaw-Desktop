// ============================================================================
// 渠道字段定义 — 懒加载模块
// 用户启用渠道时才加载完整字段定义，减少初始化时的内存占用。
// @see 需求 3.6 — 渠道配置懒加载
// ============================================================================

import type { ChannelField } from '../types/setup';

/** 渠道字段定义映射表 */
export const channelFieldDefinitions: Record<string, ChannelField[]> = {
  // —— 内置渠道 ——
  telegram: [
    { id: 'token', label: 'Bot Token', placeholder: '例如 123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11', type: 'password', required: true },
  ],
  whatsapp: [
    { id: 'info', label: '配对方式', placeholder: '启用后通过 openclaw channels login --channel whatsapp 扫码配对', type: 'info', required: false },
  ],
  feishu: [
    { id: 'appId', label: 'App ID', placeholder: '飞书开放平台应用的 App ID', type: 'text', required: true },
    { id: 'appSecret', label: 'App Secret', placeholder: '飞书开放平台应用的 App Secret', type: 'password', required: true },
  ],
  discord: [
    { id: 'token', label: 'Bot Token', placeholder: '从 Discord Developer Portal 获取', type: 'password', required: true },
  ],
  signal: [
    { id: 'phone', label: '手机号', placeholder: '+86xxxxxxxxxxx', type: 'text', required: true },
  ],
  slack: [
    { id: 'appToken', label: 'App Token', placeholder: 'xapp-1-...', type: 'password', required: true },
    { id: 'botToken', label: 'Bot Token', placeholder: 'xoxb-...', type: 'password', required: true },
  ],
  bluebubbles: [
    { id: 'url', label: 'Server URL', placeholder: 'http://localhost:1234', type: 'text', required: true },
    { id: 'password', label: 'Password', placeholder: 'BlueBubbles 服务器密码', type: 'password', required: true },
  ],
  imessage: [
    { id: 'info', label: '说明', placeholder: '已弃用，请使用 BlueBubbles 替代', type: 'info', required: false },
  ],
  googlechat: [
    { id: 'serviceAccountKey', label: 'Service Account JSON', placeholder: 'Service Account 密钥文件路径或 JSON 内容', type: 'text', required: true },
  ],
  irc: [
    { id: 'server', label: 'Server', placeholder: 'irc.libera.chat:6697', type: 'text', required: true },
    { id: 'nick', label: 'Nick', placeholder: 'openclaw-bot', type: 'text', required: true },
  ],
  webchat: [
    { id: 'info', label: '说明', placeholder: '无需额外配置，启用后 Gateway 自动提供 WebChat 界面', type: 'info', required: false },
  ],
  // —— 插件渠道 ——
  line: [
    { id: 'channelSecret', label: 'Channel Secret', placeholder: 'LINE Channel Secret', type: 'password', required: true },
    { id: 'accessToken', label: 'Access Token', placeholder: 'LINE Channel Access Token', type: 'password', required: true },
  ],
  matrix: [
    { id: 'homeserver', label: 'Homeserver URL', placeholder: 'https://matrix.org', type: 'text', required: true },
    { id: 'accessToken', label: 'Access Token', placeholder: 'Matrix Access Token', type: 'password', required: true },
  ],
  mattermost: [
    { id: 'url', label: 'Server URL', placeholder: 'https://mattermost.example.com', type: 'text', required: true },
    { id: 'token', label: 'Bot Token', placeholder: 'Mattermost Bot Token', type: 'password', required: true },
  ],
  msteams: [
    { id: 'appId', label: 'App ID', placeholder: 'Azure Bot App ID', type: 'text', required: true },
    { id: 'appPassword', label: 'App Password', placeholder: 'Azure Bot App Password', type: 'password', required: true },
  ],
  nextcloudtalk: [
    { id: 'url', label: 'Nextcloud URL', placeholder: 'https://cloud.example.com', type: 'text', required: true },
    { id: 'token', label: 'App Token', placeholder: 'Nextcloud App Token', type: 'password', required: true },
  ],
  nostr: [
    { id: 'privateKey', label: 'Private Key (nsec)', placeholder: 'nsec1...', type: 'password', required: true },
  ],
  synologychat: [
    { id: 'incomingUrl', label: 'Incoming Webhook URL', placeholder: 'https://nas.example.com/webapi/...', type: 'text', required: true },
    { id: 'outgoingToken', label: 'Outgoing Token', placeholder: 'Outgoing Webhook Token', type: 'password', required: true },
  ],
  tlon: [
    { id: 'shipUrl', label: 'Ship URL', placeholder: 'http://localhost:8080', type: 'text', required: true },
    { id: 'code', label: 'Access Code', placeholder: '+code from Urbit', type: 'password', required: true },
  ],
  twitch: [
    { id: 'channel', label: 'Channel', placeholder: 'Twitch 频道名', type: 'text', required: true },
    { id: 'oauthToken', label: 'OAuth Token', placeholder: 'oauth:...', type: 'password', required: true },
  ],
  zalo: [
    { id: 'token', label: 'API Token', placeholder: 'Zalo OA Access Token', type: 'password', required: true },
  ],
  zalopersonal: [
    { id: 'info', label: '配对方式', placeholder: '启用后通过 openclaw channels login --channel zalopersonal 扫码登录', type: 'info', required: false },
  ],
};

/**
 * 获取渠道字段定义（懒加载）。
 * 如果渠道未定义字段，返回空数组。
 */
export const getChannelFields = (channelKey: string): ChannelField[] =>
  channelFieldDefinitions[channelKey] || [];

/** 渠道 CLI 提示映射 */
export const channelCliHints: Record<string, string> = {
  telegram: 'openclaw channels add --channel telegram --token <bot-token>',
  whatsapp: 'openclaw channels login --channel whatsapp',
  feishu: 'openclaw channels add --channel feishu --app-id <id> --app-secret <secret>',
  discord: 'openclaw channels add --channel discord --token <bot-token>',
  signal: 'openclaw channels add --channel signal --phone <number>',
  slack: 'openclaw channels add --channel slack --app-token <xapp-...> --bot-token <xoxb-...>',
  bluebubbles: 'openclaw channels add --channel bluebubbles --url <server-url> --password <pwd>',
  imessage: 'openclaw channels add --channel imessage',
  googlechat: 'openclaw channels add --channel googlechat --service-account-key <path>',
  irc: 'openclaw channels add --channel irc --server <host:port> --nick <name>',
  webchat: 'openclaw channels add --channel webchat',
  line: 'openclaw channels add --channel line --channel-secret <secret> --access-token <token>',
  matrix: 'openclaw channels add --channel matrix --homeserver <url> --access-token <token>',
  mattermost: 'openclaw channels add --channel mattermost --url <server-url> --token <bot-token>',
  msteams: 'openclaw channels add --channel msteams --app-id <id> --app-password <pwd>',
  nextcloudtalk: 'openclaw channels add --channel nextcloudtalk --url <nc-url> --token <app-token>',
  nostr: 'openclaw channels add --channel nostr --private-key <nsec...>',
  synologychat: 'openclaw channels add --channel synologychat --incoming-url <url> --outgoing-token <token>',
  tlon: 'openclaw channels add --channel tlon --ship-url <url> --code <access-code>',
  twitch: 'openclaw channels add --channel twitch --channel-name <name> --oauth-token <token>',
  zalo: 'openclaw channels add --channel zalo --token <oa-access-token>',
  zalopersonal: 'openclaw channels login --channel zalopersonal',
};


/** 渠道基础信息（不含字段定义，用于初始化） */
export interface ChannelBaseInfo {
  key: string;
  label: string;
  hint: string;
  tokenLabel: string;
}

/** 所有支持的渠道基础信息列表 */
export const channelBaseInfoList: ChannelBaseInfo[] = [
  // 内置渠道
  { key: 'telegram', label: 'Telegram', hint: 'Bot API via grammY，支持群组', tokenLabel: 'Bot Token' },
  { key: 'whatsapp', label: 'WhatsApp', hint: '使用 Baileys，需 QR 配对扫码', tokenLabel: 'QR Pairing' },
  { key: 'feishu', label: 'Feishu / Lark', hint: '飞书/Lark 机器人，WebSocket 接入', tokenLabel: 'App ID / App Secret' },
  { key: 'discord', label: 'Discord', hint: 'Bot API + Gateway，支持服务器/频道/DM', tokenLabel: 'Bot Token' },
  { key: 'signal', label: 'Signal', hint: '通过 signal-cli 接入，注重隐私', tokenLabel: 'Signal CLI Path' },
  { key: 'slack', label: 'Slack', hint: 'Bolt SDK，Workspace 应用', tokenLabel: 'Bot OAuth Token' },
  { key: 'bluebubbles', label: 'BlueBubbles', hint: '推荐的 iMessage 方案，需 macOS BlueBubbles 服务器', tokenLabel: 'Server Password' },
  { key: 'imessage', label: 'iMessage (legacy)', hint: '旧版 imsg CLI 集成（已弃用，推荐 BlueBubbles）', tokenLabel: 'CLI Path' },
  { key: 'googlechat', label: 'Google Chat', hint: 'Google Chat API，HTTP Webhook', tokenLabel: 'Webhook URL / Service Account' },
  { key: 'irc', label: 'IRC', hint: '经典 IRC 服务器，支持频道和 DM', tokenLabel: 'Server / Nick' },
  { key: 'webchat', label: 'WebChat', hint: 'Gateway 内置 WebChat UI，WebSocket 连接', tokenLabel: 'WebSocket URL' },
  // 插件渠道
  { key: 'line', label: 'LINE', hint: 'LINE Messaging API 机器人（插件）', tokenLabel: 'Channel Access Token' },
  { key: 'matrix', label: 'Matrix', hint: 'Matrix 协议接入（插件）', tokenLabel: 'Access Token' },
  { key: 'mattermost', label: 'Mattermost', hint: 'Bot API + WebSocket，支持频道/群组/DM（插件）', tokenLabel: 'Bot Token' },
  { key: 'msteams', label: 'Microsoft Teams', hint: 'Bot Framework，企业支持（插件）', tokenLabel: 'App ID / Password' },
  { key: 'nextcloudtalk', label: 'Nextcloud Talk', hint: '自托管 Nextcloud Talk，Webhook 接入（插件）', tokenLabel: 'Webhook Token' },
  { key: 'nostr', label: 'Nostr', hint: '去中心化 DM，NIP-04 协议（插件）', tokenLabel: 'Private Key' },
  { key: 'synologychat', label: 'Synology Chat', hint: 'Synology NAS Chat，Webhook 接入（插件）', tokenLabel: 'Webhook URL' },
  { key: 'tlon', label: 'Tlon', hint: 'Urbit 生态消息应用（插件）', tokenLabel: 'Ship Code' },
  { key: 'twitch', label: 'Twitch', hint: 'Twitch 聊天，IRC 连接（插件）', tokenLabel: 'OAuth Token' },
  { key: 'zalo', label: 'Zalo', hint: 'Zalo Bot API，越南流行通讯应用（插件）', tokenLabel: 'API Token' },
  { key: 'zalopersonal', label: 'Zalo Personal', hint: 'Zalo 个人账号，QR 登录（插件）', tokenLabel: 'QR Login' },
];

/**
 * 创建初始渠道配置（懒加载版本）。
 * 初始化时 fields 为空数组，用户启用渠道时再加载完整字段定义。
 */
export const createLazyChannelConfigs = (): import('../types/setup').ChannelConfig[] =>
  channelBaseInfoList.map((base) => ({
    key: base.key,
    label: base.label,
    hint: base.hint,
    tokenLabel: base.tokenLabel,
    enabled: false,
    token: '',
    fieldValues: {},
    testStatus: 'idle' as const,
    fields: [], // 懒加载：初始为空，启用时填充
    cliHint: channelCliHints[base.key],
  }));

/**
 * 为渠道配置填充字段定义（懒加载触发）。
 * 当用户启用渠道时调用此函数加载完整字段定义。
 */
export const loadChannelFields = (
  config: import('../types/setup').ChannelConfig,
): import('../types/setup').ChannelConfig => ({
  ...config,
  fields: getChannelFields(config.key),
});
