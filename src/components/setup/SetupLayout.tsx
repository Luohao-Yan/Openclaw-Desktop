// ============================================================================
// SetupLayout — 重构版
// 结构化错误展示 + 骨架屏加载状态支持
// 布局策略：卡片内三段式 — 顶部步骤栏固定、中间内容可滚动、底部按钮由子页面控制
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
  /** 底部固定操作栏（按钮区域），固定在卡片底部不随内容滚动 */
  footer?: React.ReactNode;
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
    text: '#b45309',
    badgeBg: 'rgba(245, 158, 11, 0.18)',
    badgeText: '#d97706',
  },
  network: {
    bg: 'rgba(59, 130, 246, 0.10)',
    border: 'rgba(59, 130, 246, 0.30)',
    text: '#1d4ed8',
    badgeBg: 'rgba(59, 130, 246, 0.18)',
    badgeText: '#2563eb',
  },
  error: {
    bg: 'rgba(239, 68, 68, 0.10)',
    border: 'rgba(239, 68, 68, 0.30)',
    text: '#dc2626',
    badgeBg: 'rgba(239, 68, 68, 0.18)',
    badgeText: '#dc2626',
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
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const category = getErrorCategory(error.code);
  const styles = categoryStyles[category];

  return (
    <div
      className="mt-4 rounded-xl border px-4 py-3"
      style={{ backgroundColor: styles.bg, borderColor: styles.border }}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0" style={{ color: styles.text }}>
          <CategoryIcon category={category} />
        </div>
        <div className="flex-1 min-w-0">
          <span
            className="inline-block rounded-md px-2 py-0.5 text-xs font-mono font-medium"
            style={{ backgroundColor: styles.badgeBg, color: styles.badgeText }}
          >
            {error.code}
          </span>
          <p className="mt-1.5 text-sm leading-relaxed" style={{ color: styles.text }}>
            {error.message}
          </p>
          <div className="mt-2 flex items-start gap-1.5">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 opacity-70" style={{ color: styles.text }} />
            <p className="text-xs leading-relaxed opacity-80" style={{ color: styles.text }}>
              {error.suggestion}
            </p>
          </div>
          {error.details ? (
            <div className="mt-2">
              <button
                type="button"
                className="flex items-center gap-1 text-xs opacity-60 hover:opacity-90 transition-opacity cursor-pointer"
                style={{ color: styles.text }}
                onClick={() => setDetailsOpen((prev) => !prev)}
              >
                {detailsOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                技术细节
              </button>
              {detailsOpen ? (
                <pre
                  className="mt-1.5 rounded-lg px-3 py-2 text-xs font-mono leading-relaxed overflow-x-auto"
                  style={{ backgroundColor: 'rgba(0, 0, 0, 0.06)', color: styles.text }}
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
// 布局结构（三段式卡片）：
//   h-screen flex-col
//     ├─ TitleBar（系统标题栏，固定高度）
//     └─ flex-1 flex items-center justify-center（居中包装）
//          └─ max-w-4xl 卡片（flex-col，受 max-h 约束）
//               ├─ 头部 shrink-0（步骤标签 + 返回按钮）
//               ├─ 中间 flex-1 overflow-y-auto（标题 + 描述 + children 可滚动）
//               └─ 底部按钮由 children 自行渲染（在滚动区域内）
// ============================================================================

const SetupLayout: React.FC<SetupLayoutProps> = ({
  children,
  title,
  description,
  canGoBack = true,
  stepLabel,
  loading = false,
  footer,
}) => {
  const { error, goBackStep, isBusy } = useSetupFlow();

  return (
    <div
      className="flex flex-col h-screen"
      style={{ backgroundColor: 'var(--app-bg)', color: 'var(--app-text)' }}
    >
      <TitleBar />

      {/* 居中包装层 */}
      <div className="flex-1 min-h-0 flex items-center justify-center px-4 py-4 md:px-8 md:py-6 lg:px-10">
        {/* 卡片容器 — flex-col 三段式，max-h 限制总高度不超出视口 85% */}
        <div
          className="w-full max-w-4xl flex flex-col rounded-3xl border shadow-[0_18px_50px_rgba(0,0,0,0.18)]"
          style={{
            backgroundColor: 'var(--app-bg-elevated)',
            borderColor: 'var(--app-border)',
            maxHeight: 'min(85vh, 100%)',
          }}
        >
          {/* 顶部固定区域：步骤标签 + 返回按钮 */}
          <div className="shrink-0 px-5 pt-5 pb-3 md:px-6 md:pt-6">
            <div
              className="flex items-center justify-between gap-4 border-b pb-3"
              style={{ borderColor: 'var(--app-border)' }}
            >
              {stepLabel ? (
                <div
                  className="text-xs font-semibold uppercase tracking-[0.16em]"
                  style={{ color: 'var(--app-text-muted)' }}
                >
                  {stepLabel}
                </div>
              ) : <div />}
              {canGoBack ? (
                <AppButton variant="secondary" onClick={goBackStep} disabled={isBusy}>
                  返回上一步
                </AppButton>
              ) : null}
            </div>

            {/* 结构化错误展示 */}
            {error ? <SetupErrorDisplay error={error} /> : null}
          </div>

          {/* 中间可滚动区域：标题 + 描述 + 内容 */}
          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 md:px-6">
            <h1 className="text-2xl font-semibold leading-tight md:text-3xl">{title}</h1>
            {description ? (
              <p className="mt-2 max-w-2xl text-sm leading-6" style={{ color: 'var(--app-text-muted)' }}>
                {description}
              </p>
            ) : null}
            {/* 内容区域 — 自然高度，跟随滚动 */}
            <div className="mt-4">
              {loading ? <SetupLoadingSkeleton /> : children}
            </div>
          </div>

          {/* 底部固定操作栏 — 不随内容滚动 */}
          {footer ? (
            <div
              className="shrink-0 border-t px-5 py-4 md:px-6"
              style={{ borderColor: 'var(--app-border)' }}
            >
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default SetupLayout;
