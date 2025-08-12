import { type Column } from '@tanstack/react-table';
import clsx from 'clsx';
import type { JSX } from 'preact';
import Dropdown from 'react-bootstrap/Dropdown';

import { EnumEnrollmentStatusSchema } from '../../../lib/db-types.js';
import type { StudentRow } from '../instructorStudents.shared.js';

const STATUS_VALUES = Object.values(EnumEnrollmentStatusSchema.Values);

export function StatusColumnFilter({
  column,
}: {
  column: Column<StudentRow, unknown>;
}): JSX.Element {
  const current = (column.getFilterValue() ?? []) as string[];
  const isAllSelected = current.length === 0;

  const toggleValue = (value: string) => {
    const selected = new Set(current);
    if (selected.has(value)) {
      selected.delete(value);
    } else {
      selected.add(value);
    }
    column.setFilterValue(Array.from(selected));
  };

  const clearAll = () => column.setFilterValue([]);

  return (
    <Dropdown align="end">
      <Dropdown.Toggle
        variant="link"
        class="text-muted p-0 ms-2"
        id={`filter-${column.id}`}
        aria-label="Filter status"
        title="Filter status"
      >
        <i class="bi bi-funnel" aria-hidden="true" />
      </Dropdown.Toggle>
      <Dropdown.Menu class="p-2" style={{ minWidth: '16rem' }}>
        <button
          type="button"
          class={clsx('dropdown-item d-flex align-items-center gap-2', isAllSelected && 'active')}
          onClick={clearAll}
        >
          <input class="form-check-input" type="checkbox" checked={isAllSelected} readOnly />
          <span>All statuses</span>
        </button>
        <Dropdown.Divider />
        {STATUS_VALUES.map((value) => {
          const checked = current.includes(value);
          return (
            <button
              key={value}
              type="button"
              class="dropdown-item d-flex align-items-center gap-2"
              onClick={() => toggleValue(value)}
            >
              <input class="form-check-input" type="checkbox" checked={checked} readOnly />
              <span style={{ textTransform: 'capitalize' }}>{value}</span>
            </button>
          );
        })}
        {!isAllSelected && (
          <>
            <Dropdown.Divider />
            <button type="button" class="dropdown-item" onClick={clearAll}>
              Clear filter
            </button>
          </>
        )}
      </Dropdown.Menu>
    </Dropdown>
  );
}
