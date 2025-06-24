import { type Column, type Table } from '@tanstack/react-table';

import type { StudentRow } from '../instructorStudents.shared.js';

interface ColumnMenuItemProps {
  column: Column<StudentRow>;
  hidePinButton: boolean;
  onTogglePin: (columnId: string) => void;
}

function ColumnMenuItem({ column, hidePinButton = false, onTogglePin }: ColumnMenuItemProps) {
  if (!column.getCanHide() && !column.getCanPin()) return null;

  const header = typeof column.columnDef.header === 'string' ? column.columnDef.header : column.id;

  return (
    <div key={column.id} class="px-2 py-1 d-flex align-items-center justify-content-between">
      <label class="form-check me-auto text-nowrap d-flex align-items-center">
        <input
          type="checkbox"
          class="form-check-input"
          checked={column.getIsVisible()}
          onChange={column.getToggleVisibilityHandler()}
          disabled={!column.getCanHide()}
          onMouseDown={(e) => e.preventDefault()}
        />
        <span class="form-check-label ms-2">{header}</span>
      </label>
      {column.getCanPin() && !hidePinButton && (
        <button
          type="button"
          class="btn btn-sm btn-ghost ms-2"
          aria-label={column.getIsPinned() ? 'Unfreeze column' : 'Freeze column'}
          title={column.getIsPinned() ? 'Unfreeze column' : 'Freeze column'}
          onClick={() => onTogglePin(column.id)}
          onMouseDown={(e) => e.preventDefault()}
        >
          <i class={`bi ${column.getIsPinned() ? 'bi-x' : 'bi-snow'}`} />
        </button>
      )}
    </div>
  );
}

export function ColumnManager({ table }: { table: Table<StudentRow> }) {
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
  // console.log(pinnedColumns, unpinnedColumns);

  return (
    <div class="btn-group">
      <button
        type="button"
        data-bs-toggle="dropdown"
        aria-expanded="false"
        class="btn btn-outline-secondary dropdown-toggle text-nowrap"
      >
        <i class="bi bi-view-list me-2" aria-hidden="true"></i>
        View
      </button>
      <div
        class="dropdown-menu dropdown-menu-arrow"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.preventDefault()}
      >
        {pinnedColumns.map((column, index) => (
          <ColumnMenuItem
            key={column.id}
            column={column}
            hidePinButton={index !== pinnedColumns.length - 1}
            onTogglePin={handleTogglePin}
          />
        ))}
        {pinnedColumns.length > 0 && <div class="dropdown-divider"></div>}
        {unpinnedColumns.map((column, index) => (
          <ColumnMenuItem
            key={column.id}
            column={column}
            hidePinButton={index !== 0}
            onTogglePin={handleTogglePin}
          />
        ))}
        {showResetButton && (
          <>
            <div class="dropdown-divider"></div>
            <div class="px-2 py-1">
              <button type="button" class="btn btn-sm w-100 btn-secondary" onClick={handleReset}>
                <i class="bi bi-arrow-counterclockwise me-2" />
                Reset view
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
