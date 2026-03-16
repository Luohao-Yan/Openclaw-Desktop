// ============================================================================
// SetupLayout — 重构版
// 结构化错误展示 + 骨架屏加载状态支持
// @see 需求 2.1 — 结构化错误对象展示
// @see 需求 2.2 — 明确的降级提示
// @see 需求 2.4 — 错误代码、消息、建议、技术细节
// ============================================================================

import React from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Info,
  Wifi,
  XCircle,
} from 'lucide-react';
import TitleBar from '../TitleBar';
import { useSetupFlow } from '../../contexts/SetupFlowContext';
import AppButton from '../AppButton';
import type { SetupError, SetupErrorCode } from '../../types/setup';

// ============================================================================
// 类型定义
// ============================================================================

interface SetupLayoutProps {
  children: React.ReactNode;
  title: string;
  description?: string;
  canGoBack?: boolean;
  stepLabel?: string;
  /** 是否显示骨架屏（加载中状态） */
  loading?: boolean;
}

// ============================================================================
// 错误代码 → 视觉样式映射
// ============================================================================

/** 错误视觉分类 */
type ErrorVisualCategory = 'warning' | 'network' | 'error';

/**
 * 根据错误代码获取视觉分类
 * - IPC 相关 → 橙色/警告
 * - 网络相关 → 蓝色/网络
 * - 安装/验证/未知 → 红色/错误
 */
const getErrorCategory = (code: SetupErrorCode): ErrorVisualCategory => {
  switch (code) {
    case 'IPC_UNAVAILABLE':
    case 'IPC_CALL_FAILED':
    case 'CHANNEL_TEST_FAILED':
      return 'warning';
    case 'NETWORK_TIMEOUT':
    case 'REMOTE_CONNECTION_FAILED':
      return 'network';
    case 'ENVIRONMENT_CHECK_FAILED':
    case 'INSTALL_FAILED':
    case 'VERIFY_FAILED':
    case 'UNKNOWN':
    default:
      return 'error';
  }
};

/** 各分类对应的颜色配置 */
const categoryStyles: Record<ErrorVisualCategory, {
  bg: string;
  border: string;
  text: string;
  badgeBg: string;
  badgeText: string;
}> = {
  warning: {
    bg: 'rgba(245, 158, 11, 0.10)',
    border: 'rgba(245, 158, 11, 0.30)',
    text: '#fbbf24',
    badgeBg: 'rgba(245, 158, 11, 0.18)',
    badgeText: '#f59e0b',
  },
  network: {
    bg: 'rgba(59, 130, 246, 0.10)',
    border: 'rgba(59, 130, 246, 0.30)',
    text: '#93c5fd',
    badgeBg: 'rgba(59, 130, 246, 0.18)',
    badgeText: '#3b82f6',
  },
  error: {
    bg: 'rgba(239, 68, 68, 0.10)',
    border: 'rgba(239, 68, 68, 0.30)',
    text: '#fca5a5',
    badgeBg: 'rgba(239, 68, 68, 0.18)',
    badgeText: '#ef4444',
  },
};

/** 各分类对应的图标组件 */
const CategoryIcon: React.FC<{ category: ErrorVisualCategory; className?: string }> = ({
  category,
  className = 'w-5 h-5',
}) => {
  switch (category) {
    case 'warning':
      return <AlertTriangle className={className} />;
    case 'network':
      return <Wifi className={className} />;
    case 'error':
      return <XCircle className={className} />;
  }
};

// ============================================================================
// 结构化错误展示子组件
// ============================================================================

