import { type Column, type Table } from '@tanstack/react-table';
import { useEffect, useRef, useState } from 'preact/compat';
import OverlayTriggerOriginal from 'react-bootstrap/cjs/OverlayTrigger.js';
import TooltipOriginal from 'react-bootstrap/cjs/Tooltip.js';

const OverlayTrigger = OverlayTriggerOriginal as unknown as typeof OverlayTriggerOriginal.default;
const Tooltip = TooltipOriginal as unknown as typeof TooltipOriginal.default;

import type { StudentRow } from '../instructorStudents.shared.js';

interface ColumnMenuItemProps {
  column: Column<StudentRow>;
  hidePinButton: boolean;
  onTogglePin: (columnId: string) => void;
  isActive: boolean;
  onFocus: () => void;
}

function ColumnMenuItem({
  column,
  hidePinButton = false,
  onTogglePin,
  isActive,
  onFocus,
}: ColumnMenuItemProps) {
  const itemRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isActive && itemRef.current) {
      itemRef.current.focus();
    }
  }, [isActive]);

  if (!column.getCanHide() && !column.getCanPin()) return null;

  const header = typeof column.columnDef.header === 'string' ? column.columnDef.header : column.id;

  const handleKeyDown = (e: KeyboardEvent) => {
    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault();
        // Toggle visibility by default, or handle pin button if focused
        if (e.target === itemRef.current) {
          column.getToggleVisibilityHandler()(e);
        }
        break;
    }
  };

  return (
    <div
      ref={itemRef}
      key={column.id}
      class="px-2 py-1 d-flex align-items-center justify-content-between"
      role="menuitem"
      tabIndex={isActive ? 0 : -1}
      onFocus={onFocus}
      onKeyDown={handleKeyDown}
    >
      <label class="form-check me-auto text-nowrap d-flex align-items-stretch">
        <OverlayTrigger
          placement="top"
          overlay={<Tooltip>{column.getIsVisible() ? 'Hide column' : 'Show column'}</Tooltip>}
        >
          <input
            type="checkbox"
            class="form-check-input"
            checked={column.getIsVisible()}
            onChange={column.getToggleVisibilityHandler()}
            disabled={!column.getCanHide()}
            aria-label={
              column.getIsVisible() ? `Hide '${header}' column` : `Show '${header}' column`
            }
            aria-describedby={`${column.id}-label`}
            tabIndex={-1}
          />
        </OverlayTrigger>
        <span class="form-check-label ms-2" id={`${column.id}-label`}>
          {header}
        </span>
      </label>
      {column.getCanPin() && !hidePinButton && (
        <button
          type="button"
          class="btn btn-sm btn-ghost ms-2"
          aria-label={
            column.getIsPinned() ? `Unfreeze '${header}' column` : `Freeze '${header}'  column`
          }
          title={column.getIsPinned() ? 'Unfreeze column' : 'Freeze column'}
          data-bs-toggle="tooltip"
          onClick={() => onTogglePin(column.id)}
          tabIndex={-1}
        >
          <i class={`bi ${column.getIsPinned() ? 'bi-x' : 'bi-snow'}`} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

export function ColumnManager({ table }: { table: Table<StudentRow> }) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isOpen, setIsOpen] = useState(false);

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
  };

  const isVisibilityChanged = Object.values(table.getState().columnVisibility).some((v) => !v);
  const isPinningChanged = (table.getState().columnPinning.left?.length ?? 0) > 0;
  const showResetButton = isVisibilityChanged || isPinningChanged;

  const handleReset = () => {
    table.resetColumnVisibility();
    table.resetColumnPinning();
  };

  const pinnedColumns = table.getAllLeafColumns().filter((c) => c.getIsPinned() === 'left');
  const unpinnedColumns = table.getAllLeafColumns().filter((c) => c.getIsPinned() !== 'left');

  // Get all actionable menu items (columns that can be hidden or pinned)
  const allMenuItems = [...pinnedColumns, ...unpinnedColumns].filter(
    (c) => c.getCanHide() || c.getCanPin(),
  );

  const handleKeyDown = (e: KeyboardEvent) => {
    if (!isOpen) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex((prev) => (prev + 1) % allMenuItems.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((prev) => (prev - 1 + allMenuItems.length) % allMenuItems.length);
        break;
      case 'Escape': {
        e.preventDefault();
        setIsOpen(false);
        // Focus the dropdown button
        const button = menuRef.current?.previousElementSibling as HTMLButtonElement;
        button?.focus();
        break;
      }
      case 'Tab':
        // Allow tab to move focus out of the menu
        setIsOpen(false);
        break;
    }
  };

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, allMenuItems.length]);

  // Reset active index when menu opens
  useEffect(() => {
    if (isOpen) {
      setActiveIndex(0);
    }
  }, [isOpen]);

  return (
    <div
      class="btn-group"
      // Prevent the dropdown from closing when the user clicks within the dropdown
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        data-bs-toggle="dropdown"
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-controls="column-manager-dropdown"
        aria-label="Manage column visibility and pinning options"
        class="btn btn-outline-secondary dropdown-toggle text-nowrap"
        onClick={() => setIsOpen(!isOpen)}
      >
        <i class="bi bi-view-list me-2" aria-hidden="true"></i>
        View
      </button>
      <div
        ref={menuRef}
        class="dropdown-menu dropdown-menu-arrow"
        role="menu"
        id="column-manager-dropdown"
        style={{ display: isOpen ? 'block' : 'none' }}
      >
        {pinnedColumns.length > 0 && (
          <>
            <div class="px-2 py-1 text-muted small" role="presentation">
              Frozen columns
            </div>
            <div role="group">
              {pinnedColumns.map((column, index) => {
                const globalIndex = allMenuItems.findIndex((item) => item.id === column.id);
                return (
                  <ColumnMenuItem
                    key={column.id}
                    column={column}
                    hidePinButton={index !== pinnedColumns.length - 1}
                    onTogglePin={handleTogglePin}
                    isActive={globalIndex === activeIndex}
                    onFocus={() => setActiveIndex(globalIndex)}
                  />
                );
              })}
            </div>
            <div class="dropdown-divider" role="separator"></div>
          </>
        )}
        {unpinnedColumns.length > 0 && (
          <div role="group">
            {unpinnedColumns.map((column, index) => {
              const globalIndex = allMenuItems.findIndex((item) => item.id === column.id);
              return (
                <ColumnMenuItem
                  key={column.id}
                  column={column}
                  hidePinButton={index !== 0}
                  onTogglePin={handleTogglePin}
                  isActive={globalIndex === activeIndex}
                  onFocus={() => setActiveIndex(globalIndex)}
                />
              );
            })}
          </div>
        )}
        {showResetButton && (
          <>
            <div class="dropdown-divider" role="separator"></div>
            <div class="px-2 py-1" role="menuitem">
              <button
                type="button"
                class="btn btn-sm w-100 btn-secondary"
                onClick={handleReset}
                aria-label="Reset all columns to default visibility and pinning"
                tabIndex={-1}
              >
                <i class="bi bi-arrow-counterclockwise me-2" aria-hidden="true" />
                Reset view
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
