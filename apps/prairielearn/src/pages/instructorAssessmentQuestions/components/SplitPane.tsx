import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

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
  const isNarrow = useNarrowViewport();
  const [manualCollapsed, setManualCollapsed] = useState(true);
  const isDraggingRef = useRef(false);
  const prevForceOpenRef = useRef(forceOpen);
  const narrowContainerRef = useRef<HTMLDivElement>(null);
  const savedScrollTopRef = useRef(0);

  // Re-open panel when forceOpen changes (e.g. user selects a tree item)
  if (forceOpen && forceOpen !== prevForceOpenRef.current) {
    setManualCollapsed(false);
  }
  prevForceOpenRef.current = forceOpen;

  const isCollapsed = rightCollapsedProp ?? manualCollapsed;

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

  const closeButton = rightHeaderAction ?? (
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
  );

  // Track whether the tree is currently visible so the scroll listener can
  // ignore clamped scroll events that fire after the tree is hidden.
  // This MUST be set during render (not in an effect) so it updates before the
  // DOM commit that applies display:none and triggers the clamped scroll event.
  const treeVisibleRef = useRef(isCollapsed);
  treeVisibleRef.current = isNarrow ? isCollapsed : true;

  // Continuously track the outer scroll container's scroll position so we can
  // restore it when the detail panel is closed on narrow viewports. A passive
  // scroll listener avoids reading the DOM during the render phase. The
  // treeVisibleRef guard prevents saving the clamped value that the browser
  // produces when the tree gets display:none.
  useEffect(() => {
    if (!isNarrow) return;
    const scrollParent = narrowContainerRef.current?.closest('.app-main-container');
    if (!scrollParent) return;
    const onScroll = () => {
      if (treeVisibleRef.current) {
        savedScrollTopRef.current = scrollParent.scrollTop;
      }
    };
    scrollParent.addEventListener('scroll', onScroll, { passive: true });
    return () => scrollParent.removeEventListener('scroll', onScroll);
  }, [isNarrow]);

  // Restore scroll position synchronously after the DOM commit (before paint)
  // when the detail panel closes and the tree becomes visible again.
  const prevIsCollapsedRef = useRef(isCollapsed);
  useLayoutEffect(() => {
    if (isNarrow && isCollapsed && !prevIsCollapsedRef.current) {
      const scrollParent = narrowContainerRef.current?.closest('.app-main-container');
      if (scrollParent) {
        scrollParent.scrollTop = savedScrollTopRef.current;
      }
    }
    prevIsCollapsedRef.current = isCollapsed;
  }, [isNarrow, isCollapsed]);

  return (
    <div ref={narrowContainerRef} className="split-pane" data-collapsed={isCollapsed || undefined}>
      <div className="split-pane__left">{left}</div>

      {/* Separator is interactive (resizable) but uses role="separator" which jsx-a11y considers non-interactive */}
      {/* eslint-disable jsx-a11y-x/no-noninteractive-element-interactions, jsx-a11y-x/no-noninteractive-tabindex */}
      <div
        className="split-pane__separator"
        role="separator"
        tabIndex={0}
        aria-orientation="vertical"
        aria-label="Resize panel"
        onMouseDown={handleMouseDown}
      />
      {/* eslint-enable jsx-a11y-x/no-noninteractive-element-interactions, jsx-a11y-x/no-noninteractive-tabindex */}

      <div className="split-pane__right" style={{ width: rightWidth }}>
        <div className="split-pane__right-header">
          <span className="fw-semibold small">{rightTitle}</span>
          {closeButton}
        </div>
        <div className="split-pane__right-body">{right}</div>
      </div>

      {!rightCollapsedProp && (
        <button
          type="button"
          className="split-pane__toggle btn btn-sm btn-outline-secondary"
          aria-label="Show detail panel"
          onClick={() => setManualCollapsed(false)}
        >
          <i className="bi bi-layout-sidebar-reverse" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
