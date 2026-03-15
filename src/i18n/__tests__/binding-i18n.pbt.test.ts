/**
 * 属性测试：绑定配置 i18n 键值完整性
 * Feature: agent-channel-binding, Property 8: i18n 键值完整性
 * 验证: 需求 6.1, 6.3
 */

import { describe, test, expect } from 'vitest';
import { translations } from '../translations';

// 所有 binding.* 前缀的 i18n 键
const BINDING_KEYS = [
  'binding.addBinding',
  'binding.deleteBinding',
  'binding.editBinding',
  'binding.confirmDelete',
  'binding.confirmDeleteDetail',
  'binding.deleteSuccess',
  'binding.addSuccess',
  'binding.saveSuccess',
  'binding.emptyState',
  'binding.emptyStateHint',
  'binding.channelRequired',
  'binding.saveFailed',
  'binding.deleteFailed',
  'binding.loadFailed',
  'binding.unsavedChanges',
  'binding.saving',
  'binding.deleting',
  'binding.channelLabel',
  'binding.accountIdLabel',
  'binding.bindingRules',
  'binding.accountConfig',
] as const;

describe('Property 8: i18n 键值完整性', () => {
  test('所有 binding.* 键同时存在于 en 和 zh 语言包中，且值为非空字符串', () => {
    const en = translations.en as Record<string, string>;
    const zh = translations.zh as Record<string, string>;

    for (const key of BINDING_KEYS) {
      // 验证 en 语言包中存在且非空
      expect(en[key], `en 语言包缺少键: ${key}`).toBeDefined();
      expect(typeof en[key], `en[${key}] 应为字符串`).toBe('string');
      expect(en[key].trim().length, `en[${key}] 不能为空字符串`).toBeGreaterThan(0);

      // 验证 zh 语言包中存在且非空
      expect(zh[key], `zh 语言包缺少键: ${key}`).toBeDefined();
      expect(typeof zh[key], `zh[${key}] 应为字符串`).toBe('string');
      expect(zh[key].trim().length, `zh[${key}] 不能为空字符串`).toBeGreaterThan(0);
    }
  });

  test('en 和 zh 语言包中 binding.* 键的数量一致', () => {
    const en = translations.en as Record<string, string>;
    const zh = translations.zh as Record<string, string>;

    const enBindingKeys = Object.keys(en).filter(k => k.startsWith('binding.'));
    const zhBindingKeys = Object.keys(zh).filter(k => k.startsWith('binding.'));

    expect(enBindingKeys.length).toBe(zhBindingKeys.length);
    expect(enBindingKeys.length).toBe(BINDING_KEYS.length);
  });
});
