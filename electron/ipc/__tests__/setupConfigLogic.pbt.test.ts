/**
 * 属性测试：sanitizeSetupConfig 函数的 Bug Condition 探索与 Preservation 验证
 * Feature: setup-wizard-init-bugfix
 *
 * 本文件包含两类测试：
 * 1. Property 3 - Bug Condition 探索：验证不兼容字段被正确过滤
 * 2. Property 5 - Preservation 保持性：验证 schema 兼容字段被完整保留
 *
 * 在 sanitizeSetupConfig 正确实现后，所有测试应通过。
 */

import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';
import { sanitizeSetupConfig } from '../setupConfigLogic';

// ── 生成器（Arbitraries）──────────────────────────────────────────────────

/**
 * 生成任意端口号（1-65535）
 */
const portArb = (): fc.Arbitrary<number> =>
  fc.integer({ min: 1, max: 65535 });

/**
 * 生成非空字符串（用于 auth、bind、dmScope 等字段）
 */
const nonEmptyStringArb = (): fc.Arbitrary<string> =>
  fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0);

/**
 * 生成包含 skills.install.recommended 的配置对象
 * 这是触发 Bug 3 的不兼容字段之一
 */
const configWithSkillsRecommendedArb = (): fc.Arbitrary<Record<string, unknown>> =>
  fc.record({
    skills: fc.record({
      install: fc.record({
        recommended: fc.anything(), // schema 不识别该 key
      }),
    }),
  });

/**
 * 生成包含根级 daemon 字段的配置对象
 * 这是触发 Bug 3 的不兼容字段之一
 */
const configWithRootDaemonArb = (): fc.Arbitrary<Record<string, unknown>> =>
  fc.record({
    daemon: fc.anything(), // schema 不包含根级 daemon 字段
  });

/**
 * 生成同时包含两个不兼容字段的配置对象
 * 用于验证所有不兼容字段都被一次性过滤
 */
const configWithAllIncompatibleFieldsArb = (): fc.Arbitrary<Record<string, unknown>> =>
  fc.record({
    skills: fc.record({
      install: fc.record({
        recommended: fc.anything(),
      }),
    }),
    daemon: fc.anything(),
  });

/**
 * 生成包含 schema 兼容字段的 gateway 配置
 */
const compatibleGatewayArb = (): fc.Arbitrary<Record<string, unknown>> =>
  fc.record({
    port: portArb(),
    auth: nonEmptyStringArb(),
    bind: nonEmptyStringArb(),
  });

/**
 * 生成 JSON 兼容的任意值（不含 undefined，与 JSON.parse(JSON.stringify) 行为对齐）
 * 使用 fc.jsonValue() 确保生成的值可以安全地经过 JSON 序列化往返而不丢失信息
 */
const jsonCompatibleArb = (): fc.Arbitrary<unknown> => fc.jsonValue();

/**
 * 生成包含 schema 兼容字段的完整配置对象
 * 用于 Preservation 测试
 * channels 和 agents 使用 JSON 兼容值，因为 sanitizeSetupConfig 内部使用 JSON 深拷贝
 */
const compatibleConfigArb = (): fc.Arbitrary<Record<string, unknown>> =>
  fc.record({
    gateway: compatibleGatewayArb(),
    session: fc.record({
      dmScope: nonEmptyStringArb(),
    }),
    channels: jsonCompatibleArb(),
    agents: jsonCompatibleArb(),
  });

// ============================================================
// Property 3: Bug Condition 探索测试
// Feature: setup-wizard-init-bugfix
//
// 验证 sanitizeSetupConfig 正确过滤两个不兼容字段。
// 在 sanitizeSetupConfig 正确实现后，这些测试应通过。
// ============================================================

