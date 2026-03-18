/**
 * 属性测试：网络错误分类
 * Feature: setup-flow-hardening, Property 6: 网络错误区分
 *
 * 验证 mapNetworkError 对 ECONNREFUSED、ENOTFOUND/EAI_AGAIN、ETIMEDOUT
 * 三类核心网络错误码的正确区分，以及返回的中文诊断信息。
 *
 * Validates: Requirements 5.4
 */

import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';
import { mapNetworkError } from '../remoteConnectionLogic';

// ── 生成器（Arbitraries）──────────────────────────────────────────────────

/**
 * 生成连接拒绝错误码
 */
const connRefusedCodeArb = (): fc.Arbitrary<string> =>
  fc.constant('ECONNREFUSED');

/**
 * 生成 DNS 解析失败错误码（ENOTFOUND 或 EAI_AGAIN）
 */
const dnsErrorCodeArb = (): fc.Arbitrary<string> =>
  fc.constantFrom('ENOTFOUND', 'EAI_AGAIN');

/**
 * 生成连接超时错误码
 */
const timeoutCodeArb = (): fc.Arbitrary<string> =>
  fc.constant('ETIMEDOUT');

/**
 * 生成随机错误消息字符串
 */
const messageArb = (): fc.Arbitrary<string> =>
  fc.string({ minLength: 1, maxLength: 80 });

/**
 * 生成错误码放置位置：直接在 code 字段或嵌套在 cause.code 中
 * 返回一个包含 code 和/或 cause.code 的错误对象
 */
const errorWithCodeArb = (
  codeArb: fc.Arbitrary<string>,
): fc.Arbitrary<{ code?: string; cause?: { code?: string }; message?: string }> =>
  fc.tuple(codeArb, messageArb(), fc.boolean()).map(([code, message, useCause]) =>
    useCause
      ? { cause: { code }, message }
      : { code, message },
  );


/**
 * 生成所有已知的网络错误码（用于排除测试）
 */
const ALL_KNOWN_CODES = [
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNRESET',
  'ETIMEDOUT',
  'CERT_HAS_EXPIRED',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
];

/**
 * 生成未知错误码（不在已知列表中的随机字符串）
 */
const unknownCodeArb = (): fc.Arbitrary<string> =>
  fc.stringMatching(/^[A-Z][A-Z0-9_]{2,20}$/)
    .filter((s) => !ALL_KNOWN_CODES.includes(s));

// ============================================================
// Property 6: 网络错误区分
// Feature: setup-flow-hardening
// ============================================================

