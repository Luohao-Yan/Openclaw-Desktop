/**
 * 单元测试：OpenClaw 版本管理纯逻辑模块
 * Feature: openclaw-version-management
 *
 * 测试 sortVersionsDescending、isCacheValid、hasNewerVersion、
 * addHistoryRecord、buildInstallCommand、parseSemver、
 * buildSuccessResponse、buildErrorResponse 的典型场景和边界条件。
 */

import { describe, it, expect } from 'vitest';
import {
  sortVersionsDescending,
  isCacheValid,
  hasNewerVersion,
  addHistoryRecord,
  buildInstallCommand,
  parseSemver,
  buildSuccessResponse,
  buildErrorResponse,
  type VersionHistoryRecord,
} from '../openclawVersionLogic.js';

// ── parseSemver 测试 ──────────────────────────────────────────────

describe('parseSemver', () => {
  it('正常版本号解析为 [major, minor, patch]', () => {
    expect(parseSemver('1.2.3')).toEqual([1, 2, 3]);
    expect(parseSemver('0.0.0')).toEqual([0, 0, 0]);
    expect(parseSemver('10.20.30')).toEqual([10, 20, 30]);
  });

  it('含预发布标签的版本号仅解析主版本部分', () => {
    // "1.0.0-beta.1" 应被解析为 [1, 0, 0]
    expect(parseSemver('1.0.0-beta.1')).toEqual([1, 0, 0]);
    expect(parseSemver('2.3.4-rc.2')).toEqual([2, 3, 4]);
    expect(parseSemver('0.1.0-alpha')).toEqual([0, 1, 0]);
  });

  it('无效字符串返回 [0, 0, 0]', () => {
    expect(parseSemver('')).toEqual([0, 0, 0]);
    expect(parseSemver('abc')).toEqual([0, 0, 0]);
    expect(parseSemver('not-a-version')).toEqual([0, 0, 0]);
    expect(parseSemver('1.2')).toEqual([0, 0, 0]);
    expect(parseSemver('v1.2.3')).toEqual([0, 0, 0]);
  });
});

// ── sortVersionsDescending 测试 ───────────────────────────────────

describe('sortVersionsDescending', () => {
  it('空列表返回空数组', () => {
    expect(sortVersionsDescending([])).toEqual([]);
  });

  it('单元素列表原样返回', () => {
    expect(sortVersionsDescending(['1.0.0'])).toEqual(['1.0.0']);
  });

  it('多版本按降序排列', () => {
    const input = ['1.0.0', '3.0.0', '2.0.0'];
    expect(sortVersionsDescending(input)).toEqual(['3.0.0', '2.0.0', '1.0.0']);
  });

  it('含预发布版本时按主版本号排序（"1.0.0-beta.1" 视为 1.0.0）', () => {
    const input = ['1.0.0-beta.1', '2.0.0', '1.0.0'];
    const sorted = sortVersionsDescending(input);
    // 2.0.0 最大，1.0.0-beta.1 和 1.0.0 解析后相同，保持相对顺序
    expect(sorted[0]).toBe('2.0.0');
  });

  it('不修改原数组', () => {
    const input = ['2.0.0', '1.0.0'];
    const copy = [...input];
    sortVersionsDescending(input);
    expect(input).toEqual(copy);
  });
});

// ── isCacheValid 测试 ─────────────────────────────────────────────

describe('isCacheValid', () => {
  it('刚好过期时返回 false（now - cachedAt === ttlMs）', () => {
    const cachedAt = 1000;
    const ttlMs = 500;
    const now = 1500; // 差值 = 500 === ttlMs
    expect(isCacheValid(cachedAt, ttlMs, now)).toBe(false);
  });

  it('刚好未过期时返回 true（now - cachedAt === ttlMs - 1）', () => {
    const cachedAt = 1000;
    const ttlMs = 500;
    const now = 1499; // 差值 = 499 < ttlMs
    expect(isCacheValid(cachedAt, ttlMs, now)).toBe(true);
  });

  it('远未过期时返回 true', () => {
    expect(isCacheValid(1000, 10000, 1001)).toBe(true);
  });

  it('远已过期时返回 false', () => {
    expect(isCacheValid(1000, 500, 99999)).toBe(false);
  });
});

// ── hasNewerVersion 测试 ──────────────────────────────────────────

