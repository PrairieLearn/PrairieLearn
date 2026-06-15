import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { type ReactNode, useMemo } from 'react';

import { OverlayTrigger } from '@prairielearn/ui';

/**
 * Drag-and-drop context for a table whose rows can be reordered. Rows are
 * identified by `trackingId` and must use `useReorderableRow` to participate.
 */
export function ReorderableRowsContext<T extends { trackingId: string }>({
  rows,
  onReorder,
  children,
}: {
  rows: T[];
  onReorder: (rows: T[]) => void;
  children: ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const ids = useMemo(() => rows.map((row) => row.trackingId), [rows]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      autoScroll={false}
      onDragEnd={({ active, over }: DragEndEvent) => {
        if (!over || active.id === over.id) return;
        const oldIndex = rows.findIndex((row) => row.trackingId === active.id);
        const newIndex = rows.findIndex((row) => row.trackingId === over.id);
        if (oldIndex === -1 || newIndex === -1) return;
        onReorder(arrayMove(rows, oldIndex, newIndex));
      }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}

/** Drag-reorder behavior and styling for a `<tr>` inside `ReorderableRowsContext`. */
export function useReorderableRow(trackingId: string) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: trackingId,
  });

  return {
    ref: setNodeRef,
    style: {
      opacity: isDragging ? 0.6 : 1,
      // Use Translate, not Transform: dnd-kit's full transform includes scaleX/scaleY,
      // which visually warps variable-height rows. See https://github.com/clauderic/dnd-kit/issues/44.
      transform: CSS.Translate.toString(transform),
      transition,
      background: isDragging ? 'rgba(0,0,0,0.04)' : undefined,
    },
    dragHandleProps: { ...attributes, ...listeners },
  };
}

type ReorderableRowHandle = ReturnType<typeof useReorderableRow>;

/**
 * The drag/edit/delete actions cell of a reorderable row. When
 * `deleteDisabledReason` is set, the delete button is inert and explains why
 * in a click tooltip instead.
 */
export function ReorderableRowActionsCell({
  trackingId,
  dragHandleProps,
  editLabel,
  deleteLabel,
  deleteDisabledReason,
  onEdit,
  onDelete,
}: {
  trackingId: string;
  dragHandleProps: ReorderableRowHandle['dragHandleProps'];
  editLabel: string;
  deleteLabel: string;
  deleteDisabledReason?: string | null;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <td className="align-middle">
      <div className="d-flex align-items-center">
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          style={{ cursor: 'grab', touchAction: 'none' }}
          aria-label="Drag row"
          {...dragHandleProps}
        >
          <i className="fa fa-grip-vertical" aria-hidden="true" />
        </button>
        <button
          className="btn btn-sm btn-ghost"
          type="button"
          aria-label={editLabel}
          onClick={onEdit}
        >
          <i className="fa fa-edit" aria-hidden="true" />
        </button>
        {deleteDisabledReason ? (
          <OverlayTrigger
            trigger="click"
            tooltip={{
              body: deleteDisabledReason,
              props: { id: `delete-tooltip-${trackingId}` },
            }}
            rootClose
          >
            <button
              className="btn btn-sm btn-ghost"
              type="button"
              aria-label={deleteDisabledReason}
            >
              <i className="fa fa-trash text-muted" aria-hidden="true" />
            </button>
          </OverlayTrigger>
        ) : (
          <button
            className="btn btn-sm btn-ghost"
            type="button"
            aria-label={deleteLabel}
            onClick={onDelete}
          >
            <i className="fa fa-trash text-danger" aria-hidden="true" />
          </button>
        )}
      </div>
    </td>
  );
}

/** Returns the names that appear more than once, preserving first-seen order. */
export function getDuplicateNames(names: string[]): string[] {
  const counts = new Map<string, number>();
  for (const name of names) {
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, count]) => count > 1).map(([name]) => name);
}