describe('Feature: setup-flow-hardening, Property 6: 网络错误区分', () => {
  /**
   * Validates: Requirements 5.4
   *
   * 对于任意网络错误对象（包含 code 或 cause.code 字段），
   * mapNetworkError 应正确区分 ECONNREFUSED（连接拒绝）、
   * ENOTFOUND/EAI_AGAIN（DNS 解析失败）和 ETIMEDOUT（连接超时），
   * 且返回的错误描述应包含对应的中文诊断信息。
   */

  // ── ECONNREFUSED 连接拒绝 ──────────────────────────────────────────

  test('ECONNREFUSED 错误码始终映射为包含"连接被拒绝"的中文描述', () => {
    fc.assert(
      fc.property(errorWithCodeArb(connRefusedCodeArb()), (err) => {
        const result = mapNetworkError(err);
        // 连接拒绝错误应包含"连接被拒绝"关键词
        expect(result).toContain('连接被拒绝');
      }),
      { numRuns: 100 },
    );
  });

  test('ECONNREFUSED 错误描述包含服务器运行和端口相关的诊断提示', () => {
    fc.assert(
      fc.property(errorWithCodeArb(connRefusedCodeArb()), (err) => {
        const result = mapNetworkError(err);
        // 诊断信息应提示检查服务器运行状态和端口
        expect(result).toContain('服务器');
        expect(result).toContain('端口');
      }),
      { numRuns: 100 },
    );
  });

  // ── ENOTFOUND / EAI_AGAIN DNS 解析失败 ────────────────────────────

  test('ENOTFOUND 和 EAI_AGAIN 错误码始终映射为包含"无法解析"的中文描述', () => {
    fc.assert(
      fc.property(errorWithCodeArb(dnsErrorCodeArb()), (err) => {
        const result = mapNetworkError(err);
        // DNS 解析失败应包含"无法解析"关键词
        expect(result).toContain('无法解析');
      }),
      { numRuns: 100 },
    );
  });

  test('DNS 解析失败错误描述包含主机名相关的诊断提示', () => {
    fc.assert(
      fc.property(errorWithCodeArb(dnsErrorCodeArb()), (err) => {
        const result = mapNetworkError(err);
        // 诊断信息应提示检查主机名
        expect(result).toContain('主机名');
      }),
      { numRuns: 100 },
    );
  });

  // ── ETIMEDOUT 连接超时 ─────────────────────────────────────────────

  test('ETIMEDOUT 错误码始终映射为包含"连接超时"的中文描述', () => {
    fc.assert(
      fc.property(errorWithCodeArb(timeoutCodeArb()), (err) => {
        const result = mapNetworkError(err);
        // 连接超时应包含"连接超时"关键词
        expect(result).toContain('连接超时');
      }),
      { numRuns: 100 },
    );
  });

  test('ETIMEDOUT 错误描述包含服务器地址和端口相关的诊断提示', () => {
    fc.assert(
      fc.property(errorWithCodeArb(timeoutCodeArb()), (err) => {
        const result = mapNetworkError(err);
        // 诊断信息应提示检查服务器地址和端口
        expect(result).toContain('服务器地址');
        expect(result).toContain('端口');
      }),
      { numRuns: 100 },
    );
  });

  // ── 三类错误互斥性 ─────────────────────────────────────────────────

  test('三类核心网络错误的映射结果互不相同', () => {
    fc.assert(
      fc.property(messageArb(), (message) => {
        const refused = mapNetworkError({ code: 'ECONNREFUSED', message });
        const dns = mapNetworkError({ code: 'ENOTFOUND', message });
        const timeout = mapNetworkError({ code: 'ETIMEDOUT', message });

        // 三类错误的描述应互不相同
        expect(refused).not.toBe(dns);
        expect(refused).not.toBe(timeout);
        expect(dns).not.toBe(timeout);
      }),
      { numRuns: 100 },
    );
  });

  test('ENOTFOUND 和 EAI_AGAIN 映射为相同的 DNS 解析失败描述', () => {
    fc.assert(
      fc.property(messageArb(), (message) => {
        const notFound = mapNetworkError({ code: 'ENOTFOUND', message });
        const eaiAgain = mapNetworkError({ code: 'EAI_AGAIN', message });

        // 两个 DNS 错误码应映射为相同的描述
        expect(notFound).toBe(eaiAgain);
      }),
      { numRuns: 100 },
    );
  });

  // ── cause.code 嵌套错误码支持 ─────────────────────────────────────

  test('错误码在 cause.code 中时与直接在 code 中的映射结果一致', () => {
    const coreCodesArb = fc.constantFrom('ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT');
    fc.assert(
      fc.property(coreCodesArb, messageArb(), (code, message) => {
        const directResult = mapNetworkError({ code, message });
        const causeResult = mapNetworkError({ cause: { code }, message });

        // cause.code 和 code 应产生相同的映射结果
        expect(causeResult).toBe(directResult);
      }),
      { numRuns: 100 },
    );
  });

  // ── 三类核心错误不返回通用格式 ─────────────────────────────────────

  test('三类核心网络错误码不返回以"网络错误:"开头的通用描述', () => {
    const coreCodesArb = fc.constantFrom('ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT');
    fc.assert(
      fc.property(coreCodesArb, messageArb(), (code, message) => {
        const result = mapNetworkError({ code, message });
        // 已知核心错误码不应返回通用格式
        expect(result).not.toMatch(/^网络错误:/);
      }),
      { numRuns: 100 },
    );
  });

  // ── 未知错误码回退到通用格式 ───────────────────────────────────────

  test('未知错误码返回以"网络错误:"开头的通用描述，包含原始 message', () => {
    fc.assert(
      fc.property(unknownCodeArb(), messageArb(), (code, message) => {
        const result = mapNetworkError({ code, message });
        // 未知错误码应回退到通用格式
        expect(result).toMatch(/^网络错误:/);
        // 通用描述应包含原始 message
        expect(result).toContain(message);
      }),
      { numRuns: 100 },
    );
  });
});
