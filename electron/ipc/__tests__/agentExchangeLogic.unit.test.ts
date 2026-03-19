/**
 * agentExchangeLogic 单元测试
 *
 * 验证 deriveKey、encryptPayload、decryptPayload 加密核心函数的行为。
 * 属性测试在 agentExchangeLogic.pbt.test.ts 中覆盖。
 */

import { describe, it, expect } from 'vitest';
import {
  deriveKey,
  encryptPayload,
  decryptPayload,
  KEY_LENGTH,
  SALT_LENGTH,
  IV_LENGTH,
  AUTH_TAG_LENGTH,
  type AgentConfigPayload,
  stripSensitiveFields,
  resolveAgentName,
  validatePassphrase,
  extractChannelBindings,
  collectSkillManifest,
} from '../agentExchangeLogic';
import crypto from 'node:crypto';

// ─── 测试用 payload 工厂函数 ─────────────────────────────────────────────────

/** 创建一个最小有效的 AgentConfigPayload 用于测试 */
function makePayload(overrides?: Partial<AgentConfigPayload>): AgentConfigPayload {
  return {
    agent: {
      id: 'agent-001',
      name: 'test-agent',
      model: 'gpt-4',
      workspace: '/tmp/workspace',
    },
    agentEntry: { foo: 'bar' },
    workspaceFiles: { 'IDENTITY.md': '# Identity' },
    skills: [],
    channelBindings: [],
    ...overrides,
  };
}

// ─── deriveKey ──────────────────────────────────────────────────────────────

describe('deriveKey', () => {
  it('返回 32 字节（256 位）的密钥', () => {
    const salt = crypto.randomBytes(SALT_LENGTH);
    const key = deriveKey('my-passphrase', salt);
    expect(key).toBeInstanceOf(Buffer);
    expect(key.length).toBe(KEY_LENGTH);
  });

  it('相同 passphrase 和 salt 产生相同密钥', () => {
    const salt = crypto.randomBytes(SALT_LENGTH);
    const key1 = deriveKey('same-pass', salt);
    const key2 = deriveKey('same-pass', salt);
    expect(key1.equals(key2)).toBe(true);
  });

  it('不同 passphrase 产生不同密钥', () => {
    const salt = crypto.randomBytes(SALT_LENGTH);
    const key1 = deriveKey('pass-one', salt);
    const key2 = deriveKey('pass-two', salt);
    expect(key1.equals(key2)).toBe(false);
  });

  it('不同 salt 产生不同密钥', () => {
    const salt1 = crypto.randomBytes(SALT_LENGTH);
    const salt2 = crypto.randomBytes(SALT_LENGTH);
    const key1 = deriveKey('same-pass', salt1);
    const key2 = deriveKey('same-pass', salt2);
    expect(key1.equals(key2)).toBe(false);
  });
});


// ─── encryptPayload ─────────────────────────────────────────────────────────

describe('encryptPayload', () => {
  const passphrase = 'test-passphrase-12345';

  it('返回包含 cryptoParams 和 ciphertext 的对象', () => {
    const payload = makePayload();
    const result = encryptPayload(payload, passphrase);

    expect(result).toHaveProperty('cryptoParams');
    expect(result).toHaveProperty('ciphertext');
    expect(result.ciphertext).toBeInstanceOf(Buffer);
    expect(result.ciphertext.length).toBeGreaterThan(0);
  });

  it('cryptoParams 包含正确长度的 salt、iv、authTag', () => {
    const payload = makePayload();
    const { cryptoParams } = encryptPayload(payload, passphrase);

    expect(cryptoParams.salt).toBeInstanceOf(Buffer);
    expect(cryptoParams.salt.length).toBe(SALT_LENGTH);
    expect(cryptoParams.iv).toBeInstanceOf(Buffer);
    expect(cryptoParams.iv.length).toBe(IV_LENGTH);
    expect(cryptoParams.authTag).toBeInstanceOf(Buffer);
    expect(cryptoParams.authTag.length).toBe(AUTH_TAG_LENGTH);
  });

  it('每次加密生成不同的 salt 和 iv', () => {
    const payload = makePayload();
    const r1 = encryptPayload(payload, passphrase);
    const r2 = encryptPayload(payload, passphrase);

    expect(r1.cryptoParams.salt.equals(r2.cryptoParams.salt)).toBe(false);
    expect(r1.cryptoParams.iv.equals(r2.cryptoParams.iv)).toBe(false);
  });

  it('密文与原始 JSON 不同（确认已加密）', () => {
    const payload = makePayload();
    const { ciphertext } = encryptPayload(payload, passphrase);
    const plainJson = Buffer.from(JSON.stringify(payload), 'utf8');

    expect(ciphertext.equals(plainJson)).toBe(false);
  });
});

