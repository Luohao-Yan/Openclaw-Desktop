import pkg from 'electron';
const { ipcMain } = pkg;
import { resolveOpenClawCommand, runCommand as runShellCommand } from './settings.js';
import * as fs from 'fs';
import * as path from 'path';
import { asyncSendManager } from './asyncSendManager.js';
// WebSocket 方案已废弃：Gateway 要求设备配对认证（connect.challenge），
// 无法从 Electron 主进程直接建立连接。改用 CLI 方案。

// ── 类型定义 ──────────────────────────────────────────────────────────────────
// 基于 openclaw sessions --all-agents --json 的真实返回格式：
// {
//   "path": null,
//   "stores": [{ "agentId": "main", "path": "..." }, ...],
//   "allAgents": true,
//   "count": 2,
//   "sessions": [
//     { "agentId": "main", "key": "agent:main:main", "model": "gpt-5" },
//     ...
//   ]
// }

/** CLI 返回的原始 session 条目 */
interface RawSession {
  agentId: string;
  key: string;
  model: string;
  [k: string]: unknown;  // CLI 未来可能扩展的字段
}

/** CLI 返回的完整 JSON 结构 */
interface RawSessionsOutput {
  path: string | null;
  stores: { agentId: string; path: string }[];
  allAgents: boolean;
  count: number;
  sessions: RawSession[];
}

/** 前端使用的 session 数据模型 */
export interface Session {
  id: string;                                    // session key，如 "agent:main:main"
  key: string;                                   // 原始 key
  agent: string;                                 // agentId
  model: string;                                 // 模型名称
  channel: string;                               // 从 key 解析出的渠道类型
  status: 'active' | 'idle' | 'inactive';        // 推断状态（CLI 不直接提供）
  /** sessions.json 中的真实 session uuid，用于 openclaw agent --session-id */
  sessionId?: string;
  /** 从 sessions.json 读取的投递上下文，用于 openclaw message send */
  deliveryContext?: {
    channel: string;   // 渠道名，如 "feishu"、"telegram"
    to: string;        // 目标，如 "user:ou_xxx"
    accountId?: string; // 账号 id
  };
}

/** 前端使用的统计数据 */
export interface SessionStats {
  total: number;
  active: number;
  idle: number;
  agents: Record<string, number>;
  stores: { agentId: string; path: string }[];
}

/** cleanup 返回的 store 级别摘要 */
interface CleanupStoreSummary {
  agentId: string;
  storePath: string;
  beforeCount: number;
  afterCount: number;
  pruned: number;
  capped: number;
}

/** cleanup 返回的完整 JSON 结构 */
interface RawCleanupOutput {
  allAgents: boolean;
  mode: string;
  dryRun: boolean;
  stores: CleanupStoreSummary[];
}

// ── 工具函数 ──────────────────────────────────────────────────────────────────

/** 运行 openclaw 子命令，复用 settings 中带完整 shell PATH 的 runCommand */
async function runCommand(args: string[], options?: { timeoutMs?: number }): Promise<{ success: boolean; output: string; error?: string }> {
  const cmd = resolveOpenClawCommand();
  return runShellCommand(cmd, args, options);
}

