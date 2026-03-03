import type { CSSProperties } from 'react';

export function makeSortableStyle(opts: {
  isDragging: boolean;
  transform: { y: number } | null;
  transition: string | undefined;
}): CSSProperties {
  return {
    opacity: opts.isDragging ? 0.6 : 1,
    transform: opts.transform ? `translateY(${opts.transform.y}px)` : undefined,
    transition: opts.transition,
    background: opts.isDragging ? 'rgba(0,0,0,0.04)' : undefined,
    position: opts.isDragging ? 'relative' : undefined,
    zIndex: opts.isDragging ? 2 : undefined,
  };
}
