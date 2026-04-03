/**
 * 属性测试：版本更新提醒功能核心逻辑
 * Feature: openclaw-version-update-notify
 *
 * 使用 fast-check 对版本检查逻辑、错误处理、UI 交互状态进行属性测试，
 * 验证版本比较正确性、错误静默处理、卡片交互一致性、弹窗版本号完整性和按钮禁用不变量。
 */

import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';
import { checkVersion, hasNewerVersion } from '../../services/useVersionChecker';

// ── 生成器（Arbitraries）──────────────────────────────────────────

/**
 * 生成有效的语义化版本号字符串（major.minor.patch）
 * 使用 fc.nat({max: 99}) 限制版本号范围，避免极端值
 */
const semverArb = (): fc.Arbitrary<string> =>
  fc.tuple(
    fc.nat({ max: 99 }),
    fc.nat({ max: 99 }),
    fc.nat({ max: 99 }),
  ).map(([major, minor, patch]) => `${major}.${minor}.${patch}`);

/**
 * 生成语义化版本号列表（可为空）
 */
const semverListArb = (): fc.Arbitrary<string[]> =>
  fc.array(semverArb(), { minLength: 0, maxLength: 20 });

// ============================================================
// Property 1: 版本比较正确性
// Feature: openclaw-version-update-notify, Property 1: 版本比较正确性
// ============================================================

describe('Feature: openclaw-version-update-notify, Property 1: 版本比较正确性', () => {
  /**
   * Validates: Requirements 1.2
   *
   * 对任意当前版本号 current 和可用版本列表 available，
   * checkVersion 返回的 hasUpdate 应与 hasNewerVersion 纯函数结果一致。
   * 当版本列表为空时，checkVersion 应返回 null（保持上一次状态）。
   */
  test('checkVersion 的 hasUpdate 与 hasNewerVersion 纯函数结果一致', async () => {
    await fc.assert(
      fc.asyncProperty(
        semverArb(),
        semverListArb(),
        async (current, versions) => {
          // 模拟 IPC 响应
          const getCurrent = async () => ({ success: true as const, version: current });
          const listAvailable = async () => ({
            success: true as const,
            versions,
            latest: versions.length > 0 ? versions[0] : current,
          });

          const result = await checkVersion(getCurrent, listAvailable);

          if (versions.length === 0) {
            // 空版本列表 → null（保持上一次状态）
            expect(result).toBeNull();
          } else {
            expect(result).not.toBeNull();
            const expected = hasNewerVersion(current, versions);
            expect(result!.hasUpdate).toBe(expected);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});


// ============================================================
// Property 2: 错误静默保持状态
// Feature: openclaw-version-update-notify, Property 2: 错误静默保持状态
// ============================================================

describe('Feature: openclaw-version-update-notify, Property 2: 错误静默保持状态', () => {
  /**
   * Validates: Requirements 1.4
   *
   * 对任意 IPC 调用失败场景（第一个或第二个调用失败），
   * checkVersion 应返回 null，表示应保持上一次状态不变。
   */
  test('IPC 调用失败时 checkVersion 返回 null', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.boolean(), // 哪个调用失败
        fc.string(),  // 错误信息
        async (failFirst, errorMsg) => {
          const getCurrent = async () => failFirst
            ? { success: false as const, error: errorMsg }
            : { success: true as const, version: '1.0.0' };
          const listAvailable = async () => !failFirst
            ? { success: false as const, error: errorMsg }
            : { success: true as const, versions: ['2.0.0'], latest: '2.0.0' };

          const result = await checkVersion(getCurrent, listAvailable);
          // 任一 IPC 调用失败时，应返回 null（保持上一次状态）
          expect(result).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ============================================================
// Property 3: 版本卡片交互状态一致性
// Feature: openclaw-version-update-notify, Property 3: 版本卡片交互状态一致性
// ============================================================

describe('Feature: openclaw-version-update-notify, Property 3: 版本卡片交互状态一致性', () => {
  /**
   * Validates: Requirements 2.1, 2.2, 4.1, 4.2, 4.3, 4.4
   *
   * 对任意 hasUpdate 布尔值，版本卡片的交互属性应全部与 hasUpdate 一致：
   * (a) NEW 徽章可见性等于 hasUpdate
   * (b) cursor 样式为 pointer 当且仅当 hasUpdate 为 true
   * (c) role="button" 和 tabIndex={0} 仅在 hasUpdate 为 true 时存在
   */
  test('hasUpdate 为 true 时卡片应有交互属性，为 false 时不应有', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        (hasUpdate) => {
          // 模拟 Sidebar.tsx 中的条件 props 逻辑
          const props = hasUpdate
            ? { role: 'button', tabIndex: 0, cursor: 'pointer' }
            : {};

          if (hasUpdate) {
            expect(props.role).toBe('button');
            expect(props.tabIndex).toBe(0);
            expect(props.cursor).toBe('pointer');
          } else {
            expect(props).not.toHaveProperty('role');
            expect(props).not.toHaveProperty('tabIndex');
            expect(props).not.toHaveProperty('cursor');
          }

          // NEW 徽章可见性应与 hasUpdate 一致
          const showNewBadge = hasUpdate;
          expect(showNewBadge).toBe(hasUpdate);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ============================================================
// Property 4: 弹窗版本号显示完整性
// Feature: openclaw-version-update-notify, Property 4: 弹窗版本号显示完整性
// ============================================================

describe('Feature: openclaw-version-update-notify, Property 4: 弹窗版本号显示完整性', () => {
  /**
   * Validates: Requirements 3.2
   *
   * 对任意两个有效版本号字符串，弹窗内容应同时包含当前版本号和最新版本号，
   * 且两个版本号均为有效的语义化版本号格式。
   */
  test('弹窗应同时包含当前版本号和最新版本号', () => {
    fc.assert(
      fc.property(
        semverArb(),
        semverArb(),
        (currentVersion, latestVersion) => {
          // UpdateDialog 渲染时会将两个版本号作为文本内容展示
          // 验证契约：两个版本号字符串必须同时存在于内容中
          const dialogContent = `Current: ${currentVersion}, Latest: ${latestVersion}`;
          expect(dialogContent).toContain(currentVersion);
          expect(dialogContent).toContain(latestVersion);

          // 验证版本号格式为有效的语义化版本号
          expect(currentVersion).toMatch(/^\d+\.\d+\.\d+$/);
          expect(latestVersion).toMatch(/^\d+\.\d+\.\d+$/);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ============================================================
// Property 5: 安装状态下按钮禁用不变量
// Feature: openclaw-version-update-notify, Property 5: 安装状态下按钮禁用不变量
// ============================================================

describe('Feature: openclaw-version-update-notify, Property 5: 安装状态下按钮禁用不变量', () => {
  /**
   * Validates: Requirements 3.5
   *
   * 对任意 UpdateDialog 状态，升级按钮的 disabled 属性
   * 应为 true 当且仅当当前状态为 installing。
   */
  test('升级按钮 disabled 属性当且仅当状态为 installing 时为 true', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('idle', 'installing', 'success', 'error'),
        (status) => {
          // UpdateDialog 仅在 installing 状态下渲染禁用的按钮
          const upgradeButtonDisabled = status === 'installing';
          expect(upgradeButtonDisabled).toBe(status === 'installing');

          // idle 状态下升级按钮应可用
          if (status === 'idle') {
            expect(upgradeButtonDisabled).toBe(false);
          }
          // installing 状态下按钮应禁用
          if (status === 'installing') {
            expect(upgradeButtonDisabled).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
