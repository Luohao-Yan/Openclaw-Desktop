/**
 * 属性测试：远程响应格式化纯函数
 * Feature: remote-management-enhancement
 *
 * 覆盖设计文档中的以下正确性属性：
 * - Property 5: 响应映射保留必需字段
 * - Property 10: JSON 往返一致性
 * - Property 11: 额外字段过滤
 * - Property 12: 无效 JSON 错误处理
 *
 * 使用 fast-check 库生成随机输入，每个属性测试至少运行 100 次迭代。
 */

import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  mapGatewayStatus,
  mapSessionsList,
  mapSessionDetail,
  mapChannelsList,
  mapLogs,
  mapConfig,
  mapSkillsList,
  mapModelsList,
  validateJsonRoundTrip,
  stripExtraFields,
  parseRemoteJson,
} from '../remoteResponseMapper';

// ── 生成器（Arbitraries）──────────────────────────────────────────────────

/**
 * 生成合法的 Gateway 状态响应对象
 * 包含 status、version、uptime 等必需字段
 */
const gatewayStatusArb = (): fc.Arbitrary<Record<string, unknown>> =>
  fc.record({
    status: fc.constantFrom('running', 'stopped', 'error', 'checking'),
    version: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
    uptime: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: undefined }),
    host: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
    port: fc.option(fc.integer({ min: 1, max: 65535 }), { nil: undefined }),
  });

/**
 * 生成合法的 session 对象
 */
const sessionArb = (): fc.Arbitrary<Record<string, unknown>> =>
  fc.record({
    id: fc.string({ minLength: 1, maxLength: 36 }),
    name: fc.string({ minLength: 0, maxLength: 50 }),
    status: fc.constantFrom('active', 'idle', 'inactive'),
    agent: fc.string({ minLength: 1, maxLength: 30 }),
  });

/**
 * 生成合法的 sessions 列表响应
 */
const sessionsListArb = (): fc.Arbitrary<Record<string, unknown>> =>
  fc.record({
    sessions: fc.array(sessionArb(), { minLength: 0, maxLength: 10 }),
  });

/**
 * 生成合法的日志条目
 */
const logEntryArb = (): fc.Arbitrary<Record<string, unknown>> =>
  fc.record({
    id: fc.string({ minLength: 1, maxLength: 20 }),
    raw: fc.string({ minLength: 0, maxLength: 200 }),
    level: fc.constantFrom('info', 'warn', 'error', 'debug'),
    timestamp: fc.string({ minLength: 1, maxLength: 30 }),
  });

/**
 * 生成合法的日志响应
 */
const logsResponseArb = (): fc.Arbitrary<Record<string, unknown>> =>
  fc.record({
    logs: fc.array(logEntryArb(), { minLength: 0, maxLength: 10 }),
  });

/**
 * 生成合法的技能对象
 */
const skillArb = (): fc.Arbitrary<Record<string, unknown>> =>
  fc.record({
    id: fc.string({ minLength: 1, maxLength: 30 }),
    name: fc.string({ minLength: 1, maxLength: 50 }),
    description: fc.string({ minLength: 0, maxLength: 100 }),
    version: fc.string({ minLength: 1, maxLength: 20 }),
  });

/**
 * 生成合法的技能列表响应
 */
const skillsListArb = (): fc.Arbitrary<Record<string, unknown>> =>
  fc.record({
    skills: fc.array(skillArb(), { minLength: 0, maxLength: 10 }),
  });

/**
 * 生成合法的模型列表响应
 */
const modelsListArb = (): fc.Arbitrary<Record<string, unknown>> =>
  fc.record({
    providers: fc.dictionary(
      fc.string({ minLength: 1, maxLength: 20, unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')) }),
      fc.constantFrom('authenticated', 'unauthenticated', 'unknown'),
    ),
  });

/**
 * 生成可 JSON 序列化的任意值（不含 undefined、函数、Symbol 等）
 */
const jsonSerializableArb = (): fc.Arbitrary<unknown> =>
  fc.oneof(
    fc.string(),
    fc.integer(),
    fc.double({ noNaN: true, noDefaultInfinity: true }),
    fc.boolean(),
    fc.constant(null),
    fc.array(fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null)), { maxLength: 5 }),
    fc.dictionary(
      fc.string({ minLength: 1, maxLength: 10, unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')) }),
      fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null)),
    ),
  );

/**
 * 生成非 JSON 字符串（无法被 JSON.parse 解析的字符串）
 */
