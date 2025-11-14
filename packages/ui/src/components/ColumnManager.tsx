import { type Column, type Table } from '@tanstack/react-table';
import { type JSX, useEffect, useRef, useState } from 'preact/compat';
import Button from 'react-bootstrap/Button';
import Dropdown from 'react-bootstrap/Dropdown';

interface ColumnMenuItemProps<RowDataModel> {
  column: Column<RowDataModel>;
  hidePinButton: boolean;
  onTogglePin: (columnId: string) => void;
}

function ColumnMenuItem<RowDataModel>({
  column,
  hidePinButton = false,
  onTogglePin,
}: ColumnMenuItemProps<RowDataModel>) {
  if (!column.getCanHide()) return null;

  // Use meta.label if available, otherwise fall back to header or column.id
  const header =
    column.columnDef.meta?.label ??
    (typeof column.columnDef.header === 'string' ? column.columnDef.header : column.id);

  return (
    <div key={column.id} class="px-2 py-1 d-flex align-items-center justify-content-between">
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
  const unpinnedColumns = table.getAllLeafColumns().filter((c) => c.getIsPinned() !== 'left');

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
        // eslint-disable-next-line @eslint-react/no-forbidden-props
        className="tanstack-table-focusable-shadow"
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
              {pinnedColumns.map((column, index) => {
                return (
                  <ColumnMenuItem
                    key={column.id}
                    column={column}
                    hidePinButton={index !== pinnedColumns.length - 1}
                    onTogglePin={handleTogglePin}
                  />
                );
              })}
            </div>
            <Dropdown.Divider />
          </>
        )}
        {unpinnedColumns.length > 0 && (
          <>
            <div role="group">
              {unpinnedColumns.map((column, index) => {
                return (
                  <ColumnMenuItem
                    key={column.id}
                    column={column}
                    hidePinButton={index !== 0}
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
