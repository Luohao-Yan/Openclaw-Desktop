/**
 * AppBadge — 统一的徽章/标签组件
 *
 * 苹果26液态玻璃风格，支持：
 * - 六种语义变体：default（紫）、success（绿）、danger（红）、warning（黄）、info（蓝）、neutral（灰）
 * - 两种尺寸：sm（紧凑）、md（标准）
 * - 可选左侧图标（icon）
 * - 可选状态圆点（dot），用于在线/离线等状态指示
 * - 所有颜色使用 rgba + CSS 变量，不硬编码
 *
 * 用法示例：
 * ```tsx
 * <AppBadge variant="success" dot>运行中</AppBadge>
 * <AppBadge variant="danger" size="sm">错误</AppBadge>
 * <AppBadge variant="info" icon={<Cpu size={11} />}>GPT-4</AppBadge>
 * ```
 */

import React from 'react';

// ── 类型定义 ──────────────────────────────────────────────────────────────────

/** 语义变体 */
export type AppBadgeVariant = 'default' | 'success' | 'danger' | 'warning' | 'info' | 'neutral';

/** 尺寸 */
export type AppBadgeSize = 'sm' | 'md';

export interface AppBadgeProps {
  /** 语义变体，决定背景色和文字色 */
  variant?: AppBadgeVariant;
  /** 尺寸：sm = 紧凑（px-2 py-0.5 text-[11px]），md = 标准（px-3 py-1 text-xs） */
  size?: AppBadgeSize;
  /** 左侧图标（建议 11~13px 的 lucide 图标） */
  icon?: React.ReactNode;
  /** 是否显示左侧状态圆点 */
  dot?: boolean;
  /** 额外 className */
  className?: string;
  /** 额外内联样式 */
  style?: React.CSSProperties;
  children: React.ReactNode;
}

// ── 颜色配置 ──────────────────────────────────────────────────────────────────

/** 各变体的背景色（rgba，适配深色/浅色主题） */
const VARIANT_BG: Record<AppBadgeVariant, string> = {
  default: 'rgba(99, 102, 241, 0.12)',   // 紫
  success: 'rgba(16, 185, 129, 0.12)',   // 绿
  danger:  'rgba(239, 68, 68, 0.12)',    // 红
  warning: 'rgba(245, 158, 11, 0.12)',   // 黄
  info:    'rgba(14, 165, 233, 0.12)',   // 蓝
  neutral: 'rgba(148, 163, 184, 0.10)',  // 灰
};

/** 各变体的边框色 */
const VARIANT_BORDER: Record<AppBadgeVariant, string> = {
  default: 'rgba(99, 102, 241, 0.22)',
  success: 'rgba(16, 185, 129, 0.22)',
  danger:  'rgba(239, 68, 68, 0.22)',
  warning: 'rgba(245, 158, 11, 0.22)',
  info:    'rgba(14, 165, 233, 0.22)',
  neutral: 'rgba(148, 163, 184, 0.18)',
};

/** 各变体的文字色 */
const VARIANT_TEXT: Record<AppBadgeVariant, string> = {
  default: '#818CF8',  // 紫
  success: '#34D399',  // 绿
  danger:  '#F87171',  // 红
  warning: '#FCD34D',  // 黄
  info:    '#38BDF8',  // 蓝
  neutral: 'var(--app-text-muted)',
};

/** 各变体的圆点色 */
const VARIANT_DOT: Record<AppBadgeVariant, string> = {
  default: '#818CF8',
  success: '#34D399',
  danger:  '#F87171',
  warning: '#FCD34D',
  info:    '#38BDF8',
  neutral: 'var(--app-text-muted)',
};

// ── 尺寸配置 ──────────────────────────────────────────────────────────────────

/** 尺寸对应的 Tailwind 类 */
const SIZE_CLASS: Record<AppBadgeSize, string> = {
  sm: 'px-2 py-0.5 text-[11px]',
  md: 'px-3 py-1 text-xs',
};

/** 圆点尺寸 */
const DOT_SIZE: Record<AppBadgeSize, string> = {
  sm: 'w-1.5 h-1.5',
  md: 'w-2 h-2',
};

// ── 组件 ──────────────────────────────────────────────────────────────────────

const AppBadge: React.FC<AppBadgeProps> = ({
  variant = 'default',
  size = 'md',
  icon,
  dot = false,
  className = '',
  style,
  children,
}) => {
  return (
    <span
      className={`
        inline-flex items-center gap-1.5 rounded-full font-medium
        ${SIZE_CLASS[size]}
        ${className}
      `}
      style={{
        backgroundColor: VARIANT_BG[variant],
        border: `1px solid ${VARIANT_BORDER[variant]}`,
        color: VARIANT_TEXT[variant],
        ...style,
      }}
    >
      {/* 状态圆点 */}
      {dot && (
        <span
          className={`rounded-full flex-shrink-0 ${DOT_SIZE[size]}`}
          style={{ backgroundColor: VARIANT_DOT[variant] }}
        />
      )}
      {/* 左侧图标 */}
      {icon && (
        <span className="flex-shrink-0 flex items-center">
          {icon}
        </span>
      )}
      {children}
    </span>
  );
};

export default AppBadge;
