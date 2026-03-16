/**
 * 属性测试：IPC 包装函数返回 Result 类型
 * Feature: setup-flow-refactor, Property 11: IPC 包装函数返回 Result 类型
 *
 * 验证 Result<T, E> 判别联合的结构正确性：
 *   - success=true 时必有 data 字段
 *   - success=false 时必有 error 字段
 *   - 两种情况互斥：success=true 不含 error，success=false 不含 data
 */

import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';
import type { Result, SetupError, SetupErrorCode } from '../../types/setup';

// ============================================================
// 常量定义
// ============================================================

/** 所有合法的 SetupErrorCode 值 */
const VALID_ERROR_CODES: SetupErrorCode[] = [
  'IPC_UNAVAILABLE',
  'IPC_CALL_FAILED',
  'NETWORK_TIMEOUT',
  'ENVIRONMENT_CHECK_FAILED',
  'INSTALL_FAILED',
  'VERIFY_FAILED',
  'CHANNEL_TEST_FAILED',
  'REMOTE_CONNECTION_FAILED',
  'UNKNOWN',
];

// ============================================================
// 生成器（Arbitraries）
// ============================================================

/** 生成随机的 SetupErrorCode */
const errorCodeArb = (): fc.Arbitrary<SetupErrorCode> =>
  fc.constantFrom(...VALID_ERROR_CODES);

/** 生成随机的 SetupError 对象 */
const setupErrorArb = (): fc.Arbitrary<SetupError> =>
  fc.record({
    code: errorCodeArb(),
    message: fc.string({ minLength: 1, maxLength: 50 }),
    suggestion: fc.string({ minLength: 1, maxLength: 50 }),
    details: fc.option(fc.string({ maxLength: 100 }), { nil: undefined }),
  });

/** 生成随机的成功 Result（data 为任意 JSON 值） */
const successResultArb = <T>(dataArb: fc.Arbitrary<T>): fc.Arbitrary<Result<T>> =>
  dataArb.map((data): Result<T> => ({ success: true, data }));

/** 生成随机的失败 Result */
const failureResultArb = <T>(): fc.Arbitrary<Result<T>> =>
  setupErrorArb().map((error): Result<T> => ({ success: false, error }));

/**
 * 生成随机的 Result<T, SetupError>（成功或失败）
 * 使用 fc.oneof 随机选择成功或失败分支
 */
const resultArb = <T>(dataArb: fc.Arbitrary<T>): fc.Arbitrary<Result<T>> =>
  fc.oneof(successResultArb(dataArb), failureResultArb<T>());

/** 生成任意 JSON 兼容值作为 data 载荷 */
const anyDataArb = (): fc.Arbitrary<unknown> =>
  fc.oneof(
    fc.string(),
    fc.integer(),
    fc.boolean(),
    fc.constant(null),
    fc.array(fc.string(), { maxLength: 5 }),
    fc.dictionary(fc.string({ minLength: 1, maxLength: 5 }), fc.string(), { maxKeys: 5 }),
  );

// ============================================================
// Property 11: IPC 包装函数返回 Result 类型
// Feature: setup-flow-refactor
// ============================================================

describe('Feature: setup-flow-refactor, Property 11: IPC 包装函数返回 Result 类型', () => {
  /**
   * Validates: Requirements 5.5
   *
   * 对于任意 Result<T, E> 值，验证判别联合的结构正确性：
   * success=true 时必有 data，success=false 时必有 error，两种情况互斥。
   */

  test('success=true 的 Result 必有 data 字段', () => {
    fc.assert(
      fc.property(successResultArb(anyDataArb()), (result) => {
        // success 为 true 时，data 字段必须存在
        expect(result.success).toBe(true);
        expect(result).toHaveProperty('data');
        expect('data' in result).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  test('success=false 的 Result 必有 error 字段', () => {
    fc.assert(
      fc.property(failureResultArb<unknown>(), (result) => {
        // success 为 false 时，error 字段必须存在
        expect(result.success).toBe(false);
        expect(result).toHaveProperty('error');
        expect('error' in result).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  test('success=true 的 Result 不含 error 字段', () => {
    fc.assert(
      fc.property(successResultArb(anyDataArb()), (result) => {
        // success 为 true 时，不应存在 error 字段（互斥性）
        expect(result.success).toBe(true);
        expect('error' in result).toBe(false);
      }),
      { numRuns: 200 },
    );
  });

  test('success=false 的 Result 不含 data 字段', () => {
    fc.assert(
      fc.property(failureResultArb<unknown>(), (result) => {
        // success 为 false 时，不应存在 data 字段（互斥性）
        expect(result.success).toBe(false);
        expect('data' in result).toBe(false);
      }),
      { numRuns: 200 },
    );
  });

  test('任意 Result 的 success 字段为布尔值', () => {
    fc.assert(
      fc.property(resultArb(anyDataArb()), (result) => {
        // success 字段必须是布尔类型
        expect(typeof result.success).toBe('boolean');
      }),
      { numRuns: 200 },
    );
  });

  test('失败 Result 的 error 对象包含完整的 SetupError 结构', () => {
    fc.assert(
      fc.property(failureResultArb<unknown>(), (result) => {
        // 失败时 error 必须是完整的 SetupError 结构
        if (!result.success) {
          const error = result.error;
          // 必须包含 code、message、suggestion 三个必填字段
          expect(error).toHaveProperty('code');
          expect(error).toHaveProperty('message');
          expect(error).toHaveProperty('suggestion');
          // code 必须是合法的 SetupErrorCode
          expect(VALID_ERROR_CODES).toContain(error.code);
          // message 和 suggestion 必须是非空字符串
          expect(typeof error.message).toBe('string');
          expect(error.message.length).toBeGreaterThan(0);
          expect(typeof error.suggestion).toBe('string');
          expect(error.suggestion.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 200 },
    );
  });

  test('Result 的 success 字段完全决定其结构形态', () => {
    fc.assert(
      fc.property(resultArb(anyDataArb()), (result) => {
        if (result.success === true) {
          // 成功分支：必有 data，无 error
          expect('data' in result).toBe(true);
          expect('error' in result).toBe(false);
        } else {
          // 失败分支：必有 error，无 data
          expect('error' in result).toBe(true);
          expect('data' in result).toBe(false);
        }
      }),
      { numRuns: 200 },
    );
  });
});
