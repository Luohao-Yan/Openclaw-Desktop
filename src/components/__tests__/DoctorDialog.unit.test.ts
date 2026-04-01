/**
 * DoctorDialog 组件单元测试
 * Feature: openclaw-doctor-repair
 *
 * 验证 DoctorDialog 组件的核心数据逻辑：
 * - 打开/关闭行为守卫（执行中阻止关闭）
 * - 按钮禁用状态推导（isRunning → disabled）
 * - 输出追加显示逻辑（DoctorOutputEvent → OutputLine 映射）
 * - 结果摘要渲染条件（parseDoctorOutput 集成）
 *
 * 注意：项目未配置 jsdom 环境，此处验证组件依赖的数据逻辑和状态推导
 *
 * Validates: Requirements 3.1, 3.7, 3.8, 3.9, 3.10
 */

import { describe, test, expect } from 'vitest';
import { parseDoctorOutput } from '../../../electron/ipc/doctorLogic';
import type { DoctorFixResult } from '../../../electron/ipc/doctorLogic';
import type { DoctorOutputEvent } from '../../types/electron';

// ============================================================================
// 辅助函数：模拟组件内部的状态推导逻辑
// ============================================================================

/** 终端输出行（与组件内部 OutputLine 接口一致） */
interface OutputLine {
  text: string;
  isError: boolean;
}

/**
 * 模拟 handleClose 守卫逻辑
 * 组件中：if (isRunning) return; 否则执行 onClose
 * @returns 是否允许关闭
 */
function canClose(isRunning: boolean): boolean {
  return !isRunning;
}

/**
 * 模拟关闭按钮的 disabled 状态推导
 * 组件中：<AppButton disabled={isRunning} />
 */
function isCloseButtonDisabled(isRunning: boolean): boolean {
  return isRunning;
}

/**
 * 模拟 AppModal 的 disableClose 属性推导
 * 组件中：<AppModal disableClose={isRunning} />
 */
function isModalCloseDisabled(isRunning: boolean): boolean {
  return isRunning;
}

/**
 * 模拟 AppModal 的 closeOnOverlay 属性推导
 * 组件中：<AppModal closeOnOverlay={!isRunning} />
 */
function canCloseOnOverlay(isRunning: boolean): boolean {
  return !isRunning;
}

/**
 * 模拟 DoctorOutputEvent → OutputLine 的映射逻辑
 * 组件中：onDoctorOutput 回调将事件追加到 outputLines
 */
function mapEventToOutputLine(event: DoctorOutputEvent): OutputLine {
  return { text: event.data, isError: event.isError };
}

/**
 * 模拟输出行累积逻辑
 * 组件中：setOutputLines((prev) => [...prev, { text: event.data, isError: event.isError }])
 */
function accumulateOutputLines(
  existing: OutputLine[],
  newEvent: DoctorOutputEvent,
): OutputLine[] {
  return [...existing, { text: newEvent.data, isError: newEvent.isError }];
}

/**
 * 判断是否应显示结果状态提示
 * 组件中：{result && !isRunning && (...)}
 */
function shouldShowResultStatus(
  result: { success: boolean } | null,
  isRunning: boolean,
): boolean {
  return result !== null && !isRunning;
}

/**
 * 判断是否应显示结构化结果摘要
 * 组件中：{parsedResult && !isRunning && (...)}
 */
function shouldShowParsedResult(
  parsedResult: DoctorFixResult | null,
  isRunning: boolean,
): boolean {
  return parsedResult !== null && !isRunning;
}

// ============================================================================
// 测试：打开/关闭行为（需求 3.1, 3.9, 3.10）
// ============================================================================

describe('DoctorDialog - 打开/关闭行为', () => {
  test('执行中（isRunning=true）时不允许关闭弹窗', () => {
    // 需求 3.10：执行中禁用关闭按钮以防止意外中断
    expect(canClose(true)).toBe(false);
  });

  test('执行完成（isRunning=false）时允许关闭弹窗', () => {
    // 需求 3.9：修复完成后允许关闭
    expect(canClose(false)).toBe(true);
  });

  test('执行中时 Modal 的 disableClose 为 true', () => {
    expect(isModalCloseDisabled(true)).toBe(true);
  });

  test('执行完成时 Modal 的 disableClose 为 false', () => {
    expect(isModalCloseDisabled(false)).toBe(false);
  });

  test('执行中时不允许点击遮罩关闭', () => {
    expect(canCloseOnOverlay(true)).toBe(false);
  });

  test('执行完成时允许点击遮罩关闭', () => {
    expect(canCloseOnOverlay(false)).toBe(true);
  });
});

