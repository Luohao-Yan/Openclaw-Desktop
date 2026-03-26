import pkg from 'electron';
const { ipcMain } = pkg;
import { resolveOpenClawCommand, runCommand } from './settings.js';

export interface CronScheduleAt {
  kind: 'at';
  at: string;
  tz?: string;
}

export interface CronScheduleEvery {
  kind: 'every';
  every: string;
}

export interface CronScheduleCron {
  kind: 'cron';
  cron: string;
  tz?: string;
  stagger?: string;
}

export type CronScheduleDraft = CronScheduleAt | CronScheduleEvery | CronScheduleCron;

export interface CronPayloadSystemEvent {
  kind: 'systemEvent';
  text: string;
}

export interface CronPayloadAgentTurn {
  kind: 'agentTurn';
  message: string;
  model?: string;
  thinking?: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
  timeoutSeconds?: number;
  channel?: string;
  to?: string;
  deliver?: boolean;
  announce?: boolean;
  lightContext?: boolean;
  sessionId?: string;
  bestEffort?: boolean;
}

export type CronPayloadDraft = CronPayloadSystemEvent | CronPayloadAgentTurn;

export interface CronJobDraft {
  name: string;
  description?: string;
  agentId?: string;
  enabled?: boolean;
  sessionTarget?: 'main' | 'isolated';
  wakeMode?: 'now' | 'next-heartbeat';
  deleteAfterRun?: boolean;
  schedule: CronScheduleDraft;
  payload: CronPayloadDraft;
}

export interface CronJobRecord {
  id: string;
  name: string;
  enabled?: boolean;
  schedule?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  delivery?: Record<string, unknown>;
  session?: string;
  agentId?: string;
  status?: string;
  lastError?: string;
  consecutiveErrors?: number;
  lastDurationMs?: number;
  nextRunAt?: string;
  lastRunAt?: string;
  updatedAt?: string;
  createdAt?: string;
  raw?: Record<string, unknown>;
}

export interface CronRunRecord {
  id?: string;
  runId?: string;
  status?: string;
  startedAt?: string;
  finishedAt?: string;
  summary?: string;
  raw?: Record<string, unknown>;
}