// ─── decryptPayload ─────────────────────────────────────────────────────────

describe('decryptPayload', () => {
  const passphrase = 'decrypt-test-pass';

  it('使用正确 passphrase 解密还原原始 payload', () => {
    const payload = makePayload();
    const { cryptoParams, ciphertext } = encryptPayload(payload, passphrase);
    const decrypted = decryptPayload(cryptoParams, ciphertext, passphrase);

    expect(decrypted).toEqual(payload);
  });

  it('包含 skills 和 channelBindings 的 payload 往返一致', () => {
    const payload = makePayload({
      skills: [
        { id: 'skill-1', name: 'Weather', source: 'clawhub' },
        { id: 'skill-2', name: 'Private Tool', source: 'private', files: { 'SKILL.md': '# Skill' } },
      ],
      channelBindings: [
        { channel: 'wechat', matchRules: { group: true } },
        { channel: 'telegram' },
      ],
    });
    const { cryptoParams, ciphertext } = encryptPayload(payload, passphrase);
    const decrypted = decryptPayload(cryptoParams, ciphertext, passphrase);

    expect(decrypted).toEqual(payload);
  });

  it('包含 modelsJson 的 payload 往返一致', () => {
    const payload = makePayload({
      modelsJson: '{"models":[{"id":"gpt-4","provider":"openai"}]}',
    });
    const { cryptoParams, ciphertext } = encryptPayload(payload, passphrase);
    const decrypted = decryptPayload(cryptoParams, ciphertext, passphrase);

    expect(decrypted).toEqual(payload);
  });

  it('错误 passphrase 解密抛出错误', () => {
    const payload = makePayload();
    const { cryptoParams, ciphertext } = encryptPayload(payload, passphrase);

    expect(() => {
      decryptPayload(cryptoParams, ciphertext, 'wrong-passphrase');
    }).toThrow('解密失败');
  });

  it('篡改密文后解密抛出错误', () => {
    const payload = makePayload();
    const { cryptoParams, ciphertext } = encryptPayload(payload, passphrase);

    // 篡改密文的第一个字节
    const tampered = Buffer.from(ciphertext);
    tampered[0] = tampered[0] ^ 0xff;

    expect(() => {
      decryptPayload(cryptoParams, tampered, passphrase);
    }).toThrow('解密失败');
  });

  it('篡改 authTag 后解密抛出错误', () => {
    const payload = makePayload();
    const { cryptoParams, ciphertext } = encryptPayload(payload, passphrase);

    // 篡改 authTag
    const tamperedParams = {
      ...cryptoParams,
      authTag: crypto.randomBytes(AUTH_TAG_LENGTH),
    };

    expect(() => {
      decryptPayload(tamperedParams, ciphertext, passphrase);
    }).toThrow('解密失败');
  });
});


// ─── 导入序列化相关函数 ─────────────────────────────────────────────────────

import {
  serializeBundle,
  deserializeBundle,
  parseHeader,
  OCAGENT_MAGIC,
  FORMAT_VERSION,
  type SerializedBundle,
  type BundleHeader,
} from '../agentExchangeLogic';

// ─── 测试用 Bundle 工厂函数 ─────────────────────────────────────────────────

/** 创建一个最小有效的 SerializedBundle 用于测试 */
function makeBundle(overrides?: Partial<SerializedBundle>): SerializedBundle {
  return {
    header: {
      magic: Buffer.from(OCAGENT_MAGIC),
      formatVersion: FORMAT_VERSION,
      exportTime: '2024-01-15T10:30:00.000Z',
      appVersion: '0.3.13',
    },
    cryptoParams: {
      salt: crypto.randomBytes(SALT_LENGTH),
      iv: crypto.randomBytes(IV_LENGTH),
      authTag: crypto.randomBytes(AUTH_TAG_LENGTH),
    },
    ciphertext: Buffer.from('encrypted-data-here'),
    ...overrides,
  };
}

// ─── serializeBundle ────────────────────────────────────────────────────────

