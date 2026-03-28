/**
 * 属性测试：翻译键双向一致性 & 任务翻译键命名规范
 * Feature: cron-pages-i18n
 *
 * Property 3: 翻译键双向一致性（验证需求: 10.1, 10.2, 10.3）
 * Property 4: 任务翻译键命名规范（验证需求: 9.4）
 */

import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';
import { translations } from '../../i18n/translations';

// ============================================================================
// 属性 3：翻译键双向一致性
// Feature: cron-pages-i18n, Property 3: 翻译键双向一致性
// ============================================================================

describe('Feature: cron-pages-i18n, Property 3: 翻译键双向一致性', () => {
  // 预先获取 en 和 zh 的所有翻译键
  const enKeys = Object.keys(translations.en);
  const zhKeys = Object.keys(translations.zh);
  const enKeySet = new Set(enKeys);
  const zhKeySet = new Set(zhKeys);

  /**
   * **Validates: Requirements 10.1, 10.2, 10.3**
   *
   * 对于 translations 对象中的所有翻译键 K：
   * - K 存在于 en 区域当且仅当 K 也存在于 zh 区域
   * - 即 Object.keys(translations.en) 和 Object.keys(translations.zh) 应为完全相同的集合
   *
   * 此测试使用 fast-check 的 constantFrom 从所有已知键中随机抽样，
   * 验证每个被抽到的键在两个语言区域中都存在。
   */
  test(
    'Feature: cron-pages-i18n, Property 3: 翻译键双向一致性',
    () => {
      // 合并 en 和 zh 的所有键，确保覆盖两侧可能独有的键
      const allKeys = Array.from(new Set([...enKeys, ...zhKeys]));

      // 使用 fast-check 从所有键中随机抽样，验证双向存在性
      fc.assert(
        fc.property(
          fc.constantFrom(...allKeys),
          (key: string) => {
            // 验证 10.1：如果 key 存在于 en，则也应存在于 zh
            if (enKeySet.has(key)) {
              expect(zhKeySet.has(key)).toBe(true);
            }
            // 验证 10.2：如果 key 存在于 zh，则也应存在于 en
            if (zhKeySet.has(key)) {
              expect(enKeySet.has(key)).toBe(true);
            }
          },
        ),
        { numRuns: 100 },
      );

      // 验证 10.3：en 和 zh 的键集合大小完全一致
      expect(enKeys.length).toBe(zhKeys.length);

      // 额外断言：两个集合完全相同
      expect(enKeys.sort()).toEqual(zhKeys.sort());
    },
  );
});


// ============================================================================
// 属性 4：任务翻译键命名规范
// Feature: cron-pages-i18n, Property 4: 任务翻译键命名规范
// ============================================================================

describe('Feature: cron-pages-i18n, Property 4: 任务翻译键命名规范', () => {
  // 筛选所有以 tasks. 开头的翻译键
  const tasksKeys = Object.keys(translations.en).filter((k) =>
    k.startsWith('tasks.'),
  );

  // 允许包含 "Cron" 的键白名单——这些键中 "Cron" 是作为调度类型的技术标识符使用，
  // 而非面向用户的硬编码标签
  const technicalCronAllowlist = new Set([
    'tasks.kindHint',
    'tasks.create.scheduleTypeHint',
  ]);

  /**
   * **Validates: Requirements 9.4**
   *
   * 对于所有 tasks.* 翻译键：
   * 1. 键名必须以 `tasks.` 前缀开头
   * 2. 翻译值（en 和 zh）中不应包含硬编码的 "cron" 作为面向用户的标签文本
   *    （技术标识符如 cron 表达式类型除外，已加入白名单）
   */
  test(
    'Feature: cron-pages-i18n, Property 4: 任务翻译键命名规范',
    () => {
      // 确保有足够的 tasks.* 键可供测试
      expect(tasksKeys.length).toBeGreaterThan(0);

      fc.assert(
        fc.property(
          fc.constantFrom(...tasksKeys),
          (key: string) => {
            // 验证 1：键名以 tasks. 前缀开头
            expect(key.startsWith('tasks.')).toBe(true);

            // 如果该键在技术标识符白名单中，跳过 "cron" 检查
            if (technicalCronAllowlist.has(key)) {
              return;
            }

            // 验证 2：英文翻译值不包含硬编码 "cron"（不区分大小写）
            const enValue =
              translations.en[key as keyof typeof translations.en];
            expect(
              enValue.toLowerCase().includes('cron'),
              `英文翻译键 "${key}" 的值 "${enValue}" 不应包含硬编码 "cron" 作为面向用户标签`,
            ).toBe(false);

            // 验证 2：中文翻译值不包含硬编码 "cron"（不区分大小写）
            const zhValue =
              translations.zh[key as keyof typeof translations.zh];
            expect(
              zhValue.toLowerCase().includes('cron'),
              `中文翻译键 "${key}" 的值 "${zhValue}" 不应包含硬编码 "cron" 作为面向用户标签`,
            ).toBe(false);
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});