/** 结构化错误展示区域 */
const SetupErrorDisplay: React.FC<{ error: SetupError }> = ({ error }) => {
  // 技术细节折叠状态
  const [detailsOpen, setDetailsOpen] = React.useState(false);

  const category = getErrorCategory(error.code);
  const styles = categoryStyles[category];

  return (
    <div
      className="mt-4 rounded-xl border px-4 py-3"
      style={{
        backgroundColor: styles.bg,
        borderColor: styles.border,
      }}
    >
      {/* 第一行：图标 + 错误代码徽章 + 用户消息 */}
      <div className="flex items-start gap-3">
        {/* 分类图标 */}
        <div className="mt-0.5 shrink-0" style={{ color: styles.text }}>
          <CategoryIcon category={category} />
        </div>

        <div className="flex-1 min-w-0">
          {/* 错误代码徽章 */}
          <span
            className="inline-block rounded-md px-2 py-0.5 text-xs font-mono font-medium"
            style={{
              backgroundColor: styles.badgeBg,
              color: styles.badgeText,
            }}
          >
            {error.code}
          </span>

          {/* 用户可读消息 */}
          <p className="mt-1.5 text-sm leading-relaxed" style={{ color: styles.text }}>
            {error.message}
          </p>

          {/* 建议操作 */}
          <div className="mt-2 flex items-start gap-1.5">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 opacity-70" style={{ color: styles.text }} />
            <p className="text-xs leading-relaxed opacity-80" style={{ color: styles.text }}>
              {error.suggestion}
            </p>
          </div>

          {/* 技术细节（可折叠） */}
          {error.details ? (
            <div className="mt-2">
              <button
                type="button"
                className="flex items-center gap-1 text-xs opacity-60 hover:opacity-90 transition-opacity cursor-pointer"
                style={{ color: styles.text }}
                onClick={() => setDetailsOpen((prev) => !prev)}
              >
                {detailsOpen ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
                技术细节
              </button>
              {detailsOpen ? (
                <pre
                  className="mt-1.5 rounded-lg px-3 py-2 text-xs font-mono leading-relaxed overflow-x-auto"
                  style={{
                    backgroundColor: 'rgba(0, 0, 0, 0.2)',
                    color: styles.text,
                  }}
                >
                  {error.details}
                </pre>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 骨架屏占位组件
// ============================================================================

/** 骨架屏脉冲动画块 */
const SkeletonBlock: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div
    className={`animate-pulse rounded-lg ${className}`}
    style={{ backgroundColor: 'var(--app-border)' }}
  />
);

/** 加载中骨架屏内容 */
const SetupLoadingSkeleton: React.FC = () => (
  <div className="mt-5 space-y-4">
    <SkeletonBlock className="h-6 w-3/4" />
    <SkeletonBlock className="h-4 w-1/2" />
    <div className="space-y-3 mt-6">
      <SkeletonBlock className="h-12 w-full" />
      <SkeletonBlock className="h-12 w-full" />
      <SkeletonBlock className="h-12 w-5/6" />
    </div>
    <div className="flex gap-3 mt-6">
      <SkeletonBlock className="h-10 w-28" />
      <SkeletonBlock className="h-10 w-28" />
    </div>
  </div>
);

// ============================================================================
// SetupLayout 主组件
// ============================================================================

const SetupLayout: React.FC<SetupLayoutProps> = ({
  children,
  title,
  description,
  canGoBack = true,
  stepLabel,
  loading = false,
}) => {
  const {
    error,
    goBackStep,
    isBusy,
  } = useSetupFlow();

  return (
    <div
      className="flex flex-col h-screen"
      style={{
        backgroundColor: 'var(--app-bg)',
        color: 'var(--app-text)',
      }}
    >
      <TitleBar />
      {/* 外层容器 — flex 垂直居中，内容少时卡片居中，内容多时可整体滚动 */}
      <div className="flex-1 min-h-0 overflow-auto flex items-center justify-center px-4 py-4 md:px-8 md:py-6 lg:px-10">
        <div className="w-full max-w-4xl">
          <div
            className="rounded-3xl border p-5 shadow-[0_18px_50px_rgba(0,0,0,0.18)] md:p-6"
            style={{
              backgroundColor: 'var(--app-bg-elevated)',
              borderColor: 'var(--app-border)',
            }}
          >
            {/* 头部：步骤标签 + 标题 + 描述 + 返回按钮 */}
            <div className="flex items-start justify-between gap-4 border-b pb-4" style={{ borderColor: 'var(--app-border)' }}>
              <div>
                {stepLabel ? (
                  <div className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--app-text-muted)' }}>
                    {stepLabel}
                  </div>
                ) : null}
                <h1 className="mt-2 text-2xl font-semibold leading-tight md:text-3xl">{title}</h1>
                {description ? (
                  <p className="mt-2 max-w-2xl text-sm leading-6" style={{ color: 'var(--app-text-muted)' }}>
                    {description}
                  </p>
                ) : null}
              </div>
              {canGoBack ? (
                <AppButton variant="secondary" onClick={goBackStep} disabled={isBusy}>
                  返回上一步
                </AppButton>
              ) : null}
            </div>

            {/* 结构化错误展示 — 使用 SetupError 对象替代纯字符串 */}
            {error ? <SetupErrorDisplay error={error} /> : null}

            {/* 内容区域：loading 时显示骨架屏，否则渲染子组件 */}
            {loading ? <SetupLoadingSkeleton /> : <div className="mt-5">{children}</div>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SetupLayout;
