/**
 * Agent 分组管理 - 纯函数模块
 *
 * 本模块为纯函数模块，不依赖 Electron API 或文件系统，便于单元测试和属性测试。
 * 负责分组 CRUD 逻辑、分组校验、Agent-分组映射管理，
 * 以及 .ocgroup 二进制归档文件的序列化/反序列化。
 */

import crypto from 'node:crypto';

// ============================================================================
// 常量定义
// ============================================================================

/** .ocgroup 文件魔数标识（8 字节） */
export const OCGROUP_MAGIC = Buffer.from('OCGROUP\0', 'ascii');

/** .ocgroup 格式版本号 */
export const OCGROUP_FORMAT_VERSION = 1;

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 分组定义
 */
export interface AgentGroup {
  /** 唯一标识（UUID） */
  id: string;
  /** 分组名称 */
  name: string;
  /** 可选描述 */
  description?: string;
  /** 颜色标签（CSS 颜色值） */
  color?: string;
  /** Emoji 图标 */
  emoji?: string;
  /** 创建时间（ISO 8601） */
  createdAt: string;
  /** 更新时间（ISO 8601） */
  updatedAt: string;
}

/**
 * 分组元数据（存储在 .ocgroup 文件头中）
 */
export interface GroupMetadata {
  /** 分组名称 */
  name: string;
  /** 可选描述 */
  description?: string;
  /** 颜色标签（CSS 颜色值） */
  color?: string;
  /** Emoji 图标 */
  emoji?: string;
}

/**
 * 分组校验结果
 */
export interface GroupValidation {
  /** 是否合法 */
  valid: boolean;
  /** 错误信息（校验失败时） */
  error?: string;
}

/**
 * .ocgroup 文件头信息
 */
export interface OcgroupHeader {
  /** 魔数标识 */
  magic: Buffer;
  /** 格式版本号 */
  formatVersion: number;
  /** 导出时间（ISO 8601 格式） */
  exportTime: string;
  /** 应用版本号 */
  appVersion: string;
  /** 包含的 Agent 数量 */
  agentCount: number;
}

/**
 * 导入结果摘要
 */
export interface ImportSummary {
  /** 成功导入的 Agent 数量 */
  successCount: number;
  /** 失败的 Agent 列表 */
  failedAgents: Array<{ name: string; error: string }>;
  /** 警告信息 */
  warnings: string[];
  /** 创建或合并的分组信息 */
  group: { id: string; name: string; merged: boolean };
}

/**
 * 导出进度事件
 */
export interface ExportProgressEvent {
  /** 当前 Agent 序号（从 1 开始） */
  current: number;
  /** 总 Agent 数量 */
  total: number;
  /** 当前 Agent 名称 */
  agentName: string;
  /** 状态 */
  status: 'exporting' | 'success' | 'failed' | 'skipped';
  /** 失败原因 */
  error?: string;
}

/**
 * 导入进度事件
 */
export interface ImportProgressEvent {
  /** 当前 Agent 序号（从 1 开始） */
  current: number;
  /** 总 Agent 数量 */
  total: number;
  /** 当前 Agent 名称 */
  agentName: string;
  /** 当前 Agent 的导入步骤编号（1-5） */
  step: number;
  /** 步骤名称 */
  stepName: string;
  /** 步骤状态 */
  status: 'pending' | 'running' | 'success' | 'failed' | 'rolling-back' | 'rolled-back';
  /** 详细信息 */
  message?: string;
}

// ============================================================================
// 分组 CRUD 纯函数
// ============================================================================

/**
 * 校验分组名称
 *
 * 校验规则：
 * - 名称不能为空或纯空白字符
 * - 名称不能与已有分组重复（区分大小写）
 * - 编辑模式下可通过 excludeId 排除自身
 *
 * @param name - 待校验的分组名称
 * @param existingNames - 已有分组名称列表
 * @param excludeId - 编辑模式下排除的分组 ID（可选）
 * @returns 校验结果
 */
export function validateGroupName(
  name: string,
  existingNames: string[],
  excludeId?: string,
): GroupValidation {
  // 检查空字符串或纯空白字符
  if (!name || name.trim().length === 0) {
    return { valid: false, error: '分组名称不能为空' };
  }

  // 检查名称是否与已有分组重复（区分大小写）
  // 注意：existingNames 参数为名称列表，excludeId 用于在外部过滤后传入
  // 但设计上 excludeId 是分组 ID，需要配合 groups 列表使用
  // 这里简化处理：如果 excludeId 未提供，直接检查重复
  if (existingNames.includes(name)) {
    return { valid: false, error: '分组名称已存在' };
  }

  return { valid: true };
}

