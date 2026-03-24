/**
 * Agent 配置加密导入/导出 - 加密引擎纯函数模块
 *
 * 本模块为纯函数模块，不依赖 Electron API 或文件系统，便于单元测试和属性测试。
 * 负责 AES-256-GCM 加密/解密、PBKDF2 密钥派生、.ocagent 二进制文件格式的序列化/反序列化，
 * 以及 Agent 配置数据的收集与敏感信息过滤。
 */

import crypto from 'node:crypto';

// ============================================================================
// 常量定义
// ============================================================================

/** .ocagent 文件魔数标识（8 字节） */
export const OCAGENT_MAGIC = Buffer.from('OCAGENT\0', 'ascii');

/** PBKDF2 密钥派生迭代次数 */
export const PBKDF2_ITERATIONS = 100_000;

/** 盐值长度（字节） */
export const SALT_LENGTH = 32;

/** 初始化向量长度（字节） */
export const IV_LENGTH = 16;

/** AES-GCM 认证标签长度（字节） */
export const AUTH_TAG_LENGTH = 16;

/** 加密密钥长度（字节，256 位） */
export const KEY_LENGTH = 32;

/** 文件头格式版本 */
export const FORMAT_VERSION = 1;

// ============================================================================
// 类型定义
// ============================================================================

/**
 * Agent 配置负载（导出前收集的数据结构）
 */
export interface AgentConfigPayload {
  /** Agent 基本信息 */
  agent: {
    /** Agent 唯一标识 */
    id: string;
    /** Agent 名称 */
    name: string;
    /** 使用的模型配置 */
    model: string | { primary: string; fallbacks?: string[] };
    /** 工作空间路径 */
    workspace: string;
  };
  /** openclaw.json 中该 Agent 的完整条目（已过滤敏感信息） */
  agentEntry: Record<string, unknown>;
  /** workspace 目录下的 markdown 配置文件 */
  workspaceFiles: Record<string, string>;
  /** agent 配置目录下的 models.json 内容 */
  modelsJson?: string;
  /** Agent 使用的 Skills 清单 */
  skills: SkillManifestEntry[];
  /** Agent 的 Channel 绑定模板（不含账户凭证） */
  channelBindings: ChannelBindingTemplate[];
}

/**
 * Skill 清单条目
 */
export interface SkillManifestEntry {
  /** skill 唯一标识 */
  id: string;
  /** skill 名称 */
  name: string;
  /** 来源类型：clawhub 公共 skill 或本地私有 skill */
  source: 'clawhub' | 'private';
  /** 私有 skill 的文件内容（仅 source='private' 时存在） */
  files?: Record<string, string>;
}

/**
 * Channel 绑定模板（不含账户凭证）
 */
export interface ChannelBindingTemplate {
  /** channel 类型名称（如 wechat、telegram） */
  channel: string;
  /** 绑定匹配规则（不含 accountId） */
  matchRules?: Record<string, unknown>;
}

/**
 * .ocagent 文件头信息（未加密部分）
 */
export interface BundleHeader {
  /** 魔数标识 */
  magic: Buffer;
  /** 格式版本号 */
  formatVersion: number;
  /** 导出时间（ISO 8601 格式） */
  exportTime: string;
  /** 应用版本号 */
  appVersion: string;
}

/**
 * 加密参数（存储在文件中）
 */
export interface CryptoParams {
  /** 盐值（32 字节） */
  salt: Buffer;
  /** 初始化向量（16 字节） */
  iv: Buffer;
  /** 认证标签（16 字节） */
  authTag: Buffer;
}

/**
 * 序列化后的 Bundle 结构
 */
export interface SerializedBundle {
  /** 文件头信息 */
  header: BundleHeader;
  /** 加密参数 */
  cryptoParams: CryptoParams;
  /** 加密后的密文 */
  ciphertext: Buffer;
}

/**
 * 导入进度事件
 */
