/**
 * 属性测试：Agent 创建向导核心逻辑
 * Feature: agent-creation-flow
 * 覆盖 Property 1, 3, 4, 6, 8
 */

import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  validateBasicInfo,
  generateWorkspacePath,
  getStepStatus,
  getDefaultSelectedFiles,
  filterEmptyIdentityFields,
  shouldSkipIdentityWrite,
  AGENT_NAME_REGEX,
} from '../agentCreation';

// ── 生成器 ──────────────────────────────────────────────────────────

/** 生成符合 AGENT_NAME_REGEX 的合法名称 */
const validNameArb = () =>
  fc.stringMatching(/^[a-zA-Z0-9_-]+$/).filter((s) => s.length > 0);

/** 生成可能包含非法字符的任意字符串 */
const anyStringArb = () => fc.string({ minLength: 0, maxLength: 50 });

/** 生成 Identity 配置对象（所有字段可选） */
const identityArb = () =>
  fc.record({
    name: fc.oneof(fc.constant(''), fc.string()),
    theme: fc.oneof(fc.constant(''), fc.string()),
    emoji: fc.oneof(fc.constant(''), fc.string()),
    avatar: fc.oneof(fc.constant(''), fc.string()),
  }) as fc.Arbitrary<{ name: string; theme: string; emoji: string; avatar: string }>;

/** 模拟 t 函数，直接返回 key 本身 */
const mockT = (key: string) => key;

// ── Property 1: 步骤指示器状态分类正确性 ──────────────────────────

describe('Feature: agent-creation-flow, Property 1: 步骤指示器状态分类正确性', () => {
  test('对于任意 currentStep（0-3），索引 < currentStep 标记为 completed，= currentStep 标记为 current，> currentStep 标记为 upcoming', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 3 }), // currentStep
        fc.integer({ min: 0, max: 3 }), // stepIndex
        (currentStep, stepIndex) => {
          const status = getStepStatus(stepIndex, currentStep);
          if (stepIndex < currentStep) {
            expect(status).toBe('completed');
          } else if (stepIndex === currentStep) {
            expect(status).toBe('current');
          } else {
            expect(status).toBe('upcoming');
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ── Property 3: 名称到 Workspace 路径的自动生成 ──────────────────

describe('Feature: agent-creation-flow, Property 3: 名称到 Workspace 路径的自动生成', () => {
  test('对于任意符合 AGENT_NAME_REGEX 的名称，生成路径应等于 ~/.openclaw/workspace-${name}', () => {
    fc.assert(
      fc.property(validNameArb(), (name) => {
        const path = generateWorkspacePath(name);
        expect(path).toBe(`~/.openclaw/workspace-${name}`);
      }),
      { numRuns: 100 },
    );
  });
});

// ── Property 4: Agent 名称校验正确性 ──────────────────────────────

describe('Feature: agent-creation-flow, Property 4: Agent 名称校验正确性', () => {
  test('对于任意字符串，validateBasicInfo 应在且仅在匹配 AGENT_NAME_REGEX 时不产生名称错误', () => {
    fc.assert(
      fc.property(anyStringArb(), (input) => {
        const errors = validateBasicInfo(
          { name: input, workspace: '/some/path' },
          mockT,
        );
        const trimmed = input.trim();

        if (trimmed === '') {
          // 空字符串应产生名称必填错误
          expect(errors.name).toBeDefined();
        } else if (AGENT_NAME_REGEX.test(trimmed)) {
          // 合法名称不应有名称错误
          expect(errors.name).toBeUndefined();
        } else {
          // 非法名称应产生格式错误
          expect(errors.name).toBeDefined();
        }
      }),
      { numRuns: 100 },
    );
  });

  test('workspace 为空时应产生 workspace 错误', () => {
    fc.assert(
      fc.property(validNameArb(), (name) => {
        const errors = validateBasicInfo({ name, workspace: '' }, mockT);
        expect(errors.workspace).toBeDefined();
      }),
      { numRuns: 100 },
    );
  });
});

// ── Property 6: 模板选择默认勾选核心文件 ──────────────────────────

describe('Feature: agent-creation-flow, Property 6: 模板选择默认勾选核心文件', () => {
  test('getDefaultSelectedFiles() 应始终包含 AGENTS.md、SOUL.md、TOOLS.md', () => {
    // 此属性是确定性的，但我们仍用 PBT 框架验证多次调用的一致性
    fc.assert(
      fc.property(fc.constant(null), () => {
        const files = getDefaultSelectedFiles();
        expect(files).toContain('AGENTS.md');
        expect(files).toContain('SOUL.md');
        expect(files).toContain('TOOLS.md');
      }),
      { numRuns: 100 },
    );
  });

  test('getDefaultSelectedFiles() 每次返回新数组（不共享引用）', () => {
    const a = getDefaultSelectedFiles();
    const b = getDefaultSelectedFiles();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

// ── Property 8: Identity 所有字段可选 ──────────────────────────────

describe('Feature: agent-creation-flow, Property 8: Identity 所有字段可选', () => {
  test('全空 Identity 时 shouldSkipIdentityWrite 返回 true，否则返回 false', () => {
    fc.assert(
      fc.property(identityArb(), (identity) => {
        const skip = shouldSkipIdentityWrite(identity);
        const hasAnyValue = Object.values(identity).some((v) => v && v.trim());

        if (hasAnyValue) {
          expect(skip).toBe(false);
        } else {
          expect(skip).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  test('filterEmptyIdentityFields 过滤空值后仅返回非空字段', () => {
    fc.assert(
      fc.property(identityArb(), (identity) => {
        const filtered = filterEmptyIdentityFields(identity);

        // 所有返回的值都应非空
        for (const value of Object.values(filtered)) {
          expect(value.trim().length).toBeGreaterThan(0);
        }

        // 原始对象中有值的字段应出现在结果中
        for (const [key, value] of Object.entries(identity)) {
          if (value && value.trim()) {
            expect(filtered[key]).toBe(value.trim());
          } else {
            expect(filtered[key]).toBeUndefined();
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});
