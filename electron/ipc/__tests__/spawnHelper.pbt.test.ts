/**
 * 属性测试：spawnHelper 纯逻辑模块
 * Feature: setup-flow-hardening
 *
 * 本文件包含 spawnHelperLogic.ts 的属性测试。
 * 后续任务（1.3, 1.4, 1.5）会在此文件中追加 P2, P3, P5 属性测试。
 */

import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';
import { buildSpawnEnv, buildEnoentError, buildTimeoutError, buildSpawnResult, classifySpawnError } from '../spawnHelperLogic';
import type { SpawnErrorCode } from '../spawnHelperLogic';

// ── 生成器（Arbitraries）──────────────────────────────────────────────────

/**
 * 生成合法的 Shell PATH 字符串
 * 模拟真实 PATH 格式：多个路径段以冒号分隔
 */
const shellPathArb = (): fc.Arbitrary<string> =>
  fc.array(
    fc.stringMatching(/^\/[a-zA-Z0-9._/-]{1,40}$/),
    { minLength: 1, maxLength: 8 },
  ).map((segments) => segments.join(':'));

/**
 * 生成额外环境变量（不含 PATH 键）
 * 键名为大写字母+下划线，值为可打印字符串
 */
const extraEnvWithoutPathArb = (): fc.Arbitrary<Record<string, string>> =>
  fc.dictionary(
    fc.stringMatching(/^[A-Z][A-Z0-9_]{0,15}$/).filter((k) => k !== 'PATH'),
    fc.string({ minLength: 0, maxLength: 50 }),
    { minKeys: 0, maxKeys: 5 },
  );

/**
 * 生成额外环境变量（可能包含 PATH 键）
 * 用于验证 shellPath 始终覆盖 extraEnv 中的 PATH
 */
const extraEnvWithPathArb = (): fc.Arbitrary<Record<string, string>> =>
  fc.tuple(
    extraEnvWithoutPathArb(),
    fc.string({ minLength: 1, maxLength: 50 }), // 伪造的 PATH 值
  ).map(([env, fakePath]) => ({ ...env, PATH: fakePath }));

// ============================================================
// Property 1: Shell PATH 注入一致性
// Feature: setup-flow-hardening
// ============================================================

