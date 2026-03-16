/**
 * 属性测试：addEnabledChannels 结果映射逻辑
 * Feature: setup-guided-completion, Property 3: 渠道添加结果正确映射到状态
 *
 * 验证：对于任意渠道添加操作的结果（成功或失败），
 * - 当 CLI 返回 success: true 时，对应渠道的状态应标记为已添加
 * - 当 CLI 返回 success: false 时，对应渠道应携带错误信息
 * - 结果列表的长度应等于被执行添加的渠道数量
 *
 * Validates: Requirements 1.3, 1.4
 */

import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';
import type { ChannelConfig, ChannelField, ChannelAddResult } from '../../types/setup';

// ============================================================
// 纯函数：从 SetupFlowContext 中提取的结果映射逻辑
// ============================================================

/** IPC 返回的单个渠道添加结果 */
interface IpcAddResult {
  success: boolean;
  output?: string;
  error?: string;
}

/**
 * 判断渠道是否合格（与 SetupFlowContext.addEnabledChannels 中的过滤逻辑一致）。
 */
function isChannelEligible(ch: ChannelConfig): boolean {
  if (!ch.enabled) return false;
  const requiredFields = ch.fields.filter((f) => f.required);
  return requiredFields.every((f) => (ch.fieldValues[f.id] || '').trim() !== '');
}

/**
 * 模拟 addEnabledChannels 的结果映射逻辑。
 * 对每个合格渠道，根据 IPC 返回结果构建 ChannelAddResult。
 * 逻辑与 SetupFlowContext.addEnabledChannels 完全一致。
 */
function mapChannelAddResults(
  configs: ChannelConfig[],
  ipcResults: Map<string, IpcAddResult>,
): ChannelAddResult[] {
  const eligible = configs.filter(isChannelEligible);
  const results: ChannelAddResult[] = [];

  for (const ch of eligible) {
    const ipcResult = ipcResults.get(ch.key);
    if (ipcResult) {
      results.push({
        channelKey: ch.key,
        channelLabel: ch.label,
        success: ipcResult.success,
        output: ipcResult.output,
        error: ipcResult.error,
      });
    } else {
      // IPC 不可用时的降级处理
      results.push({
        channelKey: ch.key,
        channelLabel: ch.label,
        success: false,
        error: 'channelsAdd IPC 不可用',
      });
    }
  }

  return results;
}

/**
 * 从结果列表中提取成功添加的渠道（用于持久化到 setupSettings.addedChannels）。
 * 逻辑与 SetupFlowContext.addEnabledChannels 中的 addedChannels 计算一致。
 */
function extractAddedChannels(results: ChannelAddResult[]): Array<{ key: string; label: string }> {
  return results
    .filter((r) => r.success)
    .map((r) => ({ key: r.channelKey, label: r.channelLabel }));
}

// ============================================================
// 生成器（Arbitraries）
// ============================================================

/** 生成非空字段 ID（仅 ASCII 字母数字） */
const fieldIdArb = (): fc.Arbitrary<string> =>
  fc.string({
    minLength: 1,
    maxLength: 10,
    unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')),
  });

/** 生成随机 ChannelField */
const channelFieldArb = (): fc.Arbitrary<ChannelField> =>
  fc.record({
    id: fieldIdArb(),
    label: fc.string({ minLength: 1, maxLength: 20 }),
    placeholder: fc.string({ maxLength: 20 }),
    type: fc.constantFrom('password' as const, 'text' as const, 'info' as const),
    required: fc.boolean(),
  });

/** 生成随机 fieldValues 值 */
const fieldValueArb = (): fc.Arbitrary<string> =>
  fc.oneof(
    fc.constant(''),
    fc.constant('   '),
    fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0),
  );

/**
 * 生成随机 ChannelConfig，确保字段 ID 唯一。
 */
