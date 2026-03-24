/**
 * 属性测试：ClawHub CLI 检测与安装纯逻辑
 * Feature: clawhub-auto-install
 *
 * 使用 fast-check 对 clawhubInstallLogic.ts 中的纯函数进行属性测试，
 * 验证检测结果解析、FixableIssue 生成、安装命令构建、安装验证和错误格式化的正确性。
 */

import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  resolveClawHubStatus,
  buildClawHubFixableIssue,
  buildClawHubInstallCommand,
  validateInstallResult,
  formatClawHubSearchError,
  type CommandResult,
  type ClawHubDetectResult,
} from '../clawhubInstallLogic.js';

// ── 生成器（Arbitraries）──────────────────────────────────────────

/** 生成命令执行结果 */
const commandResultArb = (): fc.Arbitrary<CommandResult> =>
  fc.record({
    success: fc.boolean(),
    output: fc.string(),
  });

/** 生成非空输出的成功命令结果 */
const successCommandResultArb = (): fc.Arbitrary<CommandResult> =>
  fc.record({
    success: fc.constant(true),
    output: fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
  });

/** 生成失败的命令结果 */
const failedCommandResultArb = (): fc.Arbitrary<CommandResult> =>
  fc.record({
    success: fc.constant(false),
    output: fc.string(),
  });

/** 生成 ClawHubDetectResult */
const detectResultArb = (): fc.Arbitrary<ClawHubDetectResult> =>
  fc.oneof(
    fc.record({
      installed: fc.constant(true) as fc.Arbitrary<true>,
      version: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
      source: fc.constantFrom('openclaw' as const, 'standalone' as const),
    }),
    fc.record({
      installed: fc.constant(false) as fc.Arbitrary<false>,
    }),
  );

/** 生成运行时层级字符串 */
const runtimeTierArb = (): fc.Arbitrary<string> =>
  fc.constantFrom('bundled', 'system', 'missing');

/** 生成环境变量对象 */
const processEnvArb = (): fc.Arbitrary<Record<string, string | undefined>> =>
  fc.dictionary(
    fc.string({ minLength: 1, maxLength: 10 }).filter((s) => /^[A-Z_]+$/.test(s)),
    fc.option(fc.string({ maxLength: 50 }), { nil: undefined }),
  );

/** 生成 shell PATH 字符串 */
const shellPathArb = (): fc.Arbitrary<string> =>
  fc.string({ minLength: 1, maxLength: 200 });

// ── 属性测试 ──────────────────────────────────────────────────────

