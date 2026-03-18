/**
 * doctorLogic 单元测试
 *
 * 验证 parseDoctorOutput、shouldEscalateToRepair、detectRegression 的核心行为。
 * 属性测试在 doctorOutput.pbt.test.ts 和 regressionDetect.pbt.test.ts 中覆盖。
 */

import { describe, it, expect } from 'vitest';
import {
  parseDoctorOutput,
  shouldEscalateToRepair,
  detectRegression,
  DEFAULT_MAX_RETRY,
  type DoctorFixResult,
  type EnvironmentSnapshot,
} from '../doctorLogic';

// ─── parseDoctorOutput ──────────────────────────────────────────────────────

describe('parseDoctorOutput', () => {
  it('解析全部修复成功的输出', () => {
    const output = [
      '✓ Fixed: schema validation error in openclaw.json',
      '✓ Fixed: missing gateway config',
    ].join('\n');

    const result = parseDoctorOutput(output);

    expect(result.success).toBe(true);
    expect(result.fixedIssues).toEqual([
      'schema validation error in openclaw.json',
      'missing gateway config',
    ]);
    expect(result.remainingIssues).toEqual([]);
    expect(result.needsRepair).toBe(false);
  });

  it('解析部分修复成功、部分失败的输出', () => {
    const output = [
      '✓ Fixed: config format updated',
      '✗ Failed: gateway service not responding',
      '⚠ Remaining: port conflict on 8080',
    ].join('\n');

    const result = parseDoctorOutput(output);

    expect(result.success).toBe(false);
    expect(result.fixedIssues).toEqual(['config format updated']);
    expect(result.remainingIssues).toEqual([
      'gateway service not responding',
      'port conflict on 8080',
    ]);
    expect(result.needsRepair).toBe(true);
  });

  it('解析全部失败的输出', () => {
    const output = [
      '✗ Failed: cannot write to config directory',
      '✗ Failed: permission denied',
    ].join('\n');

    const result = parseDoctorOutput(output);

    expect(result.success).toBe(false);
    expect(result.fixedIssues).toEqual([]);
    expect(result.remainingIssues).toEqual([
      'cannot write to config directory',
      'permission denied',
    ]);
    expect(result.needsRepair).toBe(true);
  });

  it('解析空输出', () => {
    const result = parseDoctorOutput('');

    expect(result.success).toBe(true);
    expect(result.fixedIssues).toEqual([]);
    expect(result.remainingIssues).toEqual([]);
    expect(result.needsRepair).toBe(false);
  });

  it('忽略无法识别的行', () => {
    const output = [
      'Running doctor --fix...',
      '✓ Fixed: issue A',
      'Some random log line',
      '✗ Failed: issue B',
      'Done.',
    ].join('\n');

    const result = parseDoctorOutput(output);

    expect(result.fixedIssues).toEqual(['issue A']);
    expect(result.remainingIssues).toEqual(['issue B']);
  });

  it('P8 核心属性：fixedIssues 和 remainingIssues 无交集', () => {
    const output = [
      '✓ Fixed: issue A',
      '✓ Fixed: issue B',
      '✗ Failed: issue C',
      '⚠ Remaining: issue D',
    ].join('\n');

    const result = parseDoctorOutput(output);

    // 无交集
    const fixedSet = new Set(result.fixedIssues);
    for (const remaining of result.remainingIssues) {
      expect(fixedSet.has(remaining)).toBe(false);
    }
  });

  it('P8 核心属性：needsRepair=true 当且仅当 remainingIssues 非空', () => {
    // 有残留 → needsRepair=true
    const withRemaining = parseDoctorOutput('✗ Failed: something');
    expect(withRemaining.needsRepair).toBe(true);
    expect(withRemaining.remainingIssues.length).toBeGreaterThan(0);

    // 无残留 → needsRepair=false
    const withoutRemaining = parseDoctorOutput('✓ Fixed: something');
    expect(withoutRemaining.needsRepair).toBe(false);
    expect(withoutRemaining.remainingIssues.length).toBe(0);
  });
});

// ─── shouldEscalateToRepair ─────────────────────────────────────────────────

