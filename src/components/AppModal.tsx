/**
 * AppModal — 统一的模态对话框组件
 *
 * 苹果26液态玻璃风格，支持：
 * - 标准 / 危险 / 信息 三种语义变体
 * - 自定义头部图标（icon）
 * - 可选的底部操作栏（footer）
 * - Escape 键关闭 + 点击遮罩关闭
 * - 进入/退出动画
 * - 无障碍：role="dialog" + aria-modal + aria-labelledby
 *
 * 用法示例：
 * ```tsx
 * <AppModal
 *   open={isOpen}
 *   onClose={() => setIsOpen(false)}
 *   title="确认删除"
 *   variant="danger"
 *   icon={<Trash2 />}
 *   footer={
 *     <>
 *       <AppButton variant="secondary" onClick={onClose}>取消</AppButton>
 *       <AppButton variant="danger" onClick={handleDelete}>删除</AppButton>
 *     </>
 *   }
 * >
 *   <p>此操作不可恢复。</p>
 * </AppModal>
 * ```
 */

import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

// ── 类型定义 ──────────────────────────────────────────────────────────────────

/** 语义变体：决定头部图标背景色 */
type AppModalVariant = 'default' | 'danger' | 'info' | 'success' | 'warning';

interface AppModalProps {
  /** 是否显示 */
  open: boolean;
  /** 关闭回调（Escape / 点击遮罩 / 关闭按钮） */
  onClose: () => void;
  /** 标题 */
  title?: React.ReactNode;
  /** 头部图标（建议 20×20 lucide 图标） */
  icon?: React.ReactNode;
  /** 语义变体，影响图标背景色 */
  variant?: AppModalVariant;
  /** 弹窗最大宽度，默认 'md' */
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
  /** 底部操作区（通常放 AppButton 组合） */
  footer?: React.ReactNode;
  /** 底部操作区对齐方式，默认 'end'（右对齐），'between' 为两端对齐 */
  footerJustify?: 'end' | 'between';
  /** 是否允许点击遮罩关闭，默认 true */
  closeOnOverlay?: boolean;
  /** 是否显示右上角关闭按钮，默认 true */
  showCloseButton?: boolean;
  /** 是否禁用关闭（加载中场景） */
  disableClose?: boolean;
  /** 内容区 */
  children?: React.ReactNode;
  /** 是否去掉内容区的默认 padding（用于全屏编辑器等自定义布局） */
  noPadding?: boolean;
  /** 额外 className（作用于弹窗容器） */
  className?: string;
}

// ── 常量 ──────────────────────────────────────────────────────────────────────

/** 弹窗最大宽度映射 */
const SIZE_CLASS: Record<NonNullable<AppModalProps['size']>, string> = {
  sm:   'max-w-sm',
  md:   'max-w-md',
  lg:   'max-w-lg',
  xl:   'max-w-xl',
  '2xl': 'max-w-6xl',
  full: 'max-w-[96vw]',
};

/** 图标背景色映射（rgba，适配深色/浅色主题） */
const ICON_BG: Record<AppModalVariant, string> = {
  default: 'rgba(99, 102, 241, 0.12)',
  danger:  'rgba(239, 68, 68, 0.12)',
  info:    'rgba(0, 180, 255, 0.12)',
  success: 'rgba(0, 224, 142, 0.12)',
  warning: 'rgba(251, 191, 36, 0.12)',
};

/** 图标颜色映射 */
const ICON_COLOR: Record<AppModalVariant, string> = {
  default: '#818CF8',
  danger:  '#F87171',
  info:    '#00B4FF',
  success: '#00E08E',
  warning: '#FBBF24',
};

// ── 组件 ──────────────────────────────────────────────────────────────────────

const AppModal: React.FC<AppModalProps> = ({
  open,
  onClose,
  title,
  icon,
  variant = 'default',
  size = 'md',
  footer,
  footerJustify = 'end',
  closeOnOverlay = true,
  showCloseButton = true,
  disableClose = false,
  children,
  noPadding = false,
  className = '',
}) => {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  // ── Escape 键关闭 ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !disableClose) onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, disableClose, onClose]);

  // ── 打开时锁定 body 滚动 ───────────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  // ── 焦点陷阱：打开时聚焦弹窗容器 ─────────────────────────────────────────
  useEffect(() => {
    if (open) {
      // 延迟一帧，确保 DOM 已渲染
      const id = requestAnimationFrame(() => panelRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [open]);

  if (!open) return null;

  // ── 遮罩点击处理 ──────────────────────────────────────────────────────────
  const handleOverlayClick = () => {
    if (closeOnOverlay && !disableClose) onClose();
  };

  const hasHeader = title || icon || showCloseButton;

  return (
    /* 遮罩层 */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.55)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        animation: 'modal-overlay-in 180ms ease-out',
      }}
      onClick={handleOverlayClick}
      aria-hidden="true"
    >
      {/* 弹窗面板 */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={`
          relative w-full ${SIZE_CLASS[size]} rounded-3xl border overflow-hidden
          outline-none focus:outline-none
          ${className}
        `}
        style={{
          backgroundColor: 'var(--app-bg-elevated)',
          borderColor: 'var(--app-border)',
          color: 'var(--app-text)',
          boxShadow: '0 32px 64px rgba(0,0,0,0.40), 0 8px 24px rgba(0,0,0,0.20)',
          animation: 'modal-panel-in 220ms cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── 头部 ──────────────────────────────────────────────────────── */}
        {hasHeader && (
          <div
            className="flex items-center justify-between gap-3 px-6 py-5 border-b"
            style={{ borderColor: 'var(--app-border)' }}
          >
            <div className="flex items-center gap-3 min-w-0">
              {/* 图标 */}
              {icon && (
                <div
                  className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
                  style={{
                    backgroundColor: ICON_BG[variant],
                    color: ICON_COLOR[variant],
                  }}
                >
                  {icon}
                </div>
              )}
              {/* 标题 */}
              {title && (
                <h3
                  id={titleId}
                  className="text-base font-semibold truncate"
                  style={{ color: 'var(--app-text)' }}
                >
                  {title}
                </h3>
              )}
            </div>

            {/* 关闭按钮 */}
            {showCloseButton && (
              <button
                type="button"
                onClick={() => !disableClose && onClose()}
                disabled={disableClose}
                className="flex-shrink-0 p-1.5 rounded-lg transition-all duration-200 hover:opacity-70 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                style={{ color: 'var(--app-text-muted)' }}
                aria-label="关闭"
              >
                <X size={18} />
              </button>
            )}
          </div>
        )}

        {/* ── 内容区 ────────────────────────────────────────────────────── */}
        {children && (
          <div className={noPadding ? '' : 'px-6 py-5'}>
            {children}
          </div>
        )}

        {/* ── 底部操作区 ────────────────────────────────────────────────── */}
        {footer && (
          <div
            className={`flex items-center gap-3 px-6 py-4 border-t ${footerJustify === 'between' ? 'justify-between' : 'justify-end'}`}
            style={{ borderColor: 'var(--app-border)' }}
          >
            {footer}
          </div>
        )}
      </div>

      {/* 内联关键帧动画 */}
      <style>{`
        @keyframes modal-overlay-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes modal-panel-in {
          from { opacity: 0; transform: scale(0.94) translateY(8px); }
          to   { opacity: 1; transform: scale(1)    translateY(0);   }
        }
      `}</style>
    </div>
  );
};

export default AppModal;
export type { AppModalProps, AppModalVariant };
