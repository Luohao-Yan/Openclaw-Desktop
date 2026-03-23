/**
 * 属性测试：Bug Condition 探索 — "main" 保留名称创建拦截
 * Feature: main-agent-creation-fix
 *
 * 本文件编码了修复后的期望行为。在未修复代码上运行时，
 * 测试应失败，从而确认 bug 存在。
 *
 * Property 1: Bug Condition
 * - 保留名称前端未拦截
 * - 后端未识别 reserved 错误
 * - 后端未格式化 reserved 错误为中文友好提示
 */

import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';
import { validateBasicInfo } from '../../../src/utils/agentCreation';
import { classifyAgentError, formatAgentCreateError } from '../agentCreateLogic';

// ── mockT 函数：直接返回 key 本身 ──────────────────────────────────
const mockT = (key: string) => key;

// ── 生成器（Arbitraries）──────────────────────────────────────────

/**
 * 生成 "main" 的各种大小写变体
 * 从基础字符 ['m','a','i','n'] 随机选择大小写组合
 */
const reservedNameArb = (): fc.Arbitrary<string> => {
  const chars = ['m', 'a', 'i', 'n'];
  return fc.tuple(
    ...chars.map((c) => fc.boolean().map((upper) => (upper ? c.toUpperCase() : c)))
  ).map((arr) => arr.join(''));
};

/**
 * 生成包含 "reserved" 关键词的 stderr 字符串
 * 模拟 CLI 返回的保留名称错误信息
 */
const reservedStderrArb = (): fc.Arbitrary<string> =>
  fc.tuple(
    fc.string({ minLength: 0, maxLength: 30 }),
    fc.constantFrom('reserved', 'Reserved', 'RESERVED', 'is reserved'),
    fc.string({ minLength: 0, maxLength: 30 }),
  ).map(([prefix, keyword, suffix]) => `${prefix}${keyword}${suffix}`);

// ============================================================
// Property 1: Bug Condition 探索测试
// Feature: main-agent-creation-fix
//
// 在未修复代码上运行——预期结果：测试失败
// 测试失败即确认 bug 存在
// ============================================================