describe('hasNewerVersion', () => {
  it('current 是最新版本时返回 false', () => {
    expect(hasNewerVersion('3.0.0', ['1.0.0', '2.0.0', '3.0.0'])).toBe(false);
  });

  it('current 不在列表中但仍是最新时返回 false', () => {
    // current 为 5.0.0，列表中最高为 3.0.0
    expect(hasNewerVersion('5.0.0', ['1.0.0', '2.0.0', '3.0.0'])).toBe(false);
  });

  it('列表为空时返回 false', () => {
    expect(hasNewerVersion('1.0.0', [])).toBe(false);
  });

  it('存在更新版本时返回 true', () => {
    expect(hasNewerVersion('1.0.0', ['1.0.0', '2.0.0'])).toBe(true);
  });

  it('仅 patch 版本更新时也返回 true', () => {
    expect(hasNewerVersion('1.0.0', ['1.0.1'])).toBe(true);
  });
});

// ── addHistoryRecord 测试 ─────────────────────────────────────────

describe('addHistoryRecord', () => {
  /** 创建测试用历史记录 */
  const makeRecord = (from: string, to: string): VersionHistoryRecord => ({
    timestamp: new Date().toISOString(),
    fromVersion: from,
    toVersion: to,
    type: 'upgrade',
  });

  it('空历史添加一条记录后长度为 1', () => {
    const record = makeRecord('1.0.0', '2.0.0');
    const result = addHistoryRecord([], record);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(record);
  });

  it('满 20 条时添加新记录应移除最早的记录', () => {
    // 构造 20 条历史记录
    const history: VersionHistoryRecord[] = Array.from({ length: 20 }, (_, i) => ({
      timestamp: `2025-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
      fromVersion: `${i}.0.0`,
      toVersion: `${i + 1}.0.0`,
      type: 'switch' as const,
    }));

    const newRecord = makeRecord('20.0.0', '21.0.0');
    const result = addHistoryRecord(history, newRecord, 20);

    // 长度仍为 20
    expect(result).toHaveLength(20);
    // 最早的记录（index 0）被移除
    expect(result[0].fromVersion).toBe('1.0.0');
    // 最后一条是新添加的
    expect(result[result.length - 1]).toEqual(newRecord);
  });

  it('不修改原数组', () => {
    const history = [makeRecord('1.0.0', '2.0.0')];
    const copy = [...history];
    addHistoryRecord(history, makeRecord('2.0.0', '3.0.0'));
    expect(history).toEqual(copy);
  });
});

// ── buildInstallCommand 测试 ──────────────────────────────────────

describe('buildInstallCommand', () => {
  it('darwin 平台使用 bash + install.sh', () => {
    const { command, shell } = buildInstallCommand('darwin', '1.2.3');
    expect(shell).toBe('bash');
    expect(command).toContain('install.sh');
    expect(command).toContain('1.2.3');
  });

  it('linux 平台使用 bash + install.sh', () => {
    const { command, shell } = buildInstallCommand('linux', '2.0.0');
    expect(shell).toBe('bash');
    expect(command).toContain('install.sh');
    expect(command).toContain('2.0.0');
  });

  it('win32 平台使用 PowerShell + install.ps1', () => {
    const { command, shell } = buildInstallCommand('win32', '3.0.0');
    expect(shell).toBe('powershell');
    expect(command).toContain('install.ps1');
    expect(command).toContain('3.0.0');
  });

  it('所有平台命令中都包含 OPENCLAW_VERSION', () => {
    for (const platform of ['darwin', 'linux', 'win32'] as NodeJS.Platform[]) {
      const { command } = buildInstallCommand(platform, '1.0.0');
      expect(command).toContain('OPENCLAW_VERSION');
    }
  });
});

// ── buildSuccessResponse 测试 ─────────────────────────────────────

describe('buildSuccessResponse', () => {
  it('返回对象包含 success: true', () => {
    const resp = buildSuccessResponse({ version: '1.0.0' });
    expect(resp.success).toBe(true);
  });

  it('保留传入的数据字段', () => {
    const resp = buildSuccessResponse({ version: '1.0.0', latest: '2.0.0' });
    expect(resp.version).toBe('1.0.0');
    expect(resp.latest).toBe('2.0.0');
  });
});

// ── buildErrorResponse 测试 ───────────────────────────────────────

describe('buildErrorResponse', () => {
  it('返回对象包含 success: false 和 error 字段', () => {
    const resp = buildErrorResponse('网络错误');
    expect(resp.success).toBe(false);
    expect(resp.error).toBe('网络错误');
  });

  it('空字符串错误信息也能正确返回', () => {
    const resp = buildErrorResponse('');
    expect(resp.success).toBe(false);
    expect(resp.error).toBe('');
  });
});