export interface ImportProgress {
  /** 当前步骤编号（1-5） */
  step: number;
  /** 步骤名称 */
  stepName: string;
  /** 步骤状态（含回滚状态） */
  status: 'pending' | 'running' | 'success' | 'failed' | 'rolling-back' | 'rolled-back';
  /** 可选的详细信息（如错误原因、子进度、回滚提示） */
  message?: string;
}

/**
 * 导出历史记录
 */
export interface ExportHistoryRecord {
  /** 唯一标识（UUID） */
  id: string;
  /** Agent ID */
  agentId: string;
  /** Agent 名称 */
  agentName: string;
  /** 导出时间（ISO 8601 格式） */
  exportTime: string;
  /** 导出文件路径 */
  filePath: string;
  /** Passphrase 明文（仅本地存储） */
  passphrase: string;
  /** 文件大小（字节） */
  fileSize: number;
}

// ============================================================================
// 加密核心函数
// ============================================================================

/**
 * 从 Passphrase 派生加密密钥
 *
 * 使用 PBKDF2 算法（sha256）从用户提供的 Passphrase 和随机盐值派生 256 位密钥。
 * 迭代 100000 次以增强暴力破解抵抗能力。
 *
 * @param passphrase - 用户提供的密钥字符串
 * @param salt - 随机盐值（32 字节）
 * @returns 派生的 256 位密钥 Buffer
 */
export function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(passphrase, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');
}

/**
 * 加密 Agent 配置负载
 *
 * 生成随机 salt 和 IV，使用 AES-256-GCM 对 JSON 序列化后的 payload 进行加密。
 * 返回加密参数（salt、IV、authTag）和密文，供后续序列化为 .ocagent 文件使用。
 *
 * @param payload - 待加密的 Agent 配置负载
 * @param passphrase - 用户提供的密钥字符串
 * @returns 包含加密参数和密文的对象
 */
export function encryptPayload(
  payload: AgentConfigPayload,
  passphrase: string,
): { cryptoParams: CryptoParams; ciphertext: Buffer } {
  // 生成随机盐值和初始化向量
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);

  // 从 Passphrase 派生加密密钥
  const key = deriveKey(passphrase, salt);

  // 创建 AES-256-GCM 加密器
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  // 将 payload 序列化为 JSON 字符串后加密
  const jsonStr = JSON.stringify(payload);
  const encrypted = Buffer.concat([
    cipher.update(jsonStr, 'utf8'),
    cipher.final(),
  ]);

  // 获取 GCM 认证标签
  const authTag = cipher.getAuthTag();

  return {
    cryptoParams: { salt, iv, authTag },
    ciphertext: encrypted,
  };
}

/**
 * 解密 Agent 配置负载
 *
 * 使用存储的 salt/IV/authTag 和用户提供的 Passphrase 解密密文，
 * 还原为 AgentConfigPayload 对象。解密失败时抛出错误。
 *
 * @param cryptoParams - 加密参数（salt、IV、authTag）
 * @param ciphertext - 加密后的密文
 * @param passphrase - 用户提供的密钥字符串
 * @returns 解密还原的 Agent 配置负载
 * @throws 当 Passphrase 错误或密文被篡改时抛出解密失败错误
 */
export function decryptPayload(
  cryptoParams: CryptoParams,
  ciphertext: Buffer,
  passphrase: string,
): AgentConfigPayload {
  // 从 Passphrase 派生解密密钥
  const key = deriveKey(passphrase, cryptoParams.salt);

  // 创建 AES-256-GCM 解密器
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, cryptoParams.iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  // 设置认证标签用于完整性验证
  decipher.setAuthTag(cryptoParams.authTag);

  try {
    // 解密密文并还原 JSON 字符串
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    // 将 JSON 字符串解析为 AgentConfigPayload 对象
    return JSON.parse(decrypted.toString('utf8')) as AgentConfigPayload;
  } catch (err) {
    // 解密失败（密钥错误或数据被篡改），抛出明确的错误信息
    throw new Error('解密失败：Passphrase 错误或文件已损坏');
  }
}

