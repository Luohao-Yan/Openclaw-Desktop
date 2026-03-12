import React from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import AppButton from './AppButton';

type AppSelectSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

type AppSelectOption = {
  description?: string;
  label: string;
  value: string;
};

type AppSelectProps = {
  className?: string;
  emptyText?: string;
  multiple?: boolean;
  onChange: (nextValue: string | string[]) => void;
  options: AppSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  size?: AppSelectSize;
  value: string | string[];
};

type SelectSizeStyle = {
  badgeGapClass: string;
  badgeIconClass: string;
  badgePaddingClass: string;
  badgeTextClass: string;
  badgeRemoveSizeClass: string;
  descriptionClass: string;
  dropdownGapClass: string;
  dropdownMarginTopClass: string;
  emptyClass: string;
  iconClass: string;
  optionCheckClass: string;
  optionDescriptionClass: string;
  optionPaddingClass: string;
  optionTextClass: string;
  optionTitleClass: string;
  panelMaxHeightClass: string;
  panelPaddingClass: string;
  searchIconClass: string;
  searchInputClass: string;
  searchPaddingClass: string;
  sectionPaddingClass: string;
  summaryClass: string;
  triggerPaddingClass: string;
  triggerRadiusClass: string;
  triggerTextClass: string;
};

const selectSizeStyles: Record<AppSelectSize, SelectSizeStyle> = {
  xs: {
    badgeGapClass: 'gap-1.5',
    badgeIconClass: 'w-2.5 h-2.5',
    badgePaddingClass: 'px-2 py-1',
    badgeTextClass: 'text-[11px]',
    badgeRemoveSizeClass: 'h-3.5 w-3.5',
    descriptionClass: 'mt-0.5 text-[11px]',
    dropdownGapClass: 'space-y-1',
    dropdownMarginTopClass: 'mt-2',
    emptyClass: 'px-3 py-4 text-xs',
    iconClass: 'w-3.5 h-3.5',
    optionCheckClass: 'h-5 w-5',
    optionDescriptionClass: 'mt-1 text-[11px] leading-4',
    optionPaddingClass: 'px-2.5 py-2',
    optionTextClass: 'text-[11px]',
    optionTitleClass: 'text-xs',
    panelMaxHeightClass: 'max-h-[220px]',
    panelPaddingClass: 'p-1.5',
    searchIconClass: 'w-3.5 h-3.5',
    searchInputClass: 'py-2 text-xs',
    searchPaddingClass: 'pl-8 pr-3',
    sectionPaddingClass: 'p-2.5',
    summaryClass: 'text-[11px]',
    triggerPaddingClass: 'px-3 py-2.5',
    triggerRadiusClass: 'rounded-xl',
    triggerTextClass: 'text-xs',
  },
  sm: {
    badgeGapClass: 'gap-1.5',
    badgeIconClass: 'w-3 h-3',
    badgePaddingClass: 'px-2.5 py-1.5',
    badgeTextClass: 'text-xs',
    badgeRemoveSizeClass: 'h-4 w-4',
    descriptionClass: 'mt-1 text-[11px]',
    dropdownGapClass: 'space-y-1',
    dropdownMarginTopClass: 'mt-2.5',
    emptyClass: 'px-3 py-5 text-sm',
    iconClass: 'w-4 h-4',
    optionCheckClass: 'h-5 w-5',
    optionDescriptionClass: 'mt-1.5 text-[11px] leading-4',
    optionPaddingClass: 'px-3 py-2.5',
    optionTextClass: 'text-xs',
    optionTitleClass: 'text-sm',
    panelMaxHeightClass: 'max-h-[260px]',
    panelPaddingClass: 'p-2',
    searchIconClass: 'w-4 h-4',
    searchInputClass: 'py-2.5 text-sm',
    searchPaddingClass: 'pl-9 pr-3.5',
    sectionPaddingClass: 'p-3',
    summaryClass: 'text-xs',
    triggerPaddingClass: 'px-3.5 py-2.5',
    triggerRadiusClass: 'rounded-xl',
    triggerTextClass: 'text-sm',
  },
  md: {
    badgeGapClass: 'gap-2',
    badgeIconClass: 'w-3 h-3',
    badgePaddingClass: 'px-3 py-2',
    badgeTextClass: 'text-xs',
    badgeRemoveSizeClass: 'h-4 w-4',
    descriptionClass: 'mt-1 text-xs',
    dropdownGapClass: 'space-y-1',
    dropdownMarginTopClass: 'mt-3',
    emptyClass: 'px-4 py-6 text-sm',
    iconClass: 'w-4 h-4',
    optionCheckClass: 'h-6 w-6',
    optionDescriptionClass: 'mt-2 text-xs leading-5',
    optionPaddingClass: 'px-3 py-3',
    optionTextClass: 'text-xs',
    optionTitleClass: 'text-sm',
    panelMaxHeightClass: 'max-h-[320px]',
    panelPaddingClass: 'p-2',
    searchIconClass: 'w-4 h-4',
    searchInputClass: 'py-2.5 text-sm',
    searchPaddingClass: 'pl-10 pr-4',
    sectionPaddingClass: 'p-3',
    summaryClass: 'text-xs',
    triggerPaddingClass: 'px-4 py-3',
    triggerRadiusClass: 'rounded-2xl',
    triggerTextClass: 'text-sm',
  },
  lg: {
    badgeGapClass: 'gap-2',
    badgeIconClass: 'w-3.5 h-3.5',
    badgePaddingClass: 'px-3.5 py-2',
    badgeTextClass: 'text-sm',
    badgeRemoveSizeClass: 'h-5 w-5',
    descriptionClass: 'mt-1.5 text-sm',
    dropdownGapClass: 'space-y-1.5',
    dropdownMarginTopClass: 'mt-3',
    emptyClass: 'px-4 py-6 text-sm',
    iconClass: 'w-4.5 h-4.5',
    optionCheckClass: 'h-6 w-6',
    optionDescriptionClass: 'mt-2 text-sm leading-5',
    optionPaddingClass: 'px-4 py-3.5',
    optionTextClass: 'text-sm',
    optionTitleClass: 'text-base',
    panelMaxHeightClass: 'max-h-[360px]',
    panelPaddingClass: 'p-2.5',
    searchIconClass: 'w-4.5 h-4.5',
    searchInputClass: 'py-3 text-sm',
    searchPaddingClass: 'pl-11 pr-4',
    sectionPaddingClass: 'p-3.5',
    summaryClass: 'text-sm',
    triggerPaddingClass: 'px-4.5 py-3.5',
    triggerRadiusClass: 'rounded-2xl',
    triggerTextClass: 'text-base',
  },
  xl: {
    badgeGapClass: 'gap-2',
    badgeIconClass: 'w-4 h-4',
    badgePaddingClass: 'px-4 py-2.5',
    badgeTextClass: 'text-sm',
    badgeRemoveSizeClass: 'h-5 w-5',
    descriptionClass: 'mt-2 text-sm',
    dropdownGapClass: 'space-y-2',
    dropdownMarginTopClass: 'mt-4',
    emptyClass: 'px-5 py-7 text-base',
    iconClass: 'w-5 h-5',
    optionCheckClass: 'h-7 w-7',
    optionDescriptionClass: 'mt-2 text-sm leading-6',
    optionPaddingClass: 'px-4 py-4',
    optionTextClass: 'text-sm',
    optionTitleClass: 'text-base',
    panelMaxHeightClass: 'max-h-[420px]',
    panelPaddingClass: 'p-3',
    searchIconClass: 'w-5 h-5',
    searchInputClass: 'py-3.5 text-base',
    searchPaddingClass: 'pl-12 pr-4',
    sectionPaddingClass: 'p-4',
    summaryClass: 'text-sm',
    triggerPaddingClass: 'px-5 py-4',
    triggerRadiusClass: 'rounded-2xl',
    triggerTextClass: 'text-base',
  },
};