describe('serializeBundle', () => {
  it('序列化后的 Buffer 以魔数标识开头', () => {
    const bundle = makeBundle();
    const buf = serializeBundle(bundle);
    expect(buf.subarray(0, 8).equals(OCAGENT_MAGIC)).toBe(true);
  });

  it('序列化后的 Buffer 包含正确的格式版本号', () => {
    const bundle = makeBundle();
    const buf = serializeBundle(bundle);
    expect(buf.readUInt16BE(8)).toBe(FORMAT_VERSION);
  });

  it('序列化后的 Buffer 包含导出时间戳', () => {
    const bundle = makeBundle();
    const buf = serializeBundle(bundle);
    // 偏移 10 处为时间戳长度
    const timeLen = buf.readUInt16BE(10);
    const time = buf.subarray(12, 12 + timeLen).toString('utf8');
    expect(time).toBe('2024-01-15T10:30:00.000Z');
  });

  it('序列化后的 Buffer 包含应用版本号', () => {
    const bundle = makeBundle();
    const buf = serializeBundle(bundle);
    const timeLen = buf.readUInt16BE(10);
    const versionLenOffset = 12 + timeLen;
    const versionLen = buf.readUInt16BE(versionLenOffset);
    const version = buf.subarray(versionLenOffset + 2, versionLenOffset + 2 + versionLen).toString('utf8');
    expect(version).toBe('0.3.13');
  });
});

// ─── deserializeBundle ──────────────────────────────────────────────────────

describe('deserializeBundle', () => {
  it('反序列化还原与原始 Bundle 一致', () => {
    const bundle = makeBundle();
    const buf = serializeBundle(bundle);
    const restored = deserializeBundle(buf);

    expect(restored.header.magic.equals(OCAGENT_MAGIC)).toBe(true);
    expect(restored.header.formatVersion).toBe(bundle.header.formatVersion);
    expect(restored.header.exportTime).toBe(bundle.header.exportTime);
    expect(restored.header.appVersion).toBe(bundle.header.appVersion);
    expect(restored.cryptoParams.salt.equals(bundle.cryptoParams.salt)).toBe(true);
    expect(restored.cryptoParams.iv.equals(bundle.cryptoParams.iv)).toBe(true);
    expect(restored.cryptoParams.authTag.equals(bundle.cryptoParams.authTag)).toBe(true);
    expect(restored.ciphertext.equals(bundle.ciphertext)).toBe(true);
  });

  it('空密文的 Bundle 往返一致', () => {
    const bundle = makeBundle({ ciphertext: Buffer.alloc(0) });
    const buf = serializeBundle(bundle);
    const restored = deserializeBundle(buf);
    expect(restored.ciphertext.length).toBe(0);
  });

  it('超长时间戳和版本号的 Bundle 往返一致', () => {
    const longTime = '2024-01-15T10:30:00.000+08:00-extra-long-string';
    const longVersion = '0.3.13-preview-5-beta-rc1-with-extra-metadata';
    const bundle = makeBundle({
      header: {
        magic: Buffer.from(OCAGENT_MAGIC),
        formatVersion: FORMAT_VERSION,
        exportTime: longTime,
        appVersion: longVersion,
      },
    });
    const buf = serializeBundle(bundle);
    const restored = deserializeBundle(buf);
    expect(restored.header.exportTime).toBe(longTime);
    expect(restored.header.appVersion).toBe(longVersion);
  });

  it('魔数不匹配时抛出错误', () => {
    const bundle = makeBundle();
    const buf = serializeBundle(bundle);
    // 篡改魔数
    buf[0] = 0x00;
    expect(() => deserializeBundle(buf)).toThrow('魔数标识不匹配');
  });

  it('Buffer 长度不足时抛出错误', () => {
    const shortBuf = Buffer.alloc(10);
    expect(() => deserializeBundle(shortBuf)).toThrow('数据长度不足');
  });
});

// ─── parseHeader ────────────────────────────────────────────────────────────

