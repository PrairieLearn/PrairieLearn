import type { Header } from '@tanstack/react-table';
import clsx from 'clsx';
import { type JSX, useMemo } from 'preact/compat';
import Dropdown from 'react-bootstrap/Dropdown';

function defaultRenderValueLabel<T>({ value }: { value: T }) {
  return <span>{String(value)}</span>;
}

/**
 * A component that allows the user to filter a column containing arrays of values.
 * Uses AND logic: rows must contain ALL selected values to match.
 * State is managed by TanStack Table.
 *
 * @param params
 * @param params.header - The TanStack Table header object
 * @param params.columnLabel - The label of the column, e.g. "Rubric Items"
 * @param params.allColumnValues - All possible values that can appear in the column
 * @param params.renderValueLabel - A function that renders the label for a value
 */
export function MultiSelectColumnFilter<TData, T extends readonly any[]>({
  header,
  columnLabel,
  allColumnValues,
  renderValueLabel = defaultRenderValueLabel,
}: {
  header: Header<TData, unknown>;
  columnLabel: string;
  allColumnValues: T;
  renderValueLabel?: (props: { value: T[number]; isSelected: boolean }) => JSX.Element;
}) {
  const columnId = header.column.id;

  const selected = useMemo(() => {
    const columnValuesFilter = (header.column.getFilterValue() as T[number][] | undefined) ?? [];
    return new Set(columnValuesFilter);
  }, [header.column]);

  const toggleSelected = (value: T[number]) => {
    const set = new Set(selected);
    if (set.has(value)) {
      set.delete(value);
    } else {
      set.add(value);
    }
    const newValue = Array.from(set);
    header.column.setFilterValue(newValue.length > 0 ? newValue : undefined);
  };

  const hasActiveFilter = selected.size > 0;

  return (
    <Dropdown align="end">
      <Dropdown.Toggle
        variant="link"
        class="text-muted p-0"
        id={`filter-${columnId}`}
        aria-label={`Filter ${columnLabel.toLowerCase()}`}
        title={`Filter ${columnLabel.toLowerCase()}`}
      >
        <i
          class={clsx('bi', hasActiveFilter ? ['bi-funnel-fill', 'text-primary'] : 'bi-funnel')}
          aria-hidden="true"
        />
      </Dropdown.Toggle>
      <Dropdown.Menu class="p-0">
        <div class="p-3 pb-0" style={{ minWidth: '250px' }}>
          <div class="d-flex align-items-center justify-content-between mb-2">
            <div class="fw-semibold">{columnLabel}</div>
            <button
              type="button"
              class="btn btn-link btn-sm text-decoration-none p-0"
              onClick={() => header.column.setFilterValue(undefined)}
            >
              Clear
            </button>
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
