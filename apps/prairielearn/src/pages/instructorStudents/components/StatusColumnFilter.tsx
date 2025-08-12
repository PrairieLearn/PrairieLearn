import clsx from 'clsx';
import { useMemo, useState } from 'preact/compat';
import Dropdown from 'react-bootstrap/Dropdown';

import { EnrollmentStatusIcon } from '../../../components/EnrollmentStatusIcon.js';
import type { EnumEnrollmentStatus } from '../../../lib/db-types.js';
import { STATUS_VALUES } from '../instructorStudents.shared.js';

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

  // Derive UI-selected checkboxes from URL state
  const selected = useMemo(() => {
    const included = enrollmentStatusFilter;
    if (mode === 'exclude') {
      if (included.length === 0) return STATUS_VALUES; // edge: include none -> exclude all in UI
      // Excluded in UI are those NOT in the included list
      return STATUS_VALUES.filter((s) => !included.includes(s));
    }
    return included;
  }, [mode, enrollmentStatusFilter]);

  const computeEffectiveIncluded = (m: 'include' | 'exclude', sel: EnumEnrollmentStatus[]) => {
    if (m === 'exclude') {
      // No selections -> include all (no filter)
      if (sel.length === 0) return STATUS_VALUES;
      return STATUS_VALUES.filter((s) => !sel.includes(s));
    }
    // Include mode: selections are the included list; empty -> no filter
    return sel;
  };

  const apply = (newMode: 'include' | 'exclude', newSelected: EnumEnrollmentStatus[]) => {
    const effective = computeEffectiveIncluded(newMode, newSelected);
    setModeQuery(newMode);
    setEnrollmentStatusFilter(effective);
  };

  const toggleSelected = (status: EnumEnrollmentStatus) => {
    const set = new Set(selected);
    if (set.has(status)) set.delete(status);
    else set.add(status);
    apply(mode === 'exclude' ? 'exclude' : 'include', Array.from(set));
  };

  const clear = () => {
    // Clear resets to no selections; for exclude mode this becomes include all (no-op filter)
    apply(mode === 'exclude' ? 'exclude' : 'include', []);
  };

  const switchMode = (newMode: 'include' | 'exclude') => {
    apply(newMode, selected);
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