// ============================================================================
// 二进制序列化函数
// ============================================================================

/**
 * 将 SerializedBundle 序列化为 .ocagent 二进制格式的 Buffer
 *
 * 按照 .ocagent 文件格式规范依次写入：
 * 1. 魔数标识 "OCAGENT\0"（8 字节）
 * 2. 格式版本号（uint16 BE，2 字节）
 * 3. 导出时间戳长度（uint16 BE，2 字节）+ 导出时间戳（UTF-8 可变长度）
 * 4. 应用版本号长度（uint16 BE，2 字节）+ 应用版本号（UTF-8 可变长度）
 * 5. 盐值（32 字节）+ 初始化向量（16 字节）+ 认证标签（16 字节）
 * 6. 加密密文（可变长度）
 *
 * @param bundle - 包含 header、cryptoParams 和 ciphertext 的 Bundle 结构
 * @returns 序列化后的二进制 Buffer
 */
export function serializeBundle(bundle: SerializedBundle): Buffer {
  const { header, cryptoParams, ciphertext } = bundle;

  // 将导出时间戳和应用版本号编码为 UTF-8 Buffer
  const exportTimeBuf = Buffer.from(header.exportTime, 'utf8');
  const appVersionBuf = Buffer.from(header.appVersion, 'utf8');

  // 计算文件头部分的总长度：魔数(8) + 版本号(2) + 时间戳长度(2) + 时间戳 + 版本号长度(2) + 版本号
  const headerSize = 8 + 2 + 2 + exportTimeBuf.length + 2 + appVersionBuf.length;
  // 加密参数部分的总长度：salt(32) + iv(16) + authTag(16)
  const cryptoSize = SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH;
  // 分配完整的输出 Buffer
  const totalSize = headerSize + cryptoSize + ciphertext.length;
  const buf = Buffer.alloc(totalSize);

  let offset = 0;

  // 写入魔数标识（8 字节）
  OCAGENT_MAGIC.copy(buf, offset);
  offset += 8;

  // 写入格式版本号（uint16 BE）
  buf.writeUInt16BE(header.formatVersion, offset);
  offset += 2;

  // 写入导出时间戳长度（uint16 BE）+ 时间戳内容（UTF-8）
  buf.writeUInt16BE(exportTimeBuf.length, offset);
  offset += 2;
  exportTimeBuf.copy(buf, offset);
  offset += exportTimeBuf.length;

  // 写入应用版本号长度（uint16 BE）+ 版本号内容（UTF-8）
  buf.writeUInt16BE(appVersionBuf.length, offset);
  offset += 2;
  appVersionBuf.copy(buf, offset);
  offset += appVersionBuf.length;

  // 写入加密参数：salt（32 字节）
  cryptoParams.salt.copy(buf, offset);
  offset += SALT_LENGTH;

  // 写入加密参数：IV（16 字节）
  cryptoParams.iv.copy(buf, offset);
  offset += IV_LENGTH;

  // 写入加密参数：authTag（16 字节）
  cryptoParams.authTag.copy(buf, offset);
  offset += AUTH_TAG_LENGTH;

  // 写入加密密文（剩余部分）
  ciphertext.copy(buf, offset);

  return buf;
}

/**
 * 从二进制 Buffer 反序列化还原 SerializedBundle
 *
 * 按照 .ocagent 文件格式规范依次读取各字段，验证魔数标识后
 * 解析 header、cryptoParams 和 ciphertext。
 *
 * @param buffer - .ocagent 文件的二进制内容
 * @returns 还原的 SerializedBundle 结构
 * @throws 当魔数标识不匹配或 Buffer 长度不足时抛出错误
 */
