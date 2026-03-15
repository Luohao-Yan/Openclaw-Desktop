import React from 'react';
import ReactDOM from 'react-dom';
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

/* 各尺寸样式映射 */
const S: Record<AppSelectSize, SelectSizeStyle> = {
  xs: {
    badgeGapClass: 'gap-1.5', badgeIconClass: 'w-2.5 h-2.5', badgePaddingClass: 'px-2 py-1',
    badgeTextClass: 'text-[11px]', badgeRemoveSizeClass: 'h-3.5 w-3.5', descriptionClass: 'mt-0.5 text-[11px]',
    dropdownGapClass: 'space-y-1', emptyClass: 'px-3 py-4 text-xs',
    iconClass: 'w-3.5 h-3.5', optionCheckClass: 'h-5 w-5', optionDescriptionClass: 'mt-1 text-[11px] leading-4',
    optionPaddingClass: 'px-2.5 py-2', optionTextClass: 'text-[11px]', optionTitleClass: 'text-xs',
    panelMaxHeightClass: 'max-h-[220px]', panelPaddingClass: 'p-1.5', searchIconClass: 'w-3.5 h-3.5',
    searchInputClass: 'py-2 text-xs', searchPaddingClass: 'pl-8 pr-3', sectionPaddingClass: 'p-2.5',
    summaryClass: 'text-[11px]', triggerPaddingClass: 'px-3 py-2.5', triggerRadiusClass: 'rounded-xl',
    triggerTextClass: 'text-xs',
  },
  sm: {
    badgeGapClass: 'gap-1.5', badgeIconClass: 'w-3 h-3', badgePaddingClass: 'px-2.5 py-1.5',
    badgeTextClass: 'text-xs', badgeRemoveSizeClass: 'h-4 w-4', descriptionClass: 'mt-1 text-[11px]',
    dropdownGapClass: 'space-y-1', emptyClass: 'px-3 py-5 text-sm',
    iconClass: 'w-4 h-4', optionCheckClass: 'h-5 w-5', optionDescriptionClass: 'mt-1.5 text-[11px] leading-4',
    optionPaddingClass: 'px-3 py-2.5', optionTextClass: 'text-xs', optionTitleClass: 'text-sm',
    panelMaxHeightClass: 'max-h-[260px]', panelPaddingClass: 'p-2', searchIconClass: 'w-4 h-4',
    searchInputClass: 'py-2.5 text-sm', searchPaddingClass: 'pl-9 pr-3.5', sectionPaddingClass: 'p-3',
    summaryClass: 'text-xs', triggerPaddingClass: 'px-3.5 py-2.5', triggerRadiusClass: 'rounded-xl',
    triggerTextClass: 'text-sm',
  },
  md: {
    badgeGapClass: 'gap-2', badgeIconClass: 'w-3 h-3', badgePaddingClass: 'px-3 py-2',
    badgeTextClass: 'text-xs', badgeRemoveSizeClass: 'h-4 w-4', descriptionClass: 'mt-1 text-xs',
    dropdownGapClass: 'space-y-1', emptyClass: 'px-4 py-6 text-sm',
    iconClass: 'w-4 h-4', optionCheckClass: 'h-6 w-6', optionDescriptionClass: 'mt-2 text-xs leading-5',
    optionPaddingClass: 'px-3 py-3', optionTextClass: 'text-xs', optionTitleClass: 'text-sm',
    panelMaxHeightClass: 'max-h-[320px]', panelPaddingClass: 'p-2', searchIconClass: 'w-4 h-4',
    searchInputClass: 'py-2.5 text-sm', searchPaddingClass: 'pl-10 pr-4', sectionPaddingClass: 'p-3',
    summaryClass: 'text-xs', triggerPaddingClass: 'px-4 py-3', triggerRadiusClass: 'rounded-2xl',
    triggerTextClass: 'text-sm',
  },
  lg: {
    badgeGapClass: 'gap-2', badgeIconClass: 'w-3.5 h-3.5', badgePaddingClass: 'px-3.5 py-2',
    badgeTextClass: 'text-sm', badgeRemoveSizeClass: 'h-5 w-5', descriptionClass: 'mt-1.5 text-sm',
    dropdownGapClass: 'space-y-1.5', emptyClass: 'px-4 py-6 text-sm',
    iconClass: 'w-4.5 h-4.5', optionCheckClass: 'h-6 w-6', optionDescriptionClass: 'mt-2 text-sm leading-5',
    optionPaddingClass: 'px-4 py-3.5', optionTextClass: 'text-sm', optionTitleClass: 'text-base',
    panelMaxHeightClass: 'max-h-[360px]', panelPaddingClass: 'p-2.5', searchIconClass: 'w-4.5 h-4.5',
    searchInputClass: 'py-3 text-sm', searchPaddingClass: 'pl-11 pr-4', sectionPaddingClass: 'p-3.5',
    summaryClass: 'text-sm', triggerPaddingClass: 'px-4.5 py-3.5', triggerRadiusClass: 'rounded-2xl',
    triggerTextClass: 'text-base',
  },
  xl: {
    badgeGapClass: 'gap-2', badgeIconClass: 'w-4 h-4', badgePaddingClass: 'px-4 py-2.5',
    badgeTextClass: 'text-sm', badgeRemoveSizeClass: 'h-5 w-5', descriptionClass: 'mt-2 text-sm',
    dropdownGapClass: 'space-y-2', emptyClass: 'px-5 py-7 text-base',
    iconClass: 'w-5 h-5', optionCheckClass: 'h-7 w-7', optionDescriptionClass: 'mt-2 text-sm leading-6',
    optionPaddingClass: 'px-4 py-4', optionTextClass: 'text-sm', optionTitleClass: 'text-base',
    panelMaxHeightClass: 'max-h-[420px]', panelPaddingClass: 'p-3', searchIconClass: 'w-5 h-5',
    searchInputClass: 'py-3.5 text-base', searchPaddingClass: 'pl-12 pr-4', sectionPaddingClass: 'p-4',
    summaryClass: 'text-sm', triggerPaddingClass: 'px-5 py-4', triggerRadiusClass: 'rounded-2xl',
    triggerTextClass: 'text-base',
  },
};

