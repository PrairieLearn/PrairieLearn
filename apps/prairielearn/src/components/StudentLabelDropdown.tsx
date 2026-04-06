import type { ReactNode } from 'react';
import { Dropdown } from 'react-bootstrap';

import type { StaffStudentLabel } from '../lib/client/safe-db-types.js';

export function StudentLabelDropdown({
  labels,
  selectedIds,
  onToggle,
  disabled,
  footer,
}: {
  labels: StaffStudentLabel[];
  selectedIds: Set<string>;
  onToggle: (label: StaffStudentLabel) => void;
  disabled?: boolean;
  footer?: ReactNode;
}) {
  return (
    <Dropdown>
      <Dropdown.Toggle variant="outline-primary" size="sm" disabled={disabled}>
        <i className="bi bi-plus me-1" aria-hidden="true" />
        Add label
      </Dropdown.Toggle>
      <Dropdown.Menu>
        {labels.length === 0 ? (
          <Dropdown.ItemText className="text-muted">No student labels available</Dropdown.ItemText>
        ) : (
          labels.map((label) => {
            const isSelected = selectedIds.has(label.id);
            return (
              <Dropdown.Item
                key={label.id}
                active={isSelected}
                disabled={disabled}
                onClick={(e) => {
                  e.preventDefault();
                  onToggle(label);
                }}
              >
                <span className="d-flex align-items-center gap-2">
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
                  <span className="flex-grow-1">{label.name}</span>
                  {isSelected && <i className="bi bi-check" aria-hidden="true" />}
                </span>
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
