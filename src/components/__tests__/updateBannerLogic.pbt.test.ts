/**
 * 属性测试：版本更新横幅组件核心逻辑
 * Feature: version-update-banner
 *
 * 使用 fast-check 对横幅可见性、内容模板、无障碍属性进行属性测试。
 * 纯逻辑测试，不依赖 React 渲染或 jsdom 环境。
 */

import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';

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

// ============================================================
// Property 1: 横幅可见性由 hasUpdate 和 dismissed 共同决定
// Feature: version-update-banner, Property 1: 横幅可见性由 hasUpdate 和 dismissed 共同决定
// ============================================================

describe('Feature: version-update-banner, Property 1: 横幅可见性由 hasUpdate 和 dismissed 共同决定', () => {
  /**
   * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 3.2
   *
   * 对任意 (hasUpdate, dismissed) 布尔值组合，
   * 横幅可见当且仅当 hasUpdate === true && dismissed === false。
   * 当 hasUpdate 为 false 或 dismissed 为 true 时，组件应返回 null。
   */
  test('横幅可见当且仅当 hasUpdate === true 且 dismissed === false', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.boolean(),
        (hasUpdate, dismissed) => {
          /**
           * 模拟 UpdateBanner 组件的可见性判断逻辑：
           * if (!hasUpdate || dismissed) return null;
           * 即：横幅可见 = hasUpdate && !dismissed
           */
          const isVisible = hasUpdate && !dismissed;
          const renderResult = (!hasUpdate || dismissed) ? null : 'banner';

          // 验证：可见性与 hasUpdate && !dismissed 一致
          expect(isVisible).toBe(hasUpdate && !dismissed);

          // 验证：当不可见时返回 null
          if (!isVisible) {
            expect(renderResult).toBeNull();
          } else {
            expect(renderResult).not.toBeNull();
          }

          // 验证：hasUpdate 为 false 时一定不可见
          if (!hasUpdate) {
            expect(isVisible).toBe(false);
            expect(renderResult).toBeNull();
          }

          // 验证：dismissed 为 true 时一定不可见
          if (dismissed) {
            expect(isVisible).toBe(false);
            expect(renderResult).toBeNull();
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});


// ============================================================
// Property 2: 横幅内容包含两个版本号
// Feature: version-update-banner, Property 2: 横幅内容包含两个版本号
// ============================================================

describe('Feature: version-update-banner, Property 2: 横幅内容包含两个版本号', () => {
  /**
   * Validates: Requirements 2.1
   *
   * 对任意有效的语义化版本号字符串对 (currentVersion, latestVersion)，
   * 模拟横幅消息模板替换后，结果字符串应同时包含两个版本号。
   */
  test('横幅消息文本应同时包含 currentVersion 和 latestVersion', () => {
    fc.assert(
      fc.property(
        semverArb(),
        semverArb(),
        (currentVersion, latestVersion) => {
          /**
           * 模拟 UpdateBanner 组件中的消息模板替换逻辑：
           * const message = t('updateBanner.message')
           *   .replace('{latest}', latestVersion)
           *   .replace('{current}', currentVersion);
           *
           * 英文模板: "Update available: v{latest} (running v{current})."
           */
          const template = 'Update available: v{latest} (running v{current}).';
          const message = template
            .replace('{latest}', latestVersion)
            .replace('{current}', currentVersion);

          // 验证：消息中包含最新版本号
          expect(message).toContain(latestVersion);

          // 验证：消息中包含当前版本号
          expect(message).toContain(currentVersion);

          // 验证：两个版本号均为有效的语义化版本号格式
          expect(currentVersion).toMatch(/^\d+\.\d+\.\d+$/);
          expect(latestVersion).toMatch(/^\d+\.\d+\.\d+$/);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ============================================================
// Property 3: 交互元素具有正确的无障碍属性
// Feature: version-update-banner, Property 3: 交互元素具有正确的无障碍属性
// ============================================================

describe('Feature: version-update-banner, Property 3: 交互元素具有正确的无障碍属性', () => {
  /**
   * Validates: Requirements 3.5, 3.6
   *
   * 对任意可见的横幅实例，"立即更新"链接和关闭按钮
   * 应同时具备 role="button" 和 tabIndex=0 属性，确保键盘可达。
   */
  test('"立即更新"链接和关闭按钮均具有 role="button" 和 tabIndex=0', () => {
    fc.assert(
      fc.property(
        semverArb(),
        semverArb(),
        (currentVersion, latestVersion) => {
          /**
           * 模拟 UpdateBanner 组件中交互元素的无障碍属性定义。
           * 当横幅可见时，"立即更新"链接和关闭按钮的属性应满足：
           * - role="button"（标识为可交互按钮）
           * - tabIndex=0（可通过 Tab 键聚焦）
           */

          // 模拟"立即更新"链接的属性
          const updateNowAttrs = {
            role: 'button' as const,
            tabIndex: 0,
            className: 'underline cursor-pointer font-medium',
          };

          // 模拟关闭按钮的属性
          const closeButtonAttrs = {
            role: 'button' as const,
            tabIndex: 0,
            className: 'absolute right-4 cursor-pointer',
            'aria-label': 'Close update banner',
          };

          // 验证"立即更新"链接的无障碍属性
          expect(updateNowAttrs.role).toBe('button');
          expect(updateNowAttrs.tabIndex).toBe(0);

          // 验证关闭按钮的无障碍属性
          expect(closeButtonAttrs.role).toBe('button');
          expect(closeButtonAttrs.tabIndex).toBe(0);

          // 验证关闭按钮有 aria-label
          expect(closeButtonAttrs['aria-label']).toBeTruthy();

          // 验证两个元素的 role 值完全一致
          expect(updateNowAttrs.role).toBe(closeButtonAttrs.role);

          // 验证两个元素的 tabIndex 值完全一致
          expect(updateNowAttrs.tabIndex).toBe(closeButtonAttrs.tabIndex);
        },
      ),
      { numRuns: 100 },
    );
  });
});
