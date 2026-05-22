import type { ReactNode } from 'react';
import { Dropdown } from 'react-bootstrap';

import type { StaffStudentLabel } from '../lib/client/safe-db-types.js';

export function StudentLabelDropdown({
  labels,
  selectedIds,
  onToggle,
  disabled,
  isOptionDisabled,
  getOptionDisabledReason,
  footer,
  buttonLabel = 'Edit labels',
}: {
  labels: StaffStudentLabel[];
  selectedIds: Set<string>;
  onToggle: (label: StaffStudentLabel) => void;
  disabled?: boolean;
  isOptionDisabled?: (label: StaffStudentLabel) => boolean;
  getOptionDisabledReason?: (label: StaffStudentLabel) => string | undefined;
  footer?: ReactNode;
  buttonLabel?: string;
}) {
  return (
    <Dropdown autoClose="outside">
      <Dropdown.Toggle variant="outline-primary" size="sm" disabled={disabled}>
        <i className="bi bi-tags me-1" aria-hidden="true" />
        {buttonLabel}
      </Dropdown.Toggle>
      <Dropdown.Menu>
        {labels.length === 0 ? (
          <Dropdown.ItemText className="text-muted">No student labels available</Dropdown.ItemText>
        ) : (
          labels.map((label) => {
            const isSelected = selectedIds.has(label.id);
            const optionDisabled = disabled || (isOptionDisabled?.(label) ?? false);
            return (
              <Dropdown.Item
                key={label.id}
                as="label"
                htmlFor={`student-label-${label.id}`}
                className="d-flex align-items-center gap-2"
                disabled={optionDisabled}
                title={getOptionDisabledReason?.(label)}
              >
                <input
                  type="checkbox"
                  id={`student-label-${label.id}`}
                  className="form-check-input mt-0 flex-shrink-0"
                  checked={isSelected}
                  disabled={optionDisabled}
                  onChange={() => onToggle(label)}
                />
                {label.color && (
                  <span
                    className="d-inline-block rounded-circle flex-shrink-0"
                    style={{
                      width: '10px',
                      height: '10px',
                      backgroundColor: label.color,
                    }}
                  />
                )}
                <span>{label.name}</span>
              </Dropdown.Item>
            );
          })
        )}
        {footer && (
          <>
            <Dropdown.Divider />
            {footer}
          </>
        )}
      </Dropdown.Menu>
    </Dropdown>
  );
}
