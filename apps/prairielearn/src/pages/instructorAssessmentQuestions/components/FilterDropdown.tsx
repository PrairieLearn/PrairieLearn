import { useMemo, useRef, useState } from 'react';
import { Dropdown } from 'react-bootstrap';

export interface FilterItem {
  id: string;
  name: string;
  color?: string;
}

export interface FilterDropdownProps {
  label: string;
  items: FilterItem[];
  selectedIds: Set<string>;
  onChange: (selectedIds: Set<string>) => void;
}

/**
 * A multi-select filter dropdown component.
 * Displays a button trigger with selection count badge and a dropdown with checkboxes.
 */
export function FilterDropdown({ label, items, selectedIds, onChange }: FilterDropdownProps) {
  const [show, setShow] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);

  const selectedCount = selectedIds.size;

  const handleToggle = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    onChange(newSelected);
  };

  const handleClear = () => {
    onChange(new Set());
  };

  // Sort items alphabetically for display
  const sortedItems = useMemo(
    () => [...items].sort((a, b) => a.name.localeCompare(b.name)),
    [items],
  );

  return (
    <Dropdown show={show} onToggle={setShow}>
      <Dropdown.Toggle
        ref={toggleRef}
        variant={selectedCount > 0 ? 'outline-primary' : 'outline-secondary'}
        size="sm"
        className="d-flex align-items-center gap-1"
      >
        {label}
        {selectedCount > 0 && (
          <span className="badge bg-primary rounded-pill">{selectedCount}</span>
        )}
      </Dropdown.Toggle>
      <Dropdown.Menu style={{ maxHeight: '300px', width: '250px', overflow: 'auto' }}>
        {selectedCount > 0 && (
          <>
            <div className="px-3 py-2">
              <button
                type="button"
                className="btn btn-sm btn-link p-0 text-decoration-none"
                onClick={handleClear}
              >
                Clear selection
              </button>
            </div>
            <Dropdown.Divider className="my-0" />
          </>
        )}
        {sortedItems.map((item) => (
          <Dropdown.ItemText
            key={item.id}
            as="label"
            className="d-flex align-items-center gap-2 py-2 px-3"
            style={{ cursor: 'pointer' }}
          >
            <input
              type="checkbox"
              className="form-check-input m-0"
              checked={selectedIds.has(item.id)}
              onChange={() => handleToggle(item.id)}
            />
            {item.color ? (
              <span className={`badge color-${item.color}`}>{item.name}</span>
            ) : (
              <span>{item.name}</span>
            )}
          </Dropdown.ItemText>
        ))}
        {sortedItems.length === 0 && (
          <Dropdown.ItemText className="text-muted">No items available</Dropdown.ItemText>
        )}
      </Dropdown.Menu>
    </Dropdown>
  );
}
