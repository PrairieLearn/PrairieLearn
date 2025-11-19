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

function ColumnMenuItem<RowDataModel>({
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
}: {
  column: Column<RowDataModel>;
  onTogglePin: (columnId: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const checkboxRef = useRef<HTMLInputElement>(null);

  const leafColumns = column.getLeafColumns();
  const visibleLeafColumns = leafColumns.filter((c) => c.getIsVisible());
  const isAllVisible = visibleLeafColumns.length === leafColumns.length;
  const isSomeVisible = visibleLeafColumns.length > 0 && !isAllVisible;

  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = isSomeVisible;
    }
  }, [isSomeVisible]);

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
            ref={checkboxRef}
            type="checkbox"
            class="form-check-input flex-shrink-0"
            checked={isAllVisible}
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
            <ColumnHierarchyItem
              key={childCol.id}
              column={childCol}
              hidePinButton={false}
              onTogglePin={onTogglePin}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ColumnHierarchyItem<RowDataModel>({
  column,
  onTogglePin,
  hidePinButton,
}: {
  column: Column<RowDataModel>;
  onTogglePin: (columnId: string) => void;
  hidePinButton: boolean;
}) {
  if (column.columns.length > 0) {
    return <ColumnGroupItem column={column} onTogglePin={onTogglePin} />;
  }
  return <ColumnMenuItem column={column} hidePinButton={hidePinButton} onTogglePin={onTogglePin} />;
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
    let newLeft: string[];
    if (isPinned) {
      newLeft = currentLeft.filter((id) => id !== columnId);
    } else {
      const columnOrder = table.getAllLeafColumns().map((c) => c.id);
      const newPinned = new Set([...currentLeft, columnId]);
      newLeft = columnOrder.filter((id) => newPinned.has(id));
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

  const pinnedColumns = table.getAllLeafColumns().filter((c) => c.getIsPinned() === 'left');
  // Use getHeaderGroups to access the column hierarchy as defined in the table
  const rootColumns = table.getAllColumns().filter((c) => c.depth === 0);

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
        {pinnedColumns.length > 0 && (
          <>
            <div class="px-2 py-1 text-muted small" role="presentation">
              Frozen columns
            </div>
            <div role="group">
              {pinnedColumns.map((column) => {
                return (
                  <ColumnMenuItem
                    key={column.id}
                    column={column}
                    hidePinButton={false}
                    onTogglePin={handleTogglePin}
                  />
                );
              })}
            </div>
            <Dropdown.Divider />
          </>
        )}

        <div role="group">
          {rootColumns.map((column) => {
            // If a root column is pinned, we don't hide it here because it might be a group
            // or we want to show it in context. For leaf columns that are pinned,
            // they are duplicated in "Frozen columns", but showing them here maintains structure.
            // We can optionally pass hidePinButton=true if it's pinned, but keeping it enabled allows unpinning from here too.
            return (
              <ColumnHierarchyItem
                key={column.id}
                column={column}
                hidePinButton={false}
                onTogglePin={handleTogglePin}
              />
            );
          })}
        </div>

        {showResetButton && (
          <>
            <Dropdown.Divider />
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
          </>
        )}
      </Dropdown.Menu>
    </Dropdown>
  );
}