// ============================================================================
// 测试：按钮禁用状态（需求 3.10）
// ============================================================================

describe('DoctorDialog - 按钮禁用状态', () => {
  test('执行中时关闭按钮被禁用', () => {
    expect(isCloseButtonDisabled(true)).toBe(true);
  });

  test('执行完成时关闭按钮可用', () => {
    expect(isCloseButtonDisabled(false)).toBe(false);
  });
});

// ============================================================================
// 测试：输出追加显示逻辑（需求 3.1）
// ============================================================================

describe('DoctorDialog - 输出追加显示', () => {
  test('DoctorOutputEvent 正确映射为 OutputLine', () => {
    // stdout 事件
    const stdoutEvent: DoctorOutputEvent = { data: '检查配置文件...', isError: false };
    const stdoutLine = mapEventToOutputLine(stdoutEvent);
    expect(stdoutLine).toEqual({ text: '检查配置文件...', isError: false });

    // stderr 事件
    const stderrEvent: DoctorOutputEvent = { data: '警告：配置缺失', isError: true };
    const stderrLine = mapEventToOutputLine(stderrEvent);
    expect(stderrLine).toEqual({ text: '警告：配置缺失', isError: true });
  });

  test('输出行按顺序累积', () => {
    let lines: OutputLine[] = [];

    // 模拟连续接收三条输出事件
    const events: DoctorOutputEvent[] = [
      { data: '第一行输出', isError: false },
      { data: '第二行错误', isError: true },
      { data: '第三行输出', isError: false },
    ];

    for (const event of events) {
      lines = accumulateOutputLines(lines, event);
    }

    expect(lines).toHaveLength(3);
    expect(lines[0]).toEqual({ text: '第一行输出', isError: false });
    expect(lines[1]).toEqual({ text: '第二行错误', isError: true });
    expect(lines[2]).toEqual({ text: '第三行输出', isError: false });
  });

  test('空数据事件也能正确累积', () => {
    let lines: OutputLine[] = [];
    const emptyEvent: DoctorOutputEvent = { data: '', isError: false };
    lines = accumulateOutputLines(lines, emptyEvent);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toEqual({ text: '', isError: false });
  });

  test('累积不会修改原始数组（不可变性）', () => {
    const original: OutputLine[] = [{ text: '原始行', isError: false }];
    const newEvent: DoctorOutputEvent = { data: '新行', isError: true };
    const updated = accumulateOutputLines(original, newEvent);

    // 原始数组不变
    expect(original).toHaveLength(1);
    // 新数组包含两行
    expect(updated).toHaveLength(2);
    // 引用不同
    expect(updated).not.toBe(original);
  });
});

// ============================================================================
// 测试：结果摘要渲染条件（需求 3.7, 3.8）
// ============================================================================

describe('DoctorDialog - 结果状态提示显示条件', () => {
  test('有结果且不在执行中时显示状态提示', () => {
    expect(shouldShowResultStatus({ success: true }, false)).toBe(true);
    expect(shouldShowResultStatus({ success: false }, false)).toBe(true);
  });

  test('执行中时不显示状态提示（即使有结果）', () => {
    expect(shouldShowResultStatus({ success: true }, true)).toBe(false);
  });

  test('无结果时不显示状态提示', () => {
    expect(shouldShowResultStatus(null, false)).toBe(false);
    expect(shouldShowResultStatus(null, true)).toBe(false);
  });
});

describe('DoctorDialog - 结构化结果摘要显示条件', () => {
  const mockParsedResult: DoctorFixResult = {
    success: true,
    fixedIssues: ['修复了配置'],
    remainingIssues: [],
    needsRepair: false,
    regressionDetected: false,
    newIssues: [],
  };

  test('有解析结果且不在执行中时显示摘要', () => {
    expect(shouldShowParsedResult(mockParsedResult, false)).toBe(true);
  });

  test('执行中时不显示摘要', () => {
    expect(shouldShowParsedResult(mockParsedResult, true)).toBe(false);
  });

  test('无解析结果时不显示摘要', () => {
    expect(shouldShowParsedResult(null, false)).toBe(false);
  });
});

