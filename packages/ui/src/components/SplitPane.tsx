import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

import { useResizeHandle } from '../hooks/use-resize-handle.js';

const DEFAULT_RIGHT_WIDTH = 360;
const DEFAULT_MIN_RIGHT_WIDTH = 280;
const DEFAULT_MAX_RIGHT_WIDTH = 600;
const MIN_LEFT_WIDTH = 400;
const SEPARATOR_WIDTH = 4;

export interface SplitPaneProps {
  left: {
    content: ReactNode;
  };
  right: {
    content: ReactNode;
    title?: ReactNode;
    /** If provided, replaces the default close "X" button in the header. */
    headerAction?: ReactNode;
    /** When undefined, the panel uses internal uncontrolled collapse state with a toggle button. */
    collapsed?: boolean;
    /** Minimum width (px) of the right panel. Defaults to 280. */
    minWidth?: number;
    /** Maximum width (px) of the right panel. Defaults to 600. */
    maxWidth?: number;
    /** Initial width (px) of the right panel; clamped by min/max and available space. Defaults to 360. */
    initialWidth?: number;
  };
  /** Called when the user closes the detail panel via the X button. */
  onClose?: () => void;
  /** When this value changes (and is truthy), re-open a manually collapsed panel. */
  forceOpen?: unknown;
}

export function SplitPane({ left, right, onClose, forceOpen }: SplitPaneProps) {
  const {
    content: rightContent,
    title: rightTitle,
    headerAction: rightHeaderAction,
    collapsed: rightCollapsedProp,
    minWidth: minRightWidth = DEFAULT_MIN_RIGHT_WIDTH,
    maxWidth: maxRightWidth = DEFAULT_MAX_RIGHT_WIDTH,
    initialWidth: initialRightWidth = DEFAULT_RIGHT_WIDTH,
  } = right;

  const [manualCollapsed, setManualCollapsed] = useState(!forceOpen);
  const prevForceOpenRef = useRef(forceOpen);
  const containerRef = useRef<HTMLDivElement>(null);
  const savedScrollTopRef = useRef(0);

  const narrowBreakpoint = MIN_LEFT_WIDTH + minRightWidth + SEPARATOR_WIDTH;

  const containerWidth = useSyncExternalStore(
    useCallback((callback: () => void) => {
      window.addEventListener('resize', callback);
      window.addEventListener('side-nav-toggle', callback);
      return () => {
        window.removeEventListener('resize', callback);
        window.removeEventListener('side-nav-toggle', callback);
      };
    }, []),
    () => containerRef.current?.clientWidth ?? 0,
    () => 0,
  );

  // Re-open panel when forceOpen changes (e.g. user selects a tree item)
  if (forceOpen && forceOpen !== prevForceOpenRef.current) {
    setManualCollapsed(false);
  }
  prevForceOpenRef.current = forceOpen;

  const isNarrow = containerWidth > 0 && containerWidth <= narrowBreakpoint;
  const isCollapsed = rightCollapsedProp ?? manualCollapsed;

  const dynamicMaxWidth =
    containerWidth > 0
      ? Math.max(0, Math.min(maxRightWidth, containerWidth - MIN_LEFT_WIDTH - SEPARATOR_WIDTH))
      : maxRightWidth;

  const { width: rightWidth, separatorProps } = useResizeHandle({
    initialWidth: initialRightWidth,
    minWidth: minRightWidth,
    maxWidth: dynamicMaxWidth,
    ariaLabel: 'Resize panel',
    ariaControls: 'pl-ui-split-pane-detail',
  });

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

  // Track whether the left panel is currently visible so the scroll listener
  // can ignore clamped scroll events that fire after it is hidden.
  // This MUST be set during render (not in an effect) so it updates before the
  // DOM commit that applies display:none and triggers the clamped scroll event.
  const leftVisibleRef = useRef(isCollapsed);
  leftVisibleRef.current = isNarrow ? isCollapsed : true;

  // Continuously track the scroll container's scroll position so we can
  // restore it when the detail panel is closed on narrow viewports.
  useEffect(() => {
    if (!isNarrow) return;
    const scrollParent =
      containerRef.current?.closest('[data-split-pane-scroll-parent]') ??
      containerRef.current?.parentElement;
    if (!scrollParent) return;
    const onScroll = () => {
      if (leftVisibleRef.current) {
        savedScrollTopRef.current = scrollParent.scrollTop;
      }
    };
    scrollParent.addEventListener('scroll', onScroll, { passive: true });
    return () => scrollParent.removeEventListener('scroll', onScroll);
  }, [isNarrow]);

  // Restore scroll position synchronously after the DOM commit (before paint)
  // when the detail panel closes and the left panel becomes visible again.
  const prevIsCollapsedRef = useRef(isCollapsed);
  useLayoutEffect(() => {
    if (isNarrow && isCollapsed && !prevIsCollapsedRef.current) {
      const scrollParent =
        containerRef.current?.closest('[data-split-pane-scroll-parent]') ??
        containerRef.current?.parentElement;
      if (scrollParent) {
        scrollParent.scrollTop = savedScrollTopRef.current;
      }
    }
    prevIsCollapsedRef.current = isCollapsed;
  }, [isNarrow, isCollapsed]);

  return (
    <div
      ref={containerRef}
      className="pl-ui-split-pane"
      data-collapsed={isCollapsed || undefined}
      data-narrow={isNarrow || undefined}
    >
      <div className="pl-ui-split-pane__left">
        <div className="pl-ui-split-pane__left-body">{left.content}</div>
      </div>

      <div className="pl-ui-split-pane__separator" {...separatorProps} />

      <div
        id="pl-ui-split-pane-detail"
        className="pl-ui-split-pane__right"
        style={{ width: rightWidth }}
      >
        <div className="pl-ui-split-pane__right-header">
          <span className="fw-semibold small">{rightTitle}</span>
          {closeButton}
        </div>
        <div className="pl-ui-split-pane__right-body">{rightContent}</div>
      </div>

      {rightCollapsedProp === undefined && (
        <button
          type="button"
          className="pl-ui-split-pane__toggle btn btn-sm btn-outline-secondary"
          aria-label="Show detail panel"
          onClick={() => setManualCollapsed(false)}
        >
          <i className="bi bi-layout-sidebar-reverse" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
