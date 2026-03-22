/**
 * DiagnosticsPanel — 技能诊断报告面板
 *
 * 模态/覆盖面板，可从顶部操作栏打开：
 * - 诊断报告面板：每个技能一行（状态图标 + 名称 + 问题描述）
 * - 缺失依赖列表展示
 * - 调用 skillsCheck 获取诊断数据
 * - 刷新按钮
 *
 * 需求: 7.1-7.4
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  X, RefreshCw, Stethoscope,
  CheckCircle, AlertTriangle, XCircle,
} from 'lucide-react';
import AppButton from '../AppButton';
import type { SkillDiagnosticReport, SkillDiagnosticItem } from '../../types/electron';

/** 组件属性 */
interface DiagnosticsPanelProps {
  /** 是否显示面板 */
  isOpen: boolean;
  /** 关闭面板回调 */
  onClose: () => void;
}

/** 获取诊断状态对应的图标和颜色 */
function getDiagnosticStatusDisplay(status: SkillDiagnosticItem['status']): {
  icon: React.ReactNode;
  color: string;
  bg: string;
  label: string;
} {
  switch (status) {
    case 'ok':
      return {
        icon: <CheckCircle className="w-4 h-4" />,
        color: '#10B981',
        bg: 'rgba(16, 185, 129, 0.12)',
        label: '正常',
      };
    case 'warning':
      return {
        icon: <AlertTriangle className="w-4 h-4" />,
        color: '#F59E0B',
        bg: 'rgba(245, 158, 11, 0.12)',
        label: '警告',
      };
    case 'error':
      return {
        icon: <XCircle className="w-4 h-4" />,
        color: '#EF4444',
        bg: 'rgba(239, 68, 68, 0.12)',
        label: '错误',
      };
    default:
      return {
        icon: <AlertTriangle className="w-4 h-4" />,
        color: '#6B7280',
        bg: 'rgba(107, 114, 128, 0.12)',
        label: '未知',
      };
  }
}

