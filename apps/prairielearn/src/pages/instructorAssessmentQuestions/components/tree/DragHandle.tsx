import type { DraggableAttributes, DraggableSyntheticListeners } from '@dnd-kit/core';

export function DragHandle({
  attributes,
  listeners,
  disabled,
  ariaLabel = 'Drag to reorder',
}: {
  attributes?: DraggableAttributes;
  listeners?: DraggableSyntheticListeners;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  if (disabled || !listeners) {
    return null;
  }

  return (
    // eslint-disable-next-line jsx-a11y-x/no-static-element-interactions
    <span
      {...attributes}
      {...listeners}
      className="me-2"
      style={{ cursor: 'grab', touchAction: 'none' }}
      aria-label={ariaLabel}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        listeners.onKeyDown(e);
        if (e.key === 'Enter' || e.key === ' ') {
          e.stopPropagation();
        }
      }}
    >
      <i className="bi bi-grip-vertical text-muted" aria-hidden="true" />
    </span>
  );
}
