/**
 * 属性测试：模型连通性测试 Preservation（行为保持）
 * Feature: model-connectivity-test-fix
 *
 * 本测试在未修复代码上运行时预期通过，确认以下基线行为需要保持：
 * - Property 2a: 已有 endpointMap 中 11 个 provider 的 URL 映射不变
 * - Property 2b: 自定义 effectiveBaseUrl 优先级不变
 * - Property 2c: stripTrailingSlash 函数行为不变
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4
 */

import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  buildModelTestUrl,
  stripTrailingSlash,
  endpointMap,
} from '../modelTestLogic';

// ── 常量定义 ──────────────────────────────────────────────────────────

/** 原始 endpointMap 中的 11 个 provider 及其期望 URL（观察阶段记录） */
const ORIGINAL_ENDPOINT_MAP: Record<string, string> = {
  openai: 'https://api.openai.com/v1/chat/completions',
  anthropic: 'https://api.anthropic.com/v1/messages',
  google:
    'https://generativelanguage.googleapis.com/v1beta/chat/completions',
  moonshot: 'https://api.moonshot.cn/v1/chat/completions',
  deepseek: 'https://api.deepseek.com/v1/chat/completions',
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
  glm: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
  groq: 'https://api.groq.com/openai/v1/chat/completions',
  mistral: 'https://api.mistral.ai/v1/chat/completions',
  xai: 'https://api.x.ai/v1/chat/completions',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
};

/** 原始 11 个 provider 名称列表 */
const ORIGINAL_PROVIDER_NAMES = Object.keys(ORIGINAL_ENDPOINT_MAP);

// ── 生成器（Arbitraries）──────────────────────────────────────────────

/** 生成原始 endpointMap 中的 provider 名称 */
const originalProviderArb = (): fc.Arbitrary<string> =>
  fc.constantFrom(...ORIGINAL_PROVIDER_NAMES);

/**
 * 生成合法的 HTTP/HTTPS URL 字符串（用于 effectiveBaseUrl 测试）
 * 使用 fc.webUrl() 生成随机 URL
 */
const baseUrlArb = (): fc.Arbitrary<string> =>
  fc.webUrl({ withFragments: false, withQueryParameters: false });

// ============================================================
// Property 2a: 已有 endpointMap 中 11 个 provider 的 URL 映射不变
// ============================================================

