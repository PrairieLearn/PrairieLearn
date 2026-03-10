import { useCallback, useRef } from 'react';

const KEYBOARD_STEP = 10;

export function useResizeHandle({
  currentWidth,
  minWidth,
  maxWidth,
  onWidthChange,
  ariaLabel = 'Resize panel',
  ariaControls,
}: {
  currentWidth: number;
  minWidth: number;
  maxWidth: number;
  onWidthChange: (width: number) => void;
  ariaLabel?: string;
  ariaControls?: string;
}) {
  const isDraggingRef = useRef(false);

  const clamp = useCallback(
    (w: number) => Math.min(maxWidth, Math.max(minWidth, w)),
    [minWidth, maxWidth],
  );

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDraggingRef.current = true;
      const startX = e.clientX;
      const startWidth = currentWidth;
      document.body.classList.add('user-select-none');

      const onMouseMove = (ev: MouseEvent) => {
        if (!isDraggingRef.current) return;
        // Panel is on the right: dragging left (decreasing clientX) grows it.
        const delta = startX - ev.clientX;
        onWidthChange(clamp(startWidth + delta));
      };

      const onMouseUp = () => {
        isDraggingRef.current = false;
        document.body.classList.remove('user-select-none');
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [currentWidth, clamp, onWidthChange],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      let newWidth: number | null = null;
      switch (e.key) {
        case 'ArrowLeft':
        case 'ArrowUp':
          // Move separator left/up -> right panel grows.
          newWidth = clamp(currentWidth + KEYBOARD_STEP);
          break;
        case 'ArrowRight':
        case 'ArrowDown':
          // Move separator right/down -> right panel shrinks.
          newWidth = clamp(currentWidth - KEYBOARD_STEP);
          break;
        case 'Home':
          newWidth = maxWidth;
          break;
        case 'End':
          newWidth = minWidth;
          break;
        default:
          return;
      }
      e.preventDefault();
      onWidthChange(newWidth);
    },
    [currentWidth, minWidth, maxWidth, clamp, onWidthChange],
  );

  const range = maxWidth - minWidth;
  // 0 = right panel at max width (separator far left), 100 = right panel at min width (separator far right).
  const valuenow = range > 0 ? Math.round(((maxWidth - currentWidth) / range) * 100) : 0;

  return {
    separatorProps: {
      role: 'separator' as const,
      tabIndex: 0,
      'aria-orientation': 'vertical' as const,
      'aria-valuenow': valuenow,
      'aria-valuemin': 0,
      'aria-valuemax': 100,
      'aria-label': ariaLabel,
      ...(ariaControls ? { 'aria-controls': ariaControls } : {}),
      onMouseDown,
      onKeyDown,
    },
  };
}
