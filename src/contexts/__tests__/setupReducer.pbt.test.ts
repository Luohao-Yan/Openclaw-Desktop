/**
 * 属性测试：Reducer 有效性
 * Feature: setup-flow-refactor, Property 1: Reducer 始终返回有效状态
 *
 * 验证 setupReducer 纯函数的正确性：
 *   - 对于任意有效的 SetupState 和任意 SetupAction，返回值包含所有必需嵌套分组
 *   - 每个嵌套分组包含其必需的字段
 *
 * **Validates: Requirements 1.1, 1.4**
 */

import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';
import { setupReducer, initialSetupState } from '../setupReducer';
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
    // 成功状态
    envCheckDataArb().map((data) => ({
      status: 'success' as const,
      data,
    })),
    // 失败状态
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
    // 降级状态
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
    // bundled 层级
    fc.record({
      tier: fc.constant('bundled' as const),
      nodePath: fc.string({ minLength: 1, maxLength: 50 }),
      openclawPath: fc.string({ minLength: 1, maxLength: 50 }),
      bundledNodeAvailable: fc.constant(true as const),
      bundledOpenClawAvailable: fc.constant(true as const),
    }),
    // system 层级
    fc.record({
      tier: fc.constant('system' as const),
      nodePath: fc.string({ minLength: 1, maxLength: 50 }),
      openclawPath: fc.oneof(fc.string({ minLength: 1, maxLength: 50 }), fc.constant(null)),
      systemNodeVersion: fc.string({ minLength: 1, maxLength: 20 }),
      systemNodeSatisfies: fc.constant(true as const),
      systemOpenClawInstalled: fc.boolean(),
    }),
    // online 层级
    fc.record({
      tier: fc.constant('online' as const),
      nodePath: fc.oneof(fc.string({ minLength: 1, maxLength: 50 }), fc.constant(null)),
      openclawPath: fc.oneof(fc.string({ minLength: 1, maxLength: 50 }), fc.constant(null)),
      systemNodeVersion: fc.oneof(fc.string({ minLength: 1, maxLength: 20 }), fc.constant(null)),
      systemNodeSatisfies: fc.boolean(),
    }),
    // missing 层级
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
      bindings: fc.array(
        fc.record({
          agentId: fc.string({ minLength: 1, maxLength: 20 }),
          channelKey: fc.string({ minLength: 1, maxLength: 20 }),
          accountId: fc.string({ minLength: 1, maxLength: 20 }),
        }),
        { maxLength: 5 },
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
// SetupAction 完整生成器（覆盖全部 17 种 action 类型）
// ============================================================

/** 生成随机的 SetupAction（覆盖所有 17 种 action 变体） */
const setupActionArb = (): fc.Arbitrary<SetupAction> =>
  fc.oneof(
    // SET_MODE — 设置安装模式
    fc.constantFrom<SetupMode>('local', 'remote').map(
      (payload) => ({ type: 'SET_MODE' as const, payload }),
    ),
    // SET_BUSY — 设置忙碌状态
    fc.boolean().map(
      (payload) => ({ type: 'SET_BUSY' as const, payload }),
    ),
    // SET_BOOTSTRAPPING — 设置引导初始化状态
    fc.boolean().map(
      (payload) => ({ type: 'SET_BOOTSTRAPPING' as const, payload }),
    ),
    // SET_ERROR — 设置结构化错误对象
    fc.oneof(fc.constant(null), setupErrorArb()).map(
      (payload) => ({ type: 'SET_ERROR' as const, payload }),
    ),
    // SET_ENVIRONMENT_CHECK — 设置环境检测结果
    envCheckResultArb().map(
      (payload) => ({ type: 'SET_ENVIRONMENT_CHECK' as const, payload }),
    ),
    // SET_LOCAL_CHECK — 设置本地安装检测结果
    localCheckResultArb().map(
      (payload) => ({ type: 'SET_LOCAL_CHECK' as const, payload }),
    ),
    // SET_REMOTE_DRAFT — 设置远程连接草稿
    remoteDraftArb().map(
      (payload) => ({ type: 'SET_REMOTE_DRAFT' as const, payload }),
    ),
    // SET_REMOTE_VERIFICATION — 设置远程连接验证结果
    remoteVerificationArb().map(
      (payload) => ({ type: 'SET_REMOTE_VERIFICATION' as const, payload }),
    ),
    // SET_INSTALL_RESULT — 设置安装结果
    installResultArb().map(
      (payload) => ({ type: 'SET_INSTALL_RESULT' as const, payload }),
    ),
    // SET_SETTINGS — 整体替换设置
    setupSettingsArb().map(
      (payload) => ({ type: 'SET_SETTINGS' as const, payload }),
    ),
    // MERGE_SETTINGS — 合并部分设置
    setupSettingsArb().map(
      (payload) => ({ type: 'MERGE_SETTINGS' as const, payload }),
    ),
    // SET_RUNTIME_RESOLUTION — 设置运行时解析结果
    runtimeResolutionArb().map(
      (payload) => ({ type: 'SET_RUNTIME_RESOLUTION' as const, payload }),
    ),
    // SET_FIX_PROGRESS — 设置环境修复进度状态
    fixProgressArb().map(
      (payload) => ({ type: 'SET_FIX_PROGRESS' as const, payload }),
    ),
    // SET_CHANNEL_CONFIGS — 整体替换渠道配置列表
    fc.array(channelConfigArb(), { maxLength: 5 }).map(
      (payload) => ({ type: 'SET_CHANNEL_CONFIGS' as const, payload }),
    ),
    // UPDATE_CHANNEL — 更新单个渠道的部分配置
    fc.record({
      key: fc.string({ minLength: 1, maxLength: 20 }),
      updates: fc.record({
        enabled: fc.option(fc.boolean(), { nil: undefined }),
        token: fc.option(fc.string({ maxLength: 50 }), { nil: undefined }),
      }),
    }).map(
      (payload) => ({ type: 'UPDATE_CHANNEL' as const, payload }),
    ),
    // SET_CHANNEL_ADD_RESULTS — 设置渠道批量添加结果
    fc.array(channelAddResultArb(), { maxLength: 5 }).map(
      (payload) => ({ type: 'SET_CHANNEL_ADD_RESULTS' as const, payload }),
    ),
    // SET_CREATED_AGENT — 设置创建的 Agent 信息
    fc.oneof(
      fc.constant(null),
      fc.record({
        id: fc.string({ minLength: 1, maxLength: 20 }),
        name: fc.string({ minLength: 1, maxLength: 30 }),
      }),
    ).map(
      (payload) => ({ type: 'SET_CREATED_AGENT' as const, payload }),
    ),
    // SET_AGENT_CHANNEL_BINDINGS — 设置 Agent-Channel 绑定关系
    fc.array(
      fc.record({
        agentId: fc.string({ minLength: 1, maxLength: 20 }),
        channelKey: fc.string({ minLength: 1, maxLength: 20 }),
        accountId: fc.string({ minLength: 1, maxLength: 20 }),
      }),
      { maxLength: 5 },
    ).map(
      (payload) => ({ type: 'SET_AGENT_CHANNEL_BINDINGS' as const, payload }),
    ),
  );

// ============================================================
// 辅助验证函数
// ============================================================

/**
 * 验证 SetupState 包含所有必需的嵌套分组
 * 检查 environment、local、remote、channels、agent、ui、settings 七个顶级分组
 */
function hasAllRequiredGroups(state: unknown): state is SetupState {
  if (typeof state !== 'object' || state === null) {
    return false;
  }

  const s = state as Record<string, unknown>;

  // 检查所有必需的顶级分组是否存在
  const requiredGroups = ['mode', 'environment', 'local', 'remote', 'channels', 'agent', 'ui', 'settings'];
  for (const group of requiredGroups) {
    if (!(group in s)) {
      return false;
    }
  }

  return true;
}

/**
 * 验证 environment 分组包含所有必需字段
 */
function hasValidEnvironmentGroup(state: SetupState): boolean {
  const env = state.environment;
  if (typeof env !== 'object' || env === null) return false;

  // 必须包含 check、runtimeResolution、fixProgress 三个字段
  return 'check' in env && 'runtimeResolution' in env && 'fixProgress' in env;
}

/**
 * 验证 local 分组包含所有必需字段
 */
function hasValidLocalGroup(state: SetupState): boolean {
  const local = state.local;
  if (typeof local !== 'object' || local === null) return false;

  // 必须包含 checkResult、installResult 两个字段
  return 'checkResult' in local && 'installResult' in local;
}

/**
 * 验证 remote 分组包含所有必需字段
 */
function hasValidRemoteGroup(state: SetupState): boolean {
  const remote = state.remote;
  if (typeof remote !== 'object' || remote === null) return false;

  // 必须包含 draft、verification 两个字段
  return 'draft' in remote && 'verification' in remote;
}

/**
 * 验证 channels 分组包含所有必需字段
 */
function hasValidChannelsGroup(state: SetupState): boolean {
  const channels = state.channels;
  if (typeof channels !== 'object' || channels === null) return false;

  // 必须包含 configs、addResults 两个字段
  return 'configs' in channels && 'addResults' in channels;
}

/**
 * 验证 agent 分组包含所有必需字段
 */
function hasValidAgentGroup(state: SetupState): boolean {
  const agent = state.agent;
  if (typeof agent !== 'object' || agent === null) return false;

  // 必须包含 created 字段
  return 'created' in agent;
}

/**
 * 验证 ui 分组包含所有必需字段
 */
function hasValidUIGroup(state: SetupState): boolean {
  const ui = state.ui;
  if (typeof ui !== 'object' || ui === null) return false;

  // 必须包含 isBootstrapping、isBusy、error 三个字段
  return 'isBootstrapping' in ui && 'isBusy' in ui && 'error' in ui;
}

/**
 * 验证 settings 分组存在（可以是空对象）
 */
function hasValidSettingsGroup(state: SetupState): boolean {
  return typeof state.settings === 'object' && state.settings !== null;
}

// ============================================================
// Property 1: Reducer 始终返回有效状态
// Feature: setup-flow-refactor
// ============================================================

describe('Feature: setup-flow-refactor, Property 1: Reducer 始终返回有效状态', () => {
  /**
   * Validates: Requirements 1.1, 1.4
   *
   * 对于任意有效的 SetupState 和任意 SetupAction，
   * setupReducer(state, action) 的返回值应当是一个包含所有必需嵌套分组的有效 SetupState 对象。
   */

  test('reducer 返回值包含所有必需的顶级分组', () => {
    fc.assert(
      fc.property(setupStateArb(), setupActionArb(), (state, action) => {
        // 执行 reducer
        const nextState = setupReducer(state, action);

        // 返回值必须包含所有必需的顶级分组
        expect(hasAllRequiredGroups(nextState)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  test('reducer 返回值的 environment 分组包含所有必需字段', () => {
    fc.assert(
      fc.property(setupStateArb(), setupActionArb(), (state, action) => {
        const nextState = setupReducer(state, action);

        // environment 分组必须包含 check、runtimeResolution、fixProgress
        expect(hasValidEnvironmentGroup(nextState)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  test('reducer 返回值的 local 分组包含所有必需字段', () => {
    fc.assert(
      fc.property(setupStateArb(), setupActionArb(), (state, action) => {
        const nextState = setupReducer(state, action);

        // local 分组必须包含 checkResult、installResult
        expect(hasValidLocalGroup(nextState)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  test('reducer 返回值的 remote 分组包含所有必需字段', () => {
    fc.assert(
      fc.property(setupStateArb(), setupActionArb(), (state, action) => {
        const nextState = setupReducer(state, action);

        // remote 分组必须包含 draft、verification
        expect(hasValidRemoteGroup(nextState)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  test('reducer 返回值的 channels 分组包含所有必需字段', () => {
    fc.assert(
      fc.property(setupStateArb(), setupActionArb(), (state, action) => {
        const nextState = setupReducer(state, action);

        // channels 分组必须包含 configs、addResults
        expect(hasValidChannelsGroup(nextState)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  test('reducer 返回值的 agent 分组包含所有必需字段', () => {
    fc.assert(
      fc.property(setupStateArb(), setupActionArb(), (state, action) => {
        const nextState = setupReducer(state, action);

        // agent 分组必须包含 created
        expect(hasValidAgentGroup(nextState)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  test('reducer 返回值的 ui 分组包含所有必需字段', () => {
    fc.assert(
      fc.property(setupStateArb(), setupActionArb(), (state, action) => {
        const nextState = setupReducer(state, action);

        // ui 分组必须包含 isBootstrapping、isBusy、error
        expect(hasValidUIGroup(nextState)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  test('reducer 返回值的 settings 分组是有效对象', () => {
    fc.assert(
      fc.property(setupStateArb(), setupActionArb(), (state, action) => {
        const nextState = setupReducer(state, action);

        // settings 必须是有效对象
        expect(hasValidSettingsGroup(nextState)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  test('使用 initialSetupState 作为初始状态时，reducer 返回有效状态', () => {
    fc.assert(
      fc.property(setupActionArb(), (action) => {
        // 使用导出的初始状态常量
        const nextState = setupReducer(initialSetupState, action);

        // 返回值必须包含所有必需分组且每个分组字段完整
        expect(hasAllRequiredGroups(nextState)).toBe(true);
        expect(hasValidEnvironmentGroup(nextState)).toBe(true);
        expect(hasValidLocalGroup(nextState)).toBe(true);
        expect(hasValidRemoteGroup(nextState)).toBe(true);
        expect(hasValidChannelsGroup(nextState)).toBe(true);
        expect(hasValidAgentGroup(nextState)).toBe(true);
        expect(hasValidUIGroup(nextState)).toBe(true);
        expect(hasValidSettingsGroup(nextState)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });
});


// ============================================================
// Property 2: Reducer 保持不可变性
// Feature: setup-flow-refactor
// ============================================================

describe('Feature: setup-flow-refactor, Property 2: Reducer 保持不可变性', () => {
  /**
   * Validates: Requirements 1.5
   *
   * 对于任意有效的 SetupState 和任意 SetupAction，
   * 在执行 setupReducer(state, action) 后，原始 state 对象及其所有嵌套属性不应被修改。
   * 使用 structuredClone 深拷贝原始状态，然后用 vitest 的 toEqual 进行深度相等性检查。
   */

  test('reducer 执行后原始状态对象不被修改', () => {
    fc.assert(
      fc.property(setupStateArb(), setupActionArb(), (state, action) => {
        // 使用 structuredClone 深拷贝原始状态（正确保留 undefined 值）
        const originalStateCopy = structuredClone(state);

        // 执行 reducer
        setupReducer(state, action);

        // 验证原始状态未被修改
        expect(state).toEqual(originalStateCopy);
      }),
      { numRuns: 200 },
    );
  });

  test('reducer 执行后原始状态的各嵌套分组不被修改', () => {
    fc.assert(
      fc.property(setupStateArb(), setupActionArb(), (state, action) => {
        // 分别深拷贝各嵌套分组
        const originalEnv = structuredClone(state.environment);
        const originalLocal = structuredClone(state.local);
        const originalRemote = structuredClone(state.remote);
        const originalChannels = structuredClone(state.channels);
        const originalUI = structuredClone(state.ui);
        const originalSettings = structuredClone(state.settings);

        // 执行 reducer
        setupReducer(state, action);

        // 验证各嵌套分组均未被修改
        expect(state.environment).toEqual(originalEnv);
        expect(state.local).toEqual(originalLocal);
        expect(state.remote).toEqual(originalRemote);
        expect(state.channels).toEqual(originalChannels);
        expect(state.ui).toEqual(originalUI);
        expect(state.settings).toEqual(originalSettings);
      }),
      { numRuns: 200 },
    );
  });

  test('使用 initialSetupState 时，reducer 执行后初始状态不被修改', () => {
    fc.assert(
      fc.property(setupActionArb(), (action) => {
        // 每次迭代创建新的初始状态副本
        const testState = structuredClone(initialSetupState);
        const originalCopy = structuredClone(testState);

        // 执行 reducer
        setupReducer(testState, action);

        // 验证测试状态未被修改
        expect(testState).toEqual(originalCopy);
      }),
      { numRuns: 200 },
    );
  });
});
