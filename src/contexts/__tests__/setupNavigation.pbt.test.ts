/**
 * 属性测试：导航图属性
 * Feature: setup-flow-refactor, Property 6/7/8/9
 *
 * 验证声明式导航图的正确性：
 *   - Property 6: 导航图可达性 — 所有节点从 /setup/welcome 可达
 *   - Property 7: 条件导航正确性 — getPreviousStep 根据状态返回正确路径
 *   - Property 8: 步骤跳过逻辑 — bundled 运行时跳过环境检测
 *   - Property 9: 步骤恢复有效性 — restoreStep 对有效路径保持不变，无效路径回退
 */

import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  NAVIGATION_GRAPH,
  validateStepReachability,
  getPreviousStep,
  shouldSkipStep,
  restoreStep,
} from '../setupNavigationGraph';
import { initialSetupState } from '../setupReducer';
import type { SetupState } from '../setupReducer';
import type {
  EnvironmentCheckResult,
  SetupEnvironmentCheckData,
  RuntimeTier,
  SetupMode,
} from '../../types/setup';

// ============================================================
// 常量定义
// ============================================================

/** 导航图中所有有效路径 */
const ALL_VALID_PATHS = NAVIGATION_GRAPH.map((node) => node.path);

/** 所有合法的 RuntimeTier 值 */
const VALID_RUNTIME_TIERS: RuntimeTier[] = ['bundled', 'system', 'online', 'missing'];

// ============================================================
// 辅助生成器
// ============================================================

/** 生成随机的 RuntimeTier */
const runtimeTierArb = (): fc.Arbitrary<RuntimeTier> =>
  fc.constantFrom(...VALID_RUNTIME_TIERS);

/** 生成随机的 SetupEnvironmentCheckData */
const envCheckDataArb = (): fc.Arbitrary<SetupEnvironmentCheckData> =>
  fc.record({
    platform: fc.string({ minLength: 1, maxLength: 20 }),
    platformLabel: fc.string({ minLength: 1, maxLength: 20 }),
    runtimeTier: runtimeTierArb(),
    bundledNodeAvailable: fc.boolean(),
    bundledOpenClawAvailable: fc.boolean(),
    nodeInstalled: fc.boolean(),
    nodeVersion: fc.option(fc.string({ maxLength: 20 }), { nil: undefined }),
    nodeVersionSatisfies: fc.boolean(),
    npmInstalled: fc.boolean(),
    npmVersion: fc.option(fc.string({ maxLength: 20 }), { nil: undefined }),
    openclawInstalled: fc.boolean(),
    openclawVersion: fc.option(fc.string({ maxLength: 20 }), { nil: undefined }),
    openclawConfigExists: fc.boolean(),
    openclawRootDir: fc.string({ maxLength: 50 }),
    recommendedInstallCommand: fc.string({ maxLength: 100 }),
    recommendedInstallLabel: fc.string({ maxLength: 50 }),
    notes: fc.array(fc.string({ maxLength: 50 }), { maxLength: 3 }),
    fixableIssues: fc.array(
      fc.record({
        id: fc.string({ minLength: 1, maxLength: 20 }),
        label: fc.string({ minLength: 1, maxLength: 50 }),
        action: fc.constantFrom('install', 'upgrade', 'fixPath'),
        severity: fc.constantFrom('required', 'optional'),
      }),
      { maxLength: 2 },
    ),
  });

/**
 * 生成随机的 EnvironmentCheckResult（仅 success 或 fallback 状态，包含 data）
 * 用于需要访问 data.runtimeTier 等字段的测试
 */
const envCheckWithDataArb = (): fc.Arbitrary<EnvironmentCheckResult> =>
  fc.oneof(
    envCheckDataArb().map((data) => ({
      status: 'success' as const,
      data,
    })),
    fc.record({
      status: fc.constant('fallback' as const),
      data: envCheckDataArb(),
      reason: fc.string({ minLength: 1, maxLength: 50 }),
    }),
  );

/**
 * 基于 initialSetupState 构建任意 SetupState
 * 仅覆盖测试所需的关键字段，保持其余字段为默认值
 */
const setupStateArb = (): fc.Arbitrary<SetupState> =>
  fc.record({
    mode: fc.oneof(
      fc.constant(null),
      fc.constant('local' as SetupMode),
      fc.constant('remote' as SetupMode),
    ),
    localInstallValidated: fc.oneof(
      fc.constant(undefined as boolean | undefined),
      fc.boolean(),
    ),
    envCheck: envCheckWithDataArb(),
  }).map(({ mode, localInstallValidated, envCheck }) => ({
    ...initialSetupState,
    mode,
    environment: {
      ...initialSetupState.environment,
      check: envCheck,
    },
    settings: {
      ...initialSetupState.settings,
      localInstallValidated,
    },
  }));

