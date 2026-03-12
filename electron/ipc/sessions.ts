import pkg from 'electron';
const { ipcMain } = pkg;
import { spawn } from 'child_process';
import { resolveOpenClawCommand } from './settings.js';

export interface Session {
  id: string;
  name: string;
  status: 'active' | 'idle' | 'inactive';
  agent: string;
  model: string;
  channel: string;
  channelId: string;
  createdAt: string;
  lastActivity: string;
  tokensUsed: number;
  messagesCount: number;
  participants: string[];
  metadata?: Record<string, any>;
}

export interface SessionDetail extends Session {
  messages?: {
    id: string;
    content: string;
    role: 'user' | 'assistant' | 'system';
    timestamp: string;
    tokens: number;
  }[];
  settings?: {
    temperature: number;
    maxTokens: number;
    contextWindow: number;
    stream: boolean;
  };
  resources?: {
    files: string[];
    tools: string[];
    skills: string[];
  };
}

async function runCommand(cmd: string, args: string[]): Promise<{ success: boolean; output: string; error?: string }> {
  return new Promise((resolve) => {
    try {
      const child = spawn(cmd, args);
      let output = '';
      let errorOutput = '';
      let settled = false;

      const finish = (result: { success: boolean; output: string; error?: string }) => {
        if (settled) {
          return;
        }
        settled = true;
        resolve(result);
      };

      child.stdout.on('data', (data) => {
        output += data.toString();
      });

      child.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          finish({ success: true, output });
          return;
        }
        finish({
          success: false,
          output: output || errorOutput,
          error: errorOutput || `Command failed with exit code ${code}`
        });
      });

      child.on('error', (error) => {
        finish({
          success: false,
          output: '',
          error: error.message
        });
      });

      // 超时保护
      setTimeout(() => {
        if (!settled) {
          child.kill('SIGTERM');
          finish({
            success: false,
            output: '',
            error: 'Command timeout'
          });
        }
      }, 30000);
    } catch (error: any) {
      resolve({
        success: false,
        output: '',
        error: error.message
      });
    }
  });
}

async function getSessionsList(): Promise<Session[]> {
  try {
    const openclawCmd = await resolveOpenClawCommand();
    const result = await runCommand(openclawCmd, ['sessions', '--json', '--all-agents']);
    
    if (!result.success) {
      console.error('Failed to get sessions list:', result.error);
      return [];
    }

    try {
      const payload = JSON.parse(result.output);
      const rawSessions = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.items)
          ? payload.items
          : Array.isArray(payload?.sessions)
            ? payload.sessions
            : [];

      return rawSessions.map((item: any) => ({
        id: item.sessionId || item.id || item.key,
        name: item.name || item.sessionId || item.key || 'Unnamed Session',
        status: item.status || 'inactive',
        agent: item.agentId || item.agent || 'unknown',
        model: item.model || 'unknown',
        channel: item.channel || item.kind || 'unknown',
        channelId: item.channelId || item.key || item.sessionId || 'unknown',
        createdAt: item.createdAt || (item.updatedAt ? new Date(item.updatedAt).toISOString() : new Date().toISOString()),
        lastActivity: item.lastActivity || (item.updatedAt ? new Date(item.updatedAt).toISOString() : new Date().toISOString()),
        tokensUsed: typeof item.totalTokens === 'number' ? item.totalTokens : 0,
        messagesCount: typeof item.messagesCount === 'number' ? item.messagesCount : 0,
        participants: Array.isArray(item.participants) ? item.participants : [],
        metadata: item,
      }));
    } catch (parseError) {
      console.error('Failed to parse sessions list:', parseError);
      return [];
    }
  } catch (error) {
    console.error('Error getting sessions list:', error);
    return [];
  }
}

async function getSessionDetail(sessionId: string): Promise<SessionDetail | null> {
  try {
    const openclawCmd = await resolveOpenClawCommand();
    const result = await runCommand(openclawCmd, ['sessions', 'get', sessionId, '--json']);
    
    if (!result.success) {
      console.error('Failed to get session detail:', result.error);
      return null;
    }

    try {
      const sessionDetail = JSON.parse(result.output);
      return sessionDetail;
    } catch (parseError) {
      console.error('Failed to parse session detail:', parseError);
      return null;
    }
  } catch (error) {
    console.error('Error getting session detail:', error);
    return null;
  }
}

async function sendMessageToSession(sessionId: string, message: string): Promise<{ success: boolean; response?: string; error?: string }> {
  try {
    const openclawCmd = await resolveOpenClawCommand();
    const result = await runCommand(openclawCmd, ['sessions', 'send', sessionId, '--message', message, '--json']);
    
    if (!result.success) {
      return {
        success: false,
        error: result.error
      };
    }

    try {
      const response = JSON.parse(result.output);
      return {
        success: true,
        response: response.text || response.output
      };
    } catch (parseError) {
      return {
        success: false,
        error: 'Failed to parse response'
      };
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message
    };
  }
}

