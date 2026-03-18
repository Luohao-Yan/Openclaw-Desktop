/**
 * 属性测试：状态转换校验模块
 * 测试文件覆盖 Property 10, 11, 12
 *
 * - P10: 状态转换合法性校验 (isValidTransition)
 * - P11: 持久化状态完整性检测 (validatePersistedState)
 * - P12: 步骤重置完整性 (getResetFieldsForStep)
 *
 * **Validates: Requirements 7.1, 7.2, 7.3, 7.5**
 */

import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  isValidTransition,
  validatePersistedState,
  getResetFieldsForStep,
  TRANSITION_RULES,
} from '../stateTransitionLogic';
import { initialSetupState } from '../setupReducer';
import type { SetupState } from '../setupReducer';
import type { SetupAction, FixProgressState } from '../setupActions';
import type {
  SetupMode,
  RuntimeTier,
  SetupErrorCode,
  SetupError,
  EnvironmentCheckResult,
  SetupEnvironmentCheckData,
  RuntimeResolution,
  SetupLocalCheckResult,
  SetupInstallResult,
  SetupRemoteDraft,
  SetupRemoteVerificationResult,
  ChannelConfig,
  ChannelAddResult,
  SetupSettings,
} from '../../types/setup';

// ============================================================
// 常量定义
// ============================================================

/** 所有合法的 SetupMode 值 */
const VALID_SETUP_MODES: SetupMode[] = ['local', 'remote'];

/** 所有合法的 RuntimeTier 值 */
const VALID_RUNTIME_TIERS: RuntimeTier[] = ['bundled', 'system', 'online', 'missing'];

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

/** 需要 mode !== null 前置条件的 action 类型 */
const MODE_REQUIRED_ACTIONS: SetupAction['type'][] = [
  'SET_LOCAL_CHECK',
  'SET_INSTALL_RESULT',
  'SET_REMOTE_VERIFICATION',
  'SET_CREATED_AGENT',
];

/** 需要环境检测非 fallback 的 action 类型 */
const ENV_REQUIRED_ACTIONS: SetupAction['type'][] = [
  'SET_CHANNEL_CONFIGS',
];

/** 无前置条件的 action 类型（始终合法） */
const ALWAYS_VALID_ACTIONS: SetupAction['type'][] = [
  'SET_MODE',
  'SET_BUSY',
  'SET_BOOTSTRAPPING',
  'SET_ERROR',
  'SET_ENVIRONMENT_CHECK',
  'SET_REMOTE_DRAFT',
  'SET_SETTINGS',
  'MERGE_SETTINGS',
  'SET_RUNTIME_RESOLUTION',
  'SET_FIX_PROGRESS',
  'UPDATE_CHANNEL',
  'SET_CHANNEL_ADD_RESULTS',
];

/** 已知的引导步骤标识列表 */
const KNOWN_STEPS = [
  'environment',
  'local_check',
  'install',
  'remote_verify',
  'channels',
  'agent',
];

// ============================================================
// 基础生成器（Arbitraries）
// ============================================================

/** 生成随机的 SetupMode（包含 null） */
const setupModeArb = (): fc.Arbitrary<SetupMode | null> =>
  fc.oneof(fc.constant(null), fc.constantFrom(...VALID_SETUP_MODES));

/** 生成随机的 RuntimeTier */
const runtimeTierArb = (): fc.Arbitrary<RuntimeTier> =>
  fc.constantFrom(...VALID_RUNTIME_TIERS);

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

/** 生成随机的 FixProgressState */
const fixProgressArb = (): fc.Arbitrary<FixProgressState> =>
  fc.record({
    action: fc.string({ maxLength: 30 }),
    status: fc.constantFrom('idle', 'running', 'done', 'error'),
    message: fc.string({ maxLength: 100 }),
  });