export function deserializeBundle(buffer: Buffer): SerializedBundle {
  let offset = 0;

  // 验证最小长度：魔数(8) + 版本号(2) + 时间戳长度(2) + 版本号长度(2) + salt(32) + iv(16) + authTag(16) = 78
  const minLength = 8 + 2 + 2 + 2 + SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH;
  if (buffer.length < minLength) {
    throw new Error('文件格式无效：数据长度不足');
  }

  // 读取并验证魔数标识（8 字节）
  const magic = buffer.subarray(offset, offset + 8);
  if (!magic.equals(OCAGENT_MAGIC)) {
    throw new Error('文件格式无效：魔数标识不匹配');
  }
  offset += 8;

  // 读取格式版本号（uint16 BE）
  const formatVersion = buffer.readUInt16BE(offset);
  offset += 2;

  // 读取导出时间戳长度（uint16 BE）+ 时间戳内容（UTF-8）
  const exportTimeLen = buffer.readUInt16BE(offset);
  offset += 2;
  if (buffer.length < offset + exportTimeLen) {
    throw new Error('文件格式无效：导出时间戳数据不完整');
  }
  const exportTime = buffer.subarray(offset, offset + exportTimeLen).toString('utf8');
  offset += exportTimeLen;

  // 读取应用版本号长度（uint16 BE）+ 版本号内容（UTF-8）
  if (buffer.length < offset + 2) {
    throw new Error('文件格式无效：应用版本号长度字段缺失');
  }
  const appVersionLen = buffer.readUInt16BE(offset);
  offset += 2;
  if (buffer.length < offset + appVersionLen) {
    throw new Error('文件格式无效：应用版本号数据不完整');
  }
  const appVersion = buffer.subarray(offset, offset + appVersionLen).toString('utf8');
  offset += appVersionLen;

  // 验证剩余长度是否足够读取加密参数
  const cryptoSize = SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH;
  if (buffer.length < offset + cryptoSize) {
    throw new Error('文件格式无效：加密参数数据不完整');
  }

  // 读取加密参数：salt（32 字节）
  const salt = Buffer.from(buffer.subarray(offset, offset + SALT_LENGTH));
  offset += SALT_LENGTH;

  // 读取加密参数：IV（16 字节）
  const iv = Buffer.from(buffer.subarray(offset, offset + IV_LENGTH));
  offset += IV_LENGTH;

  // 读取加密参数：authTag（16 字节）
  const authTag = Buffer.from(buffer.subarray(offset, offset + AUTH_TAG_LENGTH));
  offset += AUTH_TAG_LENGTH;

  // 读取加密密文（剩余全部数据）
  const ciphertext = Buffer.from(buffer.subarray(offset));

  return {
    header: {
      magic: Buffer.from(magic),
      formatVersion,
      exportTime,
      appVersion,
    },
    cryptoParams: { salt, iv, authTag },
    ciphertext,
  };
}

/**
 * 仅解析 .ocagent 文件的头部信息（不需要 Passphrase）
 *
 * 验证魔数标识后读取格式版本号、导出时间戳和应用版本号。
 * 用于在解密前快速预览文件元信息。
 *
 * @param buffer - .ocagent 文件的二进制内容
 * @returns 文件头信息（BundleHeader）
 * @throws 当魔数标识不匹配或 Buffer 长度不足时抛出错误
 */