describe('parseHeader', () => {
  it('正确解析有效文件的头部信息', () => {
    const bundle = makeBundle();
    const buf = serializeBundle(bundle);
    const header = parseHeader(buf);

    expect(header.magic.equals(OCAGENT_MAGIC)).toBe(true);
    expect(header.formatVersion).toBe(FORMAT_VERSION);
    expect(header.exportTime).toBe('2024-01-15T10:30:00.000Z');
    expect(header.appVersion).toBe('0.3.13');
  });

  it('空 Buffer 抛出错误', () => {
    expect(() => parseHeader(Buffer.alloc(0))).toThrow('数据长度不足');
  });

  it('截断 Buffer（仅包含魔数）抛出错误', () => {
    expect(() => parseHeader(Buffer.from('OCAGENT\0'))).toThrow('数据长度不足');
  });

  it('错误魔数抛出错误', () => {
    const buf = Buffer.alloc(20);
    buf.write('INVALID\0', 0, 'ascii');
    expect(() => parseHeader(buf)).toThrow('魔数标识不匹配');
  });

  it('时间戳数据不完整时抛出错误', () => {
    // 构造一个声称时间戳长度为 100 但实际数据不足的 Buffer
    const buf = Buffer.alloc(14);
    OCAGENT_MAGIC.copy(buf, 0);
    buf.writeUInt16BE(1, 8);     // 版本号
    buf.writeUInt16BE(100, 10);  // 时间戳长度 = 100（但 Buffer 只有 14 字节）
    expect(() => parseHeader(buf)).toThrow('导出时间戳数据不完整');
  });

  it('应用版本号长度字段缺失时抛出错误', () => {
    // 构造一个时间戳正好读完但没有版本号长度字段的 Buffer
    const time = '2024-01-01';
    const timeBuf = Buffer.from(time, 'utf8');
    const buf = Buffer.alloc(12 + timeBuf.length); // 刚好到时间戳结束，没有版本号长度
    OCAGENT_MAGIC.copy(buf, 0);
    buf.writeUInt16BE(1, 8);
    buf.writeUInt16BE(timeBuf.length, 10);
    timeBuf.copy(buf, 12);
    expect(() => parseHeader(buf)).toThrow('应用版本号长度字段缺失');
  });
});


// ─── stripSensitiveFields ───────────────────────────────────────────────────

describe('stripSensitiveFields', () => {
  it('移除顶层敏感字段（token、apiKey、api_key、secret、password、webhook）', () => {
    const input = {
      name: 'agent-1',
      token: 'abc123',
      apiKey: 'key-456',
      api_key: 'key-789',
      secret: 's3cret',
      password: 'p@ss',
      webhook: 'https://hook.example.com',
      model: 'gpt-4',
    };
    const result = stripSensitiveFields(input);
    expect(result).toEqual({ name: 'agent-1', model: 'gpt-4' });
  });

  it('递归移除嵌套对象中的敏感字段', () => {
    const input = {
      name: 'agent-1',
      config: {
        token: 'nested-token',
        endpoint: 'https://api.example.com',
        inner: {
          secret: 'deep-secret',
          value: 42,
        },
      },
    };
    const result = stripSensitiveFields(input);
    expect(result).toEqual({
      name: 'agent-1',
      config: {
        endpoint: 'https://api.example.com',
        inner: {
          value: 42,
        },
      },
    });
  });

  it('处理数组中包含敏感字段的对象', () => {
    const input = {
      items: [
        { id: 1, token: 'arr-token', label: 'first' },
        { id: 2, password: 'arr-pass', label: 'second' },
      ],
    };
    const result = stripSensitiveFields(input);
    expect(result).toEqual({
      items: [
        { id: 1, label: 'first' },
        { id: 2, label: 'second' },
      ],
    });
  });

  it('空对象返回空对象', () => {
    expect(stripSensitiveFields({})).toEqual({});
  });

  it('保留所有非敏感字段', () => {
    const input = {
      name: 'test',
      model: 'gpt-4',
      workspace: '/tmp',
      enabled: true,
      count: 5,
    };
    const result = stripSensitiveFields(input);
    expect(result).toEqual(input);
  });

  it('不区分大小写匹配敏感字段（Token、API_KEY、SECRET 等）', () => {
    const input = {
      Token: 'upper-token',
      API_KEY: 'upper-api-key',
      SECRET: 'upper-secret',
      MyApiKey: 'camel-api-key',
      safe: 'keep-me',
    };
    const result = stripSensitiveFields(input);
    expect(result).toEqual({ safe: 'keep-me' });
  });
});

// ─── resolveAgentName ───────────────────────────────────────────────────────

describe('resolveAgentName', () => {
  it('名称无冲突时直接返回原名称', () => {
    expect(resolveAgentName('my-agent', ['other-agent'])).toBe('my-agent');
  });

  it('名称冲突时返回 name-2', () => {
    expect(resolveAgentName('my-agent', ['my-agent'])).toBe('my-agent-2');
  });

  it('name 和 name-2 都存在时返回 name-3', () => {
    expect(resolveAgentName('my-agent', ['my-agent', 'my-agent-2'])).toBe('my-agent-3');
  });

  it('existingNames 为空数组时直接返回原名称', () => {
    expect(resolveAgentName('my-agent', [])).toBe('my-agent');
  });
});