/** 生成随机的 FixableIssue */
const fixableIssueArb = () =>
  fc.record({
    id: fc.string({ minLength: 1, maxLength: 20 }),
    label: fc.string({ minLength: 1, maxLength: 50 }),
    action: fc.constantFrom('install', 'upgrade', 'fixPath'),
    severity: fc.constantFrom('required', 'optional'),
  });

// ============================================================
// 复合类型生成器
// ============================================================

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
    notes: fc.array(fc.string({ maxLength: 50 }), { maxLength: 5 }),
    fixableIssues: fc.array(fixableIssueArb(), { maxLength: 3 }),
  });

/** 生成随机的 EnvironmentCheckResult（判别联合） */
const envCheckResultArb = (): fc.Arbitrary<EnvironmentCheckResult> =>
  fc.oneof(
    envCheckDataArb().map((data) => ({
      status: 'success' as const,
      data,
    })),
    fc.record({
      status: fc.constant('failed' as const),
      error: setupErrorArb(),
      partialData: fc.option(
        fc.record({
          platform: fc.option(fc.string({ maxLength: 20 }), { nil: undefined }),
          platformLabel: fc.option(fc.string({ maxLength: 20 }), { nil: undefined }),
        }),
        { nil: undefined },
      ),
    }),
    fc.record({
      status: fc.constant('fallback' as const),
      data: envCheckDataArb(),
      reason: fc.string({ minLength: 1, maxLength: 50 }),
    }),
  );

/** 生成随机的 RuntimeResolution（判别联合） */
const runtimeResolutionArb = (): fc.Arbitrary<RuntimeResolution | null> =>
  fc.oneof(
    fc.constant(null),
    fc.record({
      tier: fc.constant('bundled' as const),
      nodePath: fc.string({ minLength: 1, maxLength: 50 }),
      openclawPath: fc.string({ minLength: 1, maxLength: 50 }),
      bundledNodeAvailable: fc.constant(true as const),
      bundledOpenClawAvailable: fc.constant(true as const),
    }),
    fc.record({
      tier: fc.constant('system' as const),
      nodePath: fc.string({ minLength: 1, maxLength: 50 }),
      openclawPath: fc.oneof(fc.string({ minLength: 1, maxLength: 50 }), fc.constant(null)),
      systemNodeVersion: fc.string({ minLength: 1, maxLength: 20 }),
      systemNodeSatisfies: fc.constant(true as const),
      systemOpenClawInstalled: fc.boolean(),
    }),
    fc.record({
      tier: fc.constant('online' as const),
      nodePath: fc.oneof(fc.string({ minLength: 1, maxLength: 50 }), fc.constant(null)),
      openclawPath: fc.oneof(fc.string({ minLength: 1, maxLength: 50 }), fc.constant(null)),
      systemNodeVersion: fc.oneof(fc.string({ minLength: 1, maxLength: 20 }), fc.constant(null)),
      systemNodeSatisfies: fc.boolean(),
    }),
    fc.record({
      tier: fc.constant('missing' as const),
      error: fc.option(fc.string({ maxLength: 100 }), { nil: undefined }),
    }),
  );

/** 生成随机的 SetupLocalCheckResult */
const localCheckResultArb = (): fc.Arbitrary<SetupLocalCheckResult | null> =>
  fc.oneof(
    fc.constant(null),
    fc.record({
      commandDetected: fc.boolean(),
      commandPath: fc.string({ maxLength: 50 }),
      rootDirDetected: fc.boolean(),
      rootDir: fc.string({ maxLength: 50 }),
      versionSuccess: fc.boolean(),
      versionOutput: fc.string({ maxLength: 100 }),
      error: fc.string({ maxLength: 100 }),
    }),
  );

/** 生成随机的 SetupInstallResult */
const installResultArb = (): fc.Arbitrary<SetupInstallResult> =>
  fc.record({
    success: fc.boolean(),
    message: fc.string({ maxLength: 100 }),
    command: fc.string({ maxLength: 100 }),
    output: fc.option(fc.string({ maxLength: 100 }), { nil: undefined }),
    error: fc.option(fc.string({ maxLength: 100 }), { nil: undefined }),
  });