describe('Feature: setup-wizard-init-bugfix, Property 3: Bug Condition 探索', () => {
  /**
   * Validates: Requirements 2.5
   *
   * Bug 3 测试 - 不兼容字段 1：skills.install.recommended 存在时应被删除
   *
   * openclaw schema 的 skills.install 只接受已知 key，不识别 recommended。
   * sanitizeSetupConfig 应删除该字段。
   */
  test('skills.install.recommended 存在时，输出中不应存在该字段', () => {
    fc.assert(
      fc.property(
        configWithSkillsRecommendedArb(),
        (config) => {
          const result = sanitizeSetupConfig(config);

          // 验证 skills.install.recommended 字段不存在
          if (result.skills !== null && typeof result.skills === 'object') {
            const skills = result.skills as Record<string, unknown>;
            if (skills.install !== null && typeof skills.install === 'object') {
              const install = skills.install as Record<string, unknown>;
              // recommended 字段应被删除
              expect('recommended' in install).toBe(false);
            }
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  /**
   * Validates: Requirements 2.5
   *
   * Bug 3 具体案例：skills.install.recommended: true 应被删除
   */
  test('具体案例: skills.install.recommended: true 应被删除', () => {
    const config = { skills: { install: { recommended: true } } };
    const result = sanitizeSetupConfig(config);

    const skills = result.skills as Record<string, unknown>;
    const install = skills.install as Record<string, unknown>;
    expect('recommended' in install).toBe(false);
  });

  /**
   * Validates: Requirements 2.6
   *
   * Bug 3 测试 - 不兼容字段 2：根级 daemon 字段存在时应被删除
   *
   * openclaw schema 不包含根级 daemon 字段，daemon 管理由 CLI 独立处理。
   * sanitizeSetupConfig 应删除该字段。
   */
  test('根级 daemon 字段存在时，输出中不应存在该字段', () => {
    fc.assert(
      fc.property(
        configWithRootDaemonArb(),
        (config) => {
          const result = sanitizeSetupConfig(config);

          // 根级 daemon 字段应被删除
          expect('daemon' in result).toBe(false);
        },
      ),
      { numRuns: 200 },
    );
  });

  /**
   * Validates: Requirements 2.6
   *
   * Bug 3 具体案例：根级 daemon 对象应被删除
   */
  test('具体案例: 根级 daemon 对象应被删除', () => {
    const config = {
      daemon: { install: true, runtime: 'launchd' },
    };
    const result = sanitizeSetupConfig(config);

    expect('daemon' in result).toBe(false);
  });

  /**
   * Validates: Requirements 2.5, 2.6
   *
   * Bug 3 综合测试：同时包含两个不兼容字段时，全部应被删除
   *
   * 这是最接近真实 done 子步骤配置对象的测试场景。
   */
  test('同时包含两个不兼容字段时，全部应被删除', () => {
    fc.assert(
      fc.property(
        configWithAllIncompatibleFieldsArb(),
        (config) => {
          const result = sanitizeSetupConfig(config);

          // 1. skills.install.recommended 不应存在
          if (result.skills !== null && typeof result.skills === 'object') {
            const skills = result.skills as Record<string, unknown>;
            if (skills.install !== null && typeof skills.install === 'object') {
              const install = skills.install as Record<string, unknown>;
              expect('recommended' in install).toBe(false);
            }
          }

          // 2. 根级 daemon 不应存在
          expect('daemon' in result).toBe(false);
        },
      ),
      { numRuns: 200 },
    );
  });

  /**
   * Validates: Requirements 2.5, 2.6
   *
   * Bug 3 具体综合案例：模拟真实 done 子步骤配置对象
   */
  test('具体综合案例: 模拟真实 done 子步骤配置对象，两个不兼容字段全部被删除', () => {
    // 模拟 done 子步骤实际构建的配置对象
    const config = {
      gateway: {
        port: 8080,
        auth: { mode: 'token' }, // 合法字段：gateway.auth.mode
        bind: 'loopback',
      },
      skills: {
        install: {
          recommended: true, // 不兼容：schema 不识别
        },
      },
      daemon: {
        install: true,   // 不兼容：schema 不包含根级 daemon
        runtime: 'launchd',
      },
      session: {
        dmScope: 'local',
      },
    };

    const result = sanitizeSetupConfig(config);

    // 验证两个不兼容字段被删除
    const skills = result.skills as Record<string, unknown>;
    const install = skills.install as Record<string, unknown>;
    expect('recommended' in install).toBe(false);

    expect('daemon' in result).toBe(false);

    // 验证兼容字段被保留
    const gateway = result.gateway as Record<string, unknown>;
    expect(gateway.port).toBe(8080);
    expect(gateway.auth).toEqual({ mode: 'token' });
    expect(gateway.bind).toBe('loopback');
    const session = result.session as Record<string, unknown>;
    expect(session.dmScope).toBe('local');
  });

  /**
   * Validates: Requirements 2.5
   *
   * 边界情况：skills.install 不存在时，不应报错
   */
  test('边界情况: 不含 skills.install 字段的配置不应报错', () => {
    const config = { skills: {} };
    expect(() => sanitizeSetupConfig(config)).not.toThrow();
  });

  /**
   * Validates: Requirements 2.5, 2.6
   *
   * 幂等性：多次调用 sanitizeSetupConfig 结果应一致
   */
  test('幂等性: 多次调用结果应一致', () => {
    fc.assert(
      fc.property(
        configWithAllIncompatibleFieldsArb(),
        (config) => {
          const result1 = sanitizeSetupConfig(config);
          const result2 = sanitizeSetupConfig(result1);

          // 两次调用结果应完全相同
          expect(result2).toEqual(result1);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 2.5, 2.6
   *
   * 不可变性：sanitizeSetupConfig 不应修改原始输入对象
   */
  test('不可变性: 不应修改原始输入对象', () => {
    const config = {
      skills: { install: { recommended: true } },
      daemon: { install: true },
    };
    // 深拷贝原始对象用于比较
    const originalCopy = JSON.parse(JSON.stringify(config));

    sanitizeSetupConfig(config);

    // 原始对象不应被修改
    expect(config).toEqual(originalCopy);
  });
});

// ============================================================
// Property 5: Preservation 保持性测试
// Feature: setup-wizard-init-bugfix
//
// 验证 sanitizeSetupConfig 完整保留所有 schema 兼容字段。
// 这些测试在修复前后都应通过（确认基线行为）。
// ============================================================

describe('Feature: setup-wizard-init-bugfix, Property 5: Preservation 保持性测试', () => {
  /**
   * Validates: Requirements 3.6
   *
   * 保持性：gateway.port 应被完整保留
   */
  test('gateway.port 应被完整保留', () => {
    fc.assert(
      fc.property(
        portArb(),
        (port) => {
          const config = { gateway: { port } };
          const result = sanitizeSetupConfig(config);

          const gateway = result.gateway as Record<string, unknown>;
          expect(gateway.port).toBe(port);
        },
      ),
      { numRuns: 200 },
    );
  });

  /**
   * Validates: Requirements 3.6
   *
   * 保持性：gateway.auth（object 类型）应被完整保留
   * manifest 中 gateway.auth.mode 是合法字段
   */
  test('gateway.auth object 应被完整保留', () => {
    const config = { gateway: { auth: { mode: 'token' } } };
    const result = sanitizeSetupConfig(config);

    const gateway = result.gateway as Record<string, unknown>;
    expect(gateway.auth).toEqual({ mode: 'token' });
  });

  /**
   * Validates: Requirements 3.6
   *
   * 保持性：gateway.bind 应被完整保留
   */
  test('gateway.bind 应被完整保留', () => {
    fc.assert(
      fc.property(
        nonEmptyStringArb(),
        (bind) => {
          const config = { gateway: { bind } };
          const result = sanitizeSetupConfig(config);

          const gateway = result.gateway as Record<string, unknown>;
          expect(gateway.bind).toBe(bind);
        },
      ),
      { numRuns: 200 },
    );
  });

  /**
   * Validates: Requirements 3.6
   *
   * 保持性：session.dmScope 应被完整保留
   */
  test('session.dmScope 应被完整保留', () => {
    fc.assert(
      fc.property(
        nonEmptyStringArb(),
        (dmScope) => {
          const config = { session: { dmScope } };
          const result = sanitizeSetupConfig(config);

          const session = result.session as Record<string, unknown>;
          expect(session.dmScope).toBe(dmScope);
        },
      ),
      { numRuns: 200 },
    );
  });

  /**
   * Validates: Requirements 3.6
   *
   * 保持性：channels 字段（任意 JSON 兼容值）应被完整保留
   */
  test('channels 字段应被完整保留', () => {
    fc.assert(
      fc.property(
        jsonCompatibleArb(),
        (channels) => {
          const config = { channels };
          const result = sanitizeSetupConfig(config);

          expect(JSON.stringify(result.channels)).toBe(JSON.stringify(channels));
        },
      ),
      { numRuns: 200 },
    );
  });

  /**
   * Validates: Requirements 3.6
   *
   * 保持性：agents 字段（任意 JSON 兼容值）应被完整保留
   */
  test('agents 字段应被完整保留', () => {
    fc.assert(
      fc.property(
        jsonCompatibleArb(),
        (agents) => {
          const config = { agents };
          const result = sanitizeSetupConfig(config);

          expect(JSON.stringify(result.agents)).toBe(JSON.stringify(agents));
        },
      ),
      { numRuns: 200 },
    );
  });

  /**
   * Validates: Requirements 3.4, 3.6
   *
   * 保持性：包含所有 schema 兼容字段的完整配置应被完整保留
   */
  test('包含所有 schema 兼容字段的完整配置应被完整保留', () => {
    fc.assert(
      fc.property(
        compatibleConfigArb(),
        (config) => {
          const result = sanitizeSetupConfig(config);

          // 验证 gateway 兼容字段
          const inputGateway = config.gateway as Record<string, unknown>;
          const resultGateway = result.gateway as Record<string, unknown>;
          expect(resultGateway.port).toBe(inputGateway.port);
          expect(resultGateway.auth).toBe(inputGateway.auth);
          expect(resultGateway.bind).toBe(inputGateway.bind);

          // 验证 session.dmScope
          const inputSession = config.session as Record<string, unknown>;
          const resultSession = result.session as Record<string, unknown>;
          expect(resultSession.dmScope).toBe(inputSession.dmScope);

          // 验证 channels 和 agents（通过 JSON 字符串比较，对齐序列化行为）
          expect(JSON.stringify(result.channels)).toBe(JSON.stringify(config.channels));
          expect(JSON.stringify(result.agents)).toBe(JSON.stringify(config.agents));
        },
      ),
      { numRuns: 200 },
    );
  });

  /**
   * Validates: Requirements 3.4, 3.6
   *
   * 保持性具体案例：模拟真实 done 子步骤中的 schema 兼容字段
   */
  test('具体案例: 真实 schema 兼容字段应被完整保留', () => {
    const config = {
      gateway: {
        port: 9090,
        auth: { mode: 'token' }, // 合法：gateway.auth.mode
        bind: 'loopback',
      },
      session: {
        dmScope: 'workspace',
      },
      channels: [{ type: 'telegram', token: 'bot-token' }],
      agents: { defaults: { model: 'gpt-4' } },
    };

    const result = sanitizeSetupConfig(config);

    // 所有兼容字段应被完整保留
    const gateway = result.gateway as Record<string, unknown>;
    expect(gateway.port).toBe(9090);
    expect(gateway.auth).toEqual({ mode: 'token' });
    expect(gateway.bind).toBe('loopback');

    const session = result.session as Record<string, unknown>;
    expect(session.dmScope).toBe('workspace');

    expect(result.channels).toEqual([{ type: 'telegram', token: 'bot-token' }]);
    expect(result.agents).toEqual({ defaults: { model: 'gpt-4' } });
  });

  /**
   * Validates: Requirements 3.4, 3.6
   *
   * 保持性：空配置对象不应报错，且输出为空对象
   */
  test('空配置对象应返回空对象', () => {
    const result = sanitizeSetupConfig({});
    expect(result).toEqual({});
  });

  /**
   * Validates: Requirements 3.4, 3.6
   *
   * 保持性：兼容字段与不兼容字段混合时，兼容字段应被保留，不兼容字段应被删除
   */
  test('兼容字段与不兼容字段混合时，兼容字段应被保留', () => {
    fc.assert(
      fc.property(
        compatibleConfigArb(),
        fc.anything(), // recommended 值
        fc.anything(), // daemon 值
        (compatibleConfig, recommended, daemon) => {
          // 在兼容配置基础上添加不兼容字段
          const mixedConfig = {
            ...compatibleConfig,
            skills: {
              install: {
                recommended, // 不兼容字段
              },
            },
            daemon, // 不兼容字段
          };

          const result = sanitizeSetupConfig(mixedConfig);

          // 验证兼容字段被保留
          const inputGateway = compatibleConfig.gateway as Record<string, unknown>;
          const resultGateway = result.gateway as Record<string, unknown>;
          expect(resultGateway.port).toBe(inputGateway.port);
          expect(resultGateway.auth).toBe(inputGateway.auth);
          expect(resultGateway.bind).toBe(inputGateway.bind);

          const inputSession = compatibleConfig.session as Record<string, unknown>;
          const resultSession = result.session as Record<string, unknown>;
          expect(resultSession.dmScope).toBe(inputSession.dmScope);

          expect(JSON.stringify(result.channels)).toBe(JSON.stringify(compatibleConfig.channels));
          expect(JSON.stringify(result.agents)).toBe(JSON.stringify(compatibleConfig.agents));

          // 验证不兼容字段被删除
          expect('daemon' in result).toBe(false);
          if (result.skills !== null && typeof result.skills === 'object') {
            const skills = result.skills as Record<string, unknown>;
            if (skills.install !== null && typeof skills.install === 'object') {
              const install = skills.install as Record<string, unknown>;
              expect('recommended' in install).toBe(false);
            }
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