const channelConfigArb = (): fc.Arbitrary<ChannelConfig> =>
  fc.tuple(
    fieldIdArb(),
    fc.string({ minLength: 1, maxLength: 20 }),
    fc.boolean(),
    fc.array(channelFieldArb(), { minLength: 0, maxLength: 5 }),
  ).chain(([key, label, enabled, rawFields]) => {
    const seenIds = new Set<string>();
    const fields: ChannelField[] = [];
    for (const f of rawFields) {
      if (!seenIds.has(f.id)) {
        seenIds.add(f.id);
        fields.push(f);
      }
    }

    const fieldValueEntries = fields.map((f) =>
      fieldValueArb().map((val): [string, string] => [f.id, val]),
    );

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

/**
 * 生成具有唯一 key 的 ChannelConfig 数组。
 */
const uniqueKeyChannelConfigsArb = (): fc.Arbitrary<ChannelConfig[]> =>
  fc.array(channelConfigArb(), { minLength: 0, maxLength: 8 }).map((configs) => {
    const seen = new Set<string>();
    return configs.filter((ch) => {
      if (seen.has(ch.key)) return false;
      seen.add(ch.key);
      return true;
    });
  });

/** 生成随机 IPC 添加结果 */
const ipcAddResultArb = (): fc.Arbitrary<IpcAddResult> =>
  fc.oneof(
    // 成功结果
    fc.record({
      success: fc.constant(true),
      output: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
      error: fc.constant(undefined),
    }),
    // 失败结果
    fc.record({
      success: fc.constant(false),
      output: fc.constant(undefined),
      error: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
    }),
  );

// ============================================================
// Property 3: 渠道添加结果正确映射到状态
// Feature: setup-guided-completion, Property 3
// ============================================================

describe('Property 3: 渠道添加结果正确映射到状态', () => {
  /**
   * Validates: Requirements 1.3, 1.4
   *
   * 对于任意渠道配置列表和对应的 IPC 返回结果，
   * mapChannelAddResults 返回的结果列表长度应等于合格渠道数量，
   * 且每个结果的 success/error 字段正确反映 IPC 返回值。
   */
  test('结果列表长度等于合格渠道数量', () => {
    fc.assert(
      fc.property(
        uniqueKeyChannelConfigsArb(),
        (configs) => {
          // 为每个合格渠道生成随机 IPC 结果
          const eligible = configs.filter(isChannelEligible);
          const ipcResults = new Map<string, IpcAddResult>();
          // 使用确定性结果以隔离测试关注点
          for (const ch of eligible) {
            ipcResults.set(ch.key, { success: true, output: 'ok' });
          }

          const results = mapChannelAddResults(configs, ipcResults);

          // 结果列表长度应等于合格渠道数量
          expect(results.length).toBe(eligible.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  test('成功的渠道结果正确携带 channelKey、channelLabel 和 success 标记', () => {
    fc.assert(
      fc.property(
        uniqueKeyChannelConfigsArb(),
        (configs) => {
          const eligible = configs.filter(isChannelEligible);
          const ipcResults = new Map<string, IpcAddResult>();
          for (const ch of eligible) {
            ipcResults.set(ch.key, { success: true, output: `added ${ch.key}` });
          }

          const results = mapChannelAddResults(configs, ipcResults);

          for (let i = 0; i < eligible.length; i++) {
            const ch = eligible[i];
            const result = results[i];

            // channelKey 和 channelLabel 正确映射
            expect(result.channelKey).toBe(ch.key);
            expect(result.channelLabel).toBe(ch.label);
            // success 标记为 true
            expect(result.success).toBe(true);
            // output 正确传递
            expect(result.output).toBe(`added ${ch.key}`);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  test('失败的渠道结果正确携带错误信息', () => {
    fc.assert(
      fc.property(
        uniqueKeyChannelConfigsArb(),
        (configs) => {
          const eligible = configs.filter(isChannelEligible);
          const ipcResults = new Map<string, IpcAddResult>();
          for (const ch of eligible) {
            ipcResults.set(ch.key, { success: false, error: `fail:${ch.key}` });
          }

          const results = mapChannelAddResults(configs, ipcResults);

          for (let i = 0; i < eligible.length; i++) {
            const ch = eligible[i];
            const result = results[i];

            expect(result.channelKey).toBe(ch.key);
            expect(result.channelLabel).toBe(ch.label);
            expect(result.success).toBe(false);
            expect(result.error).toBe(`fail:${ch.key}`);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  test('混合成功/失败结果时，每个结果正确反映对应 IPC 返回值', () => {
    fc.assert(
      fc.property(
        uniqueKeyChannelConfigsArb().filter((configs) =>
          configs.filter(isChannelEligible).length > 0,
        ),
        fc.infiniteStream(ipcAddResultArb()),
        (configs, ipcStream) => {
          const eligible = configs.filter(isChannelEligible);
          const ipcResults = new Map<string, IpcAddResult>();
          const expectedIpcList: IpcAddResult[] = [];

          // 从无限流中为每个合格渠道取一个随机 IPC 结果
          for (const ch of eligible) {
            const ipcResult = ipcStream.next().value;
            ipcResults.set(ch.key, ipcResult);
            expectedIpcList.push(ipcResult);
          }

          const results = mapChannelAddResults(configs, ipcResults);

          // 长度一致
          expect(results.length).toBe(eligible.length);

          // 逐个验证映射正确性
          for (let i = 0; i < eligible.length; i++) {
            const ch = eligible[i];
            const ipcResult = expectedIpcList[i];
            const result = results[i];

            expect(result.channelKey).toBe(ch.key);
            expect(result.channelLabel).toBe(ch.label);
            expect(result.success).toBe(ipcResult.success);
            expect(result.output).toBe(ipcResult.output);
            expect(result.error).toBe(ipcResult.error);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  test('extractAddedChannels 仅包含 success === true 的渠道', () => {
    fc.assert(
      fc.property(
        uniqueKeyChannelConfigsArb().filter((configs) =>
          configs.filter(isChannelEligible).length > 0,
        ),
        fc.infiniteStream(ipcAddResultArb()),
        (configs, ipcStream) => {
          const eligible = configs.filter(isChannelEligible);
          const ipcResults = new Map<string, IpcAddResult>();

          for (const ch of eligible) {
            ipcResults.set(ch.key, ipcStream.next().value);
          }

          const results = mapChannelAddResults(configs, ipcResults);
          const addedChannels = extractAddedChannels(results);

          // addedChannels 中的每个条目都应对应 success === true 的结果
          const successResults = results.filter((r) => r.success);
          expect(addedChannels.length).toBe(successResults.length);

          for (const added of addedChannels) {
            const matchingResult = results.find(
              (r) => r.channelKey === added.key && r.success,
            );
            expect(matchingResult).toBeDefined();
            expect(added.label).toBe(matchingResult!.channelLabel);
          }

          // 失败的渠道不应出现在 addedChannels 中
          const failedKeys = results
            .filter((r) => !r.success)
            .map((r) => r.channelKey);
          for (const failedKey of failedKeys) {
            expect(addedChannels.some((a) => a.key === failedKey)).toBe(false);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  test('IPC 不可用时，所有合格渠道结果均为失败且携带降级错误信息', () => {
    fc.assert(
      fc.property(
        uniqueKeyChannelConfigsArb(),
        (configs) => {
          const eligible = configs.filter(isChannelEligible);
          // 空的 ipcResults 模拟 IPC 不可用
          const emptyIpcResults = new Map<string, IpcAddResult>();

          const results = mapChannelAddResults(configs, emptyIpcResults);

          expect(results.length).toBe(eligible.length);

          for (const result of results) {
            expect(result.success).toBe(false);
            expect(result.error).toBe('channelsAdd IPC 不可用');
          }

          // addedChannels 应为空
          const addedChannels = extractAddedChannels(results);
          expect(addedChannels.length).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});
