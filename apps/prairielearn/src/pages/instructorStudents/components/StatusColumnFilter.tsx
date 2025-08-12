import { type Column } from '@tanstack/react-table';
import clsx from 'clsx';
import { useState } from 'preact/compat';
import Dropdown from 'react-bootstrap/Dropdown';

import { EnrollmentStatusIcon } from '../../../components/EnrollmentStatusIcon.js';
import { EnumEnrollmentStatusSchema } from '../../../lib/db-types.js';
import type { StudentRow } from '../instructorStudents.shared.js';

const STATUS_VALUES = Object.values(EnumEnrollmentStatusSchema.Values);

export function StatusColumnFilter({ column }: { column: Column<StudentRow, unknown> }) {
  const [mode, setMode] = useState<'include' | 'exclude'>('include');
  const [selected, setSelected] = useState<string[]>([]);

  const computeEffectiveIncluded = (m: 'include' | 'exclude', sel: string[]) =>
    m === 'exclude' ? STATUS_VALUES.filter((s) => !sel.includes(s)) : sel;

  const toggleSelected = (status: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      const nextArray = Array.from(next);
      column.setFilterValue(computeEffectiveIncluded(mode, nextArray));
      return nextArray;
    });
  };

  const clear = () => {
    setSelected([]);
    column.setFilterValue([]);
  };

  const switchMode = (newMode: 'include' | 'exclude') => {
    setMode(newMode);
    column.setFilterValue(computeEffectiveIncluded(newMode, selected));
  };

  return (
    <Dropdown align="end">
      <Dropdown.Toggle
        variant="link"
        class="text-muted p-0 ms-2"
        id={`filter-${column.id}`}
        aria-label="Filter status"
        title="Filter status"
      >
        <i
          class={clsx('bi', selected.length > 0 ? ['bi-funnel-fill', 'text-primary'] : 'bi-funnel')}
          aria-hidden="true"
        />
      </Dropdown.Toggle>
      <Dropdown.Menu class="p-0">
        <div class="p-3">
          <div class="d-flex align-items-center justify-content-between mb-2">
            <div class="fw-semibold">Status</div>
            <button type="button" class="btn btn-link btn-sm text-decoration-none" onClick={clear}>
              Clear
            </button>
          </div>

          <div class="btn-group w-100 mb-2" role="group" aria-label="Include or exclude statuses">
            <button
              type="button"
              class={clsx('btn', mode === 'include' ? 'btn-primary' : 'btn-outline-secondary')}
              onClick={() => switchMode('include')}
            >
              Include
            </button>
            <button
              type="button"
              class={clsx('btn', mode === 'exclude' ? 'btn-primary' : 'btn-outline-secondary')}
              onClick={() => switchMode('exclude')}
            >
              Exclude
            </button>
          </div>

          <div class="list-group list-group-flush">
            {STATUS_VALUES.map((status) => {
              const checked = selected.includes(status);
              return (
                <div key={status} class="list-group-item d-flex align-items-center gap-3">
                  <input
                    class="form-check-input"
                    type="checkbox"
                    checked={checked}
                    id={`status-${status}`}
                    readOnly
                    onChange={() => toggleSelected(status)}
                  />
                  <label class="form-check-label" for={`status-${status}`}>
                    <EnrollmentStatusIcon status={status} />
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