describe('Feature: main-agent-creation-fix, Property 1: Bug Condition 探索', () => {
  /**
   * Validates: Requirements 1.2, 2.1, 2.2
   *
   * 测试 1（前端）：对任意保留名称（不区分大小写），
   * validateBasicInfo 应返回包含 name 字段错误的非空映射，
   * 错误消息为 mockT('agent.nameReserved') 的返回值。
   *
   * 未修复代码上：validateBasicInfo 对 "main" 返回 {}（校验通过），测试失败
   */
  test('保留名称（不区分大小写）应被 validateBasicInfo 拦截', () => {
    fc.assert(
      fc.property(
        reservedNameArb(),
        (name) => {
          const result = validateBasicInfo({ name, workspace: '/tmp' }, mockT);

          // 断言返回非空映射，包含 name 字段错误
          expect(Object.keys(result).length).toBeGreaterThan(0);
          expect(result).toHaveProperty('name');
          expect(result.name).toBe(mockT('agent.nameReserved'));
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 1.3, 2.3
   *
   * 测试 2（后端分类）：对任意包含 "reserved" 关键词的 stderr 字符串，
   * classifyAgentError 应返回 'reserved'。
   *
   * 未修复代码上：classifyAgentError 对 "reserved" 返回 'unknown'，测试失败
   */
  test('包含 "reserved" 关键词的 stderr 应被分类为 reserved', () => {
    fc.assert(
      fc.property(
        reservedStderrArb(),
        (stderr) => {
          const result = classifyAgentError(stderr);
          expect(result).toBe('reserved');
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 1.3, 2.3
   *
   * 测试 3（后端格式化）：对包含 "reserved" 的 stderr，
   * formatAgentCreateError(stderr, 'reserved') 应返回中文友好提示，
   * 而非英文原始 stderr。
   *
   * 未修复代码上：formatAgentCreateError 对 'reserved' 类型原样返回 stderr，测试失败
   */
  test('reserved 类型错误应返回中文友好提示而非英文原始 stderr', () => {
    fc.assert(
      fc.property(
        reservedStderrArb(),
        (stderr) => {
          const result = formatAgentCreateError(stderr, 'reserved');

          // 结果不应等于原始 stderr（应被格式化为中文提示）
          expect(result).not.toBe(stderr);
          // 结果应包含中文字符（友好提示）
          expect(/[\u4e00-\u9fff]/.test(result)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});


// ============================================================
// Property 2: Preservation 属性测试
// Feature: main-agent-creation-fix
//
// 在未修复代码上运行——预期结果：测试通过
// 确认基线行为：非保留名称的校验、非 reserved 错误的分类和格式化不受影响
// ============================================================

// ── Preservation 生成器（Arbitraries）─────────────────────────────

/** 保留名称列表（小写） */
const RESERVED_NAMES_LOWER = ['main'];

/**
 * 生成合法的非保留名称
 * 匹配 /^[a-zA-Z0-9_-]+$/ 且 toLowerCase 不在保留列表中
 */
const validNonReservedNameArb = (): fc.Arbitrary<string> =>
  fc.stringMatching(/^[a-zA-Z0-9_-]+$/)
    .filter((name: string) => name.length >= 1 && !RESERVED_NAMES_LOWER.includes(name.toLowerCase()));

/**
 * 生成空名称或纯空格名称
 * 用于验证 nameRequired 错误
 */
const emptyOrWhitespaceNameArb = (): fc.Arbitrary<string> =>
  fc.constantFrom('', ' ', '  ', '   ', '\t', '\t ', ' \t ');

/**
 * 生成包含非法字符的名称（非空 trim 后仍含非法字符）
 * 不匹配 /^[a-zA-Z0-9_-]+$/，且 trim 后非空
 */
const illegalCharNameArb = (): fc.Arbitrary<string> => {
  return fc.tuple(
    fc.stringMatching(/^[a-zA-Z0-9_-]*$/),
    fc.constantFrom('@', '#', '$', '%', '!', ' ', '&', '*', '(', ')', '+', '=', '/', '\\', '?', '<', '>', ',', '.', ':', ';', '"', "'", '`', '~', '{', '}', '[', ']', '|'),
    fc.stringMatching(/^[a-zA-Z0-9_-]*$/),
  ).map(([prefix, illegalChar, suffix]) => `${prefix}${illegalChar}${suffix}`)
    .filter((name: string) => {
      // trim 后仍需包含非法字符，因为 validateBasicInfo 会先 trim 再校验
      const trimmed = name.trim();
      return trimmed.length > 0 && !/^[a-zA-Z0-9_-]+$/.test(trimmed);
    });
};

/**
 * 生成不含 "reserved" 关键词的 stderr 字符串
 * 用于验证非 reserved 错误的分类行为不变
 */
const nonReservedStderrArb = (): fc.Arbitrary<string> =>
  fc.string({ minLength: 1, maxLength: 100 })
    .filter((s) => !s.toLowerCase().includes('reserved'));

/**
 * 非 reserved 错误类型生成器
 * 当前代码中 AgentErrorType 为 'schema' | 'network' | 'permission' | 'unknown'
 */
const nonReservedErrorTypeArb = (): fc.Arbitrary<string> =>
  fc.constantFrom('schema', 'network', 'permission', 'unknown');

describe('Feature: main-agent-creation-fix, Property 2: Preservation 属性测试', () => {
  /**
   * Validates: Requirements 3.1
   *
   * 属性测试 1（前端保留）：对任意合法非保留名称，
   * validateBasicInfo 应返回空映射（校验通过）。
   * 确认修复不影响合法名称的正常创建流程。
   */
  test('合法非保留名称应通过 validateBasicInfo 校验（返回空映射）', () => {
    fc.assert(
      fc.property(
        validNonReservedNameArb(),
        (name) => {
          const result = validateBasicInfo({ name, workspace: '/tmp' }, mockT);

          // 断言返回空映射（校验通过，无错误）
          expect(result).not.toHaveProperty('name');
          expect(Object.keys(result).filter((k) => k === 'name')).toHaveLength(0);
        },
      ),
      { numRuns: 200 },
    );
  });

  /**
   * Validates: Requirements 3.2
   *
   * 属性测试 2（前端保留）：对任意空名称或纯空格名称，
   * validateBasicInfo 应返回 nameRequired 错误。
   * 确认修复不影响空名称的校验行为。
   */
  test('空名称或纯空格名称应返回 nameRequired 错误', () => {
    fc.assert(
      fc.property(
        emptyOrWhitespaceNameArb(),
        (name) => {
          const result = validateBasicInfo({ name, workspace: '/tmp' }, mockT);

          // 断言返回包含 name 字段的 nameRequired 错误
          expect(result).toHaveProperty('name');
          expect(result.name).toBe(mockT('agent.nameRequired'));
        },
      ),
      { numRuns: 50 },
    );
  });

  /**
   * Validates: Requirements 3.2
   *
   * 属性测试 3（前端保留）：对任意包含非法字符的名称（trim 后非空），
   * validateBasicInfo 应返回 nameInvalid 错误。
   * 确认修复不影响非法格式名称的校验行为。
   */
  test('包含非法字符的名称应返回 nameInvalid 错误', () => {
    fc.assert(
      fc.property(
        illegalCharNameArb(),
        (name) => {
          const result = validateBasicInfo({ name, workspace: '/tmp' }, mockT);

          // 断言返回包含 name 字段的 nameInvalid 错误
          expect(result).toHaveProperty('name');
          expect(result.name).toBe(mockT('agent.nameInvalid'));
        },
      ),
      { numRuns: 200 },
    );
  });

  /**
   * Validates: Requirements 3.3
   *
   * 属性测试 4（后端保留）：对任意不含 "reserved" 关键词的 stderr，
   * classifyAgentError 结果应为 schema/network/permission/unknown 之一。
   * 确认修复不影响现有错误分类逻辑。
   */
  test('不含 "reserved" 的 stderr 应被分类为 schema/network/permission/unknown', () => {
    const validTypes = ['schema', 'network', 'permission', 'unknown'];
    fc.assert(
      fc.property(
        nonReservedStderrArb(),
        (stderr) => {
          const result = classifyAgentError(stderr);

          // 断言分类结果为现有四种类型之一
          expect(validTypes).toContain(result);
        },
      ),
      { numRuns: 200 },
    );
  });

  /**
   * Validates: Requirements 3.3, 3.4
   *
   * 属性测试 5（后端保留）：对任意非 reserved 错误类型，
   * formatAgentCreateError 对 'schema' 返回中文提示，
   * 对其他类型（network/permission/unknown）原样返回 stderr。
   * 确认修复不影响现有错误格式化逻辑。
   */
  test('非 reserved 错误类型的格式化行为应保持不变', () => {
    fc.assert(
      fc.property(
        nonReservedStderrArb(),
        nonReservedErrorTypeArb(),
        (stderr, errorType) => {
          const result = formatAgentCreateError(stderr, errorType);

          if (errorType === 'schema') {
            // schema 类型：返回中文友好提示（包含中文字符）
            expect(/[\u4e00-\u9fff]/.test(result)).toBe(true);
            // 不应返回原始 stderr
            expect(result).not.toBe(stderr);
          } else {
            // 非 schema 类型（network/permission/unknown）：原样返回 stderr
            expect(result).toBe(stderr);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
