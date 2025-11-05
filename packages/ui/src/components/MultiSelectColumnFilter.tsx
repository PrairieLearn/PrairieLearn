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
 * @param params.columnId - The ID of the column
 * @param params.columnLabel - The label of the column, e.g. "Rubric Items"
 * @param params.allColumnValues - All possible values that can appear in the column
 * @param params.renderValueLabel - A function that renders the label for a value
 * @param params.columnValuesFilter - The current state of the column filter
 * @param params.setColumnValuesFilter - A function that sets the state of the column filter
 */
export function MultiSelectColumnFilter<T extends readonly any[]>({
  columnId,
  columnLabel,
  allColumnValues,
  renderValueLabel = defaultRenderValueLabel,
  columnValuesFilter,
  setColumnValuesFilter,
}: {
  columnId: string;
  columnLabel: string;
  allColumnValues: T;
  renderValueLabel?: (props: { value: T[number]; isSelected: boolean }) => JSX.Element;
  columnValuesFilter: T[number][];
  setColumnValuesFilter: (value: T[number][]) => void;
}) {
  const selected = useMemo(() => new Set(columnValuesFilter), [columnValuesFilter]);

  const toggleSelected = (value: T[number]) => {
    const set = new Set(selected);
    if (set.has(value)) {
      set.delete(value);
    } else {
      set.add(value);
    }
    setColumnValuesFilter(Array.from(set));
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
        <div class="p-3" style={{ minWidth: '250px' }}>
          <div class="d-flex align-items-center justify-content-between mb-2">
            <div class="fw-semibold">{columnLabel}</div>
            <button
              type="button"
              class="btn btn-link btn-sm text-decoration-none p-0"
              onClick={() => setColumnValuesFilter([])}
            >
              Clear
            </button>
          </div>

          <div class="list-group list-group-flush">
            {allColumnValues.map((value) => {
              const isSelected = selected.has(value);
              return (
                <div key={value} class="list-group-item d-flex align-items-center gap-3 px-0">
                  <input
                    class="form-check-input"
                    type="checkbox"
                    checked={isSelected}
                    id={`${columnId}-${value}`}
                    onChange={() => toggleSelected(value)}
                  />
                  <label class="form-check-label" for={`${columnId}-${value}`}>
                    {renderValueLabel({
                      value,
                      isSelected,
                    })}
                  </label>
                </div>
              );
            })}
          </div>
        </div>
      </Dropdown.Menu>
    </Dropdown>
  );
}
