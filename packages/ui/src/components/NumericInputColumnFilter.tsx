import clsx from 'clsx';
import { useEffect, useState } from 'preact/compat';
import Dropdown from 'react-bootstrap/Dropdown';
import InputGroup from 'react-bootstrap/InputGroup';
import OverlayTrigger from 'react-bootstrap/OverlayTrigger';
import Tooltip from 'react-bootstrap/Tooltip';

interface NumericInputColumnFilterProps {
  columnId: string;
  columnLabel: string;
  value: string;
  onChange: (value: string) => void;
  /** If true, shows a checkbox to filter for only null/empty values */
  allowEmptyFilter?: boolean;
  emptyFilterChecked?: boolean;
  onEmptyFilterChange?: (checked: boolean) => void;
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
 * @param params.allowEmptyFilter - If true, shows a checkbox to filter for only null/empty values
 * @param params.emptyFilterChecked - Whether the "Only empty" checkbox is checked
 * @param params.onEmptyFilterChange - Callback when the "Only empty" checkbox changes
 */
export function NumericInputColumnFilter({
  columnId,
  columnLabel,
  value,
  onChange,
  allowEmptyFilter = false,
  emptyFilterChecked = false,
  onEmptyFilterChange,
}: NumericInputColumnFilterProps) {
  // Use local state for smooth typing experience
  const [localValue, setLocalValue] = useState(value);

  // Sync local state with prop when prop changes (e.g., when filter is cleared externally)
  // This is a valid pattern for inputs that need responsive UX while staying in sync with external state
  // eslint-disable-next-line react-you-might-not-need-an-effect/no-unnecessary-use-effect
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const hasActiveFilter = localValue.trim().length > 0 || emptyFilterChecked;
  const isInvalid = localValue.trim().length > 0 && parseNumericFilter(localValue) === null;

  const handleInputChange = (newValue: string) => {
    setLocalValue(newValue);
    onChange(newValue);
  };

  const handleEmptyFilterChange = (checked: boolean) => {
    if (onEmptyFilterChange) {
      onEmptyFilterChange(checked);
    }
    // Clear numeric filter when "Only empty" is checked
    if (checked && localValue.trim().length > 0) {
      setLocalValue('');
      onChange('');
    }
  };

  return (
    <Dropdown align="end">
      <Dropdown.Toggle
        variant="link"
        class={clsx(
          'text-muted p-0',
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

          {allowEmptyFilter && (
            <div class="form-check mb-3">
              <input
                type="checkbox"
                class="form-check-input"
                id={`${columnId}-empty-filter`}
                checked={emptyFilterChecked}
                onChange={(e) => {
                  if (e.target instanceof HTMLInputElement) {
                    handleEmptyFilterChange(e.target.checked);
                  }
                }}
                onClick={(e) => e.stopPropagation()}
              />
              <label class="form-check-label small" for={`${columnId}-empty-filter`}>
                Only empty
              </label>
            </div>
          )}

          <InputGroup size="sm" onClick={(e) => e.stopPropagation()}>
            <input
              type="text"
              class={clsx('form-control form-control-sm', isInvalid && 'is-invalid')}
              placeholder="e.g., >0, <5, =10"
              value={localValue}
              disabled={emptyFilterChecked}
              onInput={(e) => {
                if (e.target instanceof HTMLInputElement) {
                  handleInputChange(e.target.value);
                }
              }}
            />
            {!emptyFilterChecked && (
              <OverlayTrigger
                placement="top"
                overlay={
                  <Tooltip>
                    <div class="text-start">
                      <strong>Use operators:</strong>
                      <br />
                      <code>&lt;</code>, <code>&gt;</code>, <code>&lt;=</code>, <code>&gt;=</code>,{' '}
                      <code>=</code>
                      <br />
                      <strong>Examples:</strong>
                      <br />
                      <code>&gt;5</code> or <code>&lt;=10</code>
                    </div>
                  </Tooltip>
                }
              >
                <button
                  type="button"
                  class="btn btn-sm btn-outline-secondary"
                  aria-label="Filter help"
                  onClick={(e) => e.stopPropagation()}
                >
                  <i class="bi bi-question-circle" aria-hidden="true" />
                </button>
              </OverlayTrigger>
            )}
          </InputGroup>
          {isInvalid && (
            <div class="invalid-feedback d-block">
              Invalid filter format. Use operators like <code>&gt;5</code> or <code>&lt;=10</code>
            </div>
          )}
          {hasActiveFilter && (
            <button
              type="button"
              class="btn btn-sm btn-link text-decoration-none mt-2 p-0"
              onClick={() => {
                setLocalValue('');
                onChange('');
                if (emptyFilterChecked && onEmptyFilterChange) {
                  onEmptyFilterChange(false);
                }
              }}
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

/**
 * Enhanced filter function that supports both numeric filtering and empty/null filtering.
 * The filterValue can be either a string (for numeric comparison) or an object with
 * numeric and emptyOnly properties.
 *
 * @example
 * {
 *   id: 'score_perc',
 *   accessorKey: 'score_perc',
 *   filterFn: numericColumnFilterFnWithEmpty,
 * }
 */
export function numericColumnFilterFnWithEmpty(
  row: any,
  columnId: string,
  filterValue: string | { numeric: string; emptyOnly: boolean },
): boolean {
  // Handle object-based filter value
  const numericFilter = typeof filterValue === 'string' ? filterValue : filterValue?.numeric || '';
  const emptyOnly =
    typeof filterValue === 'object' && filterValue !== null ? filterValue.emptyOnly : false;

  const cellValue = row.getValue(columnId) as number | null;
  const isEmpty = cellValue === null || cellValue === undefined;

  // If "Only empty" is checked, show only rows with null/undefined values
  if (emptyOnly) {
    return isEmpty;
  }

  // If there's no numeric filter, show all rows
  const parsed = parseNumericFilter(numericFilter);
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
