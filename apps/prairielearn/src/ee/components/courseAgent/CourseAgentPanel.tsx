import clsx from 'clsx';
import {
  type ComponentRef,
  Suspense,
  lazy,
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { Alert, Button, Offcanvas, Spinner } from 'react-bootstrap';
import { createPortal } from 'react-dom';

// The package root would pull all of `@prairielearn/ui` into this eagerly loaded bundle.
import { OverlayTrigger } from '@prairielearn/ui/overlay-trigger';

const MOBILE_QUERY = '(max-width: 767.98px)';

function loadChat() {
  return import('./CourseAgentChat.js');
}

function preloadChat() {
  // Failed speculative loads are reported when the panel is opened.
  void loadChat().catch(() => {});
}

const LazyCourseAgentChat = lazy(() =>
  loadChat().then(
    ({ CourseAgentChat }) => ({ default: CourseAgentChat }),
    () => ({ default: ChatLoadError }),
  ),
);

function ChatLoadError() {
  return (
    <Alert variant="danger" className="m-3">
      Could not load the course agent. Reload this page to try again.
    </Alert>
  );
}

function ChatLoading() {
  return (
    <div className="d-flex flex-grow-1 justify-content-center align-items-center">
      <Spinner animation="border" size="sm" role="status">
        <span className="visually-hidden">Loading course agent</span>
      </Spinner>
    </div>
  );
}

function subscribeMobile(onChange: () => void) {
  const query = window.matchMedia(MOBILE_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function mobileSnapshot() {
  return window.matchMedia(MOBILE_QUERY).matches;
}

function saveOpenState(open: boolean) {
  // Best effort: the panel still works if the preference can't be saved.
  void fetch('/pl/course_agent/panel_settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ open }),
  }).catch(() => {});
}

export function CourseAgentPanel({
  courseId,
  authnUserId,
  trpcCsrfToken,
  chatCsrfToken,
  initialOpen,
  showConversationStats,
}: {
  courseId: string;
  authnUserId: string;
  trpcCsrfToken: string;
  chatCsrfToken: string;
  initialOpen: boolean;
  showConversationStats: boolean;
}) {
  const [hydrated, setHydrated] = useState(false);
  const [mobileLauncher] = useState(() =>
    typeof document === 'undefined'
      ? null
      : document.getElementById('course-agent-mobile-launcher'),
  );
  // Keep server markup during hydration, then reveal the lazy chat without delaying its ready state.
  useEffect(() => {
    startTransition(() => setHydrated(true));
  }, []);
  const [open, setOpen] = useState(initialOpen);
  // Keep the picker and its draft mounted after the first open.
  const [hasEverOpened, setHasEverOpened] = useState(initialOpen);
  // Animate only after the user toggles, so a panel restored open on page load doesn't slide in.
  const [animate, setAnimate] = useState(false);
  // The panel is a modal only on narrow screens; the server renders desktop markup.
  const mobile = useSyncExternalStore(subscribeMobile, mobileSnapshot, () => false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const [launcherTooltipShown, setLauncherTooltipShown] = useState(false);
  const mobileModalRef = useRef<ComponentRef<typeof Offcanvas>>(null);

  // Keeps the desktop panel below the navbar, whose height can change as it wraps.
  useEffect(() => {
    const navbar = document.querySelector('.app-top-nav');
    if (!navbar) return;
    const updateTop = () =>
      document.documentElement.style.setProperty(
        '--course-agent-top',
        `${navbar.getBoundingClientRect().bottom}px`,
      );
    const observer = new ResizeObserver(updateTop);
    observer.observe(navbar);
    updateTop();
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty('--course-agent-top');
    };
  }, []);

  const changeOpen = useCallback(
    (nextOpen: boolean) => {
      setAnimate(true);
      setOpen(nextOpen);
      if (nextOpen) {
        preloadChat();
        startTransition(() => setHasEverOpened(true));
      }
      saveOpenState(nextOpen);
      requestAnimationFrame(() => {
        // The panel is rendered at the end of the page, far from the navbar launcher in tab order.
        if (nextOpen) document.getElementById('course-agent-panel')?.focus();
        else if (!mobile) toggleRef.current?.focus();
      });
    },
    [mobile],
  );

  const panel = (
    <Offcanvas
      ref={mobileModalRef}
      id="course-agent-panel"
      bsPrefix="course-agent-overlay"
      show={open && mobile}
      backdrop={false}
      role={mobile ? 'dialog' : 'complementary'}
      aria-modal={mobile && open ? true : undefined}
      aria-label="Course agent"
      data-open={open}
      inert={!open}
      aria-hidden={!open}
      className={clsx('course-agent-panel', animate && 'course-agent-panel-animate')}
      onEnter={(node: HTMLElement) => {
        // This react-bootstrap beta replaces the modal's dialog ref; restore it so focus stays contained.
        if (mobileModalRef.current) mobileModalRef.current.dialog = node;
      }}
      onHide={() => changeOpen(false)}
    >
      <div className="d-flex align-items-center justify-content-between border-bottom px-3 py-2">
        <h2 className="h6 mb-0">
          <i className="bi bi-stars me-2 text-primary" aria-hidden="true" />
          Course agent
        </h2>
        <Button
          variant="link"
          className="p-0 text-muted"
          aria-label="Close course agent"
          onClick={() => changeOpen(false)}
        >
          <i className="bi bi-x-lg" aria-hidden="true" />
        </Button>
      </div>
      {/* Keep the boundary mounted so the first open avoids Suspense's fallback delay. */}
      <Suspense fallback={<ChatLoading />}>
        {hasEverOpened && hydrated ? (
          <LazyCourseAgentChat
            courseId={courseId}
            authnUserId={authnUserId}
            trpcCsrfToken={trpcCsrfToken}
            chatCsrfToken={chatCsrfToken}
            active={open}
            showConversationStats={showConversationStats}
          />
        ) : (
          <ChatLoading />
        )}
      </Suspense>
    </Offcanvas>
  );

  const launcherButtonProps = {
    ref: toggleRef,
    'aria-label': 'Course agent',
    'aria-expanded': open,
    'aria-controls': 'course-agent-panel',
    onPointerEnter: preloadChat,
    onFocus: preloadChat,
    onClick: () => changeOpen(!open),
  };
  const launcher = mobile ? (
    <button type="button" className="course-agent-launcher navbar-toggler" {...launcherButtonProps}>
      <i className="bi bi-stars" aria-hidden="true" />
    </button>
  ) : (
    <OverlayTrigger
      trigger={['hover', 'focus']}
      placement="bottom"
      show={launcherTooltipShown}
      tooltip={{ body: 'Course agent', props: { id: 'course-agent-launcher-tooltip' } }}
      // Skip focus that isn't `:focus-visible`, such as focus returning after a mouse user closes the panel.
      onToggle={(nextShow) => {
        const launcherElement = toggleRef.current;
        setLauncherTooltipShown(
          nextShow &&
            launcherElement !== null &&
            (launcherElement.matches(':hover') || launcherElement.matches(':focus-visible')),
        );
      }}
    >
      <Button
        className="course-agent-launcher d-inline-flex align-items-center justify-content-center"
        variant="outline-light"
        active={open}
        size="sm"
        {...launcherButtonProps}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setLauncherTooltipShown(false);
        }}
      >
        <i className="bi bi-stars" aria-hidden="true" />
      </Button>
    </OverlayTrigger>
  );

  return (
    <>
      {hydrated && mobile && mobileLauncher ? createPortal(launcher, mobileLauncher) : launcher}
      {/* Keep the panel outside the navbar's navigation landmark and stacking context. */}
      {hydrated ? createPortal(panel, document.body) : panel}
    </>
  );
}

CourseAgentPanel.displayName = 'CourseAgentPanel';
