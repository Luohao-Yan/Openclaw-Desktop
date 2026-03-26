import React from 'react';

interface AppIconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  className?: string;
  tint?: 'default' | 'blue' | 'purple';
}

const tintStyles: Record<NonNullable<AppIconButtonProps['tint']>, React.CSSProperties> = {
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

const AppIconButton: React.FC<AppIconButtonProps> = ({
  children,
  className = '',
  disabled = false,
  style,
  tint = 'default',
  type = 'button',
  ...props
}) => {
  const [isHovered, setIsHovered] = React.useState(false);
  const [isPressed, setIsPressed] = React.useState(false);
  const [isFocused, setIsFocused] = React.useState(false);

  const interactionStyle = disabled
    ? undefined
    : isPressed
      ? {
          transform: 'translateY(0)',
          boxShadow: '0 4px 10px rgba(15, 23, 42, 0.06)',
          filter: 'brightness(1)',
        }
      : isHovered
        ? {
            transform: 'translateY(-1px)',
            boxShadow: '0 10px 22px rgba(15, 23, 42, 0.10)',
            filter: 'brightness(1.04)',
          }
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
      className={`inline-flex items-center justify-center rounded-lg p-2 transition-token-normal will-change-transform cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      style={{
        ...tintStyles[tint],
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
      {children}
    </button>
  );
};

export default AppIconButton;
