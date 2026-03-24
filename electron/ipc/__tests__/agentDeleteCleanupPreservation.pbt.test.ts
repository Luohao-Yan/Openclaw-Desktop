/**
 * 保持不变属性测试（Property 2: Preservation）
 * Bugfix: agent-delete-workspace-cleanup
 *
 * 验证 CLI 失败与无效 ID 场景行为在修复前后保持不变。
 * 遵循观察优先方法论：先在未修复代码上观察行为，再编写测试捕获基线。
 *
 * 观察（未修复代码）：
 * - agentId.trim() === '' 时返回 { shouldCleanWorkspace: false, reason: '智能体 ID 为空，不执行清理' }
 * - cliExitCode !== 0 时返回 { shouldCleanWorkspace: false, reason: 'CLI 退出码 X，不执行清理' }
 * - CLI 成功时返回 { shouldCleanWorkspace: false } 且不影响其他 agent 的配置和 workspace
 *
 * 预期结果：在未修复代码上运行时测试通过（确认基线行为已被捕获）
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
 */

import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  buildDeleteCleanupPlan,
  resolveWorkspacePath,
  type AgentRecord,
  type DeleteCleanupInput,
  type DeleteCleanupPlan,
} from '../agentDeleteCleanupLogic';

// ── 常量 ──────────────────────────────────────────────────────────

/** OpenClaw 根目录（测试用） */
const OPENCLAW_ROOT = '/Users/dev/.openclaw';

// ── Bug 条件判定函数 ──────────────────────────────────────────────

/**
 * 判断输入是否满足 Bug 条件
 * Bug 条件：agentId 有效（非空）且 cliExitCode === 0
 * 非 Bug 条件：agentId 为空/无效 或 cliExitCode !== 0
 */
function isBugCondition(input: { agentId: string; cliExitCode: number }): boolean {
  const trimmedId = (input.agentId || '').trim();
  if (!trimmedId) return false;
  if (input.cliExitCode !== 0) return false;
  return true;
}

// ── 生成器（Arbitraries）──────────────────────────────────────────

/**
 * 生成空或仅含空白的 Agent ID（无效 ID）
 */
const emptyAgentIdArb = fc.constantFrom('', ' ', '  ', '\t', '\n', ' \t\n ');

/**
 * 生成有效的 Agent ID（非空、无空白、仅含合法字符）
 */
const validAgentIdArb = fc.string({ minLength: 1, maxLength: 32 })
  .filter(s => s.trim().length > 0 && /^[a-zA-Z0-9._-]+$/.test(s));

/**
 * 生成非零退出码（CLI 失败场景）
 */
const nonZeroExitCodeArb = fc.integer({ min: 1, max: 255 });

/**
 * 生成随机的 AgentRecord（包含各种可选字段）
 */
const agentRecordArb = (agentId: string): fc.Arbitrary<AgentRecord> =>
  fc.record({
    id: fc.constant(agentId),
    name: fc.option(
      fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z0-9._-]+$/.test(s)),
      { nil: undefined },
    ),
    workspace: fc.option(
      fc.constantFrom(
        '/Users/dev/.openclaw/workspace-test',
        '/home/user/.openclaw/workspace-demo',
        '/tmp/openclaw/workspace-temp',
      ),
      { nil: undefined },
    ),
    workspaceRoot: fc.option(
      fc.constantFrom('/Users/dev/.openclaw', '/home/user/.openclaw'),
      { nil: undefined },
    ),
    workspaceDir: fc.option(
      fc.constantFrom('/custom/workspace/dir', '/opt/openclaw/workspace'),
      { nil: undefined },
    ),
  }).map(rec => rec as AgentRecord);

/**
 * 生成随机的 OpenClaw 根目录路径
 */
const openclawRootArb = fc.constantFrom(
  '/Users/dev/.openclaw',
  '/home/user/.openclaw',
  '/tmp/openclaw',
);

// ============================================================================
// Property 2: Preservation — CLI 失败与无效 ID 场景行为保持不变
// ============================================================================

