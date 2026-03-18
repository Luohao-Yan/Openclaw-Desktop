/**
 * 属性测试：ZodError Schema 错误解析
 * Feature: setup-flow-hardening
 *
 * 本文件包含 verifyLogic.ts 中 parseZodErrorDetails 的属性测试。
 * 验证对包含有效 ZodError JSON 的字符串，提取的 path+message 数量
 * 等于输入中的错误条目数。
 */

import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';
import { parseZodErrorDetails } from '../verifyLogic';

// ── 生成器（Arbitraries）──────────────────────────────────────────────────

/**
 * 生成合法的 ZodError path 段
 * 模拟真实 Zod 路径：字符串键名或数字索引
 */
const zodPathSegmentArb = (): fc.Arbitrary<string | number> =>
  fc.oneof(
    fc.stringMatching(/^[a-zA-Z_][a-zA-Z0-9_]{0,20}$/),
    fc.integer({ min: 0, max: 99 }),
  );

/**
 * 生成合法的 ZodError path 数组
 * 模拟真实 Zod 路径：如 ["session", "dmScope"] 或 ["channels", 0, "name"]
 */
const zodPathArb = (): fc.Arbitrary<Array<string | number>> =>
  fc.array(zodPathSegmentArb(), { minLength: 0, maxLength: 5 });

/**
 * 生成合法的 ZodError message 字符串
 * 模拟真实 Zod 错误消息：可打印 ASCII 字符串，不含控制字符
 */
const zodMessageArb = (): fc.Arbitrary<string> =>
  fc.stringMatching(/^[a-zA-Z0-9 _.,:;!?()-]{1,60}$/);

/**
 * 生成单条 ZodError issue 对象
 * 包含 path 数组和 message 字段
 */
const zodIssueArb = (): fc.Arbitrary<{ path: Array<string | number>; message: string }> =>
  fc.record({
    path: zodPathArb(),
    message: zodMessageArb(),
  });

/**
 * 生成非空的 ZodError issues 数组
 * 至少包含 1 条错误条目，最多 10 条
 */
const zodIssuesArb = (): fc.Arbitrary<Array<{ path: Array<string | number>; message: string }>> =>
  fc.array(zodIssueArb(), { minLength: 1, maxLength: 10 });

/**
 * 生成完整的 ZodError JSON 对象字符串
 * 格式：{ "issues": [...], "name": "ZodError" }
 */
const zodErrorJsonObjectArb = (): fc.Arbitrary<{ json: string; count: number }> =>
  zodIssuesArb().map((issues) => ({
    json: JSON.stringify({ issues, name: 'ZodError' }),
    count: issues.length,
  }));

/**
 * 生成独立的 issues 数组 JSON 字符串
 * 格式：[{ "path": [...], "message": "..." }, ...]
 */
const zodIssuesArrayJsonArb = (): fc.Arbitrary<{ json: string; count: number }> =>
  zodIssuesArb().map((issues) => ({
    json: JSON.stringify(issues),
    count: issues.length,
  }));

/**
 * 生成嵌套在其他文本中的 ZodError JSON 片段
 * 模拟 CLI 输出中包含 ZodError 的场景
 */
const embeddedZodErrorArb = (): fc.Arbitrary<{ text: string; count: number }> =>
  fc.tuple(
    fc.stringMatching(/^[a-zA-Z0-9 ]{0,30}$/),
    zodErrorJsonObjectArb(),
    fc.stringMatching(/^[a-zA-Z0-9 ]{0,30}$/),
  ).map(([prefix, zodObj, suffix]) => ({
    text: `${prefix}\n${zodObj.json}\n${suffix}`,
    count: zodObj.count,
  }));

// ============================================================
// Property 7: ZodError Schema 错误解析
// Feature: setup-flow-hardening
// ============================================================

describe('Feature: setup-flow-hardening, Property 7: ZodError Schema 错误解析', () => {
  /**
   * Validates: Requirements 5.5
   *
   * 对于任意包含有效 ZodError JSON 对象的字符串，
   * parseZodErrorDetails 提取的条目数应等于输入中的 issues 数量。
   */
  test('完整 ZodError JSON 对象：提取数量应等于 issues 数量', () => {
    fc.assert(
      fc.property(zodErrorJsonObjectArb(), ({ json, count }) => {
        const result = parseZodErrorDetails(json);

        // 提取的条目数应等于输入中的 issues 数量
        expect(result.length).toBe(count);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 5.5
   *
   * 对于任意独立的 issues 数组 JSON 字符串，
   * parseZodErrorDetails 提取的条目数应等于数组长度。
   */
  test('独立 issues 数组 JSON：提取数量应等于数组长度', () => {
    fc.assert(
      fc.property(zodIssuesArrayJsonArb(), ({ json, count }) => {
        const result = parseZodErrorDetails(json);

        // 提取的条目数应等于输入数组长度
        expect(result.length).toBe(count);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 5.5
   *
   * 对于任意嵌套在其他文本中的 ZodError JSON 片段，
   * parseZodErrorDetails 仍能正确提取所有错误条目。
   */
  test('嵌套在文本中的 ZodError JSON：提取数量应等于 issues 数量', () => {
    fc.assert(
      fc.property(embeddedZodErrorArb(), ({ text, count }) => {
        const result = parseZodErrorDetails(text);

        // 即使嵌套在其他文本中，提取数量仍应正确
        expect(result.length).toBe(count);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 5.5
   *
   * 对于任意有效的 ZodError issues，每条提取结果应包含
   * path（string）和 message（string）字段，且 message 与输入一致。
   */
  test('每条提取结果应包含 path 和 message 字段，且 message 与输入一致', () => {
    fc.assert(
      fc.property(zodIssuesArb(), (issues) => {
        const json = JSON.stringify({ issues, name: 'ZodError' });
        const result = parseZodErrorDetails(json);

        // 数量一致
        expect(result.length).toBe(issues.length);

        // 每条结果的 message 应与输入一致
        for (let i = 0; i < result.length; i++) {
          expect(typeof result[i].path).toBe('string');
          expect(typeof result[i].message).toBe('string');
          expect(result[i].message).toBe(issues[i].message);
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 5.5
   *
   * 对于任意有效的 ZodError issues，提取结果中的 path 字段
   * 应等于输入 path 数组各元素以 '.' 连接的字符串。
   */
  test('提取结果的 path 应等于输入 path 数组以点号连接的字符串', () => {
    fc.assert(
      fc.property(zodIssuesArb(), (issues) => {
        const json = JSON.stringify({ issues, name: 'ZodError' });
        const result = parseZodErrorDetails(json);

        // 每条结果的 path 应等于输入 path 数组以 '.' 连接
        for (let i = 0; i < result.length; i++) {
          const expectedPath = issues[i].path.map(String).join('.');
          expect(result[i].path).toBe(expectedPath);
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 5.5
   *
   * 对于空字符串或不包含 ZodError 结构的字符串，
   * parseZodErrorDetails 应返回空数组。
   */
  test('无 ZodError 结构的输入应返回空数组', () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-zA-Z0-9 ]{0,100}$/),
        (plainText) => {
          const result = parseZodErrorDetails(plainText);

          // 不包含 ZodError 结构时应返回空数组
          expect(result).toEqual([]);
        },
      ),
      { numRuns: 100 },
    );
  });
});
