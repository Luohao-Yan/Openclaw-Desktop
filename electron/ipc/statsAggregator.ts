/**
 * Stats_Aggregator — 会话历史统计聚合模块
 *
 * 纯函数模块，从 Agent 的 sessions 目录中读取 JSONL transcript 文件，
 * 按日期聚合 Token 消耗、会话量、平均响应时间、错误率等指标。
 * 除文件读取外无副作用，便于单元测试和属性测试。
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

// ============================================================================
// 接口定义
// ============================================================================

/** 单条 JSONL 行的解析结果 */
export interface TranscriptEntry {
  /** 消息类型：'message' | 'error' | 其他 */
  type: string;
  /** 角色：'user' | 'assistant' | 'system' */
  role: string;
  /** 消息文本内容 */
  content: string;
  /** ISO 8601 时间戳 */
  timestamp: string;
  /** usage.total_tokens，可能不存在 */
  totalTokens: number | null;
  /** 消息内容长度（用于 token 估算） */
  contentLength: number;
}

/** 单日统计数据 */
export interface DailyStats {
  /** 日期字符串 'YYYY-MM-DD' */
  date: string;
  /** 当日 Token 消耗总量 */
  tokenUsage: number;
  /** Token 数据是否为估算值（true = 无真实 usage 数据，按字符数估算） */
  tokenEstimated: boolean;
  /** 当日活跃会话数量 */
  sessionCount: number;
  /** 当日平均响应时间（毫秒） */
  avgResponseMs: number;
  /** 当日错误率（百分比 0-100） */
  errorRate: number;
}

/** 聚合结果：包含每日统计和独立会话总数 */
export interface AggregateResult {
  /** 按日期升序排列的每日统计数组 */
  dailyStats: DailyStats[];
  /** 独立会话总数（从 sessions.json 获取，不重复计数） */
  totalSessions: number;
}

// ============================================================================
// 核心函数
// ============================================================================

/**
 * 解析单个 JSONL transcript 文件
 *
 * 逐行读取文件内容，将每行解析为 JSON 对象，提取关键字段。
 * 无效行（空行、JSON 解析失败、时间戳无效）会被静默跳过。
 *
 * @param filePath - JSONL 文件的绝对路径
 * @returns 解析后的 TranscriptEntry 数组
 */
export function parseTranscriptFile(filePath: string): TranscriptEntry[] {
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf-8');
  } catch {
    // 文件读取失败，返回空数组
    return [];
  }

  const lines = raw.split('\n');
  const entries: TranscriptEntry[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let parsed: any;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      // JSON 解析失败，跳过该行
      continue;
    }

    // 提取时间戳并验证有效性
    const timestamp = parsed.timestamp;
    if (!timestamp || typeof timestamp !== 'string') continue;
    const ts = new Date(timestamp);
    if (isNaN(ts.getTime())) continue;

    // 提取各字段，缺失时使用默认值
    const type = typeof parsed.type === 'string' ? parsed.type : '';
    const role = parsed.message?.role ?? '';

    // content 可能是字符串或 [{type:'text', text:'...'}] 数组
    const rawContent = parsed.message?.content;
    let content = '';
    if (typeof rawContent === 'string') {
      content = rawContent;
    } else if (Array.isArray(rawContent)) {
      // 提取数组中所有 text 块的文本内容
      content = rawContent
        .filter((item: any) => item?.type === 'text' && item?.text)
        .map((item: any) => item.text as string)
        .join('\n');
    }

    const totalTokens =
      parsed.usage?.total_tokens != null
        ? Number(parsed.usage.total_tokens)
        : null;
    const contentLength = content.length;

    entries.push({
      type,
      role,
      content,
      timestamp,
      totalTokens: totalTokens !== null && isNaN(totalTokens) ? null : totalTokens,
      contentLength,
    });
  }

  return entries;
}

/**
 * 计算一组 TranscriptEntry 的每日指标
 *
 * @param entries - 同一日期的 TranscriptEntry 数组
 * @param sessionCount - 该日期涉及的会话（.jsonl 文件）数量
 * @returns 该日期的 DailyStats
 */
