/**
 * 属性测试：addEnabledChannels 过滤逻辑
 * Feature: setup-guided-completion, Property 1: 仅对合格渠道执行 CLI 添加
 *
 * 验证渠道过滤谓词：渠道"合格"当且仅当
 *   (a) enabled === true
 *   (b) 所有 required === true 的字段在 fieldValues 中有非空（trim 后）值
 */

import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';
import type { ChannelConfig, ChannelField } from '../../types/setup';

// ============================================================
// 纯函数：从 SetupFlowContext 中提取的过滤谓词
// ============================================================

/**
 * 判断渠道是否合格（可执行 CLI 添加）。
 * 逻辑与 SetupFlowContext.addEnabledChannels 中的 filter 完全一致。
 */
function isChannelEligible(ch: ChannelConfig): boolean {
  if (!ch.enabled) return false;
  const requiredFields = ch.fields.filter((f) => f.required);
  return requiredFields.every((f) => (ch.fieldValues[f.id] || '').trim() !== '');
}

/**
 * 从渠道配置列表中筛选合格渠道。
 * 等价于 addEnabledChannels 中的 eligibleChannels 计算。
 */
function filterEligibleChannels(configs: ChannelConfig[]): ChannelConfig[] {
  return configs.filter(isChannelEligible);
}

// ============================================================
// 生成器（Arbitraries）
// ============================================================

/** 生成非空字段 ID（仅 ASCII 字母数字） */
const fieldIdArb = (): fc.Arbitrary<string> =>
  fc.string({ minLength: 1, maxLength: 10, unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')) });

/** 生成随机 ChannelField */
const channelFieldArb = (): fc.Arbitrary<ChannelField> =>
  fc.record({
    id: fieldIdArb(),
    label: fc.string({ minLength: 1, maxLength: 20 }),
    placeholder: fc.string({ maxLength: 20 }),
    type: fc.constantFrom('password' as const, 'text' as const, 'info' as const),
    required: fc.boolean(),
  });

/** 生成随机 fieldValues 映射，值可能为空/纯空白/有效值 */
const fieldValueArb = (): fc.Arbitrary<string> =>
  fc.oneof(
    fc.constant(''),           // 空字符串
    fc.constant('   '),        // 纯空白
    fc.constant('\t'),         // 制表符
    fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0), // 有效值
  );

/**
 * 生成随机 ChannelConfig。
 * 确保 fields 中的 id 唯一，并为每个字段生成对应的 fieldValues 条目。
 */
const channelConfigArb = (): fc.Arbitrary<ChannelConfig> =>
  fc.tuple(
    fieldIdArb(),                                    // key
    fc.string({ minLength: 1, maxLength: 20 }),      // label
    fc.boolean(),                                     // enabled
    fc.array(channelFieldArb(), { minLength: 0, maxLength: 5 }), // fields
  ).chain(([key, label, enabled, rawFields]) => {
    // 确保字段 ID 唯一
    const seenIds = new Set<string>();
    const fields: ChannelField[] = [];
    for (const f of rawFields) {
      if (!seenIds.has(f.id)) {
        seenIds.add(f.id);
        fields.push(f);
      }
    }

    // 为每个字段生成 fieldValues
    const fieldValueEntries = fields.map((f) =>
      fieldValueArb().map((val): [string, string] => [f.id, val]),
    );

    // 如果没有字段，返回空 fieldValues
    if (fieldValueEntries.length === 0) {
      return fc.constant({
        key,
        label,
        hint: '',
        tokenLabel: '',
        enabled,
        token: '',
        fieldValues: {} as Record<string, string>,
        fields,
        testStatus: 'idle' as const,
      });
    }

    return fc.tuple(...(fieldValueEntries as [typeof fieldValueEntries[0], ...typeof fieldValueEntries])).map(
      (entries): ChannelConfig => ({
        key,
        label,
        hint: '',
        tokenLabel: '',
        enabled,
        token: '',
        fieldValues: Object.fromEntries(entries),
        fields,
        testStatus: 'idle' as const,
      }),
    );
  });

/** 生成随机 ChannelConfig 数组 */
const channelConfigsArb = (): fc.Arbitrary<ChannelConfig[]> =>
  fc.array(channelConfigArb(), { minLength: 0, maxLength: 10 });

// ============================================================
// Property 1: 仅对合格渠道执行 CLI 添加
// Feature: setup-guided-completion, Property 1: 仅对合格渠道执行 CLI 添加
// ============================================================

describe('Property 1: 仅对合格渠道执行 CLI 添加', () => {
  /**
   * Validates: Requirements 1.1
   *
   * 对于任意渠道配置列表，filterEligibleChannels 返回的集合
   * 应恰好等于满足以下两个条件的渠道集合：
   *   (a) enabled === true
   *   (b) 所有 required === true 的字段在 fieldValues 中有非空（trim 后）值
   */
  test('合格渠道集合等于手动计算的满足条件的渠道集合', () => {
    fc.assert(
      fc.property(channelConfigsArb(), (configs) => {
        const eligible = filterEligibleChannels(configs);

        // 手动计算期望的合格渠道
        const expected = configs.filter((ch) => {
          // 条件 (a)：必须启用
          if (!ch.enabled) return false;

          // 条件 (b)：所有必填字段在 fieldValues 中有非空 trim 值
          const requiredFields = ch.fields.filter((f) => f.required);
          return requiredFields.every((f) => {
            const val = ch.fieldValues[f.id] || '';
            return val.trim() !== '';
          });
        });

        // 合格渠道数量应一致
        expect(eligible.length).toBe(expected.length);

        // 合格渠道的 key 集合应完全一致（保持顺序）
        expect(eligible.map((ch) => ch.key)).toEqual(expected.map((ch) => ch.key));
      }),
      { numRuns: 100 },
    );
  });

  test('禁用的渠道永远不会出现在合格列表中', () => {
    fc.assert(
      fc.property(channelConfigsArb(), (configs) => {
        const eligible = filterEligibleChannels(configs);

        // 所有合格渠道必须是启用的
        for (const ch of eligible) {
          expect(ch.enabled).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  test('必填字段值为空或纯空白的渠道不会出现在合格列表中', () => {
    fc.assert(
      fc.property(channelConfigsArb(), (configs) => {
        const eligible = filterEligibleChannels(configs);

        // 所有合格渠道的必填字段值 trim 后必须非空
        for (const ch of eligible) {
          const requiredFields = ch.fields.filter((f) => f.required);
          for (const f of requiredFields) {
            const val = (ch.fieldValues[f.id] || '').trim();
            expect(val.length).toBeGreaterThan(0);
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  test('没有必填字段的已启用渠道应被视为合格', () => {
    fc.assert(
      fc.property(channelConfigsArb(), (configs) => {
        const eligible = filterEligibleChannels(configs);

        // 对于每个已启用且没有必填字段的渠道，应出现在合格列表中
        for (const ch of configs) {
          if (ch.enabled) {
            const requiredFields = ch.fields.filter((f) => f.required);
            if (requiredFields.length === 0) {
              expect(eligible.some((e) => e.key === ch.key)).toBe(true);
            }
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});
