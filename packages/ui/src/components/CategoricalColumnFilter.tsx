import type { Column } from '@tanstack/react-table';
import clsx from 'clsx';
import { type ReactNode, useMemo, useState } from 'react';
import Dropdown from 'react-bootstrap/Dropdown';

function computeSelected<TValue extends string>(
  allStatusValues: TValue[] | readonly TValue[],
  mode: 'include' | 'exclude',
  selected: Set<TValue>,
): Set<TValue> {
  if (mode === 'include') {
    return selected;
  }
  return new Set(allStatusValues.filter((s) => !selected.has(s)));
}

function defaultRenderValueLabel({ value }: { value: string }) {
  return <span className="text-nowrap">{value}</span>;
}

/**
 * A component that allows the user to filter a categorical column.
 * The filter mode always defaults to "include".
 *
 * The filter options (`allColumnValues`) are strings (or string subtypes like
 * enums). The column's `filterFn` is responsible for mapping these string
 * values to the actual column data (e.g., mapping "Unassigned" to `null`).
 *
 * @param params
 * @param params.column - The TanStack Table column object
 * @param params.allColumnValues - The string values to display as filter options
 * @param params.renderValueLabel - A function that renders the label for a value
 */
export function CategoricalColumnFilter<TData, TValue extends string = string>({
  column,
  allColumnValues,
  renderValueLabel = defaultRenderValueLabel,
}: {
  column: Column<TData, unknown>;
  allColumnValues: TValue[] | readonly TValue[];
  renderValueLabel?: (props: { value: TValue; isSelected: boolean }) => ReactNode;
}) {
  const [mode, setMode] = useState<'include' | 'exclude'>('include');

  const columnId = column.id;

  const label =
    column.columnDef.meta?.label ??
    (typeof column.columnDef.header === 'string' ? column.columnDef.header : column.id);

  const columnValuesFilter = column.getFilterValue() as TValue[] | undefined;

  const selected = useMemo(() => {
    return computeSelected(allColumnValues, mode, new Set(columnValuesFilter));
  }, [mode, allColumnValues, columnValuesFilter]);

  const apply = (newMode: 'include' | 'exclude', newSelected: Set<TValue>) => {
    const selected = computeSelected(allColumnValues, newMode, newSelected);
    setMode(newMode);
    const newValue = Array.from(selected);
    column.setFilterValue(newValue);
  };

  const toggleSelected = (value: TValue) => {
    const set = new Set(selected);
    if (set.has(value)) {
      set.delete(value);
    } else {
      set.add(value);
    }
    apply(mode, set);
  };

  return (
    <Dropdown align="end">
      <Dropdown.Toggle
        variant="link"
        className="text-muted p-0"
        id={`filter-${columnId}`}
        aria-label={`Filter ${label.toLowerCase()}`}
        title={`Filter ${label.toLowerCase()}`}
      >
        <i
          className={clsx(
            'bi',
            selected.size > 0 ? ['bi-funnel-fill', 'text-primary'] : 'bi-funnel',
          )}
          aria-hidden="true"
        />
      </Dropdown.Toggle>
      <Dropdown.Menu className="p-0">
        <div className="p-3 pb-0">
          <div className="d-flex align-items-center justify-content-between mb-2">
            <div className="fw-semibold text-nowrap">{label}</div>
            <button
              type="button"
              className={clsx('btn btn-link btn-sm text-decoration-none', {
                // Hide the clear button if no filters are applied.
                // Use `visibility` instead of conditional rendering to avoid layout shift.
                invisible: selected.size === 0 && mode === 'include',
              })}
              onClick={() => apply('include', new Set<TValue>())}
            >
              Clear
            </button>
          </div>

          <div className="btn-group btn-group-sm w-100 mb-2">
            <input
              type="radio"
              className="btn-check"
              name={`filter-${columnId}-options`}
              id={`filter-${columnId}-include`}
              autoComplete="off"
              checked={mode === 'include'}
              onChange={() => apply('include', selected)}
            />
            <label className="btn btn-outline-primary" htmlFor={`filter-${columnId}-include`}>
              <span className="text-nowrap">
                {mode === 'include' && <i className="bi bi-check-lg me-1" aria-hidden="true" />}
                Include
              </span>
            </label>

            <input
              type="radio"
              className="btn-check"
              name={`filter-${columnId}-options`}
              id={`filter-${columnId}-exclude`}
              autoComplete="off"
              checked={mode === 'exclude'}
              onChange={() => apply('exclude', selected)}
            />
            <label className="btn btn-outline-primary" htmlFor={`filter-${columnId}-exclude`}>
              <span className="text-nowrap">
                {mode === 'exclude' && <i className="bi bi-check-lg me-1" aria-hidden="true" />}
                Exclude
              </span>
            </label>
          </div>
        </div>

        <div
          className="list-group list-group-flush"
          style={
            {
              // This is needed to prevent the last item's background from covering
              // the dropdown's border radius.
              '--bs-list-group-bg': 'transparent',
            } as React.CSSProperties
          }
        >
          {allColumnValues.map((value) => {
            const isSelected = selected.has(value);
            return (
              <div key={value} className="list-group-item d-flex align-items-center gap-3">
                <div className="form-check">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    checked={isSelected}
                    id={`${columnId}-${value}`}
                    onChange={() => toggleSelected(value)}
                  />
                  <label className="form-check-label fw-normal" htmlFor={`${columnId}-${value}`}>
                    {renderValueLabel({
                      value,
                      isSelected,
                    })}
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      </Dropdown.Menu>
    </Dropdown>
  );
}
