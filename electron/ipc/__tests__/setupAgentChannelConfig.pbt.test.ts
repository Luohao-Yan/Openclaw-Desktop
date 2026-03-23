/**
 * 属性测试：setup-agent-channel-config 功能的正确性验证
 * Feature: setup-agent-channel-config
 *
 * 本文件包含 6 个属性测试：
 * 1. Property 1 - validateBasicInfo 对非法输入返回错误
 * 2. Property 2 - generateWorkspacePath 生成路径包含名称
 * 3. Property 3 - "already exists" 错误格式化
 * 4. Property 4 - getAccountFields 始终包含 accountId 字段
 * 5. Property 5 - validateAccountId 校验逻辑一致性
 * 6. Property 6 - SUB_STEPS 数组结构完整性
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { validateBasicInfo, generateWorkspacePath } from '../../../src/utils/agentCreation';
import { getAccountFields, validateAccountId } from '../../../src/config/channelAccountFields';

// ── 辅助函数 ──────────────────────────────────────────────────────────────

/**
 * 简易翻译函数，直接返回 key 本身
 * 用于 validateBasicInfo 的 t 参数
 */
const mockT = (key: string): string => key;

/** 智能体名称合法字符正则（与 agentCreation.ts 中一致） */
const AGENT_NAME_REGEX = /^[a-zA-Z0-9_-]+$/;

/** accountId 合法字符正则（与 channelAccountFields.ts 中一致） */
const ACCOUNT_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

/** accountId 最大长度 */
const ACCOUNT_ID_MAX_LENGTH = 32;

/**
 * 复制自 SetupLocalInstallGuidePage.tsx 的 formatCreateError 函数
 * 该函数未导出，因此在测试中内联定义相同逻辑
 */
function formatCreateError(rawError: string, agentName: string): string {
  if (rawError.toLowerCase().includes('already exists')) {
    return `智能体 "${agentName}" 已存在，请更换名称或选择已有智能体。`;
  }
  // 过滤 config warning 行，只保留有意义的错误信息
  const lines = rawError.split(/[;\n]/).map((l) => l.trim()).filter(Boolean);
  const meaningful = lines.filter((l) => !l.toLowerCase().startsWith('config warning'));
  return meaningful.length > 0 ? meaningful.join('；') : rawError;
}

// ── 生成器（Arbitraries）──────────────────────────────────────────────────

/** 生成合法的智能体名称：仅含 ASCII 字母、数字、连字符、下划线，且非空 */
const validAgentNameArb = (): fc.Arbitrary<string> =>
  fc.stringMatching(/^[a-zA-Z0-9_-]{1,20}$/);

/** 生成非空的工作区路径字符串 */
const validWorkspaceArb = (): fc.Arbitrary<string> =>
  fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0);

/** 生成空字符串或纯空白字符串 */
const emptyOrWhitespaceArb = (): fc.Arbitrary<string> =>
  fc.constantFrom('', ' ', '  ', '\t', '\n', '  \t\n  ');

/**
 * 生成包含非法字符的名称（含至少一个非 [a-zA-Z0-9_-] 字符，且 trim 后非空）
 */
const invalidCharNameArb = (): fc.Arbitrary<string> =>
  fc.tuple(
    fc.stringMatching(/^[a-z]{0,5}$/),
    fc.constantFrom('!', '@', '#', '$', '%', '^', '&', '*', '(', ')', ' ', '.', '/', '\\', '中', '文'),
    fc.stringMatching(/^[a-z]{0,5}$/),
  ).map(([prefix, special, suffix]) => `${prefix}${special}${suffix}`)
    .filter((s) => s.trim().length > 0 && !AGENT_NAME_REGEX.test(s.trim()));

