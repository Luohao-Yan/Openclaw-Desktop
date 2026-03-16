/**
 * 属性测试：渠道操作核心逻辑
 * Feature: channel-binding-config
 * 覆盖 Property 1 ~ 8
 */

import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  SUPPORTED_CHANNEL_TYPES,
  addChannelToConfig,
  deleteChannelFromConfig,
  updateChannelConfig,
  addAccountToChannel,
  deleteAccountFromChannel,
  computeChannelSummary,
  getChannelBindingCount,
  isAccountIdDuplicate,
  fieldIdToCliFlag,
  buildChannelAddArgs,
} from '../channelOps';
import type { OpenClawConfig } from '../bindingOps';

// ============================================================
// 生成器（Arbitraries）
// ============================================================

/** Object 原型上的保留属性名，避免生成器产生这些值导致误判 */
const PROTO_KEYS = new Set([
  'constructor', 'toString', 'valueOf', 'hasOwnProperty',
  'isPrototypeOf', 'propertyIsEnumerable', 'toLocaleString',
  '__proto__', '__defineGetter__', '__defineSetter__',
  '__lookupGetter__', '__lookupSetter__',
]);

/** 生成非空非纯空白且不与 Object 原型属性冲突的字符串 */
const nonEmptyString = () =>
  fc.string({ minLength: 1 }).filter(
    (s) => s.trim().length > 0 && !PROTO_KEYS.has(s),
  );

/** 生成合法的渠道类型标识符（从支持列表中随机选取） */
const supportedChannelTypeArb = () =>
  fc.constantFrom(...SUPPORTED_CHANNEL_TYPES.map((t) => t.id));

/** 生成随机账号对象：{ [accountId]: config } */
const accountsArb = () =>
  fc.dictionary(
    nonEmptyString(),
    fc.record({ enabled: fc.boolean(), botName: fc.string() }),
  );

/** 生成随机渠道配置对象 */
const channelRecordArb = () =>
  fc.record({
    enabled: fc.boolean(),
    accounts: accountsArb(),
  });

/** 生成随机 channels 对象 */
const channelsArb = () =>
  fc.dictionary(nonEmptyString(), channelRecordArb());

/** 生成随机绑定记录 */
const bindingRecordArb = () =>
  fc.record({
    agentId: nonEmptyString(),
    match: fc.record({
      channel: nonEmptyString(),
      accountId: nonEmptyString(),
    }),
    enabled: fc.boolean(),
  });

/** 生成包含随机渠道和绑定的完整配置 */
const configArb = () =>
  fc.tuple(channelsArb(), fc.array(bindingRecordArb(), { maxLength: 20 })).map(
    ([channels, bindings]): OpenClawConfig => ({ channels, bindings }),
  );

// ============================================================
// Property 1: 渠道状态摘要计算正确性
// Feature: channel-binding-config, Property 1: Channel summary computation
// ============================================================

describe('Property 1: 渠道状态摘要计算正确性', () => {
  /**
   * Validates: Requirements 1.1, 1.2, 5.3
   *
   * 对于任意配置，computeChannelSummary 返回的各字段应与手动计算一致：
   * - totalChannels = Object.keys(channels).length
   * - enabledChannels = enabled === true 的渠道数
   * - totalAccounts = 所有渠道 accounts 键数之和
   * - totalBindings = bindings.length
   */
  test('摘要各字段与手动计算一致', () => {
    fc.assert(
      fc.property(configArb(), (config) => {
        const summary = computeChannelSummary(config);
        const channels = config.channels || {};
        const keys = Object.keys(channels);

        // totalChannels
        expect(summary.totalChannels).toBe(keys.length);

        // enabledChannels
        const expectedEnabled = keys.filter((k) => channels[k]?.enabled === true).length;
        expect(summary.enabledChannels).toBe(expectedEnabled);

        // totalAccounts
        const expectedAccounts = keys.reduce((sum, k) => {
          const accs = channels[k]?.accounts;
          return sum + (accs && typeof accs === 'object' ? Object.keys(accs).length : 0);
        }, 0);
        expect(summary.totalAccounts).toBe(expectedAccounts);

        // totalBindings
        expect(summary.totalBindings).toBe(config.bindings.length);
      }),
      { numRuns: 100 },
    );
  });

  test('getChannelBindingCount 返回正确的绑定数量', () => {
    fc.assert(
      fc.property(configArb(), nonEmptyString(), (config, channelType) => {
        const count = getChannelBindingCount(config, channelType);
        const expected = config.bindings.filter(
          (b) => b.match.channel === channelType,
        ).length;
        expect(count).toBe(expected);
      }),
      { numRuns: 100 },
    );
  });
});

// ============================================================
// Property 2: 支持的渠道类型完整性
// Feature: channel-binding-config, Property 2: Supported channel types completeness
// ============================================================

describe('Property 2: 支持的渠道类型完整性', () => {
  /**
   * Validates: Requirements 1.5
   *
   * SUPPORTED_CHANNEL_TYPES 应有 22 个条目，每个条目的 id、name 非空，hasForm 为布尔值，
   * 且包含所有官方渠道类型标识符。
   */
  test('列表包含 22 个条目，每个条目结构正确', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...SUPPORTED_CHANNEL_TYPES),
        (entry) => {
          // id 非空
          expect(typeof entry.id).toBe('string');
          expect(entry.id.length).toBeGreaterThan(0);

          // name 非空
          expect(typeof entry.name).toBe('string');
          expect(entry.name.length).toBeGreaterThan(0);

          // hasForm 为布尔值
          expect(typeof entry.hasForm).toBe('boolean');
        },
      ),
      { numRuns: 100 },
    );
  });

  test('列表总长度为 22，包含所有官方渠道类型', () => {
    expect(SUPPORTED_CHANNEL_TYPES.length).toBe(22);

    const expectedIds = [
      'bluebubbles', 'discord', 'feishu', 'googlechat', 'imessage',
      'irc', 'line', 'matrix', 'mattermost', 'msteams',
      'nextcloudtalk', 'nostr', 'signal', 'synologychat', 'slack',
      'telegram', 'tlon', 'twitch', 'webchat', 'whatsapp',
      'zalo', 'zalopersonal',
    ];
    const actualIds = SUPPORTED_CHANNEL_TYPES.map((t) => t.id);
    for (const id of expectedIds) {
      expect(actualIds).toContain(id);
    }
  });
});