/** 生成随机的 SetupRemoteDraft */
const remoteDraftArb = (): fc.Arbitrary<SetupRemoteDraft> =>
  fc.record({
    host: fc.string({ maxLength: 50 }),
    port: fc.string({ maxLength: 10 }),
    protocol: fc.constantFrom('http', 'https'),
    token: fc.string({ maxLength: 50 }),
  });

/** 生成随机的 SetupRemoteVerificationResult */
const remoteVerificationArb = (): fc.Arbitrary<SetupRemoteVerificationResult | null> =>
  fc.oneof(
    fc.constant(null),
    fc.record({
      success: fc.boolean(),
      authenticated: fc.option(fc.boolean(), { nil: undefined }),
      error: fc.option(fc.string({ maxLength: 100 }), { nil: undefined }),
      host: fc.option(fc.string({ maxLength: 50 }), { nil: undefined }),
      port: fc.option(fc.nat({ max: 65535 }), { nil: undefined }),
      version: fc.option(fc.string({ maxLength: 20 }), { nil: undefined }),
    }),
  );

/** 生成随机的 ChannelConfig */
const channelConfigArb = (): fc.Arbitrary<ChannelConfig> =>
  fc.record({
    key: fc.string({ minLength: 1, maxLength: 20 }),
    label: fc.string({ minLength: 1, maxLength: 30 }),
    hint: fc.string({ maxLength: 100 }),
    tokenLabel: fc.string({ minLength: 1, maxLength: 30 }),
    enabled: fc.boolean(),
    token: fc.string({ maxLength: 50 }),
    fieldValues: fc.constant({} as Record<string, string>),
    fields: fc.constant([] as any[]),
    testStatus: fc.constantFrom('idle', 'testing', 'ok', 'error'),
    testError: fc.option(fc.string({ maxLength: 100 }), { nil: undefined }),
    cliHint: fc.option(fc.string({ maxLength: 100 }), { nil: undefined }),
  });

/** 生成随机的 ChannelAddResult */
const channelAddResultArb = (): fc.Arbitrary<ChannelAddResult> =>
  fc.record({
    channelKey: fc.string({ minLength: 1, maxLength: 20 }),
    channelLabel: fc.string({ minLength: 1, maxLength: 30 }),
    success: fc.boolean(),
    output: fc.option(fc.string({ maxLength: 100 }), { nil: undefined }),
    error: fc.option(fc.string({ maxLength: 100 }), { nil: undefined }),
  });

/** 生成随机的 SetupSettings */
const setupSettingsArb = (): fc.Arbitrary<SetupSettings> =>
  fc.record({
    runMode: fc.option(fc.constantFrom<SetupMode>('local', 'remote'), { nil: undefined }),
    setupCompleted: fc.option(fc.boolean(), { nil: undefined }),
    setupMode: fc.option(fc.constantFrom<SetupMode>('local', 'remote'), { nil: undefined }),
    setupCurrentStep: fc.option(fc.string({ maxLength: 50 }), { nil: undefined }),
    localInstallValidated: fc.option(fc.boolean(), { nil: undefined }),
    remoteConnectionValidated: fc.option(fc.boolean(), { nil: undefined }),
    remoteHost: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
    runtimeTier: fc.option(runtimeTierArb(), { nil: undefined }),
  });

// ============================================================
// SetupState 完整生成器
// ============================================================

