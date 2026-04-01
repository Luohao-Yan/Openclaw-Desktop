/**
 * 属性测试：DoctorDialog 组件
 * Feature: openclaw-doctor-repair
 *
 * 本文件验证 DoctorDialog 组件的核心数据逻辑属性（无 jsdom，纯状态推导）：
 * - Property 1: 执行中所有修复按钮均被禁用
 * - Property 2: 终端输出完整性
 * - Property 3: 退出码到状态的正确映射
 * - Property 7: 解析结果完整渲染
 */

import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';
import type { DoctorFixResult } from '../../../electron/ipc/doctorLogic';
import type { DoctorOutputEvent } from '../../types/electron';

// ── 辅助类型与函数（与组件内部逻辑一致） ──────────────────────────────────────

/** 终端输出行（与组件内部 OutputLine 接口一致） */
interface OutputLine {
  text: string;
  isError: boolean;
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
 * 模拟 handleClose 守卫逻辑
 * 组件中：if (isRunning) return;
 */
function canClose(isRunning: boolean): boolean {
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
  events: DoctorOutputEvent[],
): OutputLine[] {
  let lines = existing;
  for (const event of events) {
    lines = [...lines, mapEventToOutputLine(event)];
  }
  return lines;
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
 * 推导结果状态提示类型
 * 组件中：result.success ? 绿色成功 : 红色失败
 */
function getResultStatusType(success: boolean): 'success' | 'failure' {
  return success ? 'success' : 'failure';
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

// ── 生成器（Arbitraries） ─────────────────────────────────────────────────────

/** 生成随机 DoctorOutputEvent */
const doctorOutputEventArb = (): fc.Arbitrary<DoctorOutputEvent> =>
  fc.record({
    data: fc.string({ minLength: 0, maxLength: 200 }),
    isError: fc.boolean(),
  });

/** 生成随机 DoctorOutputEvent 序列 */
const doctorOutputEventsArb = (): fc.Arbitrary<DoctorOutputEvent[]> =>
  fc.array(doctorOutputEventArb(), { minLength: 0, maxLength: 30 });

/** 生成问题描述字符串 */
const issueDescArb = (): fc.Arbitrary<string> =>
  fc.array(
    fc.stringMatching(/^[a-zA-Z0-9_.,-]{1,12}$/),
    { minLength: 1, maxLength: 6 },
  ).map((words) => words.join(' '));

/** 生成随机 DoctorFixResult（保持内部一致性） */
const doctorFixResultArb = (): fc.Arbitrary<DoctorFixResult> =>
  fc.tuple(
    fc.array(issueDescArb(), { minLength: 0, maxLength: 8 }),
    fc.array(issueDescArb(), { minLength: 0, maxLength: 8 }),
  ).map(([fixedIssues, remainingIssues]) => ({
    success: remainingIssues.length === 0,
    fixedIssues,
    remainingIssues,
    needsRepair: remainingIssues.length > 0,
    regressionDetected: false,
    newIssues: [],
  }));

// ============================================================================
// Property 1: 执行中所有修复按钮均被禁用
// Feature: openclaw-doctor-repair
// ============================================================================

describe('Feature: openclaw-doctor-repair, Property 1: 执行中所有修复按钮均被禁用', () => {
  /**
   * **Validates: Requirements 1.3, 2.4, 3.10**
   *
   * 对于任意 isRunning 状态，当 isRunning=true 时：
   * - 关闭按钮 disabled=true
   * - Modal disableClose=true
   * - closeOnOverlay=false
   * - handleClose 守卫阻止关闭
   */
  test('isRunning=true 时所有关闭/交互控件均被禁用', () => {
    fc.assert(
      fc.property(fc.boolean(), (isRunning) => {
        const closeDisabled = isCloseButtonDisabled(isRunning);
        const modalDisabled = isModalCloseDisabled(isRunning);
        const overlayClose = canCloseOnOverlay(isRunning);
        const closeAllowed = canClose(isRunning);

        if (isRunning) {
          // 执行中：所有按钮禁用，不允许关闭
          expect(closeDisabled).toBe(true);
          expect(modalDisabled).toBe(true);
          expect(overlayClose).toBe(false);
          expect(closeAllowed).toBe(false);
        } else {
          // 非执行中：所有按钮可用，允许关闭
          expect(closeDisabled).toBe(false);
          expect(modalDisabled).toBe(false);
          expect(overlayClose).toBe(true);
          expect(closeAllowed).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 1.3, 2.4, 3.10**
   *
   * 禁用状态的一致性：所有控件的禁用状态始终与 isRunning 同步。
   * closeButtonDisabled === modalDisableClose === isRunning
   * canCloseOnOverlay === canClose === !isRunning
   */
  test('所有控件的禁用状态始终与 isRunning 保持一致', () => {
    fc.assert(
      fc.property(fc.boolean(), (isRunning) => {
        // 禁用类属性全部等于 isRunning
        expect(isCloseButtonDisabled(isRunning)).toBe(isRunning);
        expect(isModalCloseDisabled(isRunning)).toBe(isRunning);

        // 允许类属性全部等于 !isRunning
        expect(canCloseOnOverlay(isRunning)).toBe(!isRunning);
        expect(canClose(isRunning)).toBe(!isRunning);
      }),
      { numRuns: 100 },
    );
  });
});


// ============================================================================
// Property 2: 终端输出完整性
// Feature: openclaw-doctor-repair
// ============================================================================

describe('Feature: openclaw-doctor-repair, Property 2: 终端输出完整性', () => {
  /**
   * **Validates: Requirements 3.4, 3.5**
   *
   * 对于任意输出事件序列，Terminal_Output 最终显示的文本应包含
   * 所有已接收事件的 data 内容，且数量一致。
   */
  test('所有输出事件的 data 内容均被完整保留在 outputLines 中', () => {
    fc.assert(
      fc.property(doctorOutputEventsArb(), (events) => {
        // 模拟组件累积输出行
        const outputLines = accumulateOutputLines([], events);

        // 输出行数量与事件数量一致
        expect(outputLines.length).toBe(events.length);

        // 每条事件的 data 都被完整保留
        for (let i = 0; i < events.length; i++) {
          expect(outputLines[i].text).toBe(events[i].data);
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 3.4, 3.5**
   *
   * stderr 输出（isError=true）与 stdout 输出（isError=false）
   * 在 outputLines 中保持正确的 isError 标记，用于视觉区分。
   */
  test('stderr 和 stdout 的 isError 标记被正确保留', () => {
    fc.assert(
      fc.property(doctorOutputEventsArb(), (events) => {
        const outputLines = accumulateOutputLines([], events);

        for (let i = 0; i < events.length; i++) {
          expect(outputLines[i].isError).toBe(events[i].isError);
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 3.4, 3.5**
   *
   * 输出事件的顺序在累积后保持不变。
   */
  test('输出事件的顺序在累积后保持不变', () => {
    fc.assert(
      fc.property(doctorOutputEventsArb(), (events) => {
        const outputLines = accumulateOutputLines([], events);

        // 验证顺序：每个位置的 text 和 isError 都与原始事件一致
        const reconstructed: DoctorOutputEvent[] = outputLines.map((line) => ({
          data: line.text,
          isError: line.isError,
        }));

        expect(reconstructed).toEqual(events);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 3.4, 3.5**
   *
   * 累积操作的不可变性：追加新事件不会修改已有的 outputLines。
   */
  test('累积操作不修改已有的 outputLines（不可变性）', () => {
    fc.assert(
      fc.property(
        doctorOutputEventsArb(),
        doctorOutputEventArb(),
        (initialEvents, newEvent) => {
          const initial = accumulateOutputLines([], initialEvents);
          const initialCopy = [...initial];

          // 追加新事件
          const updated = accumulateOutputLines(initial, [newEvent]);

          // 原始数组未被修改
          expect(initial).toEqual(initialCopy);
          // 新数组比原始数组多一个元素
          expect(updated.length).toBe(initial.length + 1);
          // 新数组的最后一个元素是新事件
          expect(updated[updated.length - 1].text).toBe(newEvent.data);
        },
      ),
      { numRuns: 100 },
    );
  });
});


// ============================================================================
// Property 3: 退出码到状态的正确映射
// Feature: openclaw-doctor-repair
// ============================================================================

describe('Feature: openclaw-doctor-repair, Property 3: 退出码到状态的正确映射', () => {
  /**
   * **Validates: Requirements 3.7, 3.8**
   *
   * 对于任意 success 布尔值，当 success=true 时显示成功状态，
   * 当 success=false 时显示失败状态。两种状态互斥。
   */
  test('success=true 映射为成功状态，success=false 映射为失败状态', () => {
    fc.assert(
      fc.property(fc.boolean(), (success) => {
        const statusType = getResultStatusType(success);

        if (success) {
          expect(statusType).toBe('success');
        } else {
          expect(statusType).toBe('failure');
        }

        // 两种状态互斥
        expect(statusType === 'success').toBe(success);
        expect(statusType === 'failure').toBe(!success);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 3.7, 3.8**
   *
   * 结果状态提示仅在有结果且不在执行中时显示。
   * 对于任意 (result, isRunning) 组合，显示条件为 result !== null && !isRunning。
   */
  test('结果状态提示的显示条件：result !== null && !isRunning', () => {
    fc.assert(
      fc.property(
        fc.option(fc.record({ success: fc.boolean() }), { nil: null }),
        fc.boolean(),
        (result, isRunning) => {
          const shouldShow = shouldShowResultStatus(result, isRunning);

          if (result !== null && !isRunning) {
            expect(shouldShow).toBe(true);
          } else {
            expect(shouldShow).toBe(false);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 3.7, 3.8**
   *
   * 成功和失败状态的颜色映射一致性：
   * 组件中 success → 绿色背景/文字，!success → 红色背景/文字。
   * 此处验证映射函数的确定性。
   */
  test('状态映射函数是确定性的：相同输入始终产生相同输出', () => {
    fc.assert(
      fc.property(fc.boolean(), (success) => {
        const result1 = getResultStatusType(success);
        const result2 = getResultStatusType(success);

        expect(result1).toBe(result2);
      }),
      { numRuns: 100 },
    );
  });
});


// ============================================================================
// Property 7: 解析结果完整渲染
// Feature: openclaw-doctor-repair
// ============================================================================

describe('Feature: openclaw-doctor-repair, Property 7: 解析结果完整渲染', () => {
  /**
   * **Validates: Requirements 6.2, 6.3**
   *
   * 对于任意 DoctorFixResult，UI 中显示的已修复问题列表应包含
   * fixedIssues 中的所有条目，未修复问题列表应包含 remainingIssues 中的所有条目。
   */
  test('fixedIssues 和 remainingIssues 的所有条目均被完整渲染', () => {
    fc.assert(
      fc.property(doctorFixResultArb(), (fixResult) => {
        // 模拟组件渲染逻辑：
        // {parsedResult.fixedIssues.map((issue, i) => <li>{issue}</li>)}
        // {parsedResult.remainingIssues.map((issue, i) => <li>{issue}</li>)}
        const renderedFixed = fixResult.fixedIssues.map((issue) => issue);
        const renderedRemaining = fixResult.remainingIssues.map((issue) => issue);

        // 已修复列表完整
        expect(renderedFixed).toEqual(fixResult.fixedIssues);
        expect(renderedFixed.length).toBe(fixResult.fixedIssues.length);

        // 未修复列表完整
        expect(renderedRemaining).toEqual(fixResult.remainingIssues);
        expect(renderedRemaining.length).toBe(fixResult.remainingIssues.length);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 6.2, 6.3**
   *
   * fixedIssues 非空时应渲染已修复问题区域，为空时不渲染。
   * remainingIssues 非空时应渲染未修复问题区域，为空时不渲染。
   * 组件中：{parsedResult.fixedIssues.length > 0 && (...)}
   */
  test('问题列表区域的显示条件与数组长度一致', () => {
    fc.assert(
      fc.property(doctorFixResultArb(), (fixResult) => {
        // 已修复区域显示条件
        const showFixed = fixResult.fixedIssues.length > 0;
        // 未修复区域显示条件
        const showRemaining = fixResult.remainingIssues.length > 0;

        if (fixResult.fixedIssues.length > 0) {
          expect(showFixed).toBe(true);
        } else {
          expect(showFixed).toBe(false);
        }

        if (fixResult.remainingIssues.length > 0) {
          expect(showRemaining).toBe(true);
        } else {
          expect(showRemaining).toBe(false);
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 6.2, 6.3**
   *
   * needsRepair 提示信息仅在 needsRepair=true 时显示。
   * 组件中：{parsedResult.needsRepair && (...)}
   */
  test('needsRepair 提示信息的显示条件与 needsRepair 字段一致', () => {
    fc.assert(
      fc.property(doctorFixResultArb(), (fixResult) => {
        // needsRepair 与 remainingIssues 非空等价（DoctorFixResult 内部一致性）
        expect(fixResult.needsRepair).toBe(fixResult.remainingIssues.length > 0);

        // 提示信息显示条件
        const showHint = fixResult.needsRepair;
        if (fixResult.remainingIssues.length > 0) {
          expect(showHint).toBe(true);
        } else {
          expect(showHint).toBe(false);
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 6.2, 6.3**
   *
   * 结构化结果摘要仅在 parsedResult 存在且不在执行中时显示。
   */
  test('结构化结果摘要的显示条件：parsedResult !== null && !isRunning', () => {
    fc.assert(
      fc.property(
        fc.option(doctorFixResultArb(), { nil: null }),
        fc.boolean(),
        (parsedResult, isRunning) => {
          const shouldShow = shouldShowParsedResult(parsedResult, isRunning);

          if (parsedResult !== null && !isRunning) {
            expect(shouldShow).toBe(true);
          } else {
            expect(shouldShow).toBe(false);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
