import clsx from 'clsx';
import { type ReactNode, useState } from 'react';

import { IndeterminateCheckbox } from './IndeterminateCheckbox.js';

export interface ExpandableCheckboxGroupProps {
  /** The label displayed in the expandable header. */
  label: string;
  /** Whether all items in the group are checked. */
  checked: boolean;
  /** Whether some (but not all) items in the group are checked. */
  indeterminate: boolean;
  /** Accessible label for the group checkbox. */
  'aria-label': string;
  /** Called when the group checkbox is toggled. */
  onToggle: () => void;
  /** Optional content rendered after the expand button in the header row. */
  headerExtra?: ReactNode;
  /** The child items rendered when the group is expanded. */
  children: ReactNode;
}

export function ExpandableCheckboxGroup({
  label,
  checked,
  indeterminate,
  'aria-label': ariaLabel,
  onToggle,
  headerExtra,
  children,
}: ExpandableCheckboxGroupProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="d-flex flex-column">
      <div className="px-2 py-1 d-flex align-items-center">
        <IndeterminateCheckbox
          className="form-check-input flex-shrink-0"
          checked={checked}
          indeterminate={indeterminate}
          aria-label={ariaLabel}
          onChange={onToggle}
        />
        <button
          type="button"
          className="btn btn-link text-decoration-none text-reset w-100 text-start d-flex align-items-center justify-content-between ps-2 py-0 pe-0"
          aria-expanded={isExpanded}
          onClick={(e) => {
            e.stopPropagation();
            setIsExpanded(!isExpanded);
          }}
        >
          <span className="fw-bold text-truncate">{label}</span>
          <i
            className={clsx(
              'bi ms-2 text-muted',
              isExpanded ? 'bi-chevron-down' : 'bi-chevron-right',
            )}
            aria-hidden="true"
          />
        </button>
        {headerExtra}
      </div>
      {isExpanded && <div className="ps-3 border-start ms-3 mb-1">{children}</div>}
    </div>
  );
}