/** 生成随机的完整 SetupState 对象 */
const setupStateArb = (): fc.Arbitrary<SetupState> =>
  fc.record({
    mode: setupModeArb(),
    environment: fc.record({
      check: envCheckResultArb(),
      runtimeResolution: runtimeResolutionArb(),
      fixProgress: fixProgressArb(),
    }),
    local: fc.record({
      checkResult: localCheckResultArb(),
      installResult: installResultArb(),
    }),
    remote: fc.record({
      draft: remoteDraftArb(),
      verification: remoteVerificationArb(),
    }),
    channels: fc.record({
      configs: fc.array(channelConfigArb(), { maxLength: 5 }),
      addResults: fc.array(channelAddResultArb(), { maxLength: 5 }),
    }),
    agent: fc.record({
      created: fc.oneof(
        fc.constant(null),
        fc.record({
          id: fc.string({ minLength: 1, maxLength: 20 }),
          name: fc.string({ minLength: 1, maxLength: 30 }),
        }),
      ),
    }),
    ui: fc.record({
      isBootstrapping: fc.boolean(),
      isBusy: fc.boolean(),
      error: fc.oneof(fc.constant(null), setupErrorArb()),
    }),
    settings: setupSettingsArb(),
    changeLogs: fc.constant([]),
  });

// ============================================================
// 特化生成器：用于 P10 状态转换测试
// ============================================================

/**
 * 生成 mode=null 的 SetupState
 * 用于测试需要 mode 前置条件的 action 被拒绝
 */
const stateWithNullModeArb = (): fc.Arbitrary<SetupState> =>
  setupStateArb().map((s) => ({ ...s, mode: null }));

/**
 * 生成 mode 不为 null 的 SetupState
 * 用于测试需要 mode 前置条件的 action 被接受
 */
const stateWithModeSetArb = (): fc.Arbitrary<SetupState> =>
  fc.tuple(setupStateArb(), fc.constantFrom<SetupMode>('local', 'remote'))
    .map(([s, mode]) => ({ ...s, mode }));

/**
 * 生成环境检测状态为 fallback 的 SetupState
 * 用于测试 SET_CHANNEL_CONFIGS 被拒绝
 */
const stateWithFallbackEnvArb = (): fc.Arbitrary<SetupState> =>
  setupStateArb().map((s) => ({
    ...s,
    environment: {
      ...s.environment,
      check: {
        status: 'fallback' as const,
        data: (initialSetupState.environment.check as any).data,
        reason: '测试降级',
      },
    },
  }));

/**
 * 生成环境检测状态不为 fallback 的 SetupState
 * 用于测试 SET_CHANNEL_CONFIGS 被接受
 */
const stateWithNonFallbackEnvArb = (): fc.Arbitrary<SetupState> =>
  setupStateArb().map((s) => ({
    ...s,
    environment: {
      ...s.environment,
      check: {
        status: 'success' as const,
        data: (initialSetupState.environment.check as any).data,
      },
    },
  }));

// ============================================================
// Action 生成器：按前置条件分组
// ============================================================

/**
 * 生成需要 mode !== null 前置条件的 action
 * 包括 SET_LOCAL_CHECK, SET_INSTALL_RESULT, SET_REMOTE_VERIFICATION, SET_CREATED_AGENT
 */
const modeRequiredActionArb = (): fc.Arbitrary<SetupAction> =>
  fc.oneof(
    localCheckResultArb().map(
      (payload) => ({ type: 'SET_LOCAL_CHECK' as const, payload }),
    ),
    installResultArb().map(
      (payload) => ({ type: 'SET_INSTALL_RESULT' as const, payload }),
    ),
    remoteVerificationArb().map(
      (payload) => ({ type: 'SET_REMOTE_VERIFICATION' as const, payload }),
    ),
    fc.oneof(
      fc.constant(null),
      fc.record({
        id: fc.string({ minLength: 1, maxLength: 20 }),
        name: fc.string({ minLength: 1, maxLength: 30 }),
      }),
    ).map(
      (payload) => ({ type: 'SET_CREATED_AGENT' as const, payload }),
    ),
  );

/**
 * 生成需要环境检测非 fallback 前置条件的 action
 * 仅 SET_CHANNEL_CONFIGS
 */
