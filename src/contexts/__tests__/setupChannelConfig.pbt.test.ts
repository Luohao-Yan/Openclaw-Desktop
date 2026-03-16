/**
 * 属性测试：渠道配置字段键一致性
 * Feature: setup-flow-refactor, Property 10: 渠道配置字段键一致性
 *
 * 验证 createChannelConfig 工厂函数生成的 ChannelConfig 对象：
 *   - fieldValues 的键集合与 fields[].id 集合完全一致
 *   - 所有 fieldValues 默认初始化为空字符串
 *
 * **Validates: Requirements 5.2**
 */

import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';
import { createChannelConfig } from '../../types/setup';
import type { ChannelField } from '../../types/setup';

// ============================================================
// 生成器（Arbitraries）
// ============================================================

/** 生成随机的字段输入类型 */
const fieldTypeArb = (): fc.Arbitrary<ChannelField['type']> =>
  fc.constantFrom('password', 'text', 'info');

/**
 * 生成单个 ChannelField 对象
 * id 使用字母数字字符串，确保作为对象键时行为一致
 */
const channelFieldArb = (id: string): fc.Arbitrary<ChannelField> =>
  fc.record({
    id: fc.constant(id),
    label: fc.string({ minLength: 1, maxLength: 30 }),
    placeholder: fc.string({ maxLength: 50 }),
    type: fieldTypeArb(),
    required: fc.boolean(),
  });

/**
 * 生成具有唯一 id 的 ChannelField 数组
 * 先生成唯一 id 集合，再为每个 id 生成完整的 ChannelField
 */
const uniqueChannelFieldsArb = (): fc.Arbitrary<ChannelField[]> =>
  fc.uniqueArray(
    fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_]{0,19}$/),
    { minLength: 1, maxLength: 10 },
  ).chain((ids) =>
    fc.tuple(...ids.map((id) => channelFieldArb(id))),
  );

/**
 * 生成 createChannelConfig 所需的完整参数
 * 包含 key、label、hint、tokenLabel 和 fields
 */
const channelConfigInputArb = () =>
  uniqueChannelFieldsArb().chain((fields) =>
    fc.record({
      key: fc.string({ minLength: 1, maxLength: 20 }),
      label: fc.string({ minLength: 1, maxLength: 30 }),
      hint: fc.string({ maxLength: 100 }),
      tokenLabel: fc.string({ minLength: 1, maxLength: 30 }),
      fields: fc.constant(fields as readonly ChannelField[] & ChannelField[]),
    }),
  );

// ============================================================
// Property 10: 渠道配置字段键一致性
// Feature: setup-flow-refactor
// ============================================================

describe('Feature: setup-flow-refactor, Property 10: 渠道配置字段键一致性', () => {
  /**
   * Validates: Requirements 5.2
   *
   * 对于任意通过 createChannelConfig 创建的 ChannelConfig，
   * fieldValues 的键集合应与 fields 数组中所有元素的 id 集合完全一致。
   */

  test('fieldValues 的键集合与 fields[].id 集合完全一致', () => {
    fc.assert(
      fc.property(channelConfigInputArb(), (input) => {
        const config = createChannelConfig(input);

        // 获取 fieldValues 的键集合
        const fieldValueKeys = new Set(Object.keys(config.fieldValues));
        // 获取 fields 中所有 id 的集合
        const fieldIds = new Set(input.fields.map((f) => f.id));

        // 两个集合大小必须相等
        expect(fieldValueKeys.size).toBe(fieldIds.size);

        // fieldValues 中的每个键都必须在 fields 的 id 中存在
        for (const key of fieldValueKeys) {
          expect(fieldIds.has(key)).toBe(true);
        }

        // fields 中的每个 id 都必须在 fieldValues 的键中存在
        for (const id of fieldIds) {
          expect(fieldValueKeys.has(id)).toBe(true);
        }
      }),
      { numRuns: 200 },
    );
  });

  test('所有 fieldValues 默认初始化为空字符串', () => {
    fc.assert(
      fc.property(channelConfigInputArb(), (input) => {
        // 不传入 fieldValues 参数，使用默认值
        const config = createChannelConfig(input);

        // 每个字段的值都应为空字符串
        for (const field of input.fields) {
          expect(config.fieldValues[field.id as keyof typeof config.fieldValues]).toBe('');
        }
      }),
      { numRuns: 200 },
    );
  });

  test('提供部分初始值时，未提供的字段仍为空字符串', () => {
    fc.assert(
      fc.property(
        uniqueChannelFieldsArb().filter((fields) => fields.length >= 2),
        (fields) => {
          // 仅为第一个字段提供初始值
          const firstFieldId = fields[0].id;
          const initialValue = 'test-value';

          const config = createChannelConfig({
            key: 'test-channel',
            label: '测试渠道',
            hint: '测试提示',
            tokenLabel: 'Token',
            fields: fields as readonly ChannelField[] & ChannelField[],
            fieldValues: { [firstFieldId]: initialValue } as any,
          });

          // 第一个字段应使用提供的初始值
          expect(config.fieldValues[firstFieldId as keyof typeof config.fieldValues]).toBe(initialValue);

          // 其余字段应为空字符串
          for (const field of fields.slice(1)) {
            expect(config.fieldValues[field.id as keyof typeof config.fieldValues]).toBe('');
          }

          // 键集合仍然完全一致
          const fieldValueKeys = new Set(Object.keys(config.fieldValues));
          const fieldIds = new Set(fields.map((f) => f.id));
          expect(fieldValueKeys.size).toBe(fieldIds.size);
        },
      ),
      { numRuns: 200 },
    );
  });

  test('返回的 config 包含正确的默认状态字段', () => {
    fc.assert(
      fc.property(channelConfigInputArb(), (input) => {
        const config = createChannelConfig(input);

        // 工厂函数应自动设置默认值
        expect(config.enabled).toBe(false);
        expect(config.token).toBe('');
        expect(config.testStatus).toBe('idle');
      }),
      { numRuns: 200 },
    );
  });
});