describe('Feature: setup-flow-hardening, Property 1: Shell PATH 注入一致性', () => {
  /**
   * Validates: Requirements 1.1
   *
   * 对于任意 shellPath，buildSpawnEnv 返回的 PATH 字段
   * 应始终等于传入的 shellPath 完整内容。
   */
  test('PATH 字段应始终等于传入的 shellPath', () => {
    fc.assert(
      fc.property(shellPathArb(), (shellPath) => {
        const env = buildSpawnEnv(shellPath);
        expect(env.PATH).toBe(shellPath);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 1.1
   *
   * 当提供不含 PATH 的额外环境变量时，
   * 返回的环境变量应包含所有额外变量且 PATH 等于 shellPath。
   */
  test('额外环境变量（不含 PATH）应正确合并，PATH 保持为 shellPath', () => {
    fc.assert(
      fc.property(
        shellPathArb(),
        extraEnvWithoutPathArb(),
        (shellPath, extraEnv) => {
          const env = buildSpawnEnv(shellPath, extraEnv);

          // PATH 始终等于 shellPath
          expect(env.PATH).toBe(shellPath);

          // 所有额外环境变量都应存在于结果中
          for (const [key, value] of Object.entries(extraEnv)) {
            expect(env[key]).toBe(value);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 1.1
   *
   * 当额外环境变量中包含 PATH 键时，
   * shellPath 应始终覆盖 extraEnv 中的 PATH 值。
   */
  test('shellPath 应始终覆盖 extraEnv 中的 PATH', () => {
    fc.assert(
      fc.property(
        shellPathArb(),
        extraEnvWithPathArb(),
        (shellPath, extraEnv) => {
          const env = buildSpawnEnv(shellPath, extraEnv);

          // shellPath 优先，覆盖 extraEnv 中的 PATH
          expect(env.PATH).toBe(shellPath);

          // 其他非 PATH 键仍应正确合并
          for (const [key, value] of Object.entries(extraEnv)) {
            if (key !== 'PATH') {
              expect(env[key]).toBe(value);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 1.1
   *
   * 不传 extraEnv 时，返回的环境变量应仅包含 PATH 字段。
   */
  test('无 extraEnv 时返回的环境变量应仅包含 PATH', () => {
    fc.assert(
      fc.property(shellPathArb(), (shellPath) => {
        const env = buildSpawnEnv(shellPath);

        expect(Object.keys(env)).toEqual(['PATH']);
        expect(env.PATH).toBe(shellPath);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 1.1
   *
   * 传入空对象 extraEnv 时，返回的环境变量应仅包含 PATH 字段。
   */
  test('extraEnv 为空对象时返回的环境变量应仅包含 PATH', () => {
    fc.assert(
      fc.property(shellPathArb(), (shellPath) => {
        const env = buildSpawnEnv(shellPath, {});

        expect(Object.keys(env)).toEqual(['PATH']);
        expect(env.PATH).toBe(shellPath);
      }),
      { numRuns: 100 },
    );
  });
});

// ============================================================
// Property 2: 错误信息包含上下文
// Feature: setup-flow-hardening
// ============================================================

/**
 * 生成合法的命令名称
 * 模拟真实命令名：字母开头，可包含字母、数字、连字符
 */
const commandNameArb = (): fc.Arbitrary<string> =>
  fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_-]{0,30}$/);

/**
 * 生成合法的搜索路径字符串
 * 模拟 PATH 环境变量格式
 */
const searchPathArb = (): fc.Arbitrary<string> =>
  fc.array(
    fc.stringMatching(/^\/[a-zA-Z0-9._/-]{1,40}$/),
    { minLength: 1, maxLength: 6 },
  ).map((segments) => segments.join(':'));

/**
 * 生成正整数超时时长（毫秒）
 * 范围：1ms ~ 300000ms（5 分钟）
 */
const timeoutMsArb = (): fc.Arbitrary<number> =>
  fc.integer({ min: 1, max: 300_000 });

describe('Feature: setup-flow-hardening, Property 2: 错误信息包含上下文', () => {
  /**
   * Validates: Requirements 1.3, 5.2
   *
   * 对于任意命令名称和搜索路径，
   * buildEnoentError 的输出应包含命令名称和搜索路径。
   */
  test('ENOENT 错误信息应包含命令名称和搜索路径', () => {
    fc.assert(
      fc.property(
        commandNameArb(),
        searchPathArb(),
        (command, searchPath) => {
          const message = buildEnoentError(command, searchPath);

          // 错误信息应包含命令名称
          expect(message).toContain(command);
          // 错误信息应包含搜索路径
          expect(message).toContain(searchPath);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 1.4, 5.2
   *
   * 对于任意命令名称和超时时长，
   * buildTimeoutError 的输出应包含命令名称和超时时长。
   */
  test('TIMEOUT 错误信息应包含命令名称和超时时长', () => {
    fc.assert(
      fc.property(
        commandNameArb(),
        timeoutMsArb(),
        (command, timeoutMs) => {
          const message = buildTimeoutError(command, timeoutMs);

          // 错误信息应包含命令名称
          expect(message).toContain(command);
          // 错误信息应包含超时时长（毫秒数字符串）
          expect(message).toContain(String(timeoutMs));
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 1.3
   *
   * ENOENT 错误信息应为非空字符串，且长度大于命令名称和搜索路径的简单拼接。
   * 确保错误信息包含额外的上下文描述，而非仅仅是参数拼接。
   */
  test('ENOENT 错误信息应包含额外的上下文描述', () => {
    fc.assert(
      fc.property(
        commandNameArb(),
        searchPathArb(),
        (command, searchPath) => {
          const message = buildEnoentError(command, searchPath);

          // 错误信息应为非空字符串
          expect(message.length).toBeGreaterThan(0);
          // 错误信息长度应大于参数简单拼接（说明包含额外描述文字）
          expect(message.length).toBeGreaterThan(command.length + searchPath.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 1.4
   *
   * TIMEOUT 错误信息应为非空字符串，且长度大于命令名称和超时数字的简单拼接。
   * 确保错误信息包含额外的上下文描述。
   */
  test('TIMEOUT 错误信息应包含额外的上下文描述', () => {
    fc.assert(
      fc.property(
        commandNameArb(),
        timeoutMsArb(),
        (command, timeoutMs) => {
          const message = buildTimeoutError(command, timeoutMs);

          // 错误信息应为非空字符串
          expect(message.length).toBeGreaterThan(0);
          // 错误信息长度应大于参数简单拼接
          expect(message.length).toBeGreaterThan(command.length + String(timeoutMs).length);
        },
      ),
      { numRuns: 100 },
    );
  });
});


// ============================================================
// Property 3: SpawnResult 结构完整性
// Feature: setup-flow-hardening
// ============================================================

/**
 * 生成退出码（number | null）
 * 包含 0（成功）、正整数（失败）、负数、null（进程未正常退出）
 */
const exitCodeArb = (): fc.Arbitrary<number | null> =>
  fc.oneof(
    fc.constant(0),
    fc.constant(null),
    fc.integer({ min: 1, max: 255 }),
    fc.integer({ min: -128, max: -1 }),
  );

/**
 * 生成标准输出/标准错误字符串
 * 模拟真实命令输出：可打印 ASCII 字符串
 */
const outputArb = (): fc.Arbitrary<string> =>
  fc.string({ minLength: 0, maxLength: 200 });

describe('Feature: setup-flow-hardening, Property 3: SpawnResult 结构完整性', () => {
  /**
   * Validates: Requirements 1.5
   *
   * 对于任意 exitCode、stdout、stderr 组合，
   * buildSpawnResult 返回的对象应始终包含 success（boolean）和 output（string）字段。
   */
  test('返回对象应始终包含 success 和 output 字段', () => {
    fc.assert(
      fc.property(
        exitCodeArb(),
        outputArb(),
        outputArb(),
        (exitCode, stdout, stderr) => {
          const result = buildSpawnResult({ exitCode, stdout, stderr });

          // success 字段应为 boolean 类型
          expect(typeof result.success).toBe('boolean');
          // output 字段应为 string 类型
          expect(typeof result.output).toBe('string');
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 1.5
   *
   * success 为 true 当且仅当 exitCode === 0（双向蕴含）。
   * 即：exitCode === 0 → success === true，且 success === true → exitCode === 0。
   */
  test('success=true 当且仅当 exitCode===0', () => {
    fc.assert(
      fc.property(
        exitCodeArb(),
        outputArb(),
        outputArb(),
        (exitCode, stdout, stderr) => {
          const result = buildSpawnResult({ exitCode, stdout, stderr });

          if (exitCode === 0) {
            // exitCode === 0 → success 必须为 true
            expect(result.success).toBe(true);
          } else {
            // exitCode !== 0（包括 null、正数、负数）→ success 必须为 false
            expect(result.success).toBe(false);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 1.5
   *
   * output 字段应始终等于传入的 stdout 参数，
   * 确保标准输出内容被完整保留在结果中。
   */
  test('output 字段应等于传入的 stdout', () => {
    fc.assert(
      fc.property(
        exitCodeArb(),
        outputArb(),
        outputArb(),
        (exitCode, stdout, stderr) => {
          const result = buildSpawnResult({ exitCode, stdout, stderr });

          // output 应始终等于 stdout
          expect(result.output).toBe(stdout);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 1.5
   *
   * 当 exitCode !== 0 且无 error 对象时，
   * 返回的 errorCode 应为 'NON_ZERO_EXIT'。
   */
  test('非零退出码（无 error 对象）时 errorCode 应为 NON_ZERO_EXIT', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 255 }),
        outputArb(),
        outputArb(),
        (exitCode, stdout, stderr) => {
          const result = buildSpawnResult({ exitCode, stdout, stderr });

          expect(result.success).toBe(false);
          expect(result.errorCode).toBe('NON_ZERO_EXIT');
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 1.5
   *
   * 当 exitCode === 0 时，返回的结果不应包含 errorCode 字段，
   * 确保成功结果的结构干净。
   */
  test('exitCode===0 时不应包含 errorCode', () => {
    fc.assert(
      fc.property(
        outputArb(),
        outputArb(),
        (stdout, stderr) => {
          const result = buildSpawnResult({ exitCode: 0, stdout, stderr });

          expect(result.success).toBe(true);
          expect(result.errorCode).toBeUndefined();
        },
      ),
      { numRuns: 100 },
    );
  });
});


// ============================================================
// Property 5: 错误码分类完备性
// Feature: setup-flow-hardening
// ============================================================

/** 所有合法的 SpawnErrorCode 枚举值 */
const VALID_SPAWN_ERROR_CODES: SpawnErrorCode[] = [
  'ENOENT',
  'TIMEOUT',
  'SPAWN_FAILED',
  'NON_ZERO_EXIT',
  'UNKNOWN',
];

/**
 * 生成任意错误对象
 * 包含 code、message、killed 字段的任意组合，
 * 模拟真实场景中可能出现的各种错误形态。
 */
const arbitraryErrorObject = (): fc.Arbitrary<{
  code?: string;
  message?: string;
  killed?: boolean;
}> =>
  fc.record(
    {
      code: fc.option(fc.string({ minLength: 0, maxLength: 30 }), { nil: undefined }),
      message: fc.option(fc.string({ minLength: 0, maxLength: 100 }), { nil: undefined }),
      killed: fc.option(fc.boolean(), { nil: undefined }),
    },
    { requiredKeys: [] },
  );

/**
 * 生成包含已知错误码的错误对象
 * 确保覆盖 classifySpawnError 的各个分支路径
 */
const knownCodeErrorObject = (): fc.Arbitrary<{
  code?: string;
  message?: string;
  killed?: boolean;
}> =>
  fc.oneof(
    // ENOENT 分支
    fc.record({
      code: fc.constant('ENOENT'),
      message: fc.option(fc.string({ maxLength: 50 }), { nil: undefined }),
      killed: fc.option(fc.boolean(), { nil: undefined }),
    }),
    // ETIMEDOUT 分支
    fc.record({
      code: fc.constant('ETIMEDOUT'),
      message: fc.option(fc.string({ maxLength: 50 }), { nil: undefined }),
      killed: fc.option(fc.boolean(), { nil: undefined }),
    }),
    // killed=true 分支
    fc.record({
      code: fc.option(fc.string({ maxLength: 20 }), { nil: undefined }),
      message: fc.option(fc.string({ maxLength: 50 }), { nil: undefined }),
      killed: fc.constant(true),
    }),
    // EPERM / EACCES / SPAWN_FAILED 分支
    fc.record({
      code: fc.oneof(fc.constant('EPERM'), fc.constant('EACCES'), fc.constant('SPAWN_FAILED')),
      message: fc.option(fc.string({ maxLength: 50 }), { nil: undefined }),
      killed: fc.option(fc.boolean(), { nil: undefined }),
    }),
    // message 包含 'spawn' 的分支
    fc.record({
      code: fc.option(fc.string({ maxLength: 20 }), { nil: undefined }),
      message: fc.stringMatching(/^[a-z ]{0,20}spawn[a-z ]{0,20}$/),
      killed: fc.option(fc.boolean(), { nil: undefined }),
    }),
  );

describe('Feature: setup-flow-hardening, Property 5: 错误码分类完备性', () => {
  /**
   * Validates: Requirements 5.1
   *
   * 对于任意错误对象（code、message、killed 字段的任意组合），
   * classifySpawnError 应始终返回有效的 SpawnErrorCode 枚举值之一。
   */
  test('任意错误对象应始终返回有效的 SpawnErrorCode 枚举值', () => {
    fc.assert(
      fc.property(arbitraryErrorObject(), (err) => {
        const result = classifySpawnError(err);

        // 返回值必须是合法的 SpawnErrorCode 枚举值之一
        expect(VALID_SPAWN_ERROR_CODES).toContain(result);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 5.1
   *
   * 对于包含已知错误码的错误对象，
   * classifySpawnError 应始终返回有效的 SpawnErrorCode 枚举值，
   * 确保各分支路径均返回合法值。
   */
  test('已知错误码的错误对象应始终返回有效的 SpawnErrorCode 枚举值', () => {
    fc.assert(
      fc.property(knownCodeErrorObject(), (err) => {
        const result = classifySpawnError(err);

        // 返回值必须是合法的 SpawnErrorCode 枚举值之一
        expect(VALID_SPAWN_ERROR_CODES).toContain(result);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 5.1
   *
   * 空错误对象（所有字段均为 undefined）应返回 UNKNOWN 兜底值，
   * 确保函数不会因缺少字段而抛出异常。
   */
  test('空错误对象应返回 UNKNOWN 兜底值', () => {
    fc.assert(
      fc.property(fc.constant({}), (err) => {
        const result = classifySpawnError(err);

        expect(result).toBe('UNKNOWN');
        expect(VALID_SPAWN_ERROR_CODES).toContain(result);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 5.1
   *
   * 返回值的类型应始终为 string，
   * 确保函数不会返回 undefined、null 或其他非字符串类型。
   */
  test('返回值类型应始终为 string', () => {
    fc.assert(
      fc.property(arbitraryErrorObject(), (err) => {
        const result = classifySpawnError(err);

        expect(typeof result).toBe('string');
        // 返回值不应为空字符串
        expect(result.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });
});