function stripAnsi(value: string): string {
  // 覆盖所有 ANSI 转义序列，包括 24-bit 颜色、粗体、重置等
  return value
    .replace(/\u001b\[[0-9;]*[mGKHFABCDJsu]/g, '')
    .replace(/\x1B\[[0-9;]*[mGKHFABCDJsu]/g, '')
    .replace(/\u001b\][^\u0007]*\u0007/g, '') // OSC 序列
    .replace(/\u001b[()][AB012]/g, '');        // 字符集切换
}

function normalizeText(value?: string): string {
  if (!value) {
    return '';
  }

  return stripAnsi(value)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** 从错误输出中提取人类可读的错误信息，识别常见的配置错误模式 */
function extractErrorMessage(raw: string): string {
  const text = normalizeText(raw);
  if (!text) return '';

  // 识别 "Invalid config" 模式，提取核心错误行
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // 找到包含实际错误描述的行（去掉 File:/Problem:/Run: 前缀行）
  const meaningfulLines = lines.filter(l =>
    !l.startsWith('File:') &&
    !l.startsWith('Problem:') &&
    !l.startsWith('Run:') &&
    l.length > 0,
  );

  // 如果包含配置无效提示，附加修复建议
  if (text.includes('Config invalid') || text.includes('Invalid config')) {
    const problemLine = lines.find(l => l.startsWith('- ') || l.includes('Invalid input'));
    const core = problemLine || meaningfulLines[0] || text;
    return `配置文件无效：${core}\n请运行 openclaw doctor --fix 修复。`;
  }

  return meaningfulLines.slice(0, 3).join(' ') || text.slice(0, 200);
}

function tryParseJson<T>(value?: string): T | null {
  const text = normalizeText(value);
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function toResultMessage(result: { success: boolean; output: string; error?: string }, fallback: string) {
  // 优先从 error 字段提取可读信息，再尝试 output
  const raw = result.error || result.output || '';
  return extractErrorMessage(raw) || fallback;
}

function buildScheduleArgs(schedule: CronScheduleDraft): string[] {
  switch (schedule.kind) {
    case 'at':
      return [
        '--at',
        schedule.at,
        ...(schedule.tz ? ['--tz', schedule.tz] : []),
      ];
    case 'every':
      return ['--every', schedule.every];
    case 'cron':
      return [
        '--cron',
        schedule.cron,
        ...(schedule.tz ? ['--tz', schedule.tz] : []),
        ...(schedule.stagger ? ['--stagger', schedule.stagger] : []),
      ];
    default:
      return [];
  }
}

function buildPayloadArgs(payload: CronPayloadDraft, sessionTarget?: 'main' | 'isolated'): string[] {
  if (payload.kind === 'systemEvent') {
    const args = ['--system-event', payload.text];
    // 注意：mode 字段存储的是 wakeMode（now / next-heartbeat），
    // 已在 buildCronCreateArgs 中通过 --wake 传递，此处不再重复传递
    if (sessionTarget) {
      args.push('--session', sessionTarget);
    }
    return args;
  }

  const args = ['--message', payload.message];
  if (sessionTarget) {
    args.push('--session', sessionTarget);
  }
  if (payload.thinking) {
    args.push('--thinking', payload.thinking);
  }
  if (payload.model) {
    args.push('--model', payload.model);
  }
  if (typeof payload.timeoutSeconds === 'number' && Number.isFinite(payload.timeoutSeconds)) {
    args.push('--timeout', String(payload.timeoutSeconds));
  }
  if (payload.channel) {
    args.push('--channel', payload.channel);
  }
  if (payload.to) {
    args.push('--to', payload.to);
  }
  if (payload.sessionId) {
    args.push('--session-id', payload.sessionId);
  }
  if (payload.announce) {
    args.push('--announce');
  }
  if (payload.deliver === true) {
    args.push('--deliver');
  }
  if (payload.deliver === false) {
    args.push('--no-deliver');
  }
  if (payload.lightContext) {
    args.push('--light-context');
  }
  if (payload.bestEffort) {
    args.push('--best-effort');
  }
  return args;
}

function buildCronCreateArgs(input: CronJobDraft): string[] {
  const args = ['cron', 'add', '--name', input.name];

  if (input.description) {
    args.push('--description', input.description);
  }
  if (input.agentId) {
    args.push('--agent', input.agentId);
  }
  if (input.enabled === false) {
    args.push('--disable');
  }
  if (input.wakeMode) {
    args.push('--wake', input.wakeMode);
  }
  if (input.deleteAfterRun) {
    args.push('--delete-after-run');
  }

  args.push(...buildScheduleArgs(input.schedule));
  args.push(...buildPayloadArgs(input.payload, input.sessionTarget));

  return args;
}

function buildCronEditArgs(jobId: string, patch: Partial<CronJobDraft>): string[] {
  const args = ['cron', 'edit', jobId];

  if (patch.name) {
    args.push('--name', patch.name);
  }
  if (typeof patch.description === 'string') {
    args.push('--description', patch.description);
  }
  if (patch.agentId) {
    args.push('--agent', patch.agentId);
  }
  if (patch.agentId === null) {
    args.push('--clear-agent');
  }
  if (typeof patch.enabled === 'boolean') {
    args.push(patch.enabled ? '--enable' : '--disable');
  }
  if (patch.wakeMode) {
    args.push('--wake', patch.wakeMode);
  }
  if (patch.deleteAfterRun) {
    args.push('--delete-after-run');
  }
  if (patch.schedule) {
    args.push(...buildScheduleArgs(patch.schedule));
  }
  if (patch.payload) {
    args.push(...buildPayloadArgs(patch.payload, patch.sessionTarget));
  } else if (patch.sessionTarget) {
    args.push('--session', patch.sessionTarget);
  }

  return args;
}

function normalizeCronJob(raw: Record<string, unknown>, index: number): CronJobRecord {
  // 从 state 对象中提取运行状态（jobs.json 格式）
  const state = typeof raw.state === 'object' && raw.state !== null
    ? raw.state as Record<string, unknown>
    : {};

  // nextRunAt：优先用 state.nextRunAtMs（毫秒时间戳），转为 ISO 字符串
  const nextRunAtMs = typeof state.nextRunAtMs === 'number' ? state.nextRunAtMs : null;
  const nextRunAt = nextRunAtMs ? new Date(nextRunAtMs).toISOString() : undefined;

  // lastRunAt：同上
  const lastRunAtMs = typeof state.lastRunAtMs === 'number' ? state.lastRunAtMs : null;
  const lastRunAt = lastRunAtMs ? new Date(lastRunAtMs).toISOString() : undefined;

  // createdAt / updatedAt：jobs.json 用 Ms 后缀
  const createdAtMs = typeof raw.createdAtMs === 'number' ? raw.createdAtMs : null;
  const updatedAtMs = typeof raw.updatedAtMs === 'number' ? raw.updatedAtMs : null;

  return {
    id: String(raw.id || raw.jobId || `cron-${index}`),
    name: String(raw.name || raw.title || `Cron Job ${index + 1}`),
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : undefined,
    schedule: typeof raw.schedule === 'object' && raw.schedule !== null
      ? raw.schedule as Record<string, unknown>
      : undefined,
    payload: typeof raw.payload === 'object' && raw.payload !== null
      ? raw.payload as Record<string, unknown>
      : undefined,
    delivery: typeof raw.delivery === 'object' && raw.delivery !== null
      ? raw.delivery as Record<string, unknown>
      : undefined,
    session: typeof raw.sessionTarget === 'string'
      ? raw.sessionTarget
      : typeof raw.session === 'string'
        ? raw.session
        : undefined,
    agentId: typeof raw.agentId === 'string' ? raw.agentId : undefined,
    // 运行状态来自 state 子对象
    status: typeof state.lastRunStatus === 'string' ? state.lastRunStatus
      : typeof state.lastStatus === 'string' ? state.lastStatus : undefined,
    lastError: typeof state.lastError === 'string' ? state.lastError : undefined,
    consecutiveErrors: typeof state.consecutiveErrors === 'number' ? state.consecutiveErrors : undefined,
    lastDurationMs: typeof state.lastDurationMs === 'number' ? state.lastDurationMs : undefined,
    nextRunAt,
    lastRunAt,
    updatedAt: updatedAtMs ? new Date(updatedAtMs).toISOString() : undefined,
    createdAt: createdAtMs ? new Date(createdAtMs).toISOString() : undefined,
    raw,
  };
}

function normalizeCronRun(raw: Record<string, unknown>): CronRunRecord {
  return {
    id: typeof raw.id === 'string' ? raw.id : undefined,
    runId: typeof raw.runId === 'string' ? raw.runId : undefined,
    status: typeof raw.status === 'string' ? raw.status : undefined,
    startedAt: typeof raw.startedAt === 'string' ? raw.startedAt : undefined,
    finishedAt: typeof raw.finishedAt === 'string' ? raw.finishedAt : undefined,
    summary: typeof raw.summary === 'string'
      ? raw.summary
      : typeof raw.message === 'string'
        ? raw.message
        : undefined,
    raw,
  };
}

export async function cronList(includeAll = true): Promise<{ success: boolean; jobs: CronJobRecord[]; error?: string }> {
  // 直接读取 ~/.openclaw/cron/jobs.json，绕过 CLI 配置校验问题
  try {
    const os = await import('os');
    const fs = await import('fs/promises');
    const path = await import('path');

    const jobsPath = path.join(os.homedir(), '.openclaw', 'cron', 'jobs.json');
    const raw = await fs.readFile(jobsPath, 'utf-8');
    const parsed = JSON.parse(raw) as { version?: number; jobs?: unknown[] };

    const list = Array.isArray(parsed.jobs) ? parsed.jobs : [];

    return {
      success: true,
      jobs: list
        .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
        .map(normalizeCronJob),
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // 文件不存在时返回空列表（cron 功能未使用过）
    if (msg.includes('ENOENT')) {
      return { success: true, jobs: [] };
    }
    return { success: false, jobs: [], error: `读取 cron 任务失败：${msg}` };
  }
}

export async function cronStatus(): Promise<{ success: boolean; status?: Record<string, unknown>; error?: string }> {
  const result = await runCommand(resolveOpenClawCommand(), ['cron', 'status', '--json']);
  const parsed = tryParseJson<Record<string, unknown>>(result.output);

  if (!result.success && !parsed) {
    return {
      success: false,
      error: toResultMessage(result, '读取 cron 状态失败'),
    };
  }

  return {
    success: true,
    status: parsed || {},
  };
}

export async function cronCreate(input: CronJobDraft) {
  const args = buildCronCreateArgs(input);
  const result = await runCommand(resolveOpenClawCommand(), args);
  const parsed = tryParseJson<Record<string, unknown>>(result.output);

  if (!result.success) {
    return {
      success: false,
      error: toResultMessage(result, '创建 cron 任务失败'),
    };
  }

  return {
    success: true,
    data: parsed || { output: normalizeText(result.output) },
  };
}

export async function cronEdit(jobId: string, patch: Partial<CronJobDraft>) {
  const args = buildCronEditArgs(jobId, patch);
  const result = await runCommand(resolveOpenClawCommand(), args);
  const parsed = tryParseJson<Record<string, unknown>>(result.output);

  if (!result.success) {
    return {
      success: false,
      error: toResultMessage(result, '更新 cron 任务失败'),
    };
  }

  return {
    success: true,
    data: parsed || { output: normalizeText(result.output) },
  };
}

export async function cronRemove(jobId: string) {
  const result = await runCommand(resolveOpenClawCommand(), ['cron', 'rm', jobId]);
  if (!result.success) {
    return {
      success: false,
      error: toResultMessage(result, '删除 cron 任务失败'),
    };
  }

  return {
    success: true,
    message: normalizeText(result.output) || `cron 任务 ${jobId} 已删除`,
  };
}

export async function cronEnable(jobId: string) {
  const result = await runCommand(resolveOpenClawCommand(), ['cron', 'enable', jobId]);
  if (!result.success) {
    return {
      success: false,
      error: toResultMessage(result, '启用 cron 任务失败'),
    };
  }

  return {
    success: true,
    message: normalizeText(result.output) || `cron 任务 ${jobId} 已启用`,
  };
}

export async function cronDisable(jobId: string) {
  const result = await runCommand(resolveOpenClawCommand(), ['cron', 'disable', jobId]);
  if (!result.success) {
    return {
      success: false,
      error: toResultMessage(result, '禁用 cron 任务失败'),
    };
  }

  return {
    success: true,
    message: normalizeText(result.output) || `cron 任务 ${jobId} 已禁用`,
  };
}

export async function cronRun(jobId: string, _force = false) {
  // 注意：openclaw cron run 不支持 --force 选项，直接执行即可
  const args = ['cron', 'run', jobId];

  // cron 任务执行时间较长（涉及 Agent 调用、网络请求等），超时设为 5 分钟
  const result = await runCommand(resolveOpenClawCommand(), args, { timeoutMs: 300_000 });
  const parsed = tryParseJson<Record<string, unknown>>(result.output);

  if (!result.success) {
    return {
      success: false,
      error: toResultMessage(result, '执行 cron 任务失败'),
    };
  }

  return {
    success: true,
    data: parsed || { output: normalizeText(result.output) },
  };
}

export async function cronRuns(jobId: string, limit = 10) {
  const result = await runCommand(resolveOpenClawCommand(), ['cron', 'runs', '--id', jobId, '--limit', String(limit)]);
  const parsed = tryParseJson<unknown>(result.output);

  if (!result.success && !parsed) {
    return {
      success: false,
      runs: [] as CronRunRecord[],
      error: toResultMessage(result, '读取 cron 运行记录失败'),
    };
  }

  const list = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as any)?.runs)
      ? (parsed as any).runs
      : Array.isArray((parsed as any)?.items)
        ? (parsed as any).items
        : [];

  return {
    success: true,
    runs: list
      .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
      .map(normalizeCronRun),
  };
}

export function setupCronIPC() {
  ipcMain.handle('cron:list', async (_, includeAll?: boolean) => cronList(includeAll !== false));
  ipcMain.handle('cron:status', cronStatus);
  ipcMain.handle('cron:create', async (_, payload: CronJobDraft) => cronCreate(payload));
  ipcMain.handle('cron:add', async (_, payload: CronJobDraft) => cronCreate(payload));
  ipcMain.handle('cron:edit', async (_, jobId: string, patch: Partial<CronJobDraft>) => cronEdit(jobId, patch));
  ipcMain.handle('cron:remove', async (_, jobId: string) => cronRemove(jobId));
  ipcMain.handle('cron:enable', async (_, jobId: string) => cronEnable(jobId));
  ipcMain.handle('cron:disable', async (_, jobId: string) => cronDisable(jobId));
  ipcMain.handle('cron:run', async (_, jobId: string, force?: boolean) => cronRun(jobId, Boolean(force)));
  ipcMain.handle('cron:runs', async (_, jobId: string, limit?: number) => cronRuns(jobId, limit || 10));
}