/** 去除 ANSI 转义码及其他终端控制字符 */
function stripAnsi(s: string): string {
  return s
    // 标准 ANSI 转义序列
    .replace(/\x1B\[[0-9;]*[A-Za-z]/g, '')
    // OSC 序列 (如终端标题设置)
    .replace(/\x1B\][^\x07]*\x07/g, '')
    // 其他 ESC 序列
    .replace(/\x1B[^[(\x07]*[\x07]/g, '')
    // 回车符（某些终端输出会包含）
    .replace(/\r/g, '');
}

/**
 * 从可能包含非 JSON 前缀/后缀的字符串中提取并解析 JSON
 * CLI 输出有时会在 JSON 前后附带日志行或空行
 */
function tryParseJson<T>(raw: string): T | null {
  const text = stripAnsi(raw).trim();
  if (!text) return null;

  // 直接尝试解析
  try { return JSON.parse(text) as T; } catch { /* 继续尝试提取 */ }

  // 尝试找到第一个 '{' 或 '[' 到最后一个 '}' 或 ']' 的范围
  const firstBrace = text.indexOf('{');
  const firstBracket = text.indexOf('[');
  let start = -1;

  if (firstBrace >= 0 && (firstBracket < 0 || firstBrace < firstBracket)) {
    start = firstBrace;
  } else if (firstBracket >= 0) {
    start = firstBracket;
  }

  if (start < 0) return null;

  // 从末尾找对应的闭合符
  const opener = text[start];
  const closer = opener === '{' ? '}' : ']';
  const lastClose = text.lastIndexOf(closer);

  if (lastClose <= start) return null;

  const jsonStr = text.substring(start, lastClose + 1);
  try { return JSON.parse(jsonStr) as T; } catch { return null; }
}

// ── 发消息 CLI 方案 ──────────────────────────────────────────────────────────

/**
 * 通过 CLI 命令 `openclaw agent --session-id <id> --message <text> --json`
 * 向指定 session 发送消息并获取 agent 回复。
 *
 * 这是最可靠的方式：本地进程调用，不需要 WebSocket 认证（Gateway 要求设备配对）。
 * CLI 返回 JSON 格式：{ runId, status, summary, result: { payloads: [{ text }] } }
 */
async function sendViaAgentCli(
  sessionId: string,
  message: string,
  timeoutMs = 120_000,
): Promise<{ success: boolean; response?: string; error?: string }> {
  const result = await runCommand(
    ['agent', '--session-id', sessionId, '--message', message, '--json'],
    { timeoutMs },
  );

  if (!result.success) {
    const errMsg = result.error || result.output || 'CLI 执行失败';
    console.error('[sessions:send] CLI 失败:', errMsg);
    return { success: false, error: errMsg };
  }

  // CLI 输出格式：stdout 中可能包含 [plugins] 注册日志（带 ANSI 转义码），后跟多行 JSON
  // 解析策略：不依赖行过滤（用户可能没有任何 plugin，输出就是纯 JSON）
  // 统一先 stripAnsi，再从整个文本中提取最后一个完整的 {...} JSON 对象
  // 因为 CLI 的结果 JSON 永远是最后输出的，日志永远在前面
  const cleanOutput = stripAnsi(result.output).trim();

  let parsed: any = null;

  // 方法1：直接整体解析（无日志前缀时命中，最快）
  try {
    parsed = JSON.parse(cleanOutput);
  } catch { /* 继续尝试 */ }

  // 方法2：从最后一个 '}' 往前找匹配的 '{'，提取最后一个完整 JSON 对象
  // 这是最健壮的方式：无论前面有多少行日志、有没有 [plugins]，都能正确提取
  if (!parsed) {
    const lastClose = cleanOutput.lastIndexOf('}');
    if (lastClose >= 0) {
      // 从 lastClose 往前扫描，用括号计数找到对应的开括号
      let depth = 0;
      let start = -1;
      for (let i = lastClose; i >= 0; i--) {
        if (cleanOutput[i] === '}') depth++;
        else if (cleanOutput[i] === '{') {
          depth--;
          if (depth === 0) { start = i; break; }
        }
      }
      if (start >= 0) {
        try {
          parsed = JSON.parse(cleanOutput.substring(start, lastClose + 1));
        } catch { /* 继续 */ }
      }
    }
  }

  // 方法3：逐行从末尾往前找单行 JSON（兼容极简输出格式）
  if (!parsed) {
    const lines = cleanOutput.split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (!line.startsWith('{')) continue;
      try {
        parsed = JSON.parse(line);
        break;
      } catch { /* 继续往前找 */ }
    }
  }

  if (!parsed) {
    console.error('[sessions:send] JSON 解析失败，输出末尾:', cleanOutput.slice(-300));
    return { success: false, error: 'CLI 输出解析失败' };
  }

  if (parsed.status !== 'ok' && parsed.status !== 'completed') {
    const errMsg = parsed.error?.message || parsed.summary || `agent 执行失败: ${parsed.status}`;
    return { success: false, error: errMsg };
  }

  // 提取 agent 回复文本
  const response: string | undefined =
    parsed.result?.payloads?.[0]?.text ||
    parsed.result?.text ||
    parsed.payload?.text ||
    undefined;

  return { success: true, response };
}

/**
 * 从 session key 中解析渠道类型
 * key 格式示例: "agent:main:telegram:dm:123" → "telegram"
 *              "agent:main:main" → "main"
 */
function parseChannelFromKey(key: string): string {
  // key 格式: agent:<agentId>:<channel_or_main>[:...]
  const parts = key.split(':');
  return parts.length >= 3 ? parts[2] : 'unknown';
}

// ── 核心逻辑 ──────────────────────────────────────────────────────────────────

/**
 * 获取所有 session 列表
 * 执行: openclaw sessions --all-agents --json
 * 返回真实 CLI 数据，映射为前端 Session 类型
 */
async function getSessionsList(): Promise<{
  success: boolean;
  sessions: Session[];
  stores: { agentId: string; path: string }[];
  error?: string;
}> {
  const result = await runCommand(['sessions', '--all-agents', '--json']);

  if (!result.success) {
    const errMsg = result.error || result.output || 'CLI 执行失败';
    console.error('[sessions] CLI 执行失败:', errMsg);
    return { success: false, sessions: [], stores: [], error: errMsg };
  }

  const parsed = tryParseJson<RawSessionsOutput>(result.output);

  if (!parsed) {
    const errMsg = 'JSON 解析失败: ' + (result.output?.substring(0, 200) || '空输出');
    console.error('[sessions]', errMsg);
    return { success: false, sessions: [], stores: [], error: errMsg };
  }

  // 从 parsed.sessions 数组映射为前端 Session
  const rawList = Array.isArray(parsed.sessions) ? parsed.sessions : [];
  const stores = Array.isArray(parsed.stores) ? parsed.stores : [];

  // 从各 agent 的 sessions.json 读取 deliveryContext 和 sessionId，用于后续 agent 命令
  // 结构: { "<sessionKey>": { sessionId: "<uuid>", deliveryContext: { channel, to, accountId }, ... } }
  const sessionMetaMap = new Map<string, { sessionId?: string; deliveryContext?: { channel: string; to: string; accountId?: string } }>();
  for (const store of stores) {
    try {
      if (!store.path || !fs.existsSync(store.path)) continue;
      const indexData = JSON.parse(fs.readFileSync(store.path, 'utf-8')) as Record<string, any>;
      for (const [key, meta] of Object.entries(indexData)) {
        const dc = meta?.deliveryContext;
        sessionMetaMap.set(key, {
          sessionId: meta?.sessionId,
          deliveryContext: dc?.channel && dc?.to ? { channel: dc.channel, to: dc.to, accountId: dc.accountId } : undefined,
        });
      }
    } catch {
      // 读取失败不影响主流程
    }
  }

  const sessions: Session[] = rawList
    .filter((item): item is RawSession => {
      if (typeof item !== 'object' || item === null) return false;
      // 过滤掉 cron 运行子会话（key 格式: agent:<id>:cron:<job-uuid>:run:<run-uuid>）
      // 这类 key 是每次 cron 执行的临时记录，不应出现在会话列表中
      const key = String(item.key || '');
      if (key.includes(':run:')) return false;
      return true;
    })
    .map((item) => {
      const key = String(item.key || '');
      return {
        id: key,
        key,
        agent: String(item.agentId || 'unknown'),
        model: String(item.model || 'unknown'),
        channel: parseChannelFromKey(key),
        // CLI 不返回 status，标记为 active（已存在即活跃）
        status: 'active' as const,
        // 从 sessions.json 补充 deliveryContext 和 sessionId，供 agent 命令使用
        sessionId: sessionMetaMap.get(key)?.sessionId,
        deliveryContext: sessionMetaMap.get(key)?.deliveryContext,
      };
    });

  return { success: true, sessions, stores };
}

/**
 * 从 .jsonl 文件中解析消息列表（内部工具函数）
 *
 * .jsonl 每行格式:
 *   { "type": "message", "message": { "role": "user"|"assistant", "content": [...] }, "timestamp": "..." }
 */
function parseJsonlMessages(filePath: string): Array<{ role: string; content: string; timestamp?: string; _ts: number }> {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter((l) => l.trim());
    const messages: Array<{ role: string; content: string; timestamp?: string; _ts: number }> = [];

    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        if (obj.type !== 'message' || !obj.message) continue;

        const msg = obj.message;
        const role: string = msg.role || 'unknown';

        // content 可能是字符串或 [{type:'text', text:'...'}] 数组
        let text = '';
        if (typeof msg.content === 'string') {
          text = msg.content;
        } else if (Array.isArray(msg.content)) {
          text = msg.content
            .filter((item: any) => item?.type === 'text' && item?.text)
            .map((item: any) => item.text as string)
            .join('\n');
        }

        // 剥离 runtime 注入的时间戳前缀，格式如：[Mon 2026-03-23 00:51 GMT+8]
        text = text.replace(/^\[[A-Za-z]{3}\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}[^\]]*\]\s*/m, '');

        if (!text.trim()) continue;

        const ts = obj.timestamp ? new Date(obj.timestamp).getTime() : 0;
        messages.push({
          role,
          content: text,
          timestamp: obj.timestamp ? new Date(obj.timestamp).toLocaleString() : undefined,
          _ts: ts,
        });
      } catch { /* 跳过解析失败的行 */ }
    }
    return messages;
  } catch {
    return [];
  }
}

