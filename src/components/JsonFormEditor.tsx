import React from 'react';
import { X } from 'lucide-react';
import AppButton from './AppButton';
import SegmentedTabs from './SegmentedTabs';

type JsonPrimitive = string | number | boolean | null;

type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

type JsonFieldOption = {
  label: string;
  value: string;
};

type JsonFieldControl = 'text' | 'textarea' | 'switch' | 'select';

export type JsonFormFieldSchema = {
  control?: JsonFieldControl;
  description?: string;
  label?: string;
  options?: JsonFieldOption[];
  placeholder?: string;
  readOnly?: boolean;
};

export type JsonFormSchema = Record<string, JsonFormFieldSchema>;

export type JsonFormTabItem = {
  key: string;
  label: string;
  emptyHint?: string; // 当该 tab 对应的值为 null/undefined/空对象时显示的提示文案
};

type JsonFormEditorProps = {
  className?: string;
  emptyText?: string;
  onChange: (nextValue: any) => void;
  rawPreviewTitle?: string;
  schema?: JsonFormSchema;
  showRawPreview?: boolean;
  tabs?: JsonFormTabItem[];
  value: any;
};

const getPathKey = (path: Array<string | number>) => path.join('.');

const matchesSearch = (label: string, search: string) => !search
  || label.toLowerCase().includes(search.toLowerCase());

const hasSearchMatch = (label: string, value: any, search: string): boolean => {
  if (!search) {
    return true;
  }

  if (matchesSearch(label, search)) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.some((item, index) => hasSearchMatch(`${label}.${index}`, item, search));
  }

  if (value && typeof value === 'object') {
    return Object.entries(value).some(([key, childValue]) => hasSearchMatch(`${label}.${key}`, childValue, search));
  }

  return String(value ?? '').toLowerCase().includes(search.toLowerCase());
};

const getValueTypeLabel = (value: any) => {
  if (Array.isArray(value)) {
    return `数组 · ${value.length} 项`;
  }

  if (value === null) {
    return '空值';
  }

  if (typeof value === 'object') {
    return `对象 · ${Object.keys(value).length} 个字段`;
  }

  if (typeof value === 'boolean') {
    return '布尔值';
  }

  if (typeof value === 'number') {
    return '数字';
  }

  return '文本';
};

const shouldDefaultCollapse = (value: any) => {
  if (Array.isArray(value)) {
    return value.length > 4;
  }

  if (value && typeof value === 'object') {
    return Object.keys(value).length > 4;
  }

  return false;
};

const getValueAtPath = (source: any, path: Array<string | number>) => path.reduce((current, key) => current?.[key], source);

const updateJsonValueByPath = (source: any, path: Array<string | number>, nextValue: string | boolean) => {
  const nextSource = Array.isArray(source) ? [...source] : { ...source };
  let cursor = nextSource;

  for (let index = 0; index < path.length - 1; index += 1) {
    const key = path[index];
    const nextCursor = cursor[key];
    cursor[key] = Array.isArray(nextCursor) ? [...nextCursor] : { ...nextCursor };
    cursor = cursor[key];
  }

  const leafKey = path[path.length - 1];
  const currentValue = cursor[leafKey];

  if (typeof nextValue === 'boolean') {
    cursor[leafKey] = nextValue;
    return nextSource;
  }

  if (typeof currentValue === 'number') {
    cursor[leafKey] = Number(nextValue);
  } else if (typeof currentValue === 'boolean') {
    cursor[leafKey] = nextValue === 'true';
  } else if (currentValue === null) {
    cursor[leafKey] = nextValue === '' ? null : nextValue;
  } else {
    cursor[leafKey] = nextValue;
  }

  return nextSource;
};

const replaceNumericSegments = (pathKey: string) => pathKey.replace(/\.(\d+)(?=\.|$)/g, '.*');