describe('Bugfix: agent-delete-workspace-cleanup, Property 2: Preservation', () => {

  // --------------------------------------------------------------------------
  // 2.1 空/无效 Agent ID 场景：返回 shouldCleanWorkspace === false
  // --------------------------------------------------------------------------

  /**
   * 对于所有空或仅含空白的 Agent ID，buildDeleteCleanupPlan 应返回
   * shouldCleanWorkspace === false 且 reason 包含 '智能体 ID 为空'
   *
   * 观察：未修复代码中 agentId.trim() === '' 时返回
   * { shouldCleanWorkspace: false, reason: '智能体 ID 为空，不执行清理' }
   *
   * **Validates: Requirements 3.4**
   */
  test('空/无效 Agent ID 时返回 shouldCleanWorkspace === false', () => {
    fc.assert(
      fc.property(
        emptyAgentIdArb,
        fc.integer({ min: -1, max: 255 }),
        fc.option(fc.constant({ id: 'dummy' } as AgentRecord), { nil: null }),
        (agentId, cliExitCode, agentRecord) => {
          const input: DeleteCleanupInput = { agentId, agentRecord, cliExitCode };

          // 确认这不是 Bug 条件
          expect(isBugCondition({ agentId, cliExitCode })).toBe(false);

          const plan = buildDeleteCleanupPlan(input);

          // 保持不变：shouldCleanWorkspace 必须为 false
          expect(plan.shouldCleanWorkspace).toBe(false);

          // 保持不变：reason 包含 '智能体 ID 为空'
          expect(plan.reason).toContain('智能体 ID 为空');

          // 保持不变：不应返回 workspacePath
          expect(plan.workspacePath).toBeUndefined();
        },
      ),
      { numRuns: 100 },
    );
  });

  // --------------------------------------------------------------------------
  // 2.2 CLI 失败场景：返回 shouldCleanWorkspace === false
  // --------------------------------------------------------------------------

  /**
   * 对于所有 CLI 退出码非 0 的场景（无论 agentId 是否有效），
   * buildDeleteCleanupPlan 应返回 shouldCleanWorkspace === false
   * 且 reason 包含 'CLI 退出码'
   *
   * 观察：未修复代码中 cliExitCode !== 0 时返回
   * { shouldCleanWorkspace: false, reason: 'CLI 退出码 X，不执行清理' }
   *
   * **Validates: Requirements 3.1**
   */
  test('CLI 退出码非 0 时返回 shouldCleanWorkspace === false', () => {
    fc.assert(
      fc.property(
        validAgentIdArb,
        nonZeroExitCodeArb,
        (agentId, cliExitCode) => {
          const agentRecord: AgentRecord = { id: agentId };
          const input: DeleteCleanupInput = { agentId, agentRecord, cliExitCode };

          // 确认这不是 Bug 条件（CLI 失败）
          expect(isBugCondition({ agentId, cliExitCode })).toBe(false);

          const plan = buildDeleteCleanupPlan(input);

          // 保持不变：shouldCleanWorkspace 必须为 false
          expect(plan.shouldCleanWorkspace).toBe(false);

          // 保持不变：reason 包含 CLI 退出码信息
          expect(plan.reason).toContain('CLI 退出码');
          expect(plan.reason).toContain(String(cliExitCode));

          // 保持不变：不应返回 workspacePath
          expect(plan.workspacePath).toBeUndefined();
        },
      ),
      { numRuns: 100 },
    );
  });

  // --------------------------------------------------------------------------
  // 2.3 CLI 失败 + 空 ID 组合场景：返回格式一致
  // --------------------------------------------------------------------------

  /**
   * 对于所有 NOT isBugCondition(input) 的输入组合（CLI 失败或 ID 为空/无效），
   * buildDeleteCleanupPlan 应始终返回 shouldCleanWorkspace === false
   *
   * 使用属性测试自动生成多种输入组合（随机 agentId、随机 exitCode、随机配置字段），
   * 提供更强的保持不变保证
   *
   * **Validates: Requirements 3.1, 3.4**
   */
  test('所有非 Bug 条件输入均返回 shouldCleanWorkspace === false', () => {
    // 生成非 Bug 条件的输入：空 ID 或 CLI 失败
    const nonBugInputArb = fc.oneof(
      // 场景 A：空/无效 ID + 任意退出码
      fc.tuple(
        emptyAgentIdArb,
        fc.integer({ min: -1, max: 255 }),
      ),
      // 场景 B：有效 ID + 非零退出码
      fc.tuple(
        validAgentIdArb,
        nonZeroExitCodeArb,
      ),
    );

    fc.assert(
      fc.property(
        nonBugInputArb,
        fc.option(
          validAgentIdArb.chain(id => agentRecordArb(id)),
          { nil: null },
        ),
        ([agentId, cliExitCode], agentRecord) => {
          const input: DeleteCleanupInput = { agentId, agentRecord, cliExitCode };

          // 确认这不是 Bug 条件
          expect(isBugCondition({ agentId, cliExitCode })).toBe(false);

          const plan = buildDeleteCleanupPlan(input);

          // 核心保持不变属性：shouldCleanWorkspace 必须为 false
          expect(plan.shouldCleanWorkspace).toBe(false);

          // 保持不变：reason 必须是非空字符串
          expect(typeof plan.reason).toBe('string');
          expect(plan.reason.length).toBeGreaterThan(0);

          // 保持不变：不应返回 workspacePath
          expect(plan.workspacePath).toBeUndefined();
        },
      ),
      { numRuns: 200 },
    );
  });

  // --------------------------------------------------------------------------
  // 2.4 有效删除操作仅影响目标 agent，不影响其他 agent
  // --------------------------------------------------------------------------

  /**
   * 对于所有有效删除操作（CLI 成功），仅目标 agent 的 workspace 被标记清理，
   * 不影响其他 agent。通过 resolveWorkspacePath 验证路径隔离性。
   *
   * 观察：resolveWorkspacePath 纯函数根据 agent 记录解析路径，
   * 不同 agent ID 解析出不同的 workspace 路径，路径格式为 {root}/workspace-{id}
   *
   * **Validates: Requirements 3.3**
   */
  test('不同 agent 的 workspace 路径互相隔离', () => {
    fc.assert(
      fc.property(
        validAgentIdArb,
        validAgentIdArb,
        openclawRootArb,
        (agentIdA, agentIdB, root) => {
          // 确保两个 ID 不同
          fc.pre(agentIdA.trim() !== agentIdB.trim());

          const agentA: AgentRecord = { id: agentIdA };
          const agentB: AgentRecord = { id: agentIdB };

          const pathA = resolveWorkspacePath(agentA, root);
          const pathB = resolveWorkspacePath(agentB, root);

          // 两个不同 agent 的 workspace 路径必须不同
          expect(pathA).toBeDefined();
          expect(pathB).toBeDefined();
          expect(pathA).not.toBe(pathB);

          // 路径格式为 {root}/workspace-{id}，验证各自包含正确的 ID
          expect(pathA).toBe(`${root}/workspace-${agentIdA.trim()}`);
          expect(pathB).toBe(`${root}/workspace-${agentIdB.trim()}`);

          // 删除 agentA 的 workspace 不会影响 agentB 的路径
          // （纯函数调用互不影响）
          const pathBAfter = resolveWorkspacePath(agentB, root);
          expect(pathBAfter).toBe(pathB);
        },
      ),
      { numRuns: 100 },
    );
  });

  // --------------------------------------------------------------------------
  // 2.5 CLI 失败场景返回值格式与修复前完全一致
  // --------------------------------------------------------------------------

  /**
   * 对于所有 CLI 失败场景，返回值格式与修复前完全一致：
   * { shouldCleanWorkspace: false, reason: 'CLI 退出码 X，不执行清理' }
   *
   * 验证 reason 字符串的精确格式，确保修复不改变错误消息
   *
   * **Validates: Requirements 3.1, 3.2**
   */
  test('CLI 失败场景返回值格式精确匹配', () => {
    fc.assert(
      fc.property(
        validAgentIdArb,
        nonZeroExitCodeArb,
        fc.option(
          validAgentIdArb.chain(id => agentRecordArb(id)),
          { nil: null },
        ),
        (agentId, cliExitCode, agentRecord) => {
          const input: DeleteCleanupInput = { agentId, agentRecord, cliExitCode };
          const plan = buildDeleteCleanupPlan(input);

          // 精确格式匹配
          expect(plan).toEqual({
            shouldCleanWorkspace: false,
            reason: `CLI 退出码 ${cliExitCode}，不执行清理`,
          });
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * 对于所有空 ID 场景，返回值格式与修复前完全一致：
   * { shouldCleanWorkspace: false, reason: '智能体 ID 为空，不执行清理' }
   *
   * **Validates: Requirements 3.4**
   */
  test('空 ID 场景返回值格式精确匹配', () => {
    fc.assert(
      fc.property(
        emptyAgentIdArb,
        fc.integer({ min: -1, max: 255 }),
        (agentId, cliExitCode) => {
          const input: DeleteCleanupInput = {
            agentId,
            agentRecord: null,
            cliExitCode,
          };
          const plan = buildDeleteCleanupPlan(input);

          // 精确格式匹配
          expect(plan).toEqual({
            shouldCleanWorkspace: false,
            reason: '智能体 ID 为空，不执行清理',
          });
        },
      ),
      { numRuns: 50 },
    );
  });
});
