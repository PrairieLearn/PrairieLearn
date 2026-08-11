import { compareItems, rankItem } from '@tanstack/match-sorter-utils';
import type { Column } from '@tanstack/react-table';
import clsx from 'clsx';
import { type ReactNode, useId, useState } from 'react';
import { Button, DialogTrigger, Popover } from 'react-aria-components';

export type MultiSelectFilterMode = 'include' | 'exclude';

export interface MultiSelectFilterValue<TValue extends string = string> {
  values: TValue[];
  mode: MultiSelectFilterMode;
}

const EMPTY_INCLUDE: MultiSelectFilterValue = { values: [], mode: 'include' };

function defaultRenderValueLabel({ value }: { value: string }) {
  return <span className="text-nowrap">{value}</span>;
}

/**
 * A column filter that lets the user pick a set of values to include or
 * exclude. Renders as a dropdown with a checklist of values plus an
 * "Include" / "Exclude" toggle.
 *
 * The filter value is `{ values, mode }`, where `mode` is `'include'` or
 * `'exclude'`. The column's `filterFn` decides how to apply the values to its
 * row data; the mode is forwarded along verbatim so multi-valued columns can
 * apply the correct semantics in each direction.
 *
 * @param params
 * @param params.column - The TanStack Table column object
 * @param params.allColumnValues - The string values to display as filter options
 * @param params.getSearchText - A function that returns the text to search for a value
 * @param params.renderValueLabel - A function that renders the label for a value
 * @param params.searchPlaceholder - An optional override for the derived search placeholder
 * @param params.showSearch - Whether to show a search input
 * @param params.showModeToggle - Whether to show the "Include" / "Exclude" toggle.
 * Disable for columns where the two modes are redundant (e.g. boolean columns).
 */
export function MultiSelectColumnFilter<TData, TValue extends string = string>({
  column,
  allColumnValues,
  getSearchText = (value) => value,
  renderValueLabel = defaultRenderValueLabel,
  searchPlaceholder,
  showSearch = false,
  showModeToggle = true,
}: {
  column: Column<TData, unknown>;
  allColumnValues: TValue[] | readonly TValue[];
  getSearchText?: (value: TValue) => string;
  renderValueLabel?: (props: { value: TValue; isSelected: boolean }) => ReactNode;
  searchPlaceholder?: string;
  showSearch?: boolean;
  showModeToggle?: boolean;
}) {
  const optionId = useId();
  const [search, setSearch] = useState('');
  const columnId = column.id;

  const label =
    column.columnDef.meta?.label ??
    (typeof column.columnDef.header === 'string' ? column.columnDef.header : column.id);

  const filterValue =
    (column.getFilterValue() as MultiSelectFilterValue<TValue> | undefined) ??
    (EMPTY_INCLUDE as MultiSelectFilterValue<TValue>);
  const { values, mode } = filterValue;
  const selected = new Set(values);
  const hasActiveFilter = values.length > 0;
  const options = allColumnValues.map((value, index) => ({
    id: `${optionId}-option-${index}`,
    value,
  }));
  const visibleOptions =
    showSearch && search
      ? options
          .map((option) => ({ ...option, rank: rankItem(getSearchText(option.value), search) }))
          .filter(({ rank }) => rank.passed)
          .sort((a, b) => compareItems(a.rank, b.rank))
      : options;
  const searchLabel = `Search ${label.toLowerCase()}`;

  const apply = (newMode: MultiSelectFilterMode, newSelected: Set<TValue>) => {
    column.setFilterValue({ values: Array.from(newSelected), mode: newMode });
  };

  const toggleValue = (value: TValue) => {
    const next = new Set(selected);
    if (next.has(value)) {
      next.delete(value);
    } else {
      next.add(value);
    }
    apply(mode, next);
  };

  return (
    <DialogTrigger onOpenChange={(isOpen) => !isOpen && setSearch('')}>
      <Button
        className="btn btn-link dropdown-toggle text-muted p-0"
        id={`filter-${columnId}`}
        aria-label={`Filter ${label.toLowerCase()}`}
      >
        <i
          className={clsx('bi', hasActiveFilter ? ['bi-funnel-fill', 'text-primary'] : 'bi-funnel')}
          aria-hidden="true"
        />
      </Button>
      <Popover className="bg-body border rounded p-0" placement="bottom end" offset={2}>
        <div className="p-3 pb-0">
          <div className="d-flex align-items-center justify-content-between mb-2">
            <div className="fw-semibold text-nowrap">{label}</div>
            <button
              type="button"
              className={clsx('btn btn-link btn-sm text-decoration-none', {
                // Hide the clear button when the filter is at its default state.
                // Use `visibility` instead of conditional rendering to avoid layout shift.
                invisible: !hasActiveFilter && mode === 'include',
              })}
              onClick={() => apply('include', new Set<TValue>())}
            >
              Clear
            </button>
          </div>

          {showSearch && (
            <input
              type="search"
              className="form-control form-control-sm mb-2"
              value={search}
              placeholder={searchPlaceholder ?? searchLabel}
              aria-label={searchLabel}
              aria-controls={`filter-${columnId}-options`}
              onChange={(event) => setSearch(event.target.value)}
            />
          )}

          {showSearch && (
            <div className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
              {search && (
                <>
                  {visibleOptions.length}{' '}
                  {visibleOptions.length === 1 ? 'matching option' : 'matching options'}
                </>
              )}
            </div>
          )}

          {showModeToggle && (
            <div className="btn-group btn-group-sm w-100 mb-2">
              <input
                type="radio"
                className="btn-check"
                name={`filter-${columnId}-options`}
                id={`filter-${columnId}-include`}
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
          )}
        </div>

        <div
          id={`filter-${columnId}-options`}
          className="list-group list-group-flush"
          style={
            {
              // This is needed to prevent the last item's background from covering
              // the dropdown's border radius.
              '--bs-list-group-bg': 'transparent',
              maxHeight: 'min(500px, 50vh)',
              overflowY: 'auto',
            } as React.CSSProperties
          }
        >
          {showSearch && search && visibleOptions.length === 0 ? (
            <div className="list-group-item text-muted text-center">No matching options</div>
          ) : (
            visibleOptions.map(({ id, value }) => {
              const isSelected = selected.has(value);
              return (
                <div key={id} className="list-group-item d-flex align-items-center gap-3">
                  <div className="form-check">
                    <input
                      id={id}
                      className="form-check-input"
                      type="checkbox"
                      value={value}
                      checked={isSelected}
                      onChange={() => toggleValue(value)}
                    />
                    <label className="form-check-label fw-normal" htmlFor={id}>
                      {renderValueLabel({
                        value,
                        isSelected,
                      })}
                    </label>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Popover>
    </DialogTrigger>
  );
}

/**
 * Helper for column `filterFn`s using `MultiSelectFilterValue`. Given a row
 * and a function that returns whether the row matches the include semantics
 * for the column, returns the appropriate result depending on the filter mode.
 */
export function applyMultiSelectFilter<TValue extends string>(
  filter: MultiSelectFilterValue<TValue> | undefined,
  matches: (values: TValue[]) => boolean,
): boolean {
  if (!filter || filter.values.length === 0) return true;
  const matched = matches(filter.values);
  return filter.mode === 'include' ? matched : !matched;
}
