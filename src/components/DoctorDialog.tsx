/**
 * DoctorDialog — 一键修复模态弹窗组件
 *
 * 执行 `openclaw doctor --fix` 命令，实时显示终端风格输出，
 * 完成后解析并展示结构化修复结果摘要。
 *
 * 功能：
 * - 打开时自动调用 doctorStream() 并注册 onDoctorOutput 监听器
 * - Terminal_Output 区域：等宽字体、深色背景、stdout/stderr 颜色区分
 * - 自动滚动到最新输出
 * - 执行完成后调用 parseDoctorOutput 解析输出，显示结构化结果
 * - 执行中禁用关闭按钮
 * - 所有文案使用 i18n 翻译键
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Stethoscope, Loader2 } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { parseDoctorOutput } from '../../electron/ipc/doctorLogic';
import type { DoctorFixResult } from '../../electron/ipc/doctorLogic';
import type { DoctorOutputEvent } from '../types/electron';
import AppButton from './AppButton';
import AppModal from './AppModal';

// ── 类型定义 ──────────────────────────────────────────────────────────────────

/** 终端输出行 */
interface OutputLine {
  /** 输出文本 */
  text: string;
  /** 是否为 stderr 输出 */
  isError: boolean;
}

/** DoctorDialog 组件 Props */
export interface DoctorDialogProps {
  /** 是否打开弹窗 */
  open: boolean;
  /** 关闭弹窗回调 */
  onClose: () => void;
  /** 修复完成回调（用于触发 Dashboard 刷新） */
  onComplete?: () => void;
}

// ── 组件 ──────────────────────────────────────────────────────────────────────

const DoctorDialog: React.FC<DoctorDialogProps> = ({ open, onClose, onComplete }) => {
  const { t } = useI18n();

  // ── 内部状态 ────────────────────────────────────────────────────────────────
  /** 终端输出行列表 */
  const [outputLines, setOutputLines] = useState<OutputLine[]>([]);
  /** 命令是否正在执行 */
  const [isRunning, setIsRunning] = useState(false);
  /** 执行结果 */
  const [result, setResult] = useState<{ success: boolean; output?: string; error?: string } | null>(null);
  /** 解析后的结构化结果 */
  const [parsedResult, setParsedResult] = useState<DoctorFixResult | null>(null);

  // ── Refs ────────────────────────────────────────────────────────────────────
  /** 终端输出区域底部锚点，用于自动滚动 */
  const scrollAnchorRef = useRef<HTMLDivElement>(null);

  // ── 自动滚动到最新输出 ──────────────────────────────────────────────────────
  useEffect(() => {
    if (scrollAnchorRef.current) {
      scrollAnchorRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [outputLines]);

  // ── 关闭时重置状态 ──────────────────────────────────────────────────────────
  const handleClose = useCallback(() => {
    if (isRunning) return; // 执行中不允许关闭
    // 重置所有状态
    setOutputLines([]);
    setResult(null);
    setParsedResult(null);
    setIsRunning(false);
    onClose();
  }, [isRunning, onClose]);

  // ── open=true 时自动执行 doctorStream ───────────────────────────────────────
  useEffect(() => {
    if (!open) return;

    // 重置状态
    setOutputLines([]);
    setResult(null);
    setParsedResult(null);
    setIsRunning(true);

    // 注册流式输出监听器
    const unsubscribe = window.electronAPI.onDoctorOutput((event: DoctorOutputEvent) => {
      setOutputLines((prev) => [...prev, { text: event.data, isError: event.isError }]);
    });

    // 调用 doctorStream 执行修复命令
    window.electronAPI
      .doctorStream()
      .then((res) => {
        setResult(res);
        // 解析输出，生成结构化结果
        if (res.output) {
          const parsed = parseDoctorOutput(res.output);
          setParsedResult(parsed);
        }
        // 触发完成回调
        onComplete?.();
      })
      .catch((err) => {
        setResult({ success: false, error: String(err) });
      })
      .finally(() => {
        setIsRunning(false);
      });

    // 清理：取消监听
    return () => {
      unsubscribe();
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 渲染 ────────────────────────────────────────────────────────────────────
  return (
    <AppModal
      open={open}
      onClose={handleClose}
      title={t('doctor.dialogTitle')}
      icon={<Stethoscope size={20} />}
      size="2xl"
      disableClose={isRunning}
      closeOnOverlay={!isRunning}
      footer={
        <AppButton
          variant="secondary"
          disabled={isRunning}
          onClick={handleClose}
        >
          {t('doctor.close')}
        </AppButton>
      }
    >
      {/* ── 执行状态提示 ──────────────────────────────────────────────── */}
      {isRunning && (
        <div className="flex items-center gap-2 mb-3" style={{ color: 'var(--app-text-muted)' }}>
          <Loader2 size={16} className="animate-spin" />
          <span className="text-sm">{t('doctor.running')}</span>
        </div>
      )}

      {/* ── Terminal_Output 区域 ──────────────────────────────────────── */}
      <div
        className="font-mono text-sm rounded-lg max-h-80 overflow-y-auto p-4"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.9)' }}
      >
        {outputLines.length === 0 && isRunning && (
          <div style={{ color: 'var(--app-text-muted)' }} className="text-xs">
            {t('doctor.running')}
          </div>
        )}
        {outputLines.map((line, index) => (
          <div
            key={index}
            className="whitespace-pre-wrap break-all leading-relaxed"
            style={{
              color: line.isError ? '#fb923c' : 'var(--app-text)',
            }}
          >
            {line.text}
          </div>
        ))}
        {/* 滚动锚点 */}
        <div ref={scrollAnchorRef} />
      </div>

      {/* ── 执行结果状态提示 ──────────────────────────────────────────── */}
      {result && !isRunning && (
        <div
          className="mt-3 px-3 py-2 rounded-lg text-sm font-medium"
          style={{
            backgroundColor: result.success
              ? 'rgba(34, 197, 94, 0.12)'
              : 'rgba(239, 68, 68, 0.12)',
            color: result.success ? '#22c55e' : '#ef4444',
          }}
        >
          {result.success ? t('doctor.success') : t('doctor.failed')}
        </div>
      )}

      {/* ── 结构化结果摘要 ────────────────────────────────────────────── */}
      {parsedResult && !isRunning && (
        <div className="mt-4 space-y-3">
          {/* 已修复问题列表 */}
          {parsedResult.fixedIssues.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-1.5" style={{ color: '#22c55e' }}>
                {t('doctor.fixedIssues')}
              </h4>
              <ul className="space-y-1">
                {parsedResult.fixedIssues.map((issue, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span style={{ color: '#22c55e' }}>✓</span>
                    <span style={{ color: 'var(--app-text)' }}>{issue}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 未修复问题列表 */}
          {parsedResult.remainingIssues.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-1.5" style={{ color: '#ef4444' }}>
                {t('doctor.remainingIssues')}
              </h4>
              <ul className="space-y-1">
                {parsedResult.remainingIssues.map((issue, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span style={{ color: '#ef4444' }}>✗</span>
                    <span style={{ color: 'var(--app-text)' }}>{issue}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* needsRepair 提示信息 */}
          {parsedResult.needsRepair && (
            <div
              className="px-3 py-2 rounded-lg text-sm"
              style={{
                backgroundColor: 'rgba(251, 191, 36, 0.12)',
                color: '#fbbf24',
              }}
            >
              {t('doctor.needsRepairHint')}
            </div>
          )}
        </div>
      )}
    </AppModal>
  );
};

export default DoctorDialog;
