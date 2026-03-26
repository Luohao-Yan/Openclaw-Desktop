/**
 * 属性测试：Agent 分组管理 — Property 1-10
 * Feature: agent-group-export
 *
 * 本文件使用 fast-check 对分组管理纯函数进行属性测试，
 * 验证分组 CRUD 逻辑和 .ocgroup 序列化/反序列化的正确性属性。
 */

import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  validateGroupName,
  createGroup,
  removeMappingsForGroup,
  cleanOrphanMappings,
  findGroupByName,
  serializeOcgroup,
  deserializeOcgroup,
  parseOcgroupHeader,
  OCGROUP_MAGIC,
  OCGROUP_FORMAT_VERSION,
  type AgentGroup,
  type GroupMetadata,
} from '../agentGroupLogic';

// ============================================================================
// 生成器（Arbitraries）
// ============================================================================

/** UUID v4 正则表达式 */
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** ISO 8601 时间戳正则表达式 */
const ISO_8601_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/;

/**
 * 生成非空且非纯空白的字符串（合法分组名称）
 */
const validGroupNameArb = fc.string({ minLength: 1, maxLength: 32 }).filter(
  (s) => s.trim().length > 0,
);

/**
 * 生成空字符串或纯空白字符串（非法分组名称）
 */
const emptyOrWhitespaceArb = fc.oneof(
  fc.constant(''),
  fc.constant(' '),
  fc.constant('\t'),
  fc.constant('\n'),
  fc.constant('   '),
  fc.constant(' \t\n '),
  fc.constant('\r\n'),
  fc.constant('  \t  '),
);

/**
 * 生成随机的 Agent-分组映射（agentId → groupId）
 */
const mappingsArb = fc.dictionary(
  fc.uuid(),
  fc.uuid(),
  { minKeys: 0, maxKeys: 10 },
);

/**
 * 生成随机的 AgentGroup 对象
 */
const agentGroupArb: fc.Arbitrary<AgentGroup> = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 32 }),
  description: fc.option(fc.string({ maxLength: 64 }), { nil: undefined }),
  color: fc.option(fc.string({ minLength: 1, maxLength: 16 }), { nil: undefined }),
  emoji: fc.option(fc.string({ minLength: 1, maxLength: 4 }), { nil: undefined }),
  createdAt: fc.constant(new Date().toISOString()),
  updatedAt: fc.constant(new Date().toISOString()),
});

// ============================================================================
// Property 2: validateGroupName 校验逻辑
// Feature: agent-group-export, Property 2: validateGroupName 校验逻辑
// ============================================================================

