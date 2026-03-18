/**
 * 属性测试：Remote Connector 超时处理一致性
 * Feature: setup-flow-optimization
 * 覆盖 Property 3: 超时处理一致性
 *
 * 由于 testRemoteConnection() 依赖 Electron 环境和 fetch API，无法直接在 vitest 中运行。
 * 因此提取纯函数到 remoteConnectionLogic.ts 封装核心逻辑，
 * 使用 fast-check 生成随机的 host/port/protocol/token 组合来验证超时处理的一致性。
 */

import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  buildRemoteUrl,
  buildTimeoutResult,
  mapNetworkError,
  parseVersionFromBody,
  isAuthError,
  isSelfSignedCertError,
  buildCertErrorMessage,
} from '../remoteConnectionLogic';
import type { RemoteConnectionPayload } from '../remoteConnectionLogic';

// ── 生成器（Arbitraries）──────────────────────────────────────────────────

/**
 * 生成合法的主机名（域名或 IP 地址风格）
 * 覆盖常见的主机名格式：纯字母域名、带数字域名、IP 地址
 */
const hostArb = (): fc.Arbitrary<string> =>
  fc.oneof(
    // 域名风格：example.com, my-server.local
    fc.string({ minLength: 1, maxLength: 20, unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-'.split('')) })
      .filter((s) => s.length > 0 && !s.startsWith('-') && !s.endsWith('-'))
      .map((s) => `${s}.example.com`),
    // IP 地址风格：192.168.1.100
    fc.tuple(
      fc.integer({ min: 1, max: 255 }),
      fc.integer({ min: 0, max: 255 }),
      fc.integer({ min: 0, max: 255 }),
      fc.integer({ min: 1, max: 255 }),
    ).map(([a, b, c, d]) => `${a}.${b}.${c}.${d}`),
    // localhost
    fc.constant('localhost'),
  );

/**
 * 生成合法的端口号（1-65535）
 */
const portArb = (): fc.Arbitrary<number> =>
  fc.integer({ min: 1, max: 65535 });

/**
 * 生成协议类型
 */
const protocolArb = (): fc.Arbitrary<'http' | 'https'> =>
  fc.constantFrom('http' as const, 'https' as const);

/**
 * 生成可选的 token 字符串
 */
const tokenArb = (): fc.Arbitrary<string | undefined> =>
  fc.option(
    fc.string({ minLength: 1, maxLength: 64, unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_-'.split('')) }),
    { nil: undefined },
  );

/**
 * 生成完整的远程连接参数
 */
const payloadArb = (): fc.Arbitrary<RemoteConnectionPayload> =>
  fc.record({
    host: hostArb(),
    port: fc.option(portArb(), { nil: undefined }),
    protocol: protocolArb(),
    token: tokenArb(),
  });

/**
 * 生成带有明确端口的远程连接参数（用于验证端口传递）
 */
const payloadWithPortArb = (): fc.Arbitrary<RemoteConnectionPayload> =>
  fc.record({
    host: hostArb(),
    port: portArb().map((p) => p as number | undefined),
    protocol: protocolArb(),
    token: tokenArb(),
  });

/**
 * 生成已知的网络错误码
 */
const knownErrorCodeArb = (): fc.Arbitrary<string> =>
  fc.constantFrom(
    'ECONNREFUSED',
    'ENOTFOUND',
    'EAI_AGAIN',
    'ECONNRESET',
    'ETIMEDOUT',
    'CERT_HAS_EXPIRED',
    'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
    'DEPTH_ZERO_SELF_SIGNED_CERT',
    'SELF_SIGNED_CERT_IN_CHAIN',
  );

/**
 * 生成 HTTP 状态码
 */
const statusCodeArb = (): fc.Arbitrary<number> =>
  fc.integer({ min: 100, max: 599 });

/**
 * 生成模拟的 API 响应体
 */
const responseBodyArb = (): fc.Arbitrary<any> =>
  fc.oneof(
    // 标准格式：{ version: "x.y.z" }
    fc.tuple(
      fc.integer({ min: 1, max: 10 }),
      fc.integer({ min: 0, max: 20 }),
      fc.integer({ min: 0, max: 99 }),
    ).map(([major, minor, patch]) => ({ version: `${major}.${minor}.${patch}` })),
    // 简写格式：{ v: "x.y.z" }
    fc.tuple(
      fc.integer({ min: 1, max: 10 }),
      fc.integer({ min: 0, max: 20 }),
      fc.integer({ min: 0, max: 99 }),
    ).map(([major, minor, patch]) => ({ v: `${major}.${minor}.${patch}` })),
    // 嵌套格式：{ data: { version: "x.y.z" } }
    fc.tuple(
      fc.integer({ min: 1, max: 10 }),
      fc.integer({ min: 0, max: 20 }),
      fc.integer({ min: 0, max: 99 }),
    ).map(([major, minor, patch]) => ({ data: { version: `${major}.${minor}.${patch}` } })),
    // 空对象
    fc.constant({}),
    // null / undefined
    fc.constant(null),
    fc.constant(undefined),
  );

// ============================================================
// Property 3: 超时处理一致性
// Feature: setup-flow-optimization
// ============================================================

describe('Feature: setup-flow-optimization, Property 3: 超时处理一致性', () => {
  /**
   * Validates: Requirements 9.5
   *
   * 对于任意 host/port 组合，超时后始终返回 `{ success: false }` 且 error 包含"超时"。
   * 通过测试 buildTimeoutResult 纯函数验证超时结果构建的一致性。
   */

  test('对于任意 host/port/protocol/token 组合，超时结果的 success 始终为 false', () => {
    fc.assert(
      fc.property(payloadArb(), (payload) => {
        const result = buildTimeoutResult(payload);
        // 超时结果的 success 必须为 false
        expect(result.success).toBe(false);
      }),
      { numRuns: 200 },
    );
  });

  test('对于任意 host/port 组合，超时结果的 error 始终包含"超时"', () => {
    fc.assert(
      fc.property(payloadArb(), (payload) => {
        const result = buildTimeoutResult(payload);
        // 超时错误信息必须包含"超时"关键字
        expect(result.error).toContain('超时');
      }),
      { numRuns: 200 },
    );
  });

  test('超时结果中的 host 与输入 payload 的 host 一致', () => {
    fc.assert(
      fc.property(payloadArb(), (payload) => {
        const result = buildTimeoutResult(payload);
        // 返回的 host 必须与输入一致
        expect(result.host).toBe(payload.host);
      }),
      { numRuns: 200 },
    );
  });

  test('超时结果中的 port 与输入 payload 的 port 一致（未指定时默认 3000）', () => {
    fc.assert(
      fc.property(payloadArb(), (payload) => {
        const result = buildTimeoutResult(payload);
        // 返回的 port 必须与输入一致，未指定时为默认值 3000
        const expectedPort = payload.port ?? 3000;
        expect(result.port).toBe(expectedPort);
      }),
      { numRuns: 200 },
    );
  });

  test('ETIMEDOUT 网络错误码同样映射为包含"超时"的错误信息', () => {
    fc.assert(
      fc.property(payloadArb(), (payload) => {
        // ETIMEDOUT 是底层 TCP 超时错误码，也应映射为包含"超时"的消息
        const errorMsg = mapNetworkError({ code: 'ETIMEDOUT', message: 'connection timed out' });
        expect(errorMsg).toContain('超时');
      }),
      { numRuns: 50 },
    );
  });
});

// ============================================================
// 辅助纯函数测试：buildRemoteUrl
// ============================================================

describe('buildRemoteUrl URL 构建', () => {
  test('生成的 URL 始终包含 /api/version 路径', () => {
    fc.assert(
      fc.property(payloadArb(), (payload) => {
        const url = buildRemoteUrl(payload);
        expect(url).toContain('/api/version');
      }),
      { numRuns: 200 },
    );
  });

  test('生成的 URL 始终以 payload 的 protocol 开头', () => {
    fc.assert(
      fc.property(payloadArb(), (payload) => {
        const url = buildRemoteUrl(payload);
        const expectedProtocol = payload.protocol || 'http';
        expect(url.startsWith(`${expectedProtocol}://`)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  test('生成的 URL 包含 payload 的 host', () => {
    fc.assert(
      fc.property(payloadArb(), (payload) => {
        const url = buildRemoteUrl(payload);
        expect(url).toContain(payload.host);
      }),
      { numRuns: 200 },
    );
  });

  test('未指定 port 时使用默认端口 3000', () => {
    fc.assert(
      fc.property(
        fc.record({
          host: hostArb(),
          protocol: protocolArb(),
          token: tokenArb(),
        }),
        (params) => {
          const payload: RemoteConnectionPayload = { ...params };
          const url = buildRemoteUrl(payload);
          expect(url).toContain(':3000/');
        },
      ),
      { numRuns: 200 },
    );
  });

  test('指定 port 时 URL 中包含该端口', () => {
    fc.assert(
      fc.property(payloadWithPortArb(), (payload) => {
        const url = buildRemoteUrl(payload);
        if (payload.port !== undefined) {
          expect(url).toContain(`:${payload.port}/`);
        }
      }),
      { numRuns: 200 },
    );
  });
});

// ============================================================
// 辅助纯函数测试：mapNetworkError
// ============================================================

describe('mapNetworkError 网络错误映射', () => {
  test('已知错误码始终返回中文错误描述（不含原始错误码）', () => {
    fc.assert(
      fc.property(knownErrorCodeArb(), (code) => {
        const result = mapNetworkError({ code, message: 'some error' });
        // 已知错误码应返回中文描述，不应以"网络错误:"开头
        expect(result).not.toMatch(/^网络错误:/);
        // 返回值应为非空字符串
        expect(result.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });

  test('未知错误码返回以"网络错误:"开头的通用描述', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20, unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ_'.split('')) })
          .filter((s) => !['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'ETIMEDOUT',
            'CERT_HAS_EXPIRED', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
            'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN'].includes(s)),
        fc.string({ minLength: 1, maxLength: 50 }),
        (code, message) => {
          const result = mapNetworkError({ code, message });
          // 未知错误码应返回通用格式
          expect(result).toMatch(/^网络错误:/);
        },
      ),
      { numRuns: 100 },
    );
  });

  test('错误码在 cause.code 中时同样能正确映射', () => {
    fc.assert(
      fc.property(knownErrorCodeArb(), (code) => {
        // 错误码放在 cause.code 中（某些 Node.js 版本的行为）
        const result = mapNetworkError({ cause: { code }, message: 'wrapped error' });
        // 应与直接使用 code 时返回相同的结果
        const directResult = mapNetworkError({ code, message: 'direct error' });
        expect(result).toBe(directResult);
      }),
      { numRuns: 100 },
    );
  });
});

// ============================================================
// 辅助纯函数测试：parseVersionFromBody
// ============================================================

describe('parseVersionFromBody 版本号解析', () => {
  test('对于包含 version 字段的响应体，返回该字段值', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }),
        (version) => {
          const result = parseVersionFromBody({ version });
          expect(result).toBe(version);
        },
      ),
      { numRuns: 100 },
    );
  });

  test('对于仅包含 v 字段的响应体，返回该字段值', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }),
        (v) => {
          const result = parseVersionFromBody({ v });
          expect(result).toBe(v);
        },
      ),
      { numRuns: 100 },
    );
  });

  test('对于仅包含 data.version 字段的响应体，返回该字段值', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }),
        (version) => {
          const result = parseVersionFromBody({ data: { version } });
          expect(result).toBe(version);
        },
      ),
      { numRuns: 100 },
    );
  });

  test('对于 null、undefined 或非对象输入，始终返回 "unknown"', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(null),
          fc.constant(undefined),
          fc.integer(),
          fc.string(),
          fc.boolean(),
        ),
        (body) => {
          const result = parseVersionFromBody(body);
          expect(result).toBe('unknown');
        },
      ),
      { numRuns: 100 },
    );
  });

  test('对于空对象，返回 "unknown"', () => {
    expect(parseVersionFromBody({})).toBe('unknown');
  });
});