describe('Property 2a: 已有 endpointMap provider 映射保持不变', () => {
  /**
   * **Validates: Requirements 3.2**
   *
   * 属性测试：对所有 11 个已有 endpointMap 中的 provider，
   * buildModelTestUrl 在无 baseUrl 时返回与原始 endpointMap 完全一致的 URL
   */
  test('对所有 11 个已有 provider，buildModelTestUrl 返回原始 endpointMap 中的 URL', () => {
    fc.assert(
      fc.property(originalProviderArb(), (provider) => {
        const expectedUrl = ORIGINAL_ENDPOINT_MAP[provider];
        const actualUrl = buildModelTestUrl({ providerPrefix: provider });

        // 返回的 URL 应与原始 endpointMap 完全一致
        expect(actualUrl).toBe(expectedUrl);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 3.2**
   *
   * 验证 endpointMap 导出对象中包含所有 11 个原始 provider 的映射
   */
  test('endpointMap 包含所有 11 个原始 provider 映射', () => {
    fc.assert(
      fc.property(originalProviderArb(), (provider) => {
        // endpointMap 应包含该 provider
        expect(endpointMap).toHaveProperty(provider);
        // 映射值应与观察到的 URL 一致
        expect(endpointMap[provider]).toBe(ORIGINAL_ENDPOINT_MAP[provider]);
      }),
      { numRuns: 100 },
    );
  });
});

// ============================================================
// Property 2b: 自定义 effectiveBaseUrl 优先级不变
// ============================================================

describe('Property 2b: 自定义 effectiveBaseUrl 优先级保持不变', () => {
  /**
   * **Validates: Requirements 3.3**
   *
   * 属性测试：对任意非空 effectiveBaseUrl，buildModelTestUrl 返回
   * ${stripTrailingSlash(baseUrl)}/chat/completions，不受 endpointMap 变更影响
   */
  test('有 effectiveBaseUrl 时，返回 stripTrailingSlash(baseUrl)/chat/completions', () => {
    fc.assert(
      fc.property(baseUrlArb(), (baseUrl) => {
        const result = buildModelTestUrl({
          effectiveBaseUrl: baseUrl,
          providerPrefix: 'any',
        });

        const expected = `${stripTrailingSlash(baseUrl)}/chat/completions`;
        expect(result).toBe(expected);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 3.3**
   *
   * 属性测试：即使 providerPrefix 是已有 endpointMap 中的 provider，
   * 有 effectiveBaseUrl 时仍优先使用 baseUrl 构建 URL
   */
  test('effectiveBaseUrl 优先于 endpointMap 中的 provider 映射', () => {
    fc.assert(
      fc.property(
        baseUrlArb(),
        originalProviderArb(),
        (baseUrl, provider) => {
          const result = buildModelTestUrl({
            effectiveBaseUrl: baseUrl,
            providerPrefix: provider,
          });

          // 应使用 baseUrl 而非 endpointMap 中的 URL
          const expected = `${stripTrailingSlash(baseUrl)}/chat/completions`;
          expect(result).toBe(expected);
          // 不应返回 endpointMap 中的 URL（除非 baseUrl 恰好匹配，概率极低）
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 3.3**
   *
   * 尾部斜杠的 baseUrl 应被正确处理：
   * stripTrailingSlash 仅去除最后一个斜杠，buildModelTestUrl 使用其结果拼接
   */
  test('尾部带斜杠的 baseUrl 经 stripTrailingSlash 处理后拼接', () => {
    fc.assert(
      fc.property(baseUrlArb(), (baseUrl) => {
        // 确保 baseUrl 以斜杠结尾
        const urlWithSlash = baseUrl.endsWith('/')
          ? baseUrl
          : `${baseUrl}/`;

        const result = buildModelTestUrl({
          effectiveBaseUrl: urlWithSlash,
          providerPrefix: 'any',
        });

        // 应与 stripTrailingSlash 处理后拼接的结果一致
        const expected = `${stripTrailingSlash(urlWithSlash)}/chat/completions`;
        expect(result).toBe(expected);
      }),
      { numRuns: 100 },
    );
  });
});

// ============================================================
// Property 2c: stripTrailingSlash 函数行为不变
// ============================================================

describe('Property 2c: stripTrailingSlash 函数行为保持不变', () => {
  /**
   * **Validates: Requirements 3.3**
   *
   * 属性测试：对任意以斜杠结尾的字符串，stripTrailingSlash 去除尾部斜杠
   */
  test('对以斜杠结尾的字符串，去除尾部斜杠', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).map((s) => `${s}/`),
        (input) => {
          const result = stripTrailingSlash(input);
          // 结果不应以斜杠结尾（除非原始字符串只有一个斜杠且去除后为空）
          expect(result).toBe(input.slice(0, -1));
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 3.3**
   *
   * 属性测试：对任意不以斜杠结尾的字符串，stripTrailingSlash 原样返回
   */
  test('对不以斜杠结尾的字符串，原样返回', () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => !s.endsWith('/')),
        (input) => {
          const result = stripTrailingSlash(input);
          expect(result).toBe(input);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 3.3**
   *
   * 属性测试：stripTrailingSlash 的幂等性——连续调用两次结果不变
   */
  test('stripTrailingSlash 具有幂等性', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const once = stripTrailingSlash(input);
        const twice = stripTrailingSlash(once);
        expect(twice).toBe(once);
      }),
      { numRuns: 100 },
    );
  });
});
