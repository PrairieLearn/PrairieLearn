import clsx from 'clsx';
import { type JSX, useMemo, useState } from 'preact/compat';
import Dropdown from 'react-bootstrap/Dropdown';

type FilterMode = 'any' | 'all';

function computeSelected<T extends readonly any[]>(
  allValues: T,
  mode: 'include' | 'exclude',
  selected: Set<T[number]>,
) {
  if (mode === 'include') {
    return selected;
  }
  return new Set(allValues.filter((s) => !selected.has(s)));
}

function defaultRenderValueLabel<T>({ value }: { value: T }) {
  return <span>{String(value)}</span>;
}

/**
 * A component that allows the user to filter a column containing arrays of values.
 * Supports two matching modes:
 * - 'any': Show rows where ANY of the selected values are present (OR logic)
 * - 'all': Show rows where ALL of the selected values are present (AND logic)
 *
 * @param params
 * @param params.columnId - The ID of the column
 * @param params.columnLabel - The label of the column, e.g. "Rubric Items"
 * @param params.allColumnValues - All possible values that can appear in the column
 * @param params.renderValueLabel - A function that renders the label for a value
 * @param params.columnValuesFilter - The current state of the column filter
 * @param params.setColumnValuesFilter - A function that sets the state of the column filter
 * @param params.matchMode - Whether to match ANY or ALL selected values
 * @param params.setMatchMode - A function to change the match mode
 */
export function MultiSelectColumnFilter<T extends readonly any[]>({
  columnId,
  columnLabel,
  allColumnValues,
  renderValueLabel = defaultRenderValueLabel,
  columnValuesFilter,
  setColumnValuesFilter,
  matchMode = 'any',
  setMatchMode,
}: {
  columnId: string;
  columnLabel: string;
  allColumnValues: T;
  renderValueLabel?: (props: { value: T[number]; isSelected: boolean }) => JSX.Element;
  columnValuesFilter: T[number][];
  setColumnValuesFilter: (value: T[number][]) => void;
  matchMode?: FilterMode;
  setMatchMode?: (mode: FilterMode) => void;
}) {
  const [includeExcludeMode, setIncludeExcludeMode] = useState<'include' | 'exclude'>('include');

  const selected = useMemo(
    () => computeSelected(allColumnValues, includeExcludeMode, new Set(columnValuesFilter)),
    [includeExcludeMode, columnValuesFilter, allColumnValues],
  );

  const apply = (newMode: 'include' | 'exclude', newSelected: Set<T[number]>) => {
    const selected = computeSelected(allColumnValues, newMode, newSelected);
    setIncludeExcludeMode(newMode);
    setColumnValuesFilter(Array.from(selected));
  };

  const toggleSelected = (value: T[number]) => {
    const set = new Set(selected);
    if (set.has(value)) {
      set.delete(value);
    } else {
      set.add(value);
    }
    apply(includeExcludeMode, set);
  };

  const hasActiveFilter = selected.size > 0;

  return (
    <Dropdown align="end">
      <Dropdown.Toggle
        variant="link"
        class="text-muted p-0 ms-2"
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
              onClick={() => apply(includeExcludeMode, new Set())}
            >
              Clear
            </button>
          </div>

          <div class="btn-group w-100 mb-2" role="group" aria-label="Include or exclude values">
            <button
              type="button"
              class={clsx(
                'btn btn-sm',
                includeExcludeMode === 'include' ? 'btn-primary' : 'btn-outline-secondary',
              )}
              onClick={() => apply('include', selected)}
            >
              Include
            </button>
            <button
              type="button"
              class={clsx(
                'btn btn-sm',
                includeExcludeMode === 'exclude' ? 'btn-primary' : 'btn-outline-secondary',
              )}
              onClick={() => apply('exclude', selected)}
            >
              Exclude
            </button>
          </div>

          {setMatchMode && (
            <div class="btn-group w-100 mb-2" role="group" aria-label="Match mode">
              <button
                type="button"
                class={clsx(
                  'btn btn-sm',
                  matchMode === 'any' ? 'btn-secondary' : 'btn-outline-secondary',
                )}
                title="Show rows where ANY selected value is present"
                onClick={() => setMatchMode('any')}
              >
                Match ANY
              </button>
              <button
                type="button"
                class={clsx(
                  'btn btn-sm',
                  matchMode === 'all' ? 'btn-secondary' : 'btn-outline-secondary',
                )}
                title="Show rows where ALL selected values are present"
                onClick={() => setMatchMode('all')}
              >
                Match ALL
              </button>
            </div>
          )}

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
