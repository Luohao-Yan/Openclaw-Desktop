/**
 * 属性测试：错误对象结构完整性
 * Feature: setup-flow-refactor, Property 3: 错误对象结构完整性
 *
 * 验证 createSetupError 和 createIPCUnavailableError 工厂函数生成的错误对象：
 *   - 包含非空的 code（错误代码）、message（用户可读消息）、suggestion（建议操作）字段
 *   - code 为预定义的 SetupErrorCode 枚举值之一
 *
 * **Validates: Requirements 2.1, 2.4**
 */

import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';
import { createSetupError, createIPCUnavailableError } from '../setupReducer';
import type { SetupErrorCode, SetupError } from '../../types/setup';

// ============================================================
// 常量定义
// ============================================================

/**
 * 所有合法的 SetupErrorCode 值
 * 用于验证 code 字段是否为预定义枚举值
 */
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
// 基础生成器（Arbitraries）
// ============================================================

/**
 * 生成随机的 SetupErrorCode
 * 从预定义的错误代码枚举中随机选择
 */
const errorCodeArb = (): fc.Arbitrary<SetupErrorCode> =>
  fc.constantFrom(...VALID_ERROR_CODES);

/**
 * 生成非空字符串
 * 用于 message 和 suggestion 字段，确保至少有一个字符
 */
const nonEmptyStringArb = (): fc.Arbitrary<string> =>
  fc.string({ minLength: 1, maxLength: 200 });

/**
 * 生成可选的 details 字符串
 * details 字段是可选的，可以是 undefined 或非空字符串
 */
const optionalDetailsArb = (): fc.Arbitrary<string | undefined> =>
  fc.option(fc.string({ maxLength: 500 }), { nil: undefined });

/**
 * 生成随机的方法名称
 * 用于测试 createIPCUnavailableError 函数
 */
const methodNameArb = (): fc.Arbitrary<string> =>
  fc.string({ minLength: 1, maxLength: 50 });

// ============================================================
// 辅助验证函数
// ============================================================

/**
 * 验证错误对象是否包含所有必需字段
 * 检查 code、message、suggestion 是否存在且非空
 *
 * @param error - 待验证的错误对象
 * @returns 是否包含所有必需字段
 */
function hasAllRequiredFields(error: SetupError): boolean {
  return (
    typeof error.code === 'string' &&
    error.code.length > 0 &&
    typeof error.message === 'string' &&
    error.message.length > 0 &&
    typeof error.suggestion === 'string' &&
    error.suggestion.length > 0
  );
}

/**
 * 验证错误代码是否为预定义枚举值
 *
 * @param code - 待验证的错误代码
 * @returns 是否为有效的错误代码
 */
function isValidErrorCode(code: string): boolean {
  return VALID_ERROR_CODES.includes(code as SetupErrorCode);
}

/**
 * 验证错误对象结构完整性
 * 综合检查所有必需字段和 code 枚举值
 *
 * @param error - 待验证的错误对象
 * @returns 是否为有效的错误对象
 */
function isValidSetupError(error: SetupError): boolean {
  return hasAllRequiredFields(error) && isValidErrorCode(error.code);
}

// ============================================================
// Property 3: 错误对象结构完整性
// Feature: setup-flow-refactor
// ============================================================

