import React from 'react';

export interface AppTableColumn<T> {
  align?: 'left' | 'center' | 'right';
  cellClassName?: string;
  className?: string;
  key: string;
  label: string;
  lineClamp?: number;
  nowrap?: boolean;
  render: (row: T, rowIndex: number) => React.ReactNode;
  truncate?: boolean;
  width?: string;
}

interface AppTableProps<T> {
  className?: string;
  columns: AppTableColumn<T>[];
  emptyText?: string;
  rowClassName?: string;
  rows: T[];
  stickyHeader?: boolean;
}

const getAlignClass = (align?: AppTableColumn<unknown>['align']) => {
  if (align === 'center') {
    return 'text-center';
  }

  if (align === 'right') {
    return 'text-right';
  }

  return 'text-left';
};

const getCellOverflowClass = <T,>(column: AppTableColumn<T>) => {
  if (column.lineClamp === 2) {
    return 'line-clamp-2';
  }

  if (column.nowrap) {
    return 'whitespace-nowrap';
  }

  if (column.truncate) {
    return 'truncate';
  }

  return '';
};

const AppTable = <T,>({
  className = '',
  columns,
  emptyText = '暂无数据',
  rowClassName = '',
  rows,
  stickyHeader = false,
}: AppTableProps<T>) => {
  return (
    <div
      className={`overflow-hidden rounded-xl border ${className}`}
      style={{
        backgroundColor: 'var(--app-table-bg)',
        borderColor: 'var(--app-table-border)',
      }}
    >
      <div className="overflow-auto">
        <table className="w-full border-collapse">
          <colgroup>
            {columns.map((column) => (
              <col
                key={column.key}
                style={column.width ? { width: column.width } : undefined}
              />
            ))}
          </colgroup>
          <thead>
            <tr
              style={{
                backgroundColor: 'var(--app-table-header-bg)',
                borderBottom: '1px solid var(--app-table-border)',
              }}
            >
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={`px-4 py-3 text-xs font-semibold ${getAlignClass(column.align)} ${column.className || ''}`}
                  style={{
                    color: 'var(--app-table-header-text)',
                    position: stickyHeader ? 'sticky' : undefined,
                    top: stickyHeader ? 0 : undefined,
                    zIndex: stickyHeader ? 2 : undefined,
                    background: stickyHeader ? 'var(--app-table-header-bg)' : undefined,
                    boxShadow: stickyHeader ? 'var(--app-table-header-shadow)' : undefined,
                  }}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                className={`transition-colors duration-200 ${rowClassName}`}
                style={{
                  borderBottom: rowIndex === rows.length - 1 ? 'none' : '1px solid var(--app-table-row-border)',
                }}
                onMouseEnter={(event) => {
                  event.currentTarget.style.backgroundColor = 'var(--app-table-row-hover-bg)';
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={`px-4 py-3 text-sm align-top ${getAlignClass(column.align)} ${column.cellClassName || column.className || ''}`}
                    style={{ color: 'var(--app-table-cell-text)' }}
                  >
                    <div className={`min-w-0 ${getCellOverflowClass(column)}`}>
                      {column.render(row, rowIndex)}
                    </div>
                  </td>
                ))}
              </tr>
            )) : (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-8 text-sm text-center"
                  style={{ color: 'var(--app-table-cell-muted-text)' }}
                >
                  {emptyText}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AppTable;
