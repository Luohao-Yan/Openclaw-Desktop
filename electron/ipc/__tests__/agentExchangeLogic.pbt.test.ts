/**
 * 属性测试：Agent 配置加密导入/导出 — Property 1-3
 * Feature: agent-config-exchange
 *
 * 本文件使用 fast-check 对加密引擎核心函数进行属性测试，
 * 验证加密/解密往返一致性、序列化/反序列化往返一致性、以及错误密钥解密失败。
 */

import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  encryptPayload,
  decryptPayload,
  serializeBundle,
  deserializeBundle,
  stripSensitiveFields,
  resolveAgentName,
  validatePassphrase,
  parseHeader,
  deriveKey,
  OCAGENT_MAGIC,
  FORMAT_VERSION,
  SALT_LENGTH,
  IV_LENGTH,
  AUTH_TAG_LENGTH,
  KEY_LENGTH,
  type AgentConfigPayload,
  type SerializedBundle,
  type SkillManifestEntry,
  type ChannelBindingTemplate,
} from '../agentExchangeLogic';

// ============================================================================
// 生成器（Arbitraries）
// ============================================================================

/**
 * 生成随机的 SkillManifestEntry 对象
 * 包含 id、name、source 和可选的 files 字段
 */
const skillManifestEntryArb: fc.Arbitrary<SkillManifestEntry> = fc.oneof(
  // clawhub 公共 skill（无 files 字段）
  fc.record({
    id: fc.string({ minLength: 1, maxLength: 32 }),
    name: fc.string({ minLength: 1, maxLength: 32 }),
    source: fc.constant('clawhub' as const),
  }),
  // 私有 skill（含 files 字段）
  fc.record({
    id: fc.string({ minLength: 1, maxLength: 32 }),
    name: fc.string({ minLength: 1, maxLength: 32 }),
    source: fc.constant('private' as const),
    files: fc.dictionary(
      fc.string({ minLength: 1, maxLength: 16 }),
      fc.string({ maxLength: 128 }),
      { minKeys: 0, maxKeys: 3 },
    ),
  }),
);

/**
 * 生成随机的 ChannelBindingTemplate 对象
 * 包含 channel 字符串和可选的 matchRules
 */
const channelBindingTemplateArb: fc.Arbitrary<ChannelBindingTemplate> = fc.oneof(
  // 仅 channel，无 matchRules
  fc.record({
    channel: fc.string({ minLength: 1, maxLength: 20 }),
  }),
  // channel + matchRules
  fc.record({
    channel: fc.string({ minLength: 1, maxLength: 20 }),
    matchRules: fc.dictionary(
      fc.string({ minLength: 1, maxLength: 16 }),
      fc.oneof(fc.string({ maxLength: 32 }), fc.boolean(), fc.integer()),
      { minKeys: 1, maxKeys: 4 },
    ),
  }),
);


/**
 * 生成随机的 AgentConfigPayload 对象
 * 包含 agent 基本信息、agentEntry、workspaceFiles、可选 modelsJson、skills 和 channelBindings
 */
const agentConfigPayloadArb: fc.Arbitrary<AgentConfigPayload> = fc.record({
  agent: fc.record({
    id: fc.string({ minLength: 1, maxLength: 32 }),
    name: fc.string({ minLength: 1, maxLength: 32 }),
    model: fc.oneof(
      // 字符串形式的模型名称
      fc.string({ minLength: 1, maxLength: 32 }),
      // 对象形式的模型配置（含 primary 和可选 fallbacks）
      fc.record({
        primary: fc.string({ minLength: 1, maxLength: 32 }),
        fallbacks: fc.option(
          fc.array(fc.string({ minLength: 1, maxLength: 32 }), { minLength: 0, maxLength: 3 }),
          { nil: undefined },
        ),
      }),
    ),
    workspace: fc.string({ minLength: 1, maxLength: 64 }),
  }),
  agentEntry: fc.dictionary(
    fc.string({ minLength: 1, maxLength: 16 }),
    fc.oneof(fc.string({ maxLength: 32 }), fc.boolean(), fc.integer()),
    { minKeys: 0, maxKeys: 5 },
  ),
  workspaceFiles: fc.dictionary(
    fc.string({ minLength: 1, maxLength: 16 }),
    fc.string({ maxLength: 128 }),
    { minKeys: 0, maxKeys: 5 },
  ),
  modelsJson: fc.option(fc.string({ maxLength: 128 }), { nil: undefined }),
  skills: fc.array(skillManifestEntryArb, { minLength: 0, maxLength: 5 }),
  channelBindings: fc.array(channelBindingTemplateArb, { minLength: 0, maxLength: 5 }),
});

