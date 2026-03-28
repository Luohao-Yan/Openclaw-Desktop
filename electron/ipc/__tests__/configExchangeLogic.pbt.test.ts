/**
 * 属性测试：配置导出/导入往返一致性
 * Feature: agent-enhancement-features
 *
 * 使用 fast-check 验证 AgentConfigExport 对象经过 JSON 序列化（模拟导出）
 * 再反序列化（模拟导入）后，数据保持一致，且导入验证通过。
 *
 * Property 1: 配置导出/导入往返一致性（验证: 需求 5.3, 6.3）
 */

import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';

// ============================================================================
// 类型定义（与 src/types/electron.ts 中的 AgentConfigExport 保持一致）
// ============================================================================

/** 智能体配置导出数据结构 */
interface AgentConfigExport {
  exportVersion: string;
  exportDate: string;
  agentInfo: {
    id: string;
    name: string;
    model: string;
    workspace: string;
  };
  config: Record<string, any>;
}

// ============================================================================
// 导入验证函数（与 agents:importConfig handler 中的验证逻辑一致）
// ============================================================================

/**
 * 验证导入数据是否包含必要的 agentInfo 和 config 字段
 * 对应 agents:importConfig handler 中的验证逻辑：
 *   if (!importData.agentInfo || !importData.config) { ... }
 */
function validateImportData(data: unknown): { valid: boolean; error?: string } {
  if (data === null || typeof data !== 'object') {
    return { valid: false, error: '导入数据不是有效的对象' };
  }
  const obj = data as Record<string, unknown>;
  if (!obj.agentInfo) {
    return { valid: false, error: '缺少 agentInfo 字段' };
  }
  if (!obj.config) {
    return { valid: false, error: '缺少 config 字段' };
  }
  return { valid: true };
}

// ============================================================================
// 生成器（Arbitraries）
// ============================================================================

/**
 * 生成随机的 agentInfo 对象
 * 包含 id、name、model、workspace 四个非空字符串字段
 */
const agentInfoArb: fc.Arbitrary<AgentConfigExport['agentInfo']> = fc.record({
  id: fc.string({ minLength: 1, maxLength: 32 }),
  name: fc.string({ minLength: 1, maxLength: 32 }),
  model: fc.string({ minLength: 1, maxLength: 32 }),
  workspace: fc.string({ minLength: 1, maxLength: 64 }),
});

/**
 * 生成 JSON 安全的原始值（排除 undefined、NaN、Infinity 等 JSON 不支持的值）
 */
const jsonSafeValueArb: fc.Arbitrary<unknown> = fc.oneof(
  fc.string({ maxLength: 64 }),
  fc.integer({ min: -1000000, max: 1000000 }),
  fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true }),
  fc.boolean(),
  fc.constant(null),
);

/**
 * 生成 JSON 安全的嵌套对象（最多 2 层嵌套）
 * 确保所有值在 JSON 序列化/反序列化后保持一致
 */
const jsonSafeObjectArb: fc.Arbitrary<Record<string, any>> = fc.dictionary(
  fc.string({ minLength: 1, maxLength: 16 }),
  fc.oneof(
    jsonSafeValueArb,
    // 嵌套数组
    fc.array(jsonSafeValueArb, { minLength: 0, maxLength: 5 }),
    // 嵌套对象（一层）
    fc.dictionary(
      fc.string({ minLength: 1, maxLength: 12 }),
      jsonSafeValueArb,
      { minKeys: 0, maxKeys: 4 },
    ),
  ),
  { minKeys: 0, maxKeys: 8 },
);

/**
 * 生成随机的 AgentConfigExport 对象
 * 包含 exportVersion、exportDate、agentInfo 和 config 字段
 */
const agentConfigExportArb: fc.Arbitrary<AgentConfigExport> = fc.record({
  exportVersion: fc.constantFrom('1.0', '1.1', '2.0'),
  exportDate: fc.integer({
    min: new Date('2020-01-01').getTime(),
    max: new Date('2026-12-31').getTime(),
  }).map((ms) => new Date(ms).toISOString()),
  agentInfo: agentInfoArb,
  config: jsonSafeObjectArb,
});

// ============================================================================
// Property 1: 配置导出/导入往返一致性
// Feature: agent-enhancement-features, Property 1: 配置导出/导入往返一致性
// ============================================================================

describe('Feature: agent-enhancement-features, Property 1: 配置导出/导入往返一致性', () => {
  /**
   * **Validates: Requirements 5.3, 6.3**
   *
   * 对任意有效的 AgentConfigExport 对象（包含 agentInfo 和 config 字段），
   * 将其序列化为 JSON 字符串（模拟导出）再解析回对象（模拟导入），
   * 导入验证应通过，且解析后的内容应与原始对象深度相等。
   */
  test(
    'Feature: agent-enhancement-features, Property 1: 配置导出/导入往返一致性',
    () => {
      fc.assert(
        fc.property(
          agentConfigExportArb,
          (original) => {
            // 步骤 1：序列化为 JSON 字符串（模拟 agents:exportConfig 的 JSON.stringify）
            const jsonString = JSON.stringify(original, null, 2);

            // 步骤 2：从 JSON 字符串解析回对象（模拟 agents:importConfig 的 JSON.parse）
            const parsed = JSON.parse(jsonString);

            // 步骤 3：验证导入数据包含必要的 agentInfo 和 config 字段
            const validation = validateImportData(parsed);
            expect(validation.valid).toBe(true);

            // 步骤 4：验证 agentInfo 字段完整且一致
            expect(parsed.agentInfo).toBeDefined();
            expect(parsed.agentInfo.id).toBe(original.agentInfo.id);
            expect(parsed.agentInfo.name).toBe(original.agentInfo.name);
            expect(parsed.agentInfo.model).toBe(original.agentInfo.model);
            expect(parsed.agentInfo.workspace).toBe(original.agentInfo.workspace);

            // 步骤 5：验证 config 字段深度相等
            expect(parsed.config).toEqual(original.config);

            // 步骤 6：验证整个对象深度相等（包括 exportVersion 和 exportDate）
            expect(parsed).toEqual(original);
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});