const envRequiredActionArb = (): fc.Arbitrary<SetupAction> =>
  fc.array(channelConfigArb(), { maxLength: 5 }).map(
    (payload) => ({ type: 'SET_CHANNEL_CONFIGS' as const, payload }),
  );

/**
 * 生成无前置条件的 action（始终合法）
 */
const alwaysValidActionArb = (): fc.Arbitrary<SetupAction> =>
  fc.oneof(
    fc.constantFrom<SetupMode>('local', 'remote').map(
      (payload) => ({ type: 'SET_MODE' as const, payload }),
    ),
    fc.boolean().map(
      (payload) => ({ type: 'SET_BUSY' as const, payload }),
    ),
    fc.boolean().map(
      (payload) => ({ type: 'SET_BOOTSTRAPPING' as const, payload }),
    ),
    fc.oneof(fc.constant(null), setupErrorArb()).map(
      (payload) => ({ type: 'SET_ERROR' as const, payload }),
    ),
    envCheckResultArb().map(
      (payload) => ({ type: 'SET_ENVIRONMENT_CHECK' as const, payload }),
    ),
    remoteDraftArb().map(
      (payload) => ({ type: 'SET_REMOTE_DRAFT' as const, payload }),
    ),
    setupSettingsArb().map(
      (payload) => ({ type: 'SET_SETTINGS' as const, payload }),
    ),
    setupSettingsArb().map(
      (payload) => ({ type: 'MERGE_SETTINGS' as const, payload }),
    ),
    runtimeResolutionArb().map(
      (payload) => ({ type: 'SET_RUNTIME_RESOLUTION' as const, payload }),
    ),
    fixProgressArb().map(
      (payload) => ({ type: 'SET_FIX_PROGRESS' as const, payload }),
    ),
    fc.array(channelAddResultArb(), { maxLength: 5 }).map(
      (payload) => ({ type: 'SET_CHANNEL_ADD_RESULTS' as const, payload }),
    ),
  );

// ============================================================
// Property 10: 状态转换合法性校验
// Feature: setup-flow-hardening
// ============================================================

