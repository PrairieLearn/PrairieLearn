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
  return <span>{String(value)}</span>;
}
/**
 * A component that allows the user to filter a categorical column. State is managed by the parent component.
 *
 * @param params
 * @param params.columnId - The ID of the column
 * @param params.columnLabel - The label of the column, e.g. "Status"
 * @param params.allValues - The values to filter by
 * @param params.renderValueLabel - A function that renders the label for a value
 * @param params.valuesFilter - The current state of the filter
 * @param params.setValuesFilter - A function that sets the state of the filter
 */
export function CategoricalColumnFilter<T extends readonly any[]>({
  columnId,
  columnLabel,
  allValues,
  renderValueLabel = defaultRenderValueLabel,
  valuesFilter,
  setValuesFilter,
}: {
  columnId: string;
  columnLabel: string;
  allValues: T;
  renderValueLabel?: (props: { value: T[number]; isSelected: boolean }) => JSX.Element;
  valuesFilter: T[number][];
  setValuesFilter: (value: T[number][]) => void;
}) {
  const [mode, setModeQuery] = useState<'include' | 'exclude'>('include');

  const selected = useMemo(
    () => computeSelected(allValues, mode, new Set(valuesFilter)),
    [mode, valuesFilter, allValues],
  );

  const apply = (newMode: 'include' | 'exclude', newSelected: Set<T[number]>) => {
    const selected = computeSelected(allValues, newMode, newSelected);
    setModeQuery(newMode);
    setValuesFilter(Array.from(selected));
  };

  const toggleSelected = (value: T[number]) => {
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
        class="text-muted p-0 ms-2"
        id={`filter-${columnId}`}
        aria-label={`Filter ${columnLabel.toLowerCase()}`}
        title={`Filter ${columnLabel.toLowerCase()}`}
      >
        <i
          class={clsx('bi', selected.size > 0 ? ['bi-funnel-fill', 'text-primary'] : 'bi-funnel')}
          aria-hidden="true"
        />
      </Dropdown.Toggle>
      <Dropdown.Menu class="p-0">
        <div class="p-3">
          <div class="d-flex align-items-center justify-content-between mb-2">
            <div class="fw-semibold">{columnLabel}</div>
            <button
              type="button"
              class="btn btn-link btn-sm text-decoration-none"
              onClick={() => apply(mode, new Set())}
            >
              Clear
            </button>
          </div>

          <div class="btn-group w-100 mb-2" role="group" aria-label="Include or exclude values">
            <button
              type="button"
              class={clsx('btn', mode === 'include' ? 'btn-primary' : 'btn-outline-secondary')}
              onClick={() => apply('include', selected)}
            >
              Include
            </button>
            <button
              type="button"
              class={clsx('btn', mode === 'exclude' ? 'btn-primary' : 'btn-outline-secondary')}
              onClick={() => apply('exclude', selected)}
            >
              Exclude
            </button>
          </div>

          <div class="list-group list-group-flush">
            {allValues.map((value) => {
              const isSelected = selected.has(value);
              return (
                <div key={value} class="list-group-item d-flex align-items-center gap-3">
                  <input
                    class="form-check-input"
                    type="checkbox"
                    checked={isSelected}
                    id={`status-${value}`}
                    readOnly
                    onChange={() => toggleSelected(value)}
                  />
                  <label class="form-check-label" for={`status-${value}`}>
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
