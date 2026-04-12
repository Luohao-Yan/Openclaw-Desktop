/**
 * 属性测试：RemoteApiProxy 纯逻辑函数
 * Feature: remote-management-enhancement
 *
 * 覆盖设计文档中的以下正确性属性：
 * - Property 1: 模式路由正确性 — checkRunMode / isRemoteMode 逻辑
 * - Property 2: Bearer Token 注入 — buildRequestHeaders 逻辑
 * - Property 3: HTTP 错误分类 — classifyHttpError 逻辑
 * - Property 9: 远程 Capabilities 正确性 — getRemoteCapabilities 逻辑
 *
 * 由于 remoteRequest 依赖 fetch 和 electron-store，
 * 本测试仅验证已提取的纯逻辑函数。
 * 使用 fast-check 库，每个属性测试至少运行 100 次迭代。
 */

import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  checkRunMode,
  buildRequestHeaders,
  classifyHttpError,
  getRemoteCapabilities,
} from '../remoteApiProxyLogic';

// ── 生成器（Arbitraries）──────────────────────────────────────────────────

/**
 * 生成非空 token 字符串（模拟真实的 API token）
 */
const nonEmptyTokenArb = (): fc.Arbitrary<string> =>
  fc.string({
    minLength: 1,
    maxLength: 128,
    unit: fc.constantFrom(
      ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-.'
        .split(''),
    ),
  });

/**
 * 生成空或 undefined 的 token（无认证场景）
 */
const emptyTokenArb = (): fc.Arbitrary<string | undefined> =>
  fc.constantFrom(undefined, '');

/**
 * 生成 HTTP 状态码（100-599 范围）
 */
const statusCodeArb = (): fc.Arbitrary<number> =>
  fc.integer({ min: 100, max: 599 });

/**
 * 生成认证失败状态码（401 或 403）
 */
const authErrorCodeArb = (): fc.Arbitrary<number> =>
  fc.constantFrom(401, 403);

/**
 * 生成验证错误状态码（400）
 */
const validationErrorCodeArb = (): fc.Arbitrary<number> =>
  fc.constant(400);

/**
 * 生成非 2xx 且非 400/401/403 的状态码
 */
const genericErrorCodeArb = (): fc.Arbitrary<number> =>
  fc.integer({ min: 100, max: 599 }).filter(
    (code) => code !== 400 && code !== 401 && code !== 403 && (code < 200 || code >= 300),
  );

/**
 * 生成成功状态码（2xx 范围）
 */
const successCodeArb = (): fc.Arbitrary<number> =>
  fc.integer({ min: 200, max: 299 });

/**
 * 生成可选的响应体对象（用于 400 验证错误测试）
 */
const responseBodyArb = (): fc.Arbitrary<any> =>
  fc.oneof(
    fc.record({
      message: fc.string({ minLength: 1, maxLength: 50 }),
    }),
    fc.record({
      error: fc.string({ minLength: 1, maxLength: 50 }),
    }),
    fc.constant(undefined),
    fc.constant(null),
  );

/**
 * 生成运行模式字符串
 */
const runModeArb = (): fc.Arbitrary<string> =>
  fc.constantFrom('local', 'remote', 'unknown', '', 'LOCAL', 'REMOTE');

// ============================================================
// Property 1: 模式路由正确性
// Feature: remote-management-enhancement
// ============================================================