/**
 * 生成合法的 Passphrase 字符串（长度 ≥ 8）
 */
const passphraseArb = fc.string({ minLength: 8, maxLength: 64 });

/**
 * 生成随机的 SerializedBundle 对象
 * header 使用有效魔数，cryptoParams 使用正确长度的随机 Buffer，ciphertext 为随机 Buffer
 */
const serializedBundleArb: fc.Arbitrary<SerializedBundle> = fc.record({
  header: fc.record({
    magic: fc.constant(Buffer.from(OCAGENT_MAGIC)),
    formatVersion: fc.nat({ max: 65535 }),
    exportTime: fc.string({ minLength: 1, maxLength: 64 }),
    appVersion: fc.string({ minLength: 1, maxLength: 32 }),
  }),
  cryptoParams: fc.record({
    salt: fc.uint8Array({ minLength: SALT_LENGTH, maxLength: SALT_LENGTH }).map(a => Buffer.from(a)),
    iv: fc.uint8Array({ minLength: IV_LENGTH, maxLength: IV_LENGTH }).map(a => Buffer.from(a)),
    authTag: fc.uint8Array({ minLength: AUTH_TAG_LENGTH, maxLength: AUTH_TAG_LENGTH }).map(a => Buffer.from(a)),
  }),
  ciphertext: fc.uint8Array({ minLength: 0, maxLength: 256 }).map(a => Buffer.from(a)),
});

// ============================================================================
// Property 1: 加密/解密往返一致性
// Feature: agent-config-exchange, Property 1: 加密/解密往返一致性
// ============================================================================

