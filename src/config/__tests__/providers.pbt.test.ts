/**
 * 属性测试：提供商列表字段完整性
 * Feature: model-providers-config, Property 1: provider list field completeness
 * Validates: Requirements 1.1, 1.2
 */

import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';
import { PROVIDER_LIST, type ProviderDefinition } from '../providers';

describe('Property 1: 提供商列表字段完整性', () => {
  test('PROVIDER_LIST 每个条目字段完整', () => {
    fc.assert(
      fc.property(fc.constantFrom(...PROVIDER_LIST), (provider: ProviderDefinition) => {
        // 验证 id 非空
        expect(provider.id).toBeTruthy();
        expect(provider.id.trim()).not.toBe('');
        
        // 验证 name 非空
        expect(provider.name).toBeTruthy();
        expect(provider.name.trim()).not.toBe('');
        
        // 验证 category 只能是 'llm' 或 'transcription'
        expect(['llm', 'transcription']).toContain(provider.category);
      }),
      { numRuns: 100 }
    );
  });

  test('PROVIDER_LIST 包含正确数量的提供商', () => {
    // 31 个 LLM + 2 个转录 = 33 个
    expect(PROVIDER_LIST).toHaveLength(33);
    
    const llmProviders = PROVIDER_LIST.filter(p => p.category === 'llm');
    const transcriptionProviders = PROVIDER_LIST.filter(p => p.category === 'transcription');
    
    expect(llmProviders).toHaveLength(31);
    expect(transcriptionProviders).toHaveLength(2);
  });

  test('PROVIDER_LIST 中所有 id 唯一', () => {
    const ids = PROVIDER_LIST.map(p => p.id);
    const uniqueIds = new Set(ids);
    
    expect(uniqueIds.size).toBe(ids.length);
  });
});