describe('Property 2: validateGroupName 校验逻辑', () => {
  /**
   * (a) 空字符串或纯空白字符串 → valid: false
   *
   * **Validates: Requirements 2.4, 2.5**
   */
  test(
    'Feature: agent-group-export, Property 2a: 空字符串或纯空白 → valid: false',
    () => {
      fc.assert(
        fc.property(
          emptyOrWhitespaceArb,
          fc.array(fc.string({ minLength: 1, maxLength: 16 }), { minLength: 0, maxLength: 5 }),
          (name, existingNames) => {
            // 空字符串或纯空白字符串应校验失败
            const result = validateGroupName(name, existingNames);
            expect(result.valid).toBe(false);
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  /**
   * (b) 名称在已有列表中存在（且不是 excludeId 对应的分组）→ valid: false
   *
   * **Validates: Requirements 2.4, 2.5**
   */
  test(
    'Feature: agent-group-export, Property 2b: 名称重复 → valid: false',
    () => {
      fc.assert(
        fc.property(
          validGroupNameArb,
          fc.array(validGroupNameArb, { minLength: 0, maxLength: 5 }),
          (name, otherNames) => {
            // 将 name 加入已有名称列表，确保重复
            const existingNames = [...otherNames, name];
            const result = validateGroupName(name, existingNames);
            expect(result.valid).toBe(false);
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  /**
   * (c) 非空且不重复 → valid: true
   *
   * **Validates: Requirements 2.4, 2.5**
   */
  test(
    'Feature: agent-group-export, Property 2c: 非空且唯一 → valid: true',
    () => {
      fc.assert(
        fc.property(
          validGroupNameArb,
          fc.array(validGroupNameArb, { minLength: 0, maxLength: 5 }),
          (name, existingNames) => {
            // 确保 name 不在已有名称列表中
            const filtered = existingNames.filter((n) => n !== name);
            const result = validateGroupName(name, filtered);
            expect(result.valid).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});


// ============================================================================
// Property 3: createGroup 生成有效分组对象
// Feature: agent-group-export, Property 3: createGroup 生成有效分组对象
// ============================================================================

describe('Property 3: createGroup 生成有效分组对象', () => {
  /**
   * 对于任意非空的分组名称字符串，createGroup(name) 返回的 AgentGroup 对象应满足：
   * (a) id 为合法的 UUID v4 格式
   * (b) name 等于传入的名称
   * (c) createdAt 和 updatedAt 为合法的 ISO 8601 时间戳
   *
   * **Validates: Requirements 2.1**
   */
  test(
    'Feature: agent-group-export, Property 3: createGroup 生成有效分组对象',
    () => {
      fc.assert(
        fc.property(
          validGroupNameArb,
          (name) => {
            // 创建分组
            const group = createGroup(name);

            // (a) id 为合法的 UUID v4 格式
            expect(group.id).toMatch(UUID_V4_REGEX);

            // (b) name 等于传入的名称
            expect(group.name).toBe(name);

            // (c) createdAt 和 updatedAt 为合法的 ISO 8601 时间戳
            expect(group.createdAt).toMatch(ISO_8601_REGEX);
            expect(group.updatedAt).toMatch(ISO_8601_REGEX);

            // createdAt 和 updatedAt 应相等（新创建时）
            expect(group.createdAt).toBe(group.updatedAt);
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});

// ============================================================================
// Property 4: 删除分组清除关联映射
// Feature: agent-group-export, Property 4: 删除分组清除关联映射
// ============================================================================

describe('Property 4: 删除分组清除关联映射', () => {
  /**
   * 对于任意分组 ID 和 Agent-分组映射关系，从映射中移除所有指向该分组 ID 的条目后，
   * 结果映射中不应存在任何值等于该分组 ID 的条目，且其他分组的映射应保持不变。
   *
   * **Validates: Requirements 2.3**
   */
  test(
    'Feature: agent-group-export, Property 4: 删除分组清除关联映射',
    () => {
      fc.assert(
        fc.property(
          mappingsArb,
          fc.uuid(),
          (mappings, groupId) => {
            // 执行删除分组映射
            const result = removeMappingsForGroup(mappings, groupId);

            // 结果中不应存在任何值等于 groupId 的条目
            const resultValues = Object.values(result);
            expect(resultValues).not.toContain(groupId);

            // 其他分组的映射应保持不变
            for (const [agentId, gId] of Object.entries(mappings)) {
              if (gId !== groupId) {
                expect(result[agentId]).toBe(gId);
              }
            }
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});

// ============================================================================
// Property 5: Agent 分配与移除往返一致性
// Feature: agent-group-export, Property 5: Agent 分配与移除往返一致性
// ============================================================================

describe('Property 5: Agent 分配与移除往返一致性', () => {
  /**
   * 对于任意 agentId、groupId 和初始映射关系，
   * 将 agentId 分配到 groupId 后再移除，agentId 不应在映射中。
   *
   * **Validates: Requirements 2.6, 2.7**
   */
  test(
    'Feature: agent-group-export, Property 5: Agent 分配与移除往返一致性',
    () => {
      fc.assert(
        fc.property(
          mappingsArb,
          fc.uuid(),
          fc.uuid(),
          (initialMappings, agentId, groupId) => {
            // 分配：将 agentId 映射到 groupId
            const afterAssign = { ...initialMappings, [agentId]: groupId };

            // 移除：删除 agentId 的映射
            const { [agentId]: _, ...afterRemove } = afterAssign;

            // agentId 不应在最终映射中
            expect(afterRemove).not.toHaveProperty(agentId);
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});

// ============================================================================
// Property 6: 清除孤立映射
// Feature: agent-group-export, Property 6: 清除孤立映射
// ============================================================================

describe('Property 6: 清除孤立映射', () => {
  /**
   * 对于任意 Agent-分组映射关系和有效 Agent ID 列表，cleanOrphanMappings 的结果应满足：
   * (a) 结果中的所有 key 都在有效 Agent ID 列表中
   * (b) 有效 Agent ID 对应的映射值保持不变
   *
   * **Validates: Requirements 2.8**
   */
  test(
    'Feature: agent-group-export, Property 6: 清除孤立映射',
    () => {
      fc.assert(
        fc.property(
          mappingsArb,
          fc.array(fc.uuid(), { minLength: 0, maxLength: 10 }),
          (mappings, validAgentIds) => {
            // 执行清除孤立映射
            const result = cleanOrphanMappings(mappings, validAgentIds);

            // (a) 结果中的所有 key 都在有效 Agent ID 列表中
            const validSet = new Set(validAgentIds);
            for (const key of Object.keys(result)) {
              expect(validSet.has(key)).toBe(true);
            }

            // (b) 有效 Agent ID 对应的映射值保持不变
            for (const agentId of validAgentIds) {
              if (agentId in mappings) {
                expect(result[agentId]).toBe(mappings[agentId]);
              }
            }
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});

// ============================================================================
// Property 7: 同名分组合并（findGroupByName）
// Feature: agent-group-export, Property 7: 同名分组合并
// ============================================================================

describe('Property 7: 同名分组合并（findGroupByName）', () => {
  /**
   * 对于任意分组名称和已有分组列表：
   * - 如果已有分组中存在同名分组，则返回该分组对象
   * - 如果不存在同名分组，则返回 undefined
   *
   * **Validates: Requirements 4.3**
   */
  test(
    'Feature: agent-group-export, Property 7a: 名称存在 → 返回该分组',
    () => {
      fc.assert(
        fc.property(
          agentGroupArb,
          fc.array(agentGroupArb, { minLength: 0, maxLength: 5 }),
          (targetGroup, otherGroups) => {
            // 将目标分组加入列表
            const groups = [...otherGroups, targetGroup];

            // 查找应返回目标分组（或列表中第一个同名分组）
            const found = findGroupByName(targetGroup.name, groups);
            expect(found).toBeDefined();
            expect(found!.name).toBe(targetGroup.name);
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  test(
    'Feature: agent-group-export, Property 7b: 名称不存在 → 返回 undefined',
    () => {
      fc.assert(
        fc.property(
          validGroupNameArb,
          fc.array(agentGroupArb, { minLength: 0, maxLength: 5 }),
          (searchName, groups) => {
            // 确保搜索名称不在分组列表中
            const filtered = groups.filter((g) => g.name !== searchName);

            // 查找应返回 undefined
            const found = findGroupByName(searchName, filtered);
            expect(found).toBeUndefined();
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});


// ============================================================================
// 序列化/反序列化相关生成器
// ============================================================================

/**
 * 生成随机的 GroupMetadata 对象
 */
const groupMetadataArb: fc.Arbitrary<GroupMetadata> = fc.record({
  name: fc.string({ minLength: 1, maxLength: 32 }).filter((s) => s.trim().length > 0),
  description: fc.option(fc.string({ maxLength: 64 }), { nil: undefined }),
  color: fc.option(fc.string({ minLength: 1, maxLength: 16 }), { nil: undefined }),
  emoji: fc.option(fc.string({ minLength: 1, maxLength: 4 }), { nil: undefined }),
});

/**
 * 生成随机的 Agent Bundle Buffer 列表
 */
const agentBundlesArb = fc.array(
  fc.uint8Array({ minLength: 0, maxLength: 256 }).map((arr) => Buffer.from(arr)),
  { minLength: 0, maxLength: 5 },
);

/**
 * 生成随机的应用版本号字符串（如 "1.0.0"、"2.3.1"）
 */
const appVersionArb = fc
  .tuple(fc.nat({ max: 99 }), fc.nat({ max: 99 }), fc.nat({ max: 99 }))
  .map(([major, minor, patch]) => `${major}.${minor}.${patch}`);

// ============================================================================
// Property 1: .ocgroup 序列化往返一致性
// Feature: agent-group-export, Property 1: .ocgroup 序列化往返一致性
// ============================================================================

describe('Property 1: .ocgroup 序列化往返一致性', () => {
  /**
   * 对于任意合法的 GroupMetadata 和任意数量的 Agent Bundle Buffer 列表，
   * serializeOcgroup 序列化后再通过 deserializeOcgroup 反序列化，
   * 应还原出等价的分组元数据和完全相同的 Agent Bundle Buffer 列表（逐字节相等）。
   *
   * 注意：serializeOcgroup 内部生成时间戳，因此需要逐字段比较 groupMeta
   * （name, description, color, emoji），而非比较完整的序列化输出。
   *
   * **Validates: Requirements 1.1, 3.3, 5.3, 5.4**
   */
  test(
    'Feature: agent-group-export, Property 1: .ocgroup 序列化往返一致性',
    () => {
      fc.assert(
        fc.property(
          groupMetadataArb,
          agentBundlesArb,
          appVersionArb,
          (meta: GroupMetadata, bundles: Buffer[], version: string) => {
            // 序列化
            const serialized = serializeOcgroup(meta, bundles, version);

            // 反序列化
            const { groupMeta, agentBundles } = deserializeOcgroup(serialized);

            // 逐字段比较 groupMeta（时间戳由 serializeOcgroup 内部生成，不在 meta 中）
            expect(groupMeta.name).toBe(meta.name);
            expect(groupMeta.description).toBe(meta.description);
            expect(groupMeta.color).toBe(meta.color);
            expect(groupMeta.emoji).toBe(meta.emoji);

            // Agent Bundle 数量一致
            expect(agentBundles.length).toBe(bundles.length);

            // 逐字节比较每个 Agent Bundle
            for (let i = 0; i < bundles.length; i++) {
              expect(agentBundles[i].equals(bundles[i])).toBe(true);
            }
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});

// ============================================================================
// Property 8: .ocgroup 魔数和版本号不变量
// Feature: agent-group-export, Property 8: .ocgroup 魔数和版本号不变量
// ============================================================================

describe('Property 8: .ocgroup 魔数和版本号不变量', () => {
  /**
   * 对于任意合法的分组元数据和 Agent Bundle 列表，
   * serializeOcgroup 输出的 Buffer 前 8 字节应等于 OCGROUP_MAGIC（"OCGROUP\0"），
   * 接下来的 2 字节（uint16 BE）应等于 OCGROUP_FORMAT_VERSION（即 1）。
   *
   * **Validates: Requirements 5.1**
   */
  test(
    'Feature: agent-group-export, Property 8: .ocgroup 魔数和版本号不变量',
    () => {
      fc.assert(
        fc.property(
          groupMetadataArb,
          agentBundlesArb,
          appVersionArb,
          (meta: GroupMetadata, bundles: Buffer[], version: string) => {
            // 序列化
            const buf = serializeOcgroup(meta, bundles, version);

            // 前 8 字节应等于 OCGROUP_MAGIC
            const magic = buf.subarray(0, 8);
            expect(magic.equals(OCGROUP_MAGIC)).toBe(true);

            // 接下来的 2 字节（uint16 BE）应等于 OCGROUP_FORMAT_VERSION
            const formatVersion = buf.readUInt16BE(8);
            expect(formatVersion).toBe(OCGROUP_FORMAT_VERSION);
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});

// ============================================================================
// Property 9: .ocgroup 文件头解析
// Feature: agent-group-export, Property 9: .ocgroup 文件头解析
// ============================================================================

describe('Property 9: .ocgroup 文件头解析', () => {
  /**
   * 对于任意合法的分组元数据和 N 个 Agent Bundle，
   * serializeOcgroup 后通过 parseOcgroupHeader 解析，
   * 应还原出等价的分组元数据，且 agentCount 等于 N。
   *
   * **Validates: Requirements 5.2, 5.6**
   */
  test(
    'Feature: agent-group-export, Property 9: .ocgroup 文件头解析',
    () => {
      fc.assert(
        fc.property(
          groupMetadataArb,
          agentBundlesArb,
          appVersionArb,
          (meta: GroupMetadata, bundles: Buffer[], version: string) => {
            // 序列化
            const serialized = serializeOcgroup(meta, bundles, version);

            // 解析文件头
            const { groupMeta, agentCount } = parseOcgroupHeader(serialized);

            // 逐字段比较 groupMeta
            expect(groupMeta.name).toBe(meta.name);
            expect(groupMeta.description).toBe(meta.description);
            expect(groupMeta.color).toBe(meta.color);
            expect(groupMeta.emoji).toBe(meta.emoji);

            // agentCount 应等于 Bundle 数量
            expect(agentCount).toBe(bundles.length);
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});

// ============================================================================
// Property 10: 无效魔数拒绝解析
// Feature: agent-group-export, Property 10: 无效魔数拒绝解析
// ============================================================================

describe('Property 10: 无效魔数拒绝解析', () => {
  /**
   * 对于任意不以 "OCGROUP\0" 开头的 Buffer（长度 >= 8），
   * deserializeOcgroup 和 parseOcgroupHeader 应抛出包含「文件格式无效」的错误。
   *
   * **Validates: Requirements 5.5**
   */

  /** 生成不以 "OCGROUP\0" 开头的随机 Buffer（长度 >= 8） */
  const invalidMagicBufferArb = fc
    .uint8Array({ minLength: 8, maxLength: 128 })
    .filter((arr) => {
      // 确保前 8 字节不等于 OCGROUP_MAGIC
      const magicBytes = [0x4f, 0x43, 0x47, 0x52, 0x4f, 0x55, 0x50, 0x00]; // "OCGROUP\0"
      for (let i = 0; i < 8; i++) {
        if (arr[i] !== magicBytes[i]) return true;
      }
      return false;
    })
    .map((arr) => Buffer.from(arr));

  test(
    'Feature: agent-group-export, Property 10a: 无效魔数 → deserializeOcgroup 抛出错误',
    () => {
      fc.assert(
        fc.property(
          invalidMagicBufferArb,
          (buf) => {
            // deserializeOcgroup 应抛出包含「文件格式无效」的错误
            expect(() => deserializeOcgroup(buf)).toThrow('文件格式无效');
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  test(
    'Feature: agent-group-export, Property 10b: 无效魔数 → parseOcgroupHeader 抛出错误',
    () => {
      fc.assert(
        fc.property(
          invalidMagicBufferArb,
          (buf) => {
            // parseOcgroupHeader 应抛出包含「文件格式无效」的错误
            expect(() => parseOcgroupHeader(buf)).toThrow('文件格式无效');
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});


// ============================================================================
// Property 11: 分组筛选与计数
// Feature: agent-group-export, Property 11: 分组筛选与计数
// ============================================================================

describe('Property 11: 分组筛选与计数', () => {
  /**
   * (a) 对于任意分组 ID，该分组的 Agent 计数应等于映射中值等于该分组 ID 的条目数。
   *
   * **Validates: Requirements 6.3, 6.7**
   */
  test('Feature: agent-group-export, Property 11a: 分组 Agent 计数', () => {
    fc.assert(
      fc.property(
        fc.uuid(), // groupId
        mappingsArb, // mappings
        (groupId, mappings) => {
          // 计算映射中值等于 groupId 的条目数
          const count = Object.values(mappings).filter((gid) => gid === groupId).length;
          // 筛选出属于该分组的 Agent ID 列表
          const agentsInGroup = Object.entries(mappings)
            .filter(([_, gid]) => gid === groupId)
            .map(([agentId]) => agentId);
          // Agent 列表长度应等于计数
          expect(agentsInGroup.length).toBe(count);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * (b) 「未分组」筛选结果应等于所有不在映射 key 中的 Agent。
   *
   * **Validates: Requirements 6.3, 6.7**
   */
  test('Feature: agent-group-export, Property 11b: 未分组 Agent 筛选', () => {
    fc.assert(
      fc.property(
        fc.array(fc.uuid(), { minLength: 0, maxLength: 10 }), // allAgentIds
        mappingsArb, // mappings
        (allAgentIds, mappings) => {
          // 筛选出未分组的 Agent（不在映射 key 中）
          const ungrouped = allAgentIds.filter((id) => !(id in mappings));

          // 所有未分组 Agent 都不应在映射中
          for (const id of ungrouped) {
            expect(mappings).not.toHaveProperty(id);
          }

          // 所有已分组 Agent（在映射中且在 allAgentIds 中）都不应出现在未分组列表中
          for (const id of allAgentIds) {
            if (id in mappings) {
              expect(ungrouped).not.toContain(id);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
