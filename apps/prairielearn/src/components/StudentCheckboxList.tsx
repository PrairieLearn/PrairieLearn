import clsx from 'clsx';
import type { ReactNode } from 'react';
import { Button, Form } from 'react-bootstrap';

interface StudentCheckboxListItem {
  uid: string;
  name?: string | null;
}

export function StudentCheckboxList<T extends StudentCheckboxListItem>({
  items,
  selectedUids,
  onToggle,
  onSelectAll,
  onDeselectAll,
  label,
  checkboxIdPrefix,
  maxHeight = '200px',
  icon,
  iconColor,
  iconBg,
  description,
  renderItemExtra,
}: {
  items: T[];
  selectedUids: Set<string>;
  onToggle: (uid: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  label: string;
  checkboxIdPrefix: string;
  maxHeight?: string;
  icon?: string;
  iconColor?: string;
  iconBg?: string;
  description?: string;
  renderItemExtra?: (item: T) => ReactNode;
}) {
  const selectedCount = items.filter((item) => selectedUids.has(item.uid)).length;

  return (
    <div className="d-flex flex-column gap-2">
      {icon && (
        <div className="d-flex align-items-center gap-2">
          <div
            className={clsx(
              iconBg,
              'rounded d-flex align-items-center justify-content-center flex-shrink-0',
            )}
            style={{ width: '2.5rem', height: '2.5rem' }}
          >
            <i
              className={clsx('bi', icon, iconColor)}
              style={{ fontSize: '1.25rem' }}
              aria-hidden="true"
            />
          </div>
          <div className="flex-grow-1">
            <h6 className="mb-0">{label}</h6>
            {description && <p className="text-muted small mb-0">{description}</p>}
          </div>
        </div>
      )}

      <div className="border rounded overflow-hidden" role="group" aria-label={label}>
        <div className="d-flex align-items-center px-3 py-2 bg-body-tertiary border-bottom">
          <span className="small text-muted">
            {selectedCount} of {items.length} selected
          </span>
          <div className="d-flex gap-1 ms-auto">
            <Button
              variant="link"
              size="sm"
              className="text-decoration-none"
              aria-label={`Select all ${label.toLowerCase()}`}
              onClick={onSelectAll}
            >
              Select all
            </Button>
            <Button
              variant="link"
              size="sm"
              className="text-decoration-none"
              aria-label={`Clear all ${label.toLowerCase()}`}
              onClick={onDeselectAll}
            >
              Clear all
            </Button>
          </div>
        </div>
        <div style={{ maxHeight, overflowY: 'auto' }}>
          {items.map((item, index) => (
            <div
              key={item.uid}
              className={clsx('px-3 py-2', index !== items.length - 1 && 'border-bottom')}
            >
              <Form.Check
                type="checkbox"
                id={`${checkboxIdPrefix}-${item.uid}`}
                className="d-flex gap-2 align-items-center mb-0"
              >
                <Form.Check.Input
                  type="checkbox"
                  className="mt-0"
                  checked={selectedUids.has(item.uid)}
                  onChange={() => onToggle(item.uid)}
                />
                <Form.Check.Label className="d-flex align-items-center gap-2 flex-grow-1">
                  <span className="d-flex flex-column">
                    <span>{item.uid}</span>
                    {item.name && <span className="text-muted small">{item.name}</span>}
                  </span>
                  {renderItemExtra && <span className="ms-auto">{renderItemExtra(item)}</span>}
                </Form.Check.Label>
              </Form.Check>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
