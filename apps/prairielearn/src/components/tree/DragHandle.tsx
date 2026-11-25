import type { DraggableAttributes, DraggableSyntheticListeners } from '@dnd-kit/core';
import type { CSSProperties } from 'react';

export function DragHandle({
  attributes,
  listeners,
  disabled,
  ariaLabel = 'Drag to reorder',
  className = 'me-2',
  style,
}: {
  attributes?: DraggableAttributes;
  listeners?: DraggableSyntheticListeners;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
  style?: CSSProperties;
}) {
  if (disabled || !listeners) {
    return null;
  }

  return (
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions
    <span
      {...attributes}
      {...listeners}
      className={className}
      style={{ cursor: 'grab', touchAction: 'none', ...style }}
      aria-label={ariaLabel}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        listeners.onKeyDown(e);
        // Stop propagation to prevent the parent accordion from toggling,
        // but only when NOT actively dragging. During an active drag,
        // dnd-kit's KeyboardSensor listens at the document level and needs
        // events to bubble up for arrow key movement and Space/Enter to drop.
        if ((e.key === 'Enter' || e.key === ' ') && !attributes?.['aria-pressed']) {
          e.stopPropagation();
        }
      }}
    >
      <i className="bi bi-grip-vertical text-muted" aria-hidden="true" />
    </span>
  );
}
