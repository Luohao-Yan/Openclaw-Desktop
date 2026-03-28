/**
 * 属性测试：模型连通性测试 Bug 条件探索
 * Feature: model-connectivity-test-fix
 *
 * Bug Condition 1: resolveApiKey 函数尚不存在，环境变量引用（${VAR_NAME}）未被解析
 * Bug Condition 2: endpointMap 缺少 9 个已知 provider 的 URL 映射，fallback 到无效域名
 *
 * 本测试在未修复代码上运行时预期失败，以确认 bug 存在。
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 2.1, 2.2, 2.3
 */

import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';
import { buildModelTestUrl, endpointMap, resolveApiKey } from '../modelTestLogic';

// ── 常量定义 ──────────────────────────────────────────────────────────

/** 9 个缺失 endpointMap 映射的 provider 及其期望的正确 URL */
const MISSING_PROVIDERS: Record<string, string> = {
  volcengine: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
  'volcengine-plan': 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
  byteplus: 'https://ark.ap-southeast.bytepluses.com/api/v3/chat/completions',
  'byteplus-plan': 'https://ark.ap-southeast.bytepluses.com/api/v3/chat/completions',
  cerebras: 'https://api.cerebras.ai/v1/chat/completions',
  kilocode: 'https://api.kilo.ai/api/gateway/chat/completions',
  huggingface: 'https://api-inference.huggingface.co/v1/chat/completions',
  zai: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
  minimax: 'https://api.minimax.chat/v1/text/chatcompletion_v2',
};

/** 缺失 provider 名称列表 */
const MISSING_PROVIDER_NAMES = Object.keys(MISSING_PROVIDERS);

// ── 生成器（Arbitraries）──────────────────────────────────────────────

/** 生成缺失 provider 名称 */
const missingProviderArb = (): fc.Arbitrary<string> =>
  fc.constantFrom(...MISSING_PROVIDER_NAMES);

/** 生成合法的环境变量名（字母/下划线开头，后跟字母/数字/下划线） */
const envVarNameArb = (): fc.Arbitrary<string> =>
  fc.stringMatching(/^[A-Z][A-Z0-9_]{2,20}$/);

// ============================================================
// Bug Condition 1: resolveApiKey 环境变量引用未解析
// ============================================================

