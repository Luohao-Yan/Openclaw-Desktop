/**
 * 属性测试：Setup 向导验证修复 - Bug Condition 探索
 * Feature: setup-wizard-validation-fixes
 * 覆盖 Property 1: Bug Condition - CLI 命令使用硬编码路径和未注入完整 PATH
 *
 * 本测试编码的是 **期望行为（正确行为）**：
 * 1. buildChannelCommandConfig 使用 resolvedCommand 而非硬编码 'openclaw'，并注入 shellPath 作为 PATH
 * 2. buildDoctorFixEnv 注入 shellPath 作为 PATH，同时保留 NO_COLOR、FORCE_COLOR
 * 3. classifyVerifyError 对 schema 关键词返回 'config_schema' 类别并附带非空修复建议
 *
 * 在未修复代码上运行时，测试应 **失败**（纯函数尚未提取，导入失败 → 证明 bug 存在）。
 * 修复后运行时，测试应 **通过**（证明 bug 已修复）。
 */

import { describe, test, expect, vi } from 'vitest';
import * as fc from 'fast-check';

// ── Mock 依赖：阻止 electron-store 在测试环境中初始化 ──────────────────
// channels.ts 和 agents.ts 导入 settings.ts，后者在模块顶层创建 electron-store 实例，
// 在非 Electron 环境中会抛出 "Please specify the projectName option" 错误。
// 通过 mock settings.ts 和 electron 模块，使动态导入能正常加载纯函数。
vi.mock('electron', () => ({
  default: { ipcMain: { handle: vi.fn() } },
  ipcMain: { handle: vi.fn() },
}));

vi.mock('../settings.js', () => ({
  resolveOpenClawCommand: vi.fn(() => '/usr/local/bin/openclaw'),
  getShellPath: vi.fn(async () => '/usr/local/bin:/usr/bin:/bin'),
  getOpenClawRootDir: vi.fn(() => '/tmp/.openclaw'),
}));

// ── 导入待测试的纯函数 ──────────────────────────────────────────────
// Bug 条件测试的函数使用动态导入，mock 确保模块加载不会因 electron-store 而失败
// 动态导入在各测试块内部执行

// ── 生成器（Arbitraries）──────────────────────────────────────────────────

/**
 * 生成随机的 CLI 可执行文件路径
 * 模拟 resolveOpenClawCommand() 可能返回的各种路径
 */
const resolvedCommandArb = (): fc.Arbitrary<string> =>
  fc.constantFrom(
    '/usr/local/bin/openclaw',
    '/opt/homebrew/bin/openclaw',
    '/home/user/.local/bin/openclaw',
    '/Applications/OpenClaw.app/Contents/Resources/bin/openclaw',
    '/home/user/.nvm/versions/node/v20.11.0/bin/openclaw',
    '/home/user/.volta/bin/openclaw',
    'openclaw', // 系统 PATH 可直接访问时的回退值
  );

/**
 * 生成随机的 shell PATH 字符串
 * 模拟 getShellPath() 返回的包含版本管理器路径的完整 PATH
 */
const shellPathArb = (): fc.Arbitrary<string> =>
  fc.tuple(
    fc.constantFrom(
      '/usr/local/bin:/usr/bin:/bin',
      '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin',
    ),
    fc.constantFrom(
      ':/home/user/.nvm/versions/node/v20.11.0/bin',
      ':/home/user/.volta/bin',
      ':/home/user/.asdf/shims',
      '',
    ),
  ).map(([base, extra]) => base + extra);

/**
 * 生成随机的 CLI 参数数组
 * 模拟 channels 和 agents 命令的参数
 */
const cliArgsArb = (): fc.Arbitrary<string[]> =>
  fc.constantFrom(
    ['channels', 'status'],
    ['channels', 'list'],
    ['channels', 'status', '--json'],
    ['doctor', '--fix'],
    ['agents', 'add', 'test-agent', '--workspace', '/tmp/test'],
  );

/**
 * 生成随机的 process.env 对象
 * 包含常见的环境变量
 */