describe('Feature: clawhub-auto-install', () => {
  // ── Property 1: ClawHub 检测结果正确性 ──────────────────────────

  describe('Property 1: ClawHub detection resolution', () => {
    test('任一结果 success 为 true 时，installed 应为 true', () => {
      fc.assert(
        fc.property(
          commandResultArb(),
          commandResultArb(),
          (openclawResult, standaloneResult) => {
            const result = resolveClawHubStatus(openclawResult, standaloneResult);

            if (openclawResult.success || standaloneResult.success) {
              expect(result.installed).toBe(true);
            }
          },
        ),
        { numRuns: 100 },
      );
    });

    test('两者均失败时，installed 应为 false 且 version 为 undefined', () => {
      fc.assert(
        fc.property(
          failedCommandResultArb(),
          failedCommandResultArb(),
          (openclawResult, standaloneResult) => {
            const result = resolveClawHubStatus(openclawResult, standaloneResult);
            expect(result.installed).toBe(false);
            expect(result.version).toBeUndefined();
            expect(result.source).toBeUndefined();
          },
        ),
        { numRuns: 100 },
      );
    });

    test('openclaw 成功时优先取 openclaw 结果，source 为 openclaw', () => {
      fc.assert(
        fc.property(
          successCommandResultArb(),
          commandResultArb(),
          (openclawResult, standaloneResult) => {
            const result = resolveClawHubStatus(openclawResult, standaloneResult);
            expect(result.installed).toBe(true);
            expect(result.source).toBe('openclaw');
            expect(result.version).toBe(openclawResult.output.trim());
          },
        ),
        { numRuns: 100 },
      );
    });

    test('仅 standalone 成功时，source 为 standalone', () => {
      fc.assert(
        fc.property(
          failedCommandResultArb(),
          successCommandResultArb(),
          (openclawResult, standaloneResult) => {
            const result = resolveClawHubStatus(openclawResult, standaloneResult);
            expect(result.installed).toBe(true);
            expect(result.source).toBe('standalone');
            expect(result.version).toBe(standaloneResult.output.trim());
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // ── Property 2: FixableIssue 生成条件 ──────────────────────────

  describe('Property 2: FixableIssue generation', () => {
    test('installed 为 false 且非 bundled 时，应返回 optional 的 install FixableIssue', () => {
      fc.assert(
        fc.property(
          runtimeTierArb().filter((t) => t !== 'bundled'),
          (tier) => {
            const detected: ClawHubDetectResult = { installed: false };
            const issue = buildClawHubFixableIssue(detected, tier);
            expect(issue).not.toBeNull();
            expect(issue!.severity).toBe('optional');
            expect(issue!.action).toBe('install');
            expect(issue!.id).toBe('clawhub-not-installed');
          },
        ),
        { numRuns: 100 },
      );
    });

    test('installed 为 true 时，应返回 null', () => {
      fc.assert(
        fc.property(
          detectResultArb().filter((d) => d.installed),
          runtimeTierArb(),
          (detected, tier) => {
            const issue = buildClawHubFixableIssue(detected, tier);
            expect(issue).toBeNull();
          },
        ),
        { numRuns: 100 },
      );
    });

    test('runtimeTier 为 bundled 时，应返回 null', () => {
      fc.assert(
        fc.property(detectResultArb(), (detected) => {
          const issue = buildClawHubFixableIssue(detected, 'bundled');
          expect(issue).toBeNull();
        }),
        { numRuns: 100 },
      );
    });
  });

  // ── Property 3: 安装命令构建正确性 ─────────────────────────────

  describe('Property 3: Install command construction', () => {
    test('command 为 npm，args 包含 install -g @nicepkg/clawhub，env.PATH 为 shellPath', () => {
      fc.assert(
        fc.property(
          processEnvArb(),
          shellPathArb(),
          (processEnv, shellPath) => {
            const result = buildClawHubInstallCommand(processEnv, shellPath);
            expect(result.command).toBe('npm');
            expect(result.args).toContain('install');
            expect(result.args).toContain('-g');
            expect(result.args).toContain('@nicepkg/clawhub');
            expect(result.env.PATH).toBe(shellPath);
          },
        ),
        { numRuns: 100 },
      );
    });

    test('env.PATH 不等于原始 processEnv.PATH（当两者不同时）', () => {
      fc.assert(
        fc.property(
          processEnvArb(),
          shellPathArb().filter((s) => s.length > 0),
          (processEnv, shellPath) => {
            // 确保 shellPath 与原始 PATH 不同
            const originalPath = processEnv.PATH;
            if (originalPath !== shellPath) {
              const result = buildClawHubInstallCommand(processEnv, shellPath);
              expect(result.env.PATH).toBe(shellPath);
              expect(result.env.PATH).not.toBe(originalPath);
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // ── Property 4: 安装验证结果正确性 ─────────────────────────────

  describe('Property 4: Install result validation', () => {
    test('success 为 true 且 output 非空时，返回 success: true 和 trimmed version', () => {
      fc.assert(
        fc.property(successCommandResultArb(), (cmdResult) => {
          const result = validateInstallResult(cmdResult);
          expect(result.success).toBe(true);
          expect(result.version).toBe(cmdResult.output.trim());
        }),
        { numRuns: 100 },
      );
    });

    test('success 为 false 时，返回 success: false 且 error 非空', () => {
      fc.assert(
        fc.property(failedCommandResultArb(), (cmdResult) => {
          const result = validateInstallResult(cmdResult);
          expect(result.success).toBe(false);
          expect(result.error).toBeDefined();
          expect(result.error!.length).toBeGreaterThan(0);
        }),
        { numRuns: 100 },
      );
    });

    test('success 为 true 但 output 为空/空白时，返回 success: false', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('', ' ', '  ', '\n', '\t'),
          (output) => {
            const result = validateInstallResult({ success: true, output });
            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // ── Property 5: ENOENT 错误信息友好化 ──────────────────────────

  describe('Property 5: ENOENT error message formatting', () => {
    test('包含 ENOENT 的错误信息应返回安装引导，包含 npm install 命令', () => {
      fc.assert(
        fc.property(
          fc.string(),
          fc.string(),
          (prefix, suffix) => {
            const errorMsg = `${prefix}ENOENT${suffix}`;
            const result = formatClawHubSearchError(errorMsg);
            expect(result).not.toBeNull();
            expect(result).toContain('npm install -g @nicepkg/clawhub');
            // 不应包含原始错误堆栈关键字
            expect(result).not.toContain('ENOENT');
          },
        ),
        { numRuns: 100 },
      );
    });

    test('包含 not found（不区分大小写）的错误信息应返回安装引导', () => {
      fc.assert(
        fc.property(
          fc.string(),
          fc.constantFrom('not found', 'Not Found', 'NOT FOUND', 'Not found'),
          fc.string(),
          (prefix, notFound, suffix) => {
            const errorMsg = `${prefix}${notFound}${suffix}`;
            const result = formatClawHubSearchError(errorMsg);
            expect(result).not.toBeNull();
            expect(result).toContain('npm install -g @nicepkg/clawhub');
          },
        ),
        { numRuns: 100 },
      );
    });

    test('不包含 ENOENT 或 not found 的错误信息应返回 null', () => {
      fc.assert(
        fc.property(
          fc.string().filter((s) => {
            const lower = s.toLowerCase();
            return !lower.includes('enoent') && !lower.includes('not found');
          }),
          (errorMsg) => {
            const result = formatClawHubSearchError(errorMsg);
            expect(result).toBeNull();
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
