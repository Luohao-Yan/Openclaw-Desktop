import React from 'react';

export interface SegmentedTabItem<T extends string> {
  icon?: React.ReactNode;
  key: T;
  label: string;
}

interface SegmentedTabsProps<T extends string> {
  className?: string;
  items: SegmentedTabItem<T>[];
  onChange: (key: T) => void;
  value: T;
}

const SegmentedTabs = <T extends string>({
  className = '',
  items,
  onChange,
  value,
}: SegmentedTabsProps<T>) => {
  return (
    <div
      className={`inline-flex items-center gap-1 rounded-2xl p-1 ${className}`}
      style={{
        background: 'var(--app-segment-container-bg)',
        border: '1px solid var(--app-segment-container-border)',
      }}
    >
      {items.map((item) => {
        const active = item.key === value;

        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onChange(item.key)}
            className="inline-flex items-center whitespace-nowrap rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200"
            style={active
              ? {
                  background: 'var(--app-segment-tab-active-bg)',
                  border: '1px solid var(--app-segment-tab-active-border)',
                  color: 'var(--app-segment-tab-active-text)',
                  boxShadow: 'var(--app-segment-tab-active-shadow)',
                }
              : {
                  backgroundColor: 'transparent',
                  border: '1px solid transparent',
                  color: 'var(--app-segment-tab-inactive-text)',
                }}
          >
            {item.icon ? <span className="mr-2 inline-flex items-center">{item.icon}</span> : null}
            {item.label}
          </button>
        );
      })}
    </div>
  );
};

export default SegmentedTabs;
