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

/** 各变体的 RGB 主色值（不含 alpha），通过不同透明度生成背景/边框/文字 */
const VARIANT_RGB: Record<AppBadgeVariant, string> = {
  default: 'var(--badge-rgb-default, 99,102,241)',   // 紫
  success: 'var(--badge-rgb-success, 34,197,94)',    // 绿
  danger:  'var(--badge-rgb-danger, 239,68,68)',     // 红
  warning: 'var(--badge-rgb-warning, 245,158,11)',   // 黄
  info:    'var(--badge-rgb-info, 14,165,233)',      // 蓝
  neutral: 'var(--badge-rgb-neutral, 148,163,184)',  // 灰
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
  const rgb = VARIANT_RGB[variant];
  return (
    <span
      className={`
        inline-flex items-center gap-1.5 rounded-full font-medium
        ${SIZE_CLASS[size]}
        ${className}
      `}
      style={{
        /* 同一主色，不同透明度：背景 0.10、边框 0.22、文字 0.85 */
        backgroundColor: `rgba(${rgb}, 0.10)`,
        border: `1px solid rgba(${rgb}, 0.22)`,
        color: `rgba(${rgb}, 0.85)`,
        ...style,
      }}
    >
      {/* 状态圆点 */}
      {dot && (
        <span
          className={`rounded-full flex-shrink-0 ${DOT_SIZE[size]}`}
          style={{ backgroundColor: `rgba(${rgb}, 0.85)` }}
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