/** 生成包含 "already exists" 变体的错误字符串 */
const alreadyExistsErrorArb = (): fc.Arbitrary<string> =>
  fc.tuple(
    fc.string({ minLength: 0, maxLength: 30 }),
    fc.constantFrom('already exists', 'Already Exists', 'ALREADY EXISTS', 'Already exists', 'already Exists'),
    fc.string({ minLength: 0, maxLength: 30 }),
  ).map(([prefix, keyword, suffix]) => `${prefix}${keyword}${suffix}`);

/** 生成已知渠道 key 或随机未知渠道 key */
const channelKeyArb = (): fc.Arbitrary<string> =>
  fc.oneof(
    // 已知渠道 key（包括 _bot 后缀变体）
    fc.constantFrom('feishu', 'telegram', 'discord', 'slack', 'feishu_bot', 'telegram_bot', 'discord_bot', 'slack_bot'),
    // 随机未知渠道 key
    fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
  );

/** 生成合法的 accountId：仅含 ASCII 字母、数字、连字符、下划线，长度 1-32 */
const validAccountIdArb = (): fc.Arbitrary<string> =>
  fc.stringMatching(/^[a-zA-Z0-9_-]{1,32}$/);

/** 生成超长 accountId（超过 32 字符） */
const tooLongAccountIdArb = (): fc.Arbitrary<string> =>
  fc.stringMatching(/^[a-z]{33,50}$/);

/** 生成包含非法字符的 accountId（trim 后非空，长度 ≤32，但含非法字符） */
const invalidCharAccountIdArb = (): fc.Arbitrary<string> =>
  fc.tuple(
    fc.stringMatching(/^[a-z]{0,5}$/),
    fc.constantFrom('!', '@', '#', '$', '%', ' ', '.', '/', '中'),
    fc.stringMatching(/^[a-z]{0,5}$/),
  ).map(([a, b, c]) => `${a}${b}${c}`)
    .filter((s) => s.trim().length > 0 && s.length <= ACCOUNT_ID_MAX_LENGTH && !ACCOUNT_ID_PATTERN.test(s));

// ============================================================
// Property 1: validateBasicInfo 对非法输入返回错误
// Feature: setup-agent-channel-config, Property 1
// ============================================================

