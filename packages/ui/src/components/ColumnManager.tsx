import { type Column, type Table } from '@tanstack/react-table';
import clsx from 'clsx';
import { type JSX, useEffect, useRef, useState } from 'preact/compat';
import Button from 'react-bootstrap/Button';
import Dropdown from 'react-bootstrap/Dropdown';

interface ColumnMenuItemProps<RowDataModel> {
  column: Column<RowDataModel>;
  hidePinButton: boolean;
  onTogglePin: (columnId: string) => void;
  className?: string;
}

function ColumnLeafItem<RowDataModel>({
  column,
  hidePinButton = false,
  onTogglePin,
  className,
}: ColumnMenuItemProps<RowDataModel>) {
  if (!column.getCanHide()) return null;

  // Use meta.label if available, otherwise fall back to header or column.id
  const header =
    column.columnDef.meta?.label ??
    (typeof column.columnDef.header === 'string' ? column.columnDef.header : column.id);

  return (
    <div
      key={column.id}
      class={clsx('px-2 py-1 d-flex align-items-center justify-content-between', className)}
    >
      <label class="form-check me-auto text-nowrap d-flex align-items-stretch">
        <input
          type="checkbox"
          class="form-check-input"
          checked={column.getIsVisible()}
          disabled={!column.getCanHide()}
          aria-label={column.getIsVisible() ? `Hide '${header}' column` : `Show '${header}' column`}
          aria-describedby={`${column.id}-label`}
          onChange={column.getToggleVisibilityHandler()}
        />
        <span class="form-check-label ms-2" id={`${column.id}-label`}>
          {header}
        </span>
      </label>
      {column.getCanPin() && !hidePinButton && (
        <button
          type="button"
          // Since the HTML changes, but we want to refocus the pin button, we track
          // the active pin button and refocuses it when the column manager is rerendered.
          id={`${column.id}-pin`}
          class="btn btn-sm btn-ghost ms-2"
          aria-label={
            column.getIsPinned() ? `Unfreeze '${header}' column` : `Freeze '${header}'  column`
          }
          title={column.getIsPinned() ? 'Unfreeze column' : 'Freeze column'}
          data-bs-toggle="tooltip"
          onClick={() => onTogglePin(column.id)}
        >
          <i class={`bi ${column.getIsPinned() ? 'bi-x' : 'bi-snow'}`} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

function ColumnGroupItem<RowDataModel>({
  column,
  onTogglePin,
  getHidePinButton,
}: {
  column: Column<RowDataModel>;
  onTogglePin: (columnId: string) => void;
  getHidePinButton: (columnId: string) => boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  const leafColumns = column.getLeafColumns();
  const visibleLeafColumns = leafColumns.filter((c) => c.getIsVisible());
  const isAllVisible = visibleLeafColumns.length === leafColumns.length;
  const isSomeVisible = visibleLeafColumns.length > 0 && !isAllVisible;

  const handleToggleVisibility = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    const targetVisibility = !isAllVisible;
    leafColumns.forEach((col) => {
      if (col.getCanHide()) {
        col.toggleVisibility(targetVisibility);
      }
    });
  };

  // Use meta.label if available, otherwise fall back to header or column.id
  const header =
    column.columnDef.meta?.label ??
    (typeof column.columnDef.header === 'string' ? column.columnDef.header : column.id);

  return (
    <div class="d-flex flex-column">
      <div class="px-2 py-1 d-flex align-items-center justify-content-between">
        <div class="d-flex align-items-center flex-grow-1">
          <input
            type="checkbox"
            class="form-check-input flex-shrink-0"
            checked={isAllVisible}
            indeterminate={isSomeVisible}
            aria-label={`Toggle visibility for group '${header}'`}
            onChange={handleToggleVisibility}
          />
          <button
            type="button"
            class="btn btn-link text-decoration-none text-reset w-100 text-start d-flex align-items-center justify-content-between ps-2 py-0 pe-0"
            aria-expanded={isExpanded}
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
          >
            <span class="fw-bold text-truncate">{header}</span>
            <i
              class={clsx(
                'bi ms-2 text-muted',
                isExpanded ? 'bi-chevron-down' : 'bi-chevron-right',
              )}
              aria-hidden="true"
            />
          </button>
        </div>
      </div>
      {isExpanded && (
        <div class="ps-3 border-start ms-3 mb-1">
          {column.columns.map((childCol) => (
            <ColumnItem
              key={childCol.id}
              column={childCol}
              getHidePinButton={getHidePinButton}
              onTogglePin={onTogglePin}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ColumnItem<RowDataModel>({
  column,
  onTogglePin,
  getHidePinButton,
}: {
  column: Column<RowDataModel>;
  onTogglePin: (columnId: string) => void;
  getHidePinButton: (columnId: string) => boolean;
}) {
  if (column.columns.length > 0) {
    return (
      <ColumnGroupItem
        column={column}
        getHidePinButton={getHidePinButton}
        onTogglePin={onTogglePin}
      />
    );
  }
  return (
    <ColumnLeafItem
      column={column}
      hidePinButton={getHidePinButton(column.id)}
      onTogglePin={onTogglePin}
    />
  );
}

interface ColumnManagerProps<RowDataModel> {
  table: Table<RowDataModel>;
  topContent?: JSX.Element;
}

export function ColumnManager<RowDataModel>({
  table,
  topContent,
}: ColumnManagerProps<RowDataModel>) {
  const [activeElementId, setActiveElementId] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const handleTogglePin = (columnId: string) => {
    const currentLeft = table.getState().columnPinning.left ?? [];
    const isPinned = currentLeft.includes(columnId);
    const allLeafColumns = table.getAllLeafColumns();
    const currentColumnIndex = allLeafColumns.findIndex((c) => c.id === columnId);
    let newLeft: string[];
    if (isPinned) {
      // Get the previous column that can be set to unpinned.
      // This is useful since we want to unpin/pin columns that are not shown in the view manager.
      const previousFrozenColumnIndex = allLeafColumns.findLastIndex(
        (c, index) => c.getCanHide() && index < currentColumnIndex,
      );
      newLeft = allLeafColumns.slice(0, previousFrozenColumnIndex + 1).map((c) => c.id);
    } else {
      // Pin all columns to the left of the current column.
      const leftColumns = allLeafColumns.slice(0, currentColumnIndex + 1);
      newLeft = leftColumns.map((c) => c.id);
    }
    table.setColumnPinning({ left: newLeft, right: [] });
    setActiveElementId(`${columnId}-pin`);
  };

  const isVisibilityChanged = Object.entries(table.getState().columnVisibility).some(
    ([key, value]) => {
      return value !== table.initialState.columnVisibility[key];
    },
  );

  const initialPinning = table.initialState.columnPinning.left ?? [];
  const currentPinning = table.getState().columnPinning.left ?? [];
  const isPinningChanged =
    initialPinning.length !== currentPinning.length ||
    initialPinning.some((id) => !currentPinning.includes(id));
  const showResetButton = isVisibilityChanged || isPinningChanged;

  const allLeafColumns = table.getAllLeafColumns();
  const unpinnableColumns = allLeafColumns.filter(
    (c) => c.getCanHide() && c.getIsPinned() === 'left',
  );
  const pinnableColumns = allLeafColumns.filter(
    (c) => c.getCanHide() && c.getIsPinned() !== 'left',
  );

  // Calculate which columns should have their pin buttons hidden:
  // - Columns that are part of a group (have a parent) cannot be pinned
  // - For pinned columns: only the last one can be unpinned
  // - For unpinned columns: only the first one can be pinned
  const getHidePinButton = (columnId: string) => {
    const column = allLeafColumns.find((c) => c.id === columnId);
    if (!column) return true;

    // If the column is part of a group (has a parent), it cannot be pinned
    if (column.parent) {
      return true;
    }

    if (column.getIsPinned() === 'left') {
      // Only the last pinned column can be unpinned
      const pinnedIndex = pinnableColumns.findIndex((c) => c.id === columnId);
      return pinnedIndex !== pinnableColumns.length - 1;
    } else {
      // Only the first unpinned column can be pinned
      const unpinnedIndex = unpinnableColumns.findIndex((c) => c.id === columnId);
      return unpinnedIndex !== 0;
    }
  };

  // Get root columns (for showing hierarchy), but filter to only show unpinned ones
  // We'll show pinned columns separately in the "Frozen columns" section
  const unpinnedRootColumns = table.getAllColumns().filter((c) => {
    if (c.depth !== 0) return false;
    // A root column is considered unpinned if all its leaf columns are unpinned
    const leafCols = c.getLeafColumns();
    return leafCols.length > 0 && leafCols.every((leaf) => leaf.getIsPinned() !== 'left');
  });

  useEffect(() => {
    // When we use the pin or reset button, we want to refocus to another element.
    // We want this in a useEffect so that this code runs after the component re-renders.

    // eslint-disable-next-line react-you-might-not-need-an-effect/no-event-handler
    if (activeElementId) {
      document.getElementById(activeElementId)?.focus();
    }
  }, [activeElementId]);

  return (
    <Dropdown
      ref={menuRef}
      autoClose="outside"
      show={dropdownOpen}
      onToggle={(isOpen, _meta) => setDropdownOpen(isOpen)}
      onFocusOut={(e: FocusEvent) => {
        // Since we aren't using role="menu", we need to manually close the dropdown when focus leaves.
        if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
          setDropdownOpen(false);
        }
      }}
    >
      <Dropdown.Toggle
        // We assume that this component will only appear once per page. If that changes,
        // we'll need to do something to ensure ID uniqueness here.
        id="column-manager"
        variant="tanstack-table"
      >
        <i class="bi bi-view-list me-2" aria-hidden="true" /> View{' '}
      </Dropdown.Toggle>
      <Dropdown.Menu style={{ maxHeight: '60vh', overflowY: 'auto' }}>
        {topContent && (
          <>
            {topContent}
            <Dropdown.Divider />
          </>
        )}
        {pinnableColumns.length > 0 && (
          <>
            <div class="px-2 py-1 text-muted small" role="presentation">
              Frozen columns
            </div>
            <div role="group">
              {/* Only leaf columns can be pinned in the current implementation. */}
              {pinnableColumns.map((column, index) => {
                return (
                  <ColumnLeafItem
                    key={column.id}
                    column={column}
                    hidePinButton={index !== pinnableColumns.length - 1}
                    onTogglePin={handleTogglePin}
                  />
                );
              })}
            </div>
            <Dropdown.Divider />
          </>
        )}
        {unpinnedRootColumns.length > 0 && (
          <>
            <div role="group">
              {unpinnedRootColumns.map((column) => {
                // For root columns, only pass hidePinButton if it's a leaf column
                // Group columns don't have pin buttons, so hidePinButton doesn't apply
                // const hidePinButton =
                //   column.columns.length === 0 ? getHidePinButton(column.id) : true;
                return (
                  <ColumnItem
                    key={column.id}
                    column={column}
                    getHidePinButton={getHidePinButton}
                    onTogglePin={handleTogglePin}
                  />
                );
              })}
            </div>
            {showResetButton && <Dropdown.Divider />}
          </>
        )}
        {showResetButton && (
          <div class="px-2 py-1">
            <Button
              variant="secondary"
              size="sm"
              class="w-100"
              aria-label="Reset all columns to default visibility and pinning"
              onClick={() => {
                table.resetColumnVisibility();
                table.resetColumnPinning();
                // Move focus to the column manager button after resetting.
                setActiveElementId('column-manager');
              }}
            >
              <i class="bi bi-arrow-counterclockwise me-2" aria-hidden="true" />
              Reset view
            </Button>
          </div>
        )}
      </Dropdown.Menu>
    </Dropdown>
  );
}
