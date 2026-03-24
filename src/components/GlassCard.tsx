import React from 'react';

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'elevated' | 'status' | 'gradient';
  statusColor?: 'green' | 'red' | 'yellow' | 'blue' | 'purple';
  onClick?: () => void;
  style?: React.CSSProperties;
}

const GlassCard: React.FC<GlassCardProps> = ({
  children,
  className = '',
  variant = 'default',
  statusColor,
  onClick,
  style,
  ...props
}) => {
  const baseClasses = 'relative overflow-hidden transition-all duration-300';

  /* 各 variant 的基础 Tailwind 类 */
  const variantClasses = {
    /* 默认：玻璃液态，半透明背景 + backdrop-blur */
    default: 'backdrop-blur-xl rounded-2xl p-6',
    /* 提升：更强的渐变 + 阴影 */
    elevated: 'backdrop-blur-xl rounded-2xl p-6 shadow-xl',
    /* 状态：由 statusColor 决定背景 */
    status: 'backdrop-blur-xl rounded-2xl p-6',
    /* 渐变：彩色渐变背景 */
    gradient: 'backdrop-blur-xl rounded-2xl p-6',
  };

  /* status variant 的颜色映射 */
  const statusStyles: Record<string, React.CSSProperties> = {
    green: {
      background: 'linear-gradient(135deg, rgba(52,211,153,0.14) 0%, rgba(16,185,129,0.08) 100%)',
      border: '1px solid rgba(52,211,153,0.22)',
    },
    red: {
      background: 'linear-gradient(135deg, rgba(239,68,68,0.14) 0%, rgba(220,38,38,0.08) 100%)',
      border: '1px solid rgba(239,68,68,0.22)',
    },
    yellow: {
      background: 'linear-gradient(135deg, rgba(251,191,36,0.14) 0%, rgba(245,158,11,0.08) 100%)',
      border: '1px solid rgba(251,191,36,0.22)',
    },
    blue: {
      background: 'linear-gradient(135deg, rgba(96,165,250,0.14) 0%, rgba(59,130,246,0.08) 100%)',
      border: '1px solid rgba(96,165,250,0.22)',
    },
    purple: {
      background: 'linear-gradient(135deg, rgba(167,139,250,0.14) 0%, rgba(139,92,246,0.08) 100%)',
      border: '1px solid rgba(167,139,250,0.22)',
    },
  };

  /* 根据 variant 计算内联 style */
  const getInlineStyle = (): React.CSSProperties => {
    if (variant === 'default') {
      return {
        /* 玻璃液态：使用主题感知 CSS 自定义属性，浅色/暗色主题自动适配 */
        background: 'var(--app-glass-bg)',
        border: '1px solid var(--app-border)',
        ...style,
      };
    }
    if (variant === 'elevated') {
      return {
        /* 提升变体：使用主题感知 CSS 自定义属性 */
        background: 'var(--app-glass-elevated-bg)',
        border: '1px solid var(--app-glass-elevated-border)',
        ...style,
      };
    }
    if (variant === 'status' && statusColor) {
      return { ...statusStyles[statusColor], ...style };
    }
    if (variant === 'gradient') {
      return {
        background: 'linear-gradient(135deg, rgba(99,102,241,0.14) 0%, rgba(139,92,246,0.08) 100%)',
        border: '1px solid rgba(99,102,241,0.22)',
        ...style,
      };
    }
    return { ...style };
  };

  return (
    <div
      className={`${baseClasses} ${variantClasses[variant]} ${className} ${
        onClick ? 'cursor-pointer hover:scale-[1.01]' : ''
      }`}
      style={getInlineStyle()}
      onClick={onClick}
      {...props}
    >
      {/* status / gradient variant 的右上角装饰光晕 */}
      {(variant === 'status' || variant === 'gradient') && statusColor && (
        <div
          className="absolute -right-6 -top-6 h-24 w-24 rounded-full blur-3xl opacity-25 pointer-events-none"
          style={{
            backgroundColor: statusColor === 'green' ? '#34d399'
              : statusColor === 'red' ? '#f87171'
              : statusColor === 'yellow' ? '#fbbf24'
              : statusColor === 'blue' ? '#60a5fa'
              : '#a78bfa',
          }}
        />
      )}

      {/* gradient variant 的高光叠加层 */}
      {variant === 'gradient' && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, transparent 60%)',
          }}
        />
      )}

      <div className="relative z-10">{children}</div>
    </div>
  );
};

export default GlassCard;
