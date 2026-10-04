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

import type { CourseAgentPanelState } from '../../../lib/course-agent-panel.js';
import { createCourseTrpcClient } from '../../../trpc/course/client.js';
import { TRPCProvider } from '../../../trpc/course/context.js';

import { Conversation } from './Conversation.js';

function subscribeMobile(onChange: () => void) {
  const query = window.matchMedia('(max-width: 767.98px)');
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function mobileSnapshot() {
  return window.matchMedia('(max-width: 767.98px)').matches;
}

export function CourseAgentPanel({
  courseId,
  userId,
  csrfToken,
  userName,
  timezone,
  initialPanelState,
  canStartNewWork,
}: {
  courseId: string;
  userId: string;
  csrfToken: string;
  userName: string;
  timezone: string;
  initialPanelState: CourseAgentPanelState;
  canStartNewWork: boolean;
}) {
  const [queryClient] = useState(() => new QueryClient());
  const [client] = useState(() => createCourseTrpcClient({ courseId, csrfToken }));
  return (
    <QueryClientProviderDebug client={queryClient}>
      <TRPCProvider trpcClient={client} queryClient={queryClient}>
        <Panel
          courseId={courseId}
          userId={userId}
          userName={userName}
          timezone={timezone}
          initialPanelState={initialPanelState}
          canStartNewWork={canStartNewWork}
        />
      </TRPCProvider>
    </QueryClientProviderDebug>
  );
}

function Panel({
  courseId,
  userId,
  userName,
  timezone,
  initialPanelState,
  canStartNewWork: initiallyEnabled,
}: {
  courseId: string;
  userId: string;
  userName: string;
  timezone: string;
  initialPanelState: CourseAgentPanelState;
  canStartNewWork: boolean;
}) {
  const key = `course-agent:${userId}:${courseId}`;
  const [panel, setPanel] = useState(initialPanelState);
  const [animate, setAnimate] = useState(false);
  const panelRef = useRef(panel);
  panelRef.current = panel;
  // Serialize writes so a slower close cannot overwrite a later reopen.
  const canStartNewWork = initiallyEnabled;
  // Only the full-screen mobile panel is modal; the server initially renders desktop markup.
  const mobile = useSyncExternalStore(subscribeMobile, mobileSnapshot, () => false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const mobileModalRef = useRef<ComponentRef<typeof Offcanvas>>(null);
  // Keep the desktop panel below the navbar even when its contents wrap.
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

  const changePanel = useCallback(
    (change: Partial<CourseAgentPanelState>) => {
      if (change.open !== undefined) setAnimate(true);
      const next = { ...panelRef.current, ...change };
      panelRef.current = next;
      setPanel(next);
      if (change.open === false && !mobile) requestAnimationFrame(() => toggleRef.current?.focus());
    },
    [mobile],
  );
  return (
    <>
      <Button
        ref={toggleRef}
        hidden={panel.open}
        title="Open course agent"
        className="course-agent-toggle"
        variant="primary"
        aria-label="Open course agent"
        onClick={() => changePanel({ open: true })}
      >
        <i className="bi bi-stars" aria-hidden="true" />
      </Button>
      <Offcanvas
        ref={mobileModalRef}
        bsPrefix="course-agent-overlay"
        show={panel.open && mobile}
        backdrop={false}
        role={mobile ? 'dialog' : 'complementary'}
        aria-modal={mobile && panel.open ? true : undefined}
        data-open={panel.open}
        inert={!panel.open}
        aria-hidden={!panel.open}
        className={clsx('course-agent-panel', animate && 'course-agent-panel-animate')}
        aria-label="Course agent"
        onEnter={(node: HTMLElement) => {
          // This Bootstrap beta replaces the underlying modal's dialog ref; restore it for focus containment.
          if (mobileModalRef.current) mobileModalRef.current.dialog = node;
        }}
        onHide={() => changePanel({ open: false })}
        onExited={() => {
          if (!panelRef.current.open) toggleRef.current?.focus();
        }}
      >
        <div className="d-flex align-items-center justify-content-between border-bottom p-3">
          <h2 className="h6 mb-0">
            <i className="bi bi-stars me-2 text-primary" aria-hidden="true" />
            Course agent
          </h2>
          <Button
            variant="link"
            className="p-0 text-muted"
            aria-label="Close course agent"
            onClick={() => changePanel({ open: false })}
          >
            <i className="bi bi-x-lg" aria-hidden="true" />
          </Button>
        </div>
        <div className="d-flex flex-column flex-grow-1 p-3 overflow-hidden">
          <Conversation
            key={panel.selected || 'new'}
            renderPicker={(startingAgent) => (
              <Button
                disabled={startingAgent || !canStartNewWork}
                className="mb-3"
                variant="outline-primary"
                onClick={() => changePanel({ selected: '', title: 'New conversation' })}
              >
                New conversation
              </Button>
            )}
            courseId={courseId}
            id={panel.selected}
            storageKey={`${key}:${panel.selected || 'new'}`}
            userName={userName}
            timezone={timezone}
            canStartNewWork={canStartNewWork}
            onCreated={(id, title) => {
              if (!panelRef.current.selected) changePanel({ selected: id, title });
            }}
            onSending={() => {}}
          />
        </div>
      </Offcanvas>
    </>
  );
}

CourseAgentPanel.displayName = 'CourseAgentPanel';