export function parseHeader(buffer: Buffer): BundleHeader {
  let offset = 0;

  // 验证最小长度：魔数(8) + 版本号(2) + 时间戳长度(2) = 12
  if (buffer.length < 12) {
    throw new Error('文件格式无效：数据长度不足');
  }

  // 读取并验证魔数标识（8 字节）
  const magic = buffer.subarray(offset, offset + 8);
  if (!magic.equals(OCAGENT_MAGIC)) {
    throw new Error('文件格式无效：魔数标识不匹配');
  }
  offset += 8;

  // 读取格式版本号（uint16 BE）
  const formatVersion = buffer.readUInt16BE(offset);
  offset += 2;

  // 读取导出时间戳长度（uint16 BE）+ 时间戳内容（UTF-8）
  const exportTimeLen = buffer.readUInt16BE(offset);
  offset += 2;
  if (buffer.length < offset + exportTimeLen) {
    throw new Error('文件格式无效：导出时间戳数据不完整');
  }
  const exportTime = buffer.subarray(offset, offset + exportTimeLen).toString('utf8');
  offset += exportTimeLen;

  // 读取应用版本号长度（uint16 BE）+ 版本号内容（UTF-8）
  if (buffer.length < offset + 2) {
    throw new Error('文件格式无效：应用版本号长度字段缺失');
  }
  const appVersionLen = buffer.readUInt16BE(offset);
  offset += 2;
  if (buffer.length < offset + appVersionLen) {
    throw new Error('文件格式无效：应用版本号数据不完整');
  }
  const appVersion = buffer.subarray(offset, offset + appVersionLen).toString('utf8');

  return {
    magic: Buffer.from(magic),
    formatVersion,
    exportTime,
    appVersion,
  };
}

// ============================================================================
// 辅助函数
// ============================================================================

/** 敏感字段关键词列表（小写），匹配时不区分大小写 */
const SENSITIVE_KEYS = ['token', 'apikey', 'api_key', 'secret', 'password', 'webhook'];

/**
 * 验证 Passphrase 强度（至少 8 个字符）
 *
 * @param passphrase - 用户输入的密钥字符串
 * @returns 验证结果，valid 为 true 表示通过，否则包含 error 描述
 */
export function validatePassphrase(passphrase: string): { valid: boolean; error?: string } {
  if (passphrase.length >= 8) {
    return { valid: true };
  }
  return { valid: false, error: '密钥长度至少为 8 个字符' };
}

/**
 * 过滤 Agent 配置中的敏感字段
 *
 * 递归遍历对象，移除键名包含 token/apiKey/api_key/secret/password/webhook 的字段（不区分大小写）。
 * 对嵌套对象递归处理，对数组中的每个元素递归处理。不修改原始对象，返回新对象。
 *
 * @param agentEntry - 待过滤的 Agent 配置对象
 * @returns 过滤敏感字段后的新对象
 */
export function stripSensitiveFields(agentEntry: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(agentEntry)) {
    // 检查键名是否包含敏感关键词（不区分大小写）
    const lowerKey = key.toLowerCase();
    const isSensitive = SENSITIVE_KEYS.some((sk) => lowerKey.includes(sk));
    if (isSensitive) {
      continue; // 跳过敏感字段
    }

    // 递归处理嵌套值
    result[key] = stripValue(value);
  }

  return result;
}

/**
 * 递归处理单个值，过滤其中的敏感字段
 *
 * @param value - 待处理的值
 * @returns 过滤后的值
 */
function stripValue(value: unknown): unknown {
  // 数组：递归处理每个元素
  if (Array.isArray(value)) {
    return value.map((item) => stripValue(item));
  }

  // 普通对象：递归调用 stripSensitiveFields
  if (value !== null && typeof value === 'object') {
    return stripSensitiveFields(value as Record<string, unknown>);
  }

  // 基本类型：直接返回
  return value;
}

/**
 * 解决 Agent 名称冲突（追加数字后缀）
 *
 * 如果名称不在已有名称列表中，直接返回原名称。
 * 否则从 2 开始递增后缀，直到找到不冲突的名称（如 my-agent-2、my-agent-3）。
 *
 * @param name - 期望的 Agent 名称
 * @param existingNames - 已存在的 Agent 名称列表
 * @returns 不冲突的 Agent 名称
 */
export function resolveAgentName(name: string, existingNames: string[]): string {
  // 使用 Set 加速查找
  const nameSet = new Set(existingNames);

  // 名称不冲突，直接返回
  if (!nameSet.has(name)) {
    return name;
  }

  // 从 2 开始递增后缀，直到找到不冲突的名称
  let suffix = 2;
  while (nameSet.has(`${name}-${suffix}`)) {
    suffix++;
  }

  return `${name}-${suffix}`;
}