const processEnvArb = (): fc.Arbitrary<Record<string, string>> =>
  fc.record({
    PATH: fc.constantFrom(
      '/usr/bin:/bin',
      '/usr/local/bin:/usr/bin:/bin',
    ),
    HOME: fc.constantFrom('/home/user', '/Users/testuser'),
    SHELL: fc.constantFrom('/bin/zsh', '/bin/bash'),
    // 可选的额外环境变量
    LANG: fc.constantFrom('en_US.UTF-8', 'zh_CN.UTF-8', undefined as any),
  }).map((env) => {
    // 移除 undefined 值
    const cleaned: Record<string, string> = {};
    for (const [k, v] of Object.entries(env)) {
      if (v !== undefined) cleaned[k] = v;
    }
    return cleaned;
  });

/**
 * 生成包含 schema 错误关键词的验证错误信息
 * 模拟 openclaw CLI 返回的 schema 校验错误
 */
const schemaVerifyErrorArb = (): fc.Arbitrary<string> =>
  fc.constantFrom(
    'Error: invalid dmScope value "invalid" in openclaw.json',
    'Error: unrecognized keys in config: tailscale, dmScope, daemon',
    'ZodError: validation failed for openclaw.json schema',
    'Error: invalid_type at "session.dmScope": expected string, received number',
    'unrecognized_keys: ["tailscale", "daemon", "legacyField"]',
    'schema validation failed: gateway.tailscale type mismatch',
    'Error: skills.install contains unrecognized key "recommended"',
    'Invalid config at ~/.openclaw/openclaw.json: unrecognized keys',
  );

// ============================================================
// Property 1: Bug Condition 探索
// Feature: setup-wizard-validation-fixes
// ============================================================

