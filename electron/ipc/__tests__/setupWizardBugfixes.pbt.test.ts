/**
 * 属性测试：设置向导三合一 Bugfix - Bug Condition 探索
 * Feature: setup-wizard-bugfixes
 * 覆盖 Property 1: Bug Condition - 自定义 Base URL 拼接错误 & CLI schema 错误信息未友好化
 *
 * 本测试编码的是 **期望行为（正确行为）**：
 * - 对于有 effectiveBaseUrl 且不以 /v1 结尾的输入，buildModelTestUrl 应返回
 *   stripTrailingSlash(effectiveBaseUrl) + "/chat/completions"
 * - 对于 schema 类型的 CLI 错误，formatAgentCreateError 不应包含原始 schema 术语
 *
 * 在未修复代码上运行时，测试应 **失败**（证明 bug 存在）。
 * 修复后运行时，测试应 **通过**（证明 bug 已修复）。
 */

import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  buildModelTestUrl,
  stripTrailingSlash,
} from '../modelTestLogic';
import {
  classifyAgentError,
  formatAgentCreateError,
} from '../agentCreateLogic';

// ── 生成器（Arbitraries）──────────────────────────────────────────────────

/**
 * 生成合法的域名片段（小写字母和数字）
 */
const domainSegmentArb = (): fc.Arbitrary<string> =>
  fc.string({
    minLength: 2,
    maxLength: 10,
    unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')),
  });

/**
 * 生成不以 /v1 结尾的版本路径段
 * 这些路径会触发 Bug 1
 */
const nonV1VersionPathArb = (): fc.Arbitrary<string> =>
  fc.constantFrom(
    '/v2',
    '/v3',
    '/v4',
    '/v1beta',
    '/v1beta1',
    '/v2beta',
    '/api/v3',
    '/api/paas/v4',
    '/api/v1beta',
    '',  // 无版本路径（如 localhost:11434）
  );

/**
 * 生成自定义 Base URL（不以 /v1 结尾）
 * 这些 URL 会触发 Bug 1：系统会错误地插入 /v1
 */
const buggyBaseUrlArb = (): fc.Arbitrary<string> =>
  fc.tuple(
    fc.constantFrom('https', 'http'),
    domainSegmentArb(),
    fc.constantFrom('.com', '.cn', '.ai', '.io'),
    nonV1VersionPathArb(),
    fc.boolean(), // 是否带尾部斜杠
  ).map(([scheme, domain, tld, versionPath, trailingSlash]) => {
    const base = `${scheme}://${domain}${tld}${versionPath}`;
    return trailingSlash ? `${base}/` : base;
  });

/**
 * 生成包含 schema 错误关键词的 CLI stderr 输出
 * 这些输出会触发 Bug 3
 */
const schemaErrorStderrArb = (): fc.Arbitrary<string> =>
  fc.constantFrom(
    'Error: invalid dmScope value "invalid" in openclaw.json',
    'Error: unrecognized keys in config: tailscale, dmScope',
    'ZodError: validation failed for openclaw.json schema',
    'Error: invalid_type at "dmScope": expected string, received number',
    'unrecognized_keys: ["tailscale", "legacyField"]',
    'schema validation failed: invalid dmScope',
  );

// ── 原始 schema 术语列表（不应出现在友好错误信息中）──────────────────────

const RAW_SCHEMA_TERMS = [
  'unrecognized keys',
  'invalid dmScope',
  'invalid_type',
  'unrecognized_keys',
  'ZodError',
  'validation failed',
];

// ============================================================
// Property 1: Bug Condition 探索
// Feature: setup-wizard-bugfixes
// ============================================================