const humanizeKey = (key: string) => key
  .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  .replace(/[_-]+/g, ' ')
  .replace(/^./, (char) => char.toUpperCase());

const JsonFormEditor: React.FC<JsonFormEditorProps> = ({
  className = '',
  emptyText = '当前没有可展示的配置分组。',
  onChange,
  rawPreviewTitle = '原始配置',
  schema = {},
  showRawPreview = false,
  tabs,
  value,
}) => {
  const [activeTab, setActiveTab] = React.useState<string>(tabs?.[0]?.key || '');
  const [search, setSearch] = React.useState('');
  const [collapsedPaths, setCollapsedPaths] = React.useState<Record<string, boolean>>({});
  const [rawPreviewOpen, setRawPreviewOpen] = React.useState(false);

  React.useEffect(() => {
    if (!tabs?.length) {
      setActiveTab('');
      return;
    }

    setActiveTab((current) => tabs.some((item) => item.key === current) ? current : tabs[0].key);
  }, [tabs]);

  const resolveSchema = React.useCallback((path: Array<string | number>) => {
    const pathKey = getPathKey(path);
    const wildcardPathKey = replaceNumericSegments(pathKey);
    return schema[pathKey] || schema[wildcardPathKey] || undefined;
  }, [schema]);

  const togglePath = React.useCallback((pathKey: string) => {
    setCollapsedPaths((current) => ({
      ...current,
      [pathKey]: !(current[pathKey] ?? false),
    }));
  }, []);

  const setExpandStateForValue = React.useCallback((target: any, path: Array<string | number>, collapsed: boolean, nextState: Record<string, boolean>) => {
    if (!target || typeof target !== 'object') {
      return;
    }

    nextState[getPathKey(path)] = collapsed;

    if (Array.isArray(target)) {
      target.forEach((item, index) => {
        setExpandStateForValue(item, [...path, index], collapsed, nextState);
      });
      return;
    }

    Object.entries(target).forEach(([key, childValue]) => {
      if (childValue && typeof childValue === 'object') {
        setExpandStateForValue(childValue, [...path, key], collapsed, nextState);
      }
    });
  }, []);

  const handleExpandAll = React.useCallback(() => {
    const nextState: Record<string, boolean> = {};
    if (activeTab) {
      setExpandStateForValue(getValueAtPath(value, [activeTab]), [activeTab], false, nextState);
    }
    setCollapsedPaths((current) => ({ ...current, ...nextState }));
  }, [activeTab, setExpandStateForValue, value]);

  const handleCollapseAll = React.useCallback(() => {
    const nextState: Record<string, boolean> = {};
    if (activeTab) {
      setExpandStateForValue(getValueAtPath(value, [activeTab]), [activeTab], true, nextState);
    }
    setCollapsedPaths((current) => ({ ...current, ...nextState }));
  }, [activeTab, setExpandStateForValue, value]);

  const renderPrimitiveEditor = React.useCallback((fieldValue: JsonPrimitive, path: Array<string | number>) => {
    const fieldSchema = resolveSchema(path);
    const control = fieldSchema?.control || (typeof fieldValue === 'boolean' ? 'switch' : 'text');
    const readOnly = fieldSchema?.readOnly;

    if (control === 'switch') {
      const checked = Boolean(fieldValue);
      return (
        <button
          type="button"
          onClick={() => !readOnly && onChange(updateJsonValueByPath(value, path, !checked))}
          disabled={readOnly}
          className="inline-flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-sm transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
          style={{
            backgroundColor: checked ? 'rgba(16, 185, 129, 0.12)' : 'var(--app-bg-elevated)',
            borderColor: checked ? 'rgba(16, 185, 129, 0.22)' : 'var(--app-border)',
            color: 'var(--app-text)',
          }}
        >
          <span>{checked ? '已开启' : '已关闭'}</span>
          <span
            className="inline-flex h-6 w-11 items-center rounded-full px-1 transition-all duration-200"
            style={{
              backgroundColor: checked ? '#10B981' : 'rgba(148, 163, 184, 0.35)',
              justifyContent: checked ? 'flex-end' : 'flex-start',
            }}
          >
            <span className="h-4 w-4 rounded-full bg-white shadow-sm" />
          </span>
        </button>
      );
    }

    if (control === 'select' && fieldSchema?.options?.length) {
      return (
        <select
          value={fieldValue === null ? '' : String(fieldValue)}
          disabled={readOnly}
          onChange={(event) => onChange(updateJsonValueByPath(value, path, event.target.value))}
          className="w-full rounded-lg px-3 py-2 outline-none text-sm"
          style={{
            backgroundColor: 'var(--app-bg-elevated)',
            border: '1px solid var(--app-border)',
            color: 'var(--app-text)',
            minHeight: '38px',
          }}
        >
          {fieldSchema.placeholder ? <option value="">{fieldSchema.placeholder}</option> : null}
          {fieldSchema.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    }

    if (control === 'textarea') {
      return (
        <textarea
          value={fieldValue === null ? '' : String(fieldValue)}
          disabled={readOnly}
          onChange={(event) => onChange(updateJsonValueByPath(value, path, event.target.value))}
          placeholder={fieldSchema?.placeholder}
          className="w-full rounded-lg px-3 py-2 outline-none text-sm resize-y min-h-[96px]"
          style={{
            backgroundColor: 'var(--app-bg-elevated)',
            border: '1px solid var(--app-border)',
            color: 'var(--app-text)',
          }}
        />
      );
    }

    return (
      <input
        value={fieldValue === null ? '' : String(fieldValue)}
        disabled={readOnly}
        onChange={(event) => onChange(updateJsonValueByPath(value, path, event.target.value))}
        placeholder={fieldSchema?.placeholder}
        className="w-full rounded-lg px-3 py-2 outline-none text-sm"
        style={{
          backgroundColor: 'var(--app-bg-elevated)',
          border: '1px solid var(--app-border)',
          color: 'var(--app-text)',
          minHeight: '38px',
        }}
      />
    );
  }, [onChange, resolveSchema, value]);

  const renderNode = React.useCallback((
    nodeValue: JsonValue,
    path: Array<string | number> = [],
    depth = 0,
    showObjectMeta = true,
  ): React.ReactNode => {
    if (Array.isArray(nodeValue)) {
      const pathKey = getPathKey(path);
      const autoExpanded = search && hasSearchMatch(pathKey, nodeValue, search);
      const collapsed = autoExpanded ? false : (collapsedPaths[pathKey] ?? shouldDefaultCollapse(nodeValue));
      const visibleItems = search
        ? nodeValue.filter((item, index) => hasSearchMatch(`${pathKey}.${index}`, item, search))
        : nodeValue;

      if (!visibleItems.length && search) {
        return null;
      }

      return (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs" style={{ color: 'var(--app-text-muted)' }}>
              {getValueTypeLabel(nodeValue)}
            </div>
            <button
              type="button"
              onClick={() => togglePath(pathKey)}
              className="text-xs px-3 py-1 rounded-lg border transition-all duration-200"
              style={{ backgroundColor: 'var(--app-bg-elevated)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
            >
              {collapsed ? '展开' : '折叠'}
            </button>
          </div>
          {!collapsed && visibleItems.map((item, index) => (
            <div key={`${path.join('.')}-${index}`} className="rounded-xl border p-3" style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)' }}>
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="font-medium" style={{ color: 'var(--app-text)' }}>#{index}</div>
                <div className="text-xs" style={{ color: 'var(--app-text-muted)' }}>
                  {getValueTypeLabel(item)}
                </div>
              </div>
              {renderNode(item as JsonValue, [...path, index], depth + 1)}
            </div>
          ))}
        </div>
      );
    }

    if (nodeValue && typeof nodeValue === 'object') {
      const pathKey = getPathKey(path);
      const autoExpanded = search && hasSearchMatch(pathKey, nodeValue, search);
      const collapsed = autoExpanded ? false : (collapsedPaths[pathKey] ?? (depth > 0 && shouldDefaultCollapse(nodeValue)));
      const visibleEntries = Object.entries(nodeValue).filter(([key, childValue]) => hasSearchMatch(key, childValue, search));

      if (!visibleEntries.length && search) {
        return null;
      }

      return (
        <div className="space-y-2">
          {depth > 0 && showObjectMeta && (
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs" style={{ color: 'var(--app-text-muted)' }}>
                {getValueTypeLabel(nodeValue)}
              </div>
              <button
                type="button"
                onClick={() => togglePath(pathKey)}
                className="text-xs px-3 py-1 rounded-lg border transition-all duration-200"
                style={{ backgroundColor: 'var(--app-bg-elevated)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
              >
                {collapsed ? '展开' : '折叠'}
              </button>
            </div>
          )}
          {!collapsed && visibleEntries.map(([key, childValue]) => {
            const fieldPath = [...path, key];
            const fieldSchema = resolveSchema(fieldPath);
            const label = fieldSchema?.label || humanizeKey(key);
            const description = fieldSchema?.description;

            return (
              <div key={`${path.join('.')}-${key}`} className="rounded-xl border" style={{ backgroundColor: 'var(--app-bg)', borderColor: 'var(--app-border)' }}>
                {childValue && typeof childValue === 'object' ? (
                  <div className="p-3 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold break-all leading-5" style={{ color: 'var(--app-text)' }}>{label}</div>
                        <div className="text-xs mt-1" style={{ color: 'var(--app-text-muted)' }}>
                          {description || getValueTypeLabel(childValue)}
                        </div>
                      </div>
                    </div>
                    {renderNode(childValue as JsonValue, fieldPath, depth + 1, false)}
                  </div>
                ) : (
                  <div className="grid grid-cols-[180px_minmax(0,1fr)] gap-3 items-center p-3">
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium break-all leading-5" style={{ color: 'var(--app-text)' }}>{label}</div>
                      <div className="text-[11px] mt-0.5" style={{ color: 'var(--app-text-muted)' }}>
                        {description || getValueTypeLabel(childValue)}
                      </div>
                    </div>
                    <div className="min-w-0">
                      {renderPrimitiveEditor(childValue as JsonPrimitive, fieldPath)}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      );
    }

    if (search && !matchesSearch(getPathKey(path), search) && !String(nodeValue ?? '').toLowerCase().includes(search.toLowerCase())) {
      return null;
    }

    return renderPrimitiveEditor(nodeValue as JsonPrimitive, path);
  }, [collapsedPaths, renderPrimitiveEditor, resolveSchema, search, togglePath]);

  const visibleTabs = React.useMemo(() => {
    if (!tabs?.length) {
      return [] as JsonFormTabItem[];
    }

    return tabs.filter((tab) => hasSearchMatch(tab.label, value?.[tab.key], search));
  }, [search, tabs, value]);

  const currentSectionValue = activeTab ? getValueAtPath(value, [activeTab]) : value;

  // 判断当前 tab 内容是否为空（null / undefined / 空对象）
  const isCurrentSectionEmpty = currentSectionValue === undefined
    || currentSectionValue === null
    || (typeof currentSectionValue === 'object' && !Array.isArray(currentSectionValue) && Object.keys(currentSectionValue).length === 0);

  // 获取当前 tab 的空状态提示文案
  const activeTabEmptyHint = tabs?.find((item) => item.key === activeTab)?.emptyHint;

  return (
    <div className={`h-full min-h-0 overflow-hidden flex flex-col ${className}`}>
      <div className="flex items-center justify-between gap-4 border-b px-6 py-4" style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-bg-subtle)' }}>
        <div className="min-w-0 flex-1">
          {visibleTabs.length ? (
            <SegmentedTabs
              items={visibleTabs}
              onChange={setActiveTab}
              value={activeTab}
            />
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {showRawPreview ? (
            <AppButton onClick={() => setRawPreviewOpen(true)} size="sm" variant="secondary">
              查看原始配置
            </AppButton>
          ) : null}
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜索字段 / 值"
            className="w-[220px] rounded-xl px-4 py-2.5 outline-none text-sm"
            style={{
              backgroundColor: 'var(--app-bg)',
              border: '1px solid var(--app-border)',
              color: 'var(--app-text)',
            }}
          />
          <AppButton onClick={handleExpandAll} size="sm" variant="secondary">全部展开</AppButton>
          <AppButton onClick={handleCollapseAll} size="sm" variant="secondary">全部折叠</AppButton>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-6">
        {isCurrentSectionEmpty && activeTabEmptyHint ? (
          /* 当前 tab 内容为空且配置了 emptyHint 时，显示友好的空状态提示 */
          <div className="rounded-2xl border p-6" style={{ backgroundColor: 'var(--app-bg-subtle)', borderColor: 'var(--app-border)' }}>
            <div className="text-sm leading-relaxed whitespace-pre-line" style={{ color: 'var(--app-text-muted)' }}>
              {activeTabEmptyHint}
            </div>
          </div>
        ) : currentSectionValue !== undefined && currentSectionValue !== null ? (
          <div className="space-y-3 pb-6">
            {visibleTabs.length ? (
              <div className="rounded-xl border p-3" style={{ backgroundColor: 'var(--app-bg-subtle)', borderColor: 'var(--app-border)' }}>
                <div className="text-sm" style={{ color: 'var(--app-text-muted)' }}>当前分组</div>
                <div className="mt-1 text-lg font-semibold break-all" style={{ color: 'var(--app-text)' }}>
                  {tabs?.find((item) => item.key === activeTab)?.label || activeTab}
                </div>
              </div>
            ) : null}
            {renderNode(currentSectionValue as JsonValue, activeTab ? [activeTab] : [])}
          </div>
        ) : (
          <div className="rounded-2xl border p-6 text-sm" style={{ backgroundColor: 'var(--app-bg-subtle)', borderColor: 'var(--app-border)', color: 'var(--app-text-muted)' }}>
            {emptyText}
          </div>
        )}
      </div>

      {rawPreviewOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-6" style={{ backgroundColor: 'rgba(15, 23, 42, 0.58)' }}>
          <div className="w-full max-w-4xl max-h-[82vh] rounded-3xl border overflow-hidden flex flex-col" style={{ backgroundColor: 'var(--app-bg-elevated)', borderColor: 'var(--app-border)', color: 'var(--app-text)' }}>
            <div className="px-6 py-5 border-b flex items-start justify-between gap-4" style={{ borderColor: 'var(--app-border)' }}>
              <div className="min-w-0">
                <h3 className="text-xl font-semibold">{rawPreviewTitle}</h3>
                <div className="mt-2 text-sm" style={{ color: 'var(--app-text-muted)' }}>
                  这里展示当前结构化编辑器对应的原始 JSON，只读预览。
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRawPreviewOpen(false)}
                className="p-2 rounded-lg transition-all duration-200 cursor-pointer hover:scale-105 active:scale-95"
                style={{ backgroundColor: 'var(--app-bg-subtle)', color: 'var(--app-text)' }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-auto p-6">
              <pre
                className="w-full h-full rounded-2xl p-5 text-sm font-mono whitespace-pre-wrap break-words"
                style={{
                  backgroundColor: 'var(--app-bg)',
                  color: 'var(--app-text)',
                  border: '1px solid var(--app-border)',
                }}
              >
                {JSON.stringify(value ?? {}, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default JsonFormEditor;
