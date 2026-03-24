/**
 * 属性测试：Agent 导入 CLI 参数修复
 * Bugfix: agent-import-cli-args-fix
 *
 * 本文件包含三类属性测试：
 * 1. 探索性测试（exploration）— 模拟旧的手动拼接逻辑，确认 Bug 存在
 * 2. 修复验证测试（fix）— 验证 buildImportAgentCreateArgs 输出格式正确
 * 3. 保持性测试（preservation）— 验证 buildAgentCreateArgs 纯函数行为不变
 */

import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';
import { buildAgentCreateArgs } from '../agentCreateLogic';
import {
  buildImportAgentCreateArgs,
  resolveImportWorkspacePath,
} from '../agentExchangeLogic';

// ============================================================================
// 生成器（Arbitraries）
// ============================================================================

/**
 * 生成有效的 Agent 名称（非空、无空白、仅含合法字符）
 */
const agentNameArb = fc.string({ minLength: 1, maxLength: 32 })
  .filter(s => s.trim().length > 0 && /^[a-zA-Z0-9._-]+$/.test(s));

/**
 * 生成有效的 workspace 路径
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

// ============================================================================
// PBT 1: 探索性测试 — 模拟旧的手动拼接逻辑，确认 Bug 存在
// ============================================================================

/**
 * 模拟修复前的手动拼接逻辑（硬编码复现 agentExchange.ts Step 2 的旧代码）
 * 此函数故意使用错误的 --name 选项格式且缺少 --workspace 参数
 */
function buildBuggyImportCliArgs(resolvedName: string): string[] {
  return [
    '--no-color',
    'agents', 'add',
    '--name', resolvedName,
    '--non-interactive',
    '--json',
  ];
}

describe('PBT exploration: 旧的手动拼接逻辑包含 --name 且缺少 --workspace', () => {
  /**
   * 对于任意有效的 Agent 名称，旧的手动拼接逻辑：
   * 1. 包含错误的 --name 选项
   * 2. 缺少必需的 --workspace 参数
   * 这证实了 Bug 的存在。
   *
   * **Validates: Bugfix Requirements 1.2, 1.3**
   */
  test(
    'Bugfix exploration: 旧逻辑使用 --name 选项且缺少 --workspace',
    () => {
      fc.assert(
        fc.property(
          agentNameArb,
          (name) => {
            const buggyArgs = buildBuggyImportCliArgs(name);

            // 确认旧逻辑包含错误的 --name 选项
            expect(buggyArgs).toContain('--name');

            // 确认旧逻辑缺少 --workspace 参数
            expect(buggyArgs).not.toContain('--workspace');
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});

// ============================================================================
// PBT 2: 修复验证测试 — buildImportAgentCreateArgs 输出格式正确
// ============================================================================

describe('PBT fix: buildImportAgentCreateArgs 输出格式正确', () => {
  /**
   * 对于任意有效的 Agent 名称和 workspace 路径，
   * buildImportAgentCreateArgs 的输出：
   * 1. 不包含 --name 选项
   * 2. 包含位置参数格式的名称（紧跟在 'add' 之后）
   * 3. 包含 --workspace 参数
   * 4. 包含 --non-interactive 和 --json 标志
   *
   * **Validates: Bugfix Requirements 2.1, 2.2, 2.3**
   */
  test(
    'Bugfix fix: 修复后的参数不含 --name、包含位置参数名称和 --workspace',
    () => {
      fc.assert(
        fc.property(
          agentNameArb,
          workspacePathArb,
          (name, workspace) => {
            const args = buildImportAgentCreateArgs({ name, workspace });

            // 不包含错误的 --name 选项
            expect(args).not.toContain('--name');

            // 包含 'agents' 和 'add' 子命令
            expect(args).toContain('agents');
            expect(args).toContain('add');

            // 名称作为位置参数紧跟在 'add' 之后
            const addIndex = args.indexOf('add');
            expect(args[addIndex + 1]).toBe(name.trim());

            // 包含 --workspace 参数及其值
            const wsIndex = args.indexOf('--workspace');
            expect(wsIndex).toBeGreaterThan(-1);
            expect(args[wsIndex + 1]).toBe(workspace.trim());

            // 包含必需的标志
            expect(args).toContain('--non-interactive');
            expect(args).toContain('--json');
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});

// ============================================================================
// PBT 3: 保持性测试 — buildAgentCreateArgs 纯函数行为不变
// ============================================================================

describe('PBT preservation: buildAgentCreateArgs 纯函数输出格式不变', () => {
  /**
   * 对于任意有效的 name、workspace 和可选 model 输入，
   * buildAgentCreateArgs 的输出始终满足：
   * 1. 以 ['agents', 'add', <trimmedName>] 开头
   * 2. 包含 --workspace <trimmedWorkspace>
   * 3. 包含 --non-interactive 和 --json
   * 4. 如果提供了 model，包含 --model <trimmedModel>
   *
   * 此测试确保修复不影响 buildAgentCreateArgs 纯函数本身的行为。
   *
   * **Validates: Bugfix Requirements 3.1, 3.3**
   */
  test(
    'Bugfix preservation: buildAgentCreateArgs 对任意输入的输出格式一致',
    () => {
      fc.assert(
        fc.property(
          agentNameArb,
          workspacePathArb,
          fc.option(
            fc.string({ minLength: 1, maxLength: 32 }).filter(s => s.trim().length > 0),
            { nil: undefined },
          ),
          (name, workspace, model) => {
            const args = buildAgentCreateArgs({ name, workspace, model });

            // 基础结构：agents add <name>
            expect(args[0]).toBe('agents');
            expect(args[1]).toBe('add');
            expect(args[2]).toBe(name.trim());

            // --workspace 参数
            const wsIndex = args.indexOf('--workspace');
            expect(wsIndex).toBeGreaterThan(-1);
            expect(args[wsIndex + 1]).toBe(workspace.trim());

            // 必需标志
            expect(args).toContain('--non-interactive');
            expect(args).toContain('--json');

            // model 参数（可选）
            if (model && model.trim()) {
              expect(args).toContain('--model');
              const modelIndex = args.indexOf('--model');
              expect(args[modelIndex + 1]).toBe(model.trim());
            } else {
              expect(args).not.toContain('--model');
            }

            // 不应包含 --name 选项（这是 Bug 的特征）
            expect(args).not.toContain('--name');
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  /**
   * buildImportAgentCreateArgs 的输出与直接调用 buildAgentCreateArgs 完全一致，
   * 确保导入流程与正常创建流程使用相同的参数格式。
   *
   * **Validates: Bugfix Requirements 3.3**
   */
  test(
    'Bugfix preservation: buildImportAgentCreateArgs 与 buildAgentCreateArgs 输出一致',
    () => {
      fc.assert(
        fc.property(
          agentNameArb,
          workspacePathArb,
          (name, workspace) => {
            const importArgs = buildImportAgentCreateArgs({ name, workspace });
            const directArgs = buildAgentCreateArgs({ name, workspace });

            // 两者输出完全一致
            expect(importArgs).toEqual(directArgs);
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});
