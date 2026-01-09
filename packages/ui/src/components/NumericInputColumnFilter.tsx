import type { Column } from '@tanstack/table-core';
import clsx from 'clsx';
import Dropdown from 'react-bootstrap/Dropdown';

export type NumericColumnFilterValue =
  | {
      filterValue: string;
      emptyOnly: false;
    }
  | {
      filterValue: '';
      emptyOnly: true;
    };

/**
 * A component that allows the user to filter a numeric column using comparison operators.
 * Supports syntax like: <1, >0, <=5, >=10, =5, or just 5 (implicit equals)
 *
 * @param params
 * @param params.column - The TanStack Table column object
 */
export function NumericInputColumnFilter<TData, TValue>({
  column,
}: {
  column: Column<TData, TValue>;
}) {
  const columnId = column.id;
  const value = (column.getFilterValue() as NumericColumnFilterValue | undefined) ?? {
    filterValue: '',
    emptyOnly: false,
  };

  const label =
    column.columnDef.meta?.label ??
    (typeof column.columnDef.header === 'string' ? column.columnDef.header : column.id);

  const filterValue = value.filterValue;
  const emptyOnly = value.emptyOnly;
  const hasActiveFilter = filterValue.trim().length > 0 || emptyOnly;
  const isInvalid = filterValue.trim().length > 0 && parseNumericFilter(filterValue) === null;

  return (
    <Dropdown align="end">
      <Dropdown.Toggle
        variant="link"
        className={clsx(
          'text-muted p-0',
          hasActiveFilter && (isInvalid ? 'text-warning' : 'text-primary'),
        )}
        id={`filter-${columnId}`}
        aria-label={`Filter ${label.toLowerCase()}`}
        title={`Filter ${label.toLowerCase()}`}
      >
        <i
          className={clsx(
            'bi',
            isInvalid
              ? 'bi-exclamation-triangle'
              : hasActiveFilter
                ? 'bi-funnel-fill'
                : 'bi-funnel',
          )}
          aria-hidden="true"
        />
      </Dropdown.Toggle>
      <Dropdown.Menu className="p-0">
        <div className="p-3" style={{ minWidth: '240px' }}>
          <div className="d-flex align-items-center justify-content-between mb-2">
            <label className="form-label fw-semibold mb-0" id={`${columnId}-filter-label`}>
              {label}
            </label>
            <button
              type="button"
              className={clsx(
                'btn btn-link btn-sm text-decoration-none',
                !hasActiveFilter && 'invisible',
              )}
              onClick={() => {
                column.setFilterValue({ filterValue: '', emptyOnly: false });
              }}
            >
              Clear
            </button>
          </div>
          <input
            type="text"
            className={clsx('form-control form-control-sm', isInvalid && 'is-invalid')}
            placeholder="e.g., >0, <5, =10"
            aria-labelledby={`${columnId}-filter-label`}
            value={filterValue}
            disabled={emptyOnly}
            aria-describedby={`${columnId}-filter-description`}
            onInput={(e) => {
              column.setFilterValue({
                filterValue: e.currentTarget.value,
                emptyOnly: false,
              });
            }}
            onClick={(e) => e.stopPropagation()}
          />
          {isInvalid && (
            <div className="invalid-feedback d-block">
              Invalid filter format. Use operators like <code>&gt;5</code> or <code>&lt;=10</code>
            </div>
          )}
          {!isInvalid && (
            <small className="form-text text-nowrap" id={`${columnId}-filter-description`}>
              Operators: <code>&lt;</code>, <code>&gt;</code>, <code>&lt;=</code>,{' '}
              <code>&gt;=</code>, <code>=</code>
            </small>
          )}
          <div className="form-check mt-2">
            <input
              className="form-check-input"
              type="checkbox"
              checked={emptyOnly}
              id={`${columnId}-empty-filter`}
              onChange={(e) => {
                column.setFilterValue(
                  e.currentTarget.checked
                    ? { filterValue: '', emptyOnly: true }
                    : { filterValue: '', emptyOnly: false },
                );
              }}
            />
            <label className="form-check-label" for={`${columnId}-empty-filter`}>
              Empty values
            </label>
          </div>
        </div>
      </Dropdown.Menu>
    </Dropdown>
  );
}

/**
 * Helper function to parse a numeric filter value.
 * Returns null if the filter is invalid or empty.
 *
 * @param filterValue - The filter string (e.g., ">5", "<=10", "3")
 * @returns Parsed operator and value, or null if invalid
 */
export function parseNumericFilter(filterValue: string): {
  operator: '<' | '>' | '<=' | '>=' | '=';
  value: number;
} | null {
  if (!filterValue.trim()) return null;

  const match = filterValue.trim().match(/^(<=?|>=?|=)?\s*(-?\d+\.?\d*)$/);
  if (!match) return null;

  const operator = (match[1] || '=') as '<' | '>' | '<=' | '>=' | '=';
  const value = Number.parseFloat(match[2]);

  if (Number.isNaN(value)) return null;

  return { operator, value };
}

/**
 * TanStack Table filter function for numeric columns.
 * Use this as the `filterFn` for numeric columns.
 *
 * @example
 * {
 *   id: 'manual_points',
 *   accessorKey: 'manual_points',
 *   filterFn: numericColumnFilterFn,
 * }
 */
export function numericColumnFilterFn(
  row: any,
  columnId: string,
  { filterValue, emptyOnly }: NumericColumnFilterValue,
): boolean {
  // Handle object-based filter value
  const cellValue = row.getValue(columnId) as number | null;
  const isEmpty = cellValue == null;

  if (emptyOnly) {
    return isEmpty;
  }

  // If there's no numeric filter, show all rows
  const parsed = parseNumericFilter(filterValue);
  if (!parsed) return true;

  // If cell is empty and we're doing numeric filtering, don't show it
  if (isEmpty) return false;

  // Apply numeric filter
  switch (parsed.operator) {
    case '<':
      return cellValue < parsed.value;
    case '>':
      return cellValue > parsed.value;
    case '<=':
      return cellValue <= parsed.value;
    case '>=':
      return cellValue >= parsed.value;
    case '=':
      return cellValue === parsed.value;
    default:
      return true;
  }
}