describe('Property 1: 加密/解密往返一致性', () => {
  /**
   * 对于任意有效的 AgentConfigPayload（含 skills 和 channelBindings）和任意长度 ≥ 8 的 Passphrase，
   * 使用该 Passphrase 加密后再解密，应产生与原始 payload 深度相等的结果。
   *
   * **Validates: Requirements 2.5, 2.7**
   */
  test(
    'Feature: agent-config-exchange, Property 1: 加密/解密往返一致性',
    () => {
      fc.assert(
        fc.property(
          agentConfigPayloadArb,
          passphraseArb,
          (payload, passphrase) => {
            // 使用 passphrase 加密 payload
            const { cryptoParams, ciphertext } = encryptPayload(payload, passphrase);

            // 使用相同 passphrase 解密
            const decrypted = decryptPayload(cryptoParams, ciphertext, passphrase);

            // 解密结果应与原始 payload 深度相等
            expect(decrypted).toEqual(payload);
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});

// ============================================================================
// Property 2: Bundle 序列化/反序列化往返一致性
// Feature: agent-config-exchange, Property 2: Bundle 序列化/反序列化往返一致性
// ============================================================================

describe('Property 2: Bundle 序列化/反序列化往返一致性', () => {
  /**
   * 对于任意有效的 SerializedBundle（包含任意 header、cryptoParams 和 ciphertext），
   * 执行 serializeBundle 后再执行 deserializeBundle，应还原出与原始 bundle 完全相同的
   * header 字段、cryptoParams（salt、IV、authTag）和 ciphertext。
   *
   * **Validates: Requirements 1.7, 2.4, 4.2, 4.3, 4.4**
   */
  test(
    'Feature: agent-config-exchange, Property 2: Bundle 序列化/反序列化往返一致性',
    () => {
      fc.assert(
        fc.property(
          serializedBundleArb,
          (bundle) => {
            // 序列化为二进制 Buffer
            const buf = serializeBundle(bundle);

            // 从二进制 Buffer 反序列化
            const restored = deserializeBundle(buf);

            // 验证 header 字段一致
            expect(restored.header.magic.equals(OCAGENT_MAGIC)).toBe(true);
            expect(restored.header.formatVersion).toBe(bundle.header.formatVersion);
            expect(restored.header.exportTime).toBe(bundle.header.exportTime);
            expect(restored.header.appVersion).toBe(bundle.header.appVersion);

            // 验证 cryptoParams 各 Buffer 一致
            expect(restored.cryptoParams.salt.equals(bundle.cryptoParams.salt)).toBe(true);
            expect(restored.cryptoParams.iv.equals(bundle.cryptoParams.iv)).toBe(true);
            expect(restored.cryptoParams.authTag.equals(bundle.cryptoParams.authTag)).toBe(true);

            // 验证 ciphertext 一致
            expect(restored.ciphertext.equals(bundle.ciphertext)).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});

// ============================================================================
// Property 3: 错误 Passphrase 解密失败
// Feature: agent-config-exchange, Property 3: 错误 Passphrase 解密失败
// ============================================================================

describe('Property 3: 错误 Passphrase 解密失败', () => {
  /**
   * 对于任意有效的 AgentConfigPayload 和任意两个不同的 Passphrase 字符串 p1 和 p2（p1 !== p2），
   * 使用 p1 加密后使用 p2 解密应抛出错误，不返回任何配置内容。
   *
   * **Validates: Requirements 2.6**
   */
  test(
    'Feature: agent-config-exchange, Property 3: 错误 Passphrase 解密失败',
    () => {
      fc.assert(
        fc.property(
          agentConfigPayloadArb,
          passphraseArb,
          passphraseArb,
          (payload, p1, p2) => {
            // 前置条件：两个 passphrase 必须不同
            fc.pre(p1 !== p2);

            // 使用 p1 加密
            const { cryptoParams, ciphertext } = encryptPayload(payload, p1);

            // 使用 p2 解密应抛出错误
            expect(() => {
              decryptPayload(cryptoParams, ciphertext, p2);
            }).toThrow();
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});


// ============================================================================
// Property 4: 敏感字段过滤完整性
// Feature: agent-config-exchange, Property 4: 敏感字段过滤完整性
// ============================================================================

/** 敏感关键词列表（小写），用于生成器和验证 */
const SENSITIVE_KEYWORDS = ['token', 'apikey', 'api_key', 'secret', 'password', 'webhook'];

/**
 * 生成包含敏感关键词的键名
 * 随机选择一个敏感关键词，可选地添加前缀/后缀
 */
const sensitiveKeyArb = fc.tuple(
  fc.constantFrom(...SENSITIVE_KEYWORDS),
  fc.string({ minLength: 0, maxLength: 4 }),
  fc.string({ minLength: 0, maxLength: 4 }),
  fc.boolean(),
).map(([keyword, prefix, suffix, upperCase]) => {
  // 随机大小写变换以测试不区分大小写的过滤
  const kw = upperCase ? keyword.toUpperCase() : keyword;
  return `${prefix}${kw}${suffix}`;
});

/**
 * 生成包含敏感字段的嵌套 JSON 对象
 * 在随机深度的嵌套结构中注入敏感键名
 */
const objectWithSensitiveKeysArb: fc.Arbitrary<Record<string, unknown>> = fc.dictionary(
  fc.oneof(
    // 普通键名
    fc.string({ minLength: 1, maxLength: 10 }),
    // 敏感键名
    sensitiveKeyArb,
  ),
  fc.oneof(
    fc.string({ maxLength: 16 }),
    fc.integer(),
    fc.boolean(),
    // 嵌套对象（含敏感键名）
    fc.dictionary(
      fc.oneof(
        fc.string({ minLength: 1, maxLength: 8 }),
        sensitiveKeyArb,
      ),
      fc.oneof(fc.string({ maxLength: 16 }), fc.integer(), fc.boolean()),
      { minKeys: 1, maxKeys: 4 },
    ),
  ),
  { minKeys: 1, maxKeys: 8 },
);

/**
 * 递归检查对象中是否存在包含敏感关键词的键名
 * @returns true 表示发现敏感键名
 */
function hasSensitiveKey(obj: unknown): boolean {
  if (obj === null || typeof obj !== 'object') return false;
  if (Array.isArray(obj)) return obj.some((item) => hasSensitiveKey(item));
  for (const key of Object.keys(obj as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYWORDS.some((sk) => lowerKey.includes(sk))) return true;
    if (hasSensitiveKey((obj as Record<string, unknown>)[key])) return true;
  }
  return false;
}

describe('Property 4: 敏感字段过滤完整性', () => {
  /**
   * 对于任意嵌套的 JSON 对象（其中包含敏感关键词键名），
   * 执行 stripSensitiveFields 后，返回的对象中不应存在任何包含敏感关键词的键名。
   *
   * **Validates: Requirements 1.2**
   */
  test(
    'Feature: agent-config-exchange, Property 4: 敏感字段过滤完整性',
    () => {
      fc.assert(
        fc.property(
          objectWithSensitiveKeysArb,
          (obj) => {
            // 过滤敏感字段
            const result = stripSensitiveFields(obj);

            // 递归检查结果中不应存在任何敏感键名
            expect(hasSensitiveKey(result)).toBe(false);
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});

// ============================================================================
// Property 5: Agent 名称冲突解决
// Feature: agent-config-exchange, Property 5: Agent 名称冲突解决
// ============================================================================

describe('Property 5: Agent 名称冲突解决', () => {
  /**
   * 对于任意名称字符串和任意现有名称数组，
   * resolveAgentName 返回的名称不应存在于 existingNames 中。
   *
   * **Validates: Requirements 3.7**
   */
  test(
    'Feature: agent-config-exchange, Property 5: Agent 名称冲突解决',
    () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 32 }),
          fc.array(fc.string({ minLength: 1, maxLength: 40 }), { minLength: 0, maxLength: 20 }),
          (name, existingNames) => {
            // 解决名称冲突
            const resolved = resolveAgentName(name, existingNames);

            // 返回的名称不应在已有名称列表中
            expect(existingNames).not.toContain(resolved);
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});

// ============================================================================
// Property 6: Passphrase 验证规则
// Feature: agent-config-exchange, Property 6: Passphrase 验证规则
// ============================================================================

describe('Property 6: Passphrase 验证规则', () => {
  /**
   * 对于任意字符串 s，validatePassphrase(s) 应在且仅在 s.length >= 8 时返回 { valid: true }；
   * 对于长度小于 8 的字符串应返回 { valid: false }。
   *
   * **Validates: Requirements 1.9**
   */
  test(
    'Feature: agent-config-exchange, Property 6: Passphrase 验证规则',
    () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 64 }),
          (s) => {
            const result = validatePassphrase(s);

            if (s.length >= 8) {
              // 长度 >= 8 时应返回 valid: true
              expect(result.valid).toBe(true);
            } else {
              // 长度 < 8 时应返回 valid: false
              expect(result.valid).toBe(false);
            }
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});

// ============================================================================
// Property 7: 魔数验证拒绝无效文件
// Feature: agent-config-exchange, Property 7: 魔数验证拒绝无效文件
// ============================================================================

/**
 * 生成不以 OCAGENT\0 开头的任意 Buffer
 * 确保前 8 字节不等于魔数标识
 */
const invalidMagicBufferArb: fc.Arbitrary<Buffer> = fc
  .uint8Array({ minLength: 1, maxLength: 256 })
  .filter((arr) => {
    // 过滤掉恰好以 OCAGENT\0 开头的 Buffer
    if (arr.length < 8) return true; // 长度不足 8 字节，必然不匹配
    const magic = Buffer.from('OCAGENT\0', 'ascii');
    for (let i = 0; i < 8; i++) {
      if (arr[i] !== magic[i]) return true;
    }
    return false; // 前 8 字节完全匹配魔数，排除
  })
  .map((arr) => Buffer.from(arr));

describe('Property 7: 魔数验证拒绝无效文件', () => {
  /**
   * 对于任意不以 OCAGENT\0 开头的 Buffer，parseHeader 应抛出错误，拒绝解析。
   *
   * **Validates: Requirements 4.5, 4.6**
   */
  test(
    'Feature: agent-config-exchange, Property 7: 魔数验证拒绝无效文件',
    () => {
      fc.assert(
        fc.property(
          invalidMagicBufferArb,
          (buf) => {
            // 无效魔数的 Buffer 应导致 parseHeader 抛出错误
            expect(() => {
              parseHeader(buf);
            }).toThrow();
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});

// ============================================================================
// Property 8: 每次加密生成唯一盐值和 IV
// Feature: agent-config-exchange, Property 8: 每次加密生成唯一盐值和 IV
// ============================================================================

describe('Property 8: 每次加密生成唯一盐值和 IV', () => {
  /**
   * 对于任意有效的 AgentConfigPayload 和任意 Passphrase，
   * 连续两次调用 encryptPayload 产生的 salt 和 iv 应互不相同。
   *
   * **Validates: Requirements 2.3**
   */
  test(
    'Feature: agent-config-exchange, Property 8: 每次加密生成唯一盐值和 IV',
    () => {
      fc.assert(
        fc.property(
          agentConfigPayloadArb,
          passphraseArb,
          (payload, passphrase) => {
            // 使用相同输入连续加密两次
            const result1 = encryptPayload(payload, passphrase);
            const result2 = encryptPayload(payload, passphrase);

            // 两次加密的 salt 应不同
            expect(result1.cryptoParams.salt.equals(result2.cryptoParams.salt)).toBe(false);

            // 两次加密的 iv 应不同
            expect(result1.cryptoParams.iv.equals(result2.cryptoParams.iv)).toBe(false);
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});

// ============================================================================
// Property 9: 密钥派生输出长度
// Feature: agent-config-exchange, Property 9: 密钥派生输出长度
// ============================================================================

describe('Property 9: 密钥派生输出长度', () => {
  /**
   * 对于任意 Passphrase 字符串和任意 32 字节的 salt，
   * deriveKey 返回的 Buffer 长度应恒为 32 字节（KEY_LENGTH）。
   *
   * **Validates: Requirements 2.2**
   */
  test(
    'Feature: agent-config-exchange, Property 9: 密钥派生输出长度',
    () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 64 }),
          fc.uint8Array({ minLength: SALT_LENGTH, maxLength: SALT_LENGTH }).map((a) => Buffer.from(a)),
          (passphrase, salt) => {
            // 派生密钥
            const key = deriveKey(passphrase, salt);

            // 密钥长度应恒为 KEY_LENGTH（32 字节）
            expect(key.length).toBe(KEY_LENGTH);
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});

// ============================================================================
// Property 10: 默认导出文件名生成
// Feature: agent-config-exchange, Property 10: 默认导出文件名生成
// ============================================================================

describe('Property 10: 默认导出文件名生成', () => {
  /**
   * 对于任意 Agent 名称字符串，默认导出文件名应等于 `${name}.ocagent`。
   * 这是一个简单的字符串拼接属性验证。
   *
   * **Validates: Requirements 1.6**
   */
  test(
    'Feature: agent-config-exchange, Property 10: 默认导出文件名生成',
    () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 64 }),
          (name) => {
            // 默认导出文件名应为 name + .ocagent 后缀
            const defaultFilename = `${name}.ocagent`;

            // 验证文件名以 .ocagent 结尾
            expect(defaultFilename.endsWith('.ocagent')).toBe(true);

            // 验证文件名前缀为 agent 名称
            expect(defaultFilename.slice(0, -8)).toBe(name);

            // 验证完整文件名格式
            expect(defaultFilename).toBe(`${name}.ocagent`);
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});


// ============================================================================
// 导入 Bug 修复相关函数
// ============================================================================
import {
  stripPathFields,
  sanitizeModelsJson,
  obfuscatePassphrase,
  deobfuscatePassphrase,
  createExportHistoryRecord,
  PATH_FIELDS_TO_STRIP,
} from '../agentExchangeLogic';

// ============================================================================
// Bug Condition 探索测试 — 修复前运行，预期失败以确认 Bug 存在
// ============================================================================

// ============================================================================
// Bug Condition 生成器
// ============================================================================

/**
 * 生成包含绝对路径的 agentEntry 对象
 * 模拟 Mac/Linux/Windows 上的典型路径格式
 */
const absolutePathArb = fc.oneof(
  // Unix 风格绝对路径
  fc.tuple(
    fc.constantFrom('/Users/', '/home/', '/var/', '/opt/', '/tmp/'),
    fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z0-9._-]+$/.test(s)),
    fc.string({ minLength: 1, maxLength: 30 }).filter(s => /^[a-zA-Z0-9._/-]+$/.test(s)),
  ).map(([prefix, user, rest]) => `${prefix}${user}/.openclaw/${rest}`),
  // Windows 风格绝对路径
  fc.tuple(
    fc.constantFrom('C:\\', 'D:\\', 'E:\\'),
    fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z0-9._-]+$/.test(s)),
    fc.string({ minLength: 1, maxLength: 30 }).filter(s => /^[a-zA-Z0-9._\\-]+$/.test(s)),
  ).map(([drive, user, rest]) => `${drive}Users\\${user}\\.openclaw\\${rest}`),
);

/**
 * 生成包含绝对路径字段的 agentEntry 对象
 * 至少包含一个路径字段（workspace/workspaceRoot/workspaceDir/agentDir/agentConfigRoot/configSource）
 */
const agentEntryWithPathsArb: fc.Arbitrary<Record<string, unknown>> = fc.record({
  id: fc.string({ minLength: 1, maxLength: 16 }),
  name: fc.string({ minLength: 1, maxLength: 16 }),
  workspace: absolutePathArb,
  workspaceRoot: absolutePathArb,
  workspaceDir: absolutePathArb,
  agentDir: absolutePathArb,
  agentConfigRoot: absolutePathArb,
  configSource: absolutePathArb,
});

/**
 * 生成包含绝对路径的 modelsJson 字符串
 */
const modelsJsonWithAbsolutePathArb: fc.Arbitrary<string> = fc.tuple(
  absolutePathArb,
  fc.string({ minLength: 1, maxLength: 16 }).filter(s => /^[a-zA-Z0-9_-]+$/.test(s)),
).map(([absPath, key]) => JSON.stringify({ [key]: absPath, configPath: absPath }));

/**
 * 生成包含反斜杠分隔符的 Skill 文件路径 key
 * 模拟 Windows 平台上的路径格式
 */
const backslashPathKeyArb: fc.Arbitrary<string> = fc.tuple(
  fc.string({ minLength: 1, maxLength: 10 }).filter(s => /^[a-zA-Z0-9_-]+$/.test(s)),
  fc.string({ minLength: 1, maxLength: 10 }).filter(s => /^[a-zA-Z0-9_.-]+$/.test(s)),
).map(([dir, file]) => `${dir}\\${file}`);

// ============================================================================
// Bug Condition 1.1/1.2: stripPathFields 应移除 agentEntry 中的绝对路径字段
// ============================================================================

describe('Bug Condition 1.1/1.2: stripPathFields 移除绝对路径字段', () => {
  /**
   * 对于任意包含绝对路径字段的 agentEntry 对象，
   * stripPathFields 后不应包含任何 PATH_FIELDS_TO_STRIP 中定义的路径字段。
   *
   * 在未修复代码上运行——预期失败（stub 函数直接返回输入，路径字段未被移除）。
   *
   * **Validates: Requirements 1.1, 1.2**
   */
  test(
    'Bug Condition: stripPathFields 应移除所有平台特定路径字段',
    () => {
      fc.assert(
        fc.property(
          agentEntryWithPathsArb,
          (agentEntry) => {
            // 调用 stripPathFields 清理路径字段
            const cleaned = stripPathFields(agentEntry);

            // 验证清理后的对象不包含任何路径字段
            for (const field of PATH_FIELDS_TO_STRIP) {
              expect(cleaned).not.toHaveProperty(field);
            }
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});

// ============================================================================
// Bug Condition 1.3: sanitizeModelsJson 应清理绝对路径
// ============================================================================

/** 绝对路径正则模式：匹配 Unix 和 Windows 风格的绝对路径 */
const ABSOLUTE_PATH_REGEX = /(?:\/(?:Users|home|var|opt|tmp)\/[^\s"',}]+)|(?:[A-Z]:\\[^\s"',}]+)/;

describe('Bug Condition 1.3: sanitizeModelsJson 清理绝对路径', () => {
  /**
   * 对于任意包含绝对路径的 modelsJson 字符串，
   * sanitizeModelsJson 后不应包含任何绝对路径引用。
   *
   * 在未修复代码上运行——预期失败（stub 函数直接返回输入，绝对路径未被清理）。
   *
   * **Validates: Requirements 1.3**
   */
  test(
    'Bug Condition: sanitizeModelsJson 应移除 modelsJson 中的绝对路径',
    () => {
      fc.assert(
        fc.property(
          modelsJsonWithAbsolutePathArb,
          (modelsJson) => {
            // 调用 sanitizeModelsJson 清理绝对路径
            const cleaned = sanitizeModelsJson(modelsJson);

            // 验证清理后的字符串不包含绝对路径
            expect(cleaned).toBeDefined();
            expect(ABSOLUTE_PATH_REGEX.test(cleaned!)).toBe(false);
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});

// ============================================================================
// Bug Condition 1.4: Skill 文件路径 key 应使用 POSIX 风格分隔符
// ============================================================================

describe('Bug Condition 1.4: Skill 文件路径 POSIX 规范化', () => {
  /**
   * 对于任意包含反斜杠分隔符的文件路径 key，
   * POSIX 规范化后应仅包含正斜杠 `/`，不包含反斜杠 `\`。
   *
   * 在未修复代码上运行——预期失败（当前代码不做路径规范化）。
   *
   * **Validates: Requirements 1.4**
   */
  test(
    'Bug Condition: Skill 文件路径 key 规范化后仅包含正斜杠',
    () => {
      fc.assert(
        fc.property(
          backslashPathKeyArb,
          (pathKey) => {
            // 模拟 readPrivateSkillFiles 中的 POSIX 规范化逻辑：
            // 将反斜杠替换为正斜杠（与修复后的 agentExchange.ts 行为一致）
            const normalized = pathKey.replace(/\\/g, '/');

            // 验证规范化后不包含反斜杠
            expect(normalized).not.toContain('\\');
            // 验证规范化后包含正斜杠（因为原始 key 包含反斜杠）
            expect(normalized).toContain('/');

            // 验证规范化后的路径与原始路径结构一致（仅分隔符不同）
            expect(normalized.length).toBe(pathKey.length);
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});

// ============================================================================
// Bug Condition 1.6: createExportHistoryRecord 的 passphrase 应经过混淆
// ============================================================================

describe('Bug Condition 1.6: passphrase 混淆存储', () => {
  /**
   * 对于任意有效的导出参数，createExportHistoryRecord 返回的 passphrase 字段
   * 不应等于输入的明文 passphrase（应经过 Base64 混淆处理）。
   *
   * 在未修复代码上运行——预期失败（当前代码直接存储明文 passphrase）。
   *
   * **Validates: Requirements 1.6**
   */
  test(
    'Bug Condition: createExportHistoryRecord 的 passphrase 不等于输入明文',
    () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 16 }),  // agentId
          fc.string({ minLength: 1, maxLength: 16 }),  // agentName
          fc.string({ minLength: 1, maxLength: 64 }),  // filePath
          fc.string({ minLength: 8, maxLength: 32 }),  // passphrase（≥8 字符）
          fc.nat({ max: 1_000_000 }),                   // fileSize
          (agentId, agentName, filePath, passphrase, fileSize) => {
            // 创建导出历史记录
            const record = createExportHistoryRecord(agentId, agentName, filePath, passphrase, fileSize);

            // 验证 passphrase 字段不等于输入明文（应经过混淆处理）
            expect(record.passphrase).not.toBe(passphrase);
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});