// ============================================================
// Property 6: 导航图可达性
// Feature: setup-flow-refactor
// ============================================================

describe('Feature: setup-flow-refactor, Property 6: 导航图可达性', () => {
  /**
   * **Validates: Requirements 4.2**
   *
   * 对于导航图中的每个节点，从 /setup/welcome 出发，
   * 通过 next 链接应能到达该节点（即不存在孤立节点）。
   */

  test('导航图中每个节点从 /setup/welcome 出发通过 next 链接可达', () => {
    fc.assert(
      fc.property(
        // 从导航图中随机选取一个路径
        fc.constantFrom(...ALL_VALID_PATHS),
        (path) => {
          // 验证该路径从 welcome 可达
          const reachable = validateStepReachability(path);
          expect(reachable).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  test('不在导航图中的路径不可达', () => {
    fc.assert(
      fc.property(
        // 生成随机字符串作为无效路径（排除有效路径）
        fc.string({ minLength: 1, maxLength: 50 }).filter(
          (s) => !ALL_VALID_PATHS.includes(s),
        ),
        (invalidPath) => {
          const reachable = validateStepReachability(invalidPath);
          expect(reachable).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ============================================================
// Property 7: 条件导航正确性
// Feature: setup-flow-refactor
// ============================================================

describe('Feature: setup-flow-refactor, Property 7: 条件导航正确性', () => {
  /**
   * **Validates: Requirements 4.3**
   *
   * 对于任意 SetupState，getPreviousStep('/setup/local/configure', state) 的返回值应当：
   * - 当 state.settings.localInstallValidated 为 true 时返回 '/setup/local/confirm-existing'
   * - 否则返回 '/setup/local/install-guide'
   */

  test('localInstallValidated 为 true 时，回退到 confirm-existing', () => {
    fc.assert(
      fc.property(
        setupStateArb(),
        (baseState) => {
          // 强制 localInstallValidated 为 true
          const state: SetupState = {
            ...baseState,
            settings: {
              ...baseState.settings,
              localInstallValidated: true,
            },
          };

          const prev = getPreviousStep('/setup/local/configure', state);
          expect(prev).toBe('/setup/local/confirm-existing');
        },
      ),
      { numRuns: 100 },
    );
  });

  test('localInstallValidated 为 false 时，回退到 install-guide', () => {
    fc.assert(
      fc.property(
        setupStateArb(),
        (baseState) => {
          // 强制 localInstallValidated 为 false
          const state: SetupState = {
            ...baseState,
            settings: {
              ...baseState.settings,
              localInstallValidated: false,
            },
          };

          const prev = getPreviousStep('/setup/local/configure', state);
          expect(prev).toBe('/setup/local/install-guide');
        },
      ),
      { numRuns: 100 },
    );
  });

  test('localInstallValidated 为 undefined 时，回退到 install-guide', () => {
    fc.assert(
      fc.property(
        setupStateArb(),
        (baseState) => {
          // 强制 localInstallValidated 为 undefined
          const state: SetupState = {
            ...baseState,
            settings: {
              ...baseState.settings,
              localInstallValidated: undefined,
            },
          };

          const prev = getPreviousStep('/setup/local/configure', state);
          expect(prev).toBe('/setup/local/install-guide');
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ============================================================
// Property 8: 步骤跳过逻辑
// Feature: setup-flow-refactor
// ============================================================

describe('Feature: setup-flow-refactor, Property 8: 步骤跳过逻辑', () => {
  /**
   * **Validates: Requirements 4.5**
   *
   * 当 runtimeTier 为 'bundled' 且 bundledNodeAvailable 和 bundledOpenClawAvailable 都为 true 时，
   * 环境检测步骤（/setup/local/environment）的 skip 函数应返回 true。
   * 当 runtimeTier 不为 'bundled' 时，skip 应返回 false。
   */

  test('bundled 运行时且内置组件都可用时，跳过环境检测步骤', () => {
    fc.assert(
      fc.property(
        setupStateArb(),
        (baseState) => {
          // 构造 bundled 运行时状态：runtimeTier='bundled'，两个内置组件都可用
          const bundledData: SetupEnvironmentCheckData = {
            ...(baseState.environment.check.status !== 'failed'
              ? baseState.environment.check.data
              : envCheckDataDefaults()),
            runtimeTier: 'bundled',
            bundledNodeAvailable: true,
            bundledOpenClawAvailable: true,
          };

          const state: SetupState = {
            ...baseState,
            environment: {
              ...baseState.environment,
              check: { status: 'success', data: bundledData },
            },
          };

          // 环境检测步骤应被跳过
          const skipped = shouldSkipStep('/setup/local/environment', state);
          expect(skipped).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  test('runtimeTier 不为 bundled 时，不跳过环境检测步骤', () => {
    fc.assert(
      fc.property(
        setupStateArb(),
        // 排除 'bundled'，仅使用其他运行时层级
        fc.constantFrom<RuntimeTier>('system', 'online', 'missing'),
        (baseState, tier) => {
          const nonBundledData: SetupEnvironmentCheckData = {
            ...(baseState.environment.check.status !== 'failed'
              ? baseState.environment.check.data
              : envCheckDataDefaults()),
            runtimeTier: tier,
          };

          const state: SetupState = {
            ...baseState,
            environment: {
              ...baseState.environment,
              check: { status: 'success', data: nonBundledData },
            },
          };

          // 环境检测步骤不应被跳过
          const skipped = shouldSkipStep('/setup/local/environment', state);
          expect(skipped).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  test('bundled 运行时但内置组件不全可用时，不跳过环境检测步骤', () => {
    fc.assert(
      fc.property(
        setupStateArb(),
        // 至少一个内置组件不可用
        fc.record({
          bundledNodeAvailable: fc.boolean(),
          bundledOpenClawAvailable: fc.boolean(),
        }).filter((r) => !(r.bundledNodeAvailable && r.bundledOpenClawAvailable)),
        (baseState, { bundledNodeAvailable, bundledOpenClawAvailable }) => {
          const partialBundledData: SetupEnvironmentCheckData = {
            ...(baseState.environment.check.status !== 'failed'
              ? baseState.environment.check.data
              : envCheckDataDefaults()),
            runtimeTier: 'bundled',
            bundledNodeAvailable,
            bundledOpenClawAvailable,
          };

          const state: SetupState = {
            ...baseState,
            environment: {
              ...baseState.environment,
              check: { status: 'success', data: partialBundledData },
            },
          };

          // 内置组件不全可用时不应跳过
          const skipped = shouldSkipStep('/setup/local/environment', state);
          expect(skipped).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ============================================================
// Property 9: 步骤恢复有效性
// Feature: setup-flow-refactor
// ============================================================

describe('Feature: setup-flow-refactor, Property 9: 步骤恢复有效性', () => {
  /**
   * **Validates: Requirements 4.6**
   *
   * 对于任意持久化的步骤路径字符串：
   * - 如果该路径存在于导航图中，restoreStep 应保持不变
   * - 如果不存在，restoreStep 应回退到 '/setup/welcome'
   * - 对于 null/undefined，restoreStep 应回退到 '/setup/welcome'
   */

  test('有效路径经 restoreStep 后保持不变', () => {
    fc.assert(
      fc.property(
        // 从导航图中随机选取一个有效路径
        fc.constantFrom(...ALL_VALID_PATHS),
        (validPath) => {
          const restored = restoreStep(validPath);
          expect(restored).toBe(validPath);
        },
      ),
      { numRuns: 100 },
    );
  });

  test('无效路径经 restoreStep 后回退到 /setup/welcome', () => {
    fc.assert(
      fc.property(
        // 生成随机字符串作为无效路径（排除有效路径）
        fc.string({ minLength: 1, maxLength: 80 }).filter(
          (s) => !ALL_VALID_PATHS.includes(s),
        ),
        (invalidPath) => {
          const restored = restoreStep(invalidPath);
          expect(restored).toBe('/setup/welcome');
        },
      ),
      { numRuns: 100 },
    );
  });

  test('null 或 undefined 经 restoreStep 后回退到 /setup/welcome', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(null, undefined),
        (nilValue) => {
          const restored = restoreStep(nilValue);
          expect(restored).toBe('/setup/welcome');
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ============================================================
// 辅助函数
// ============================================================

/**
 * 返回 SetupEnvironmentCheckData 的默认值
 * 用于 failed 状态的 EnvironmentCheckResult 无 data 字段时的回退
 */
function envCheckDataDefaults(): SetupEnvironmentCheckData {
  return {
    platform: 'unknown',
    platformLabel: '未知系统',
    runtimeTier: 'missing',
    bundledNodeAvailable: false,
    bundledOpenClawAvailable: false,
    nodeInstalled: false,
    nodeVersionSatisfies: false,
    npmInstalled: false,
    openclawInstalled: false,
    openclawConfigExists: false,
    openclawRootDir: '',
    recommendedInstallCommand: '',
    recommendedInstallLabel: '',
    notes: [],
    fixableIssues: [],
  };
}
