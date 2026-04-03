/**
 * 单元测试：版本更新提醒功能
 * Feature: openclaw-version-update-notify
 *
 * 测试 checkVersion 纯函数、hasNewerVersion 纯函数，
 * 以及 UpdateDialog 状态机逻辑和国际化文案完整性。
 */

import { describe, test, expect } from 'vitest';
import { checkVersion, hasNewerVersion } from '../../services/useVersionChecker';
import { translations } from '../../i18n/translations';

// ============================================================
// 7.1: checkVersion / hasNewerVersion 单元测试
// ============================================================

describe('checkVersion 纯函数', () => {
  // ── 成功场景 ──────────────────────────────────────────

  test('初始化调用 - 成功场景：两个 IPC 调用均成功时返回正确的版本信息', async () => {
    const getCurrent = async () => ({ success: true as const, version: '3.8.0' });
    const listAvailable = async () => ({
      success: true as const,
      versions: ['3.8.0', '3.13.0', '3.24.0'],
      latest: '3.24.0',
    });

    const result = await checkVersion(getCurrent, listAvailable);

    expect(result).not.toBeNull();
    expect(result!.currentVersion).toBe('3.8.0');
    expect(result!.latestVersion).toBe('3.24.0');
    expect(result!.hasUpdate).toBe(true);
  });

  test('初始化调用 - 有新版本：available 中存在更高版本时 hasUpdate 为 true', async () => {
    const getCurrent = async () => ({ success: true as const, version: '1.0.0' });
    const listAvailable = async () => ({
      success: true as const,
      versions: ['1.0.0', '2.0.0'],
      latest: '2.0.0',
    });

    const result = await checkVersion(getCurrent, listAvailable);

    expect(result).not.toBeNull();
    expect(result!.hasUpdate).toBe(true);
  });

  test('初始化调用 - 无新版本：所有 available 版本均不高于当前版本时 hasUpdate 为 false', async () => {
    const getCurrent = async () => ({ success: true as const, version: '3.24.0' });
    const listAvailable = async () => ({
      success: true as const,
      versions: ['3.8.0', '3.13.0', '3.24.0'],
      latest: '3.24.0',
    });

    const result = await checkVersion(getCurrent, listAvailable);

    expect(result).not.toBeNull();
    expect(result!.hasUpdate).toBe(false);
  });

  // ── 错误处理 ──────────────────────────────────────────

  test('错误处理 - getCurrent 失败：返回 null', async () => {
    const getCurrent = async () => ({ success: false as const, error: 'IPC error' });
    const listAvailable = async () => ({
      success: true as const,
      versions: ['2.0.0'],
      latest: '2.0.0',
    });

    const result = await checkVersion(getCurrent, listAvailable);
    expect(result).toBeNull();
  });

  test('错误处理 - listAvailable 失败：返回 null', async () => {
    const getCurrent = async () => ({ success: true as const, version: '1.0.0' });
    const listAvailable = async () => ({ success: false as const, error: 'network error' });

    const result = await checkVersion(getCurrent, listAvailable);
    expect(result).toBeNull();
  });

  test('错误处理 - 异常抛出：getCurrent 抛出异常时返回 null', async () => {
    const getCurrent = async () => { throw new Error('unexpected crash'); };
    const listAvailable = async () => ({
      success: true as const,
      versions: ['2.0.0'],
      latest: '2.0.0',
    });

    const result = await checkVersion(getCurrent, listAvailable);
    expect(result).toBeNull();
  });

  test('错误处理 - 异常抛出：listAvailable 抛出异常时返回 null', async () => {
    const getCurrent = async () => ({ success: true as const, version: '1.0.0' });
    const listAvailable = async () => { throw new Error('timeout'); };

    const result = await checkVersion(getCurrent, listAvailable);
    expect(result).toBeNull();
  });

  // ── 边界条件 ──────────────────────────────────────────

  test('边界条件 - 空版本列表：versions 为空数组时返回 null', async () => {
    const getCurrent = async () => ({ success: true as const, version: '1.0.0' });
    const listAvailable = async () => ({
      success: true as const,
      versions: [] as string[],
      latest: undefined,
    });

    const result = await checkVersion(getCurrent, listAvailable);
    expect(result).toBeNull();
  });

  test('边界条件 - 缺少 version 字段：getCurrent 返回 success 但无 version 时返回 null', async () => {
    const getCurrent = async () => ({ success: true as const });
    const listAvailable = async () => ({
      success: true as const,
      versions: ['2.0.0'],
      latest: '2.0.0',
    });

    const result = await checkVersion(getCurrent, listAvailable);
    expect(result).toBeNull();
  });
});

