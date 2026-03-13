/**
 * 统一的输入框组件
 * 提供与项目其他组件一致的视觉风格和交互体验
 */

import React from 'react';

type AppInputSize = 'xs' | 'sm' | 'md';

interface AppInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  size?: AppInputSize;
  error?: boolean;
}

const sizeClasses: Record<AppInputSize, string> = {
  xs: 'px-2 py-1 text-xs',
  sm: 'px-3 py-2 text-sm',
  md: 'px-4 py-3 text-sm',
};

/**
 * AppInput 组件
 * 
 * @param size - 输入框尺寸: 'xs' | 'sm' | 'md' (默认 'sm')
 * @param error - 是否显示错误状态
 * @param className - 额外的 CSS 类名
 */
const AppInput = React.forwardRef<HTMLInputElement, AppInputProps>(
  ({ size = 'sm', error = false, className = '', style, ...props }, ref) => {
    const [isFocused, setIsFocused] = React.useState(false);

    const focusStyle = isFocused
      ? {
          outline: '2px solid var(--app-active-border)',
          outlineOffset: '0px',
          borderColor: 'var(--app-active-border)',
        }
      : undefined;

    const errorStyle = error
      ? {
          borderColor: 'rgba(239, 68, 68, 0.5)',
          backgroundColor: 'rgba(239, 68, 68, 0.05)',
        }
      : undefined;

    return (
      <input
        ref={ref}
        className={`w-full rounded-lg border outline-none transition-all duration-200 ${sizeClasses[size]} ${className}`}
        style={{
          backgroundColor: 'var(--app-bg)',
          borderColor: 'var(--app-border)',
          color: 'var(--app-text)',
          ...errorStyle,
          ...focusStyle,
          ...style,
        }}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        {...props}
      />
    );
  }
);

AppInput.displayName = 'AppInput';

export default AppInput;