/**
 * 从 session 的所有 .jsonl 文件中读取并合并对话记录
 *
 * 背景：openclaw agent --session-id <uuid> 每次调用可能写入同一个 .jsonl 文件，
 * 也可能创建新文件（取决于 runtime 版本）。为确保历史消息完整，
 * 我们收集该 session 关联的所有 .jsonl 文件，合并后按时间戳排序去重。
 *
 * 文件来源（按优先级收集，全部合并）：
 *   1. sessionMeta.sessionId → <sessionsDir>/<uuid>.jsonl
 *   2. sessionMeta.sessionFile
 *   3. sessions.json 中所有以 sessionKey 为前缀的条目（含 :run: 子会话）
 */
async function readSessionTranscript(
  agentId: string,
  sessionKey: string,
  stores: { agentId: string; path: string }[],
): Promise<any[]> {
  // 找到该 agent 对应的 store 路径（sessions.json）
  const store = stores.find((s) => s.agentId === agentId);
  if (!store?.path) {
    console.log(`[sessions] transcript: 未找到 agent "${agentId}" 的 store`);
    return [];
  }

  try {
    const indexContent = fs.readFileSync(store.path, 'utf-8');
    const indexData = JSON.parse(indexContent) as Record<string, any>;
    const sessionsDir = path.dirname(store.path);

    // ── 收集所有候选 .jsonl 文件路径（去重）──
    const candidateFiles = new Set<string>();

    /**
     * 从单条 session meta 中提取候选文件路径
     * 优先用 sessionId 字段拼路径，其次用 sessionFile 字段
     */
    const extractFiles = (meta: any) => {
      if (!meta) return;
      // sessionId → <dir>/<uuid>.jsonl
      if (meta.sessionId) {
        const p = path.join(sessionsDir, `${meta.sessionId}.jsonl`);
        if (fs.existsSync(p)) candidateFiles.add(p);
      }
      // sessionFile 字段（绝对路径）
      if (meta.sessionFile && fs.existsSync(meta.sessionFile)) {
        candidateFiles.add(meta.sessionFile);
      }
    };

    // 1. 主 session 条目
    const sessionMeta = indexData[sessionKey];
    if (!sessionMeta) {
      console.log(`[sessions] transcript: sessions.json 中未找到 key "${sessionKey}"`);
      return [];
    }
    extractFiles(sessionMeta);

    // 2. 所有以 sessionKey 为前缀的子条目（含 :run: 子会话、cron 运行记录等）
    const prefix = sessionKey + ':';
    for (const [k, v] of Object.entries(indexData)) {
      if (k.startsWith(prefix)) extractFiles(v);
    }

    if (candidateFiles.size === 0) {
      console.log(`[sessions] transcript: 未找到任何 .jsonl 文件 (key=${sessionKey})`);
      return [];
    }

    // ── 读取并合并所有文件的消息，按时间戳排序 ──
    const allMessages: Array<{ role: string; content: string; timestamp?: string; _ts: number }> = [];
    for (const filePath of Array.from(candidateFiles)) {
      const msgs = parseJsonlMessages(filePath);
      allMessages.push(...msgs);
    }

    // 按时间戳升序排序（_ts=0 的消息排在最前）
    allMessages.sort((a, b) => a._ts - b._ts);

    // 去重：相邻的相同 role+content 消息只保留一条（多文件可能有重叠）
    const deduped: Array<{ role: string; content: string; timestamp?: string }> = [];
    for (const msg of allMessages) {
      const last = deduped[deduped.length - 1];
      if (last && last.role === msg.role && last.content === msg.content) continue;
      deduped.push({ role: msg.role, content: msg.content, timestamp: msg.timestamp });
    }

    console.log(`[sessions] transcript: 合并 ${candidateFiles.size} 个文件，共 ${deduped.length} 条消息 (key=${sessionKey})`);
    return deduped;
  } catch (err) {
    console.error(`[sessions] 读取 transcript 失败 (agent=${agentId}, key=${sessionKey}):`, err);
    return [];
  }
}