const invalidJsonArb = (): fc.Arbitrary<string> =>
  fc.oneof(
    fc.constant('{invalid json}'),
    fc.constant('not json at all'),
    fc.constant('<html>'),
    fc.constant('{key: value}'),
    fc.constant("{'single': 'quotes'}"),
    fc.constant('{unclosed'),
    fc.constant(''),
    fc.string({ minLength: 1, maxLength: 50 }).filter((s) => {
      try { JSON.parse(s); return false; } catch { return true; }
    }),
  );

/**
 * 生成带有额外字段的对象
 */
const objectWithExtraFieldsArb = (
  allowedKeys: string[],
  extraKeys: string[],
): fc.Arbitrary<Record<string, unknown>> =>
  fc.record({
    ...Object.fromEntries(allowedKeys.map((k) => [k, fc.string({ minLength: 1, maxLength: 20 })])),
    ...Object.fromEntries(extraKeys.map((k) => [k, fc.string({ minLength: 1, maxLength: 20 })])),
  });

// ============================================================
// Property 5: 响应映射保留必需字段
// Feature: remote-management-enhancement
// ============================================================

describe('Feature: remote-management-enhancement, Property 5: 响应映射保留必需字段', () => {
  /**
   * Validates: Requirements 2.1, 2.2, 3.1, 3.2, 4.1, 4.2, 5.1, 6.1, 7.1, 11.1
   *
   * 对于任意有效的远程 API JSON 响应，经过对应的 map*() 函数映射后，
   * 结果对象应包含本地接口定义的所有必需字段。
   */

  test('mapGatewayStatus 输出始终包含 status 字段', () => {
    fc.assert(
      fc.property(gatewayStatusArb(), (data) => {
        const result = mapGatewayStatus(data);
        // 映射结果必须包含 status 字段
        expect(result).toHaveProperty('status');
        expect(typeof result.status).toBe('string');
      }),
      { numRuns: 100 },
    );
  });

  test('mapSessionsList 输出始终包含 success 和 sessions 字段', () => {
    fc.assert(
      fc.property(sessionsListArb(), (data) => {
        const result = mapSessionsList(data);
        // 映射结果必须包含 success 和 sessions 字段
        expect(result).toHaveProperty('success');
        expect(result).toHaveProperty('sessions');
        expect(result.success).toBe(true);
        expect(Array.isArray(result.sessions)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  test('mapSessionDetail 输出始终包含 success 字段', () => {
    fc.assert(
      fc.property(
        fc.record({ id: fc.string({ minLength: 1, maxLength: 36 }), status: fc.constantFrom('active', 'idle') }),
        (data) => {
          const result = mapSessionDetail(data);
          expect(result).toHaveProperty('success');
          expect(result.success).toBe(true);
          expect(result).toHaveProperty('session');
        },
      ),
      { numRuns: 100 },
    );
  });

  test('mapChannelsList 输出始终包含 success 和 output 字段', () => {
    fc.assert(
      fc.property(
        fc.record({ channels: fc.array(fc.record({ id: fc.string(), type: fc.string() }), { maxLength: 5 }) }),
        (data) => {
          const result = mapChannelsList(data);
          expect(result).toHaveProperty('success');
          expect(result).toHaveProperty('output');
          expect(result.success).toBe(true);
          expect(typeof result.output).toBe('string');
        },
      ),
      { numRuns: 100 },
    );
  });

  test('mapLogs 输出始终包含 success 和 logs 字段', () => {
    fc.assert(
      fc.property(logsResponseArb(), (data) => {
        const result = mapLogs(data);
        expect(result).toHaveProperty('success');
        expect(result).toHaveProperty('logs');
        expect(result.success).toBe(true);
        expect(Array.isArray(result.logs)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  test('mapConfig 输出始终包含 success 字段', () => {
    fc.assert(
      fc.property(
        fc.dictionary(
          fc.string({ minLength: 1, maxLength: 10, unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')) }),
          fc.string(),
        ),
        (data) => {
          const result = mapConfig(data);
          expect(result).toHaveProperty('success');
          expect(result.success).toBe(true);
          expect(result).toHaveProperty('config');
        },
      ),
      { numRuns: 100 },
    );
  });

  test('mapSkillsList 输出始终包含 success 字段', () => {
    fc.assert(
      fc.property(skillsListArb(), (data) => {
        const result = mapSkillsList(data);
        expect(result).toHaveProperty('success');
        expect(result.success).toBe(true);
        expect(result).toHaveProperty('skills');
        expect(Array.isArray(result.skills)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  test('mapModelsList 输出始终包含 success 和 providers 字段', () => {
    fc.assert(
      fc.property(modelsListArb(), (data) => {
        const result = mapModelsList(data);
        expect(result).toHaveProperty('success');
        expect(result).toHaveProperty('providers');
        expect(result.success).toBe(true);
        expect(typeof result.providers).toBe('object');
      }),
      { numRuns: 100 },
    );
  });

  test('所有 map*() 函数对 null/undefined 输入返回包含 error 的结果', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(null, undefined, 42, 'string', true),
        (invalidInput) => {
          // 所有映射函数对非对象输入应返回错误
          const gatewayResult = mapGatewayStatus(invalidInput);
          expect(gatewayResult.status).toBe('error');

          const sessionsResult = mapSessionsList(invalidInput);
          expect(sessionsResult.success).toBe(false);

          const sessionDetailResult = mapSessionDetail(invalidInput);
          expect(sessionDetailResult.success).toBe(false);

          const channelsResult = mapChannelsList(invalidInput);
          expect(channelsResult.success).toBe(false);

          const logsResult = mapLogs(invalidInput);
          expect(logsResult.success).toBe(false);

          const configResult = mapConfig(invalidInput);
          expect(configResult.success).toBe(false);

          const skillsResult = mapSkillsList(invalidInput);
          expect(skillsResult.success).toBe(false);

          const modelsResult = mapModelsList(invalidInput);
          expect(modelsResult.success).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});


// ============================================================
// Property 10: JSON 往返一致性
// Feature: remote-management-enhancement
// ============================================================

describe('Feature: remote-management-enhancement, Property 10: JSON 往返一致性', () => {
  /**
   * Validates: Requirements 11.2
   *
   * 对于任意有效的远程 API JSON 响应对象，
   * JSON.parse(JSON.stringify(parsed)) 应产生与 parsed 深度相等的对象。
   */

  test('任意可序列化对象经 JSON 往返后保持一致', () => {
    fc.assert(
      fc.property(jsonSerializableArb(), (data) => {
        const result = validateJsonRoundTrip(data);
        // 可 JSON 序列化的数据应通过往返验证
        expect(result).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  test('Gateway 状态响应经 JSON 往返后保持一致', () => {
    fc.assert(
      fc.property(gatewayStatusArb(), (data) => {
        // 过滤掉 undefined 值（JSON.stringify 会忽略 undefined）
        const cleaned = JSON.parse(JSON.stringify(data));
        expect(validateJsonRoundTrip(cleaned)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  test('Session 列表响应经 JSON 往返后保持一致', () => {
    fc.assert(
      fc.property(sessionsListArb(), (data) => {
        const cleaned = JSON.parse(JSON.stringify(data));
        expect(validateJsonRoundTrip(cleaned)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  test('日志响应经 JSON 往返后保持一致', () => {
    fc.assert(
      fc.property(logsResponseArb(), (data) => {
        const cleaned = JSON.parse(JSON.stringify(data));
        expect(validateJsonRoundTrip(cleaned)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  test('技能列表响应经 JSON 往返后保持一致', () => {
    fc.assert(
      fc.property(skillsListArb(), (data) => {
        const cleaned = JSON.parse(JSON.stringify(data));
        expect(validateJsonRoundTrip(cleaned)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  test('模型列表响应经 JSON 往返后保持一致', () => {
    fc.assert(
      fc.property(modelsListArb(), (data) => {
        const cleaned = JSON.parse(JSON.stringify(data));
        expect(validateJsonRoundTrip(cleaned)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});

// ============================================================
// Property 11: 额外字段过滤
// Feature: remote-management-enhancement
// ============================================================

describe('Feature: remote-management-enhancement, Property 11: 额外字段过滤', () => {
  /**
   * Validates: Requirements 11.3
   *
   * 对于任意 JSON 对象和允许字段列表，
   * stripExtraFields(data, allowedKeys) 的结果应仅包含 allowedKeys 中列出的字段，
   * 且这些字段的值与原始对象中的值相同。
   */

  test('结果仅包含 allowedKeys 中的字段', () => {
    fc.assert(
      fc.property(
        objectWithExtraFieldsArb(['name', 'age'], ['secret', 'internal']),
        (data) => {
          const allowedKeys = ['name', 'age'];
          const result = stripExtraFields(data, allowedKeys);
          const resultKeys = Object.keys(result as Record<string, unknown>);
          // 结果中的每个 key 都必须在 allowedKeys 中
          for (const key of resultKeys) {
            expect(allowedKeys).toContain(key);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  test('额外字段被正确过滤', () => {
    fc.assert(
      fc.property(
        objectWithExtraFieldsArb(['name', 'age'], ['secret', 'internal']),
        (data) => {
          const allowedKeys = ['name', 'age'];
          const result = stripExtraFields(data, allowedKeys) as Record<string, unknown>;
          // 额外字段不应出现在结果中
          expect(result).not.toHaveProperty('secret');
          expect(result).not.toHaveProperty('internal');
        },
      ),
      { numRuns: 100 },
    );
  });

  test('保留字段的值与原始对象一致', () => {
    fc.assert(
      fc.property(
        objectWithExtraFieldsArb(['name', 'age'], ['secret', 'internal']),
        (data) => {
          const allowedKeys = ['name', 'age'];
          const result = stripExtraFields(data, allowedKeys) as Record<string, unknown>;
          // 保留字段的值应与原始对象一致
          for (const key of allowedKeys) {
            if (key in data) {
              expect(result[key]).toBe(data[key]);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  test('空 allowedKeys 列表返回空对象', () => {
    fc.assert(
      fc.property(
        fc.dictionary(
          fc.string({ minLength: 1, maxLength: 10, unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')) }),
          fc.string(),
        ),
        (data) => {
          const result = stripExtraFields(data, []);
          expect(Object.keys(result as Record<string, unknown>)).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  test('非对象输入返回空对象', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.constant(null), fc.constant(undefined), fc.integer(), fc.string(), fc.boolean()),
        (data) => {
          const result = stripExtraFields(data, ['name', 'age']);
          expect(Object.keys(result as Record<string, unknown>)).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  test('使用随机字段名和允许列表进行过滤验证', () => {
    const keyArb = fc.string({ minLength: 1, maxLength: 10, unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')) });
    fc.assert(
      fc.property(
        fc.dictionary(keyArb, fc.string({ minLength: 1, maxLength: 20 })),
        fc.array(keyArb, { minLength: 0, maxLength: 5 }),
        (data, allowedKeys) => {
          const result = stripExtraFields(data, allowedKeys) as Record<string, unknown>;
          const resultKeys = Object.keys(result);
          const allowedSet = new Set(allowedKeys);
          // 结果中的每个 key 都必须在 allowedKeys 中
          for (const key of resultKeys) {
            expect(allowedSet.has(key)).toBe(true);
          }
          // 结果中保留字段的值与原始对象一致
          for (const key of resultKeys) {
            expect(result[key]).toBe(data[key]);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ============================================================
// Property 12: 无效 JSON 错误处理
// Feature: remote-management-enhancement
// ============================================================

describe('Feature: remote-management-enhancement, Property 12: 无效 JSON 错误处理', () => {
  /**
   * Validates: Requirements 11.4
   *
   * 对于任意非有效 JSON 的字符串输入，
   * 远程响应解析应返回 { success: false } 且 error 字段包含"响应格式错误"。
   */

  test('非 JSON 字符串输入返回 { success: false } 且 error 包含"响应格式错误"', () => {
    fc.assert(
      fc.property(invalidJsonArb(), (raw) => {
        const result = parseRemoteJson(raw);
        // 无效 JSON 应返回 success: false
        expect(result.success).toBe(false);
        if (!result.success) {
          // error 字段应包含"响应格式错误"
          expect(result.error).toContain('响应格式错误');
        }
      }),
      { numRuns: 100 },
    );
  });

  test('有效 JSON 字符串输入返回 { success: true }', () => {
    fc.assert(
      fc.property(
        jsonSerializableArb().map((v) => JSON.stringify(v)),
        (raw) => {
          const result = parseRemoteJson(raw);
          // 有效 JSON 应返回 success: true
          expect(result.success).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  test('有效 JSON 解析后的 data 与 JSON.parse 结果一致', () => {
    fc.assert(
      fc.property(
        jsonSerializableArb().map((v) => JSON.stringify(v)),
        (raw) => {
          const result = parseRemoteJson(raw);
          if (result.success) {
            // 解析结果应与 JSON.parse 一致
            expect(result.data).toEqual(JSON.parse(raw));
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  test('空字符串返回 { success: false }', () => {
    const result = parseRemoteJson('');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('响应格式错误');
    }
  });
});