describe('Feature: setup-flow-refactor, Property 3: 错误对象结构完整性', () => {
  /**
   * Validates: Requirements 2.1, 2.4
   *
   * 对于任意由系统创建的 SetupError 对象，都应包含非空的 code（错误代码）、
   * message（用户可读消息）和 suggestion（建议操作）字段。
   * code 应为预定义的 SetupErrorCode 枚举值之一。
   */

  // ============================================================
  // createSetupError 工厂函数测试
  // ============================================================

  describe('createSetupError 工厂函数', () => {
    test('生成的错误对象包含非空的 code 字段', () => {
      fc.assert(
        fc.property(
          errorCodeArb(),
          nonEmptyStringArb(),
          nonEmptyStringArb(),
          optionalDetailsArb(),
          (code, message, suggestion, details) => {
            // 调用工厂函数创建错误对象
            const error = createSetupError(code, message, suggestion, details);

            // 验证 code 字段存在且非空
            expect(typeof error.code).toBe('string');
            expect(error.code.length).toBeGreaterThan(0);
          },
        ),
        { numRuns: 100 },
      );
    });

    test('生成的错误对象包含非空的 message 字段', () => {
      fc.assert(
        fc.property(
          errorCodeArb(),
          nonEmptyStringArb(),
          nonEmptyStringArb(),
          optionalDetailsArb(),
          (code, message, suggestion, details) => {
            // 调用工厂函数创建错误对象
            const error = createSetupError(code, message, suggestion, details);

            // 验证 message 字段存在且非空
            expect(typeof error.message).toBe('string');
            expect(error.message.length).toBeGreaterThan(0);
          },
        ),
        { numRuns: 100 },
      );
    });

    test('生成的错误对象包含非空的 suggestion 字段', () => {
      fc.assert(
        fc.property(
          errorCodeArb(),
          nonEmptyStringArb(),
          nonEmptyStringArb(),
          optionalDetailsArb(),
          (code, message, suggestion, details) => {
            // 调用工厂函数创建错误对象
            const error = createSetupError(code, message, suggestion, details);

            // 验证 suggestion 字段存在且非空
            expect(typeof error.suggestion).toBe('string');
            expect(error.suggestion.length).toBeGreaterThan(0);
          },
        ),
        { numRuns: 100 },
      );
    });

    test('生成的错误对象的 code 为预定义枚举值', () => {
      fc.assert(
        fc.property(
          errorCodeArb(),
          nonEmptyStringArb(),
          nonEmptyStringArb(),
          optionalDetailsArb(),
          (code, message, suggestion, details) => {
            // 调用工厂函数创建错误对象
            const error = createSetupError(code, message, suggestion, details);

            // 验证 code 是预定义的枚举值之一
            expect(isValidErrorCode(error.code)).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });

    test('生成的错误对象保留传入的 message 值', () => {
      fc.assert(
        fc.property(
          errorCodeArb(),
          nonEmptyStringArb(),
          nonEmptyStringArb(),
          optionalDetailsArb(),
          (code, message, suggestion, details) => {
            // 调用工厂函数创建错误对象
            const error = createSetupError(code, message, suggestion, details);

            // 验证 message 字段值与传入值一致
            expect(error.message).toBe(message);
          },
        ),
        { numRuns: 100 },
      );
    });

    test('生成的错误对象保留传入的 suggestion 值', () => {
      fc.assert(
        fc.property(
          errorCodeArb(),
          nonEmptyStringArb(),
          nonEmptyStringArb(),
          optionalDetailsArb(),
          (code, message, suggestion, details) => {
            // 调用工厂函数创建错误对象
            const error = createSetupError(code, message, suggestion, details);

            // 验证 suggestion 字段值与传入值一致
            expect(error.suggestion).toBe(suggestion);
          },
        ),
        { numRuns: 100 },
      );
    });

    test('生成的错误对象保留传入的 details 值（可选字段）', () => {
      fc.assert(
        fc.property(
          errorCodeArb(),
          nonEmptyStringArb(),
          nonEmptyStringArb(),
          optionalDetailsArb(),
          (code, message, suggestion, details) => {
            // 调用工厂函数创建错误对象
            const error = createSetupError(code, message, suggestion, details);

            // 验证 details 字段值与传入值一致（可以是 undefined）
            expect(error.details).toBe(details);
          },
        ),
        { numRuns: 100 },
      );
    });

    test('生成的错误对象结构完整性综合验证', () => {
      fc.assert(
        fc.property(
          errorCodeArb(),
          nonEmptyStringArb(),
          nonEmptyStringArb(),
          optionalDetailsArb(),
          (code, message, suggestion, details) => {
            // 调用工厂函数创建错误对象
            const error = createSetupError(code, message, suggestion, details);

            // 综合验证错误对象结构完整性
            expect(isValidSetupError(error)).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // ============================================================
  // createIPCUnavailableError 工厂函数测试
  // ============================================================

  describe('createIPCUnavailableError 工厂函数', () => {
    test('生成的错误对象包含非空的 code 字段', () => {
      fc.assert(
        fc.property(methodNameArb(), (methodName) => {
          // 调用工厂函数创建 IPC 不可用错误
          const error = createIPCUnavailableError(methodName);

          // 验证 code 字段存在且非空
          expect(typeof error.code).toBe('string');
          expect(error.code.length).toBeGreaterThan(0);
        }),
        { numRuns: 100 },
      );
    });

    test('生成的错误对象包含非空的 message 字段', () => {
      fc.assert(
        fc.property(methodNameArb(), (methodName) => {
          // 调用工厂函数创建 IPC 不可用错误
          const error = createIPCUnavailableError(methodName);

          // 验证 message 字段存在且非空
          expect(typeof error.message).toBe('string');
          expect(error.message.length).toBeGreaterThan(0);
        }),
        { numRuns: 100 },
      );
    });

    test('生成的错误对象包含非空的 suggestion 字段', () => {
      fc.assert(
        fc.property(methodNameArb(), (methodName) => {
          // 调用工厂函数创建 IPC 不可用错误
          const error = createIPCUnavailableError(methodName);

          // 验证 suggestion 字段存在且非空
          expect(typeof error.suggestion).toBe('string');
          expect(error.suggestion.length).toBeGreaterThan(0);
        }),
        { numRuns: 100 },
      );
    });

    test('生成的错误对象的 code 固定为 IPC_UNAVAILABLE', () => {
      fc.assert(
        fc.property(methodNameArb(), (methodName) => {
          // 调用工厂函数创建 IPC 不可用错误
          const error = createIPCUnavailableError(methodName);

          // 验证 code 固定为 IPC_UNAVAILABLE
          expect(error.code).toBe('IPC_UNAVAILABLE');
        }),
        { numRuns: 100 },
      );
    });

    test('生成的错误对象的 code 为预定义枚举值', () => {
      fc.assert(
        fc.property(methodNameArb(), (methodName) => {
          // 调用工厂函数创建 IPC 不可用错误
          const error = createIPCUnavailableError(methodName);

          // 验证 code 是预定义的枚举值之一
          expect(isValidErrorCode(error.code)).toBe(true);
        }),
        { numRuns: 100 },
      );
    });

    test('生成的错误对象的 message 包含方法名称', () => {
      fc.assert(
        fc.property(methodNameArb(), (methodName) => {
          // 调用工厂函数创建 IPC 不可用错误
          const error = createIPCUnavailableError(methodName);

          // 验证 message 包含传入的方法名称
          expect(error.message).toContain(methodName);
        }),
        { numRuns: 100 },
      );
    });

    test('生成的错误对象的 details 包含方法名称', () => {
      fc.assert(
        fc.property(methodNameArb(), (methodName) => {
          // 调用工厂函数创建 IPC 不可用错误
          const error = createIPCUnavailableError(methodName);

          // 验证 details 存在且包含传入的方法名称
          expect(error.details).toBeDefined();
          expect(error.details).toContain(methodName);
        }),
        { numRuns: 100 },
      );
    });

    test('生成的错误对象结构完整性综合验证', () => {
      fc.assert(
        fc.property(methodNameArb(), (methodName) => {
          // 调用工厂函数创建 IPC 不可用错误
          const error = createIPCUnavailableError(methodName);

          // 综合验证错误对象结构完整性
          expect(isValidSetupError(error)).toBe(true);
        }),
        { numRuns: 100 },
      );
    });
  });

  // ============================================================
  // 边界情况测试
  // ============================================================

  describe('边界情况', () => {
    test('所有预定义错误代码都能正确创建错误对象', () => {
      // 遍历所有预定义的错误代码
      for (const code of VALID_ERROR_CODES) {
        const error = createSetupError(
          code,
          '测试消息',
          '测试建议',
          '测试详情',
        );

        // 验证每个错误代码都能创建有效的错误对象
        expect(isValidSetupError(error)).toBe(true);
        expect(error.code).toBe(code);
      }
    });

    test('空方法名称时 createIPCUnavailableError 仍返回有效错误对象', () => {
      // 使用空字符串作为方法名称（边界情况）
      const error = createIPCUnavailableError('');

      // 验证仍然返回有效的错误对象
      expect(error.code).toBe('IPC_UNAVAILABLE');
      expect(typeof error.message).toBe('string');
      expect(typeof error.suggestion).toBe('string');
      // 注意：空方法名时 message 和 details 仍然非空（包含固定文本）
      expect(error.message.length).toBeGreaterThan(0);
      expect(error.suggestion.length).toBeGreaterThan(0);
    });

    test('特殊字符方法名称时 createIPCUnavailableError 正确处理', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter((s) =>
            // 包含特殊字符的字符串
            /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(s),
          ),
          (methodName) => {
            // 调用工厂函数创建 IPC 不可用错误
            const error = createIPCUnavailableError(methodName);

            // 验证特殊字符不影响错误对象的有效性
            expect(isValidSetupError(error)).toBe(true);
            expect(error.message).toContain(methodName);
          },
        ),
        { numRuns: 50 },
      );
    });

    test('Unicode 字符方法名称时 createIPCUnavailableError 正确处理', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1, maxLength: 30, unit: 'grapheme' }), (methodName) => {
          // 调用工厂函数创建 IPC 不可用错误
          const error = createIPCUnavailableError(methodName);

          // 验证 Unicode 字符不影响错误对象的有效性
          expect(isValidSetupError(error)).toBe(true);
          expect(error.message).toContain(methodName);
        }),
        { numRuns: 50 },
      );
    });
  });
});
