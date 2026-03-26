import React from 'react';

interface ToggleRowProps {
  checked: boolean;
  description: string;
  disabled?: boolean;
  label: string;
  onChange: (value: boolean) => void;
}

const ToggleRow: React.FC<ToggleRowProps> = ({
  checked,
  description,
  disabled = false,
  label,
  onChange,
}) => {
  return (
    <label className={`flex items-start gap-3 ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
      <button
        type="button"
        aria-pressed={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-token-normal"
        style={checked
          ? {
              backgroundColor: 'var(--app-active-bg)',
              borderColor: 'var(--app-active-border)',
              color: 'var(--app-active-text)',
            }
          : {
              backgroundColor: 'var(--app-bg-subtle)',
              borderColor: 'var(--app-border)',
              color: 'transparent',
            }}
      >
        <span className="text-sm font-bold leading-none">✓</span>
      </button>

      <div className="min-w-0">
        <div className="text-lg font-medium leading-6" style={{ color: 'var(--app-text)' }}>
          {label}
        </div>
        <div className="mt-1 text-sm leading-5" style={{ color: 'var(--app-text-muted)' }}>
          {description}
        </div>
      </div>
    </label>
  );
};

export default ToggleRow;
