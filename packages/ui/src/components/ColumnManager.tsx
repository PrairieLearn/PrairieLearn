import { type Column, type Table } from '@tanstack/react-table';
import clsx from 'clsx';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import Button from 'react-bootstrap/Button';
import Dropdown from 'react-bootstrap/Dropdown';

interface ColumnMenuItemProps<RowDataModel> {
  column: Column<RowDataModel>;
  onPinningBoundary: boolean;
  onTogglePin: (columnId: string) => void;
  className?: string;
}

function ColumnLeafItem<RowDataModel>({
  column,
  onPinningBoundary = false,
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
      className={clsx('px-2 py-1 d-flex align-items-center justify-content-between', className)}
    >
      <label className="form-check me-auto text-nowrap d-flex align-items-stretch">
        <input
          type="checkbox"
          className="form-check-input"
          checked={column.getIsVisible()}
          disabled={!column.getCanHide()}
          aria-label={column.getIsVisible() ? `Hide '${header}' column` : `Show '${header}' column`}
          aria-describedby={`${column.id}-label`}
          onChange={column.getToggleVisibilityHandler()}
        />
        <span className="form-check-label ms-2" id={`${column.id}-label`}>
          {header}
        </span>
      </label>
      <button
        type="button"
        // Since the HTML changes, but we want to refocus the pin button, we track
        // the active pin button and refocuses it when the column manager is rerendered.
        id={`${column.id}-pin`}
        className={clsx(
          'btn btn-sm btn-ghost ms-2',
          (!column.getCanPin() || !onPinningBoundary) && 'invisible',
        )}
        aria-label={
          column.getIsPinned() ? `Unfreeze '${header}' column` : `Freeze '${header}'  column`
        }
        title={column.getIsPinned() ? 'Unfreeze column' : 'Freeze column'}
        data-bs-toggle="tooltip"
        onClick={() => onTogglePin(column.id)}
      >
        <i className={`bi ${column.getIsPinned() ? 'bi-x' : 'bi-snow'}`} aria-hidden="true" />
      </button>
    </div>
  );
}

