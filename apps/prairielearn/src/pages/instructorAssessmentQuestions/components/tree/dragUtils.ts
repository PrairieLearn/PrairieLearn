import type { CSSProperties } from 'react';

export function makeDraggableStyle(opts: {
  isDragging: boolean;
  transform: { y: number } | null;
  transition: string | undefined;
}): CSSProperties {
  return {
    opacity: opts.isDragging ? 0 : 1,
    transform: opts.transform ? `translateY(${opts.transform.y}px)` : undefined,
    transition: opts.transition,
    position: opts.isDragging ? 'relative' : undefined,
    zIndex: opts.isDragging ? 2 : undefined,
  };
}
