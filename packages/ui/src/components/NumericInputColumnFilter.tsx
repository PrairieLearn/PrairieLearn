import clsx from 'clsx';
import Dropdown from 'react-bootstrap/Dropdown';

interface NumericInputColumnFilterProps {
  columnId: string;
  columnLabel: string;
  value: string;
  onChange: (value: string) => void;
}

/**
 * A component that allows the user to filter a numeric column using comparison operators.
 * Supports syntax like: <1, >0, <=5, >=10, =5, or just 5 (implicit equals)
 *
 * @param params
 * @param params.columnId - The ID of the column
 * @param params.columnLabel - The label of the column, e.g. "Manual Points"
 * @param params.value - The current filter value (e.g., ">5" or "10")
 * @param params.onChange - Callback when the filter value changes
 */
export function NumericInputColumnFilter({
  columnId,
  columnLabel,
  value,
  onChange,
}: NumericInputColumnFilterProps) {
  const hasActiveFilter = value.trim().length > 0;
  const isInvalid = hasActiveFilter && parseNumericFilter(value) === null;

  return (
    <Dropdown align="end">
      <Dropdown.Toggle
        variant="link"
        class={clsx(
          'text-muted p-0 ms-2',
          hasActiveFilter && (isInvalid ? 'text-warning' : 'text-primary'),
        )}
        id={`filter-${columnId}`}
        aria-label={`Filter ${columnLabel.toLowerCase()}`}
        title={`Filter ${columnLabel.toLowerCase()}`}
      >
        <i
          class={clsx(
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
      <Dropdown.Menu>
        <div class="p-3" style={{ minWidth: '240px' }}>
          <label class="form-label small fw-semibold mb-2">{columnLabel}</label>
          <input
            type="text"
            class={clsx('form-control form-control-sm', isInvalid && 'is-invalid')}
            placeholder="e.g., >0, <5, =10"
            value={value}
            onInput={(e) => {
              if (e.target instanceof HTMLInputElement) {
                onChange(e.target.value);
              }
            }}
            onClick={(e) => e.stopPropagation()}
          />
          {isInvalid && (
            <div class="invalid-feedback d-block">
              Invalid filter format. Use operators like <code>&gt;5</code> or <code>&lt;=10</code>
            </div>
          )}
          {!isInvalid && (
            <div class="form-text small mt-2">
              Use operators: <code>&lt;</code>, <code>&gt;</code>, <code>&lt;=</code>,{' '}
              <code>&gt;=</code>, <code>=</code>
              <br />
              Example: <code>&gt;5</code> or <code>&lt;=10</code>
            </div>
          )}
          {hasActiveFilter && (
            <button
              type="button"
              class="btn btn-sm btn-link text-decoration-none mt-2 p-0"
              onClick={() => onChange('')}
            >
              Clear filter
            </button>
          )}
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
export function numericColumnFilterFn(row: any, columnId: string, filterValue: string): boolean {
  const parsed = parseNumericFilter(filterValue);
  if (!parsed) return true; // Invalid or empty filter = show all

  const cellValue = row.getValue(columnId) as number | null;
  if (cellValue === null || cellValue === undefined) return false;

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