describe('Bug Condition 1: resolveApiKey 环境变量引用解析', () => {
  /**
   * Validates: Requirements 2.1
   *
   * 当 apiKey 为 ${VAR_NAME} 格式且对应环境变量已设置时，
   * resolveApiKey 应返回 { resolved: 实际密钥值 }
   */
  test('resolveApiKey 应存在且能解析 ${VAR_NAME} 格式的环境变量引用', () => {
    // 首先验证函数存在
    expect(resolveApiKey).toBeDefined();
    expect(typeof resolveApiKey).toBe('function');

    if (!resolveApiKey) return;

    // 设置测试环境变量
    const originalEnv = process.env.VOLCES_API_KEY;
    process.env.VOLCES_API_KEY = 'ark-xxx';

    try {
      const result = resolveApiKey('${VOLCES_API_KEY}');
      expect(result).toEqual({ resolved: 'ark-xxx' });
    } finally {
      // 恢复环境变量
      if (originalEnv === undefined) {
        delete process.env.VOLCES_API_KEY;
      } else {
        process.env.VOLCES_API_KEY = originalEnv;
      }
    }
  });

  /**
   * Validates: Requirements 2.3
   *
   * 当 apiKey 为 ${VAR_NAME} 格式但对应环境变量未设置时，
   * resolveApiKey 应返回 { resolved: null, error: "环境变量 VAR_NAME 未设置" }
   */
  test('resolveApiKey 对未设置的环境变量应返回明确错误信息', () => {
    expect(resolveApiKey).toBeDefined();
    if (!resolveApiKey) return;

    const result = resolveApiKey('${MISSING_VAR}');
    expect(result).toEqual({
      resolved: null,
      error: '环境变量 MISSING_VAR 未设置',
    });
  });

  /**
   * Validates: Requirements 2.1
   *
   * 属性测试：对任意合法环境变量名，当环境变量已设置时，
   * resolveApiKey("${VAR_NAME}") 应返回 { resolved: 实际值 }
   */
  test('对任意已设置的环境变量，resolveApiKey 应正确解析 ${VAR} 格式', () => {
    expect(resolveApiKey).toBeDefined();
    if (!resolveApiKey) return;

    fc.assert(
      fc.property(
        envVarNameArb(),
        fc.string({ minLength: 1, maxLength: 50 }),
        (varName, value) => {
          const originalEnv = process.env[varName];
          process.env[varName] = value;

          try {
            const result = resolveApiKey!(`\${${varName}}`);
            expect(result.resolved).toBe(value);
            expect(result.error).toBeUndefined();
          } finally {
            if (originalEnv === undefined) {
              delete process.env[varName];
            } else {
              process.env[varName] = originalEnv;
            }
          }
        },
      ),
      { numRuns: 50 },
    );
  });

  /**
   * Validates: Requirements 2.3
   *
   * 属性测试：对任意合法环境变量名，当环境变量未设置时，
   * resolveApiKey("${VAR_NAME}") 应返回包含错误信息的结果
   */
  test('对任意未设置的环境变量，resolveApiKey 应返回错误信息', () => {
    expect(resolveApiKey).toBeDefined();
    if (!resolveApiKey) return;

    fc.assert(
      fc.property(envVarNameArb(), (varName) => {
        // 确保环境变量未设置
        const originalEnv = process.env[varName];
        delete process.env[varName];

        try {
          const result = resolveApiKey!(`\${${varName}}`);
          expect(result.resolved).toBeNull();
          expect(result.error).toBe(`环境变量 ${varName} 未设置`);
        } finally {
          if (originalEnv !== undefined) {
            process.env[varName] = originalEnv;
          }
        }
      }),
      { numRuns: 50 },
    );
  });
});

// ============================================================
// Bug Condition 2: endpointMap 缺失 provider 映射
// ============================================================

describe('Bug Condition 2: endpointMap 缺失 provider 映射', () => {
  /**
   * Validates: Requirements 2.2
   *
   * volcengine provider 应映射到正确的火山引擎 API 端点，
   * 而非 fallback 的 https://api.volcengine.com/v1/chat/completions
   */
  test('volcengine 应映射到火山引擎正确端点，而非 fallback URL', () => {
    const url = buildModelTestUrl({ providerPrefix: 'volcengine' });
    expect(url).toBe('https://ark.cn-beijing.volces.com/api/v3/chat/completions');
    expect(url).not.toBe('https://api.volcengine.com/v1/chat/completions');
  });

  /**
   * Validates: Requirements 2.2
   *
   * 属性测试：对所有 9 个缺失 provider，buildModelTestUrl 在无 baseUrl 时
   * 应返回正确的 API 端点 URL，而非 fallback 模式
   */
  test('所有缺失 provider 应在 endpointMap 中有正确映射', () => {
    fc.assert(
      fc.property(missingProviderArb(), (provider) => {
        const expectedUrl = MISSING_PROVIDERS[provider];
        const actualUrl = buildModelTestUrl({ providerPrefix: provider });

        // 应返回正确的 API 端点 URL
        expect(actualUrl).toBe(expectedUrl);

        // 不应 fallback 到通用模式
        const fallbackUrl = `https://api.${provider}.com/v1/chat/completions`;
        expect(actualUrl).not.toBe(fallbackUrl);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 2.2
   *
   * 属性测试：所有 9 个缺失 provider 应存在于 endpointMap 中
   */
  test('所有 9 个缺失 provider 应存在于 endpointMap 映射表中', () => {
    fc.assert(
      fc.property(missingProviderArb(), (provider) => {
        // endpointMap 应包含该 provider
        expect(endpointMap).toHaveProperty(provider);
        // 映射值应与期望 URL 一致
        expect(endpointMap[provider]).toBe(MISSING_PROVIDERS[provider]);
      }),
      { numRuns: 100 },
    );
  });
});