describe('Feature: remote-management-enhancement, Property 1: 模式路由正确性', () => {
  /**
   * Validates: Requirements 1.1, 1.6
   *
   * 当 runMode='remote' 时 checkRunMode 返回 true，
   * 当 runMode='local' 或其他值时返回 false。
   */

  test('runMode 为 "remote" 时返回 true', () => {
    expect(checkRunMode('remote')).toBe(true);
  });

  test('runMode 为 "local" 时返回 false', () => {
    expect(checkRunMode('local')).toBe(false);
  });

  test('对于任意非 "remote" 的字符串，checkRunMode 返回 false', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 30 }).filter((s) => s !== 'remote'),
        (runMode) => {
          expect(checkRunMode(runMode)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  test('checkRunMode 返回 true 当且仅当输入为 "remote"', () => {
    fc.assert(
      fc.property(runModeArb(), (runMode) => {
        const result = checkRunMode(runMode);
        const expected = runMode === 'remote';
        expect(result).toBe(expected);
      }),
      { numRuns: 100 },
    );
  });
});

// ============================================================
// Property 2: Bearer Token 注入
// Feature: remote-management-enhancement
// ============================================================

describe('Feature: remote-management-enhancement, Property 2: Bearer Token 注入', () => {
  /**
   * Validates: Requirements 1.2
   *
   * 非空 token 时请求头包含 Authorization: Bearer <token>，
   * 空 token 或 undefined 时不包含 Authorization 头。
   */

  test('非空 token 时请求头包含正确的 Authorization 字段', () => {
    fc.assert(
      fc.property(nonEmptyTokenArb(), (token) => {
        const headers = buildRequestHeaders(token);
        // 必须包含 Authorization 头
        expect(headers).toHaveProperty('Authorization');
        // Authorization 值必须为 Bearer <token> 格式
        expect(headers['Authorization']).toBe(`Bearer ${token}`);
      }),
      { numRuns: 100 },
    );
  });

  test('空字符串或 undefined token 时请求头不包含 Authorization 字段', () => {
    fc.assert(
      fc.property(emptyTokenArb(), (token) => {
        const headers = buildRequestHeaders(token);
        // 不应包含 Authorization 头
        expect(headers).not.toHaveProperty('Authorization');
      }),
      { numRuns: 100 },
    );
  });

  test('请求头始终包含 Accept 和 Content-Type 字段', () => {
    fc.assert(
      fc.property(
        fc.option(nonEmptyTokenArb(), { nil: undefined }),
        (token) => {
          const headers = buildRequestHeaders(token);
          // 始终包含 Accept 头
          expect(headers['Accept']).toBe('application/json');
          // 始终包含 Content-Type 头
          expect(headers['Content-Type']).toBe('application/json');
        },
      ),
      { numRuns: 100 },
    );
  });

  test('token 值在 Authorization 头中完整保留，不被截断或修改', () => {
    fc.assert(
      fc.property(nonEmptyTokenArb(), (token) => {
        const headers = buildRequestHeaders(token);
        // 从 Authorization 头中提取 token 部分
        const extractedToken = headers['Authorization'].replace('Bearer ', '');
        // 提取的 token 必须与输入完全一致
        expect(extractedToken).toBe(token);
      }),
      { numRuns: 100 },
    );
  });
});

// ============================================================
// Property 3: HTTP 错误分类
// Feature: remote-management-enhancement
// ============================================================

describe('Feature: remote-management-enhancement, Property 3: HTTP 错误分类', () => {
  /**
   * Validates: Requirements 1.3, 5.4
   *
   * 401/403 → authenticated: false
   * 400 → 验证错误详情
   * 其他非 2xx → 通用错误（包含状态码）
   */

  test('401/403 状态码返回 authenticated: false', () => {
    fc.assert(
      fc.property(authErrorCodeArb(), responseBodyArb(), (statusCode, body) => {
        const result = classifyHttpError(statusCode, body);
        // 认证失败标志
        expect(result.success).toBe(false);
        expect(result.authenticated).toBe(false);
        expect(result.statusCode).toBe(statusCode);
      }),
      { numRuns: 100 },
    );
  });

  test('400 状态码返回验证错误', () => {
    fc.assert(
      fc.property(responseBodyArb(), (body) => {
        const result = classifyHttpError(400, body);
        expect(result.success).toBe(false);
        // 错误信息应包含"验证错误"
        expect(result.error).toContain('验证错误');
        expect(result.statusCode).toBe(400);
        // 400 不应设置 authenticated 标志
        expect(result.authenticated).toBeUndefined();
      }),
      { numRuns: 100 },
    );
  });

  test('400 状态码且响应体包含 message 时，错误详情包含该 message', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        (message) => {
          const result = classifyHttpError(400, { message });
          expect(result.error).toContain(message);
        },
      ),
      { numRuns: 100 },
    );
  });

  test('400 状态码且响应体包含 error 时，错误详情包含该 error', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        (errorMsg) => {
          const result = classifyHttpError(400, { error: errorMsg });
          expect(result.error).toContain(errorMsg);
        },
      ),
      { numRuns: 100 },
    );
  });

  test('其他非 2xx 状态码返回通用错误（包含状态码）', () => {
    fc.assert(
      fc.property(genericErrorCodeArb(), (statusCode) => {
        const result = classifyHttpError(statusCode);
        expect(result.success).toBe(false);
        // 错误信息应包含状态码
        expect(result.error).toContain(String(statusCode));
        expect(result.statusCode).toBe(statusCode);
        // 非认证错误不应设置 authenticated 标志
        expect(result.authenticated).toBeUndefined();
      }),
      { numRuns: 100 },
    );
  });

  test('所有错误分类结果的 success 始终为 false', () => {
    fc.assert(
      fc.property(statusCodeArb(), responseBodyArb(), (statusCode, body) => {
        // 仅测试非 2xx 状态码
        if (statusCode >= 200 && statusCode < 300) return;
        const result = classifyHttpError(statusCode, body);
        expect(result.success).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  test('认证错误（401/403）与其他错误互斥：authenticated 仅在 401/403 时为 false', () => {
    fc.assert(
      fc.property(statusCodeArb(), (statusCode) => {
        if (statusCode >= 200 && statusCode < 300) return;
        const result = classifyHttpError(statusCode);
        if (statusCode === 401 || statusCode === 403) {
          expect(result.authenticated).toBe(false);
        } else {
          expect(result.authenticated).toBeUndefined();
        }
      }),
      { numRuns: 100 },
    );
  });
});


// ============================================================
// Property 9: 远程 Capabilities 正确性
// Feature: remote-management-enhancement
// ============================================================

describe('Feature: remote-management-enhancement, Property 9: 远程 Capabilities 正确性', () => {
  /**
   * Validates: Requirements 1.1, 1.6, 10.2
   *
   * 所有仅限本地的功能（gatewayStartStop、systemStats、tailscale、
   * agentWorkspace、environmentFix、customSkills、openLocalFile）
   * 在远程 capabilities 中应为 false。
   *
   * cron、approvals、agentCreate 已通过 WS RPC 实现，移入 REMOTE_AVAILABLE_FEATURES。
   */

  /** 仅限本地的功能键列表 */
  const LOCAL_ONLY_FEATURES = [
    'gatewayStartStop',
    'systemStats',
    'tailscale',
    'agentWorkspace',
    'environmentFix',
    'customSkills',
    'openLocalFile',
  ] as const;

  /** 远程可用的功能键列表 */
  const REMOTE_AVAILABLE_FEATURES = [
    'gatewayStatus',
    'sessions',
    'sessionSend',
    'channels',
    'channelEnableDisable',
    'logs',
    'config',
    'skills',
    'skillInstall',
    'models',
    'cron',
    'approvals',
    'agentCreate',
  ] as const;

  test('所有仅限本地的功能在 capabilities 中为 false', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...LOCAL_ONLY_FEATURES),
        (feature) => {
          const capabilities = getRemoteCapabilities();
          // 仅限本地的功能必须为 false
          expect(capabilities[feature]).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  test('所有远程可用的功能在 capabilities 中为 true', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...REMOTE_AVAILABLE_FEATURES),
        (feature) => {
          const capabilities = getRemoteCapabilities();
          // 远程可用的功能必须为 true
          expect(capabilities[feature]).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  test('capabilities 对象包含所有预期的键', () => {
    const capabilities = getRemoteCapabilities();
    const allKeys = [...LOCAL_ONLY_FEATURES, ...REMOTE_AVAILABLE_FEATURES];
    for (const key of allKeys) {
      expect(capabilities).toHaveProperty(key);
    }
  });

  test('capabilities 中仅限本地功能的数量为 7', () => {
    const capabilities = getRemoteCapabilities();
    const localOnlyCount = LOCAL_ONLY_FEATURES.filter(
      (key) => capabilities[key] === false,
    ).length;
    // 7 个仅限本地的功能（cron/approvals/agentCreate 已通过 WS RPC 支持）
    expect(localOnlyCount).toBe(7);
  });

  test('capabilities 中远程可用功能的数量为 13', () => {
    const capabilities = getRemoteCapabilities();
    const remoteCount = REMOTE_AVAILABLE_FEATURES.filter(
      (key) => capabilities[key] === true,
    ).length;
    // 13 个远程可用的功能（新增 cron/approvals/agentCreate）
    expect(remoteCount).toBe(13);
  });

  test('多次调用 getRemoteCapabilities 返回结构一致的结果', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10 }), (_n) => {
        const first = getRemoteCapabilities();
        const second = getRemoteCapabilities();
        // 每次调用应返回相同结构
        expect(first).toEqual(second);
      }),
      { numRuns: 100 },
    );
  });
});