/**
 * 下拉选项面板（Portal 渲染到 body，避免被父容器 overflow 裁剪）
 * 使用 fixed 定位 + getBoundingClientRect 计算位置
 * 父容器滚动时自动关闭下拉
 */
function DropdownPanel({
  children,
  onClose,
  triggerRef,
  radiusClass,
}: {
  children: React.ReactNode;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  radiusClass: string;
}) {
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const [style, setStyle] = React.useState<React.CSSProperties>({ position: 'fixed', opacity: 0 });

  // 计算面板位置
  const reposition = React.useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // 面板最大高度约 400px，如果下方空间不够则向上展开
    const spaceBelow = window.innerHeight - r.bottom - 8;
    const maxH = 400;
    const openUp = spaceBelow < 200 && r.top > spaceBelow;
    setStyle({
      position: 'fixed',
      left: r.left,
      width: r.width,
      zIndex: 9999,
      opacity: 1,
      ...(openUp
        ? { bottom: window.innerHeight - r.top + 6, maxHeight: Math.min(maxH, r.top - 8) }
        : { top: r.bottom + 6, maxHeight: Math.min(maxH, spaceBelow) }),
    });
  }, [triggerRef]);

  // 初始定位
  React.useEffect(() => {
    reposition();
  }, [reposition]);

  // 父容器滚动时关闭（排除面板内部的滚动）
  React.useEffect(() => {
    const handler = (e: Event) => {
      // 如果滚动发生在下拉面板内部（选项列表滚动），不关闭
      if (panelRef.current?.contains(e.target as Node)) return;
      onClose();
    };
    // 延迟绑定，避免打开瞬间的滚动事件触发关闭
    const timer = setTimeout(() => {
      window.addEventListener('scroll', handler, true);
      window.addEventListener('resize', handler);
    }, 50);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('scroll', handler, true);
      window.removeEventListener('resize', handler);
    };
  }, [onClose]);

  // 点击面板外部关闭
  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose, triggerRef]);

  return ReactDOM.createPortal(
    <div
      ref={panelRef}
      className={`border overflow-hidden ${radiusClass}`}
      style={{
        ...style,
        backgroundColor: 'var(--app-bg-elevated)',
        borderColor: 'rgba(148,163,184,0.28)',
        boxShadow: '0 18px 40px rgba(15,23,42,0.12), 0 4px 14px rgba(15,23,42,0.06), inset 0 1px 0 rgba(255,255,255,0.45)',
      }}
    >
      {children}
    </div>,
    document.body,
  );
}