describe('Feature: setup-wizard-bugfixes, Property 1: Bug Condition 探索', () => {
  /**
   * Validates: Requirements 1.1, 1.2
   *
   * Bug 1 测试：自定义 Base URL 不以 /v1 结尾时，
   * buildModelTestUrl 应返回 stripTrailingSlash(baseUrl) + "/chat/completions"
   *
   * 在未修复代码上，函数会返回 base + "/v1/chat/completions"（多了 /v1），
   * 导致测试失败 → 证明 Bug 存在
   */
  test('Bug 1: 自定义 Base URL（非 /v1 结尾）应直接追加 /chat/completions，不插入 /v1', () => {
    fc.assert(
      fc.property(
        buggyBaseUrlArb(),
        domainSegmentArb(), // providerPrefix（此场景下不影响结果）
        (baseUrl, provider) => {
          const result = buildModelTestUrl({
            effectiveBaseUrl: baseUrl,
            providerPrefix: provider,
          });

          // 期望行为：去除尾部斜杠后直接追加 /chat/completions
          const expected = stripTrailingSlash(baseUrl) + '/chat/completions';

          // 未修复代码会返回 base + "/v1/chat/completions"，断言将失败
          expect(result).toBe(expected);
        },
      ),
      { numRuns: 200 },
    );
  });

  /**
   * Validates: Requirements 1.1, 1.2
   *
   * Bug 1 具体案例：火山引擎 /v3 路径
   */
  test('Bug 1 案例: 火山引擎 /v3 URL 不应插入 /v1', () => {
    const result = buildModelTestUrl({
      effectiveBaseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
      providerPrefix: 'volcengine',
    });

    // 期望：.../api/v3/chat/completions
    // 未修复代码返回：.../api/v3/v1/chat/completions
    expect(result).toBe(
      'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
    );
  });

  /**
   * Validates: Requirements 1.1, 1.2
   *
   * Bug 1 具体案例：智谱 /v4 路径
   */
  test('Bug 1 案例: 智谱 /v4 URL 不应插入 /v1', () => {
    const result = buildModelTestUrl({
      effectiveBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      providerPrefix: 'glm',
    });

    // 期望：.../api/paas/v4/chat/completions
    // 未修复代码返回：.../api/paas/v4/v1/chat/completions
    expect(result).toBe(
      'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    );
  });

  /**
   * Validates: Requirements 1.1, 1.2
   *
   * Bug 1 具体案例：Ollama 本地模型无版本路径
   */
  test('Bug 1 案例: Ollama localhost URL 不应插入 /v1', () => {
    const result = buildModelTestUrl({
      effectiveBaseUrl: 'http://localhost:11434',
      providerPrefix: 'ollama',
    });

    // 期望：http://localhost:11434/chat/completions
    // 未修复代码返回：http://localhost:11434/v1/chat/completions
    expect(result).toBe('http://localhost:11434/chat/completions');
  });

  /**
   * Validates: Requirements 1.5, 1.6
   *
   * Bug 3 测试：schema 类型的 CLI 错误，formatAgentCreateError
   * 不应包含原始 schema 术语，应返回友好提示
   *
   * 在未修复代码上，函数直接返回原始 stderr，
   * 导致测试失败 → 证明 Bug 存在
   */
  test('Bug 3: schema 错误信息不应包含原始 schema 术语', () => {
    fc.assert(
      fc.property(schemaErrorStderrArb(), (stderr) => {
        // 先确认这确实是 schema 类型错误
        const errorType = classifyAgentError(stderr);
        expect(errorType).toBe('schema');

        // 获取格式化后的错误信息
        const friendlyMsg = formatAgentCreateError(stderr, errorType);

        // 期望行为：友好错误信息不应包含任何原始 schema 术语
        // 未修复代码直接返回原始 stderr，断言将失败
        for (const term of RAW_SCHEMA_TERMS) {
          expect(friendlyMsg.toLowerCase()).not.toContain(term.toLowerCase());
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 1.5, 1.6
   *
   * Bug 3 具体案例：invalid dmScope 错误
   */
  test('Bug 3 案例: "invalid dmScope" 错误应返回友好提示', () => {
    const stderr = 'Error: invalid dmScope value "invalid" in openclaw.json';
    const errorType = classifyAgentError(stderr);
    const friendlyMsg = formatAgentCreateError(stderr, errorType);

    // 期望：友好提示不包含 "invalid dmScope"
    // 未修复代码直接返回原始 stderr
    expect(friendlyMsg.toLowerCase()).not.toContain('invalid dmscope');
  });

  /**
   * Validates: Requirements 1.5, 1.6
   *
   * Bug 3 具体案例：unrecognized keys 错误
   */
  test('Bug 3 案例: "unrecognized keys" 错误应返回友好提示', () => {
    const stderr =
      'Error: unrecognized keys in config: tailscale, dmScope';
    const errorType = classifyAgentError(stderr);
    const friendlyMsg = formatAgentCreateError(stderr, errorType);

    // 期望：友好提示不包含 "unrecognized keys"
    // 未修复代码直接返回原始 stderr
    expect(friendlyMsg.toLowerCase()).not.toContain('unrecognized keys');
  });
});


// ============================================================
// Property 2: Preservation 保持性测试
// Feature: setup-wizard-bugfixes
//
// 这些测试验证修复 Bug 后必须保持不变的行为。
// 在未修复代码上运行时，测试应 **通过**（确认基线行为）。
// ============================================================

import {
  endpointMap,
} from '../modelTestLogic';
import {
  buildAgentCreateArgs,
} from '../agentCreateLogic';

// ── 保持性测试专用生成器 ──────────────────────────────────────────────────

/**
 * 已知 provider 列表（endpointMap 中的所有 key）
 */
const KNOWN_PROVIDERS = [
  'openai', 'anthropic', 'google', 'moonshot', 'deepseek',
  'qwen', 'glm', 'groq', 'mistral', 'xai', 'openrouter',
] as const;

/**
 * 生成已知 provider 名称
 */
const knownProviderArb = (): fc.Arbitrary<string> =>
  fc.constantFrom(...KNOWN_PROVIDERS);

/**
 * 生成随机未知 provider 名称（不在 endpointMap 中）
 * 仅使用小写字母，确保不会意外匹配已知 provider
 */
const unknownProviderArb = (): fc.Arbitrary<string> =>
  fc.string({
    minLength: 3,
    maxLength: 12,
    unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')),
  }).filter((s) => !(s in endpointMap));

/**
 * 生成以 /v1 结尾的 Base URL
 * 这些 URL 在当前有 Bug 的代码中也能正确处理
 */
const v1BaseUrlArb = (): fc.Arbitrary<string> =>
  fc.tuple(
    fc.constantFrom('https', 'http'),
    domainSegmentArb(),
    fc.constantFrom('.com', '.cn', '.ai', '.io'),
    fc.constantFrom('', '/api', '/openai'), // 可选路径前缀
  ).map(([scheme, domain, tld, prefix]) =>
    `${scheme}://${domain}${tld}${prefix}/v1`,
  );

/**
 * 生成非空可打印字符串（用于 agent 参数）
 * 排除纯空白字符串，确保 trim 后非空
 */
const nonEmptyPrintableArb = (): fc.Arbitrary<string> =>
  fc.string({ minLength: 1, maxLength: 30 })
    .filter((s) => s.trim().length > 0);

/**
 * 生成不包含任何 schema 错误关键词的错误字符串
 * 同时排除网络和权限关键词，确保分类为 'unknown'
 * 或者明确包含网络/权限关键词以测试非 schema 分类
 */
const nonSchemaErrorArb = (): fc.Arbitrary<string> => {
  // schema 关键词列表（与 agentCreateLogic.ts 中一致）
  const schemaKeywords = [
    'unrecognized keys', 'invalid dmscope', 'invalid_type',
    'unrecognized_keys', 'schema', 'validation failed', 'zoderror',
  ];

  return fc.string({ minLength: 1, maxLength: 80 })
    .filter((s) => {
      const lower = s.toLowerCase();
      // 排除所有 schema 关键词
      return !schemaKeywords.some((kw) => lower.includes(kw));
    });
};

/**
 * 生成明确的网络/权限错误字符串（非 schema 类型）
 */
const specificNonSchemaErrorArb = (): fc.Arbitrary<string> =>
  fc.constantFrom(
    'Error: network timeout after 30s',
    'ECONNREFUSED 127.0.0.1:8080',
    'Error: ENOTFOUND api.example.com',
    'Error: permission denied /usr/local/bin/openclaw',
    'EACCES: permission denied, open /etc/openclaw.json',
    'EPERM: operation not permitted',
    'command not found: openclaw',
    'exit code 127',
    'segmentation fault',
    'out of memory',
  );

describe('Feature: setup-wizard-bugfixes, Property 2: Preservation 保持性测试', () => {
  // ── 2.1 endpointMap 保持测试 ──────────────────────────────────────────

  /**
   * Validates: Requirements 3.1, 3.2
   *
   * 保持性：无 effectiveBaseUrl 时，已知 provider 应返回 endpointMap 中的值
   * 此行为在修复前后必须一致
   */
  test('已知 provider 无 effectiveBaseUrl 时应返回 endpointMap 对应值', () => {
    fc.assert(
      fc.property(knownProviderArb(), (provider) => {
        const result = buildModelTestUrl({
          providerPrefix: provider,
        });

        // 无 effectiveBaseUrl 时，应直接返回 endpointMap 中的映射值
        expect(result).toBe(endpointMap[provider]);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 3.1, 3.2
   *
   * 保持性：无 effectiveBaseUrl 时，未知 provider 应返回默认模式 URL
   * 默认模式：https://api.${provider}.com/v1/chat/completions
   */
  test('未知 provider 无 effectiveBaseUrl 时应返回默认模式 URL', () => {
    fc.assert(
      fc.property(unknownProviderArb(), (provider) => {
        const result = buildModelTestUrl({
          providerPrefix: provider,
        });

        // 未知 provider 应使用默认模式
        const expected = `https://api.${provider}.com/v1/chat/completions`;
        expect(result).toBe(expected);
      }),
      { numRuns: 200 },
    );
  });

  // ── 2.2 Base URL 以 /v1 结尾的保持测试 ────────────────────────────────

  /**
   * Validates: Requirements 3.1, 3.2
   *
   * 保持性：effectiveBaseUrl 以 /v1 结尾时，应返回 base + "/chat/completions"
   * 此行为在当前有 Bug 的代码中已经正确，修复后必须保持
   */
  test('effectiveBaseUrl 以 /v1 结尾时应返回 base + "/chat/completions"', () => {
    fc.assert(
      fc.property(
        v1BaseUrlArb(),
        domainSegmentArb(), // providerPrefix（此场景下不影响结果）
        (baseUrl, provider) => {
          const result = buildModelTestUrl({
            effectiveBaseUrl: baseUrl,
            providerPrefix: provider,
          });

          // 以 /v1 结尾的 URL 应直接追加 /chat/completions
          const expected = `${stripTrailingSlash(baseUrl)}/chat/completions`;
          expect(result).toBe(expected);
        },
      ),
      { numRuns: 200 },
    );
  });

  // ── 2.3 buildAgentCreateArgs 保持测试 ──────────────────────────────────

  /**
   * Validates: Requirements 3.7, 3.8
   *
   * 保持性：无 model 参数时，buildAgentCreateArgs 应生成正确的基础 CLI 参数
   */
  test('无 model 时 buildAgentCreateArgs 应生成正确的基础参数', () => {
    fc.assert(
      fc.property(
        nonEmptyPrintableArb(), // name
        nonEmptyPrintableArb(), // workspace
        (name, workspace) => {
          const result = buildAgentCreateArgs({ name, workspace });

          // 验证基础参数结构
          const expected = [
            'agents', 'add', name.trim(),
            '--workspace', workspace.trim(),
            '--non-interactive', '--json',
          ];
          expect(result).toEqual(expected);
        },
      ),
      { numRuns: 200 },
    );
  });

  /**
   * Validates: Requirements 3.7, 3.8
   *
   * 保持性：有 model 参数时，buildAgentCreateArgs 应在基础参数后追加 --model
   */
  test('有 model 时 buildAgentCreateArgs 应追加 --model 参数', () => {
    fc.assert(
      fc.property(
        nonEmptyPrintableArb(), // name
        nonEmptyPrintableArb(), // workspace
        nonEmptyPrintableArb(), // model
        (name, workspace, model) => {
          const result = buildAgentCreateArgs({ name, workspace, model });

          // 验证包含 --model 的完整参数结构
          const expected = [
            'agents', 'add', name.trim(),
            '--workspace', workspace.trim(),
            '--non-interactive', '--json',
            '--model', model.trim(),
          ];
          expect(result).toEqual(expected);
        },
      ),
      { numRuns: 200 },
    );
  });

  // ── 2.4 classifyAgentError 非 schema 保持测试 ─────────────────────────

  /**
   * Validates: Requirements 3.9
   *
   * 保持性：不包含 schema 关键词的错误字符串不应被分类为 "schema"
   * 使用 fast-check 生成随机非 schema 错误字符串
   */
  test('非 schema 错误字符串不应被分类为 "schema"', () => {
    fc.assert(
      fc.property(nonSchemaErrorArb(), (errorStr) => {
        const result = classifyAgentError(errorStr);

        // 不包含 schema 关键词的错误不应返回 "schema"
        expect(result).not.toBe('schema');
      }),
      { numRuns: 200 },
    );
  });

  /**
   * Validates: Requirements 3.9
   *
   * 保持性：具体的网络/权限错误应被正确分类（非 schema）
   */
  test('具体网络/权限错误应被正确分类为非 schema 类型', () => {
    fc.assert(
      fc.property(specificNonSchemaErrorArb(), (errorStr) => {
        const result = classifyAgentError(errorStr);

        // 明确的网络/权限错误不应返回 "schema"
        expect(result).not.toBe('schema');
      }),
      { numRuns: 50 },
    );
  });

  // ── 2.5 API Key header / endpointMap 单元测试 ─────────────────────────

  /**
   * Validates: Requirements 3.3
   *
   * 单元测试：验证 endpointMap 包含所有已知 provider 的端点
   * 确保修复后不会意外删除或修改已有映射
   */
  test('endpointMap 应包含所有已知 provider 的端点', () => {
    // 验证所有已知 provider 都在 endpointMap 中
    for (const provider of KNOWN_PROVIDERS) {
      expect(endpointMap).toHaveProperty(provider);
      // 每个端点应是非空字符串
      expect(typeof endpointMap[provider]).toBe('string');
      expect(endpointMap[provider].length).toBeGreaterThan(0);
    }
  });

  /**
   * Validates: Requirements 3.3
   *
   * 单元测试：验证 endpointMap 中的具体端点值
   * 确保关键 provider 的 URL 在修复前后不变
   */
  test('endpointMap 关键 provider 端点值应正确', () => {
    // 验证几个关键 provider 的具体端点值
    expect(endpointMap['openai']).toBe('https://api.openai.com/v1/chat/completions');
    expect(endpointMap['deepseek']).toBe('https://api.deepseek.com/v1/chat/completions');
    expect(endpointMap['moonshot']).toBe('https://api.moonshot.cn/v1/chat/completions');
    expect(endpointMap['glm']).toBe('https://open.bigmodel.cn/api/paas/v4/chat/completions');
    expect(endpointMap['anthropic']).toBe('https://api.anthropic.com/v1/messages');
  });
});