const DiagnosticsPanel: React.FC<DiagnosticsPanelProps> = ({
  isOpen,
  onClose,
}) => {
  // ── 状态 ──────────────────────────────────────────────────────────────
  /** 诊断报告数据 */
  const [report, setReport] = useState<SkillDiagnosticReport | null>(null);
  /** 加载状态 */
  const [loading, setLoading] = useState(false);
  /** 错误信息 */
  const [error, setError] = useState('');
  /** 面板可见性（用于动画） */
  const [visible, setVisible] = useState(false);

  // ── 滑入动画 ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => setVisible(true), 10);
      return () => clearTimeout(timer);
    } else {
      setVisible(false);
    }
  }, [isOpen]);

  /** 关闭面板（带动画） */
  const handleClose = useCallback(() => {
    setVisible(false);
    setTimeout(onClose, 300);
  }, [onClose]);

  // ── 加载诊断数据 ─────────────────────────────────────────────────────
  const loadDiagnostics = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await window.electronAPI.skillsCheck();
      if (result.success && result.report) {
        setReport(result.report);
      } else {
        setError(result.error || '诊断失败');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`诊断异常: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, []);

  // 面板打开时自动加载
  useEffect(() => {
    if (isOpen) {
      void loadDiagnostics();
    }
  }, [isOpen, loadDiagnostics]);

  // 不显示时不渲染
  if (!isOpen) return null;

  /** 汇总统计 */
  const summary = report?.summary ?? { ok: 0, warning: 0, error: 0 };
  const totalItems = report?.items?.length ?? 0;

  return (
    <>
      {/* 遮罩层 */}
      <div
        className="fixed inset-0 z-40 transition-opacity duration-300"
        style={{
          backgroundColor: 'rgba(15, 23, 42, 0.4)',
          opacity: visible ? 1 : 0,
        }}
        onClick={handleClose}
      />

      {/* 面板 */}
      <div
        className="fixed top-0 right-0 bottom-0 z-50 flex flex-col border-l transition-transform duration-300 ease-in-out"
        style={{
          width: '520px',
          maxWidth: '90vw',
          backgroundColor: 'var(--app-bg)',
          borderColor: 'var(--app-border)',
          transform: visible ? 'translateX(0)' : 'translateX(100%)',
        }}
      >
        {/* ── 头部 ────────────────────────────────────────────────────── */}
        <div
          className="px-6 py-5 border-b shrink-0"
          style={{ borderColor: 'var(--app-border)' }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: 'rgba(59, 130, 246, 0.12)' }}
              >
                <Stethoscope className="w-5 h-5" style={{ color: '#3B82F6' }} />
              </div>
              <div>
                <h2 className="text-lg font-semibold" style={{ color: 'var(--app-text)' }}>
                  技能诊断
                </h2>
                <p className="text-xs mt-0.5" style={{ color: 'var(--app-text-muted)' }}>
                  检查所有技能的健康状态
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* 刷新按钮：loading 时自动显示 spinner */}
              <AppButton
                variant="secondary"
                size="sm"
                onClick={() => void loadDiagnostics()}
                loading={loading}
                icon={<RefreshCw className="w-4 h-4" />}
              >
                刷新
              </AppButton>
              {/* 关闭按钮 */}
              <button
                onClick={handleClose}
                className="p-1.5 rounded-lg transition-colors hover:opacity-80"
                style={{ color: 'var(--app-text-muted)' }}
                aria-label="关闭"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* ── 可滚动内容区域 ──────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {loading && !report ? (
            /* 加载状态 */
            <div className="flex items-center justify-center py-16">
              <RefreshCw className="w-6 h-6 animate-spin" style={{ color: 'var(--app-text-muted)' }} />
              <span className="ml-2 text-sm" style={{ color: 'var(--app-text-muted)' }}>正在诊断...</span>
            </div>
          ) : error && !report ? (
            /* 错误状态 */
            <div className="flex flex-col items-center justify-center py-16 space-y-3">
              <div
                className="rounded-xl border px-4 py-3 text-xs flex items-start gap-2"
                style={{
                  backgroundColor: 'rgba(239, 68, 68, 0.08)',
                  borderColor: 'rgba(239, 68, 68, 0.22)',
                  color: '#FCA5A5',
                }}
              >
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
              <AppButton
                variant="primary"
                size="sm"
                onClick={() => void loadDiagnostics()}
                icon={<RefreshCw className="w-4 h-4" />}
              >
                重试
              </AppButton>
            </div>
          ) : report ? (
            <>
              {/* ── 汇总统计 ──────────────────────────────────────────── */}
              <div
                className="rounded-xl border p-4"
                style={{ backgroundColor: 'var(--app-bg-subtle)', borderColor: 'var(--app-border)' }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--app-text-muted)' }}>
                    诊断摘要
                  </span>
                  <span className="text-xs" style={{ color: 'var(--app-text-muted)' }}>
                    共 {totalItems} 个技能
                  </span>
                </div>
                <div className="flex items-center gap-4 mt-3">
                  {/* 正常计数 */}
                  <div className="flex items-center gap-1.5">
                    <CheckCircle className="w-4 h-4" style={{ color: '#10B981' }} />
                    <span className="text-sm font-medium" style={{ color: '#10B981' }}>
                      {summary.ok}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--app-text-muted)' }}>正常</span>
                  </div>
                  {/* 警告计数 */}
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" style={{ color: '#F59E0B' }} />
                    <span className="text-sm font-medium" style={{ color: '#F59E0B' }}>
                      {summary.warning}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--app-text-muted)' }}>警告</span>
                  </div>
                  {/* 错误计数 */}
                  <div className="flex items-center gap-1.5">
                    <XCircle className="w-4 h-4" style={{ color: '#EF4444' }} />
                    <span className="text-sm font-medium" style={{ color: '#EF4444' }}>
                      {summary.error}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--app-text-muted)' }}>错误</span>
                  </div>
                </div>
              </div>

              {/* ── 诊断条目列表 ──────────────────────────────────────── */}
              {report.items.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 space-y-2">
                  <CheckCircle className="w-10 h-10" style={{ color: '#10B981', opacity: 0.5 }} />
                  <p className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
                    所有技能状态正常
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {report.items.map((item, index) => {
                    const statusDisplay = getDiagnosticStatusDisplay(item.status);

                    return (
                      <div
                        key={`${item.skillName}-${index}`}
                        className="rounded-xl border p-4"
                        style={{
                          backgroundColor: item.status !== 'ok' ? statusDisplay.bg : 'var(--app-bg)',
                          borderColor: item.status !== 'ok'
                            ? `${statusDisplay.color}33`
                            : 'var(--app-border)',
                        }}
                      >
                        {/* 技能行：状态图标 + 名称 + 状态标签 */}
                        <div className="flex items-center gap-3">
                          <span style={{ color: statusDisplay.color }}>{statusDisplay.icon}</span>
                          <span className="text-sm font-medium flex-1 truncate" style={{ color: 'var(--app-text)' }}>
                            {item.skillName}
                          </span>
                          <span
                            className="text-xs font-medium px-2 py-0.5 rounded-full shrink-0"
                            style={{ backgroundColor: statusDisplay.bg, color: statusDisplay.color }}
                          >
                            {statusDisplay.label}
                          </span>
                        </div>

                        {/* 问题描述列表 */}
                        {item.issues.length > 0 && (
                          <div className="mt-2 ml-7 space-y-1">
                            {item.issues.map((issue, issueIdx) => (
                              <div
                                key={issueIdx}
                                className="text-xs flex items-start gap-1.5"
                                style={{ color: 'var(--app-text-muted)' }}
                              >
                                <span
                                  className="w-1 h-1 rounded-full shrink-0 mt-1.5"
                                  style={{ backgroundColor: statusDisplay.color }}
                                />
                                <span>{issue}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 刷新时的加载指示器 */}
              {loading && (
                <div className="flex items-center justify-center py-2">
                  <RefreshCw className="w-4 h-4 animate-spin" style={{ color: 'var(--app-text-muted)' }} />
                  <span className="ml-2 text-xs" style={{ color: 'var(--app-text-muted)' }}>刷新中...</span>
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </>
  );
};

export default DiagnosticsPanel;