export function computeDailyMetrics(
  entries: TranscriptEntry[],
  sessionCount: number,
): DailyStats {
  // 无条目时返回零值
  if (entries.length === 0) {
    return {
      date: '',
      tokenUsage: 0,
      tokenEstimated: true,
      sessionCount,
      avgResponseMs: 0,
      errorRate: 0,
    };
  }

  // 从第一个条目提取日期（YYYY-MM-DD 格式）
  const firstTs = new Date(entries[0].timestamp);
  const date = firstTs.toISOString().slice(0, 10);

  // 计算 Token 消耗总量，并判断是否全部为估算值
  let tokenUsage = 0;
  let hasRealTokenData = false;
  for (const entry of entries) {
    if (entry.totalTokens !== null) {
      tokenUsage += entry.totalTokens;
      hasRealTokenData = true;
    } else {
      tokenUsage += Math.ceil(entry.contentLength / 3);
    }
  }

  // 计算平均响应时间：连续 user→assistant 消息对的时间差
  const validResponseTimes: number[] = [];
  for (let i = 0; i < entries.length - 1; i++) {
    if (entries[i].role === 'user' && entries[i + 1].role === 'assistant') {
      const userTime = new Date(entries[i].timestamp).getTime();
      const assistantTime = new Date(entries[i + 1].timestamp).getTime();
      const diff = assistantTime - userTime;
      // 仅统计有效范围内的时间差（0 < diff < 300000 毫秒）
      if (diff > 0 && diff < 300000) {
        validResponseTimes.push(diff);
      }
    }
  }
  const avgResponseMs =
    validResponseTimes.length > 0
      ? validResponseTimes.reduce((sum, t) => sum + t, 0) /
        validResponseTimes.length
      : 0;

  // 计算错误率
  const errorCount = entries.filter((e) => e.type === 'error').length;
  const errorRate = (errorCount / entries.length) * 100;

  return {
    date,
    tokenUsage,
    tokenEstimated: !hasRealTokenData,
    sessionCount,
    avgResponseMs,
    errorRate,
  };
}

/**
 * 聚合 sessions 目录下所有 JSONL 文件的统计数据
 *
 * 遍历指定目录中的所有 .jsonl 文件，解析每个文件的 transcript 条目，
 * 按日期分组聚合，返回按日期升序排列的 DailyStats 数组。
 *
 * 会话数量通过 sessions.json 索引文件获取（每个顶层 key 视为一个独立会话），
 * 若 sessions.json 不存在则回退到按 .jsonl 文件数量计算。
 *
 * @param sessionsRoot - sessions 目录的绝对路径
 * @returns 按日期升序排列的 DailyStats 数组，目录不存在时返回空数组
 */
