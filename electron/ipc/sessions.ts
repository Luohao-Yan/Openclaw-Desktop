import pkg from 'electron';
const { ipcMain } = pkg;
import { resolveOpenClawCommand, runCommand as runShellCommand } from './settings.js';
import * as fs from 'fs';

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
async function runCommand(args: string[]): Promise<{ success: boolean; output: string; error?: string }> {
  const cmd = resolveOpenClawCommand();
  return runShellCommand(cmd, args);
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

  const sessions: Session[] = rawList
    .filter((item): item is RawSession => typeof item === 'object' && item !== null)
    .map((item) => ({
      id: String(item.key || ''),
      key: String(item.key || ''),
      agent: String(item.agentId || 'unknown'),
      model: String(item.model || 'unknown'),
      channel: parseChannelFromKey(String(item.key || '')),
      // CLI 不返回 status，标记为 active（已存在即活跃）
      status: 'active' as const,
    }));

  return { success: true, sessions, stores };
}

/**
 * 从 session 的 .jsonl 文件中读取对话记录
 *
 * sessions.json 结构:
 *   { "<sessionKey>": { sessionFile: "/path/to/<uuid>.jsonl", ... }, ... }
 *
 * .jsonl 每行一个 JSON 对象，对话消息的行格式:
 *   { "type": "message", "message": { "role": "user"|"assistant", "content": [{ "type": "text", "text": "..." }] }, "timestamp": "..." }
 *
 * 返回前端可用的 { role, content, timestamp } 数组
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
    // 1. 读取 sessions.json，获取 sessionFile 路径
    const indexContent = fs.readFileSync(store.path, 'utf-8');
    const indexData = JSON.parse(indexContent);

    const sessionMeta = indexData?.[sessionKey];
    if (!sessionMeta) {
      console.log(`[sessions] transcript: sessions.json 中未找到 key "${sessionKey}"`);
      return [];
    }

    const sessionFile = sessionMeta.sessionFile;
    if (!sessionFile || !fs.existsSync(sessionFile)) {
      console.log(`[sessions] transcript: sessionFile 不存在: ${sessionFile}`);
      return [];
    }

    // 2. 读取 .jsonl 文件，逐行解析
    const jsonlContent = fs.readFileSync(sessionFile, 'utf-8');
    const lines = jsonlContent.split('\n').filter((l) => l.trim());

    const messages: any[] = [];
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        // 只取 type=message 的行
        if (obj.type !== 'message' || !obj.message) continue;

        const msg = obj.message;
        const role = msg.role || 'unknown';

        // content 可能是字符串或 [{type:'text', text:'...'}] 数组
        let content = '';
        if (typeof msg.content === 'string') {
          content = msg.content;
        } else if (Array.isArray(msg.content)) {
          // 拼接所有 text 类型的内容块
          content = msg.content
            .filter((item: any) => item?.type === 'text' && item?.text)
            .map((item: any) => item.text)
            .join('\n');
        }

        // 跳过空内容
        if (!content.trim()) continue;

        messages.push({
          role,
          content,
          timestamp: obj.timestamp ? new Date(obj.timestamp).toLocaleString() : undefined,
        });
      } catch {
        // 跳过解析失败的行
      }
    }

    console.log(`[sessions] transcript: 从 ${sessionFile} 读取到 ${messages.length} 条消息`);
    return messages;
  } catch (err) {
    console.error(`[sessions] 读取 transcript 失败 (agent=${agentId}, key=${sessionKey}):`, err);
    return [];
  }
}

// ── IPC 注册 ──────────────────────────────────────────────────────────────────

export function setupSessionsIPC() {

  // 获取 session 列表（返回带 success 标志的结构）
  ipcMain.handle('sessions:list', async () => {
    const result = await getSessionsList();
    return { success: result.success, sessions: result.sessions, error: result.error };
  });

  // 获取单个 session 详情 + transcript（从 sessions.json 文件读取对话记录）
  ipcMain.handle('sessions:get', async (_event, sessionId: string) => {
    const { sessions, stores } = await getSessionsList();
    const session = sessions.find((s) => s.id === sessionId) ?? null;
    if (!session) return { success: false, error: '会话不存在' };

    // 尝试从 sessions.json 中读取该 session 的 transcript
    const transcript = await readSessionTranscript(session.agent, sessionId, stores);

    return { success: true, session, transcript };
  });

  // 读取 session transcript（独立接口）
  ipcMain.handle('sessions:transcript', async (_event, agentId: string, sessionKey: string) => {
    const { stores } = await getSessionsList();
    const transcript = await readSessionTranscript(agentId, sessionKey, stores);
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

  // 向 session 发送消息
  ipcMain.handle('sessions:send', async (_event, sessionId: string, message: string): Promise<{ success: boolean; response?: string; error?: string }> => {
    const result = await runCommand(['sessions', 'send', sessionId, '--message', message, '--json']);
    if (!result.success) {
      return { success: false, error: result.error || '发送消息失败' };
    }

    const parsed = tryParseJson<any>(result.output);
    return {
      success: true,
      response: parsed?.text || parsed?.output || parsed?.response,
    };
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
