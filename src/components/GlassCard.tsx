import React from 'react';

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'elevated' | 'status' | 'gradient';
  statusColor?: 'green' | 'red' | 'yellow' | 'blue' | 'purple';
  onClick?: () => void;
}

const GlassCard: React.FC<GlassCardProps> = ({
  children,
  className = '',
  variant = 'default',
  statusColor,
  onClick,
}) => {
  const baseClasses = 'relative overflow-hidden transition-all duration-300';

  const variantClasses = {
    default: `
      bg-white/5 backdrop-blur-xl
      border border-white/10
      rounded-2xl p-6
      hover:bg-white/8 hover:border-white/20
    `,
    elevated: `
      bg-gradient-to-br from-white/10 to-white/5
      backdrop-blur-xl
      border border-white/20
      rounded-2xl p-6
      shadow-xl
    `,
    status: `
      backdrop-blur-xl
      rounded-2xl p-6
    `,
    gradient: `
      bg-gradient-to-br from-tech-cyan/20 to-tech-green/10
      border border-tech-cyan/30
      rounded-2xl p-6
    `,
  };

  const statusClasses = {
    green: 'bg-gradient-to-r from-tech-green/20 to-tech-teal/10 border-tech-green/30',
    red: 'bg-gradient-to-r from-red-500/20 to-orange-500/10 border-red-500/30',
    yellow: 'bg-gradient-to-r from-yellow-500/20 to-amber-500/10 border-yellow-500/30',
    blue: 'bg-gradient-to-r from-tech-cyan/20 to-tech-aqua/10 border-tech-cyan/30',
    purple: 'bg-gradient-to-r from-tech-teal/20 to-tech-mint/10 border-tech-teal/30',
  };

  const getVariantClass = () => {
    if (variant === 'status' && statusColor) {
      return `${variantClasses[variant]} ${statusClasses[statusColor]}`;
    }
    return variantClasses[variant];
  };

  return (
    <div
      className={`${baseClasses} ${getVariantClass()} ${className} ${
        onClick ? 'cursor-pointer hover:scale-[1.01]' : ''
      }`}
      style={variant === 'default'
        ? {
            backgroundColor: 'var(--app-bg-subtle)',
            border: '1px solid var(--app-border)',
          }
        : variant === 'elevated'
          ? {
              background: 'linear-gradient(135deg, var(--app-bg-subtle) 0%, transparent 100%)',
              border: '1px solid var(--app-border)',
            }
          : undefined}
      onClick={onClick}
    >
      {/* 装饰性光晕 */}
      {(variant === 'status' || variant === 'gradient') && statusColor && (
        <div
          className={`absolute top-0 right-0 w-24 h-24 rounded-full blur-3xl opacity-30 pointer-events-none`}
          style={{
            background: `var(--neon-${statusColor}, #A855F7)`,
          }}
        />
      )}

      {/* 渐变叠加层 */}
      {variant === 'gradient' && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, transparent 50%)',
          }}
        />
      )}

      <div className="relative z-10">{children}</div>
    </div>
  );
};

export default GlassCard;