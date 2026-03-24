/**
 * 单元测试：Agent 导入 CLI 参数修复
 * Bugfix: agent-import-cli-args-fix
 *
 * 验证 buildImportAgentCreateArgs、resolveImportWorkspacePath 的具体行为，
 * 以及名称冲突场景下的参数构建正确性。
 */

import { describe, it, expect } from 'vitest';
import {
  buildImportAgentCreateArgs,
  resolveImportWorkspacePath,
  resolveAgentName,
} from '../agentExchangeLogic';

// ─── buildImportAgentCreateArgs ─────────────────────────────────────────────

describe('buildImportAgentCreateArgs', () => {
  it('输出包含正确的位置参数格式（agents add <name>）', () => {
    const args = buildImportAgentCreateArgs({
      name: 'my-agent',
      workspace: '/home/user/.openclaw/workspace-my-agent',
    });

    expect(args[0]).toBe('agents');
    expect(args[1]).toBe('add');
    expect(args[2]).toBe('my-agent');
  });

  it('输出包含 --workspace 参数及正确的路径值', () => {
    const args = buildImportAgentCreateArgs({
      name: 'test-agent',
      workspace: '/tmp/openclaw/workspace-test-agent',
    });

    const wsIndex = args.indexOf('--workspace');
    expect(wsIndex).toBeGreaterThan(-1);
    expect(args[wsIndex + 1]).toBe('/tmp/openclaw/workspace-test-agent');
  });

  it('输出不包含 --name 选项（修复前的错误格式）', () => {
    const args = buildImportAgentCreateArgs({
      name: 'my-agent',
      workspace: '/home/user/.openclaw/workspace-my-agent',
    });

    expect(args).not.toContain('--name');
  });

  it('输出包含 --non-interactive 和 --json 标志', () => {
    const args = buildImportAgentCreateArgs({
      name: 'my-agent',
      workspace: '/home/user/.openclaw/workspace-my-agent',
    });

    expect(args).toContain('--non-interactive');
    expect(args).toContain('--json');
  });

  it('自动 trim 名称和路径中的前后空白', () => {
    const args = buildImportAgentCreateArgs({
      name: '  spaced-agent  ',
      workspace: '  /tmp/ws  ',
    });

    expect(args[2]).toBe('spaced-agent');
    const wsIndex = args.indexOf('--workspace');
    expect(args[wsIndex + 1]).toBe('/tmp/ws');
  });
});

// ─── resolveImportWorkspacePath ─────────────────────────────────────────────

describe('resolveImportWorkspacePath', () => {
  it('返回 openclawRoot/workspace-<agentName> 格式的路径', () => {
    const result = resolveImportWorkspacePath('/home/user/.openclaw', 'my-agent');
    expect(result).toBe('/home/user/.openclaw/workspace-my-agent');
  });

  it('处理末尾无斜杠的根目录路径', () => {
    const result = resolveImportWorkspacePath('/tmp/openclaw', 'test');
    expect(result).toBe('/tmp/openclaw/workspace-test');
  });

  it('处理包含数字后缀的冲突解决名称', () => {
    const result = resolveImportWorkspacePath('/home/user/.openclaw', 'my-agent-2');
    expect(result).toBe('/home/user/.openclaw/workspace-my-agent-2');
  });
});

// ─── 名称冲突场景下的参数构建 ───────────────────────────────────────────────

describe('名称冲突场景下参数构建正确', () => {
  it('resolveAgentName 返回 name-2 时，参数中使用解析后的名称', () => {
    // 模拟名称冲突：my-agent 已存在
    const resolvedName = resolveAgentName('my-agent', ['my-agent']);
    expect(resolvedName).toBe('my-agent-2');

    // 使用解析后的名称构建参数
    const workspace = resolveImportWorkspacePath('/home/user/.openclaw', resolvedName);
    const args = buildImportAgentCreateArgs({ name: resolvedName, workspace });

    // 验证参数中使用的是解析后的名称
    expect(args[2]).toBe('my-agent-2');
    // workspace 路径也使用解析后的名称
    const wsIndex = args.indexOf('--workspace');
    expect(args[wsIndex + 1]).toBe('/home/user/.openclaw/workspace-my-agent-2');
  });

  it('多次冲突时（name-3）参数构建仍然正确', () => {
    const resolvedName = resolveAgentName('agent', ['agent', 'agent-2']);
    expect(resolvedName).toBe('agent-3');

    const workspace = resolveImportWorkspacePath('/tmp/.openclaw', resolvedName);
    const args = buildImportAgentCreateArgs({ name: resolvedName, workspace });

    expect(args[2]).toBe('agent-3');
    expect(args).not.toContain('--name');
    expect(args).toContain('--workspace');
  });
});