async function createSession(agent: string, model?: string): Promise<{ success: boolean; sessionId?: string; error?: string }> {
  try {
    const openclawCmd = await resolveOpenClawCommand();
    const args = ['sessions', 'create', '--agent', agent];
    
    if (model) {
      args.push('--model', model);
    }
    
    args.push('--json');
    
    const result = await runCommand(openclawCmd, args);
    
    if (!result.success) {
      return {
        success: false,
        error: result.error
      };
    }

    try {
      const response = JSON.parse(result.output);
      return {
        success: true,
        sessionId: response.sessionId || response.id
      };
    } catch (parseError) {
      return {
        success: false,
        error: 'Failed to parse response'
      };
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message
    };
  }
}

async function closeSession(sessionId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const openclawCmd = await resolveOpenClawCommand();
    const result = await runCommand(openclawCmd, ['sessions', 'close', sessionId, '--json']);
    
    if (!result.success) {
      return {
        success: false,
        error: result.error
      };
    }

    return {
      success: true
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message
    };
  }
}

async function exportSession(sessionId: string, format: 'json' | 'markdown' = 'json'): Promise<{ success: boolean; data?: string; error?: string }> {
  try {
    const openclawCmd = await resolveOpenClawCommand();
    const result = await runCommand(openclawCmd, ['sessions', 'export', sessionId, '--format', format, '--json']);
    
    if (!result.success) {
      return {
        success: false,
        error: result.error
      };
    }

    try {
      const response = JSON.parse(result.output);
      return {
        success: true,
        data: response.data || response.output
      };
    } catch (parseError) {
      return {
        success: false,
        error: 'Failed to parse response'
      };
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message
    };
  }
}

async function importSession(data: string, format: 'json' | 'markdown' = 'json'): Promise<{ success: boolean; sessionId?: string; error?: string }> {
  try {
    const openclawCmd = await resolveOpenClawCommand();
    const result = await runCommand(openclawCmd, ['sessions', 'import', '--data', data, '--format', format, '--json']);
    
    if (!result.success) {
      return {
        success: false,
        error: result.error
      };
    }

    try {
      const response = JSON.parse(result.output);
      return {
        success: true,
        sessionId: response.sessionId || response.id
      };
    } catch (parseError) {
      return {
        success: false,
        error: 'Failed to parse response'
      };
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message
    };
  }
}

export function setupSessionsIPC() {
  // 获取会话列表
  ipcMain.handle('sessions:list', async (): Promise<Session[]> => {
    return await getSessionsList();
  });

  // 获取会话详情
  ipcMain.handle('sessions:get', async (event, sessionId: string): Promise<SessionDetail | null> => {
    return await getSessionDetail(sessionId);
  });

  // 创建新会话
  ipcMain.handle('sessions:create', async (event, agent: string, model?: string): Promise<{ success: boolean; sessionId?: string; error?: string }> => {
    return await createSession(agent, model);
  });

  // 向会话发送消息
  ipcMain.handle('sessions:send', async (event, sessionId: string, message: string): Promise<{ success: boolean; response?: string; error?: string }> => {
    return await sendMessageToSession(sessionId, message);
  });

  // 关闭会话
  ipcMain.handle('sessions:close', async (event, sessionId: string): Promise<{ success: boolean; error?: string }> => {
    return await closeSession(sessionId);
  });

  // 导出会话
  ipcMain.handle('sessions:export', async (event, sessionId: string, format: 'json' | 'markdown'): Promise<{ success: boolean; data?: string; error?: string }> => {
    return await exportSession(sessionId, format);
  });

  // 导入会话
  ipcMain.handle('sessions:import', async (event, data: string, format: 'json' | 'markdown'): Promise<{ success: boolean; sessionId?: string; error?: string }> => {
    return await importSession(data, format);
  });

  // 获取活跃会话统计
  ipcMain.handle('sessions:stats', async (): Promise<{ total: number; active: number; idle: number; agents: Record<string, number> }> => {
    const sessions = await getSessionsList();
    const stats = {
      total: sessions.length,
      active: sessions.filter(s => s.status === 'active').length,
      idle: sessions.filter(s => s.status === 'idle').length,
      agents: {} as Record<string, number>
    };

    sessions.forEach(session => {
      stats.agents[session.agent] = (stats.agents[session.agent] || 0) + 1;
    });

    return stats;
  });

  console.log('Sessions IPC handlers registered');
}