/**
 * 从 Agent 的 bindings 中提取 Channel 绑定模板
 *
 * 从 openclaw.json 的 bindings 数组中筛选属于指定 Agent 的绑定条目，
 * 仅保留 channel 类型名称和非敏感匹配规则，移除 accountId 和凭证信息。
 *
 * @param bindings - openclaw.json 中的 bindings 数组
 * @param agentId - 目标 Agent 的唯一标识
 * @returns 过滤后的 Channel 绑定模板数组
 */
export function extractChannelBindings(bindings: any[], agentId: string): ChannelBindingTemplate[] {
  // 参数校验：bindings 必须为数组
  if (!Array.isArray(bindings)) {
    return [];
  }

  return bindings
    // 筛选属于该 Agent 的绑定条目
    .filter((binding) => binding && binding.agentId === agentId)
    .map((binding) => {
      // 提取 channel 类型名称
      const match = binding.match || {};
      const channel: string = match.channel || '';

      // 复制匹配规则，移除 accountId 和敏感字段
      const rawRules = { ...match };
      delete rawRules.channel;    // channel 已单独提取
      delete rawRules.accountId;  // 移除账户 ID

      // 使用 stripSensitiveFields 过滤剩余规则中的敏感信息
      const matchRules = Object.keys(rawRules).length > 0
        ? stripSensitiveFields(rawRules as Record<string, unknown>)
        : undefined;

      const template: ChannelBindingTemplate = { channel };
      // 仅在存在非空匹配规则时添加 matchRules 字段
      if (matchRules && Object.keys(matchRules).length > 0) {
        template.matchRules = matchRules;
      }

      return template;
    });
}

/**
 * 收集 Agent 使用的 Skills 清单
 *
 * 从 TOOLS.md 内容和已安装 skills 列表中匹配该 Agent 使用的 skills，
 * 区分 clawhub 公共 skill（仅记录 ID）和私有 skill（标记来源，文件由 IPC 层收集）。
 *
 * @param agentToolsMd - Agent workspace 下 TOOLS.md 文件的内容（可能为 undefined）
 * @param installedSkills - 已安装的 skills 列表，每项包含 id、name 和可选的 path
 * @returns Skill 清单条目数组
 */
export function collectSkillManifest(
  agentToolsMd: string | undefined,
  installedSkills: Array<{ id: string; name: string; path?: string }>,
): SkillManifestEntry[] {
  // 如果没有 TOOLS.md 内容或没有已安装 skills，返回空数组
  if (!agentToolsMd || !installedSkills || installedSkills.length === 0) {
    return [];
  }

  const result: SkillManifestEntry[] = [];

  for (const skill of installedSkills) {
    // 检查 TOOLS.md 中是否引用了该 skill（通过 ID 或名称匹配）
    const isReferenced =
      agentToolsMd.includes(skill.id) ||
      agentToolsMd.includes(skill.name);

    if (!isReferenced) {
      continue; // 该 skill 未被 Agent 使用，跳过
    }

    // 判断 skill 来源：有本地路径的为私有 skill，否则为 clawhub 公共 skill
    const source: 'clawhub' | 'private' = skill.path ? 'private' : 'clawhub';

    const entry: SkillManifestEntry = {
      id: skill.id,
      name: skill.name,
      source,
    };
    // 注意：私有 skill 的 files 字段由 IPC 层负责收集，此处不填充

    result.push(entry);
  }

  return result;
}

// ============================================================================
// Bug 修复相关纯函数（Stub 版本 — 尚未实现真正逻辑）
// ============================================================================

/** 需要从 agentEntry 中移除的路径字段列表 */
export const PATH_FIELDS_TO_STRIP = [
  'workspace',
  'workspaceRoot',
  'workspaceDir',
  'agentDir',
  'agentConfigRoot',
  'configSource',
] as const;