function ColumnGroupItem<RowDataModel>({
  column,
  table,
  onTogglePin,
  getIsOnPinningBoundary,
}: {
  column: Column<RowDataModel>;
  table: Table<RowDataModel>;
  onTogglePin: (columnId: string) => void;
  getIsOnPinningBoundary: (columnId: string) => boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const checkboxRef = useRef<HTMLInputElement>(null);

  const leafColumns = column.getLeafColumns();
  const visibleLeafColumns = leafColumns.filter((c) => c.getIsVisible());
  const isAllVisible = visibleLeafColumns.length === leafColumns.length;
  const isSomeVisible = visibleLeafColumns.length > 0 && !isAllVisible;

  // Set indeterminate state via ref since it's a DOM property, not an HTML attribute
  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = isSomeVisible;
    }
  }, [isSomeVisible]);

  const handleToggleVisibility = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const targetVisibility = !isAllVisible;
    // Batch all visibility changes into a single update
    // Doing rapid state updates caused the state updates to not be applied correctly.
    // See https://github.com/PrairieLearn/PrairieLearn/pull/13989
    table.setColumnVisibility((old) => {
      const newVisibility = { ...old };
      leafColumns.forEach((col) => {
        if (col.getCanHide()) {
          newVisibility[col.id] = targetVisibility;
        }
      });
      return newVisibility;
    });
  };

  // Use meta.label if available, otherwise fall back to header or column.id
  const header =
    column.columnDef.meta?.label ??
    (typeof column.columnDef.header === 'string' ? column.columnDef.header : column.id);

  return (
    <div className="d-flex flex-column">
      <div className="px-2 py-1 d-flex align-items-center justify-content-between">
        <div className="d-flex align-items-center flex-grow-1">
          <input
            ref={checkboxRef}
            type="checkbox"
            className="form-check-input flex-shrink-0"
            checked={isAllVisible}
            aria-label={`Toggle visibility for group '${header}'`}
            onChange={handleToggleVisibility}
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
            <span className="fw-bold text-truncate">{header}</span>
            <i
              className={clsx(
                'bi ms-2 text-muted',
                isExpanded ? 'bi-chevron-down' : 'bi-chevron-right',
              )}
              aria-hidden="true"
            />
          </button>
        </div>
      </div>
      {isExpanded && (
        <div className="ps-3 border-start ms-3 mb-1">
          {column.columns.map((childCol) => (
            <ColumnItem
              key={childCol.id}
              column={childCol}
              table={table}
              getIsOnPinningBoundary={getIsOnPinningBoundary}
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
  table,
  onTogglePin,
  getIsOnPinningBoundary,
}: {
  column: Column<RowDataModel>;
  table: Table<RowDataModel>;
  onTogglePin: (columnId: string) => void;
  getIsOnPinningBoundary: (columnId: string) => boolean;
}) {
  if (column.columns.length > 0) {
    return (
      <ColumnGroupItem
        column={column}
        table={table}
        getIsOnPinningBoundary={getIsOnPinningBoundary}
        onTogglePin={onTogglePin}
      />
    );
  }
  return (
    <ColumnLeafItem
      column={column}
      onPinningBoundary={getIsOnPinningBoundary(column.id)}
      onTogglePin={onTogglePin}
    />
  );
}

interface ColumnManagerProps<RowDataModel> {
  table: Table<RowDataModel>;
  topContent?: ReactNode;
}

/**
 * Ponyfill for `Array.prototype.findLastIndex`, which is not available in the
 * `ES2022` TypeScript lib that we're currently using.
 */
function findLastIndex<T>(arr: T[], predicate: (value: T, index: number) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (predicate(arr[i], i)) {
      return i;
    }
  }
  return -1;
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
      const previousFrozenColumnIndex = findLastIndex(
        allLeafColumns,
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
  const pinnedMenuColumns = allLeafColumns.filter(
    (c) => c.getCanHide() && c.getIsPinned() === 'left',
  );
  // Only the first unpinned menu column can be pinned, so we only need to find the first one
  const firstUnpinnedMenuColumn = allLeafColumns.find(
    (c) => c.getCanHide() && c.getIsPinned() !== 'left',
  );

  // Determine if a column is on the pinning boundary (can toggle its pin state).
  // - Columns in a group cannot be pinned
  // - Columns after a group cannot be pinned
  // - Only the last pinned menu column can be unpinned
  // - Only the first unpinned menu column can be pinned
  const getIsOnPinningBoundary = (columnId: string) => {
    const column = allLeafColumns.find((c) => c.id === columnId);
    if (!column) return false;

    // Columns in a group cannot be pinned
    if (column.parent) return false;

    // Check if any column at or before this one in the full column order is in a group
    const columnIdx = allLeafColumns.findIndex((c) => c.id === columnId);
    const hasGroupAtOrBefore = allLeafColumns.slice(0, columnIdx + 1).some((c) => c.parent);

    if (column.getIsPinned() === 'left') {
      // Only the last pinned menu column can be unpinned
      return columnId === pinnedMenuColumns[pinnedMenuColumns.length - 1]?.id;
    } else {
      // Cannot pin if there's a group at or before this column
      if (hasGroupAtOrBefore) return false;
      // Only the first unpinned menu column can be pinned
      return columnId === firstUnpinnedMenuColumn?.id;
    }
  };

  // Get root columns (for showing hierarchy), but filter to only show unpinned ones
  // We'll show pinned columns separately in the "Frozen columns" section
  const unpinnedRootColumns = table.getAllColumns().filter((c) => {
    if (c.depth !== 0) return false;
    // A root column is considered unpinned if all its leaf columns are unpinned
    const leafCols = c.getLeafColumns();
    return (
      leafCols.length > 0 &&
      leafCols.every((leaf) => leaf.getIsPinned() !== 'left' && c.getCanHide())
    );
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
      onBlur={(e: React.FocusEvent) => {
        // Since we aren't using role="menu", we need to manually close the dropdown when focus leaves.
        // `relatedTarget` is the element gaining focus.
        if (menuRef.current && !menuRef.current.contains(e.relatedTarget)) {
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
        <i className="bi bi-view-list me-2" aria-hidden="true" /> View{' '}
      </Dropdown.Toggle>
      <Dropdown.Menu style={{ maxHeight: '60vh', overflowY: 'auto' }}>
        {topContent && (
          <>
            {topContent}
            <Dropdown.Divider />
          </>
        )}
        {pinnedMenuColumns.length > 0 && (
          <>
            <div className="px-2 py-1 text-muted small" role="presentation">
              Frozen columns
            </div>
            <div role="group">
              {/* Only leaf columns can be pinned in the current implementation. */}
              {pinnedMenuColumns.map((column, index) => {
                return (
                  <ColumnLeafItem
                    key={column.id}
                    column={column}
                    onPinningBoundary={index === pinnedMenuColumns.length - 1}
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
                return (
                  <ColumnItem
                    key={column.id}
                    column={column}
                    table={table}
                    getIsOnPinningBoundary={getIsOnPinningBoundary}
                    onTogglePin={handleTogglePin}
                  />
                );
              })}
            </div>
            {showResetButton && <Dropdown.Divider />}
          </>
        )}
        {showResetButton && (
          <div className="px-2 py-1">
            <Button
              variant="secondary"
              size="sm"
              className="w-100"
              aria-label="Reset all columns to default visibility and pinning"
              onClick={() => {
                table.resetColumnVisibility();
                table.resetColumnPinning();
                // Move focus to the column manager button after resetting.
                setActiveElementId('column-manager');
              }}
            >
              <i className="bi bi-arrow-counterclockwise me-2" aria-hidden="true" />
              Reset view
            </Button>
          </div>
        )}
      </Dropdown.Menu>
    </Dropdown>
  );
}
