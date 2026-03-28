/**
 * 属性测试：格式化函数 & 标签函数使用翻译键输出
 * Feature: cron-pages-i18n
 *
 * Property 1: 格式化函数使用翻译键输出（验证需求: 4.1, 4.2, 4.3）
 * Property 2: 标签函数使用翻译键输出（验证需求: 4.4, 4.5）
 */

// @vitest-environment jsdom

/* 在导入 Tasks.tsx 之前模拟 window.electronAPI，避免模块级引用报错 */
(window as any).electronAPI = {};

import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  formatDate,
  formatRelativeTime,
  getScheduleSummary,
  getJobTone,
  getPayloadLabel,
} from '../Tasks';
import type { TFunc } from '../Tasks';
import type { CronJobRecord } from '../../types/electron';

// ============================================================================
// 辅助工具
// ============================================================================

/** 硬编码中文文本黑名单——这些文本不应出现在国际化后的输出中 */
const HARDCODED_CHINESE = ['未设置', '待定', '即将开始', '刚刚', '后', '前', '每', '定时'];

/** 构造 mock t 函数，返回带特殊标记的字符串 */
const createMockT = (): TFunc => {
  return ((key: string) => `[TRANSLATED:${key}]`) as TFunc;
};

/** 检查输出中是否包含硬编码中文文本 */
const containsHardcodedChinese = (output: string): string | null => {
  for (const text of HARDCODED_CHINESE) {
    if (output.includes(text)) {
      return text;
    }
  }
  return null;
};

// ============================================================================
// 生成器
// ============================================================================

/** 生成随机日期字符串：空值、无效值、过去/未来时间戳 */
const dateStringArb = fc.oneof(
  // 空值 / undefined
  fc.constant(undefined),
  fc.constant(''),
  // 无效日期字符串
  fc.string({ minLength: 1, maxLength: 20 }),
  // 过去的有效时间戳（1 分钟到 48 小时前）
  fc.integer({ min: 1, max: 48 * 60 }).map((minutesAgo) => {
    const d = new Date(Date.now() - minutesAgo * 60 * 1000);
    return d.toISOString();
  }),
  // 未来的有效时间戳（1 分钟到 48 小时后）
  fc.integer({ min: 1, max: 48 * 60 }).map((minutesLater) => {
    const d = new Date(Date.now() + minutesLater * 60 * 1000);
    return d.toISOString();
  }),
);

/** 生成随机 CronJobRecord（用于 getScheduleSummary 测试） */
const cronJobWithScheduleArb = fc.oneof(
  // every 类型
  fc.record({
    id: fc.string({ minLength: 1, maxLength: 10 }),
    name: fc.string({ minLength: 1, maxLength: 20 }),
    enabled: fc.boolean(),
    schedule: fc.record({
      every: fc.constantFrom('1h', '30m', '2d', '5s', '10m'),
    }),
  }) as fc.Arbitrary<CronJobRecord>,
  // at 类型
  fc.record({
    id: fc.string({ minLength: 1, maxLength: 10 }),
    name: fc.string({ minLength: 1, maxLength: 20 }),
    enabled: fc.boolean(),
    schedule: fc.record({
      at: fc.constantFrom('2025-01-01T00:00:00Z', '09:00', '2030-12-31'),
    }),
  }) as fc.Arbitrary<CronJobRecord>,
  // cron 表达式类型（纯技术标识符，不含翻译前缀）
  fc.record({
    id: fc.string({ minLength: 1, maxLength: 10 }),
    name: fc.string({ minLength: 1, maxLength: 20 }),
    enabled: fc.boolean(),
    schedule: fc.record({
      cron: fc.constantFrom('*/5 * * * *', '0 9 * * 1', '0 0 1 * *'),
    }),
  }) as fc.Arbitrary<CronJobRecord>,
  // 空 schedule（兜底分支）
  fc.record({
    id: fc.string({ minLength: 1, maxLength: 10 }),
    name: fc.string({ minLength: 1, maxLength: 20 }),
    enabled: fc.boolean(),
    schedule: fc.constant({}),
  }) as fc.Arbitrary<CronJobRecord>,
);

/** 生成随机 CronJobRecord（用于 getJobTone / getPayloadLabel 测试） */
const cronJobArb: fc.Arbitrary<CronJobRecord> = fc.record({
  id: fc.string({ minLength: 1, maxLength: 10 }),
  name: fc.string({ minLength: 1, maxLength: 20 }),
  enabled: fc.oneof(fc.constant(true), fc.constant(false), fc.constant(undefined)),
  payload: fc.oneof(
    // systemEvent 类型
    fc.record({ kind: fc.constant('systemEvent'), text: fc.string() }),
    // agentTurn 类型
    fc.record({ kind: fc.constant('agentTurn'), message: fc.string() }),
    // system 变体
    fc.record({ kind: fc.constant('system'), text: fc.string() }),
    // agent 变体
    fc.record({ kind: fc.constant('agent'), message: fc.string() }),
    // 通过 text 字段推断
    fc.record({ text: fc.string({ minLength: 1 }) }),
    // 通过 message 字段推断
    fc.record({ message: fc.string({ minLength: 1 }) }),
    // 空 payload
    fc.constant({}),
  ),
}) as fc.Arbitrary<CronJobRecord>;

// ============================================================================
// 属性 1：格式化函数使用翻译键输出
// Feature: cron-pages-i18n, Property 1: 格式化函数使用翻译键输出
// ============================================================================