// ── stores 路径缓存 ──────────────────────────────────────────────────────────
// 避免每次读 transcript 都重新执行 CLI，缓存 stores 路径（TTL 30s）
let storesCache: { stores: { agentId: string; path: string }[]; expiresAt: number } | null = null;

/**
 * 直接扫描文件系统获取所有 agent 的 sessions store 路径
 * 不需要执行 CLI，速度极快
 * 路径规律：~/.openclaw/agents/<agentId>/sessions/sessions.json
 */
function scanStoresFromFilesystem(): { agentId: string; path: string }[] {
  try {
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    const agentsDir = path.join(homeDir, '.openclaw', 'agents');
    if (!fs.existsSync(agentsDir)) return [];

    const stores: { agentId: string; path: string }[] = [];
    const entries = fs.readdirSync(agentsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const sessionsJsonPath = path.join(agentsDir, entry.name, 'sessions', 'sessions.json');
      if (fs.existsSync(sessionsJsonPath)) {
        stores.push({ agentId: entry.name, path: sessionsJsonPath });
      }
    }
    return stores;
  } catch {
    return [];
  }
}

/**
 * 获取 stores 路径列表（带 30s 缓存）
 * 优先从文件系统直接扫描（快速），失败时回退到 CLI
 */
async function getStoresCached(): Promise<{ agentId: string; path: string }[]> {
  const now = Date.now();
  if (storesCache && storesCache.expiresAt > now) {
    return storesCache.stores;
  }
  // 优先直接扫描文件系统，不需要 CLI
  let stores = scanStoresFromFilesystem();
  if (stores.length === 0) {
    // 回退：执行 CLI 获取
    const result = await getSessionsList();
    stores = result.stores;
  }
  storesCache = { stores, expiresAt: now + 30_000 };
  return stores;
}

