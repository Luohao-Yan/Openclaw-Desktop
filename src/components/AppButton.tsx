/**
 * AppButton — 统一的按钮组件
 *
 * 苹果26液态玻璃风格，支持：
 * - 五种语义变体：primary / secondary / danger / success / ghost
 * - 三种尺寸：xs / sm / md
 * - 左侧图标（icon）、右侧图标（iconRight）
 * - loading 状态（自动显示 spinner，禁用交互）
 * - iconOnly 模式（正方形图标按钮，无文字）
 * - 完整的 hover / active / focus 交互状态
 * - 所有颜色使用 CSS 变量，不硬编码
 *
 * 用法示例：
 * ```tsx
 * <AppButton variant="primary" icon={<Plus size={16} />}>新建</AppButton>
 * <AppButton variant="danger" loading={deleting}>删除</AppButton>
 * <AppButton variant="ghost" iconOnly icon={<X size={16} />} />
 * <AppButton variant="secondary" iconRight={<ChevronDown size={14} />}>更多</AppButton>
 * ```
 */

import React from 'react';
import { Loader2 } from 'lucide-react';

// ── 类型定义 ──────────────────────────────────────────────────────────────────

/** 语义变体 */
export type AppButtonVariant = 'primary' | 'secondary' | 'danger' | 'success' | 'ghost';

/** 尺寸 */
export type AppButtonSize = 'xs' | 'sm' | 'md';

/** iconOnly 模式的色调（兼容原 AppIconButton 的 tint） */
export type AppButtonTint = 'default' | 'blue' | 'purple';

export interface AppButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children?: React.ReactNode;
  /** 额外 className */
  className?: string;
  /** 左侧图标 */
  icon?: React.ReactNode;
  /** 右侧图标（如下拉箭头） */
  iconRight?: React.ReactNode;
  /** 语义变体 */
  variant?: AppButtonVariant;
  /** 尺寸 */
  size?: AppButtonSize;
  /** 加载状态：显示 spinner，禁用交互 */
  loading?: boolean;
  /** 图标按钮模式：正方形，无文字，padding 均等 */
  iconOnly?: boolean;
  /** iconOnly 模式的色调（替代原 AppIconButton 的 tint） */
  tint?: AppButtonTint;
}

// ── 样式配置 ──────────────────────────────────────────────────────────────────

/** 各变体的基础样式（使用 CSS 变量） */
const VARIANT_STYLES: Record<AppButtonVariant, React.CSSProperties> = {
  primary: {
    background: 'var(--app-button-primary-bg)',
    border: '1px solid var(--app-button-primary-border)',
    color: 'var(--app-button-primary-text)',
    boxShadow: 'var(--app-button-primary-shadow)',
  },
  secondary: {
    background: 'var(--app-button-secondary-bg)',
    border: '1px solid var(--app-button-secondary-border)',
    color: 'var(--app-button-secondary-text)',
    boxShadow: 'var(--app-button-secondary-shadow)',
  },
  danger: {
    background: 'var(--app-button-danger-bg)',
    border: '1px solid var(--app-button-danger-border)',
    color: 'var(--app-button-danger-text)',
    boxShadow: 'var(--app-button-danger-shadow)',
  },
  success: {
    background: 'var(--app-button-success-bg)',
    border: '1px solid var(--app-button-success-border)',
    color: 'var(--app-button-success-text)',
    boxShadow: 'var(--app-button-success-shadow)',
  },
  /** ghost：无背景无边框，仅文字色，hover 时显示淡背景 */
  ghost: {
    background: 'transparent',
    border: '1px solid transparent',
    color: 'var(--app-text-muted)',
    boxShadow: 'none',
  },
};

/** 各变体的 hover 样式 */
const HOVER_STYLES: Record<AppButtonVariant, React.CSSProperties> = {
  primary: {
    filter: 'var(--app-button-primary-hover-filter)',
    boxShadow: 'var(--app-button-primary-hover-shadow)',
    transform: 'translateY(-1px)',
  },
  secondary: {
    filter: 'var(--app-button-secondary-hover-filter)',
    boxShadow: 'var(--app-button-secondary-hover-shadow)',
    border: '1px solid var(--app-button-secondary-hover-border)',
    transform: 'translateY(-1px)',
  },
  danger: {
    filter: 'var(--app-button-danger-hover-filter)',
    boxShadow: 'var(--app-button-danger-hover-shadow)',
    transform: 'translateY(-1px)',
  },
  success: {
    filter: 'var(--app-button-success-hover-filter)',
    boxShadow: 'var(--app-button-success-hover-shadow)',
    transform: 'translateY(-1px)',
  },
  ghost: {
    background: 'rgba(148, 163, 184, 0.10)',
    border: '1px solid rgba(148, 163, 184, 0.14)',
    color: 'var(--app-text)',
    transform: 'translateY(-1px)',
  },
};

/** 各变体的 active（按下）样式 */
const ACTIVE_STYLES: Record<AppButtonVariant, React.CSSProperties> = {
  primary: {
    filter: 'var(--app-button-primary-active-filter)',
    boxShadow: 'var(--app-button-primary-active-shadow)',
    transform: 'translateY(0)',
  },
  secondary: {
    filter: 'var(--app-button-secondary-active-filter)',
    boxShadow: 'var(--app-button-secondary-active-shadow)',
    border: '1px solid var(--app-button-secondary-active-border)',
    transform: 'translateY(0)',
  },
  danger: {
    filter: 'var(--app-button-danger-active-filter)',
    boxShadow: 'var(--app-button-danger-active-shadow)',
    transform: 'translateY(0)',
  },
  success: {
    filter: 'var(--app-button-success-active-filter)',
    boxShadow: 'var(--app-button-success-active-shadow)',
    transform: 'translateY(0)',
  },
  ghost: {
    background: 'rgba(148, 163, 184, 0.14)',
    border: '1px solid rgba(148, 163, 184, 0.18)',
    color: 'var(--app-text)',
    transform: 'translateY(0)',
  },
};