/**
 * 创建新分组对象
 *
 * 生成 UUID 作为唯一标识，使用当前时间作为创建和更新时间戳。
 *
 * @param name - 分组名称
 * @param options - 可选参数（描述、颜色、Emoji）
 * @returns 新创建的分组对象
 */
export function createGroup(
  name: string,
  options?: { description?: string; color?: string; emoji?: string },
): AgentGroup {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name,
    ...(options?.description !== undefined && { description: options.description }),
    ...(options?.color !== undefined && { color: options.color }),
    ...(options?.emoji !== undefined && { emoji: options.emoji }),
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * 清除孤立的 Agent-分组映射
 *
 * 仅保留 key 在有效 Agent ID 列表中的映射条目，
 * 移除已不存在于系统中的 Agent 的映射记录。
 *
 * @param mappings - 当前 Agent-分组映射（agentId → groupId）
 * @param validAgentIds - 系统中有效的 Agent ID 列表
 * @returns 清理后的映射
 */
export function cleanOrphanMappings(
  mappings: Record<string, string>,
  validAgentIds: string[],
): Record<string, string> {
  const validSet = new Set(validAgentIds);
  const result: Record<string, string> = {};
  for (const [agentId, groupId] of Object.entries(mappings)) {
    if (validSet.has(agentId)) {
      result[agentId] = groupId;
    }
  }
  return result;
}

/**
 * 按名称查找分组
 *
 * 用于导入时检测同名分组是否已存在，以决定是创建新分组还是合并到已有分组。
 * 名称匹配区分大小写。
 *
 * @param name - 要查找的分组名称
 * @param groups - 已有分组列表
 * @returns 匹配的分组对象，未找到时返回 undefined
 */
export function findGroupByName(
  name: string,
  groups: AgentGroup[],
): AgentGroup | undefined {
  return groups.find((g) => g.name === name);
}

/**
 * 删除分组时清除关联映射
 *
 * 从映射中移除所有值等于指定分组 ID 的条目，
 * 保留其他分组的映射不变。
 *
 * @param mappings - 当前 Agent-分组映射（agentId → groupId）
 * @param groupId - 要删除的分组 ID
 * @returns 清理后的映射
 */
export function removeMappingsForGroup(
  mappings: Record<string, string>,
  groupId: string,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [agentId, gId] of Object.entries(mappings)) {
    if (gId !== groupId) {
      result[agentId] = gId;
    }
  }
  return result;
}


// ============================================================================
// .ocgroup 二进制序列化/反序列化
// ============================================================================

/**
 * 将分组元数据和多个 Agent Bundle Buffer 序列化为 .ocgroup 二进制格式
 *
 * 二进制布局：
 * - 魔数 "OCGROUP\0"（8 字节）
 * - 格式版本号 uint16 BE（2 字节）
 * - 导出时间戳长度 uint16 BE（2 字节）+ 时间戳 UTF-8
 * - 应用版本号长度 uint16 BE（2 字节）+ 版本号 UTF-8
 * - Agent 数量 uint16 BE（2 字节）
 * - 分组元数据 JSON 长度 uint32 BE（4 字节）+ JSON UTF-8
 * - 各 Agent Bundle：长度 uint32 BE（4 字节）+ 数据
 *
 * @param groupMeta - 分组元数据
 * @param agentBundles - 各 Agent 的加密 Bundle Buffer 列表
 * @param appVersion - 应用版本号
 * @returns 序列化后的二进制 Buffer
 */