/** 使 stores 缓存立即失效（session 列表变化时调用） */
function invalidateStoresCache() {
  storesCache = null;
}

export function setupSessionsIPC() {

  // 获取 session 列表（返回带 success 标志的结构）
  ipcMain.handle('sessions:list', async () => {
    const result = await getSessionsList();
    return { success: result.success, sessions: result.sessions, error: result.error };
  });

  // 获取单个 session 详情 + transcript
  // 使用 stores 缓存避免每次都执行 CLI，发消息后缓存会失效确保读到最新内容
  ipcMain.handle('sessions:get', async (_event, sessionId: string) => {
    // 先用缓存的 stores 尝试读取（快速路径）
    const stores = await getStoresCached();

    // 从 sessions.json 直接找 session 的 agentId（不需要重跑 CLI）
    let agentId: string | undefined;
    let sessionMeta: any;
    for (const store of stores) {
      try {
        if (!store.path || !fs.existsSync(store.path)) continue;
        const indexData = JSON.parse(fs.readFileSync(store.path, 'utf-8')) as Record<string, any>;
        if (indexData[sessionId]) {
          agentId = store.agentId;
          sessionMeta = indexData[sessionId];
          break;
        }
      } catch { /* 继续 */ }
    }

    if (!agentId) {
      // 缓存可能过期，重新获取
      invalidateStoresCache();
      const fresh = await getSessionsList();
      const session = fresh.sessions.find((s) => s.id === sessionId);
      if (!session) return { success: false, error: '会话不存在' };
      const transcript = await readSessionTranscript(session.agent, sessionId, fresh.stores);
      console.log(`[sessions:get] fresh path, transcript count=${transcript.length}`);
      return { success: true, session, transcript };
    }

    const transcript = await readSessionTranscript(agentId, sessionId, stores);
    console.log(`[sessions:get] cached path, agentId=${agentId}, transcript count=${transcript.length}`);
    // 返回完整 session 对象（含 sessionId UUID，供前端发消息使用）
    return {
      success: true,
      session: {
        id: sessionId,
        key: sessionId,
        agent: agentId,
        sessionId: sessionMeta?.sessionId,
        model: sessionMeta?.model || 'unknown',
        channel: sessionId.split(':')[2] || 'unknown',
        status: 'active' as const,
      },
      transcript,
    };
  });

  // 读取 session transcript（独立接口，使用缓存）
  ipcMain.handle('sessions:transcript', async (_event, agentId: string, sessionKey: string) => {
    const stores = await getStoresCached();
    const transcript = await readSessionTranscript(agentId, sessionKey, stores);
    console.log(`[sessions:transcript] agentId=${agentId}, key=${sessionKey}, count=${transcript.length}`);
    return { success: true, transcript };
  });

  // 获取 session 统计（从列表数据聚合）
  ipcMain.handle('sessions:stats', async () => {
    const result = await getSessionsList();
    if (!result.success) {
      return { success: false, total: 0, active: 0, idle: 0, agents: {}, stores: [], error: result.error };
    }
    const agents: Record<string, number> = {};
    for (const s of result.sessions) {
      agents[s.agent] = (agents[s.agent] || 0) + 1;
    }
    return {
      success: true,
      total: result.sessions.length,
      active: result.sessions.length,
      idle: 0,
      agents,
      stores: result.stores,
    };
  });

  /**
   * 获取每个 agent 的详细统计：会话数、消息数、Token 估算、平均响应时间
   * 遍历 stores 中的 sessions.json，解析每个 session 的 .jsonl 文件
   * - Token 估算：从 usage 字段读取，若无则按内容字符数 / 4 粗略估算
   * - 平均响应时间：计算 user → assistant 消息对的时间差均值
   */
  ipcMain.handle('sessions:agentDetailedStats', async () => {
    const result = await getSessionsList();
    if (!result.success) {
      return { success: false, stats: {}, error: result.error };
    }

    // 按 agent 分组 session
    const agentSessions: Record<string, string[]> = {};
    for (const s of result.sessions) {
      if (!agentSessions[s.agent]) agentSessions[s.agent] = [];
      agentSessions[s.agent].push(s.key);
    }

    // 统计结果
    const stats: Record<string, {
      sessionCount: number;
      messageCount: number;
      tokenUsage: number;
      avgResponseMs: number;
    }> = {};

    for (const [agentId, sessionKeys] of Object.entries(agentSessions)) {
      stats[agentId] = { sessionCount: sessionKeys.length, messageCount: 0, tokenUsage: 0, avgResponseMs: 0 };

      // 找到该 agent 的 store 路径
      const store = result.stores.find((s) => s.agentId === agentId);
      if (!store?.path || !fs.existsSync(store.path)) continue;

      // 收集所有响应时间差，最后求均值
      const responseTimes: number[] = [];

      try {
        const indexContent = fs.readFileSync(store.path, 'utf-8');
        const indexData = JSON.parse(indexContent);

        // 遍历该 agent 的每个 session
        for (const key of sessionKeys) {
          const sessionMeta = indexData?.[key];
          const sessionFile = sessionMeta?.sessionFile;
          if (!sessionFile || !fs.existsSync(sessionFile)) continue;

          try {
            const content = fs.readFileSync(sessionFile, 'utf-8');
            const lines = content.split('\n').filter((l) => l.trim());

            let lastUserTimestamp: number | null = null;

            for (const line of lines) {
              try {
                const obj = JSON.parse(line);
                if (obj.type !== 'message' || !obj.message) continue;

                stats[agentId].messageCount++;

                // Token 统计：优先从 usage 字段读取，否则按内容长度估算
                if (obj.usage && typeof obj.usage.total_tokens === 'number') {
                  stats[agentId].tokenUsage += obj.usage.total_tokens;
                } else {
                  // 粗略估算：英文约 4 字符/token，中文约 2 字符/token，取 3 作为折中
                  const msg = obj.message;
                  let textLen = 0;
                  if (typeof msg.content === 'string') {
                    textLen = msg.content.length;
                  } else if (Array.isArray(msg.content)) {
                    for (const block of msg.content) {
                      if (block?.type === 'text' && block?.text) textLen += block.text.length;
                    }
                  }
                  stats[agentId].tokenUsage += Math.ceil(textLen / 3);
                }

                // 响应时间计算：user → assistant 的时间差
                const role = obj.message.role;
                const ts = obj.timestamp ? new Date(obj.timestamp).getTime() : 0;

                if (role === 'user' && ts > 0) {
                  lastUserTimestamp = ts;
                } else if (role === 'assistant' && ts > 0 && lastUserTimestamp !== null) {
                  const diff = ts - lastUserTimestamp;
                  // 只记录合理范围内的响应时间（0~5分钟）
                  if (diff > 0 && diff < 300_000) {
                    responseTimes.push(diff);
                  }
                  lastUserTimestamp = null;
                }
              } catch { /* 跳过解析失败的行 */ }
            }
          } catch { /* 跳过读取失败的文件 */ }
        }
      } catch { /* 跳过解析失败的 sessions.json */ }

      // 计算平均响应时间
      if (responseTimes.length > 0) {
        const sum = responseTimes.reduce((a, b) => a + b, 0);
        stats[agentId].avgResponseMs = Math.round(sum / responseTimes.length);
      }
    }

    return { success: true, stats };
  });

  // 创建新 session
  ipcMain.handle('sessions:create', async (_event, agent: string, model?: string): Promise<{ success: boolean; sessionId?: string; error?: string }> => {
    const args = ['sessions', 'create', '--agent', agent];
    if (model) args.push('--model', model);
    args.push('--json');

    const result = await runCommand(args);
    if (!result.success) {
      return { success: false, error: result.error || '创建会话失败' };
    }

    const parsed = tryParseJson<any>(result.output);
    return {
      success: true,
      sessionId: parsed?.key || parsed?.sessionId || parsed?.id,
    };
  });

  // 向 session 发送消息（异步非阻塞模式）
  // 通过 AsyncSendManager 在子进程中启动 CLI 命令后立即返回，不等待 agent 回复
  // 前端收到 { pending: true } 后启动轮询机制检测 agent 回复
  ipcMain.handle('sessions:send', async (
    _event,
    sessionKey: string,   // session key（保留参数兼容性，实际用 meta.sessionId）
    message: string,
    meta?: { sessionId?: string; agentId?: string; deliveryContext?: { channel: string; to: string; accountId?: string } },
  ): Promise<{ success: boolean; response?: string; transcript?: any[]; pending?: boolean; error?: string }> => {
    const sessionId = meta?.sessionId;
    if (!sessionId) {
      return { success: false, error: '缺少 sessionId，无法发送消息' };
    }
    const agentId = meta?.agentId || sessionKey.split(':')[1] || 'main';
    console.log(`[sessions:send] 异步发送: sessionId=${sessionId}, key=${sessionKey}, message="${message.substring(0, 50)}"`);

    // 委托给 AsyncSendManager，立即返回不等待 CLI 完成
    const result = await asyncSendManager.enqueue({
      sessionId,
      sessionKey,
      message,
      agentId,
    });

    // enqueue 成功后让缓存失效，确保后续轮询能读到最新 transcript
    if (result.success) {
      invalidateStoresCache();
    }

    return result;
  });

  // 查询指定 session 的异步发送状态
  // 前端用于恢复 pending 状态（如页面刷新后）和轮询进度
  ipcMain.handle('sessions:sendStatus', async (_event, sessionKey: string) => {
    return asyncSendManager.getStatus(sessionKey);
  });

  // 关闭 session
  ipcMain.handle('sessions:close', async (_event, sessionId: string): Promise<{ success: boolean; error?: string }> => {
    const result = await runCommand(['sessions', 'close', sessionId]);
    if (!result.success) {
      return { success: false, error: result.error || '关闭会话失败' };
    }
    return { success: true };
  });

  // 导出 session
  ipcMain.handle('sessions:export', async (_event, sessionId: string, format: 'json' | 'markdown'): Promise<{ success: boolean; data?: string; error?: string }> => {
    const result = await runCommand(['sessions', 'export', sessionId, '--format', format]);
    if (!result.success) {
      return { success: false, error: result.error || '导出会话失败' };
    }
    return { success: true, data: result.output };
  });

  // 导入 session
  ipcMain.handle('sessions:import', async (_event, data: string, format: string): Promise<{ success: boolean; sessionId?: string; error?: string }> => {
    const result = await runCommand(['sessions', 'import', '--data', data, '--format', format, '--json']);
    if (!result.success) {
      return { success: false, error: result.error || '导入会话失败' };
    }
    const parsed = tryParseJson<any>(result.output);
    return { success: true, sessionId: parsed?.sessionId || parsed?.key || parsed?.id };
  });

  // 清理 session（维护）
  // 支持 --dry-run 预览和 --enforce 执行
  ipcMain.handle('sessions:cleanup', async (_event, dryRun = true): Promise<{ success: boolean; output?: string; summary?: RawCleanupOutput; error?: string }> => {
    const args = ['sessions', 'cleanup', '--all-agents', '--json'];
    if (dryRun) args.push('--dry-run');
    else args.push('--enforce');

    const result = await runCommand(args);
    if (!result.success) {
      return { success: false, error: result.error || '清理会话失败' };
    }

    const parsed = tryParseJson<RawCleanupOutput>(result.output);
    return { success: true, output: result.output, summary: parsed ?? undefined };
  });
}
