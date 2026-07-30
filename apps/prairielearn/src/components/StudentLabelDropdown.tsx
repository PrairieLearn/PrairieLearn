import type { ReactNode } from 'react';
import { Dropdown } from 'react-bootstrap';

import type { StaffStudentLabel } from '../lib/client/safe-db-types.js';

export function StudentLabelDropdown({
  labels,
  selectedIds,
  onToggle,
  disabled,
  footer,
  buttonLabel = 'Edit labels',
  maxSelected,
}: {
  labels: StaffStudentLabel[];
  selectedIds: Set<string>;
  onToggle: (label: StaffStudentLabel) => void;
  disabled?: boolean;
  footer?: ReactNode;
  buttonLabel?: string;
  maxSelected?: number;
}) {
  const maxSelectedReason =
    maxSelected === undefined
      ? undefined
      : `At most ${maxSelected} student labels can be selected.`;
  const maxSelectedReached = maxSelected !== undefined && selectedIds.size >= maxSelected;

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
            const disabledReason =
              !isSelected && maxSelectedReached ? maxSelectedReason : undefined;
            const optionDisabled = disabled || disabledReason !== undefined;
            return (
              <Dropdown.Item
                key={label.id}
                as="label"
                htmlFor={`student-label-${label.id}`}
                className="d-flex align-items-center gap-2"
                disabled={optionDisabled}
                title={disabledReason}
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
