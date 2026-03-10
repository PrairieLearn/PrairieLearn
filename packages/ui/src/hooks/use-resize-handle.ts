import { useCallback, useEffect, useRef, useState } from 'react';

const KEYBOARD_STEP = 10;

export function useResizeHandle({
  initialWidth,
  minWidth,
  maxWidth,
  ariaLabel = 'Resize panel',
  ariaControls,
}: {
  initialWidth: number;
  minWidth: number;
  maxWidth: number;
  ariaLabel?: string;
  ariaControls?: string;
}) {
  const [width, setWidth] = useState(initialWidth);
  const isDraggingRef = useRef(false);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      cleanupRef.current?.();
    };
  }, []);

  const clamp = useCallback(
    (w: number) => Math.min(maxWidth, Math.max(minWidth, w)),
    [minWidth, maxWidth],
  );

  // Re-clamp when bounds change (e.g. dynamic maxWidth from container resize).
  const clampedWidth = clamp(width);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDraggingRef.current = true;
      const startX = e.clientX;
      const startWidth = width;
      document.body.classList.add('user-select-none');

      const onMouseMove = (ev: MouseEvent) => {
        if (!isDraggingRef.current) return;
        // Panel is on the right: dragging left (decreasing clientX) grows it.
        const delta = startX - ev.clientX;
        setWidth(clamp(startWidth + delta));
      };

      const cleanup = () => {
        isDraggingRef.current = false;
        document.body.classList.remove('user-select-none');
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        cleanupRef.current = null;
      };

      const onMouseUp = () => {
        cleanup();
      };

      cleanupRef.current = cleanup;
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [width, clamp],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      let newWidth: number | null = null;
      switch (e.key) {
        case 'ArrowLeft':
        case 'ArrowUp':
          // Move separator left/up -> right panel grows.
          newWidth = clamp(width + KEYBOARD_STEP);
          break;
        case 'ArrowRight':
        case 'ArrowDown':
          // Move separator right/down -> right panel shrinks.
          newWidth = clamp(width - KEYBOARD_STEP);
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
      setWidth(newWidth);
    },
    [width, minWidth, maxWidth, clamp],
  );

  const range = maxWidth - minWidth;
  // 0 = right panel at max width (separator far left), 100 = right panel at min width (separator far right).
  const valuenow = range > 0 ? Math.round(((maxWidth - clampedWidth) / range) * 100) : 0;

  return {
    width: clampedWidth,
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