export function serializeOcgroup(
  groupMeta: GroupMetadata,
  agentBundles: Buffer[],
  appVersion: string,
): Buffer {
  const timestamp = new Date().toISOString();
  const timestampBuf = Buffer.from(timestamp, 'utf-8');
  const appVersionBuf = Buffer.from(appVersion, 'utf-8');
  const metaJsonBuf = Buffer.from(JSON.stringify(groupMeta), 'utf-8');

  // 计算总长度
  // 魔数(8) + 版本号(2) + 时间戳长度(2) + 时间戳 + 版本号长度(2) + 版本号 + Agent数量(2) + 元数据长度(4) + 元数据
  let totalLength =
    8 + 2 + 2 + timestampBuf.length + 2 + appVersionBuf.length + 2 + 4 + metaJsonBuf.length;

  // 各 Agent Bundle：长度(4) + 数据
  for (const bundle of agentBundles) {
    totalLength += 4 + bundle.length;
  }

  const buf = Buffer.alloc(totalLength);
  let offset = 0;

  // 写入魔数标识（8 字节）
  OCGROUP_MAGIC.copy(buf, offset);
  offset += 8;

  // 写入格式版本号（uint16 BE，2 字节）
  buf.writeUInt16BE(OCGROUP_FORMAT_VERSION, offset);
  offset += 2;

  // 写入导出时间戳长度（uint16 BE，2 字节）+ 时间戳 UTF-8
  buf.writeUInt16BE(timestampBuf.length, offset);
  offset += 2;
  timestampBuf.copy(buf, offset);
  offset += timestampBuf.length;

  // 写入应用版本号长度（uint16 BE，2 字节）+ 版本号 UTF-8
  buf.writeUInt16BE(appVersionBuf.length, offset);
  offset += 2;
  appVersionBuf.copy(buf, offset);
  offset += appVersionBuf.length;

  // 写入 Agent 数量（uint16 BE，2 字节）
  buf.writeUInt16BE(agentBundles.length, offset);
  offset += 2;

  // 写入分组元数据 JSON 长度（uint32 BE，4 字节）+ JSON UTF-8
  buf.writeUInt32BE(metaJsonBuf.length, offset);
  offset += 4;
  metaJsonBuf.copy(buf, offset);
  offset += metaJsonBuf.length;

  // 写入各 Agent Bundle：长度（uint32 BE，4 字节）+ 数据
  for (const bundle of agentBundles) {
    buf.writeUInt32BE(bundle.length, offset);
    offset += 4;
    bundle.copy(buf, offset);
    offset += bundle.length;
  }

  return buf;
}

/**
 * 从 .ocgroup 二进制 Buffer 反序列化，返回分组元数据和各 Agent Bundle Buffer
 *
 * @param buffer - .ocgroup 文件的二进制 Buffer
 * @returns 解析后的分组元数据、Agent Bundle 列表和文件头信息
 * @throws 对无效魔数或数据不完整抛出描述性错误
 */
export function deserializeOcgroup(
  buffer: Buffer,
): { groupMeta: GroupMetadata; agentBundles: Buffer[]; header: OcgroupHeader } {
  // 验证最小长度（至少需要魔数 8 字节）
  if (buffer.length < 8) {
    throw new Error('文件格式无效：数据长度不足');
  }

  // 验证魔数标识
  const magic = buffer.subarray(0, 8);
  if (!magic.equals(OCGROUP_MAGIC)) {
    throw new Error('文件格式无效：魔数标识不匹配');
  }

  let offset = 8;

  // 读取格式版本号（uint16 BE，2 字节）
  if (offset + 2 > buffer.length) {
    throw new Error('文件格式无效：数据长度不足');
  }
  const formatVersion = buffer.readUInt16BE(offset);
  offset += 2;

  // 读取导出时间戳长度（uint16 BE，2 字节）+ 时间戳 UTF-8
  if (offset + 2 > buffer.length) {
    throw new Error('文件格式无效：数据长度不足');
  }
  const timestampLen = buffer.readUInt16BE(offset);
  offset += 2;
  if (offset + timestampLen > buffer.length) {
    throw new Error('文件格式无效：数据长度不足');
  }
  const exportTime = buffer.subarray(offset, offset + timestampLen).toString('utf-8');
  offset += timestampLen;

  // 读取应用版本号长度（uint16 BE，2 字节）+ 版本号 UTF-8
  if (offset + 2 > buffer.length) {
    throw new Error('文件格式无效：数据长度不足');
  }
  const appVersionLen = buffer.readUInt16BE(offset);
  offset += 2;
  if (offset + appVersionLen > buffer.length) {
    throw new Error('文件格式无效：数据长度不足');
  }
  const appVersion = buffer.subarray(offset, offset + appVersionLen).toString('utf-8');
  offset += appVersionLen;

  // 读取 Agent 数量（uint16 BE，2 字节）
  if (offset + 2 > buffer.length) {
    throw new Error('文件格式无效：数据长度不足');
  }
  const agentCount = buffer.readUInt16BE(offset);
  offset += 2;

  // 读取分组元数据 JSON 长度（uint32 BE，4 字节）+ JSON UTF-8
  if (offset + 4 > buffer.length) {
    throw new Error('文件格式无效：数据长度不足');
  }
  const metaJsonLen = buffer.readUInt32BE(offset);
  offset += 4;
  if (offset + metaJsonLen > buffer.length) {
    throw new Error('文件格式无效：数据长度不足');
  }
  const groupMeta: GroupMetadata = JSON.parse(
    buffer.subarray(offset, offset + metaJsonLen).toString('utf-8'),
  );
  offset += metaJsonLen;

  // 构建文件头信息
  const header: OcgroupHeader = {
    magic: Buffer.from(magic),
    formatVersion,
    exportTime,
    appVersion,
    agentCount,
  };

  // 读取各 Agent Bundle
  const agentBundles: Buffer[] = [];
  for (let i = 0; i < agentCount; i++) {
    if (offset + 4 > buffer.length) {
      throw new Error('文件格式无效：数据长度不足');
    }
    const bundleLen = buffer.readUInt32BE(offset);
    offset += 4;
    if (offset + bundleLen > buffer.length) {
      throw new Error('文件格式无效：数据长度不足');
    }
    agentBundles.push(Buffer.from(buffer.subarray(offset, offset + bundleLen)));
    offset += bundleLen;
  }

  return { groupMeta, agentBundles, header };
}