const AppSelect: React.FC<AppSelectProps> = ({
  className = '',
  emptyText = '没有匹配的选项。',
  multiple = false,
  onChange,
  options,
  placeholder = '请选择',
  searchPlaceholder = '搜索选项',
  size = 'md',
  value,
}) => {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const sizeStyle = selectSizeStyles[size];

  const selectedValues = React.useMemo(() => {
    if (multiple) {
      return Array.isArray(value) ? value : [];
    }

    return typeof value === 'string' && value ? [value] : [];
  }, [multiple, value]);

  const selectedOptions = React.useMemo(() => options.filter((option) => selectedValues.includes(option.value)), [options, selectedValues]);

  const filteredOptions = React.useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) {
      return options;
    }

    return options.filter((option) => option.label.toLowerCase().includes(keyword)
      || option.value.toLowerCase().includes(keyword)
      || option.description?.toLowerCase().includes(keyword));
  }, [options, search]);

  React.useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [open]);

  const handleSelect = (optionValue: string) => {
    if (multiple) {
      const exists = selectedValues.includes(optionValue);
      const nextValues = exists
        ? selectedValues.filter((item) => item !== optionValue)
        : [...selectedValues, optionValue];
      onChange(nextValues);
      return;
    }

    onChange(optionValue);
    setOpen(false);
  };

  const handleRemove = (optionValue: string) => {
    if (multiple) {
      onChange(selectedValues.filter((item) => item !== optionValue));
      return;
    }

    onChange('');
  };

  const triggerLabel = !selectedOptions.length
    ? placeholder
    : multiple
      ? `已选择 ${selectedOptions.length} 项`
      : selectedOptions[0]?.label || placeholder;

  const triggerDescription = !selectedOptions.length
    ? ''
    : multiple
      ? selectedOptions.map((option) => option.label).join('、')
      : selectedOptions[0]?.value || '';

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`w-full border text-left transition-all duration-200 ${sizeStyle.triggerRadiusClass} ${sizeStyle.triggerPaddingClass}`}
        style={{
          backgroundColor: 'var(--app-bg)',
          borderColor: open ? 'var(--app-active-border)' : 'var(--app-border)',
          color: 'var(--app-text)',
          boxShadow: open
            ? '0 0 0 3px rgba(59, 130, 246, 0.10), 0 10px 24px rgba(15, 23, 42, 0.08)'
            : '0 1px 2px rgba(15, 23, 42, 0.03)',
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className={`truncate font-medium ${sizeStyle.triggerTextClass} ${selectedOptions.length ? '' : 'opacity-70'}`}>
              {triggerLabel}
            </div>
            {triggerDescription ? (
              <div className={`truncate ${sizeStyle.descriptionClass}`} style={{ color: 'var(--app-text-muted)' }}>
                {triggerDescription}
              </div>
            ) : null}
          </div>
          <ChevronDown
            className={`${sizeStyle.iconClass} shrink-0 transition-transform duration-200`}
            style={{
              color: 'var(--app-text-muted)',
              transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            }}
          />
        </div>
      </button>

      {selectedOptions.length ? (
        <div className={`mt-3 flex flex-wrap ${sizeStyle.badgeGapClass}`}>
          {selectedOptions.map((option) => (
            <span
              key={option.value}
              className={`inline-flex max-w-full items-center ${sizeStyle.badgeGapClass} rounded-xl border font-medium ${sizeStyle.badgePaddingClass} ${sizeStyle.badgeTextClass}`}
              style={{
                backgroundColor: 'var(--app-bg-subtle)',
                borderColor: 'var(--app-border)',
                color: 'var(--app-text)',
              }}
            >
              <span className="truncate">{option.label}</span>
              <button
                type="button"
                onClick={() => handleRemove(option.value)}
                className={`inline-flex items-center justify-center rounded-full ${sizeStyle.badgeRemoveSizeClass}`}
                style={{ color: 'var(--app-text-muted)' }}
              >
                <X className={sizeStyle.badgeIconClass} />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      {open ? (
        <div
          className={`absolute left-0 right-0 top-full z-20 border overflow-hidden ${sizeStyle.dropdownMarginTopClass} ${sizeStyle.triggerRadiusClass}`}
          style={{
            backgroundColor: 'var(--app-bg-elevated)',
            borderColor: 'rgba(148, 163, 184, 0.28)',
            boxShadow: '0 18px 40px rgba(15, 23, 42, 0.12), 0 4px 14px rgba(15, 23, 42, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.45)',
          }}
        >
          <div className={`border-b ${sizeStyle.sectionPaddingClass}`} style={{ borderColor: 'rgba(148, 163, 184, 0.18)', backgroundColor: 'var(--app-bg-subtle)' }}>
            <div className="relative">
              <Search className={`${sizeStyle.searchIconClass} absolute left-3 top-1/2 -translate-y-1/2`} style={{ color: 'var(--app-text-muted)' }} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={searchPlaceholder}
                className={`w-full rounded-xl border outline-none ${sizeStyle.searchPaddingClass} ${sizeStyle.searchInputClass}`}
                style={{
                  backgroundColor: 'var(--app-bg)',
                  borderColor: 'rgba(148, 163, 184, 0.24)',
                  color: 'var(--app-text)',
                  boxShadow: 'inset 0 1px 2px rgba(15, 23, 42, 0.03)',
                }}
              />
            </div>
            {multiple && selectedOptions.length ? (
              <div className="mt-3 flex items-center justify-between gap-3">
                <div className={sizeStyle.summaryClass} style={{ color: 'var(--app-text-muted)' }}>
                  已选择 {selectedOptions.length} 项
                </div>
                <AppButton onClick={() => onChange([])} size="sm" variant="secondary">
                  清空已选
                </AppButton>
              </div>
            ) : null}
          </div>

          <div className={`${sizeStyle.panelMaxHeightClass} overflow-auto ${sizeStyle.panelPaddingClass} ${sizeStyle.dropdownGapClass}`}>
            {filteredOptions.length ? filteredOptions.map((option) => {
              const selected = selectedValues.includes(option.value);

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleSelect(option.value)}
                  className={`w-full rounded-xl border text-left transition-all duration-200 ${sizeStyle.optionPaddingClass}`}
                  style={selected
                    ? {
                        background: 'var(--app-selected-card-bg)',
                        borderColor: 'var(--app-selected-card-border)',
                        boxShadow: 'var(--app-selected-card-shadow)',
                        color: 'var(--app-text)',
                      }
                    : {
                        backgroundColor: 'var(--app-bg)',
                        borderColor: 'transparent',
                        color: 'var(--app-text)',
                      }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className={`truncate font-semibold ${sizeStyle.optionTitleClass}`}>{option.label}</div>
                      <div className={`mt-1 truncate ${sizeStyle.optionTextClass}`} style={{ color: 'var(--app-text-muted)' }}>
                        {option.value}
                      </div>
                      {option.description ? (
                        <div className={sizeStyle.optionDescriptionClass} style={{ color: 'var(--app-text-muted)' }}>
                          {option.description}
                        </div>
                      ) : null}
                    </div>
                    <div className="shrink-0 pt-0.5">
                      {selected ? (
                        <span
                          className={`inline-flex items-center justify-center rounded-full ${sizeStyle.optionCheckClass}`}
                          style={{ backgroundColor: 'rgba(59, 130, 246, 0.14)', color: '#2563EB' }}
                        >
                          <Check className={sizeStyle.iconClass} />
                        </span>
                      ) : (
                        <span
                          className={`inline-flex items-center justify-center rounded-full border ${sizeStyle.optionCheckClass}`}
                          style={{ borderColor: 'var(--app-border)', color: 'var(--app-text-muted)' }}
                        />
                      )}
                    </div>
                  </div>
                </button>
              );
            }) : (
              <div className={`rounded-xl border text-center ${sizeStyle.emptyClass}`} style={{ backgroundColor: 'var(--app-bg)', borderColor: 'rgba(148, 163, 184, 0.18)', color: 'var(--app-text-muted)' }}>
                {emptyText}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export type { AppSelectSize };
export type { AppSelectOption };
export default AppSelect;