export function aggregateSessionStats(sessionsRoot: string): AggregateResult {
  // sessions 目录不存在时返回空结果
  if (!existsSync(sessionsRoot)) {
    return { dailyStats: [], totalSessions: 0 };
  }

  // 读取目录中的所有包含 .jsonl 的文件（包括归档的 .jsonl.reset.* 和 .jsonl.deleted.*）
  let files: string[];
  try {
    files = readdirSync(sessionsRoot).filter((f) => f.includes('.jsonl'));
  } catch {
    // 目录读取失败，返回空结果
    return { dailyStats: [], totalSessions: 0 };
  }

  if (files.length === 0) {
    return { dailyStats: [], totalSessions: 0 };
  }

  // 尝试从 sessions.json 获取准确的会话数量
  // sessions.json 中每个顶层 key（不含 :run: 子会话）视为一个独立会话
  let sessionIndex: Record<string, any> | null = null;
  try {
    const indexPath = join(sessionsRoot, 'sessions.json');
    if (existsSync(indexPath)) {
      const indexContent = readFileSync(indexPath, 'utf-8');
      sessionIndex = JSON.parse(indexContent);
    }
  } catch {
    // sessions.json 读取失败，回退到按文件数量计算
    sessionIndex = null;
  }

  // 按日期分组：date -> { entries: TranscriptEntry[], sessionFiles: Set<string> }
  const dateGroups = new Map<
    string,
    { entries: TranscriptEntry[]; sessionFiles: Set<string> }
  >();

  for (const file of files) {
    const filePath = join(sessionsRoot, file);
    const entries = parseTranscriptFile(filePath);

    if (entries.length === 0) continue;

    // 按日期分组该文件中的条目
    const fileEntriesByDate = new Map<string, TranscriptEntry[]>();
    for (const entry of entries) {
      const ts = new Date(entry.timestamp);
      if (isNaN(ts.getTime())) continue;
      const date = ts.toISOString().slice(0, 10);
      if (!fileEntriesByDate.has(date)) {
        fileEntriesByDate.set(date, []);
      }
      fileEntriesByDate.get(date)!.push(entry);
    }

    // 将该文件的条目合并到全局日期分组中
    for (const [date, fileEntries] of fileEntriesByDate) {
      if (!dateGroups.has(date)) {
        dateGroups.set(date, { entries: [], sessionFiles: new Set() });
      }
      const group = dateGroups.get(date)!;
      group.entries.push(...fileEntries);
      group.sessionFiles.add(file);
    }
  }

  // 计算每个日期的会话数量
  // 如果有 sessions.json，通过索引中的 session key 关联到 .jsonl 文件来计数
  // 否则回退到按 .jsonl 文件数量计算
  let sessionCountByDate: Map<string, number>;

  if (sessionIndex) {
    // 从 sessions.json 构建 .jsonl 文件名 → session keys 的映射
    // sessions.json 中每个 key 视为一个独立会话
    const fileToSessionKeys = new Map<string, Set<string>>();
    for (const [key, meta] of Object.entries(sessionIndex)) {
      const m = meta as any;
      // 通过 sessionId 关联到 .jsonl 文件（包括归档文件）
      if (m?.sessionId) {
        // 活跃文件名：{uuid}.jsonl
        const jsonlName = `${m.sessionId}.jsonl`;
        if (!fileToSessionKeys.has(jsonlName)) {
          fileToSessionKeys.set(jsonlName, new Set());
        }
        fileToSessionKeys.get(jsonlName)!.add(key);
      }
    }

    // 按日期统计会话数：每个日期涉及的 session key 数量
    sessionCountByDate = new Map();
    for (const [date, group] of dateGroups) {
      const sessionKeys = new Set<string>();
      for (const file of group.sessionFiles) {
        // 从文件名提取 {uuid}.jsonl 部分（归档文件名格式：{uuid}.jsonl.reset.{ts}）
        const baseJsonl = file.includes('.jsonl.') ? file.split('.jsonl.')[0] + '.jsonl' : file;
        const keys = fileToSessionKeys.get(baseJsonl) || fileToSessionKeys.get(file);
        if (keys) {
          for (const k of keys) sessionKeys.add(k);
        } else {
          // 该文件不在 sessions.json 中，按文件计为 1 个会话
          sessionKeys.add(`__file__${file}`);
        }
      }
      sessionCountByDate.set(date, sessionKeys.size);
    }
  } else {
    // 回退：每个 .jsonl 文件视为一个独立会话
    sessionCountByDate = new Map();
    for (const [date, group] of dateGroups) {
      sessionCountByDate.set(date, group.sessionFiles.size);
    }
  }

  // 计算独立会话总数
  // 每个包含 .jsonl 的文件视为一个独立会话（包括归档的 .reset 和 .deleted）
  const totalSessions = files.length;

  // 对每个日期分组计算指标
  const results: DailyStats[] = [];
  for (const [date, group] of dateGroups) {
    const sessionCount = sessionCountByDate.get(date) || group.sessionFiles.size;
    const metrics = computeDailyMetrics(group.entries, sessionCount);
    metrics.date = date;
    results.push(metrics);
  }

  // 按日期升序排列
  results.sort((a, b) => a.date.localeCompare(b.date));

  return { dailyStats: results, totalSessions };
}