// ============================================================
// 辅助纯函数测试：isAuthError
// ============================================================

describe('isAuthError 认证错误判断', () => {
  test('状态码 401 和 403 始终返回 true', () => {
    expect(isAuthError(401)).toBe(true);
    expect(isAuthError(403)).toBe(true);
  });

  test('非 401/403 的状态码始终返回 false', () => {
    fc.assert(
      fc.property(
        statusCodeArb().filter((code) => code !== 401 && code !== 403),
        (statusCode) => {
          expect(isAuthError(statusCode)).toBe(false);
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ============================================================
// Property 13: 自签名证书错误识别
// Feature: setup-flow-hardening
// ============================================================

describe('Feature: setup-flow-hardening, Property 13: 自签名证书错误识别', () => {
  /**
   * Validates: Requirements 8.1
   *
   * 对于任意错误对象，当 code 或 cause.code 为
   * DEPTH_ZERO_SELF_SIGNED_CERT 或 SELF_SIGNED_CERT_IN_CHAIN 时，
   * isSelfSignedCertError 应返回 true；对于其他错误码应返回 false。
   * 且 buildCertErrorMessage 的输出应包含"跳过证书验证"的提示文本。
   */

  /** 生成自签名证书错误码 */
  const selfSignedCodeArb = (): fc.Arbitrary<string> =>
    fc.constantFrom('DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN');

  /** 生成非自签名证书的错误码（排除两个自签名错误码） */
  const nonSelfSignedCodeArb = (): fc.Arbitrary<string> =>
    fc.string({ minLength: 1, maxLength: 30, unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ_'.split('')) })
      .filter((s) => s !== 'DEPTH_ZERO_SELF_SIGNED_CERT' && s !== 'SELF_SIGNED_CERT_IN_CHAIN');

  test('自签名证书错误码在 err.code 中时，isSelfSignedCertError 返回 true', () => {
    fc.assert(
      fc.property(selfSignedCodeArb(), (code) => {
        // 错误码直接在 err.code 中
        expect(isSelfSignedCertError({ code })).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  test('自签名证书错误码在 err.cause.code 中时，isSelfSignedCertError 返回 true', () => {
    fc.assert(
      fc.property(selfSignedCodeArb(), (code) => {
        // 错误码在 cause.code 中（某些 Node.js 版本的行为）
        expect(isSelfSignedCertError({ cause: { code } })).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  test('非自签名证书错误码时，isSelfSignedCertError 返回 false', () => {
    fc.assert(
      fc.property(nonSelfSignedCodeArb(), (code) => {
        // 非自签名证书错误码应返回 false
        expect(isSelfSignedCertError({ code })).toBe(false);
        expect(isSelfSignedCertError({ cause: { code } })).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  test('空错误对象时，isSelfSignedCertError 返回 false', () => {
    // 无 code 和 cause 的空对象
    expect(isSelfSignedCertError({})).toBe(false);
    expect(isSelfSignedCertError({ cause: {} })).toBe(false);
  });

  test('自签名证书错误时，buildCertErrorMessage 输出包含"跳过证书验证"', () => {
    fc.assert(
      fc.property(selfSignedCodeArb(), (code) => {
        // 自签名证书错误消息应包含"跳过证书验证"提示
        const msgFromCode = buildCertErrorMessage({ code });
        expect(msgFromCode).toContain('跳过证书验证');

        // cause.code 中的错误码同样应包含提示
        const msgFromCause = buildCertErrorMessage({ cause: { code } });
        expect(msgFromCause).toContain('跳过证书验证');
      }),
      { numRuns: 100 },
    );
  });

  test('非自签名证书错误时，buildCertErrorMessage 仍包含"跳过证书验证"提示', () => {
    fc.assert(
      fc.property(nonSelfSignedCodeArb(), (code) => {
        // 即使非自签名错误，消息也应包含"跳过证书验证"作为兜底建议
        const msg = buildCertErrorMessage({ code });
        expect(msg).toContain('跳过证书验证');
      }),
      { numRuns: 100 },
    );
  });
});

// ============================================================
// Property 14: HTTP 认证错误判断
// Feature: setup-flow-hardening
// ============================================================

describe('Feature: setup-flow-hardening, Property 14: HTTP 认证错误判断', () => {
  /**
   * Validates: Requirements 8.4
   *
   * 对于任意 HTTP 状态码（0-599），isAuthError 应返回 true
   * 当且仅当状态码为 401 或 403。
   */

  test('对于任意 HTTP 状态码，isAuthError 返回 true 当且仅当状态码为 401 或 403', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 599 }),
        (statusCode) => {
          const result = isAuthError(statusCode);
          const expected = statusCode === 401 || statusCode === 403;
          // 双向验证：返回值与预期完全一致
          expect(result).toBe(expected);
        },
      ),
      { numRuns: 200 },
    );
  });

  test('401 和 403 始终返回 true（确定性验证）', () => {
    // 确定性验证两个认证错误状态码
    expect(isAuthError(401)).toBe(true);
    expect(isAuthError(403)).toBe(true);
  });

  test('常见非认证状态码始终返回 false', () => {
    // 验证常见的非认证状态码
    const nonAuthCodes = [200, 201, 204, 301, 302, 400, 404, 405, 500, 502, 503];
    for (const code of nonAuthCodes) {
      expect(isAuthError(code)).toBe(false);
    }
  });
});

// ============================================================
// Property 15: 响应体版本号提取
// Feature: setup-flow-hardening
// ============================================================

describe('Feature: setup-flow-hardening, Property 15: 响应体版本号提取', () => {
  /**
   * Validates: Requirements 8.5
   *
   * 对于任意响应体对象，parseVersionFromBody 应按优先级提取
   * body.version > body.v > body.data.version，
   * 均不存在时返回 'unknown'。对于 null 或非对象输入，应返回 'unknown'。
   */

  /** 生成非空版本号字符串 */
  const versionStrArb = (): fc.Arbitrary<string> =>
    fc.tuple(
      fc.integer({ min: 0, max: 99 }),
      fc.integer({ min: 0, max: 99 }),
      fc.integer({ min: 0, max: 99 }),
    ).map(([a, b, c]) => `${a}.${b}.${c}`);

  test('body.version 存在时，优先返回 body.version（最高优先级）', () => {
    fc.assert(
      fc.property(
        versionStrArb(),
        versionStrArb(),
        versionStrArb(),
        (version, v, dataVersion) => {
          // 三个字段同时存在时，应返回 body.version
          const body = { version, v, data: { version: dataVersion } };
          expect(parseVersionFromBody(body)).toBe(version);
        },
      ),
      { numRuns: 100 },
    );
  });

  test('body.version 不存在但 body.v 存在时，返回 body.v（第二优先级）', () => {
    fc.assert(
      fc.property(
        versionStrArb(),
        versionStrArb(),
        (v, dataVersion) => {
          // 无 version 字段，有 v 和 data.version 时应返回 v
          const body = { v, data: { version: dataVersion } };
          expect(parseVersionFromBody(body)).toBe(v);
        },
      ),
      { numRuns: 100 },
    );
  });

  test('仅 body.data.version 存在时，返回 body.data.version（第三优先级）', () => {
    fc.assert(
      fc.property(
        versionStrArb(),
        (dataVersion) => {
          // 仅有 data.version 时应返回该值
          const body = { data: { version: dataVersion } };
          expect(parseVersionFromBody(body)).toBe(dataVersion);
        },
      ),
      { numRuns: 100 },
    );
  });

  test('所有版本字段均不存在时，返回 "unknown"', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant({}),
          fc.constant({ data: {} }),
          fc.constant({ other: 'field' }),
          fc.constant(null),
          fc.constant(undefined),
        ),
        (body) => {
          // 无任何版本字段时应返回 'unknown'
          expect(parseVersionFromBody(body)).toBe('unknown');
        },
      ),
      { numRuns: 100 },
    );
  });

  test('非对象输入（数字、字符串、布尔值）始终返回 "unknown"', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.integer(), fc.string(), fc.boolean()),
        (body) => {
          // 非对象类型应安全返回 'unknown'
          expect(parseVersionFromBody(body)).toBe('unknown');
        },
      ),
      { numRuns: 100 },
    );
  });
});
