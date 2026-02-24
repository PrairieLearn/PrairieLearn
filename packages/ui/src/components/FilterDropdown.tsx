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

// This interface isn't very generic.
// TODO: When this component is more widely used, improve this.
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
  /** Maximum height of the dropdown in pixels. */
  maxHeight?: number;
  /** Item IDs that should appear at the top of the list in their original order */
  pinnedIds?: Set<string>;
}

function compareItemsByName(a: FilterItem, b: FilterItem) {
  return a.name.localeCompare(b.name, undefined, { numeric: true });
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
export function FilterDropdown({
  label,
  items,
  selectedIds,
  onChange,
  renderItem = defaultRenderItem,
  disabled = false,
  'aria-label': ariaLabel,
  maxHeight,
  pinnedIds,
}: FilterDropdownProps) {
  const selectedCount = selectedIds.size;

  // Sort items alphabetically for display, with pinned items first
  const sortedItems = useMemo(() => {
    if (!pinnedIds || pinnedIds.size === 0) {
      return [...items].sort(compareItemsByName);
    }
    const pinned = items.filter((item) => pinnedIds.has(item.id));
    const rest = items.filter((item) => !pinnedIds.has(item.id)).sort(compareItemsByName);
    return [...pinned, ...rest];
  }, [items, pinnedIds]);

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
        className="dropdown-menu show py-0 d-flex flex-column"
        offset={4}
        placement="bottom start"
        maxHeight={maxHeight}
        style={{ width: '250px' }}
      >
        <div className="pt-2 flex-grow-1 overflow-auto" style={{ minHeight: 0 }}>
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
            <Separator className="dropdown-divider mb-0" />
            <div className="px-3 py-1">
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
