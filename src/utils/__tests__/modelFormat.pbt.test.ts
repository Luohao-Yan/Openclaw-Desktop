/**
 * 属性测试：模型格式校验与备用模型操作
 * Feature: model-providers-config
 * Validates: Requirements 4.4, 5.2, 5.3, 5.5
 */

import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';
import { isValidModelFormat, addFallback, removeFallback } from '../modelFormat';

describe('Property 4: provider/model 格式校验', () => {
  test('合法格式：非空 provider + / + 非空 model 返回 true', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter(s => s.trim() !== '' && !s.includes('/')),
        fc.string({ minLength: 1 }).filter(s => s.trim() !== ''),
        (provider, model) => {
          const input = `${provider}/${model}`;
          expect(isValidModelFormat(input)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  test('非法格式：无 /、/ 前空、/ 后空、纯空白返回 false', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          // 不包含 /
          fc.string().filter(s => !s.includes('/')),
          // / 前为空
          fc.string({ minLength: 1 }).filter(s => !s.includes('/')).map(s => `/${s}`),
          // / 后为空（确保 provider 部分不含 /，避免意外形成合法格式）
          fc.string({ minLength: 1 }).filter(s => !s.includes('/')).map(s => `${s}/`),
          // 纯空白
          fc.constant('  '),
          fc.constant(''),
          // 只有 /
          fc.constant('/')
        ),
        (invalid) => {
          expect(isValidModelFormat(invalid)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  test('边界情况：provider/model 格式正确性', () => {
    // 合法示例
    expect(isValidModelFormat('anthropic/claude-opus-4-6')).toBe(true);
    expect(isValidModelFormat('openai/gpt-4o')).toBe(true);
    expect(isValidModelFormat('ollama/llama3')).toBe(true);
    
    // 非法示例
    expect(isValidModelFormat('')).toBe(false);
    expect(isValidModelFormat('   ')).toBe(false);
    expect(isValidModelFormat('no-slash')).toBe(false);
    expect(isValidModelFormat('/model-only')).toBe(false);
    expect(isValidModelFormat('provider/')).toBe(false);
    expect(isValidModelFormat('/')).toBe(false);
  });
});

describe('Property 6: 备用模型添加后列表包含该条目', () => {
  test('添加合法备用模型后列表长度 +1 且包含该条目', () => {
    fc.assert(
      fc.property(
        // 生成唯一的备用模型列表
        fc.uniqueArray(
          fc.tuple(
            fc.string({ minLength: 1 }).filter(s => s.trim() !== '' && !s.includes('/')),
            fc.string({ minLength: 1 }).filter(s => s.trim() !== '')
          ).map(([p, m]) => `${p}/${m}`)
        ),
        // 生成一个新的模型
        fc.tuple(
          fc.string({ minLength: 1 }).filter(s => s.trim() !== '' && !s.includes('/')),
          fc.string({ minLength: 1 }).filter(s => s.trim() !== '')
        ).map(([p, m]) => `${p}/${m}`),
        (list, newModel) => {
          // 前置条件：newModel 不在列表中
          fc.pre(!list.includes(newModel));
          
          const result = addFallback(list, newModel);
          
          // 验证长度增加 1
          expect(result).toHaveLength(list.length + 1);
          // 验证包含新条目
          expect(result).toContain(newModel);
          // 验证原列表所有条目都在新列表中
          list.forEach(item => {
            expect(result).toContain(item);
          });
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Property 7: 备用模型删除后列表不含该条目', () => {
  test('删除存在的备用模型后列表不含该条目且长度 -1', () => {
    fc.assert(
      fc.property(
        // 生成至少包含一个条目的唯一列表
        fc.uniqueArray(
          fc.tuple(
            fc.string({ minLength: 1 }).filter(s => s.trim() !== '' && !s.includes('/')),
            fc.string({ minLength: 1 }).filter(s => s.trim() !== '')
          ).map(([p, m]) => `${p}/${m}`),
          { minLength: 1 }
        ),
        (list) => {
          // 随机选择一个要删除的条目
          const toRemove = list[Math.floor(Math.random() * list.length)];
          
          const result = removeFallback(list, toRemove);
          
          // 验证长度减少 1
          expect(result).toHaveLength(list.length - 1);
          // 验证不包含被删除的条目
          expect(result).not.toContain(toRemove);
          // 验证其他条目都还在
          list.filter(item => item !== toRemove).forEach(item => {
            expect(result).toContain(item);
          });
        }
      ),
      { numRuns: 100 }
    );
  });

  test('删除不存在的条目时列表不变', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(
          fc.tuple(
            fc.string({ minLength: 1 }).filter(s => s.trim() !== '' && !s.includes('/')),
            fc.string({ minLength: 1 }).filter(s => s.trim() !== '')
          ).map(([p, m]) => `${p}/${m}`)
        ),
        fc.tuple(
          fc.string({ minLength: 1 }).filter(s => s.trim() !== '' && !s.includes('/')),
          fc.string({ minLength: 1 }).filter(s => s.trim() !== '')
        ).map(([p, m]) => `${p}/${m}`),
        (list, nonExistent) => {
          // 前置条件：nonExistent 不在列表中
          fc.pre(!list.includes(nonExistent));
          
          const result = removeFallback(list, nonExistent);
          
          // 验证列表不变
          expect(result).toEqual(list);
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Property 8: 备用模型去重（幂等添加）', () => {
  test('重复添加已存在备用模型时列表不变', () => {
    fc.assert(
      fc.property(
        // 生成至少包含一个条目的唯一列表
        fc.uniqueArray(
          fc.tuple(
            fc.string({ minLength: 1 }).filter(s => s.trim() !== '' && !s.includes('/')),
            fc.string({ minLength: 1 }).filter(s => s.trim() !== '')
          ).map(([p, m]) => `${p}/${m}`),
          { minLength: 1 }
        ),
        (list) => {
          // 选择一个已存在的条目
          const existing = list[Math.floor(Math.random() * list.length)];
          
          const result = addFallback(list, existing);
          
          // 验证列表不变（幂等性）
          expect(result).toEqual(list);
          expect(result).toHaveLength(list.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  test('多次添加同一条目结果相同', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(
          fc.tuple(
            fc.string({ minLength: 1 }).filter(s => s.trim() !== '' && !s.includes('/')),
            fc.string({ minLength: 1 }).filter(s => s.trim() !== '')
          ).map(([p, m]) => `${p}/${m}`)
        ),
        fc.tuple(
          fc.string({ minLength: 1 }).filter(s => s.trim() !== '' && !s.includes('/')),
          fc.string({ minLength: 1 }).filter(s => s.trim() !== '')
        ).map(([p, m]) => `${p}/${m}`),
        (list, newModel) => {
          fc.pre(!list.includes(newModel));
          
          const result1 = addFallback(list, newModel);
          const result2 = addFallback(result1, newModel);
          const result3 = addFallback(result2, newModel);
          
          // 验证多次添加结果相同
          expect(result2).toEqual(result1);
          expect(result3).toEqual(result1);
        }
      ),
      { numRuns: 100 }
    );
  });
});