// ============================================================
// Property 3: 添加渠道创建正确的初始配置
// Feature: channel-binding-config, Property 3: Add channel creates correct initial config
// ============================================================

describe('Property 3: 添加渠道创建正确的初始配置', () => {
  /**
   * Validates: Requirements 1.6
   *
   * 对于任意支持的渠道类型，addChannelToConfig 应创建 { enabled: false, accounts: {} }，
   * 且其他已有渠道保持不变。
   */
  test('新渠道初始配置正确，其他渠道不变', () => {
    fc.assert(
      fc.property(configArb(), supportedChannelTypeArb(), (config, channelType) => {
        const result = addChannelToConfig(config, channelType);

        // 新渠道存在且初始配置正确
        expect(result.channels?.[channelType]).toBeDefined();
        expect(result.channels![channelType].enabled).toBe(false);
        expect(result.channels![channelType].accounts).toEqual({});

        // 其他已有渠道保持不变
        const originalChannels = config.channels || {};
        for (const key of Object.keys(originalChannels)) {
          if (key !== channelType) {
            expect(result.channels![key]).toEqual(originalChannels[key]);
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ============================================================
// Property 4: 删除渠道同时清理关联绑定
// Feature: channel-binding-config, Property 4: Delete channel removes associated bindings
// ============================================================

describe('Property 4: 删除渠道同时清理关联绑定', () => {
  /**
   * Validates: Requirements 1.7
   *
   * 删除渠道后：
   * - channels[channelType] 不存在
   * - bindings 中不包含 match.channel === channelType 的记录
   * - 其他渠道和不相关绑定保持不变
   */
  test('删除渠道后渠道和关联绑定均被移除，其他数据不变', () => {
    fc.assert(
      fc.property(configArb(), nonEmptyString(), (config, channelType) => {
        // 确保配置中存在该渠道
        const configWithChannel = addChannelToConfig(config, channelType);

        const result = deleteChannelFromConfig(configWithChannel, channelType);

        // 渠道已被移除（使用 hasOwnProperty 避免原型链属性干扰）
        expect(Object.prototype.hasOwnProperty.call(result.channels || {}, channelType)).toBe(false);

        // 关联绑定已被清理
        const remainingBindings = result.bindings.filter(
          (b) => b.match.channel === channelType,
        );
        expect(remainingBindings.length).toBe(0);

        // 其他渠道保持不变
        const originalChannels = configWithChannel.channels || {};
        for (const key of Object.keys(originalChannels)) {
          if (key !== channelType) {
            expect(result.channels![key]).toEqual(originalChannels[key]);
          }
        }

        // 不相关绑定保持不变
        const unrelatedBefore = configWithChannel.bindings.filter(
          (b) => b.match.channel !== channelType,
        );
        const unrelatedAfter = result.bindings.filter(
          (b) => b.match.channel !== channelType,
        );
        expect(unrelatedAfter).toEqual(unrelatedBefore);
      }),
      { numRuns: 100 },
    );
  });
});

// ============================================================
// Property 5: 渠道类型表单模板标记正确性
// Feature: channel-binding-config, Property 5: Channel type form template correctness
// ============================================================

describe('Property 5: 渠道类型表单模板标记正确性', () => {
  /**
   * Validates: Requirements 2.3, 3.6
   *
   * 仅 feishu 的 hasForm 为 true，其他所有渠道的 hasForm 为 false。
   */
  test('仅 feishu 有专用表单模板', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...SUPPORTED_CHANNEL_TYPES),
        (entry) => {
          if (entry.id === 'feishu') {
            expect(entry.hasForm).toBe(true);
          } else {
            expect(entry.hasForm).toBe(false);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ============================================================
// Property 6: 渠道配置更新隔离性
// Feature: channel-binding-config, Property 6: Channel config update isolation
// ============================================================

describe('Property 6: 渠道配置更新隔离性', () => {
  /**
   * Validates: Requirements 2.4, 7.3
   *
   * updateChannelConfig 仅修改目标渠道的顶层字段，accounts 保持不变，
   * 其他渠道配置完全不受影响。
   */
  test('更新仅影响目标渠道顶层字段，accounts 和其他渠道不变', () => {
    fc.assert(
      fc.property(
        configArb(),
        nonEmptyString(),
        fc.record({ enabled: fc.boolean(), domain: fc.string(), extra: fc.string() }),
        (config, channelType, updates) => {
          // 确保配置中存在该渠道（带一些账号）
          const withChannel = addAccountToChannel(
            addChannelToConfig(config, channelType),
            channelType,
            'test-account',
            { token: 'abc' },
          );

          const originalAccounts = withChannel.channels![channelType].accounts;
          const result = updateChannelConfig(withChannel, channelType, updates);

          // accounts 保持不变
          expect(result.channels![channelType].accounts).toEqual(originalAccounts);

          // 顶层字段已更新（排除 accounts）
          const { accounts: _a, ...resultTop } = result.channels![channelType];
          expect(resultTop.enabled).toBe(updates.enabled);
          expect(resultTop.domain).toBe(updates.domain);
          expect(resultTop.extra).toBe(updates.extra);

          // 其他渠道不受影响
          const originalChannels = withChannel.channels || {};
          for (const key of Object.keys(originalChannels)) {
            if (key !== channelType) {
              expect(result.channels![key]).toEqual(originalChannels[key]);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ============================================================
// Property 7: 账号添加与重复检测
// Feature: channel-binding-config, Property 7: Account add and duplicate detection
// ============================================================

describe('Property 7: 账号添加与重复检测', () => {
  /**
   * Validates: Requirements 3.3, 3.8
   *
   * - 添加新账号后 accounts 键数量增加 1
   * - isAccountIdDuplicate 对已存在的账号返回 true
   */
  test('添加新账号后数量增加 1', () => {
    fc.assert(
      fc.property(
        configArb(),
        supportedChannelTypeArb(),
        nonEmptyString(),
        (config, channelType, accountId) => {
          // 确保渠道存在
          const withChannel = addChannelToConfig(config, channelType);

          // 前置条件：账号 ID 不存在
          fc.pre(!isAccountIdDuplicate(withChannel, channelType, accountId));

          const before = Object.keys(
            withChannel.channels![channelType].accounts || {},
          ).length;

          const result = addAccountToChannel(withChannel, channelType, accountId);
          const after = Object.keys(
            result.channels![channelType].accounts || {},
          ).length;

          // 数量增加 1
          expect(after).toBe(before + 1);

          // 新账号存在
          expect(result.channels![channelType].accounts[accountId]).toBeDefined();
        },
      ),
      { numRuns: 100 },
    );
  });

  test('isAccountIdDuplicate 对已存在的账号返回 true', () => {
    fc.assert(
      fc.property(
        configArb(),
        supportedChannelTypeArb(),
        nonEmptyString(),
        (config, channelType, accountId) => {
          // 确保渠道存在并添加账号
          const withChannel = addChannelToConfig(config, channelType);
          const withAccount = addAccountToChannel(withChannel, channelType, accountId);

          // 重复检测应返回 true
          expect(isAccountIdDuplicate(withAccount, channelType, accountId)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ============================================================
// Property 8: 账号删除正确性
// Feature: channel-binding-config, Property 8: Account deletion
// ============================================================

describe('Property 8: 账号删除正确性', () => {
  /**
   * Validates: Requirements 3.7
   *
   * 删除账号后：
   * - 该账号不再存在
   * - accounts 键数量减少 1
   * - 其他账号保持不变
   */
  test('删除账号后数量减少 1，其他账号不变', () => {
    fc.assert(
      fc.property(
        configArb(),
        supportedChannelTypeArb(),
        nonEmptyString(),
        nonEmptyString(),
        (config, channelType, accountId, otherAccountId) => {
          // 前置条件：两个账号 ID 不同
          fc.pre(accountId !== otherAccountId);

          // 确保渠道存在并添加两个账号
          const withChannel = addChannelToConfig(config, channelType);
          const withAccounts = addAccountToChannel(
            addAccountToChannel(withChannel, channelType, accountId, { role: 'main' }),
            channelType,
            otherAccountId,
            { role: 'backup' },
          );

          const before = Object.keys(
            withAccounts.channels![channelType].accounts || {},
          ).length;

          const result = deleteAccountFromChannel(withAccounts, channelType, accountId);
          const after = Object.keys(
            result.channels![channelType].accounts || {},
          ).length;

          // 数量减少 1
          expect(after).toBe(before - 1);

          // 被删除的账号不存在（使用 hasOwnProperty 避免原型链属性干扰）
          expect(
            Object.prototype.hasOwnProperty.call(
              result.channels![channelType].accounts,
              accountId,
            ),
          ).toBe(false);

          // 其他账号保持不变
          expect(result.channels![channelType].accounts[otherAccountId]).toEqual(
            withAccounts.channels![channelType].accounts[otherAccountId],
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ============================================================
// Property 12: i18n 键值完整性
// Feature: channel-binding-config, Property 12: i18n key completeness
// ============================================================

import { translations } from '../../i18n/translations';

describe('Property 12: i18n 键值完整性', () => {
  /**
   * Validates: Requirements 8.1
   *
   * 对于任意 channels.* 前缀的 i18n 键，该键必须同时存在于 en 和 zh 语言包中，
   * 且值为非空字符串。
   */

  /** 收集 en 语言包中所有 channels.* 前缀的键 */
  const enKeys = Object.keys(translations.en).filter((k) => k.startsWith('channels.'));
  /** 收集 zh 语言包中所有 channels.* 前缀的键 */
  const zhKeys = Object.keys(translations.zh).filter((k) => k.startsWith('channels.'));
  /** 合并去重，得到所有 channels.* 键 */
  const allChannelKeys = [...new Set([...enKeys, ...zhKeys])];

  test('所有 channels.* 键在 en 和 zh 中均存在且为非空字符串', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...allChannelKeys),
        (key) => {
          const enValue = (translations.en as Record<string, string>)[key];
          const zhValue = (translations.zh as Record<string, string>)[key];

          // 键在 en 中存在且为非空字符串
          expect(typeof enValue).toBe('string');
          expect(enValue.length).toBeGreaterThan(0);

          // 键在 zh 中存在且为非空字符串
          expect(typeof zhValue).toBe('string');
          expect(zhValue.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  test('en 和 zh 的 channels.* 键集合完全一致', () => {
    // 确保两个语言包的 channels.* 键集合相同
    expect(enKeys.sort()).toEqual(zhKeys.sort());
  });
});

// ============================================================
// Property 13: JSON 序列化往返与无效 JSON 拒绝
// Feature: channel-binding-config, Property 13: JSON round-trip and invalid rejection
// ============================================================

describe('Property 13: JSON 序列化往返与无效 JSON 拒绝', () => {
  /**
   * Validates: Requirements 9.2, 9.3
   *
   * 对于任意合法的 channels 配置对象，JSON.stringify 后再 JSON.parse
   * 应产生与原始对象深度相等的结果（round-trip）。
   * 对于任意非法 JSON 字符串，JSON.parse 应抛出错误。
   */

  test('合法 channels 配置对象的 JSON 序列化往返保持等价', () => {
    fc.assert(
      fc.property(channelsArb(), (channels) => {
        // 序列化后再反序列化，应与原始对象深度相等
        const serialized = JSON.stringify(channels);
        const deserialized = JSON.parse(serialized);
        expect(deserialized).toEqual(channels);
      }),
      { numRuns: 100 },
    );
  });

  test('非法 JSON 字符串解析应抛出错误', () => {
    /** 生成一定不是合法 JSON 的字符串 */
    const invalidJsonArb = fc.oneof(
      // 缺少闭合花括号
      fc.constant('{'),
      // 缺少引号的键
      fc.constant('{a:1}'),
      // 值缺失
      fc.constant('{"key": }'),
      // 多余逗号
      fc.constant('{,}'),
      // 尾部多余逗号
      fc.constant('{"a": 1,}'),
      // 单引号（JSON 不允许）
      fc.constant("{'key': 'value'}"),
      // 截断的字符串
      fc.constant('{"key": "val'),
      // 空字符串
      fc.constant(''),
      // 纯文本（非 JSON）
      fc.constant('not json at all'),
      // 截断的数组
      fc.constant('[1, 2,'),
    );

    fc.assert(
      fc.property(invalidJsonArb, (invalidJson) => {
        // 解析非法 JSON 应抛出 SyntaxError
        expect(() => JSON.parse(invalidJson)).toThrow();
      }),
      { numRuns: 100 },
    );
  });
});

// ============================================================
// 新增导入：高级配置函数（Property 14-20）
// ============================================================

import {
  updatePairingDmPolicy,
  addPairingNode,
  deletePairingNode,
  updateGroupMessagesConfig,
  updateGroupMessagesOverride,
  validateKeywords,
  addGroup,
  updateGroup,
  deleteGroup,
  isGroupIdDuplicate,
  addBroadcastGroup,
  updateBroadcastGroup,
  deleteBroadcastGroup,
  addRoutingRule,
  updateRoutingRule,
  deleteRoutingRule,
  sortRoutingRulesByPriority,
  updateLocationParsingConfig,
  updateLocationParsingRule,
  validateRegexPattern,
} from '../channelOps';
import type {
  PairingNode,
  GroupRecord,
  BroadcastGroupRecord,
  BroadcastTarget,
  RoutingRule,
  LocationParsingRule,
  GroupMessagesOverride,
} from '../channelOps';


// ============================================================
// 高级配置生成器（Arbitraries）- Property 14-20
// ============================================================

/** 生成随机配对策略 */
const pairingPolicyArb = () =>
  fc.constantFrom('auto' as const, 'manual' as const, 'deny' as const);

/** 生成随机节点配对记录 */
const pairingNodeArb = (): fc.Arbitrary<PairingNode> =>
  fc.record({
    id: nonEmptyString(),
    name: fc.option(nonEmptyString(), { nil: undefined }),
    status: fc.option(
      fc.constantFrom('active' as const, 'inactive' as const),
      { nil: undefined },
    ),
  });


/** 生成随机群消息覆盖配置 */
const groupMessagesOverrideArb = (): fc.Arbitrary<Partial<GroupMessagesOverride>> =>
  fc.record({
    enabled: fc.option(fc.boolean(), { nil: undefined }),
    requireMention: fc.option(fc.boolean(), { nil: undefined }),
    keywords: fc.option(fc.array(fc.string(), { maxLength: 5 }), { nil: undefined }),
    prefix: fc.option(fc.string(), { nil: undefined }),
  });

/** 生成随机群组记录 */
const groupRecordArb = (): fc.Arbitrary<GroupRecord> =>
  fc.record({
    channel: nonEmptyString(),
    name: fc.option(nonEmptyString(), { nil: undefined }),
    enabled: fc.option(fc.boolean(), { nil: undefined }),
  });


/** 生成随机广播目标 */
const broadcastTargetArb = (): fc.Arbitrary<BroadcastTarget> =>
  fc.record({
    type: fc.constantFrom('channel' as const, 'group' as const),
    id: nonEmptyString(),
    accountId: fc.option(nonEmptyString(), { nil: undefined }),
  });

/** 生成随机广播群组记录 */
const broadcastGroupRecordArb = (): fc.Arbitrary<BroadcastGroupRecord> =>
  fc.record({
    name: nonEmptyString(),
    targets: fc.array(broadcastTargetArb(), { maxLength: 5 }),
    enabled: fc.option(fc.boolean(), { nil: undefined }),
  });


/** 生成随机路由规则 */
const routingRuleArb = (): fc.Arbitrary<RoutingRule> =>
  fc.record({
    name: nonEmptyString(),
    match: fc.record({
      channel: fc.option(nonEmptyString(), { nil: undefined }),
      accountId: fc.option(nonEmptyString(), { nil: undefined }),
      source: fc.option(nonEmptyString(), { nil: undefined }),
    }),
    agentId: nonEmptyString(),
    priority: fc.integer({ min: 0, max: 1000 }),
    enabled: fc.option(fc.boolean(), { nil: undefined }),
  });

/** 生成随机位置解析规则 */
const locationParsingRuleArb = (): fc.Arbitrary<LocationParsingRule> =>
  fc.oneof(
    fc.record({
      mode: fc.constant('regex' as const),
      pattern: fc.constant('^loc:(\\d+),(\\d+)$'),
      fieldMapping: fc.option(
        fc.dictionary(nonEmptyString(), nonEmptyString()),
        { nil: undefined },
      ),
    }),
    fc.record({
      mode: fc.constant('predefined' as const),
      format: fc.option(nonEmptyString(), { nil: undefined }),
      fieldMapping: fc.option(
        fc.dictionary(nonEmptyString(), nonEmptyString()),
        { nil: undefined },
      ),
    }),
  );


// ============================================================
// Property 14: 配对配置更新隔离性
// Feature: channel-binding-config, Property 14: Pairing config update isolation
// ============================================================

describe('Property 14: 配对配置更新隔离性', () => {
  /**
   * Validates: Requirements 11.2, 11.3, 11.5, 11.6
   *
   * - updatePairingDmPolicy 仅修改 pairing.dm.policy，其他配置不变
   * - addPairingNode 追加节点，数组长度增加 1
   * - deletePairingNode 按 id 移除节点，其他节点不变
   */
  test('updatePairingDmPolicy 仅修改 pairing.dm.policy，其他配置不变', () => {
    fc.assert(
      fc.property(configArb(), pairingPolicyArb(), (config, policy) => {
        const result = updatePairingDmPolicy(config, policy);

        // pairing.dm.policy 应等于设置的值
        expect((result as any).pairing.dm.policy).toBe(policy);

        // channels 和 bindings 保持不变
        expect(result.channels).toEqual(config.channels);
        expect(result.bindings).toEqual(config.bindings);
      }),
      { numRuns: 100 },
    );
  });


  test('addPairingNode 追加节点，数组长度增加 1', () => {
    fc.assert(
      fc.property(configArb(), pairingNodeArb(), (config, node) => {
        const before = ((config as any).pairing?.nodes || []).length;
        const result = addPairingNode(config, node);
        const after = ((result as any).pairing.nodes || []).length;

        // 数组长度增加 1
        expect(after).toBe(before + 1);

        // 新节点存在于数组末尾
        const nodes = (result as any).pairing.nodes;
        expect(nodes[nodes.length - 1]).toEqual(node);

        // channels 和 bindings 保持不变
        expect(result.channels).toEqual(config.channels);
        expect(result.bindings).toEqual(config.bindings);
      }),
      { numRuns: 100 },
    );
  });


  test('deletePairingNode 按 id 移除节点，其他节点不变', () => {
    fc.assert(
      fc.property(
        configArb(),
        pairingNodeArb(),
        pairingNodeArb(),
        (config, node1, node2) => {
          // 前置条件：两个节点 ID 不同
          fc.pre(node1.id !== node2.id);

          // 添加两个节点
          const withNodes = addPairingNode(addPairingNode(config, node1), node2);
          const before = ((withNodes as any).pairing.nodes || []).length;

          // 删除第一个节点
          const result = deletePairingNode(withNodes, node1.id);
          const after = ((result as any).pairing.nodes || []).length;

          // 数组长度减少 1
          expect(after).toBe(before - 1);

          // 被删除的节点不再存在
          const remaining = (result as any).pairing.nodes as PairingNode[];
          expect(remaining.some((n) => n.id === node1.id)).toBe(false);

          // 另一个节点仍然存在
          expect(remaining.some((n) => n.id === node2.id)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});


// ============================================================
// Property 15: 群消息配置更新与验证正确性
// Feature: channel-binding-config, Property 15: Group messages config update and validation
// ============================================================

describe('Property 15: 群消息配置更新与验证正确性', () => {
  /**
   * Validates: Requirements 12.2, 12.3, 12.4, 12.5, 12.6
   *
   * - updateGroupMessagesConfig 正确合并全局配置
   * - updateGroupMessagesOverride 仅影响目标渠道
   * - validateKeywords 过滤空字符串
   */
  test('updateGroupMessagesConfig 正确合并全局配置，其他配置不变', () => {
    fc.assert(
      fc.property(
        configArb(),
        fc.record({
          enabled: fc.boolean(),
          requireMention: fc.boolean(),
          keywords: fc.array(nonEmptyString(), { maxLength: 5 }),
          prefix: fc.string(),
        }),
        (config, updates) => {
          const result = updateGroupMessagesConfig(config, updates);
          const gm = (result as any).groupMessages;

          // 更新值应正确反映
          expect(gm.enabled).toBe(updates.enabled);
          expect(gm.requireMention).toBe(updates.requireMention);
          expect(gm.keywords).toEqual(updates.keywords);
          expect(gm.prefix).toBe(updates.prefix);

          // channels 和 bindings 保持不变
          expect(result.channels).toEqual(config.channels);
          expect(result.bindings).toEqual(config.bindings);
        },
      ),
      { numRuns: 100 },
    );
  });


  test('updateGroupMessagesOverride 仅影响目标渠道覆盖', () => {
    fc.assert(
      fc.property(
        configArb(),
        nonEmptyString(),
        nonEmptyString(),
        groupMessagesOverrideArb(),
        groupMessagesOverrideArb(),
        (config, ch1, ch2, override1, override2) => {
          // 前置条件：两个渠道类型不同
          fc.pre(ch1 !== ch2);

          // 先为 ch1 设置覆盖，再为 ch2 设置覆盖
          const withCh1 = updateGroupMessagesOverride(config, ch1, override1);
          const result = updateGroupMessagesOverride(withCh1, ch2, override2);

          const overrides = (result as any).groupMessages.overrides;

          // ch2 的覆盖应包含 override2 的值
          for (const key of Object.keys(override2)) {
            if ((override2 as any)[key] !== undefined) {
              expect(overrides[ch2][key]).toEqual((override2 as any)[key]);
            }
          }

          // ch1 的覆盖应保持不变
          for (const key of Object.keys(override1)) {
            if ((override1 as any)[key] !== undefined) {
              expect(overrides[ch1][key]).toEqual((override1 as any)[key]);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });


  test('validateKeywords 过滤空字符串和纯空白字符串', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            nonEmptyString(),
            fc.constant(''),
            fc.constant('   '),
            fc.constant('\t'),
          ),
          { maxLength: 10 },
        ),
        (keywords) => {
          const result = validateKeywords(keywords);

          // 结果中不应包含空字符串或纯空白字符串
          for (const kw of result) {
            expect(kw.trim().length).toBeGreaterThan(0);
          }

          // 结果长度应等于原列表中非空非纯空白的数量
          const expected = keywords.filter(
            (kw) => typeof kw === 'string' && kw.trim().length > 0,
          );
          expect(result.length).toBe(expected.length);
        },
      ),
      { numRuns: 100 },
    );
  });
});


// ============================================================
// Property 16: 群组 CRUD 与重复检测
// Feature: channel-binding-config, Property 16: Groups CRUD and duplicate detection
// ============================================================

describe('Property 16: 群组 CRUD 与重复检测', () => {
  /**
   * Validates: Requirements 13.4, 13.6, 13.7
   *
   * - addGroup 创建新群组，键数量增加 1
   * - updateGroup 仅更新目标群组，其他群组不变
   * - deleteGroup 移除群组，键数量减少 1
   * - isGroupIdDuplicate 对已存在的 ID 返回 true
   */
  test('addGroup 创建新群组，isGroupIdDuplicate 检测重复', () => {
    fc.assert(
      fc.property(
        configArb(),
        nonEmptyString(),
        groupRecordArb(),
        (config, groupId, groupData) => {
          // 前置条件：群组 ID 不存在
          fc.pre(!isGroupIdDuplicate(config, groupId));

          const before = Object.keys((config as any).groups || {}).length;
          const result = addGroup(config, groupId, groupData);
          const after = Object.keys((result as any).groups || {}).length;

          // 键数量增加 1
          expect(after).toBe(before + 1);

          // 新群组存在
          expect((result as any).groups[groupId]).toBeDefined();

          // 重复检测应返回 true
          expect(isGroupIdDuplicate(result, groupId)).toBe(true);

          // channels 和 bindings 保持不变
          expect(result.channels).toEqual(config.channels);
          expect(result.bindings).toEqual(config.bindings);
        },
      ),
      { numRuns: 100 },
    );
  });


  test('updateGroup 仅更新目标群组，其他群组不变', () => {
    fc.assert(
      fc.property(
        configArb(),
        nonEmptyString(),
        nonEmptyString(),
        groupRecordArb(),
        groupRecordArb(),
        fc.record({ name: nonEmptyString(), enabled: fc.boolean() }),
        (config, gid1, gid2, data1, data2, updates) => {
          // 前置条件：两个群组 ID 不同
          fc.pre(gid1 !== gid2);

          // 添加两个群组
          const withGroups = addGroup(addGroup(config, gid1, data1), gid2, data2);

          // 更新第一个群组
          const result = updateGroup(withGroups, gid1, updates);

          // 目标群组的字段已更新
          expect((result as any).groups[gid1].name).toBe(updates.name);
          expect((result as any).groups[gid1].enabled).toBe(updates.enabled);

          // 另一个群组保持不变
          expect((result as any).groups[gid2]).toEqual(
            (withGroups as any).groups[gid2],
          );
        },
      ),
      { numRuns: 100 },
    );
  });


  test('deleteGroup 移除群组，键数量减少 1，其他群组不变', () => {
    fc.assert(
      fc.property(
        configArb(),
        nonEmptyString(),
        nonEmptyString(),
        groupRecordArb(),
        groupRecordArb(),
        (config, gid1, gid2, data1, data2) => {
          // 前置条件：两个群组 ID 不同
          fc.pre(gid1 !== gid2);

          // 添加两个群组
          const withGroups = addGroup(addGroup(config, gid1, data1), gid2, data2);
          const before = Object.keys((withGroups as any).groups).length;

          // 删除第一个群组
          const result = deleteGroup(withGroups, gid1);
          const after = Object.keys((result as any).groups).length;

          // 键数量减少 1
          expect(after).toBe(before - 1);

          // 被删除的群组不存在
          expect(
            Object.prototype.hasOwnProperty.call((result as any).groups, gid1),
          ).toBe(false);

          // 另一个群组保持不变
          expect((result as any).groups[gid2]).toEqual(
            (withGroups as any).groups[gid2],
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});


// ============================================================
// Property 17: 广播群组 CRUD 正确性
// Feature: channel-binding-config, Property 17: Broadcast groups CRUD
// ============================================================

describe('Property 17: 广播群组 CRUD 正确性', () => {
  /**
   * Validates: Requirements 14.4, 14.5, 14.6
   *
   * - addBroadcastGroup 创建新广播群组，键数量增加 1
   * - updateBroadcastGroup 仅更新目标广播群组，其他不变
   * - deleteBroadcastGroup 移除广播群组，键数量减少 1
   */
  test('addBroadcastGroup 创建新广播群组，键数量增加 1', () => {
    fc.assert(
      fc.property(
        configArb(),
        nonEmptyString(),
        broadcastGroupRecordArb(),
        (config, groupId, groupData) => {
          // 前置条件：广播群组 ID 不存在
          fc.pre(
            !Object.prototype.hasOwnProperty.call(
              (config as any).broadcastGroups || {},
              groupId,
            ),
          );

          const before = Object.keys(
            (config as any).broadcastGroups || {},
          ).length;
          const result = addBroadcastGroup(config, groupId, groupData);
          const after = Object.keys(
            (result as any).broadcastGroups || {},
          ).length;

          // 键数量增加 1
          expect(after).toBe(before + 1);

          // 新广播群组存在
          expect((result as any).broadcastGroups[groupId]).toBeDefined();
          expect((result as any).broadcastGroups[groupId].name).toBe(
            groupData.name,
          );

          // channels 和 bindings 保持不变
          expect(result.channels).toEqual(config.channels);
          expect(result.bindings).toEqual(config.bindings);
        },
      ),
      { numRuns: 100 },
    );
  });


  test('updateBroadcastGroup 仅更新目标广播群组，其他不变', () => {
    fc.assert(
      fc.property(
        configArb(),
        nonEmptyString(),
        nonEmptyString(),
        broadcastGroupRecordArb(),
        broadcastGroupRecordArb(),
        fc.record({ name: nonEmptyString(), enabled: fc.boolean() }),
        (config, bgid1, bgid2, data1, data2, updates) => {
          // 前置条件：两个广播群组 ID 不同
          fc.pre(bgid1 !== bgid2);

          // 添加两个广播群组
          const withGroups = addBroadcastGroup(
            addBroadcastGroup(config, bgid1, data1),
            bgid2,
            data2,
          );

          // 更新第一个广播群组
          const result = updateBroadcastGroup(withGroups, bgid1, updates);

          // 目标广播群组的字段已更新
          expect((result as any).broadcastGroups[bgid1].name).toBe(
            updates.name,
          );
          expect((result as any).broadcastGroups[bgid1].enabled).toBe(
            updates.enabled,
          );

          // 另一个广播群组保持不变
          expect((result as any).broadcastGroups[bgid2]).toEqual(
            (withGroups as any).broadcastGroups[bgid2],
          );
        },
      ),
      { numRuns: 100 },
    );
  });


  test('deleteBroadcastGroup 移除广播群组，键数量减少 1', () => {
    fc.assert(
      fc.property(
        configArb(),
        nonEmptyString(),
        nonEmptyString(),
        broadcastGroupRecordArb(),
        broadcastGroupRecordArb(),
        (config, bgid1, bgid2, data1, data2) => {
          // 前置条件：两个广播群组 ID 不同
          fc.pre(bgid1 !== bgid2);

          // 添加两个广播群组
          const withGroups = addBroadcastGroup(
            addBroadcastGroup(config, bgid1, data1),
            bgid2,
            data2,
          );
          const before = Object.keys(
            (withGroups as any).broadcastGroups,
          ).length;

          // 删除第一个广播群组
          const result = deleteBroadcastGroup(withGroups, bgid1);
          const after = Object.keys(
            (result as any).broadcastGroups,
          ).length;

          // 键数量减少 1
          expect(after).toBe(before - 1);

          // 被删除的广播群组不存在
          expect(
            Object.prototype.hasOwnProperty.call(
              (result as any).broadcastGroups,
              bgid1,
            ),
          ).toBe(false);

          // 另一个广播群组保持不变
          expect((result as any).broadcastGroups[bgid2]).toEqual(
            (withGroups as any).broadcastGroups[bgid2],
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});


// ============================================================
// Property 18: 路由规则 CRUD 与优先级排序
// Feature: channel-binding-config, Property 18: Routing rules CRUD and priority sort
// ============================================================

describe('Property 18: 路由规则 CRUD 与优先级排序', () => {
  /**
   * Validates: Requirements 15.4, 15.5, 15.6, 15.7
   *
   * - addRoutingRule 追加规则，数组长度增加 1
   * - updateRoutingRule 仅更新目标索引的规则，其他不变
   * - deleteRoutingRule 移除目标索引的规则，数组长度减少 1
   * - sortRoutingRulesByPriority 按优先级降序排列
   */
  test('addRoutingRule 追加规则，数组长度增加 1', () => {
    fc.assert(
      fc.property(configArb(), routingRuleArb(), (config, rule) => {
        const before = (
          (config as any).channelRouting?.rules || []
        ).length;
        const result = addRoutingRule(config, rule);
        const rules = (result as any).channelRouting.rules;

        // 数组长度增加 1
        expect(rules.length).toBe(before + 1);

        // 新规则存在于数组末尾
        expect(rules[rules.length - 1]).toEqual(rule);

        // channels 和 bindings 保持不变
        expect(result.channels).toEqual(config.channels);
        expect(result.bindings).toEqual(config.bindings);
      }),
      { numRuns: 100 },
    );
  });


  test('updateRoutingRule 仅更新目标索引的规则，其他不变', () => {
    fc.assert(
      fc.property(
        configArb(),
        routingRuleArb(),
        routingRuleArb(),
        fc.record({ name: nonEmptyString(), priority: fc.integer({ min: 0, max: 1000 }) }),
        (config, rule1, rule2, updates) => {
          // 添加两条规则
          const withRules = addRoutingRule(addRoutingRule(config, rule1), rule2);
          const rules = (withRules as any).channelRouting.rules;
          const idx = rules.length - 2; // 第一条规则的索引

          // 更新第一条规则
          const result = updateRoutingRule(withRules, idx, updates);
          const updatedRules = (result as any).channelRouting.rules;

          // 目标规则的字段已更新
          expect(updatedRules[idx].name).toBe(updates.name);
          expect(updatedRules[idx].priority).toBe(updates.priority);

          // 最后一条规则保持不变
          expect(updatedRules[updatedRules.length - 1]).toEqual(
            rules[rules.length - 1],
          );

          // 数组长度不变
          expect(updatedRules.length).toBe(rules.length);
        },
      ),
      { numRuns: 100 },
    );
  });


  test('deleteRoutingRule 移除目标索引的规则，数组长度减少 1', () => {
    fc.assert(
      fc.property(
        configArb(),
        routingRuleArb(),
        routingRuleArb(),
        (config, rule1, rule2) => {
          // 添加两条规则
          const withRules = addRoutingRule(addRoutingRule(config, rule1), rule2);
          const rules = (withRules as any).channelRouting.rules;
          const before = rules.length;
          const idx = rules.length - 2; // 第一条规则的索引

          // 删除第一条规则
          const result = deleteRoutingRule(withRules, idx);
          const afterRules = (result as any).channelRouting.rules;

          // 数组长度减少 1
          expect(afterRules.length).toBe(before - 1);
        },
      ),
      { numRuns: 100 },
    );
  });


  test('sortRoutingRulesByPriority 按优先级降序排列', () => {
    fc.assert(
      fc.property(
        fc.array(routingRuleArb(), { minLength: 1, maxLength: 20 }),
        (rules) => {
          const sorted = sortRoutingRulesByPriority(rules);

          // 排序后长度不变
          expect(sorted.length).toBe(rules.length);

          // 每个元素的 priority 大于等于下一个元素的 priority（降序）
          for (let i = 0; i < sorted.length - 1; i++) {
            expect(sorted[i].priority).toBeGreaterThanOrEqual(
              sorted[i + 1].priority,
            );
          }

          // 原数组不被修改（纯函数）
          const originalPriorities = rules.map((r) => r.priority);
          const currentPriorities = rules.map((r) => r.priority);
          expect(currentPriorities).toEqual(originalPriorities);
        },
      ),
      { numRuns: 100 },
    );
  });
});


// ============================================================
// Property 19: 位置解析配置更新隔离性
// Feature: channel-binding-config, Property 19: Location parsing config update isolation
// ============================================================

describe('Property 19: 位置解析配置更新隔离性', () => {
  /**
   * Validates: Requirements 16.2, 16.4, 16.5
   *
   * - updateLocationParsingConfig 合并全局配置，rules 保持不变
   * - updateLocationParsingRule 仅影响目标渠道规则
   */
  test('updateLocationParsingConfig 合并全局配置，其他配置不变', () => {
    fc.assert(
      fc.property(
        configArb(),
        fc.record({ enabled: fc.boolean() }),
        (config, updates) => {
          const result = updateLocationParsingConfig(config, updates);
          const lp = (result as any).locationParsing;

          // enabled 应反映更新值
          expect(lp.enabled).toBe(updates.enabled);

          // channels 和 bindings 保持不变
          expect(result.channels).toEqual(config.channels);
          expect(result.bindings).toEqual(config.bindings);
        },
      ),
      { numRuns: 100 },
    );
  });


  test('updateLocationParsingRule 仅影响目标渠道规则', () => {
    fc.assert(
      fc.property(
        configArb(),
        nonEmptyString(),
        nonEmptyString(),
        locationParsingRuleArb(),
        locationParsingRuleArb(),
        (config, ch1, ch2, rule1, rule2) => {
          // 前置条件：两个渠道类型不同
          fc.pre(ch1 !== ch2);

          // 先为 ch1 设置规则，再为 ch2 设置规则
          const withCh1 = updateLocationParsingRule(config, ch1, rule1);
          const result = updateLocationParsingRule(withCh1, ch2, rule2);

          const rules = (result as any).locationParsing.rules;

          // ch2 的规则应正确设置
          expect(rules[ch2].mode).toBe(rule2.mode);

          // ch1 的规则应保持不变
          expect(rules[ch1].mode).toBe(rule1.mode);

          // channels 和 bindings 保持不变
          expect(result.channels).toEqual(config.channels);
          expect(result.bindings).toEqual(config.bindings);
        },
      ),
      { numRuns: 100 },
    );
  });
});


// ============================================================
// Property 20: 正则表达式验证正确性
// Feature: channel-binding-config, Property 20: Regex pattern validation
// ============================================================

describe('Property 20: 正则表达式验证正确性', () => {
  /**
   * Validates: Requirements 16.6
   *
   * - 有效正则返回 { valid: true }
   * - 无效正则返回 { valid: false, error: ... }
   */
  test('有效正则表达式返回 valid: true', () => {
    /** 生成已知有效的正则表达式字符串 */
    const validRegexArb = fc.oneof(
      fc.constant('^hello$'),
      fc.constant('\\d+'),
      fc.constant('[a-z]+'),
      fc.constant('foo|bar'),
      fc.constant('(abc){2,3}'),
      fc.constant('.+?'),
      fc.constant('\\w+@\\w+\\.\\w+'),
      fc.constant('^loc:(\\d+),(\\d+)$'),
      fc.constant(''),
      fc.constant('.*'),
    );

    fc.assert(
      fc.property(validRegexArb, (pattern) => {
        const result = validateRegexPattern(pattern);
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      }),
      { numRuns: 100 },
    );
  });


  test('无效正则表达式返回 valid: false 并附带错误信息', () => {
    /** 生成已知无效的正则表达式字符串（JavaScript RegExp 无法解析） */
    const invalidRegexArb = fc.oneof(
      fc.constant('('),           // 未闭合的括号
      fc.constant('['),           // 未闭合的方括号
      fc.constant('\\'),          // 不完整的转义
      fc.constant('(?P<>abc)'),   // 无效的命名捕获组
      fc.constant('(?<)'),        // 无效的命名捕获组语法
      fc.constant('a{2,1}'),     // 量词范围 min > max
    );

    fc.assert(
      fc.property(invalidRegexArb, (pattern) => {
        const result = validateRegexPattern(pattern);
        expect(result.valid).toBe(false);
        expect(typeof result.error).toBe('string');
        expect(result.error!.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });
});


// ============================================================
// Property: 字段 ID 到 CLI Flag 的转换保持一致性
// Feature: setup-guided-completion, Property 2: 字段 ID 到 CLI Flag 的转换保持一致性
// ============================================================

describe('Feature: setup-guided-completion, Property 2: 字段 ID 到 CLI Flag 的转换保持一致性', () => {
  /**
   * Validates: Requirements 1.2
   *
   * 对于任意由 ASCII 字母组成的 camelCase 字段 ID，fieldIdToCliFlag 应产生
   * 以 '--' 开头的 kebab-case 字符串，且转换结果中不包含大写字母。
   * 对于任意渠道类型和非空字段值映射，buildChannelAddArgs 的输出应以
   * ['channels', 'add', '--channel', channelType] 开头，且每个非空字段值
   * 都应作为 --flag value 对出现在结果数组中。
   */

  /** 生成 camelCase 风格的字段 ID（至少一个小写字母开头，可含大写字母段） */
  const camelCaseIdArb = () =>
    fc.tuple(
      fc.stringMatching(/^[a-z]{1,5}$/),
      fc.array(
        fc.tuple(
          fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')),
          fc.stringMatching(/^[a-z]{1,5}$/),
        ),
        { minLength: 0, maxLength: 3 },
      ),
    ).map(([prefix, parts]) => prefix + parts.map(([upper, rest]) => upper + rest).join(''));

  test('fieldIdToCliFlag 对任意 camelCase 字段 ID 产生以 "--" 开头的无大写 kebab-case 字符串', () => {
    fc.assert(
      fc.property(camelCaseIdArb(), (fieldId) => {
        const flag = fieldIdToCliFlag(fieldId);

        // 结果应以 '--' 开头
        expect(flag.startsWith('--')).toBe(true);

        // 结果中不应包含大写字母
        expect(flag).toBe(flag.toLowerCase());

        // '--' 之后的部分应为 kebab-case（仅含小写字母和连字符）
        const body = flag.slice(2);
        expect(body).toMatch(/^[a-z][a-z-]*$/);

        // 不应出现连续的连字符
        expect(body).not.toMatch(/--/);
      }),
      { numRuns: 100 },
    );
  });

  test('buildChannelAddArgs 输出以固定前缀开头，且每个非空字段值作为 --flag value 对出现', () => {
    /** 生成非空非纯空白的字段值 */
    const nonEmptyValueArb = fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0);

    /** 生成渠道类型字符串 */
    const channelTypeArb = fc.stringMatching(/^[a-z]{1,10}$/);

    /** 生成非空字段值映射（至少一个条目） */
    const fieldValuesArb = fc.dictionary(camelCaseIdArb(), nonEmptyValueArb, { minKeys: 1, maxKeys: 5 });

    fc.assert(
      fc.property(channelTypeArb, fieldValuesArb, (channelType, fieldValues) => {
        const args = buildChannelAddArgs(channelType, fieldValues);

        // 输出应以 ['channels', 'add', '--channel', channelType] 开头
        expect(args[0]).toBe('channels');
        expect(args[1]).toBe('add');
        expect(args[2]).toBe('--channel');
        expect(args[3]).toBe(channelType);

        // 每个非空字段值应作为 --flag value 对出现在结果数组中
        for (const [fieldId, value] of Object.entries(fieldValues)) {
          if (value && value.trim()) {
            const expectedFlag = fieldIdToCliFlag(fieldId);
            const flagIndex = args.indexOf(expectedFlag, 4);

            // flag 应存在于前缀之后
            expect(flagIndex).toBeGreaterThanOrEqual(4);

            // flag 后面紧跟的应是 trim 后的值
            expect(args[flagIndex + 1]).toBe(value.trim());
          }
        }

        // 前缀之后的元素数量应为非空字段数 × 2（每个字段一个 flag 一个 value）
        const nonEmptyCount = Object.values(fieldValues).filter((v) => v && v.trim()).length;
        expect(args.length).toBe(4 + nonEmptyCount * 2);
      }),
      { numRuns: 100 },
    );
  });
});
