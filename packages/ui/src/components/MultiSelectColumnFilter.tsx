import type { Column } from '@tanstack/table-core';
import clsx from 'clsx';
import { type JSX, useMemo } from 'preact/compat';
import Dropdown from 'react-bootstrap/Dropdown';

function defaultRenderValueLabel<T>({ value }: { value: T }) {
  return <span>{String(value)}</span>;
}

/**
 * A component that allows the user to filter a column containing arrays of values.
 * Uses AND logic: rows must contain ALL selected values to match.
 *
 * @param params
 * @param params.column - The TanStack Table column object
 * @param params.allColumnValues - All possible values that can appear in the column filter
 * @param params.renderValueLabel - A function that renders the label for a value
 */
export function MultiSelectColumnFilter<TData, TValue>({
  column,
  allColumnValues,
  renderValueLabel = defaultRenderValueLabel,
}: {
  column: Column<TData, TValue>;
  /** In some cases, the filter values are not the same as the column values, but `TValue` is a good estimation. */
  allColumnValues: TValue[];
  renderValueLabel?: (props: { value: TValue; isSelected: boolean }) => JSX.Element;
}) {
  const columnId = column.id;

  const label =
    column.columnDef.meta?.label ??
    (typeof column.columnDef.header === 'string' ? column.columnDef.header : column.id);

  const columnValuesFilter = column.getFilterValue() as TValue[] | undefined;

  const selected = useMemo(() => {
    return new Set(columnValuesFilter);
  }, [columnValuesFilter]);

  const toggleSelected = (value: TValue) => {
    const set = new Set(selected);
    if (set.has(value)) {
      set.delete(value);
    } else {
      set.add(value);
    }
    const newValue = Array.from(set);
    column.setFilterValue(newValue);
  };

  const hasActiveFilter = selected.size > 0;

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
          className={clsx('bi', hasActiveFilter ? ['bi-funnel-fill', 'text-primary'] : 'bi-funnel')}
          aria-hidden="true"
        />
      </Dropdown.Toggle>
      <Dropdown.Menu className="p-0">
        <div className="p-3 pb-0" style={{ minWidth: '250px' }}>
          <div className="d-flex align-items-center justify-content-between mb-2">
            <div className="fw-semibold">{label}</div>
            <button
              type="button"
              className="btn btn-link btn-sm text-decoration-none p-0"
              onClick={() => column.setFilterValue([])}
            >
              Clear
            </button>
          </div>
        </div>

        <div
          className="list-group list-group-flush"
          style={{
            // This is needed to prevent the last item's background from covering
            // the dropdown's border radius.
            '--bs-list-group-bg': 'transparent',
          }}
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
                  <label className="form-check-label fw-normal" for={`${columnId}-${value}`}>
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