/**
 * 通用下拉选择组件
 * 支持单选/多选、搜索过滤
 * 下拉面板通过 Portal 渲染到 body，不受父容器 overflow 裁剪
 */
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
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const ss = S[size];

  const selectedValues = React.useMemo(() => {
    if (multiple) return Array.isArray(value) ? value : [];
    return typeof value === 'string' && value ? [value] : [];
  }, [multiple, value]);

  const selectedOptions = React.useMemo(
    () => options.filter((o) => selectedValues.includes(o.value)),
    [options, selectedValues],
  );

  const filteredOptions = React.useMemo(() => {
    const kw = search.trim().toLowerCase();
    if (!kw) return options;
    return options.filter((o) =>
      o.label.toLowerCase().includes(kw)
      || o.value.toLowerCase().includes(kw)
      || o.description?.toLowerCase().includes(kw));
  }, [options, search]);

  // 关闭下拉的回调（稳定引用）
  const closeDropdown = React.useCallback(() => {
    setOpen(false);
    setSearch('');
  }, []);

  const handleSelect = (v: string) => {
    if (multiple) {
      const exists = selectedValues.includes(v);
      onChange(exists ? selectedValues.filter((i) => i !== v) : [...selectedValues, v]);
      return;
    }
    onChange(v);
    closeDropdown();
  };

  const handleRemove = (v: string) => {
    if (multiple) { onChange(selectedValues.filter((i) => i !== v)); return; }
    onChange('');
  };

  const triggerLabel = !selectedOptions.length
    ? placeholder
    : multiple
      ? `已选择 ${selectedOptions.length} 项`
      : selectedOptions[0]?.label || placeholder;

  const triggerDesc = !selectedOptions.length
    ? ''
    : multiple
      ? selectedOptions.map((o) => o.label).join('、')
      : selectedOptions[0]?.value || '';

  return (
    <div className={`relative ${className}`}>
      {/* 触发按钮 */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((c) => !c)}
        className={`w-full border text-left transition-all duration-200 ${ss.triggerRadiusClass} ${ss.triggerPaddingClass}`}
        style={{
          backgroundColor: 'var(--app-bg)',
          borderColor: open ? 'var(--app-active-border)' : 'var(--app-border)',
          color: 'var(--app-text)',
          boxShadow: open
            ? '0 0 0 3px rgba(59,130,246,0.10), 0 10px 24px rgba(15,23,42,0.08)'
            : '0 1px 2px rgba(15,23,42,0.03)',
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className={`truncate font-medium ${ss.triggerTextClass} ${selectedOptions.length ? '' : 'opacity-70'}`}>
              {triggerLabel}
            </div>
            {triggerDesc ? (
              <div className={`truncate ${ss.descriptionClass}`} style={{ color: 'var(--app-text-muted)' }}>
                {triggerDesc}
              </div>
            ) : null}
          </div>
          <ChevronDown
            className={`${ss.iconClass} shrink-0 mr-1 transition-transform duration-200`}
            style={{ color: 'var(--app-text-muted)', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
          />
        </div>
      </button>

      {/* 已选标签 */}
      {selectedOptions.length ? (
        <div className={`mt-3 flex flex-wrap ${ss.badgeGapClass}`}>
          {selectedOptions.map((opt) => (
            <span key={opt.value}
              className={`inline-flex max-w-full items-center ${ss.badgeGapClass} rounded-xl border font-medium ${ss.badgePaddingClass} ${ss.badgeTextClass}`}
              style={{ backgroundColor: 'var(--app-bg-subtle)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
            >
              <span className="truncate">{opt.label}</span>
              <button type="button" onClick={() => handleRemove(opt.value)}
                className={`inline-flex items-center justify-center rounded-full ${ss.badgeRemoveSizeClass}`}
                style={{ color: 'var(--app-text-muted)' }}
              ><X className={ss.badgeIconClass} /></button>
            </span>
          ))}
        </div>
      ) : null}

      {/* 下拉面板（Portal 渲染） */}
      {open ? (
        <DropdownPanel triggerRef={triggerRef} onClose={closeDropdown} radiusClass={ss.triggerRadiusClass}>
          {/* 搜索栏 */}
          <div className={`border-b ${ss.sectionPaddingClass}`} style={{ borderColor: 'rgba(148,163,184,0.18)', backgroundColor: 'var(--app-bg-subtle)' }}>
            <div className="relative">
              <Search className={`${ss.searchIconClass} absolute left-3 top-1/2 -translate-y-1/2`} style={{ color: 'var(--app-text-muted)' }} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={searchPlaceholder}
                className={`w-full rounded-xl border outline-none ${ss.searchPaddingClass} ${ss.searchInputClass}`}
                style={{ backgroundColor: 'var(--app-bg)', borderColor: 'rgba(148,163,184,0.24)', color: 'var(--app-text)', boxShadow: 'inset 0 1px 2px rgba(15,23,42,0.03)' }}
              />
            </div>
            {multiple && selectedOptions.length ? (
              <div className="mt-3 flex items-center justify-between gap-3">
                <div className={ss.summaryClass} style={{ color: 'var(--app-text-muted)' }}>已选择 {selectedOptions.length} 项</div>
                <AppButton onClick={() => onChange([])} size="sm" variant="secondary">清空已选</AppButton>
              </div>
            ) : null}
          </div>
          {/* 选项列表 */}
          <div className={`overflow-auto ${ss.panelPaddingClass} ${ss.dropdownGapClass}`} style={{ maxHeight: '320px' }}>
            {filteredOptions.length ? filteredOptions.map((opt) => {
              const sel = selectedValues.includes(opt.value);
              return (
                <button key={opt.value} type="button" onClick={() => handleSelect(opt.value)}
                  className={`w-full rounded-xl border text-left transition-all duration-200 ${ss.optionPaddingClass}`}
                  style={sel
                    ? { background: 'var(--app-selected-card-bg)', borderColor: 'var(--app-selected-card-border)', boxShadow: 'var(--app-selected-card-shadow)', color: 'var(--app-text)' }
                    : { backgroundColor: 'var(--app-bg)', borderColor: 'transparent', color: 'var(--app-text)' }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className={`truncate font-semibold ${ss.optionTitleClass}`}>{opt.label}</div>
                      <div className={`mt-1 truncate ${ss.optionTextClass}`} style={{ color: 'var(--app-text-muted)' }}>{opt.value}</div>
                      {opt.description ? <div className={ss.optionDescriptionClass} style={{ color: 'var(--app-text-muted)' }}>{opt.description}</div> : null}
                    </div>
                    <div className="shrink-0 pt-0.5">
                      {sel ? (
                        <span className={`inline-flex items-center justify-center rounded-full ${ss.optionCheckClass}`}
                          style={{ backgroundColor: 'rgba(59,130,246,0.14)', color: '#2563EB' }}>
                          <Check className={ss.iconClass} />
                        </span>
                      ) : (
                        <span className={`inline-flex items-center justify-center rounded-full border ${ss.optionCheckClass}`}
                          style={{ borderColor: 'var(--app-border)', color: 'var(--app-text-muted)' }} />
                      )}
                    </div>
                  </div>
                </button>
              );
            }) : (
              <div className={`rounded-xl border text-center ${ss.emptyClass}`}
                style={{ backgroundColor: 'var(--app-bg)', borderColor: 'rgba(148,163,184,0.18)', color: 'var(--app-text-muted)' }}>
                {emptyText}
              </div>
            )}
          </div>
        </DropdownPanel>
      ) : null}
    </div>
  );
};

export type { AppSelectSize };
export type { AppSelectOption };
export default AppSelect;