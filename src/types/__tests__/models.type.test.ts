/**
 * 模型配置相关类型定义的单元测试
 * 通过 TypeScript 类型赋值验证类型可分配性（编译时检查）
 */
import { describe, it, expectTypeOf } from 'vitest';
import type {
  ProviderAuthStatus,
  ModelsStatusResult,
  ModelsScanResult,
  ModelsConfigResult,
  ModelsAliasesListResult,
  ModelAlias,
} from '../electron';

describe('ProviderAuthStatus 类型', () => {
  it('只接受三个合法字符串字面量值', () => {
    // 验证三个合法值均可赋值给 ProviderAuthStatus
    const a: ProviderAuthStatus = 'authenticated';
    const b: ProviderAuthStatus = 'unauthenticated';
    const c: ProviderAuthStatus = 'unknown';

    // 类型检查：确保这些值是 ProviderAuthStatus 类型
    expectTypeOf(a).toMatchTypeOf<ProviderAuthStatus>();
    expectTypeOf(b).toMatchTypeOf<ProviderAuthStatus>();
    expectTypeOf(c).toMatchTypeOf<ProviderAuthStatus>();
  });
});

describe('ModelsStatusResult 类型', () => {
  it('结构字段类型正确', () => {
    // 验证 ModelsStatusResult 包含 success 和 providers 字段
    const result: ModelsStatusResult = {
      success: true,
      providers: {
        anthropic: 'authenticated',
        openai: 'unauthenticated',
        ollama: 'unknown',
      },
    };

    expectTypeOf(result.success).toEqualTypeOf<boolean>();
    expectTypeOf(result.providers).toEqualTypeOf<Record<string, ProviderAuthStatus>>();
  });

  it('可选 error 字段类型正确', () => {
    // 验证失败场景下 error 字段可选
    const failed: ModelsStatusResult = {
      success: false,
      providers: {},
      error: '命令执行失败',
    };

    expectTypeOf(failed.error).toEqualTypeOf<string | undefined>();
  });
});

describe('ModelsScanResult 类型', () => {
  it('结构字段类型正确', () => {
    // 验证 ModelsScanResult 包含 success 和可选 output 字段
    const result: ModelsScanResult = {
      success: true,
      output: '扫描到 5 个可用模型',
    };

    expectTypeOf(result.success).toEqualTypeOf<boolean>();
    expectTypeOf(result.output).toEqualTypeOf<string | undefined>();
    expectTypeOf(result.error).toEqualTypeOf<string | undefined>();
  });
});

describe('ModelsConfigResult 类型', () => {
  it('结构字段类型正确', () => {
    // 验证 ModelsConfigResult 包含 primary 和 fallbacks 可选字段
    const result: ModelsConfigResult = {
      success: true,
      primary: 'anthropic/claude-opus-4-6',
      fallbacks: ['openai/gpt-4o', 'ollama/llama3'],
    };

    expectTypeOf(result.success).toEqualTypeOf<boolean>();
    expectTypeOf(result.primary).toEqualTypeOf<string | undefined>();
    expectTypeOf(result.fallbacks).toEqualTypeOf<string[] | undefined>();
  });
});

describe('ModelsAliasesListResult 类型', () => {
  it('结构字段类型正确', () => {
    // 验证 ModelsAliasesListResult 包含 aliases 字典字段
    const result: ModelsAliasesListResult = {
      success: true,
      aliases: {
        claude: 'anthropic/claude-opus-4-6',
        gpt4: 'openai/gpt-4o',
      },
    };

    expectTypeOf(result.success).toEqualTypeOf<boolean>();
    expectTypeOf(result.aliases).toEqualTypeOf<Record<string, string>>();
  });
});

describe('ModelAlias 类型', () => {
  it('结构字段类型正确', () => {
    // 验证 ModelAlias 包含 alias 和 target 字符串字段
    const alias: ModelAlias = {
      alias: 'claude',
      target: 'anthropic/claude-opus-4-6',
    };

    expectTypeOf(alias.alias).toEqualTypeOf<string>();
    expectTypeOf(alias.target).toEqualTypeOf<string>();
  });
});
