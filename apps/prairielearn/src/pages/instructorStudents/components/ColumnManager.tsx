import { type Column, type Table } from '@tanstack/react-table';
import { useEffect, useRef, useState } from 'preact/compat';
import ButtonOriginal from 'react-bootstrap/cjs/Button.js';
import DropdownOriginal from 'react-bootstrap/cjs/Dropdown.js';
import OverlayTriggerOriginal from 'react-bootstrap/cjs/OverlayTrigger.js';
import TooltipOriginal from 'react-bootstrap/cjs/Tooltip.js';

import type { StudentRow } from '../instructorStudents.shared.js';

const OverlayTrigger = OverlayTriggerOriginal as unknown as typeof OverlayTriggerOriginal.default;
const Tooltip = TooltipOriginal as unknown as typeof TooltipOriginal.default;
const Dropdown = DropdownOriginal as unknown as typeof DropdownOriginal.default;
const Button = ButtonOriginal as unknown as typeof ButtonOriginal.default;

interface ColumnMenuItemProps {
  column: Column<StudentRow>;
  hidePinButton: boolean;
  onTogglePin: (columnId: string) => void;
  onClearElementFocus: () => void;
}

function ColumnMenuItem({
  column,
  hidePinButton = false,
  onTogglePin,
  onClearElementFocus,
}: ColumnMenuItemProps) {
  const checkboxRef = useRef<HTMLInputElement>(null);
  const pinButtonRef = useRef<HTMLButtonElement>(null);

  if (!column.getCanHide() && !column.getCanPin()) return null;

  const header = typeof column.columnDef.header === 'string' ? column.columnDef.header : column.id;

  const handleKeyDown = (e: KeyboardEvent) => {
    onClearElementFocus();
    switch (e.key) {
      // Support for arrow keys to move between menu items
      case 'ArrowRight':
        e.preventDefault();
        // Move to the next menu item
        pinButtonRef.current?.focus();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        // Move to the previous menu item
        checkboxRef.current?.focus();
        break;
    }
  };

  return (
    <Dropdown.Item
      as="div"
      key={column.id}
      // No support for class, only className
      className="px-2 py-1 d-flex align-items-center justify-content-between"
      onKeyDown={handleKeyDown}
    >
      <label class="form-check me-auto text-nowrap d-flex align-items-stretch">
        <OverlayTrigger
          placement="top"
          overlay={<Tooltip>{column.getIsVisible() ? 'Hide column' : 'Show column'}</Tooltip>}
        >
          <input
            type="checkbox"
            ref={checkboxRef}
            class="form-check-input"
            checked={column.getIsVisible()}
            onKeyDown={(e) => {
              // https://github.com/TanStack/table/blob/29a3a320cd884ce7c3e1e7f89aeedb1fbf0f1f6e/packages/table-core/src/features/ColumnVisibility.ts#L195
              // getToggleVisibilityHandler doesn't work with keyboard navigation.
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                column.toggleVisibility(!column.getIsVisible());
              }
            }}
            onClick={column.getToggleVisibilityHandler()}
            disabled={!column.getCanHide()}
            aria-label={
              column.getIsVisible() ? `Hide '${header}' column` : `Show '${header}' column`
            }
            aria-describedby={`${column.id}-label`}
            // tabIndex={0}
          />
        </OverlayTrigger>
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
          ref={pinButtonRef}
          class="btn btn-sm btn-ghost ms-2"
          aria-label={
            column.getIsPinned() ? `Unfreeze '${header}' column` : `Freeze '${header}'  column`
          }
          title={column.getIsPinned() ? 'Unfreeze column' : 'Freeze column'}
          data-bs-toggle="tooltip"
          onClick={() => {
            if (!pinButtonRef.current) {
              throw new Error('pinButtonRef.current is null');
            }
            onTogglePin(column.id);
          }}
          onKeyDown={(e) => {
            if (!pinButtonRef.current) {
              throw new Error('pinButtonRef.current is null');
            }
            if (e.key === 'Enter' || e.key === ' ') {
              onTogglePin(column.id);
              return;
            }
          }}
          // Instead, use the arrow keys to move between interactive elements in each menu item.
          tabIndex={-1}
        >
          <i class={`bi ${column.getIsPinned() ? 'bi-x' : 'bi-snow'}`} aria-hidden="true" />
        </button>
      )}
    </Dropdown.Item>
  );
}

export function ColumnManager({ table }: { table: Table<StudentRow> }) {
  const [activeElementId, setActiveElementId] = useState<string | null>(null);
  const handleTogglePin = (columnId: string) => {
    const currentLeft = table.getState().columnPinning?.left ?? [];
    const isPinned = currentLeft.includes(columnId);
    let newLeft: string[];
    if (isPinned) {
      newLeft = currentLeft.filter((id) => id !== columnId);
    } else {
      const columnOrder = table.getAllLeafColumns().map((c) => c.id);
      const newPinned = [...currentLeft, columnId];
      newLeft = columnOrder.filter((id) => newPinned.includes(id));
    }
    table.setColumnPinning({ left: newLeft, right: [] });
    setActiveElementId(`${columnId}-pin`);
  };

  const isVisibilityChanged = Object.values(table.getState().columnVisibility).some((v) => !v);
  const isPinningChanged = (table.getState().columnPinning.left?.length ?? 0) > 0;
  const showResetButton = isVisibilityChanged || isPinningChanged;

  const pinnedColumns = table.getAllLeafColumns().filter((c) => c.getIsPinned() === 'left');
  const unpinnedColumns = table.getAllLeafColumns().filter((c) => c.getIsPinned() !== 'left');

  // When we use the pin or reset button, we want to refocus to another element.
  useEffect(() => {
    if (activeElementId) {
      const element = document.getElementById(activeElementId);
      if (element) {
        (element as HTMLElement).focus();
      }
    }
  }, [activeElementId]);

  return (
    <Dropdown autoClose="outside">
      <Dropdown.Toggle variant="outline-secondary" id="column-manager-button">
        <i class="bi bi-view-list me-2" aria-hidden="true"></i>
        View
      </Dropdown.Toggle>
      <Dropdown.Menu>
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
                    onClearElementFocus={() => setActiveElementId(null)}
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
                    onClearElementFocus={() => setActiveElementId(null)}
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
              className="w-100"
              onClick={() => {
                table.resetColumnVisibility();
                table.resetColumnPinning();
                setActiveElementId('column-manager-button');
              }}
              aria-label="Reset all columns to default visibility and pinning"
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
