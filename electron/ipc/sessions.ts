import pkg from 'electron';
const { ipcMain } = pkg;
import { resolveOpenClawCommand, runCommand as runShellCommand } from './settings.js';

// ── 类型定义 ──────────────────────────────────────────────────────────────────

export interface Session {
  id: string;        // session key，如 "agent:main:telegram:dm:123"
  name: string;      // 显示名称
  status: 'active' | 'idle' | 'inactive';
  agent: string;     // agentId
  model: string;
  channel: string;
  channelId: string;
  createdAt: string;
  lastActivity: string;
  tokensUsed: number;
  messagesCount: number;
  participants: string[];
  metadata?: Record<string, unknown>;
}

export interface SessionStats {
  total: number;
  active: number;
  idle: number;
  agents: Record<string, number>;
}

// ── 工具函数 ──────────────────────────────────────────────────────────────────

/** 运行 openclaw 子命令，复用 settings 中带完整 shell PATH 的 runCommand */
async function runCommand(args: string[]): Promise<{ success: boolean; output: string; error?: string }> {
  const cmd = resolveOpenClawCommand();
  return runShellCommand(cmd, args);
}

/** 去除 ANSI 转义码 */
function stripAnsi(s: string): string {
  return s.replace(/\u001b\[[0-9;]*m/g, '').replace(/\x1B\[[0-9;]*m/g, '');
}

/** 尝试解析 JSON，失败返回 null */
function tryParseJson<T>(raw: string): T | null {
  const text = stripAnsi(raw).trim();
  if (!text) return null;
  try { return JSON.parse(text) as T; } catch { return null; }
}

// ── 核心逻辑 ──────────────────────────────────────────────────────────────────

/**
 * 获取所有 session 列表
 * 使用: openclaw sessions --all-agents --json
 * 返回格式: { sessions: [{ agentId, key, model, ... }], count, ... }
 */
async function getSessionsList(): Promise<Session[]> {
  const result = await runCommand(['sessions', '--all-agents', '--json']);
  const parsed = tryParseJson<any>(result.output);

  if (!parsed) {
    console.error('sessions list 解析��败:', result.error || result.output);
    return [];
  }

  // 根据文档，返回格式为 { sessions: [...] }
  const rawList: any[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.sessions)
      ? parsed.sessions
      : [];

  return rawList
    .filter((item) => typeof item === 'object' && item !== null)
    .map((item): Session => ({
      id: String(item.key || item.sessionId || item.id || ''),
      name: String(item.name || item.key || item.sessionId || '未命名会话'),
      // openclaw sessions 不直接返回 status，根据 updatedAt 推断
      status: inferStatus(item),
      agent: String(item.agentId || item.agent || 'unknown'),
      model: String(item.model || 'unknown'),
      channel: String(item.channel || item.kind || 'unknown'),
      channelId: String(item.channelId || item.key || ''),
      createdAt: String(item.createdAt || item.updatedAt || new Date().toISOString()),
      lastActivity: String(item.updatedAt || item.lastActivity || new Date().toISOString()),
      tokensUsed: typeof item.totalTokens === 'number' ? item.totalTokens : 0,
      messagesCount: typeof item.messagesCount === 'number' ? item.messagesCount : 0,
      participants: Array.isArray(item.participants) ? item.participants : [],
      metadata: item,
    }));
}

/** 根据 updatedAt 推断 session 活跃状态 */
function inferStatus(item: any): 'active' | 'idle' | 'inactive' {
  if (item.status) {
    const s = String(item.status).toLowerCase();
    if (s === 'active') return 'active';
    if (s === 'idle') return 'idle';
    return 'inactive';
  }
  // 根据最后活跃时间推断：2分钟内=active，30分钟内=idle，否则=inactive
  const lastActive = item.updatedAt || item.lastActivity;
  if (!lastActive) return 'inactive';
  const diffMs = Date.now() - new Date(lastActive).getTime();
  if (diffMs < 2 * 60 * 1000) return 'active';
  if (diffMs < 30 * 60 * 1000) return 'idle';
  return 'inactive';
}

export function setupSessionsIPC() {
  // 获取 session 列表
  ipcMain.handle('sessions:list', async (): Promise<Session[]> => {
    return getSessionsList();
  });

  // 获取单个 session 详情（openclaw 暂无独立 get 命令，从列表中查找）
  ipcMain.handle('sessions:get', async (_event, sessionId: string): Promise<Session | null> => {
    const sessions = await getSessionsList();
    return sessions.find((s) => s.id === sessionId) ?? null;
  });

  // 创建新 session
  ipcMain.handle('sessions:create', async (_event, agent: string, model?: string): Promise<{ success: boolean; sessionId?: string; error?: string }> => {
    const args = ['sessions', 'create', '--agent', agent];
    if (model) args.push('--model', model);
    args.push('--json');

    const result = await runCommand(args);
    const parsed = tryParseJson<any>(result.output);

    if (!result.success) {
      return { success: false, error: result.error || '创建会话失败' };
    }

    return {
      success: true,
      sessionId: parsed?.sessionId || parsed?.key || parsed?.id,
    };
  });

  // 向 session 发送消息
  ipcMain.handle('sessions:send', async (_event, sessionId: string, message: string): Promise<{ success: boolean; response?: string; error?: string }> => {
    const result = await runCommand(['sessions', 'send', sessionId, '--message', message, '--json']);
    const parsed = tryParseJson<any>(result.output);

    if (!result.success) {
      return { success: false, error: result.error || '发送消息失败' };
    }

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
    const parsed = tryParseJson<any>(result.output);
    if (!result.success) {
      return { success: false, error: result.error || '导入会话失败' };
    }
    return { success: true, sessionId: parsed?.sessionId || parsed?.id };
  });

  // 获取 session 统计
  ipcMain.handle('sessions:stats', async (): Promise<SessionStats> => {
    const sessions = await getSessionsList();
    const agents: Record<string, number> = {};
    for (const s of sessions) {
      agents[s.agent] = (agents[s.agent] || 0) + 1;
    }
    return {
      total: sessions.length,
      active: sessions.filter((s) => s.status === 'active').length,
      idle: sessions.filter((s) => s.status === 'idle').length,
      agents,
    };
  });

  // 清理 session（维护）
  ipcMain.handle('sessions:cleanup', async (_event, dryRun = true): Promise<{ success: boolean; output?: string; error?: string }> => {
    const args = ['sessions', 'cleanup', '--all-agents', '--json'];
    if (dryRun) args.push('--dry-run');
    else args.push('--enforce');

    const result = await runCommand(args);
    if (!result.success) {
      return { success: false, error: result.error || '清理会话失败' };
    }
    return { success: true, output: result.output };
  });
}
