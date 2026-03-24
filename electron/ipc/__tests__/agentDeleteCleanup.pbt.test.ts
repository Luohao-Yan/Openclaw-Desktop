/**
 * 属性测试：Bug Condition 探索 — 删除 Agent 后 Workspace 目录未被清理
 * Bugfix: agent-delete-workspace-cleanup
 *
 * 本文件编码了修复后的期望行为。在未修复代码上运行时，
 * 测试应失败，从而确认 bug 存在。
 *
 * Property 1: Bug Condition
 * - 删除 Agent 后 Workspace 目录未被清理
 * - 当前 agents:delete handler 在 CLI 成功后不执行任何 workspace 清理
 * - buildDeleteCleanupPlan 对有效输入始终返回 shouldCleanWorkspace === false
 */

import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  buildDeleteCleanupPlan,
  resolveWorkspacePath,
  resolveNestedWorkspacePath,
  type AgentRecord,
  type DeleteCleanupInput,
} from '../agentDeleteCleanupLogic';

// ── 常量 ──────────────────────────────────────────────────────────

const OPENCLAW_ROOT = '/Users/dev/.openclaw';

// ── 生成器（Arbitraries）──────────────────────────────────────────

/**
 * 生成有效的 Agent ID（非空、无空白、仅含合法字符）
 */
const validAgentIdArb = fc.string({ minLength: 1, maxLength: 32 })
  .filter(s => s.trim().length > 0 && /^[a-zA-Z0-9._-]+$/.test(s));

/**
 * 生成有效的 workspace 路径字符串
 */
const workspacePathArb = fc.tuple(
  fc.constantFrom('/Users/dev/.openclaw/', '/home/user/.openclaw/', '/tmp/openclaw/'),
  fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z0-9._-]+$/.test(s)),
).map(([prefix, name]) => `${prefix}workspace-${name}`);

/**
 * 生成有效的 OpenClaw 根目录路径
 */
const openclawRootArb = fc.constantFrom(
  '/Users/dev/.openclaw',
  '/home/user/.openclaw',
  '/tmp/openclaw',
);

/**
 * 生成包含直接路径 workspace 的 AgentRecord
 * 场景：workspace-{agentId} 位于 OpenClaw 根目录下
 */
const directPathAgentRecordArb = (agentId: string): fc.Arbitrary<AgentRecord> =>
  fc.record({
    id: fc.constant(agentId),
    name: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
  }).map(rec => rec as AgentRecord);

/**
 * 生成包含配置字段 workspace 路径的 AgentRecord
 * 场景：workspace 路径来自 agent.workspace / agent.workspaceRoot
 */
const configFieldAgentRecordArb = (agentId: string): fc.Arbitrary<AgentRecord> =>
  fc.record({
    id: fc.constant(agentId),
    name: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
    workspace: workspacePathArb,
  }).map(rec => rec as AgentRecord);

/**
 * 生成包含嵌套路径 workspace 的 AgentRecord
 * 场景：workspace 位于 agents/{id}/workspace-{id}
 */
const nestedPathAgentRecordArb = (agentId: string): fc.Arbitrary<AgentRecord> =>
  fc.record({
    id: fc.constant(agentId),
    name: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
  }).map(rec => rec as AgentRecord);

// ============================================================
// Property 1: Bug Condition 探索测试
// Bugfix: agent-delete-workspace-cleanup
//
// 在未修复代码上运行——预期结果：测试失败
// 测试失败即确认 bug 存在
// ============================================================

describe('Bugfix: agent-delete-workspace-cleanup, Property 1: Bug Condition 探索', () => {
  /**
   * **Validates: Requirements 1.1**
   *
   * 测试 1：验证当前代码（未修复）对于有效 agent ID + CLI 成功（exitCode=0）
   * + workspace 目录存在的输入，不执行 workspace 清理操作。
   *
   * Bug 条件：agentId.trim() !== '' AND cliExitCode === 0 AND agentRecord 存在
   *
   * 期望行为：shouldCleanWorkspace === true 且 workspacePath 指向正确的 workspace 目录
   * 未修复代码：shouldCleanWorkspace === false（测试失败，确认 bug 存在）
   */
  test('有效 agent ID + CLI 成功 + workspace 存在时，应返回 shouldCleanWorkspace === true', () => {
    fc.assert(
      fc.property(
        validAgentIdArb,
        (agentId) => {
          const agentRecord: AgentRecord = { id: agentId };
          const input: DeleteCleanupInput = {
            agentId,
            agentRecord,
            cliExitCode: 0,
          };

          const plan = buildDeleteCleanupPlan(input);

          // 期望行为：CLI 成功后应清理 workspace
          expect(plan.shouldCleanWorkspace).toBe(true);

          // 期望行为：workspacePath 应指向正确的 workspace 目录
          expect(plan.workspacePath).toBeDefined();
          expect(typeof plan.workspacePath).toBe('string');
          expect(plan.workspacePath!.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 1.2**
   *
   * 测试 2：验证当 agent 的 workspace 路径来自配置字段
   * （agent.workspace / agent.workspaceRoot）时，CLI 成功后同样不执行清理。
   *
   * 期望行为：shouldCleanWorkspace === true 且 workspacePath 指向配置字段中的路径
   * 未修复代码：shouldCleanWorkspace === false（测试失败，确认 bug 存在）
   */
  test('workspace 路径来自配置字段时，CLI 成功后应返回 shouldCleanWorkspace === true', () => {
    fc.assert(
      fc.property(
        validAgentIdArb,
        workspacePathArb,
        (agentId, wsPath) => {
          const agentRecord: AgentRecord = {
            id: agentId,
            workspace: wsPath,
          };
          const input: DeleteCleanupInput = {
            agentId,
            agentRecord,
            cliExitCode: 0,
          };

          const plan = buildDeleteCleanupPlan(input);

          // 期望行为：CLI 成功后应清理 workspace
          expect(plan.shouldCleanWorkspace).toBe(true);

          // 期望行为：workspacePath 应被正确解析
          expect(plan.workspacePath).toBeDefined();
          expect(typeof plan.workspacePath).toBe('string');
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 1.3**
   *
   * 测试 3：验证当 agent 的 workspace 位于嵌套路径
   * （agents/{id}/workspace-{id}）时，CLI 成功后同样不执行清理。
   *
   * 期望行为：shouldCleanWorkspace === true 且 workspacePath 指向嵌套路径
   * 未修复代码：shouldCleanWorkspace === false（测试失败，确认 bug 存在）
   */
  test('workspace 位于嵌套路径时，CLI 成功后应返回 shouldCleanWorkspace === true', () => {
    fc.assert(
      fc.property(
        validAgentIdArb,
        openclawRootArb,
        (agentId, root) => {
          const agentRecord: AgentRecord = { id: agentId };
          const input: DeleteCleanupInput = {
            agentId,
            agentRecord,
            cliExitCode: 0,
          };

          const plan = buildDeleteCleanupPlan(input);

          // 期望行为：CLI 成功后应清理 workspace
          expect(plan.shouldCleanWorkspace).toBe(true);

          // 期望行为：workspacePath 应被正确解析
          expect(plan.workspacePath).toBeDefined();

          // 验证嵌套路径也能被正确解析
          const nestedPath = resolveNestedWorkspacePath(agentRecord, root);
          expect(nestedPath).toBeDefined();
          expect(nestedPath).toContain(`agents/${agentId}/workspace-${agentId}`);
        },
      ),
      { numRuns: 100 },
    );
  });
});
