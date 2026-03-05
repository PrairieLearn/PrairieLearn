import { type ReactNode, useCallback, useRef, useState, useSyncExternalStore } from 'react';

const DEFAULT_RIGHT_WIDTH = 360;
const MIN_RIGHT_WIDTH = 280;
const MAX_RIGHT_WIDTH = 600;
const COLLAPSE_BREAKPOINT = 768;

function useNarrowViewport(): boolean {
  return useSyncExternalStore(
    (callback) => {
      const mq = window.matchMedia(`(max-width: ${COLLAPSE_BREAKPOINT}px)`);
      mq.addEventListener('change', callback);
      return () => mq.removeEventListener('change', callback);
    },
    () => window.matchMedia(`(max-width: ${COLLAPSE_BREAKPOINT}px)`).matches,
    () => false,
  );
}

export function SplitPane({
  left,
  right,
  rightTitle,
  rightHeaderAction,
  rightCollapsed: rightCollapsedProp,
  forceOpen,
  onClose,
}: {
  left: ReactNode;
  right: ReactNode;
  rightTitle?: ReactNode;
  /** If provided, replaces the default close "X" button in the header. */
  rightHeaderAction?: ReactNode;
  rightCollapsed?: boolean;
  /** When this value changes (and is truthy), re-open a manually collapsed panel. */
  forceOpen?: unknown;
  /** Called when the user closes the detail panel via the X button. */
  onClose?: () => void;
}) {
  const [rightWidth, setRightWidth] = useState(DEFAULT_RIGHT_WIDTH);
  const autoCollapsed = useNarrowViewport();
  const [manualCollapsed, setManualCollapsed] = useState(true);
  const isDraggingRef = useRef(false);
  const prevForceOpenRef = useRef(forceOpen);

  // Re-open panel when forceOpen changes (e.g. user selects a tree item)
  if (forceOpen && forceOpen !== prevForceOpenRef.current) {
    setManualCollapsed(false);
  }
  prevForceOpenRef.current = forceOpen;

  const isCollapsed = rightCollapsedProp ?? (manualCollapsed || autoCollapsed);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDraggingRef.current = true;
      const startX = e.clientX;
      const startWidth = rightWidth;

      const onMouseMove = (ev: MouseEvent) => {
        if (!isDraggingRef.current) return;
        const delta = startX - ev.clientX;
        const newWidth = Math.min(MAX_RIGHT_WIDTH, Math.max(MIN_RIGHT_WIDTH, startWidth + delta));
        setRightWidth(newWidth);
      };

      const onMouseUp = () => {
        isDraggingRef.current = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [rightWidth],
  );

  return (
    <div
      className="d-flex position-relative"
      style={{ minHeight: 400, maxHeight: 'calc(100vh - 200px)' }}
    >
      <div className="flex-grow-1" style={{ minWidth: 0, overflow: 'auto' }}>
        {left}
      </div>
      {!isCollapsed && (
        <>
          {/* Separator is interactive (resizable) but uses role="separator" which jsx-a11y considers non-interactive */}
          {/* eslint-disable jsx-a11y-x/no-noninteractive-element-interactions, jsx-a11y-x/no-noninteractive-tabindex */}
          <div
            role="separator"
            tabIndex={0}
            aria-orientation="vertical"
            aria-label="Resize panel"
            style={{
              width: 4,
              cursor: 'col-resize',
              backgroundColor: 'var(--bs-border-color)',
              flexShrink: 0,
            }}
            onMouseDown={handleMouseDown}
          />
          {/* eslint-enable jsx-a11y-x/no-noninteractive-element-interactions, jsx-a11y-x/no-noninteractive-tabindex */}
          <div
            style={{
              width: rightWidth,
              flexShrink: 0,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              className="d-flex align-items-center justify-content-between px-3 py-2 border-bottom"
              style={{ flexShrink: 0 }}
            >
              <span className="fw-semibold small">{rightTitle}</span>
              {rightHeaderAction ?? (
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  aria-label="Close detail panel"
                  onClick={() => {
                    setManualCollapsed(true);
                    onClose?.();
                  }}
                >
                  <i className="bi bi-x-lg" aria-hidden="true" />
                </button>
              )}
            </div>
            <div style={{ overflow: 'auto', flex: 1, display: 'flex', flexDirection: 'column' }}>
              {right}
            </div>
          </div>
        </>
      )}
      {isCollapsed && !autoCollapsed && !rightCollapsedProp && (
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary position-absolute"
          style={{ right: 0, top: 8 }}
          aria-label="Show detail panel"
          onClick={() => setManualCollapsed(false)}
        >
          <i className="bi bi-layout-sidebar-reverse" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
