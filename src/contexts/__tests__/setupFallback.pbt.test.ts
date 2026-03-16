/**
 * 属性测试：环境检测部分结果保留
 * Feature: setup-flow-refactor, Property 4: 环境检测部分结果保留
 *
 * 验证 createFallbackEnvironmentCheck 函数：
 *   - 保留 partialData 中所有已有的非空字段值
 *   - 为缺失字段提供默认值
 *   - 返回 status: 'fallback' 的 EnvironmentCheckResult
 *
 * **Validates: Requirements 2.5**
 */

import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';
import { createFallbackEnvironmentCheck } from '../setupFallback';
import type {
  SetupEnvironmentCheckData,
  RuntimeTier,
  FixableIssue,
} from '../../types/setup';

// ============================================================
// 常量定义
// ============================================================

/**
 * 所有合法的 RuntimeTier 值
 */
const VALID_RUNTIME_TIERS: RuntimeTier[] = ['bundled', 'system', 'online', 'missing'];

/**
 * 所有合法的 FixableIssue action 值
 */
const VALID_FIXABLE_ACTIONS: FixableIssue['action'][] = ['install', 'upgrade', 'fixPath'];

/**
 * 所有合法的 FixableIssue severity 值
 */
const VALID_FIXABLE_SEVERITIES: FixableIssue['severity'][] = ['required', 'optional'];

// ============================================================
// 基础生成器（Arbitraries）
// ============================================================

/**
 * 生成非空字符串（至少包含一个非空白字符）
 * 用于模拟已有的字符串字段值
 */
const nonEmptyStringArb = (): fc.Arbitrary<string> =>
  fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0);

/**
 * 生成随机的 RuntimeTier 值
 */
const runtimeTierArb = (): fc.Arbitrary<RuntimeTier> =>
  fc.constantFrom(...VALID_RUNTIME_TIERS);

/**
 * 生成随机的 FixableIssue 对象
 */
const fixableIssueArb = (): fc.Arbitrary<FixableIssue> =>
  fc.record({
    id: fc.string({ minLength: 1, maxLength: 30 }),
    label: fc.string({ minLength: 1, maxLength: 50 }),
    action: fc.constantFrom(...VALID_FIXABLE_ACTIONS),
    severity: fc.constantFrom(...VALID_FIXABLE_SEVERITIES),
  });

/**
 * 生成随机的 Partial<SetupEnvironmentCheckData>
 * 每个字段独立地随机出现或缺失，模拟部分检测成功的场景
 */
const partialEnvironmentCheckDataArb = (): fc.Arbitrary<Partial<SetupEnvironmentCheckData>> =>
  fc.record(
    {
      // 字符串字段
      platform: nonEmptyStringArb(),
      platformLabel: nonEmptyStringArb(),
      runtimeTier: runtimeTierArb(),
      bundledNodeAvailable: fc.boolean(),
      bundledNodePath: nonEmptyStringArb(),
      bundledOpenClawAvailable: fc.boolean(),
      bundledOpenClawPath: nonEmptyStringArb(),
      nodeInstalled: fc.boolean(),
      nodeVersion: nonEmptyStringArb(),
      nodeVersionSatisfies: fc.boolean(),
      npmInstalled: fc.boolean(),
      npmVersion: nonEmptyStringArb(),
      openclawInstalled: fc.boolean(),
      openclawVersion: nonEmptyStringArb(),
      openclawConfigExists: fc.boolean(),
      openclawRootDir: nonEmptyStringArb(),
      recommendedInstallCommand: nonEmptyStringArb(),
      recommendedInstallLabel: nonEmptyStringArb(),
      notes: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 5 }),
      fixableIssues: fc.array(fixableIssueArb(), { minLength: 1, maxLength: 3 }),
    },
    { requiredKeys: [] }, // 所有字段都是可选的
  );

/**
 * 生成降级原因字符串
 */
