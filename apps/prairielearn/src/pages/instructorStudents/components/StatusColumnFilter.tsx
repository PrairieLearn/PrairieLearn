import clsx from 'clsx';
import { useMemo, useState } from 'preact/compat';
import Dropdown from 'react-bootstrap/Dropdown';

import { EnrollmentStatusIcon } from '../../../components/EnrollmentStatusIcon.js';
import type { EnumEnrollmentStatus } from '../../../lib/db-types.js';
import { STATUS_VALUES } from '../instructorStudents.shared.js';

const computeSelected = (mode: 'include' | 'exclude', selected: Set<EnumEnrollmentStatus>) => {
  if (mode === 'include') {
    return selected;
  }
  return new Set(STATUS_VALUES.filter((s) => !selected.has(s)));
};

export function StatusColumnFilter({
  columnId,
  enrollmentStatusFilter,
  setEnrollmentStatusFilter,
}: {
  columnId: string;
  enrollmentStatusFilter: EnumEnrollmentStatus[];
  setEnrollmentStatusFilter: (value: EnumEnrollmentStatus[]) => void;
}) {
  const [mode, setModeQuery] = useState<'include' | 'exclude'>('include');

  const selected = useMemo(
    () => computeSelected(mode, new Set(enrollmentStatusFilter)),
    [mode, enrollmentStatusFilter],
  );

  const apply = (newMode: 'include' | 'exclude', newSelected: Set<EnumEnrollmentStatus>) => {
    const selected = computeSelected(newMode, newSelected);
    setModeQuery(newMode);
    setEnrollmentStatusFilter(Array.from(selected));
  };

  const toggleSelected = (status: EnumEnrollmentStatus) => {
    const set = new Set(selected);
    if (set.has(status)) {
      set.delete(status);
    } else {
      set.add(status);
    }
    apply(mode, set);
  };

  return (
    <Dropdown align="end">
      <Dropdown.Toggle
        variant="link"
        class="text-muted p-0 ms-2"
        id={`filter-${columnId}`}
        aria-label="Filter status"
        title="Filter status"
      >
        <i
          class={clsx('bi', selected.size > 0 ? ['bi-funnel-fill', 'text-primary'] : 'bi-funnel')}
          aria-hidden="true"
        />
      </Dropdown.Toggle>
      <Dropdown.Menu class="p-0">
        <div class="p-3">
          <div class="d-flex align-items-center justify-content-between mb-2">
            <div class="fw-semibold">Status</div>
            <button
              type="button"
              class="btn btn-link btn-sm text-decoration-none"
              onClick={() => apply(mode, new Set())}
            >
              Clear
            </button>
          </div>

          <div class="btn-group w-100 mb-2" role="group" aria-label="Include or exclude statuses">
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
            {STATUS_VALUES.map((status) => {
              const checked = selected.has(status);
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
