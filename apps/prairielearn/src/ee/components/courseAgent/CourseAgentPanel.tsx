import { QueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  type ComponentRef,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { Button, Offcanvas } from 'react-bootstrap';

import { QueryClientProviderDebug } from '@prairielearn/trpc/react';

import { createCourseTrpcClient } from '../../../trpc/course/client.js';
import { TRPCProvider } from '../../../trpc/course/context.js';

import { Conversations } from './Conversations.js';

const MOBILE_QUERY = '(max-width: 767.98px)';

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
}: {
  courseId: string;
  authnUserId: string;
  trpcCsrfToken: string;
  chatCsrfToken: string;
  initialOpen: boolean;
}) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    createCourseTrpcClient({ courseId, csrfToken: trpcCsrfToken }),
  );
  return (
    <QueryClientProviderDebug client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <Panel
          courseId={courseId}
          authnUserId={authnUserId}
          chatCsrfToken={chatCsrfToken}
          initialOpen={initialOpen}
        />
      </TRPCProvider>
    </QueryClientProviderDebug>
  );
}

CourseAgentPanel.displayName = 'CourseAgentPanel';

function Panel({
  courseId,
  authnUserId,
  chatCsrfToken,
  initialOpen,
}: {
  courseId: string;
  authnUserId: string;
  chatCsrfToken: string;
  initialOpen: boolean;
}) {
  const [open, setOpen] = useState(initialOpen);
  // Keep the picker and its draft mounted after the first open.
  const [hasEverOpened, setHasEverOpened] = useState(initialOpen);
  // Animate only after the user toggles, so a panel restored open on page load doesn't slide in.
  const [animate, setAnimate] = useState(false);
  // The panel is a modal only on narrow screens; the server renders desktop markup.
  const mobile = useSyncExternalStore(subscribeMobile, mobileSnapshot, () => false);
  const toggleRef = useRef<HTMLButtonElement>(null);
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
      if (nextOpen) setHasEverOpened(true);
      saveOpenState(nextOpen);
      if (!nextOpen && !mobile) requestAnimationFrame(() => toggleRef.current?.focus());
    },
    [mobile],
  );

  return (
    <>
      <Button
        ref={toggleRef}
        hidden={open}
        className="course-agent-toggle"
        variant="primary"
        title="Open course agent"
        aria-label="Open course agent"
        onClick={() => changeOpen(true)}
      >
        <i className="bi bi-stars" aria-hidden="true" />
      </Button>
      <Offcanvas
        ref={mobileModalRef}
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
        {hasEverOpened && (
          <Conversations
            courseId={courseId}
            authnUserId={authnUserId}
            chatCsrfToken={chatCsrfToken}
            active={open}
          />
        )}
      </Offcanvas>
    </>
  );
}