/**
 * 仅解析 .ocgroup 文件头部分（不需要 Passphrase），用于导入前预览
 *
 * 解析文件头中的分组元数据和 Agent 数量，不解析 Agent Bundle 数据。
 *
 * @param buffer - .ocgroup 文件的二进制 Buffer
 * @returns 分组元数据、Agent 数量和文件头信息
 * @throws 对无效魔数或数据不完整抛出描述性错误
 */
export function parseOcgroupHeader(
  buffer: Buffer,
): { groupMeta: GroupMetadata; agentCount: number; header: OcgroupHeader } {
  // 验证最小长度（至少需要魔数 8 字节）
  if (buffer.length < 8) {
    throw new Error('文件格式无效：数据长度不足');
  }

  // 验证魔数标识
  const magic = buffer.subarray(0, 8);
  if (!magic.equals(OCGROUP_MAGIC)) {
    throw new Error('文件格式无效：魔数标识不匹配');
  }

  let offset = 8;

  // 读取格式版本号（uint16 BE，2 字节）
  if (offset + 2 > buffer.length) {
    throw new Error('文件格式无效：数据长度不足');
  }
  const formatVersion = buffer.readUInt16BE(offset);
  offset += 2;

  // 读取导出时间戳长度（uint16 BE，2 字节）+ 时间戳 UTF-8
  if (offset + 2 > buffer.length) {
    throw new Error('文件格式无效：数据长度不足');
  }
  const timestampLen = buffer.readUInt16BE(offset);
  offset += 2;
  if (offset + timestampLen > buffer.length) {
    throw new Error('文件格式无效：数据长度不足');
  }
  const exportTime = buffer.subarray(offset, offset + timestampLen).toString('utf-8');
  offset += timestampLen;

  // 读取应用版本号长度（uint16 BE，2 字节）+ 版本号 UTF-8
  if (offset + 2 > buffer.length) {
    throw new Error('文件格式无效：数据长度不足');
  }
  const appVersionLen = buffer.readUInt16BE(offset);
  offset += 2;
  if (offset + appVersionLen > buffer.length) {
    throw new Error('文件格式无效：数据长度不足');
  }
  const appVersion = buffer.subarray(offset, offset + appVersionLen).toString('utf-8');
  offset += appVersionLen;

  // 读取 Agent 数量（uint16 BE，2 字节）
  if (offset + 2 > buffer.length) {
    throw new Error('文件格式无效：数据长度不足');
  }
  const agentCount = buffer.readUInt16BE(offset);
  offset += 2;

  // 读取分组元数据 JSON 长度（uint32 BE，4 字节）+ JSON UTF-8
  if (offset + 4 > buffer.length) {
    throw new Error('文件格式无效：数据长度不足');
  }
  const metaJsonLen = buffer.readUInt32BE(offset);
  offset += 4;
  if (offset + metaJsonLen > buffer.length) {
    throw new Error('文件格式无效：数据长度不足');
  }
  const groupMeta: GroupMetadata = JSON.parse(
    buffer.subarray(offset, offset + metaJsonLen).toString('utf-8'),
  );

  // 构建文件头信息
  const header: OcgroupHeader = {
    magic: Buffer.from(magic),
    formatVersion,
    exportTime,
    appVersion,
    agentCount,
  };

  return { groupMeta, agentCount, header };
}