describe('Feature: cron-pages-i18n, Property 1: 格式化函数使用翻译键输出', () => {
  const mockT = createMockT();

  /**
   * **Validates: Requirements 4.1, 4.2, 4.3**
   *
   * 对于任意有效的日期字符串（包括空值、无效值、过去/未来时间），
   * formatDate 和 formatRelativeTime 函数在接收 mock t 函数后，
   * 其输出中不应包含任何硬编码的中文文本。
   * 同理，getScheduleSummary 对于任意 CronJobRecord，
   * 输出前缀应来自 t() 返回的翻译文本。
   */
  test('Feature: cron-pages-i18n, Property 1: 格式化函数使用翻译键输出', () => {
    // 子属性 1a：formatDate 不包含硬编码中文
    fc.assert(
      fc.property(dateStringArb, (dateStr) => {
        const result = formatDate(dateStr, mockT);

        // 如果输入为空，应返回 mock t 的标记字符串
        if (!dateStr) {
          expect(result).toBe('[TRANSLATED:tasks.format.notSet]');
        }

        // 无论何种输入，输出不应包含硬编码中文
        const found = containsHardcodedChinese(result);
        expect(found, `formatDate 输出 "${result}" 包含硬编码中文 "${found}"`).toBeNull();
      }),
      { numRuns: 100 },
    );

    // 子属性 1b：formatRelativeTime 不包含硬编码中文，且使用 mock t 标记
    fc.assert(
      fc.property(dateStringArb, (dateStr) => {
        const result = formatRelativeTime(dateStr, mockT);

        // 如果输入为空或无效，应返回 mock t 的标记字符串
        if (!dateStr) {
          expect(result).toBe('[TRANSLATED:tasks.format.pending]');
        }

        // 输出不应包含硬编码中文
        const found = containsHardcodedChinese(result);
        expect(found, `formatRelativeTime 输出 "${result}" 包含硬编码中文 "${found}"`).toBeNull();

        // 如果输出包含 TRANSLATED 标记，说明使用了 t() 函数
        if (result.includes('[TRANSLATED:')) {
          expect(result).toMatch(/\[TRANSLATED:tasks\.format\./);
        }
      }),
      { numRuns: 100 },
    );

    // 子属性 1c：getScheduleSummary 不包含硬编码中文
    fc.assert(
      fc.property(cronJobWithScheduleArb, (job) => {
        const result = getScheduleSummary(job, mockT);

        // 输出不应包含硬编码中文
        const found = containsHardcodedChinese(result);
        expect(found, `getScheduleSummary 输出 "${result}" 包含硬编码中文 "${found}"`).toBeNull();

        // 如果 schedule 有 every 字段，输出应包含 t('tasks.format.every') 的标记
        const schedule = job.schedule || {};
        if (typeof schedule.every === 'string' && schedule.every) {
          expect(result).toContain('[TRANSLATED:tasks.format.every]');
        }
        // 如果 schedule 有 at 字段，输出应包含 t('tasks.format.at') 的标记
        if (typeof schedule.at === 'string' && schedule.at && !schedule.every) {
          expect(result).toContain('[TRANSLATED:tasks.format.at]');
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ============================================================================
// 属性 2：标签函数使用翻译键输出
// Feature: cron-pages-i18n, Property 2: 标签函数使用翻译键输出
// ============================================================================

describe('Feature: cron-pages-i18n, Property 2: 标签函数使用翻译键输出', () => {
  const mockT = createMockT();

  /** 标签函数不应输出的硬编码中文文本 */
  const HARDCODED_LABELS = ['运行中', '已停用', '系统事件', 'Agent 消息'];

  /**
   * **Validates: Requirements 4.4, 4.5**
   *
   * 对于任意 CronJobRecord：
   * - getJobTone(job, t) 返回的 label 字段应来自 t() 调用的翻译文本
   * - getPayloadLabel(job, t) 的返回值应来自 t() 调用的翻译文本
   * 而非硬编码的「运行中」「已停用」「系统事件」「Agent 消息」
   */
  test('Feature: cron-pages-i18n, Property 2: 标签函数使用翻译键输出', () => {
    fc.assert(
      fc.property(cronJobArb, (job) => {
        // 验证 4.4：getJobTone 的 label 来自 mock t
        const tone = getJobTone(job, mockT);
        expect(tone.label).toMatch(/^\[TRANSLATED:tasks\.list\./);

        // label 不应包含硬编码中文标签
        for (const text of HARDCODED_LABELS) {
          expect(
            tone.label.includes(text),
            `getJobTone label "${tone.label}" 包含硬编码文本 "${text}"`,
          ).toBe(false);
        }

        // 验证 4.5：getPayloadLabel 的返回值来自 mock t 或为技术标识符 'unknown'
        const payloadLabel = getPayloadLabel(job, mockT);
        const payload = job.payload || {};
        const kind = String(payload.kind || payload.type || '').toLowerCase();
        const hasText = typeof payload.text === 'string';
        const hasMessage = typeof payload.message === 'string';
        const isSystem = kind.includes('system') || (!kind.includes('agent') && !kind.includes('message') && hasText && !hasMessage);
        const isAgent = kind.includes('agent') || kind.includes('message') || (!kind.includes('system') && hasMessage && !hasText);

        if (isSystem || isAgent) {
          // 已知类型应使用 mock t 标记
          expect(payloadLabel).toMatch(/^\[TRANSLATED:tasks\.list\./);
        }

        // 返回值不应包含硬编码中文标签
        for (const text of HARDCODED_LABELS) {
          expect(
            payloadLabel.includes(text),
            `getPayloadLabel 返回 "${payloadLabel}" 包含硬编码文本 "${text}"`,
          ).toBe(false);
        }
      }),
      { numRuns: 100 },
    );
  });
});