const reasonArb = (): fc.Arbitrary<string> =>
  fc.oneof(
    fc.constant('IPC 不可用'),
    fc.constant('环境检测超时'),
    fc.constant('降级模式'),
    nonEmptyStringArb(),
  );

// ============================================================
// 辅助验证函数
// ============================================================

/**
 * 检查字符串是否为非空（非空白）
 *
 * @param value - 待检查的值
 * @returns 如果值是非空字符串则返回 true
 */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * 检查布尔值是否已定义
 *
 * @param value - 待检查的值
 * @returns 如果值是布尔类型则返回 true
 */
function isBooleanDefined(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

/**
 * 检查数组是否存在（非 undefined）
 *
 * @param value - 待检查的值
 * @returns 如果值是数组则返回 true
 */
function isArrayDefined(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/**
 * 获取 SetupEnvironmentCheckData 中所有字符串类型字段的键名
 */
const STRING_FIELDS: (keyof SetupEnvironmentCheckData)[] = [
  'platform',
  'platformLabel',
  'openclawRootDir',
  'recommendedInstallCommand',
  'recommendedInstallLabel',
  'nodeVersion',
  'npmVersion',
  'openclawVersion',
  'bundledNodePath',
  'bundledOpenClawPath',
];

/**
 * 获取 SetupEnvironmentCheckData 中所有布尔类型字段的键名
 */
const BOOLEAN_FIELDS: (keyof SetupEnvironmentCheckData)[] = [
  'bundledNodeAvailable',
  'bundledOpenClawAvailable',
  'nodeInstalled',
  'nodeVersionSatisfies',
  'npmInstalled',
  'openclawInstalled',
  'openclawConfigExists',
];

/**
 * 获取 SetupEnvironmentCheckData 中所有数组类型字段的键名
 */
const ARRAY_FIELDS: (keyof SetupEnvironmentCheckData)[] = ['notes', 'fixableIssues'];

// ============================================================
// Property 4: 环境检测部分结果保留
// Feature: setup-flow-refactor
// ============================================================

describe('Feature: setup-flow-refactor, Property 4: 环境检测部分结果保留', () => {
  /**
   * Validates: Requirements 2.5
   *
   * 对于任意部分环境检测结果 partialData，createFallbackEnvironmentCheck 生成的
   * 降级结果应保留 partialData 中所有已有的非空字段值，同时为缺失字段提供默认值。
   */

  // ============================================================
  // 返回结构验证
  // ============================================================

  describe('返回结构验证', () => {
    test('返回结果的 status 始终为 fallback', () => {
      fc.assert(
        fc.property(
          partialEnvironmentCheckDataArb(),
          reasonArb(),
          (partialData, reason) => {
            // 调用降级工厂函数
            const result = createFallbackEnvironmentCheck(partialData, reason);

            // 验证 status 为 fallback
            expect(result.status).toBe('fallback');
          },
        ),
        { numRuns: 100 },
      );
    });

    test('返回结果包含 data 和 reason 字段', () => {
      fc.assert(
        fc.property(
          partialEnvironmentCheckDataArb(),
          reasonArb(),
          (partialData, reason) => {
            // 调用降级工厂函数
            const result = createFallbackEnvironmentCheck(partialData, reason);

            // 验证返回结构包含必要字段
            expect(result.status).toBe('fallback');
            if (result.status === 'fallback') {
              expect(result.data).toBeDefined();
              expect(typeof result.reason).toBe('string');
              expect(result.reason).toBe(reason);
            }
          },
        ),
        { numRuns: 100 },
      );
    });

    test('无 partialData 时返回包含所有必需字段的默认数据', () => {
      // 不传入 partialData，验证返回默认值
      const result = createFallbackEnvironmentCheck(undefined, '测试降级');

      expect(result.status).toBe('fallback');
      if (result.status === 'fallback') {
        const data = result.data;
        // 验证所有必需字段都存在
        expect(typeof data.platform).toBe('string');
        expect(typeof data.platformLabel).toBe('string');
        expect(typeof data.runtimeTier).toBe('string');
        expect(typeof data.bundledNodeAvailable).toBe('boolean');
        expect(typeof data.bundledOpenClawAvailable).toBe('boolean');
        expect(typeof data.nodeInstalled).toBe('boolean');
        expect(typeof data.nodeVersionSatisfies).toBe('boolean');
        expect(typeof data.npmInstalled).toBe('boolean');
        expect(typeof data.openclawInstalled).toBe('boolean');
        expect(typeof data.openclawConfigExists).toBe('boolean');
        expect(typeof data.openclawRootDir).toBe('string');
        expect(typeof data.recommendedInstallCommand).toBe('string');
        expect(typeof data.recommendedInstallLabel).toBe('string');
        expect(Array.isArray(data.notes)).toBe(true);
        expect(Array.isArray(data.fixableIssues)).toBe(true);
      }
    });
  });

  // ============================================================
  // 核心属性：非空字段值保留
  // ============================================================

  describe('非空字段值保留', () => {
    test('partialData 中非空字符串字段值被保留到返回结果中', () => {
      fc.assert(
        fc.property(
          partialEnvironmentCheckDataArb(),
          reasonArb(),
          (partialData, reason) => {
            // 调用降级工厂函数
            const result = createFallbackEnvironmentCheck(partialData, reason);

            if (result.status !== 'fallback') return;
            const data = result.data;

            // 遍历所有字符串字段，验证非空值被保留
            for (const field of STRING_FIELDS) {
              const inputValue = partialData[field];
              if (isNonEmptyString(inputValue)) {
                // 非空字符串字段值应被保留
                expect(data[field]).toBe(inputValue);
              }
            }
          },
        ),
        { numRuns: 100 },
      );
    });

    test('partialData 中布尔字段值被保留到返回结果中', () => {
      fc.assert(
        fc.property(
          partialEnvironmentCheckDataArb(),
          reasonArb(),
          (partialData, reason) => {
            // 调用降级工厂函数
            const result = createFallbackEnvironmentCheck(partialData, reason);

            if (result.status !== 'fallback') return;
            const data = result.data;

            // 遍历所有布尔字段，验证已定义的值被保留
            for (const field of BOOLEAN_FIELDS) {
              const inputValue = partialData[field];
              if (isBooleanDefined(inputValue)) {
                // 已定义的布尔字段值应被保留
                expect(data[field]).toBe(inputValue);
              }
            }
          },
        ),
        { numRuns: 100 },
      );
    });

    test('partialData 中 runtimeTier 字段值被保留到返回结果中', () => {
      fc.assert(
        fc.property(
          partialEnvironmentCheckDataArb(),
          reasonArb(),
          (partialData, reason) => {
            // 调用降级工厂函数
            const result = createFallbackEnvironmentCheck(partialData, reason);

            if (result.status !== 'fallback') return;
            const data = result.data;

            // 如果 partialData 中有 runtimeTier，应被保留
            if (partialData.runtimeTier !== undefined) {
              expect(data.runtimeTier).toBe(partialData.runtimeTier);
            }
          },
        ),
        { numRuns: 100 },
      );
    });

    test('partialData 中 fixableIssues 数组被保留到返回结果中', () => {
      fc.assert(
        fc.property(
          partialEnvironmentCheckDataArb(),
          reasonArb(),
          (partialData, reason) => {
            // 调用降级工厂函数
            const result = createFallbackEnvironmentCheck(partialData, reason);

            if (result.status !== 'fallback') return;
            const data = result.data;

            // 如果 partialData 中有 fixableIssues 数组，应被保留
            if (isArrayDefined(partialData.fixableIssues)) {
              expect(data.fixableIssues).toEqual(partialData.fixableIssues);
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // ============================================================
  // 缺失字段默认值填充
  // ============================================================

  describe('缺失字段默认值填充', () => {
    test('partialData 中缺失的必需字段由默认值填充', () => {
      fc.assert(
        fc.property(
          partialEnvironmentCheckDataArb(),
          reasonArb(),
          (partialData, reason) => {
            // 调用降级工厂函数
            const result = createFallbackEnvironmentCheck(partialData, reason);

            if (result.status !== 'fallback') return;
            const data = result.data;

            // 验证所有必需字段都有值（不为 undefined）
            expect(typeof data.platform).toBe('string');
            expect(typeof data.platformLabel).toBe('string');
            expect(VALID_RUNTIME_TIERS).toContain(data.runtimeTier);
            expect(typeof data.bundledNodeAvailable).toBe('boolean');
            expect(typeof data.bundledOpenClawAvailable).toBe('boolean');
            expect(typeof data.nodeInstalled).toBe('boolean');
            expect(typeof data.nodeVersionSatisfies).toBe('boolean');
            expect(typeof data.npmInstalled).toBe('boolean');
            expect(typeof data.openclawInstalled).toBe('boolean');
            expect(typeof data.openclawConfigExists).toBe('boolean');
            expect(typeof data.openclawRootDir).toBe('string');
            expect(typeof data.recommendedInstallCommand).toBe('string');
            expect(typeof data.recommendedInstallLabel).toBe('string');
            expect(Array.isArray(data.notes)).toBe(true);
            expect(Array.isArray(data.fixableIssues)).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });

    test('空 partialData 对象时所有字段使用默认值', () => {
      // 传入空对象
      const result = createFallbackEnvironmentCheck({}, '空数据降级');

      expect(result.status).toBe('fallback');
      if (result.status === 'fallback') {
        const data = result.data;
        // 验证默认值被正确填充
        expect(data.platform.length).toBeGreaterThan(0);
        expect(data.platformLabel.length).toBeGreaterThan(0);
        expect(data.runtimeTier).toBe('missing'); // 降级默认为 missing
        expect(data.bundledNodeAvailable).toBe(false);
        expect(data.bundledOpenClawAvailable).toBe(false);
        expect(data.nodeInstalled).toBe(false);
        expect(data.nodeVersionSatisfies).toBe(false);
        expect(data.npmInstalled).toBe(false);
        expect(data.openclawInstalled).toBe(false);
        expect(data.openclawConfigExists).toBe(false);
      }
    });
  });

  // ============================================================
  // 综合属性验证
  // ============================================================

  describe('综合属性验证', () => {
    test('所有非空字段值均被保留（综合检查）', () => {
      fc.assert(
        fc.property(
          partialEnvironmentCheckDataArb(),
          reasonArb(),
          (partialData, reason) => {
            // 调用降级工厂函数
            const result = createFallbackEnvironmentCheck(partialData, reason);

            if (result.status !== 'fallback') return;
            const data = result.data;

            // 综合验证：遍历 partialData 的所有键
            for (const key of Object.keys(partialData) as (keyof SetupEnvironmentCheckData)[]) {
              const inputValue = partialData[key];

              // 字符串字段：非空值应被保留
              if (STRING_FIELDS.includes(key) && isNonEmptyString(inputValue)) {
                expect(data[key]).toBe(inputValue);
              }

              // 布尔字段：已定义值应被保留
              if (BOOLEAN_FIELDS.includes(key) && isBooleanDefined(inputValue)) {
                expect(data[key]).toBe(inputValue);
              }

              // runtimeTier 字段：已定义值应被保留
              if (key === 'runtimeTier' && inputValue !== undefined) {
                expect(data.runtimeTier).toBe(inputValue);
              }

              // fixableIssues 数组：已定义值应被保留
              if (key === 'fixableIssues' && isArrayDefined(inputValue)) {
                expect(data.fixableIssues).toEqual(inputValue);
              }
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
