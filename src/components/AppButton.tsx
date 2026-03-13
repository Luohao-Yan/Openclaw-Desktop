import React from 'react';

type AppButtonVariant = 'primary' | 'secondary' | 'danger' | 'success';

type AppButtonSize = 'xs' | 'sm' | 'md';

interface AppButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  className?: string;
  icon?: React.ReactNode;
  variant?: AppButtonVariant;
  size?: AppButtonSize;
}

const hoverStyles: Record<AppButtonVariant, React.CSSProperties> = {
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
};

const activeStyles: Record<AppButtonVariant, React.CSSProperties> = {
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
};

const variantStyles: Record<AppButtonVariant, React.CSSProperties> = {
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
};

const sizeClasses: Record<AppButtonSize, string> = {
  xs: 'px-2 py-1 text-xs',
  sm: 'px-3 py-2 text-sm',
  md: 'px-4 py-2 text-sm',
};

const AppButton: React.FC<AppButtonProps> = ({
  children,
  className = '',
  disabled = false,
  icon,
  size = 'md',
  style,
  type = 'button',
  variant = 'secondary',
  ...props
}) => {
  const [isHovered, setIsHovered] = React.useState(false);
  const [isPressed, setIsPressed] = React.useState(false);
  const [isFocused, setIsFocused] = React.useState(false);

  const interactionStyle = disabled
    ? undefined
    : isPressed
      ? activeStyles[variant]
      : isHovered
        ? hoverStyles[variant]
        : undefined;

  const focusStyle = disabled || !isFocused
    ? undefined
    : {
        outline: '2px solid var(--app-active-border)',
        outlineOffset: '2px',
      };

  return (
    <button
      type={type}
      disabled={disabled}
      className={`inline-flex items-center justify-center whitespace-nowrap rounded-lg font-medium transition-all duration-200 will-change-transform cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${sizeClasses[size]} ${className}`}
      style={{
        ...variantStyles[variant],
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
      {icon ? <span className="mr-2 inline-flex items-center">{icon}</span> : null}
      {children}
    </button>
  );
};

export default AppButton;
