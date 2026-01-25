import clsx from 'clsx';
import { type ReactNode, useMemo } from 'react';
import {
  Button,
  DialogTrigger,
  ListBox,
  ListBoxItem,
  Popover,
  type Selection,
  Separator,
} from 'react-aria-components';

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
  renderItem?: (item: FilterItem, isSelected: boolean) => ReactNode;
  disabled?: boolean;
  'aria-label'?: string;
  /** Maximum number of items visible before scrolling (default: 20) */
  maxVisibleItems?: number;
}

function defaultRenderItem(item: FilterItem, _isSelected: boolean) {
  return item.color ? (
    <span className={`badge color-${item.color}`}>{item.name}</span>
  ) : (
    <span>{item.name}</span>
  );
}

/**
 * A multi-select filter dropdown component using react-aria-components.
 * Displays a button trigger with selection count badge and a dropdown with checkboxes.
 */
const ITEM_HEIGHT = 38;

export function FilterDropdown({
  label,
  items,
  selectedIds,
  onChange,
  renderItem = defaultRenderItem,
  disabled = false,
  'aria-label': ariaLabel,
  maxVisibleItems = 20,
}: FilterDropdownProps) {
  const selectedCount = selectedIds.size;

  // Sort items alphabetically for display
  const sortedItems = useMemo(
    () => [...items].sort((a, b) => a.name.localeCompare(b.name)),
    [items],
  );

  const handleSelectionChange = (selection: Selection) => {
    if (selection === 'all') {
      onChange(new Set(items.map((item) => item.id)));
    } else {
      onChange(new Set(selection as Set<string>));
    }
  };

  const handleClear = () => {
    onChange(new Set());
  };

  return (
    <DialogTrigger>
      <Button
        aria-label={ariaLabel ?? `Filter by ${label}`}
        className={clsx(
          'btn btn-sm d-flex align-items-center gap-1',
          selectedCount > 0 ? 'btn-outline-primary' : 'btn-outline-secondary',
        )}
        isDisabled={disabled}
      >
        {label}
        {selectedCount > 0 && (
          <span className="badge bg-primary rounded-pill">{selectedCount}</span>
        )}
      </Button>
      <Popover
        className="dropdown-menu show py-0"
        offset={4}
        placement="bottom start"
        style={{ width: '250px' }}
      >
        <div
          className="pt-2"
          style={{
            maxHeight: `${Math.min(sortedItems.length, maxVisibleItems) * ITEM_HEIGHT + 8}px`,
            overflowY: sortedItems.length > maxVisibleItems ? 'auto' : undefined,
          }}
        >
          <ListBox
            aria-label={ariaLabel ?? `Filter by ${label}`}
            className="list-unstyled m-0"
            items={sortedItems}
            selectedKeys={selectedIds}
            selectionMode="multiple"
            selectionBehavior="toggle"
            renderEmptyState={() => (
              <div className="dropdown-item text-muted">No items available</div>
            )}
            onSelectionChange={handleSelectionChange}
          >
            {(item) => (
              <ListBoxItem
                id={item.id}
                className={({ isFocused }) =>
                  clsx('dropdown-item d-flex align-items-center gap-2', isFocused && 'active')
                }
                style={{ cursor: 'pointer' }}
                textValue={item.name}
              >
                {({ isSelected }) => (
                  <>
                    <input
                      checked={isSelected}
                      className="form-check-input m-0 flex-shrink-0"
                      tabIndex={-1}
                      type="checkbox"
                      readOnly
                    />
                    {renderItem(item, isSelected)}
                  </>
                )}
              </ListBoxItem>
            )}
          </ListBox>
        </div>
        {selectedCount > 0 && (
          <>
            <Separator className="dropdown-divider" />
            <div className="px-3 py-2">
              <button
                type="button"
                className="btn btn-sm btn-link p-0 text-decoration-none"
                onClick={handleClear}
              >
                Clear selection
              </button>
            </div>
          </>
        )}
      </Popover>
    </DialogTrigger>
  );
}
