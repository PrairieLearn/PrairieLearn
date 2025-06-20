import { type Column, type Table } from '@tanstack/react-table';

import type { StudentRow } from '../instructorStudents.types.js';

interface ColumnMenuItemProps {
  column: Column<StudentRow>;
  hidePinButton: boolean;
  onTogglePin: (columnId: string) => void;
}

function ColumnMenuItem({ column, hidePinButton = false, onTogglePin }: ColumnMenuItemProps) {
  if (!column.getCanHide() && !column.getCanPin()) return null;

  const header = typeof column.columnDef.header === 'string' ? column.columnDef.header : column.id;

  return (
    <div key={column.id} className="px-2 py-1 d-flex align-items-center justify-content-between">
      <label className="form-check me-auto text-nowrap d-flex align-items-center">
        <input
          type="checkbox"
          className="form-check-input"
          checked={column.getIsVisible()}
          onChange={column.getToggleVisibilityHandler()}
          disabled={!column.getCanHide()}
          onMouseDown={(e) => e.preventDefault()}
        />
        <span className="form-check-label ms-2">{header}</span>
      </label>
      {column.getCanPin() && !hidePinButton && (
        <button
          type="button"
          className="btn btn-sm btn-ghost ms-2"
          title={column.getIsPinned() ? 'Unpin column' : 'Pin column'}
          onClick={() => onTogglePin(column.id)}
          onMouseDown={(e) => e.preventDefault()}
        >
          <i className={`bi ${column.getIsPinned() ? 'bi-x' : 'bi-snow'}`} />
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

  const isVisibilityChanged = Object.keys(table.getState().columnVisibility).length > 0;
  const isPinningChanged = (table.getState().columnPinning.left?.length ?? 0) > 0;
  const showResetButton = isVisibilityChanged || isPinningChanged;

  const handleReset = () => {
    table.resetColumnVisibility();
    table.resetColumnPinning();
  };

  const pinnedColumns = table.getAllLeafColumns().filter((c) => c.getIsPinned() === 'left');
  const unpinnedColumns = table.getAllLeafColumns().filter((c) => c.getIsPinned() !== 'left');
  console.log(pinnedColumns, unpinnedColumns);

  return (
    <div className="btn-group">
      <button
        type="button"
        className="btn btn-outline-secondary dropdown-toggle text-nowrap"
        data-bs-toggle="dropdown"
        aria-expanded="false"
      >
        <i className="bi bi-view-list me-2" />
        View
      </button>
      <div
        className="dropdown-menu dropdown-menu-arrow"
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
        {pinnedColumns.length > 0 && <div className="dropdown-divider"></div>}
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
            <div className="dropdown-divider"></div>
            <div className="px-2 py-1">
              <button
                type="button"
                className="btn btn-sm w-100 btn-secondary"
                onClick={handleReset}
              >
                <i className="bi bi-arrow-counterclockwise me-2" />
                Reset view
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