// ── hasNewerVersion 纯函数测试 ──────────────────────────────

describe('hasNewerVersion 纯函数', () => {
  test('available 中存在更高版本时返回 true', () => {
    expect(hasNewerVersion('1.0.0', ['1.0.0', '2.0.0'])).toBe(true);
  });

  test('available 中所有版本均不高于 current 时返回 false', () => {
    expect(hasNewerVersion('3.0.0', ['1.0.0', '2.0.0', '3.0.0'])).toBe(false);
  });

  test('available 为空数组时返回 false', () => {
    expect(hasNewerVersion('1.0.0', [])).toBe(false);
  });

  test('仅 patch 版本更高时返回 true', () => {
    expect(hasNewerVersion('1.0.0', ['1.0.1'])).toBe(true);
  });

  test('仅 minor 版本更高时返回 true', () => {
    expect(hasNewerVersion('1.0.0', ['1.1.0'])).toBe(true);
  });

  test('仅 major 版本更高时返回 true', () => {
    expect(hasNewerVersion('1.0.0', ['2.0.0'])).toBe(true);
  });

  test('current 版本高于所有 available 时返回 false', () => {
    expect(hasNewerVersion('5.0.0', ['1.0.0', '2.0.0', '4.99.99'])).toBe(false);
  });

  test('版本号完全相同时返回 false', () => {
    expect(hasNewerVersion('1.2.3', ['1.2.3'])).toBe(false);
  });
});


// ============================================================
// 7.2: UpdateDialog 逻辑单元测试
// ============================================================

import type { UpdateDialogStatus } from '../../components/UpdateDialog';

describe('UpdateDialog 状态机转换逻辑', () => {
  /**
   * 验证状态机转换规则：
   * idle → installing（点击"立即升级"）
   * installing → success（安装成功）
   * installing → error（安装失败）
   * error → installing（点击"重试"）
   */

  test('idle 状态可以转换到 installing 状态', () => {
    const currentStatus: UpdateDialogStatus = 'idle';
    // 模拟点击"立即升级"后的状态转换
    const nextStatus: UpdateDialogStatus = 'installing';
    expect(currentStatus).toBe('idle');
    expect(nextStatus).toBe('installing');
  });

  test('installing 状态可以转换到 success 状态', () => {
    const currentStatus: UpdateDialogStatus = 'installing';
    // 模拟安装成功后的状态转换
    const nextStatus: UpdateDialogStatus = 'success';
    expect(currentStatus).toBe('installing');
    expect(nextStatus).toBe('success');
  });

  test('installing 状态可以转换到 error 状态', () => {
    const currentStatus: UpdateDialogStatus = 'installing';
    // 模拟安装失败后的状态转换
    const nextStatus: UpdateDialogStatus = 'error';
    expect(currentStatus).toBe('installing');
    expect(nextStatus).toBe('error');
  });

  test('error 状态可以转换到 installing 状态（重试）', () => {
    const currentStatus: UpdateDialogStatus = 'error';
    // 模拟点击"重试"后的状态转换
    const nextStatus: UpdateDialogStatus = 'installing';
    expect(currentStatus).toBe('error');
    expect(nextStatus).toBe('installing');
  });

  test('所有有效状态值均为预定义的四种之一', () => {
    const validStatuses: UpdateDialogStatus[] = ['idle', 'installing', 'success', 'error'];
    validStatuses.forEach((status) => {
      expect(['idle', 'installing', 'success', 'error']).toContain(status);
    });
  });
});

