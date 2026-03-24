/**
 * 单元测试：ClawHub CLI 检测与安装纯逻辑
 * Feature: clawhub-auto-install
 *
 * 使用具体示例和边缘情况验证 clawhubInstallLogic.ts 中纯函数的行为。
 */

import { describe, test, expect } from 'vitest';
import {
  resolveClawHubStatus,
  buildClawHubFixableIssue,
  buildClawHubInstallCommand,
  validateInstallResult,
  formatClawHubSearchError,
} from '../clawhubInstallLogic.js';

describe('resolveClawHubStatus', () => {
  test('openclaw clawhub --version 返回 "1.2.3" 时，installed 为 true，version 为 "1.2.3"', () => {
    const result = resolveClawHubStatus(
      { success: true, output: '1.2.3' },
      { success: false, output: '' },
    );
    expect(result.installed).toBe(true);
    expect(result.version).toBe('1.2.3');
    expect(result.source).toBe('openclaw');
  });

  test('两种方式均返回 ENOENT 时，installed 为 false', () => {
    const result = resolveClawHubStatus(
      { success: false, output: 'spawn clawhub ENOENT' },
      { success: false, output: 'spawn clawhub ENOENT' },
    );
    expect(result.installed).toBe(false);
    expect(result.version).toBeUndefined();
    expect(result.source).toBeUndefined();
  });

  test('output 包含 ANSI 转义序列时，版本号应被正确提取（trim）', () => {
    const ansiOutput = '\x1b[32m1.0.5\x1b[0m\n';
    const result = resolveClawHubStatus(
      { success: true, output: ansiOutput },
      { success: false, output: '' },
    );
    expect(result.installed).toBe(true);
    // trim 后仍包含 ANSI 序列，但不为空
    expect(result.version).toBeDefined();
    expect(result.version!.length).toBeGreaterThan(0);
  });

  test('output 为空字符串时，version 为 undefined', () => {
    const result = resolveClawHubStatus(
      { success: true, output: '' },
      { success: false, output: '' },
    );
    expect(result.installed).toBe(true);
    expect(result.version).toBeUndefined();
    expect(result.source).toBe('openclaw');
  });

  test('仅 standalone 成功时，source 为 standalone', () => {
    const result = resolveClawHubStatus(
      { success: false, output: '' },
      { success: true, output: '2.0.0' },
    );
    expect(result.installed).toBe(true);
    expect(result.version).toBe('2.0.0');
    expect(result.source).toBe('standalone');
  });
});

describe('buildClawHubFixableIssue', () => {
  test('bundled 模式下不生成 FixableIssue', () => {
    const issue = buildClawHubFixableIssue({ installed: false }, 'bundled');
    expect(issue).toBeNull();
  });

  test('已安装时不生成 FixableIssue', () => {
    const issue = buildClawHubFixableIssue(
      { installed: true, version: '1.0.0', source: 'openclaw' },
      'system',
    );
    expect(issue).toBeNull();
  });

  test('未安装且非 bundled 时生成 optional install FixableIssue', () => {
    const issue = buildClawHubFixableIssue({ installed: false }, 'system');
    expect(issue).not.toBeNull();
    expect(issue!.id).toBe('clawhub-not-installed');
    expect(issue!.action).toBe('install');
    expect(issue!.severity).toBe('optional');
  });
});

describe('buildClawHubInstallCommand', () => {
  test('构建正确的 npm install 命令', () => {
    const result = buildClawHubInstallCommand(
      { HOME: '/Users/test', PATH: '/usr/bin' },
      '/usr/local/bin:/usr/bin',
    );
    expect(result.command).toBe('npm');
    expect(result.args).toEqual(['install', '-g', '@nicepkg/clawhub']);
    expect(result.env.PATH).toBe('/usr/local/bin:/usr/bin');
    expect(result.env.HOME).toBe('/Users/test');
  });
});

describe('validateInstallResult', () => {
  test('成功且有输出时返回 success: true', () => {
    const result = validateInstallResult({ success: true, output: '1.2.3\n' });
    expect(result.success).toBe(true);
    expect(result.version).toBe('1.2.3');
  });

  test('失败时返回 success: false 和 error', () => {
    const result = validateInstallResult({ success: false, output: 'command not found' });
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  test('成功但输出为空时返回 success: false', () => {
    const result = validateInstallResult({ success: true, output: '  ' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('空输出');
  });
});

describe('formatClawHubSearchError', () => {
  test('ENOENT 错误返回安装引导信息', () => {
    const result = formatClawHubSearchError('spawn clawhub ENOENT');
    expect(result).not.toBeNull();
    expect(result).toContain('npm install -g @nicepkg/clawhub');
    expect(result).toContain('设置');
  });

  test('not found 错误返回安装引导信息', () => {
    const result = formatClawHubSearchError('clawhub: command not found');
    expect(result).not.toBeNull();
    expect(result).toContain('npm install -g @nicepkg/clawhub');
  });

  test('其他错误返回 null', () => {
    const result = formatClawHubSearchError('network timeout');
    expect(result).toBeNull();
  });
});