// ── Tint 样式（iconOnly 模式专用，兼容原 AppIconButton） ─────────────────

/** iconOnly 模式的色调基础样式 */
const TINT_STYLES: Record<AppButtonTint, React.CSSProperties> = {
  default: {
    background: 'var(--app-icon-button-default-bg)',
    border: '1px solid var(--app-icon-button-default-border)',
    color: 'var(--app-icon-button-default-text)',
  },
  blue: {
    background: 'var(--app-icon-button-blue-bg)',
    border: '1px solid var(--app-icon-button-blue-border)',
    color: 'var(--app-icon-button-blue-text)',
  },
  purple: {
    background: 'var(--app-icon-button-purple-bg)',
    border: '1px solid var(--app-icon-button-purple-border)',
    color: 'var(--app-icon-button-purple-text)',
  },
};

/** iconOnly tint 模式的 hover 样式 */
const TINT_HOVER_STYLE: React.CSSProperties = {
  transform: 'translateY(-1px)',
  boxShadow: '0 10px 22px rgba(15, 23, 42, 0.10)',
  filter: 'brightness(1.04)',
};

/** iconOnly tint 模式的 active 样式 */
const TINT_ACTIVE_STYLE: React.CSSProperties = {
  transform: 'translateY(0)',
  boxShadow: '0 4px 10px rgba(15, 23, 42, 0.06)',
  filter: 'brightness(1)',
};

// ── 尺寸配置 ──────────────────────────────────────────────────────────────────

/** 普通按钮的尺寸 Tailwind 类 */
const SIZE_CLASSES: Record<AppButtonSize, string> = {
  xs: 'px-2 py-1 text-xs',
  sm: 'px-3 py-2 text-sm',
  md: 'px-4 py-2 text-sm',
};

/** iconOnly 模式的尺寸 Tailwind 类（正方形） */
const ICON_ONLY_SIZE_CLASSES: Record<AppButtonSize, string> = {
  xs: 'p-1 text-xs',
  sm: 'p-1.5 text-sm',
  md: 'p-2 text-sm',
};

// ── 组件 ──────────────────────────────────────────────────────────────────────

const AppButton: React.FC<AppButtonProps> = ({
  children,
  className = '',
  disabled = false,
  icon,
  iconRight,
  iconOnly = false,
  loading = false,
  size = 'md',
  style,
  tint,
  type = 'button',
  variant = 'secondary',
  ...props
}) => {
  const [isHovered, setIsHovered] = React.useState(false);
  const [isPressed, setIsPressed] = React.useState(false);
  const [isFocused, setIsFocused] = React.useState(false);

  // loading 时视为 disabled
  const isDisabled = disabled || loading;

  // 是否使用 tint 模式（iconOnly + tint 指定时启用）
  const useTint = iconOnly && tint;

  // 基础样式：tint 模式用 TINT_STYLES，否则用 VARIANT_STYLES
  const baseStyle = useTint ? TINT_STYLES[tint] : VARIANT_STYLES[variant];

  // 根据交互状态选择样式叠加层
  const interactionStyle = isDisabled
    ? undefined
    : isPressed
      ? (useTint ? TINT_ACTIVE_STYLE : ACTIVE_STYLES[variant])
      : isHovered
        ? (useTint ? TINT_HOVER_STYLE : HOVER_STYLES[variant])
        : undefined;

  // focus 环样式
  const focusStyle = isDisabled || !isFocused
    ? undefined
    : {
        outline: '2px solid var(--app-active-border)',
        outlineOffset: '2px',
      };

  // 尺寸类：iconOnly 模式用正方形 padding
  const sizeClass = iconOnly ? ICON_ONLY_SIZE_CLASSES[size] : SIZE_CLASSES[size];

  // 渲染左侧内容：loading 时显示 spinner，否则显示 icon
  const leftContent = loading ? (
    <Loader2
      className="animate-spin flex-shrink-0"
      size={size === 'xs' ? 12 : 14}
    />
  ) : icon ? (
    <span className="flex-shrink-0 inline-flex items-center">{icon}</span>
  ) : null;

  return (
    <button
      type={type}
      disabled={isDisabled}
      className={`
        inline-flex items-center justify-center whitespace-nowrap rounded-lg
        font-medium transition-all duration-200 will-change-transform
        cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed
        ${sizeClass}
        ${className}
      `}
      style={{
        ...baseStyle,
        ...interactionStyle,
        ...focusStyle,
        ...style,
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setIsPressed(false);
      }}
      onMouseDown={() => setIsPressed(true)}
      onMouseUp={() => setIsPressed(false)}
      onFocus={() => setIsFocused(true)}
      onBlur={() => {
        setIsFocused(false);
        setIsPressed(false);
      }}
      {...props}
    >
      {/* 左侧图标 / loading spinner */}
      {leftContent && (
        <span className={iconOnly ? 'inline-flex items-center' : 'mr-1.5 inline-flex items-center'}>
          {leftContent}
        </span>
      )}

      {/* 按钮文字（iconOnly 模式不渲染） */}
      {!iconOnly && children}

      {/* 右侧图标（如下拉箭头） */}
      {!iconOnly && iconRight && (
        <span className="ml-1.5 flex-shrink-0 inline-flex items-center">
          {iconRight}
        </span>
      )}
    </button>
  );
};

export default AppButton;
