import pkg from 'electron';
const { ipcMain } = pkg;
import { spawn } from 'child_process';
import { resolveOpenClawCommand } from './settings.js';

export interface Task {
  id: string;
  name: string;
  status: 'running' | 'stopped' | 'completed' | 'failed';
  startedAt?: string;
  updatedAt?: string;
  command?: string;
  sessionKey?: string;
  agent?: string;
  model?: string;
  tokensUsed?: number;
  error?: string;
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
          output,
          error: errorOutput || `Command exited with code ${code}`,
        });
      });

      child.on('error', (error) => {
        finish({ success: false, output, error: error.message });
      });

      setTimeout(() => {
        try {
          child.kill();
        } catch {
        }
        finish({ success: false, output, error: 'Command timeout' });
      }, 8000);
    } catch (error: any) {
      resolve({ success: false, output: '', error: error.message });
    }
  });
}

function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/g, '').replace(/\x1B\[[0-9;]*m/g, '');
}

function normalizeText(value?: string): string {
  if (!value) {
    return '';
  }

  return stripAnsi(value)
    .replace(/\s+/g, ' ')
    .replace(/^\s+|\s+$/g, '');
}

function dedupeTasks(tasks: Task[]): Task[] {
  const seen = new Set<string>();
  return tasks.filter((task) => {
    const key = `${task.id}:${task.name}:${task.status}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export async function tasksGet(): Promise<Task[]> {
  try {
    const result = await runCommand(resolveOpenClawCommand(), ['status', '--json']);
    const output = normalizeText(result.output);

    if (!result.success && !output) {
      return [{
        id: 'error',
        name: '获取任务失败',
        status: 'failed',
        error: result.error,
      }];
    }

    try {
      const data = JSON.parse(output);
      return dedupeTasks(parseTasks(data));
    } catch (parseError) {
      return dedupeTasks(parseTextTasks(result.output || output));
    }
  } catch (error: any) {
    console.error('获取任务失败:', error);
    return [{ 
      id: 'error', 
      name: '获取任务失败', 
      status: 'failed',
      error: error.message
    }];
  }
}

export async function tasksKill(taskId: string): Promise<{ success: boolean; message: string }> {
  try {
    const result = await runCommand(resolveOpenClawCommand(), ['kill', taskId]);
    if (!result.success) {
      return {
        success: false,
        message: `终止任务失败: ${result.error}`,
      };
    }
    return { success: true, message: `任务 ${taskId} 已终止` };
  } catch (error: any) {
    return { 
      success: false, 
      message: `终止任务失败: ${error.message}` 
    };
  }
}

export async function tasksDetails(taskId: string): Promise<Task | null> {
  try {
    const tasks = await tasksGet();
    return tasks.find(task => task.id === taskId) || null;
  } catch (error) {
    console.error('获取任务详情失败:', error);
    return null;
  }
}

// 解析 JSON 格式的任务数据
function parseTasks(data: any): Task[] {
  if (Array.isArray(data)) {
    return data.map(item => ({
      id: item.id || item.sessionKey || `task-${Math.random().toString(36).slice(2, 9)}`,
      name: normalizeText(item.name || item.command || item.agent || '未知任务'),
      status: mapStatus(item.status),
      startedAt: item.startedAt || item.createdAt,
      updatedAt: item.updatedAt,
      command: normalizeText(item.command),
      sessionKey: item.sessionKey,
      agent: normalizeText(item.agent),
      model: normalizeText(item.model),
      tokensUsed: item.tokensUsed,
      error: normalizeText(item.error),
    }));
  }
  
  if (data.sessions || data.tasks) {
    const sessions = data.sessions || data.tasks || [];
    return sessions.map((item: any) => ({
      id: item.sessionKey || item.id || `task-${Math.random().toString(36).slice(2, 9)}`,
      name: normalizeText(item.name || item.agent || item.command || '未知任务'),
      status: mapStatus(item.status),
      startedAt: item.createdAt || item.startedAt,
      updatedAt: item.updatedAt,
      command: normalizeText(item.command),
      agent: normalizeText(item.agent),
      model: normalizeText(item.model),
      tokensUsed: item.tokensUsed,
      error: normalizeText(item.error),
    }));
  }
  
  return [];
}

function parseTextTasks(output: string): Task[] {
  const lines = output
    .split('\n')
    .map((line) => normalizeText(line))
    .filter((line) => line.trim());
  const tasks: Task[] = [];
  
  lines.forEach((line, index) => {
    if (/^(task[-_\w]+|session[-_\w]+)/i.test(line) || /\b(session|task)\b.+\b(running|active|stopped|failed|completed)\b/i.test(line)) {
      tasks.push({
        id: `task-${index}`,
        name: line.trim(),
        status: mapStatus(line),
        startedAt: new Date().toISOString(),
      });
    }
  });
  
  if (tasks.length === 0) {
    tasks.push({
      id: 'no-tasks',
      name: '当前没有运行中的任务',
      status: 'completed'
    });
  }
  
  return tasks;
}

// 映射状态
function mapStatus(status: any): Task['status'] {
  if (!status) return 'stopped';
  
  const statusStr = String(status).toLowerCase();
  if (statusStr.includes('running') || statusStr.includes('active')) {
    return 'running';
  } else if (statusStr.includes('completed') || statusStr.includes('finished')) {
    return 'completed';
  } else if (statusStr.includes('failed') || statusStr.includes('error')) {
    return 'failed';
  } else {
    return 'stopped';
  }
}

// IPC 设置函数
export function setupTasksIPC() {
  ipcMain.handle('tasks:get', tasksGet);
  ipcMain.handle('tasks:kill', (_, id) => tasksKill(id));
  ipcMain.handle('tasks:details', (_, id) => tasksDetails(id));
}