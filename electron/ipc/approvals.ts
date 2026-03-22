import pkg from 'electron';
const { ipcMain } = pkg;
import { resolveOpenClawCommand, runCommand } from './settings.js';

// ── 类型定义 ──────────────────────────────────────────────────────────────────

/** allowlist 中的单条规则 */
export interface ApprovalAllowlistEntry {
  pattern: string;       // glob 路径模式，如 "~/Projects/**/bin/rg"
  agent?: string;        // 适用的 agent id，"*" 表示全部
  nodeId?: string;       // 适用的 node id（可选）
}

/** approvals get 返回的原始数据结构 */
export interface ApprovalsData {
  allowlist?: ApprovalAllowlistEntry[];
  raw?: unknown;
}

/** 操作目标：本地 / gateway / 指定 node */
export type ApprovalsTarget =
  | { kind: 'local' }
  | { kind: 'gateway' }
  | { kind: 'node'; nodeId: string };

// ── 内部工具函数 ──────────────────────────────────────────────────────────────

/** 将 ApprovalsTarget 转换为 CLI 参数片段 */
function targetArgs(target: ApprovalsTarget): string[] {
  if (target.kind === 'gateway') return ['--gateway'];
  if (target.kind === 'node') return ['--node', target.nodeId];
  return [];
}

// ── 核心操作函数 ──────────────────────────────────────────────────────────────

/**
 * 获取 approvals 数据（本地 / gateway / node）
 * 对应：openclaw approvals get [--gateway | --node <id>]
 */
export async function approvalsGet(
  target: ApprovalsTarget,
): Promise<{ success: boolean; data?: ApprovalsData; raw?: string; error?: string }> {
  const cmd = resolveOpenClawCommand();
  const args = ['approvals', 'get', '--json', ...targetArgs(target)];
  const result = await runCommand(cmd, args);

  if (!result.success && !result.output) {
    return { success: false, error: result.error || '获取 approvals 失败' };
  }

  try {
    const parsed = JSON.parse(result.output) as ApprovalsData;
    return { success: true, data: parsed, raw: result.output };
  } catch {
    // CLI 可能不支持 --json，返回原始文本
    return { success: true, data: { raw: result.output }, raw: result.output };
  }
}

/**
 * 向 allowlist 添加一条规则
 * 对应：openclaw approvals allowlist add [--agent <id>] [--node <id>] "<pattern>"
 */
export async function approvalsAllowlistAdd(
  pattern: string,
  agent: string,
  target: ApprovalsTarget,
): Promise<{ success: boolean; error?: string }> {
  const cmd = resolveOpenClawCommand();
  const args = ['approvals', 'allowlist', 'add'];

  if (agent && agent !== '*') args.push('--agent', agent);
  else if (agent === '*') args.push('--agent', '*');

  args.push(...targetArgs(target));
  args.push(pattern);

  const result = await runCommand(cmd, args);
  return { success: result.success, error: result.success ? undefined : (result.error || result.output || '添加失败') };
}

/**
 * 从 allowlist 移除一条规则
 * 对应：openclaw approvals allowlist remove "<pattern>"
 */
export async function approvalsAllowlistRemove(
  pattern: string,
): Promise<{ success: boolean; error?: string }> {
  const cmd = resolveOpenClawCommand();
  const result = await runCommand(cmd, ['approvals', 'allowlist', 'remove', pattern]);
  return { success: result.success, error: result.success ? undefined : (result.error || result.output || '移除失败') };
}

// ── IPC 注册 ──────────────────────────────────────────────────────────────────

export function setupApprovalsIPC() {
  // 获取 approvals
  ipcMain.handle('approvals:get', async (_, target: ApprovalsTarget) =>
    approvalsGet(target),
  );

  // allowlist 添加
  ipcMain.handle(
    'approvals:allowlist:add',
    async (_, pattern: string, agent: string, target: ApprovalsTarget) =>
      approvalsAllowlistAdd(pattern, agent, target),
  );

  // allowlist 移除
  ipcMain.handle('approvals:allowlist:remove', async (_, pattern: string) =>
    approvalsAllowlistRemove(pattern),
  );
}