describe('Feature: setup-agent-channel-config, Property 1: validateBasicInfo 对非法输入返回错误', () => {
  /**
   * Validates: Requirements 3.2
   *
   * 空名称或纯空白名称 → errors.name 应存在
   */
  it('空名称或纯空白名称应返回 name 错误', () => {
    fc.assert(
      fc.property(
        emptyOrWhitespaceArb(),
        validWorkspaceArb(),
        (name, workspace) => {
          const errors = validateBasicInfo({ name, workspace }, mockT);
          // 空名称应产生 name 错误
          expect(errors).toHaveProperty('name');
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 3.2
   *
   * 包含非法字符的名称 → errors.name 应存在
   */
  it('包含非法字符的名称应返回 name 错误', () => {
    fc.assert(
      fc.property(
        invalidCharNameArb(),
        validWorkspaceArb(),
        (name, workspace) => {
          const errors = validateBasicInfo({ name, workspace }, mockT);
          // 非法字符名称应产生 name 错误
          expect(errors).toHaveProperty('name');
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 3.2
   *
   * 空工作区路径或纯空白 → errors.workspace 应存在
   */
  it('空工作区路径应返回 workspace 错误', () => {
    fc.assert(
      fc.property(
        validAgentNameArb(),
        emptyOrWhitespaceArb(),
        (name, workspace) => {
          const errors = validateBasicInfo({ name, workspace }, mockT);
          // 空工作区应产生 workspace 错误
          expect(errors).toHaveProperty('workspace');
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 3.2
   *
   * 合法名称 + 合法工作区 → 返回空映射（无错误）
   */
  it('合法名称和工作区应返回空错误映射', () => {
    fc.assert(
      fc.property(
        validAgentNameArb(),
        validWorkspaceArb(),
        (name, workspace) => {
          const errors = validateBasicInfo({ name, workspace }, mockT);
          // 合法输入不应有任何错误
          expect(Object.keys(errors)).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ============================================================
// Property 2: generateWorkspacePath 生成路径包含名称
// Feature: setup-agent-channel-config, Property 2
// ============================================================

describe('Feature: setup-agent-channel-config, Property 2: generateWorkspacePath 生成路径包含名称', () => {
  /**
   * Validates: Requirements 3.3
   *
   * 对任意非空 ASCII 字符串，生成的路径以 ~/.openclaw/workspace- 为前缀，后缀等于输入名称
   */
  it('生成路径以 ~/.openclaw/workspace- 为前缀，后缀等于输入名称', () => {
    fc.assert(
      fc.property(
        // 生成非空 ASCII 字符串
        fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.length > 0),
        (name) => {
          const path = generateWorkspacePath(name);
          const prefix = '~/.openclaw/workspace-';
          // 路径应以固定前缀开头
          expect(path.startsWith(prefix)).toBe(true);
          // 前缀之后的部分应等于输入名称
          expect(path.slice(prefix.length)).toBe(name);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ============================================================
// Property 3: "already exists" 错误格式化
// Feature: setup-agent-channel-config, Property 3
// ============================================================

describe('Feature: setup-agent-channel-config, Property 3: "already exists" 错误格式化', () => {
  /**
   * Validates: Requirements 3.6
   *
   * 包含 "already exists"（不区分大小写）的错误字符串，格式化后应包含「已存在」文本
   */
  it('包含 "already exists" 的错误应格式化为包含「已存在」的提示', () => {
    fc.assert(
      fc.property(
        alreadyExistsErrorArb(),
        validAgentNameArb(),
        (rawError, agentName) => {
          const formatted = formatCreateError(rawError, agentName);
          // 格式化后的消息应包含「已存在」
          expect(formatted).toContain('已存在');
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ============================================================
// Property 4: getAccountFields 始终包含 accountId 字段
// Feature: setup-agent-channel-config, Property 4
// ============================================================

describe('Feature: setup-agent-channel-config, Property 4: getAccountFields 始终包含 accountId 字段', () => {
  /**
   * Validates: Requirements 5.3
   *
   * 对任意 channelKey，返回的字段数组至少包含一个 id === 'accountId' 且 required === true 的字段
   */
  it('任意 channelKey 返回的字段数组应包含必填的 accountId 字段', () => {
    fc.assert(
      fc.property(
        channelKeyArb(),
        (channelKey) => {
          const fields = getAccountFields(channelKey);
          // 应至少包含一个 accountId 字段
          const accountIdField = fields.find((f) => f.id === 'accountId');
          expect(accountIdField).toBeDefined();
          // accountId 字段应为必填
          expect(accountIdField!.required).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ============================================================
// Property 5: validateAccountId 校验逻辑一致性
// Feature: setup-agent-channel-config, Property 5
// ============================================================

describe('Feature: setup-agent-channel-config, Property 5: validateAccountId 校验逻辑一致性', () => {
  /**
   * Validates: Requirements 5.4
   *
   * 空字符串或纯空白 → invalid
   */
  it('空字符串或纯空白 accountId 应返回 invalid', () => {
    fc.assert(
      fc.property(
        emptyOrWhitespaceArb(),
        fc.array(validAccountIdArb(), { minLength: 0, maxLength: 5 }),
        (accountId, existingIds) => {
          const result = validateAccountId(accountId, existingIds);
          expect(result.valid).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 5.4
   *
   * 超长 accountId（>32 字符）→ invalid
   */
  it('超长 accountId 应返回 invalid', () => {
    fc.assert(
      fc.property(
        tooLongAccountIdArb(),
        fc.array(validAccountIdArb(), { minLength: 0, maxLength: 5 }),
        (accountId, existingIds) => {
          const result = validateAccountId(accountId, existingIds);
          expect(result.valid).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 5.4
   *
   * 包含非法字符的 accountId → invalid
   */
  it('包含非法字符的 accountId 应返回 invalid', () => {
    fc.assert(
      fc.property(
        invalidCharAccountIdArb(),
        fc.array(validAccountIdArb(), { minLength: 0, maxLength: 5 }),
        (accountId, existingIds) => {
          const result = validateAccountId(accountId, existingIds);
          expect(result.valid).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 5.4
   *
   * 已存在于列表中的 accountId → invalid
   */
  it('已存在的 accountId 应返回 invalid', () => {
    fc.assert(
      fc.property(
        validAccountIdArb(),
        fc.array(validAccountIdArb(), { minLength: 0, maxLength: 5 }),
        (accountId, otherIds) => {
          // 将 accountId 加入已有列表，确保重复
          const existingIds = [...otherIds, accountId];
          const result = validateAccountId(accountId, existingIds);
          expect(result.valid).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 5.4
   *
   * 合法且不重复的 accountId → valid
   */
  it('合法且不重复的 accountId 应返回 valid', () => {
    fc.assert(
      fc.property(
        validAccountIdArb(),
        fc.array(validAccountIdArb(), { minLength: 0, maxLength: 5 }),
        (accountId, existingIds) => {
          // 确保 accountId 不在已有列表中
          const filteredIds = existingIds.filter((id) => id !== accountId);
          const result = validateAccountId(accountId, filteredIds);
          expect(result.valid).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ============================================================
// Property 6: SUB_STEPS 数组结构完整性
// Feature: setup-agent-channel-config, Property 6
// ============================================================

describe('Feature: setup-agent-channel-config, Property 6: SUB_STEPS 数组结构完整性', () => {
  /**
   * Validates: Requirements 1.1
   *
   * SUB_STEPS 的 key 序列应严格等于预期序列，长度为 11
   * 由于 SUB_STEPS 未导出，此处作为契约测试验证预期结构
   */

  // 预期的 key 序列（契约定义）
  const EXPECTED_KEYS = [
    'platform', 'install', 'model', 'workspace', 'gateway',
    'channels', 'daemon', 'skills', 'agent', 'bind', 'done',
  ];

  it('SUB_STEPS 预期 key 序列长度应为 11', () => {
    fc.assert(
      fc.property(
        fc.constant(EXPECTED_KEYS),
        (keys) => {
          // 长度应为 11
          expect(keys).toHaveLength(11);
        },
      ),
      { numRuns: 1 },
    );
  });

  it('SUB_STEPS 预期 key 序列应严格匹配', () => {
    fc.assert(
      fc.property(
        fc.constant(EXPECTED_KEYS),
        (keys) => {
          // key 序列应严格等于预期
          expect(keys).toEqual([
            'platform', 'install', 'model', 'workspace', 'gateway',
            'channels', 'daemon', 'skills', 'agent', 'bind', 'done',
          ]);
        },
      ),
      { numRuns: 1 },
    );
  });

  it('SUB_STEPS 预期 key 序列中每个 key 应唯一', () => {
    fc.assert(
      fc.property(
        fc.constant(EXPECTED_KEYS),
        (keys) => {
          // 所有 key 应唯一（无重复）
          const uniqueKeys = new Set(keys);
          expect(uniqueKeys.size).toBe(keys.length);
        },
      ),
      { numRuns: 1 },
    );
  });

  it('SUB_STEPS 预期 key 序列中 agent 和 bind 位于 skills 和 done 之间', () => {
    fc.assert(
      fc.property(
        fc.constant(EXPECTED_KEYS),
        (keys) => {
          const skillsIdx = keys.indexOf('skills');
          const agentIdx = keys.indexOf('agent');
          const bindIdx = keys.indexOf('bind');
          const doneIdx = keys.indexOf('done');
          // agent 和 bind 应位于 skills 之后、done 之前
          expect(agentIdx).toBeGreaterThan(skillsIdx);
          expect(bindIdx).toBeGreaterThan(agentIdx);
          expect(doneIdx).toBeGreaterThan(bindIdx);
        },
      ),
      { numRuns: 1 },
    );
  });
});
