import type { Column } from '@tanstack/react-table';
import clsx from 'clsx';
import { type JSX, useMemo, useState } from 'preact/compat';
import Dropdown from 'react-bootstrap/Dropdown';

function computeSelected<T extends readonly any[]>(
  allStatusValues: T,
  mode: 'include' | 'exclude',
  selected: Set<T[number]>,
) {
  if (mode === 'include') {
    return selected;
  }
  return new Set(allStatusValues.filter((s) => !selected.has(s)));
}

function defaultRenderValueLabel<T>({ value }: { value: T }) {
  return <span class="text-nowrap">{String(value)}</span>;
}
/**
 * A component that allows the user to filter a categorical column.
 * The filter mode always defaults to "include".
 *
 * @param params
 * @param params.column - The TanStack Table column object
 * @param params.allColumnValues - The values to filter by
 * @param params.renderValueLabel - A function that renders the label for a value
 */
export function CategoricalColumnFilter<TData, TValue>({
  column,
  allColumnValues,
  renderValueLabel = defaultRenderValueLabel,
}: {
  column: Column<TData, TValue>;
  allColumnValues: TValue[];
  renderValueLabel?: (props: { value: TValue; isSelected: boolean }) => JSX.Element;
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
        class="text-muted p-0"
        id={`filter-${columnId}`}
        aria-label={`Filter ${label.toLowerCase()}`}
        title={`Filter ${label.toLowerCase()}`}
      >
        <i
          class={clsx('bi', selected.size > 0 ? ['bi-funnel-fill', 'text-primary'] : 'bi-funnel')}
          aria-hidden="true"
        />
      </Dropdown.Toggle>
      <Dropdown.Menu class="p-0">
        <div class="p-3 pb-0">
          <div class="d-flex align-items-center justify-content-between mb-2">
            <div class="fw-semibold">{label}</div>
            <button
              type="button"
              class={clsx('btn btn-link btn-sm text-decoration-none', {
                // Hide the clear button if no filters are applied.
                // Use `visibility` instead of conditional rendering to avoid layout shift.
                invisible: selected.size === 0 && mode === 'include',
              })}
              onClick={() => apply('include', new Set())}
            >
              Clear
            </button>
          </div>

          <div class="btn-group btn-group-sm w-100 mb-2">
            <input
              type="radio"
              class="btn-check"
              name={`filter-${columnId}-options`}
              id={`filter-${columnId}-include`}
              autocomplete="off"
              checked={mode === 'include'}
              onChange={() => apply('include', selected)}
            />
            <label class="btn btn-outline-primary" for={`filter-${columnId}-include`}>
              <span class="text-nowrap">
                {mode === 'include' && <i class="bi bi-check-lg me-1" aria-hidden="true" />}
                Include
              </span>
            </label>

            <input
              type="radio"
              class="btn-check"
              name={`filter-${columnId}-options`}
              id={`filter-${columnId}-exclude`}
              autocomplete="off"
              checked={mode === 'exclude'}
              onChange={() => apply('exclude', selected)}
            />
            <label class="btn btn-outline-primary" for={`filter-${columnId}-exclude`}>
              <span class="text-nowrap">
                {mode === 'exclude' && <i class="bi bi-check-lg me-1" aria-hidden="true" />}
                Exclude
              </span>
            </label>
          </div>
        </div>

        <div
          class="list-group list-group-flush"
          style={{
            // This is needed to prevent the last item's background from covering
            // the dropdown's border radius.
            '--bs-list-group-bg': 'transparent',
          }}
        >
          {allColumnValues.map((value) => {
            const isSelected = selected.has(value);
            return (
              <div key={value} class="list-group-item d-flex align-items-center gap-3">
                <div class="form-check">
                  <input
                    class="form-check-input"
                    type="checkbox"
                    checked={isSelected}
                    id={`${columnId}-${value}`}
                    onChange={() => toggleSelected(value)}
                  />
                  <label class="form-check-label fw-normal" for={`${columnId}-${value}`}>
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