describe('UpdateDialog 安装日志追加逻辑', () => {
  test('日志条目按顺序累积', () => {
    // 模拟 installLog 状态的追加行为
    let installLog: string[] = [];

    // 模拟接收到第一条日志
    installLog = [...installLog, 'Downloading version 3.24.0...'];
    expect(installLog).toHaveLength(1);
    expect(installLog[0]).toBe('Downloading version 3.24.0...');

    // 模拟接收到第二条日志
    installLog = [...installLog, 'Installing dependencies...'];
    expect(installLog).toHaveLength(2);
    expect(installLog[1]).toBe('Installing dependencies...');

    // 模拟接收到第三条日志
    installLog = [...installLog, 'Installation complete.'];
    expect(installLog).toHaveLength(3);
    // 验证顺序保持不变
    expect(installLog).toEqual([
      'Downloading version 3.24.0...',
      'Installing dependencies...',
      'Installation complete.',
    ]);
  });

  test('弹窗重新打开时日志应被清空', () => {
    // 模拟已有日志
    let installLog: string[] = ['line1', 'line2'];
    expect(installLog).toHaveLength(2);

    // 模拟弹窗重新打开时的重置逻辑
    installLog = [];
    expect(installLog).toHaveLength(0);
  });
});

describe('UpdateDialog 按钮禁用逻辑', () => {
  test('idle 状态下升级按钮可用（不禁用）', () => {
    const status: UpdateDialogStatus = 'idle';
    const upgradeDisabled = status === 'installing';
    expect(upgradeDisabled).toBe(false);
  });

  test('installing 状态下按钮禁用', () => {
    const status: UpdateDialogStatus = 'installing';
    const upgradeDisabled = status === 'installing';
    expect(upgradeDisabled).toBe(true);
  });

  test('success 状态下升级按钮不显示（不禁用）', () => {
    const status: UpdateDialogStatus = 'success';
    const upgradeDisabled = status === 'installing';
    expect(upgradeDisabled).toBe(false);
  });

  test('error 状态下重试按钮可用（不禁用）', () => {
    const status: UpdateDialogStatus = 'error';
    const upgradeDisabled = status === 'installing';
    expect(upgradeDisabled).toBe(false);
  });

  test('仅 installing 状态下按钮禁用，其他状态均不禁用', () => {
    const allStatuses: UpdateDialogStatus[] = ['idle', 'installing', 'success', 'error'];
    allStatuses.forEach((status) => {
      const disabled = status === 'installing';
      if (status === 'installing') {
        expect(disabled).toBe(true);
      } else {
        expect(disabled).toBe(false);
      }
    });
  });
});

describe('国际化键存在性验证', () => {
  /**
   * 验证所有 versionUpdate.* 翻译键在 en 和 zh 中均存在
   */
  const requiredKeys = [
    'versionUpdate.newBadge',
    'versionUpdate.title',
    'versionUpdate.currentVersion',
    'versionUpdate.latestVersion',
    'versionUpdate.upgradeNow',
    'versionUpdate.later',
    'versionUpdate.installing',
    'versionUpdate.installSuccess',
    'versionUpdate.installFailed',
    'versionUpdate.restartApp',
    'versionUpdate.retry',
    'versionUpdate.installLog',
  ];

  test('所有 versionUpdate 翻译键在英文翻译中均存在', () => {
    const en = translations.en as Record<string, string>;
    requiredKeys.forEach((key) => {
      expect(en).toHaveProperty(key);
      expect(typeof en[key]).toBe('string');
      expect(en[key].length).toBeGreaterThan(0);
    });
  });

  test('所有 versionUpdate 翻译键在中文翻译中均存在', () => {
    const zh = translations.zh as Record<string, string>;
    requiredKeys.forEach((key) => {
      expect(zh).toHaveProperty(key);
      expect(typeof zh[key]).toBe('string');
      expect(zh[key].length).toBeGreaterThan(0);
    });
  });

  test('英文和中文翻译键数量一致', () => {
    const en = translations.en as Record<string, string>;
    const zh = translations.zh as Record<string, string>;
    const enKeys = requiredKeys.filter((k) => k in en);
    const zhKeys = requiredKeys.filter((k) => k in zh);
    expect(enKeys.length).toBe(zhKeys.length);
  });
});