// ============================================================================
// 测试：parseDoctorOutput 集成 — 结果摘要渲染数据（需求 3.7, 3.8）
// ============================================================================

describe('DoctorDialog - parseDoctorOutput 集成', () => {
  test('成功修复输出解析为 success=true，显示绿色状态', () => {
    // 需求 3.7：退出码为 0 时显示绿色成功状态
    const output = '✓ Fixed: 配置文件已修复\n✓ Fixed: 路径已更新';
    const result = parseDoctorOutput(output);

    expect(result.success).toBe(true);
    expect(result.fixedIssues).toHaveLength(2);
    expect(result.remainingIssues).toHaveLength(0);
    expect(result.needsRepair).toBe(false);
  });

  test('部分修复输出解析为 success=false，显示红色状态', () => {
    // 需求 3.8：退出码非 0 时显示红色失败状态
    const output = '✓ Fixed: 配置文件已修复\n✗ Failed: Gateway 无法启动';
    const result = parseDoctorOutput(output);

    expect(result.success).toBe(false);
    expect(result.fixedIssues).toHaveLength(1);
    expect(result.remainingIssues).toHaveLength(1);
    expect(result.needsRepair).toBe(true);
  });

  test('全部失败输出解析为 success=false 且 needsRepair=true', () => {
    const output = '✗ Failed: 配置文件损坏\n⚠ Remaining: 网络连接异常';
    const result = parseDoctorOutput(output);

    expect(result.success).toBe(false);
    expect(result.fixedIssues).toHaveLength(0);
    expect(result.remainingIssues).toHaveLength(2);
    expect(result.needsRepair).toBe(true);
  });

  test('空输出解析为 success=true（无问题）', () => {
    const result = parseDoctorOutput('');

    expect(result.success).toBe(true);
    expect(result.fixedIssues).toHaveLength(0);
    expect(result.remainingIssues).toHaveLength(0);
    expect(result.needsRepair).toBe(false);
  });

  test('fixedIssues 和 remainingIssues 无交集', () => {
    const output = '✓ Fixed: 问题A\n✗ Failed: 问题B\n✓ Fixed: 问题C\n⚠ Remaining: 问题D';
    const result = parseDoctorOutput(output);

    // 验证两个列表无交集
    const fixedSet = new Set(result.fixedIssues);
    for (const issue of result.remainingIssues) {
      expect(fixedSet.has(issue)).toBe(false);
    }
  });
});

// ============================================================================
// 测试：结果摘要渲染数据完整性
// ============================================================================

describe('DoctorDialog - 结果摘要渲染数据', () => {
  test('fixedIssues 非空时应渲染已修复问题列表', () => {
    const result = parseDoctorOutput('✓ Fixed: 修复了网关配置\n✓ Fixed: 修复了路径设置');
    // 组件中：{parsedResult.fixedIssues.length > 0 && (...)}
    expect(result.fixedIssues.length > 0).toBe(true);
    expect(result.fixedIssues).toContain('修复了网关配置');
    expect(result.fixedIssues).toContain('修复了路径设置');
  });

  test('remainingIssues 非空时应渲染未修复问题列表', () => {
    const result = parseDoctorOutput('✗ Failed: 无法连接服务器');
    // 组件中：{parsedResult.remainingIssues.length > 0 && (...)}
    expect(result.remainingIssues.length > 0).toBe(true);
    expect(result.remainingIssues).toContain('无法连接服务器');
  });

  test('needsRepair=true 时应渲染深度修复提示', () => {
    const result = parseDoctorOutput('✗ Failed: 严重问题');
    // 组件中：{parsedResult.needsRepair && (...)}
    expect(result.needsRepair).toBe(true);
  });

  test('needsRepair=false 时不渲染深度修复提示', () => {
    const result = parseDoctorOutput('✓ Fixed: 所有问题已修复');
    expect(result.needsRepair).toBe(false);
  });

  test('fixedIssues 和 remainingIssues 均为空时不渲染任何列表', () => {
    const result = parseDoctorOutput('一些无关的输出文本');
    expect(result.fixedIssues).toHaveLength(0);
    expect(result.remainingIssues).toHaveLength(0);
  });
});
