// ============================================================================
// VirtualChannelList 属性测试
// 验证虚拟滚动的核心正确性属性：渲染数量上界、累积高度计算、索引查找等。
// @see 需求 3.5 — 渠道列表使用虚拟滚动
// ============================================================================

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  getExpandedHeight,
  getItemHeights,
  getCumulativeHeights,
  findStartIndex,
} from '../VirtualChannelList';
import type { ChannelConfig, ChannelField } from '../../../types/setup';

// ============================================================================
// 测试数据生成器
// ============================================================================

/** 生成随机字段定义 */
const arbFieldDefinition: fc.Arbitrary<ChannelField> = fc.record({
  id: fc.string({ minLength: 1, maxLength: 20 }),
  label: fc.string({ minLength: 1, maxLength: 30 }),
  type: fc.constantFrom('text', 'password', 'info') as fc.Arbitrary<'text' | 'password' | 'info'>,
  placeholder: fc.string({ maxLength: 50 }),
  required: fc.boolean(),
});

/** 生成随机渠道配置 */
const arbChannelConfig: fc.Arbitrary<ChannelConfig> = fc.record({
  key: fc.string({ minLength: 1, maxLength: 20 }),
  label: fc.string({ minLength: 1, maxLength: 30 }),
  hint: fc.string({ maxLength: 50 }),
  tokenLabel: fc.string({ maxLength: 30 }),
  enabled: fc.boolean(),
  fields: fc.array(arbFieldDefinition, { minLength: 0, maxLength: 5 }),
  fieldValues: fc.constant({} as Record<string, string>),
  token: fc.constant(''),
  testStatus: fc.constantFrom('idle', 'testing', 'ok', 'error') as fc.Arbitrary<'idle' | 'testing' | 'ok' | 'error'>,
  testError: fc.option(fc.string(), { nil: undefined }),
  cliHint: fc.option(fc.string(), { nil: undefined }),
});

/** 生成渠道配置列表 */
const arbChannelConfigs = fc.array(arbChannelConfig, { minLength: 1, maxLength: 50 });

/** 生成正整数（用于高度、滚动位置等） */
const arbPositiveInt = fc.integer({ min: 1, max: 1000 });

// ============================================================================
// Property 5: 虚拟滚动渲染数量上界
// 验证实际渲染的渠道卡片数量 ≤ Math.ceil(H / itemHeight) + bufferSize * 2 且 ≤ N
// ============================================================================

describe('VirtualChannelList 属性测试', () => {
  it('Property 5: 渲染数量不超过上界', () => {
    fc.assert(
      fc.property(
        arbChannelConfigs,
        arbPositiveInt, // height
        fc.integer({ min: 40, max: 200 }), // itemHeight
        fc.integer({ min: 0, max: 5 }), // bufferSize
        fc.integer({ min: 0, max: 5000 }), // scrollTop
        (configs, height, itemHeight, bufferSize, scrollTop) => {
          const N = configs.length;
          const itemHeights = getItemHeights(configs, itemHeight);
          const cumulativeHeights = getCumulativeHeights(itemHeights);

          // 模拟组件内部的可见范围计算逻辑
          const startIdx = Math.max(0, findStartIndex(cumulativeHeights, scrollTop) - bufferSize);
          const visibleEnd = scrollTop + height;
          let endIdx = startIdx;
          while (endIdx < N && cumulativeHeights[endIdx] < visibleEnd) {
            endIdx++;
          }
          endIdx = Math.min(N, endIdx + bufferSize);

          const renderedCount = endIdx - startIdx;

          // 上界：视口能容纳的最大数量 + 双侧缓冲区
          const maxVisible = Math.ceil(height / itemHeight) + bufferSize * 2;
          // 渲染数量不超过上界，且不超过总数
          expect(renderedCount).toBeLessThanOrEqual(Math.min(maxVisible + 1, N));
          expect(renderedCount).toBeLessThanOrEqual(N);
          expect(renderedCount).toBeGreaterThanOrEqual(0);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('累积高度数组单调递增', () => {
    fc.assert(
      fc.property(
        arbChannelConfigs,
        fc.integer({ min: 40, max: 200 }),
        (configs, itemHeight) => {
          const heights = getItemHeights(configs, itemHeight);
          const cumulative = getCumulativeHeights(heights);

          // 累积高度数组长度 = 配置数 + 1
          expect(cumulative.length).toBe(configs.length + 1);
          // 第一个元素为 0
          expect(cumulative[0]).toBe(0);
          // 单调递增
          for (let i = 1; i < cumulative.length; i++) {
            expect(cumulative[i]).toBeGreaterThanOrEqual(cumulative[i - 1]);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('展开状态的卡片高度 >= 折叠状态', () => {
    fc.assert(
      fc.property(
        arbChannelConfig,
        fc.integer({ min: 40, max: 200 }),
        (config, baseHeight) => {
          const collapsed = { ...config, enabled: false };
          const expanded = { ...config, enabled: true };
          expect(getExpandedHeight(expanded, baseHeight))
            .toBeGreaterThanOrEqual(getExpandedHeight(collapsed, baseHeight));
        },
      ),
      { numRuns: 100 },
    );
  });

  it('findStartIndex 返回有效索引范围', () => {
    fc.assert(
      fc.property(
        arbChannelConfigs,
        fc.integer({ min: 40, max: 200 }),
        fc.integer({ min: 0, max: 10000 }),
        (configs, itemHeight, scrollTop) => {
          const heights = getItemHeights(configs, itemHeight);
          const cumulative = getCumulativeHeights(heights);
          const idx = findStartIndex(cumulative, scrollTop);

          // 索引在有效范围内
          expect(idx).toBeGreaterThanOrEqual(0);
          expect(idx).toBeLessThan(configs.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('折叠状态卡片高度等于基础高度', () => {
    fc.assert(
      fc.property(
        arbChannelConfig,
        fc.integer({ min: 40, max: 200 }),
        (config, baseHeight) => {
          const collapsed = { ...config, enabled: false };
          expect(getExpandedHeight(collapsed, baseHeight)).toBe(baseHeight);
        },
      ),
      { numRuns: 100 },
    );
  });
});
