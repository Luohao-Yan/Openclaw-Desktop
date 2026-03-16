// ============================================================================
// Setup Flow 集成属性测试
// 验证 reducer 状态变更流程、导航图条件导航、错误处理和降级逻辑的协同工作。
// @see 需求 1.1, 4.3, 2.5
// ============================================================================

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { setupReducer, initialSetupState, createSetupError } from '../setupReducer';
import { getPreviousStep, shouldSkipStep } from '../setupNavigationGraph';
import { createFallbackEnvironmentCheck } from '../setupFallback';
import type { SetupState } from '../setupReducer';

// ============================================================================
// 集成测试 1: Reducer 状态变更流程
// 验证多个 action 按序 dispatch 后状态一致
// ============================================================================

describe('Setup Flow 集成测试', () => {
  it('多步骤状态变更流程保持一致性', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('local', 'remote') as fc.Arbitrary<'local' | 'remote'>,
        fc.boolean(),
        fc.string({ minLength: 1, maxLength: 50 }),
        (mode, isBusy, errorMsg) => {
          // 模拟完整的引导流程：设置模式 → 设置忙碌 → 设置错误 → 清除错误
          let state = initialSetupState;

          // 步骤 1: 设置模式
          state = setupReducer(state, { type: 'SET_MODE', payload: mode });
          expect(state.mode).toBe(mode);

          // 步骤 2: 设置忙碌状态
          state = setupReducer(state, { type: 'SET_BUSY', payload: isBusy });
          expect(state.ui.isBusy).toBe(isBusy);
          // 模式不应被影响
          expect(state.mode).toBe(mode);

          // 步骤 3: 设置错误
          const error = createSetupError('IPC_CALL_FAILED', errorMsg, '请重试');
          state = setupReducer(state, { type: 'SET_ERROR', payload: error });
          expect(state.ui.error?.message).toBe(errorMsg);
          // 模式和忙碌状态不应被影响
          expect(state.mode).toBe(mode);
          expect(state.ui.isBusy).toBe(isBusy);

          // 步骤 4: 清除错误
          state = setupReducer(state, { type: 'SET_ERROR', payload: null });
          expect(state.ui.error).toBeNull();
          // 其他状态保持不变
          expect(state.mode).toBe(mode);
          expect(state.ui.isBusy).toBe(isBusy);
        },
      ),
      { numRuns: 50 },
    );
  });

  // ============================================================================
  // 集成测试 2: 导航图条件导航
  // 验证不同状态下导航函数返回正确路径
  // ============================================================================

  it('导航图根据状态返回正确路径', () => {
    fc.assert(
      fc.property(
        fc.boolean(), // localInstallValidated
        fc.constantFrom('bundled', 'system', 'online', 'missing') as fc.Arbitrary<'bundled' | 'system' | 'online' | 'missing'>,
        (localInstallValidated, runtimeTier) => {
          const state: SetupState = {
            ...initialSetupState,
            settings: {
              ...initialSetupState.settings,
              localInstallValidated,
            },
            environment: {
              ...initialSetupState.environment,
              check: {
                status: 'success',
                data: {
                  // 初始状态为 fallback 类型，通过收窄安全访问 data
                  ...(initialSetupState.environment.check as { status: 'fallback'; data: import('../../types/setup').SetupEnvironmentCheckData; reason: string }).data,
                  runtimeTier,
                  // 跳过条件还需要这两个字段为 true
                  bundledNodeAvailable: true,
                  bundledOpenClawAvailable: true,
                },
              },
            },
          };

          // 从配置页返回时，根据 localInstallValidated 决定路径
          const prevFromConfigure = getPreviousStep('/setup/local/configure', state);
          if (localInstallValidated) {
            expect(prevFromConfigure).toBe('/setup/local/confirm-existing');
          } else {
            expect(prevFromConfigure).toBe('/setup/local/install-guide');
          }

          // 内置运行时且 bundled 资源都可用时应跳过环境检测
          const skipEnv = shouldSkipStep('/setup/local/environment', state);
          expect(skipEnv).toBe(runtimeTier === 'bundled');
        },
      ),
      { numRuns: 50 },
    );
  });

  // ============================================================================
  // 集成测试 3: 错误处理和降级逻辑
  // 验证降级结果保留部分数据且状态一致
  // ============================================================================

  it('降级结果保留部分数据且与 reducer 状态一致', () => {
    fc.assert(
      fc.property(
        fc.option(fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0), { nil: undefined }),
        fc.option(fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0), { nil: undefined }),
        fc.string({ minLength: 1, maxLength: 100 }),
        (platform, platformLabel, errorReason) => {
          // 创建降级结果
          const fallback = createFallbackEnvironmentCheck(
            { platform, platformLabel },
            errorReason,
          );

          // 验证降级结果结构
          expect(fallback.status).toBe('fallback');
          // 类型收窄：createFallbackEnvironmentCheck 总是返回 fallback 类型
          if (fallback.status !== 'fallback') {
            throw new Error('Expected fallback status');
          }
          expect(fallback.reason).toBe(errorReason);

          // 验证部分数据保留（仅当提供了非空值时）
          if (platform && platform.trim().length > 0) {
            expect(fallback.data.platform).toBe(platform);
          }
          if (platformLabel && platformLabel.trim().length > 0) {
            expect(fallback.data.platformLabel).toBe(platformLabel);
          }

          // 将降级结果应用到 reducer
          let state = initialSetupState;
          state = setupReducer(state, { type: 'SET_ENVIRONMENT_CHECK', payload: fallback });

          // 验证状态一致性
          expect(state.environment.check.status).toBe('fallback');
          // 类型收窄：验证 reducer 后的状态也是 fallback 类型
          if (state.environment.check.status !== 'fallback') {
            throw new Error('Expected fallback status after reducer');
          }
          expect(state.environment.check.data.platform).toBe(fallback.data.platform);
        },
      ),
      { numRuns: 50 },
    );
  });

  it('渠道配置更新保持其他渠道不变', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10 }),
        fc.boolean(),
        (channelIndex, enabled) => {
          // 初始化带有多个渠道的状态
          const configs = Array.from({ length: 11 }, (_, i) => ({
            key: `channel-${i}`,
            label: `Channel ${i}`,
            hint: '',
            tokenLabel: '',
            enabled: false,
            token: '',
            fields: [],
            fieldValues: {},
            testStatus: 'idle' as const,
          }));

          let state: SetupState = {
            ...initialSetupState,
            channels: { ...initialSetupState.channels, configs },
          };

          // 更新指定渠道
          const targetKey = `channel-${channelIndex}`;
          state = setupReducer(state, {
            type: 'UPDATE_CHANNEL',
            payload: { key: targetKey, updates: { enabled } },
          });

          // 验证目标渠道已更新
          const updated = state.channels.configs.find((c) => c.key === targetKey);
          expect(updated?.enabled).toBe(enabled);

          // 验证其他渠道未受影响
          state.channels.configs.forEach((c) => {
            if (c.key !== targetKey) {
              expect(c.enabled).toBe(false);
            }
          });
        },
      ),
      { numRuns: 50 },
    );
  });
});