describe('Feature: setup-flow-hardening, Property 10: 状态转换合法性校验', () => {
  /**
   * Validates: Requirements 7.1
   *
   * 对于任意 SetupState 和 SetupAction 组合，isValidTransition 应满足：
   * (a) 当前置条件不满足时返回 { valid: false }
   * (b) 对于合法的 action 序列返回 { valid: true }
   * (c) 对于不合法的 action 序列返回 { valid: false } 并包含原因描述
   */

  test('(a) mode=null 时，需要 mode 前置条件的 action 返回 valid=false', () => {
    fc.assert(
      fc.property(
        stateWithNullModeArb(),
        modeRequiredActionArb(),
        (state, action) => {
          // mode 为 null 时，需要 mode 的 action 应被拒绝
          const result = isValidTransition(state, action);
          expect(result.valid).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  test('(a) 环境检测为 fallback 时，SET_CHANNEL_CONFIGS 返回 valid=false', () => {
    fc.assert(
      fc.property(
        stateWithFallbackEnvArb(),
        envRequiredActionArb(),
        (state, action) => {
          // 环境检测为 fallback 时，SET_CHANNEL_CONFIGS 应被拒绝
          const result = isValidTransition(state, action);
          expect(result.valid).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  test('(b) mode 已设置时，需要 mode 前置条件的 action 返回 valid=true', () => {
    fc.assert(
      fc.property(
        stateWithModeSetArb(),
        modeRequiredActionArb(),
        (state, action) => {
          // mode 已设置时，需要 mode 的 action 应被接受
          const result = isValidTransition(state, action);
          expect(result.valid).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  test('(b) 环境检测非 fallback 时，SET_CHANNEL_CONFIGS 返回 valid=true', () => {
    fc.assert(
      fc.property(
        stateWithNonFallbackEnvArb(),
        envRequiredActionArb(),
        (state, action) => {
          // 环境检测非 fallback 时，SET_CHANNEL_CONFIGS 应被接受
          const result = isValidTransition(state, action);
          expect(result.valid).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  test('(b) 无前置条件的 action 在任意状态下始终返回 valid=true', () => {
    fc.assert(
      fc.property(
        setupStateArb(),
        alwaysValidActionArb(),
        (state, action) => {
          // 无前置条件的 action 始终合法
          const result = isValidTransition(state, action);
          expect(result.valid).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  test('(c) 不合法转换的返回值包含 reason 字段（非空字符串）', () => {
    fc.assert(
      fc.property(
        stateWithNullModeArb(),
        modeRequiredActionArb(),
        (state, action) => {
          // 不合法转换应包含原因描述
          const result = isValidTransition(state, action);
          expect(result.valid).toBe(false);
          expect(typeof result.reason).toBe('string');
          expect(result.reason!.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  test('(c) 合法转换的返回值不包含 reason 字段', () => {
    fc.assert(
      fc.property(
        stateWithModeSetArb(),
        alwaysValidActionArb(),
        (state, action) => {
          // 合法转换不应包含 reason
          const result = isValidTransition(state, action);
          expect(result.valid).toBe(true);
          expect(result.reason).toBeUndefined();
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ============================================================
// Property 11: 持久化状态完整性检测
// Feature: setup-flow-hardening
// ============================================================

describe('Feature: setup-flow-hardening, Property 11: 持久化状态完整性检测', () => {
  /**
   * Validates: Requirements 7.2
   *
   * 对于任意 SetupSettings 对象，validatePersistedState 应满足：
   * (a) 当 setupCompleted=true 但 setupMode 缺失时，返回 { valid: false }
   * (b) 当所有必填字段存在且一致时，返回 { valid: true }
   * (c) 返回的 issues 数组长度应等于检测到的不一致字段数
   */

  test('(a) setupCompleted=true 但 setupMode 缺失时返回 valid=false', () => {
    fc.assert(
      fc.property(
        setupSettingsArb().map((s) => ({
          ...s,
          setupCompleted: true,
          setupMode: undefined,
        })),
        (settings) => {
          const result = validatePersistedState(settings);
          // setupCompleted=true 但 setupMode 缺失，应检测到不一致
          expect(result.valid).toBe(false);
          // issues 中应包含 setupMode 缺失的描述
          expect(result.issues.length).toBeGreaterThan(0);
          expect(result.issues.some((i) => i.includes('setupMode'))).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  test('(a) setupCompleted=true 但 runMode 缺失时返回 valid=false', () => {
    fc.assert(
      fc.property(
        setupSettingsArb().map((s) => ({
          ...s,
          setupCompleted: true,
          runMode: undefined,
        })),
        (settings) => {
          const result = validatePersistedState(settings);
          // setupCompleted=true 但 runMode 缺失，应检测到不一致
          expect(result.valid).toBe(false);
          expect(result.issues.some((i) => i.includes('runMode'))).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  test('(b) 本地模式所有必填字段齐全且一致时返回 valid=true', () => {
    fc.assert(
      fc.property(
        fc.record({
          setupCompleted: fc.constant(true),
          setupMode: fc.constant('local' as SetupMode),
          runMode: fc.constant('local' as SetupMode),
          localInstallValidated: fc.constant(true),
        }),
        (settings) => {
          const result = validatePersistedState(settings);
          // 所有必填字段齐全且一致，应返回 valid=true
          expect(result.valid).toBe(true);
          expect(result.issues).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  test('(b) 远程模式所有必填字段齐全且一致时返回 valid=true', () => {
    fc.assert(
      fc.property(
        fc.record({
          setupCompleted: fc.constant(true),
          setupMode: fc.constant('remote' as SetupMode),
          runMode: fc.constant('remote' as SetupMode),
          remoteConnectionValidated: fc.constant(true),
          remoteHost: fc.string({ minLength: 1, maxLength: 50 }),
        }),
        (settings) => {
          const result = validatePersistedState(settings);
          // 远程模式所有必填字段齐全且一致，应返回 valid=true
          expect(result.valid).toBe(true);
          expect(result.issues).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  test('(b) setupCompleted 未设置或为 false 时返回 valid=true（无完整性约束）', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          // setupCompleted 为 false
          setupSettingsArb().map((s) => ({ ...s, setupCompleted: false })),
          // setupCompleted 为 undefined
          setupSettingsArb().map((s) => ({ ...s, setupCompleted: undefined })),
        ),
        (settings) => {
          const result = validatePersistedState(settings);
          // setupCompleted 未完成时，不触发完整性检查
          // 但 setupMode 和 runMode 不一致仍可能触发
          // 仅验证不会因 setupCompleted 相关检查而失败
          const completedIssues = result.issues.filter(
            (i) => i.includes('setupCompleted'),
          );
          expect(completedIssues).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  test('(c) issues 数组长度等于检测到的不一致数量', () => {
    fc.assert(
      fc.property(
        setupSettingsArb(),
        (settings) => {
          const result = validatePersistedState(settings);

          // 手动计算预期的 issues 数量
          let expectedCount = 0;

          if (settings.setupCompleted === true && !settings.setupMode) {
            expectedCount++;
          }
          if (settings.setupCompleted === true && !settings.runMode) {
            expectedCount++;
          }
          if (
            settings.setupMode &&
            settings.runMode &&
            settings.setupMode !== settings.runMode
          ) {
            expectedCount++;
          }
          if (
            settings.setupCompleted === true &&
            settings.setupMode === 'local' &&
            settings.localInstallValidated !== true
          ) {
            expectedCount++;
          }
          if (
            settings.setupCompleted === true &&
            settings.setupMode === 'remote' &&
            settings.remoteConnectionValidated !== true
          ) {
            expectedCount++;
          }
          if (
            settings.setupCompleted === true &&
            settings.setupMode === 'remote' &&
            !settings.remoteHost
          ) {
            expectedCount++;
          }

          // issues 数量应精确匹配
          expect(result.issues.length).toBe(expectedCount);
          // valid 标志应与 issues 数量一致
          expect(result.valid).toBe(expectedCount === 0);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ============================================================
// Property 12: 步骤重置完整性
// Feature: setup-flow-hardening
// ============================================================

describe('Feature: setup-flow-hardening, Property 12: 步骤重置完整性', () => {
  /**
   * Validates: Requirements 7.3, 7.5
   *
   * 对于任意引导步骤标识和当前 SetupState，getResetFieldsForStep 返回的
   * 重置字段应用到 state 后：
   * - 该步骤相关的错误状态（ui.error）应为 null
   * - 该步骤的中间结果应恢复为初始值
   */

  test('所有已知步骤的重置字段都包含 ui.error=null', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...KNOWN_STEPS),
        (step) => {
          const resetFields = getResetFieldsForStep(step);

          // 所有步骤的重置字段都应包含 ui 分组且 error 为 null
          expect(resetFields.ui).toBeDefined();
          expect(resetFields.ui!.error).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });

  test('未知步骤的重置字段仅包含 ui 基础重置', () => {
    fc.assert(
      fc.property(
        // 生成不在已知步骤列表中的随机字符串
        fc.string({ minLength: 1, maxLength: 30 }).filter(
          (s) => !KNOWN_STEPS.includes(s),
        ),
        (unknownStep) => {
          const resetFields = getResetFieldsForStep(unknownStep);

          // 未知步骤仅重置 UI 错误状态
          expect(resetFields.ui).toBeDefined();
          expect(resetFields.ui!.error).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });

  test('environment 步骤重置后，环境检测状态恢复为 fallback 初始值', () => {
    fc.assert(
      fc.property(
        setupStateArb(),
        (state) => {
          const resetFields = getResetFieldsForStep('environment');

          // 应包含 environment 分组的重置
          expect(resetFields.environment).toBeDefined();
          // 环境检测状态应重置为 fallback
          expect(resetFields.environment!.check.status).toBe('fallback');
          // 运行时解析应重置为 null
          expect(resetFields.environment!.runtimeResolution).toBeNull();
          // 修复进度应重置为 idle
          expect(resetFields.environment!.fixProgress.status).toBe('idle');
        },
      ),
      { numRuns: 100 },
    );
  });

  test('local_check 步骤重置后，本地检测结果恢复为初始值', () => {
    fc.assert(
      fc.property(
        setupStateArb(),
        (state) => {
          const resetFields = getResetFieldsForStep('local_check');

          // 应包含 local 分组的重置
          expect(resetFields.local).toBeDefined();
          // checkResult 应重置为 null
          expect(resetFields.local!.checkResult).toBeNull();
          // installResult 应重置为初始值
          expect(resetFields.local!.installResult.success).toBe(false);
          expect(resetFields.local!.installResult.message).toBe('');
          expect(resetFields.local!.installResult.command).toBe('');
        },
      ),
      { numRuns: 100 },
    );
  });

  test('install 步骤重置后，安装结果恢复为初始值', () => {
    fc.assert(
      fc.property(
        setupStateArb(),
        (state) => {
          const resetFields = getResetFieldsForStep('install');

          // 应包含 local 分组的重置
          expect(resetFields.local).toBeDefined();
          // installResult 应重置为初始值
          expect(resetFields.local!.installResult.success).toBe(false);
          expect(resetFields.local!.installResult.message).toBe('');
        },
      ),
      { numRuns: 100 },
    );
  });

  test('remote_verify 步骤重置后，远程连接状态恢复为初始值', () => {
    fc.assert(
      fc.property(
        setupStateArb(),
        (state) => {
          const resetFields = getResetFieldsForStep('remote_verify');

          // 应包含 remote 分组的重置
          expect(resetFields.remote).toBeDefined();
          // draft 应重置为默认值
          expect(resetFields.remote!.draft.host).toBe('');
          expect(resetFields.remote!.draft.port).toBe('3000');
          expect(resetFields.remote!.draft.protocol).toBe('http');
          expect(resetFields.remote!.draft.token).toBe('');
          // verification 应重置为 null
          expect(resetFields.remote!.verification).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });

  test('channels 步骤重置后，渠道配置恢复为空列表', () => {
    fc.assert(
      fc.property(
        setupStateArb(),
        (state) => {
          const resetFields = getResetFieldsForStep('channels');

          // 应包含 channels 分组的重置
          expect(resetFields.channels).toBeDefined();
          // configs 应重置为空数组
          expect(resetFields.channels!.configs).toEqual([]);
          // addResults 应重置为空数组
          expect(resetFields.channels!.addResults).toEqual([]);
        },
      ),
      { numRuns: 100 },
    );
  });

  test('agent 步骤重置后，Agent 创建信息恢复为 null', () => {
    fc.assert(
      fc.property(
        setupStateArb(),
        (state) => {
          const resetFields = getResetFieldsForStep('agent');

          // 应包含 agent 分组的重置
          expect(resetFields.agent).toBeDefined();
          // created 应重置为 null
          expect(resetFields.agent!.created).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });

  test('重置字段应用到任意状态后，ui.isBusy 和 ui.isBootstrapping 恢复为 false', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...KNOWN_STEPS),
        setupStateArb(),
        (step, state) => {
          const resetFields = getResetFieldsForStep(step);

          // 所有步骤重置后 isBusy 和 isBootstrapping 应为 false
          expect(resetFields.ui!.isBusy).toBe(false);
          expect(resetFields.ui!.isBootstrapping).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});