describe('shouldEscalateToRepair', () => {
  const makeResult = (
    overrides: Partial<DoctorFixResult> = {},
  ): DoctorFixResult => ({
    success: false,
    fixedIssues: [],
    remainingIssues: ['some issue'],
    needsRepair: true,
    regressionDetected: false,
    newIssues: [],
    ...overrides,
  });

  it('P16(a): remainingIssues 为空时返回 false', () => {
    const result = makeResult({ remainingIssues: [], needsRepair: false, success: true });
    expect(shouldEscalateToRepair(result, 0)).toBe(false);
    expect(shouldEscalateToRepair(result, 5)).toBe(false);
    expect(shouldEscalateToRepair(result, 100)).toBe(false);
  });

  it('P16(b): retryCount >= maxRetry 且有残留时返回 true', () => {
    const result = makeResult({ remainingIssues: ['issue'] });
    expect(shouldEscalateToRepair(result, DEFAULT_MAX_RETRY)).toBe(true);
    expect(shouldEscalateToRepair(result, DEFAULT_MAX_RETRY + 1)).toBe(true);
  });

  it('P16(c): retryCount < maxRetry 且有残留时返回 false（继续重试）', () => {
    const result = makeResult({ remainingIssues: ['issue'] });
    expect(shouldEscalateToRepair(result, 0)).toBe(false);
    expect(shouldEscalateToRepair(result, 1)).toBe(false);
  });

  it('使用自定义 maxRetry', () => {
    const result = makeResult({ remainingIssues: ['issue'] });
    expect(shouldEscalateToRepair(result, 3, 5)).toBe(false);
    expect(shouldEscalateToRepair(result, 5, 5)).toBe(true);
  });
});

// ─── detectRegression ───────────────────────────────────────────────────────

describe('detectRegression', () => {
  const makeSnapshot = (
    overrides: Partial<EnvironmentSnapshot> = {},
  ): EnvironmentSnapshot => ({
    nodeAvailable: true,
    clawAvailable: true,
    gatewayRunning: true,
    issues: [],
    ...overrides,
  });

  it('P17(b): 所有指标不劣于 before 时 regressionDetected=false', () => {
    const before = makeSnapshot();
    const after = makeSnapshot();

    const result = detectRegression(before, after);

    expect(result.regressionDetected).toBe(false);
    expect(result.newIssues).toEqual([]);
  });

  it('P17(a): after 出现 before 不存在的 issues 时 regressionDetected=true', () => {
    const before = makeSnapshot({ issues: ['old issue'] });
    const after = makeSnapshot({ issues: ['old issue', 'new issue'] });

    const result = detectRegression(before, after);

    expect(result.regressionDetected).toBe(true);
    expect(result.newIssues).toContain('new issue');
  });

  it('P17: nodeAvailable 从 true 变为 false 检测为回归', () => {
    const before = makeSnapshot({ nodeAvailable: true });
    const after = makeSnapshot({ nodeAvailable: false });

    const result = detectRegression(before, after);

    expect(result.regressionDetected).toBe(true);
    expect(result.newIssues.some(i => i.includes('Node.js'))).toBe(true);
  });

  it('P17: clawAvailable 从 true 变为 false 检测为回归', () => {
    const before = makeSnapshot({ clawAvailable: true });
    const after = makeSnapshot({ clawAvailable: false });

    const result = detectRegression(before, after);

    expect(result.regressionDetected).toBe(true);
    expect(result.newIssues.some(i => i.includes('OpenClaw CLI'))).toBe(true);
  });

  it('P17: gatewayRunning 从 true 变为 false 检测为回归', () => {
    const before = makeSnapshot({ gatewayRunning: true });
    const after = makeSnapshot({ gatewayRunning: false });

    const result = detectRegression(before, after);

    expect(result.regressionDetected).toBe(true);
    expect(result.newIssues.some(i => i.includes('Gateway'))).toBe(true);
  });

  it('P17: 指标从 false 变为 true 不算回归（改善）', () => {
    const before = makeSnapshot({ nodeAvailable: false, clawAvailable: false });
    const after = makeSnapshot({ nodeAvailable: true, clawAvailable: true });

    const result = detectRegression(before, after);

    expect(result.regressionDetected).toBe(false);
    expect(result.newIssues).toEqual([]);
  });

  it('P17(c): newIssues 精确列出 after 中新出现的问题', () => {
    const before = makeSnapshot({ issues: ['A', 'B'] });
    const after = makeSnapshot({ issues: ['A', 'C', 'D'] });

    const result = detectRegression(before, after);

    expect(result.regressionDetected).toBe(true);
    expect(result.newIssues).toContain('C');
    expect(result.newIssues).toContain('D');
    expect(result.newIssues).not.toContain('A');
    expect(result.newIssues).not.toContain('B');
  });
});