// ─── validatePassphrase ─────────────────────────────────────────────────────

describe('validatePassphrase', () => {
  it('空字符串返回 { valid: false }', () => {
    const result = validatePassphrase('');
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('7 个字符返回 { valid: false }', () => {
    const result = validatePassphrase('1234567');
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('8 个字符返回 { valid: true }', () => {
    const result = validatePassphrase('12345678');
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('更长的字符串返回 { valid: true }', () => {
    const result = validatePassphrase('this-is-a-very-long-passphrase');
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });
});

// ─── extractChannelBindings ─────────────────────────────────────────────────

describe('extractChannelBindings', () => {
  it('正确提取匹配 agentId 的 channel 类型', () => {
    const bindings = [
      { agentId: 'agent-1', match: { channel: 'wechat', accountId: 'acc-1', group: true } },
      { agentId: 'agent-1', match: { channel: 'telegram', accountId: 'acc-2' } },
    ];
    const result = extractChannelBindings(bindings, 'agent-1');
    expect(result).toHaveLength(2);
    expect(result[0].channel).toBe('wechat');
    expect(result[1].channel).toBe('telegram');
  });

  it('移除 matchRules 中的 accountId', () => {
    const bindings = [
      { agentId: 'agent-1', match: { channel: 'wechat', accountId: 'acc-1', group: true } },
    ];
    const result = extractChannelBindings(bindings, 'agent-1');
    expect(result[0].matchRules).toBeDefined();
    expect(result[0].matchRules).not.toHaveProperty('accountId');
  });

  it('agentId 不匹配时返回空数组', () => {
    const bindings = [
      { agentId: 'agent-2', match: { channel: 'wechat' } },
    ];
    const result = extractChannelBindings(bindings, 'agent-1');
    expect(result).toEqual([]);
  });

  it('bindings 为空数组时返回空数组', () => {
    expect(extractChannelBindings([], 'agent-1')).toEqual([]);
  });

  it('保留非敏感的匹配规则（如 group、dm）', () => {
    const bindings = [
      { agentId: 'agent-1', match: { channel: 'wechat', accountId: 'acc-1', group: true, dm: false } },
    ];
    const result = extractChannelBindings(bindings, 'agent-1');
    expect(result[0].matchRules).toEqual({ group: true, dm: false });
  });
});

// ─── collectSkillManifest ───────────────────────────────────────────────────

describe('collectSkillManifest', () => {
  it('agentToolsMd 为 undefined 时返回空数组', () => {
    const skills = [{ id: 'skill-1', name: 'Weather' }];
    expect(collectSkillManifest(undefined, skills)).toEqual([]);
  });

  it('没有匹配的 skill 时返回空数组', () => {
    const toolsMd = '# Tools\n- some-other-tool';
    const skills = [{ id: 'skill-1', name: 'Weather' }];
    expect(collectSkillManifest(toolsMd, skills)).toEqual([]);
  });

  it('识别 clawhub skill（无 path 属性）', () => {
    const toolsMd = '# Tools\n- skill-1: Weather lookup';
    const skills = [{ id: 'skill-1', name: 'Weather' }];
    const result = collectSkillManifest(toolsMd, skills);
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe('clawhub');
    expect(result[0].id).toBe('skill-1');
  });

  it('识别私有 skill（有 path 属性）', () => {
    const toolsMd = '# Tools\n- private-skill: Custom tool';
    const skills = [{ id: 'private-skill', name: 'Custom tool', path: '/local/skills/custom' }];
    const result = collectSkillManifest(toolsMd, skills);
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe('private');
    expect(result[0].id).toBe('private-skill');
  });

  it('通过 ID 匹配 TOOLS.md 中的 skill', () => {
    const toolsMd = '使用 skill-abc 进行天气查询';
    const skills = [{ id: 'skill-abc', name: 'Weather' }];
    const result = collectSkillManifest(toolsMd, skills);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('skill-abc');
  });

  it('通过名称匹配 TOOLS.md 中的 skill', () => {
    const toolsMd = '使用 Weather 进行天气查询';
    const skills = [{ id: 'skill-xyz', name: 'Weather' }];
    const result = collectSkillManifest(toolsMd, skills);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Weather');
  });
});
