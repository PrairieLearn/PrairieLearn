import type { ColumnFiltersState, Table } from '@tanstack/react-table';
import { useMemo } from 'preact/compat';
import { ButtonGroup, Dropdown } from 'react-bootstrap';

/**
 * Compares two filter values for deep equality using JSON serialization.
 */
function filtersEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Extracts all unique column IDs referenced across all preset options.
 */
function getRelevantColumnIds(options: Record<string, ColumnFiltersState>): Set<string> {
  const columnIds = new Set<string>();
  for (const filters of Object.values(options)) {
    for (const filter of filters) {
      columnIds.add(filter.id);
    }
  }
  return columnIds;
}

/**
 * Gets the current filter values for the relevant columns from the table.
 */
function getRelevantFilters<TData>(
  table: Table<TData>,
  relevantColumnIds: Set<string>,
): ColumnFiltersState {
  const allFilters = table.getState().columnFilters;
  return allFilters.filter((f) => relevantColumnIds.has(f.id));
}

/**
 * Checks if the current filters match a preset's filters.
 * Both must have the same column IDs with equal values.
 */
function filtersMatchPreset(current: ColumnFiltersState, preset: ColumnFiltersState): boolean {
  // If lengths differ, they don't match
  if (current.length !== preset.length) return false;

  // For empty presets, current must also be empty
  if (preset.length === 0) return current.length === 0;

  // Check that every preset filter exists in current with the same value
  for (const presetFilter of preset) {
    const currentFilter = current.find((f) => f.id === presetFilter.id);
    if (!currentFilter || !filtersEqual(currentFilter.value, presetFilter.value)) {
      return false;
    }
  }

  return true;
}

/**
 * A dropdown component that allows users to select from preset filter configurations.
 * The selected state is derived from the table's current column filters.
 * If no preset matches, a "Custom" option is shown as selected.
 *
 * Currently, this component expects that the filters states are arrays.
 */
export function PresetFilterDropdown<OptionName extends string, TData>({
  table,
  options,
  label = 'Filter',
  onSelect,
}: {
  /** The TanStack Table instance */
  table: Table<TData>;
  /** Mapping of option names to their filter configurations */
  options: Record<OptionName, ColumnFiltersState>;
  /** Label prefix for the dropdown button (e.g., "Filter") */
  label?: string;
  /** Callback when an option is selected, useful for side effects like column visibility */
  onSelect?: (optionName: OptionName) => void;
}) {
  const relevantColumnIds = getRelevantColumnIds(options);

  const currentRelevantFilters = useMemo(
    () => getRelevantFilters(table, relevantColumnIds),
    [table, relevantColumnIds],
  );

  // Find which option matches the current filters
  const selectedOption = useMemo<OptionName | null>(() => {
    for (const [optionName, presetFilters] of Object.entries(options)) {
      if (filtersMatchPreset(currentRelevantFilters, presetFilters as ColumnFiltersState)) {
        return optionName as OptionName;
      }
    }
    return null; // No preset matches - custom filter state
  }, [options, currentRelevantFilters]);

  const handleOptionClick = (optionName: OptionName) => {
    const presetFilters = options[optionName];

    // Get current filters, removing any that are in our relevant columns
    const currentFilters = table.getState().columnFilters;
    const preservedFilters = currentFilters.filter((f) => !relevantColumnIds.has(f.id));

    // For columns not in the preset, explicitly set empty filter to clear them
    // This ensures the table's onColumnFiltersChange handler can sync the cleared state
    const clearedFilters = Array.from(relevantColumnIds)
      .filter((colId) => !presetFilters.some((f) => f.id === colId))
      .map((colId) => ({
        id: colId,
        // TODO: This expects that we are only clearing filters whose state is an array.
        value: [],
      }));

    // Combine preserved filters with the new preset filters and cleared filters
    const newFilters = [...preservedFilters, ...presetFilters, ...clearedFilters];
    table.setColumnFilters(newFilters);

    onSelect?.(optionName);
  };

  const displayLabel = selectedOption ?? 'Custom';

  return (
    <Dropdown as={ButtonGroup}>
      <Dropdown.Toggle variant="tanstack-table">
        <i class="bi bi-funnel me-2" aria-hidden="true" />
        {label}: {displayLabel}
      </Dropdown.Toggle>
      <Dropdown.Menu>
        {Object.keys(options).map((optionName) => {
          const isSelected = selectedOption === optionName;
          return (
            <Dropdown.Item
              key={optionName}
              as="button"
              type="button"
              active={isSelected}
              onClick={() => handleOptionClick(optionName as OptionName)}
            >
              <i class={`bi ${isSelected ? 'bi-check-circle-fill' : 'bi-circle'} me-2`} />
              {optionName}
            </Dropdown.Item>
          );
        })}
        {/* Show Custom option only when no preset matches */}
        {selectedOption === null && (
          <Dropdown.Item as="button" type="button" active disabled>
            <i class="bi bi-check-circle-fill me-2" />
            Custom
          </Dropdown.Item>
        )}
      </Dropdown.Menu>
    </Dropdown>
  );
}