/**
 * 移除 agentEntry 中的平台特定路径字段
 *
 * 从 agentEntry 对象中移除 workspace、workspaceRoot、workspaceDir、
 * agentDir、agentConfigRoot、configSource 等路径字段，
 * 确保导出的配置不包含源机器的绝对路径。
 *
 * @param agentEntry - 待清理的 Agent 配置条目
 * @returns 移除路径字段后的新对象（不修改原始对象）
 */
export function stripPathFields(agentEntry: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const fieldsToStrip = new Set<string>(PATH_FIELDS_TO_STRIP);

  for (const [key, value] of Object.entries(agentEntry)) {
    if (!fieldsToStrip.has(key)) {
      result[key] = value;
    }
  }

  return result;
}

/**
 * 清理 modelsJson 字符串中的绝对路径引用
 *
 * 使用正则表达式检测并移除 modelsJson 中的绝对路径引用，
 * 匹配 Unix 风格（/Users/...、/home/...、/var/...、/opt/...、/tmp/...）
 * 和 Windows 风格（C:\...、D:\... 等）路径。
 * 将匹配到的绝对路径值替换为空字符串。
 *
 * @param modelsJson - 待清理的 modelsJson 字符串，可能为 undefined
 * @returns 清理后的字符串；输入为 undefined 时返回 undefined
 */
export function sanitizeModelsJson(modelsJson: string | undefined): string | undefined {
  if (modelsJson === undefined) return undefined;

  // 匹配 JSON 字符串值中的绝对路径（Unix 和 Windows 风格）
  // Unix: /Users/xxx, /home/xxx, /var/xxx, /opt/xxx, /tmp/xxx
  // Windows: C:\xxx, D:\xxx 等（在 JSON 中反斜杠被转义为 \\）
  const absolutePathInJsonRegex = /(?:\/(?:Users|home|var|opt|tmp)\/[^\s"',}]+)|(?:[A-Z]:\\\\[^\s"',}]+)|(?:[A-Z]:\\[^\s"',}]+)/g;

  return modelsJson.replace(absolutePathInJsonRegex, '');
}

/**
 * 对 passphrase 进行 Base64 混淆编码
 *
 * 使用 Base64 编码对 passphrase 进行基础混淆处理，
 * 避免在 electron-store 中以明文形式存储。
 * 注意：这不是加密，仅为基础混淆以防止直接读取。
 *
 * @param passphrase - 原始明文 passphrase
 * @returns Base64 编码后的混淆字符串
 */
export function obfuscatePassphrase(passphrase: string): string {
  return Buffer.from(passphrase, 'utf8').toString('base64');
}

/**
 * 对混淆后的 passphrase 进行 Base64 解码还原
 *
 * 将 Base64 编码的混淆字符串解码还原为原始明文 passphrase。
 *
 * @param obfuscated - Base64 编码的混淆字符串
 * @returns 还原后的原始明文 passphrase
 */
export function deobfuscatePassphrase(obfuscated: string): string {
  return Buffer.from(obfuscated, 'base64').toString('utf8');
}

/**
 * 创建导出历史记录
 *
 * 生成唯一 UUID、记录当前时间戳，组装完整的 ExportHistoryRecord 对象。
 * 用于导出成功后保存到 electron-store 中。
 *
 * @param agentId - Agent 唯一标识
 * @param agentName - Agent 名称
 * @param filePath - 导出文件的保存路径
 * @param passphrase - 用户设置的加密密钥（明文，仅本地存储）
 * @param fileSize - 导出文件大小（字节）
 * @returns 完整的导出历史记录对象
 */
export function createExportHistoryRecord(
  agentId: string,
  agentName: string,
  filePath: string,
  passphrase: string,
  fileSize: number,
): ExportHistoryRecord {
  return {
    id: crypto.randomUUID(),
    agentId,
    agentName,
    exportTime: new Date().toISOString(),
    filePath,
    passphrase: obfuscatePassphrase(passphrase),
    fileSize,
  };
}
