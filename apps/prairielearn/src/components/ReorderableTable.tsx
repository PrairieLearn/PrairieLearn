import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  type Modifier,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { type ReactNode, type RefObject, useId } from 'react';
import { Button, Form } from 'react-bootstrap';
import type { FieldError, UseFormRegisterReturn } from 'react-hook-form';

import { OverlayTrigger } from '@prairielearn/ui';

/** Keep every drop target reachable, including when rows have different heights. */
export function restrictToVerticalContainer(containerRef: RefObject<HTMLElement | null>): Modifier {
  return ({ draggingNodeRect, transform }) => {
    if (!draggingNodeRect || !containerRef.current) {
      return { ...transform, x: 0 };
    }
    const containerRect = containerRef.current.getBoundingClientRect();
    const draggingCenterY = draggingNodeRect.top + draggingNodeRect.height / 2;
    // Clamp the center, not the edges, so a tall row can reach a shorter end row.
    return {
      ...transform,
      x: 0,
      y: Math.min(
        Math.max(transform.y, containerRect.top - draggingCenterY),
        containerRect.bottom - draggingCenterY,
      ),
    };
  };
}

/**
 * Drag-and-drop context for a table whose rows can be reordered. Rows are
 * identified by `trackingId` and must use `useReorderableRow` to participate.
 */
export function ReorderableRowsContext<T extends { trackingId: string }>({
  rows,
  onMove,
  rowsRef,
  children,
}: {
  rows: T[];
  onMove: (from: number, to: number) => void;
  rowsRef: RefObject<HTMLTableSectionElement | null>;
  children: ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const ids = rows.map((row) => row.trackingId);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      autoScroll={false}
      modifiers={[restrictToVerticalContainer(rowsRef)]}
      onDragEnd={({ active, over }: DragEndEvent) => {
        if (!over || active.id === over.id) return;
        const oldIndex = rows.findIndex((row) => row.trackingId === active.id);
        const newIndex = rows.findIndex((row) => row.trackingId === over.id);
        if (oldIndex === -1 || newIndex === -1) return;
        onMove(oldIndex, newIndex);
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
 * The drag/delete actions cell of a reorderable row. When
 * `deleteDisabledReason` is set, the delete button is inert and explains why
 * in a click tooltip instead.
 */
export function ReorderableRowActionsCell({
  trackingId,
  dragHandleProps,
  deleteLabel,
  deleteDisabledReason,
  onDelete,
}: {
  trackingId: string;
  dragHandleProps: ReorderableRowHandle['dragHandleProps'];
  deleteLabel: string;
  deleteDisabledReason?: string | null;
  onDelete: () => void;
}) {
  return (
    <td className="align-top">
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

/** Shared add action for the last row of an inline editor. */
export function AddRowButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <Button variant="ghost" size="sm" onClick={onClick}>
      <i className="bi bi-plus-lg me-1" aria-hidden="true" />
      {children}
    </Button>
  );
}

export function InlineTableTextInput({
  label,
  defaultValue,
  registration,
  error,
  readOnly,
  description,
}: {
  label: string;
  defaultValue: string;
  registration: UseFormRegisterReturn;
  error?: FieldError;
  readOnly?: boolean;
  description?: string;
}) {
  const id = useId();
  return (
    <>
      <Form.Control
        type="text"
        size="sm"
        aria-label={label}
        defaultValue={defaultValue}
        readOnly={readOnly}
        isInvalid={!!error}
        aria-invalid={!!error || undefined}
        aria-errormessage={error ? `${id}-error` : undefined}
        aria-describedby={description ? `${id}-description` : undefined}
        {...registration}
      />
      {error && (
        <Form.Control.Feedback type="invalid" id={`${id}-error`}>
          {error.message}
        </Form.Control.Feedback>
      )}
      {description && (
        <small id={`${id}-description`} className="text-muted">
          {description}
        </small>
      )}
    </>
  );
}