describe('Feature: setup-wizard-validation-fixes, Property 1: Bug Condition 探索', () => {

  // ── Bug 1: buildChannelCommandConfig 应使用 resolvedCommand 并注入 shellPath ──

  /**
   * Validates: Requirements 1.1, 2.1
   *
   * Bug 1 属性测试：buildChannelCommandConfig 应使用 resolvedCommand 作为 spawn 命令，
   * 而非硬编码 'openclaw'，并将 shellPath 注入为 env.PATH
   *
   * 在未修复代码上：函数不存在，导入失败 → 测试失败 → 证明 bug 存在
   * 修复后：函数返回正确的 spawn 配置 → 测试通过
   */
  test('Bug 1: buildChannelCommandConfig 应使用 resolvedCommand 而非硬编码 openclaw，并注入 shellPath 作为 PATH', async () => {
    const { buildChannelCommandConfig } = await import('../channels.js');
    fc.assert(
      fc.property(
        resolvedCommandArb(),
        shellPathArb(),
        cliArgsArb(),
        (resolvedCommand, shellPath, args) => {
          // 调用纯函数构建 spawn 配置
          const config = buildChannelCommandConfig(args, resolvedCommand, shellPath);

          // 期望行为 1: spawn 命令应为 resolvedCommand，而非硬编码 'openclaw'
          expect(config.command).toBe(resolvedCommand);

          // 期望行为 2: env.PATH 应为 shellPath（包含版本管理器路径）
          expect(config.env.PATH).toBe(shellPath);

          // 期望行为 3: args 应与输入一致（不修改参数）
          expect(config.args).toEqual(args);
        },
      ),
      { numRuns: 200 },
    );
  });

  /**
   * Validates: Requirements 1.1, 2.1
   *
   * Bug 1 具体案例：nvm 安装的 openclaw 路径
   */
  test('Bug 1 案例: nvm 路径的 openclaw 应被正确使用', async () => {
    const { buildChannelCommandConfig } = await import('../channels.js');
    const resolvedCommand = '/home/user/.nvm/versions/node/v20.11.0/bin/openclaw';
    const shellPath = '/home/user/.nvm/versions/node/v20.11.0/bin:/usr/local/bin:/usr/bin:/bin';
    const args = ['channels', 'status'];

    const config = buildChannelCommandConfig(args, resolvedCommand, shellPath);

    // 期望使用 nvm 路径而非硬编码 'openclaw'
    expect(config.command).toBe(resolvedCommand);
    expect(config.env.PATH).toBe(shellPath);
    expect(config.args).toEqual(args);
  });

  // ── Bug 2: buildDoctorFixEnv 应注入 shellPath 并保留 NO_COLOR、FORCE_COLOR ──

  /**
   * Validates: Requirements 1.2, 2.2
   *
   * Bug 2 属性测试：buildDoctorFixEnv 应将 shellPath 注入为 env.PATH，
   * 同时保留 NO_COLOR='1' 和 FORCE_COLOR='0'
   *
   * 在未修复代码上：函数不存在，导入失败 → 测试失败 → 证明 bug 存在
   * 修复后：函数返回正确的环境变量对象 → 测试通过
   */
  test('Bug 2: buildDoctorFixEnv 应注入 shellPath 作为 PATH，并保留 NO_COLOR 和 FORCE_COLOR', async () => {
    const { buildDoctorFixEnv } = await import('../agents.js');
    fc.assert(
      fc.property(
        processEnvArb(),
        shellPathArb(),
        (processEnv, shellPath) => {
          // 调用纯函数构建 doctor --fix 环境变量
          const env = buildDoctorFixEnv(processEnv, shellPath);

          // 期望行为 1: env.PATH 应为 shellPath（而非 process.env.PATH）
          expect(env.PATH).toBe(shellPath);

          // 期望行为 2: 保留 NO_COLOR='1'
          expect(env.NO_COLOR).toBe('1');

          // 期望行为 3: 保留 FORCE_COLOR='0'
          expect(env.FORCE_COLOR).toBe('0');
        },
      ),
      { numRuns: 200 },
    );
  });

  /**
   * Validates: Requirements 1.2, 2.2
   *
   * Bug 2 具体案例：process.env.PATH 不含版本管理器路径时
   */
  test('Bug 2 案例: 当 process.env.PATH 不含 nvm 路径时，应注入完整 shellPath', async () => {
    const { buildDoctorFixEnv } = await import('../agents.js');
    const processEnv = {
      PATH: '/usr/bin:/bin',
      HOME: '/home/user',
      SHELL: '/bin/zsh',
    };
    const shellPath = '/home/user/.nvm/versions/node/v20.11.0/bin:/usr/local/bin:/usr/bin:/bin';

    const env = buildDoctorFixEnv(processEnv, shellPath);

    // 期望 PATH 为 shellPath 而非 process.env.PATH
    expect(env.PATH).toBe(shellPath);
    expect(env.PATH).not.toBe(processEnv.PATH);
    expect(env.NO_COLOR).toBe('1');
    expect(env.FORCE_COLOR).toBe('0');
  });

  // ── Bug 3: classifyVerifyError 应对 schema 关键词返回 config_schema 类别 ──

  /**
   * Validates: Requirements 1.3, 2.3
   *
   * Bug 3 属性测试：classifyVerifyError 对包含 schema 关键词的错误信息
   * 应返回 'config_schema' 类别，并附带非空的修复建议
   *
   * 在未修复代码上：函数不存在，导入失败 → 测试失败 → 证明 bug 存在
   * 修复后：函数返回正确的分类结果 → 测试通过
   */
  test('Bug 3: classifyVerifyError 对 schema 错误应返回 config_schema 类别和非空 suggestion', async () => {
    const { classifyVerifyError } = await import('../verifyLogic.js');
    fc.assert(
      fc.property(schemaVerifyErrorArb(), (errorMessage) => {
        // 调用纯函数分类验证错误
        const result = classifyVerifyError(errorMessage);

        // 期望行为 1: category 应为 'config_schema'
        expect(result.category).toBe('config_schema');

        // 期望行为 2: suggestion 应为非空字符串（包含可操作的修复建议）
        expect(typeof result.suggestion).toBe('string');
        expect(result.suggestion.length).toBeGreaterThan(0);

        // 期望行为 3: message 应为非空字符串
        expect(typeof result.message).toBe('string');
        expect(result.message.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 1.3, 2.3
   *
   * Bug 3 具体案例：unrecognized keys 错误
   */
  test('Bug 3 案例: "unrecognized keys" 错误应分类为 config_schema', async () => {
    const { classifyVerifyError } = await import('../verifyLogic.js');
    const errorMessage = 'Invalid config at ~/.openclaw/openclaw.json: unrecognized keys ["daemon", "session.dmScope"]';

    const result = classifyVerifyError(errorMessage);

    expect(result.category).toBe('config_schema');
    expect(result.suggestion.length).toBeGreaterThan(0);
  });

  /**
   * Validates: Requirements 1.3, 2.3
   *
   * Bug 3 具体案例：ZodError schema 校验失败
   */
  test('Bug 3 案例: ZodError 校验失败应分类为 config_schema', async () => {
    const { classifyVerifyError } = await import('../verifyLogic.js');
    const errorMessage = 'ZodError: validation failed for openclaw.json schema';

    const result = classifyVerifyError(errorMessage);

    expect(result.category).toBe('config_schema');
    expect(result.suggestion.length).toBeGreaterThan(0);
  });
});


// ============================================================
// Property 2: Preservation - 非 bug 条件下行为不变
// Feature: setup-wizard-validation-fixes
//
// 本 describe 块测试已有纯函数在非 bug 输入下的行为保留。
// 这些测试在未修复代码上应 **通过**，确认基线行为。
// 修复后仍应通过，确认无回归。
// ============================================================

import {
  classifyAgentError,
  formatAgentCreateError,
  buildAgentCreateArgs,
  type AgentCreatePayload,
} from '../agentCreateLogic.js';

// ── 保留测试生成器 ──────────────────────────────────────────────────

/**
 * schema 错误关键词列表（与 agentCreateLogic.ts 中一致）
 * 用于生成不包含这些关键词的字符串
 */
const SCHEMA_KEYWORDS_LOWER = [
  'unrecognized keys',
  'invalid dmscope',
  'invalid_type',
  'unrecognized_keys',
  'schema',
  'validation failed',
  'zoderror',
];

/**
 * 生成不包含任何 schema 关键词的错误字符串
 * 确保 classifyAgentError 不会将其分类为 'schema'
 */
const nonSchemaStderrArb = (): fc.Arbitrary<string> =>
  fc.constantFrom(
    'network error: connection refused',
    'ECONNREFUSED 127.0.0.1:8080',
    'timeout waiting for response',
    'ENOTFOUND api.example.com',
    'permission denied: /usr/local/bin/openclaw',
    'EACCES: permission denied, open /etc/openclaw.json',
    'EPERM: operation not permitted',
    'command not found: openclaw',
    'unexpected error occurred',
    'file not found: config.json',
    'segmentation fault',
    'out of memory',
    'process exited with code 1',
    'unknown error in subprocess',
  );

/**
 * 生成非 'schema' 的错误类型字符串
 * 用于测试 formatAgentCreateError 的保留行为
 */
const nonSchemaErrorTypeArb = (): fc.Arbitrary<string> =>
  fc.constantFrom('network', 'permission', 'unknown', 'timeout', 'other');

/**
 * 生成任意 stderr 内容（用于 formatAgentCreateError 保留测试）
 * 当 errorType 不是 'schema' 时，函数应原样返回 stderr
 */
const arbitraryStderrArb = (): fc.Arbitrary<string> =>
  fc.oneof(
    nonSchemaStderrArb(),
    fc.string({ minLength: 1, maxLength: 200 }),
  );

/**
 * 生成有效的 AgentCreatePayload
 * 用于测试 buildAgentCreateArgs 的保留行为
 */
const agentPayloadArb = (): fc.Arbitrary<AgentCreatePayload> =>
  fc.record({
    name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
    workspace: fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0),
    model: fc.option(
      fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
      { nil: undefined },
    ),
  });

// ── Property 2: Preservation 测试 ──────────────────────────────────

describe('Feature: setup-wizard-validation-fixes, Property 2: Preservation - 非 bug 条件下行为不变', () => {

  // ── 保留测试 1: classifyAgentError 对非 schema 错误不返回 'schema' ──

  /**
   * Validates: Requirements 3.1, 3.2
   *
   * 对任意不包含 schema 关键词的错误字符串，
   * classifyAgentError 不应返回 'schema'，保留现有分类逻辑。
   */
  test('保留 1: classifyAgentError 对非 schema 错误字符串不返回 schema', () => {
    fc.assert(
      fc.property(nonSchemaStderrArb(), (stderr) => {
        const result = classifyAgentError(stderr);

        // 非 schema 错误字符串不应被分类为 'schema'
        expect(result).not.toBe('schema');

        // 返回值应为有效的 AgentErrorType
        expect(['network', 'permission', 'unknown']).toContain(result);
      }),
      { numRuns: 200 },
    );
  });

  /**
   * Validates: Requirements 3.1, 3.2
   *
   * 观察验证：具体的非 schema 错误应返回正确的分类
   */
  test('保留 1 观察: network error 返回 network', () => {
    expect(classifyAgentError('network error')).toBe('network');
  });

  test('保留 1 观察: permission denied 返回 permission', () => {
    expect(classifyAgentError('permission denied')).toBe('permission');
  });

  test('保留 1 观察: 无关键词的错误返回 unknown', () => {
    expect(classifyAgentError('something went wrong')).toBe('unknown');
  });

  // ── 保留测试 2: formatAgentCreateError 对非 schema 类型保留原始 stderr ──

  /**
   * Validates: Requirements 3.1, 3.2
   *
   * 对任意非 'schema' 的错误类型，formatAgentCreateError 应原样返回 stderr，
   * 不做任何修改或替换。
   */
  test('保留 2: formatAgentCreateError 对非 schema 错误类型保留原始 stderr', () => {
    fc.assert(
      fc.property(
        arbitraryStderrArb(),
        nonSchemaErrorTypeArb(),
        (stderr, errorType) => {
          const result = formatAgentCreateError(stderr, errorType);

          // 非 schema 错误类型：返回值应与原始 stderr 完全一致
          expect(result).toBe(stderr);
        },
      ),
      { numRuns: 200 },
    );
  });

  /**
   * Validates: Requirements 3.1, 3.2
   *
   * 观察验证：unknown 类型应原样返回 stderr
   */
  test('保留 2 观察: formatAgentCreateError(stderr, "unknown") 返回原始 stderr', () => {
    const stderr = 'some random error output from CLI';
    expect(formatAgentCreateError(stderr, 'unknown')).toBe(stderr);
  });

  test('保留 2 观察: formatAgentCreateError(stderr, "network") 返回原始 stderr', () => {
    const stderr = 'ECONNREFUSED 127.0.0.1:8080';
    expect(formatAgentCreateError(stderr, 'network')).toBe(stderr);
  });

  // ── 保留测试 3: buildAgentCreateArgs 构建正确的参数数组 ──

  /**
   * Validates: Requirements 3.2, 3.4
   *
   * buildAgentCreateArgs 对任意有效 payload 应：
   * - 始终包含 'agents', 'add', name, '--workspace', workspace, '--non-interactive', '--json'
   * - 当提供 model 时追加 '--model' 和 model 值
   * - 对 name 和 workspace 进行 trim
   */
  test('保留 3: buildAgentCreateArgs 对任意有效 payload 构建正确参数', () => {
    fc.assert(
      fc.property(agentPayloadArb(), (payload) => {
        const args = buildAgentCreateArgs(payload);

        // 基础参数结构验证
        expect(args[0]).toBe('agents');
        expect(args[1]).toBe('add');
        expect(args[2]).toBe(payload.name.trim());
        expect(args[3]).toBe('--workspace');
        expect(args[4]).toBe(payload.workspace.trim());
        expect(args).toContain('--non-interactive');
        expect(args).toContain('--json');

        // model 参数验证
        const trimmedModel = payload.model?.trim();
        if (trimmedModel) {
          const modelIdx = args.indexOf('--model');
          expect(modelIdx).toBeGreaterThan(-1);
          expect(args[modelIdx + 1]).toBe(trimmedModel);
        } else {
          expect(args).not.toContain('--model');
        }
      }),
      { numRuns: 200 },
    );
  });

  /**
   * Validates: Requirements 3.2, 3.4
   *
   * 观察验证：具体 payload 的参数构建
   */
  test('保留 3 观察: buildAgentCreateArgs 基本 payload 返回正确参数', () => {
    const args = buildAgentCreateArgs({ name: 'test', workspace: '/tmp/test' });
    expect(args).toEqual([
      'agents', 'add', 'test',
      '--workspace', '/tmp/test',
      '--non-interactive', '--json',
    ]);
  });

  test('保留 3 观察: buildAgentCreateArgs 带 model 的 payload 返回正确参数', () => {
    const args = buildAgentCreateArgs({ name: 'my-agent', workspace: '/home/user/project', model: 'gpt-4' });
    expect(args).toEqual([
      'agents', 'add', 'my-agent',
      '--workspace', '/home/user/project',
      '--non-interactive', '--json',
      '--model', 'gpt-4',
    ]);
  });

  // ── 未来保留测试（函数尚未创建，修复后启用）──

  // 注意：以下两个保留测试对应 buildDoctorFixEnv 和 buildChannelCommandConfig，
  // 这两个纯函数尚未从 agents.ts 和 channels.ts 中提取。
  // 它们将在 Task 3 实现后由 Task 3.7 验证。
  //
  // 保留测试 4: buildDoctorFixEnv 在注入 PATH 的同时保留 NO_COLOR、FORCE_COLOR 等原有环境变量
  // 保留测试 5: buildChannelCommandConfig 对任意 args 数组，输出的 args 与输入一致（不修改参数）
});
