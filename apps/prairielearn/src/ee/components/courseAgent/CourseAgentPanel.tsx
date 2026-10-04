import { QueryClient, useMutation, useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  type ComponentRef,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { Button, Dropdown, Offcanvas } from 'react-bootstrap';

import { getAppError } from '@prairielearn/trpc/client';
import { AppErrorAlert, QueryClientProviderDebug } from '@prairielearn/trpc/react';

import {
  type CourseAgentPanelState,
  CourseAgentPanelStateSchema,
} from '../../../lib/course-agent-panel.js';
import { createCourseTrpcClient } from '../../../trpc/course/client.js';
import { TRPCProvider, useTRPC } from '../../../trpc/course/context.js';
import type { CourseAgentError } from '../../../trpc/course/course-agent.js';

import { Conversation } from './Conversation.js';
import { readPanelState, savePanelState, usePanelState } from './panelState.js';

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
  const trpc = useTRPC();
  const key = `course-agent:${userId}:${courseId}`;
  const [panel, setPanel] = useState(initialPanelState);
  const [animate, setAnimate] = useState(false);
  const panelRef = useRef(panel);
  panelRef.current = panel;
  // Serialize writes so a slower close cannot overwrite a later reopen.
  const settings = useMutation({
    ...trpc.courseAgent.panel.mutationOptions(),
    scope: { id: key },
    onSuccess: (_result, saved) => {
      // An earlier mutation must not clear a newer selection queued behind it.
      if (readPanelState(`${key}:settings`) === JSON.stringify(saved)) {
        savePanelState(`${key}:settings`, '');
      }
    },
  });
  // Catalog refresh only observes persisted execution status; it never retries publication or starts work.
  const conversations = useQuery({
    ...trpc.courseAgent.list.queryOptions(),
    refetchInterval: panel.open ? 3000 : 30_000,
  });
  const canStartNewWork = conversations.data?.canStartNewWork ?? initiallyEnabled;
  // Only the full-screen mobile panel is modal; the server initially renders desktop markup.
  const mobile = useSyncExternalStore(subscribeMobile, mobileSnapshot, () => false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const mobileModalRef = useRef<ComponentRef<typeof Offcanvas>>(null);
  const [sending, setSending] = useState('');
  const current = conversations.data?.conversations.find((c) => c.id === panel.selected);
  const readVersion = usePanelState(`${key}:read:${panel.selected}`);
  // A completion is read only while its conversation is visible.
  useEffect(() => {
    if (panel.open && current?.finishedAt && readVersion !== current.finishedAt) {
      savePanelState(`${key}:read:${panel.selected}`, current.finishedAt);
    }
  }, [panel.open, panel.selected, current?.finishedAt, key, readVersion]);

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

  const saveSettings = settings.mutate;
  const changePanel = useCallback(
    (change: Partial<CourseAgentPanelState>) => {
      if (change.open !== undefined && change.open !== panelRef.current.open) setAnimate(true);
      const next = { ...panelRef.current, ...change };
      panelRef.current = next;
      setPanel(next);
      // Keep the last selection even after its write succeeds: navigation may
      // have rendered the next page before that response reached this page.
      savePanelState(`${key}:panel`, JSON.stringify(next));
      savePanelState(`${key}:settings`, JSON.stringify(next));
      saveSettings(next);
      if (change.open === false && !mobile) requestAnimationFrame(() => toggleRef.current?.focus());
    },
    [saveSettings, mobile, key],
  );
  // Navigation may render session settings before the preceding mutation has
  // persisted. Restore/retry that local selection before first-send recovery.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const saved = readPanelState(`${key}:settings`) || readPanelState(`${key}:panel`);
      if (saved) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(saved);
        } catch {
          // Corrupt browser settings must not prevent first-send recovery below.
        }
        const pending = CourseAgentPanelStateSchema.safeParse(parsed);
        if (pending.success) changePanel(pending.data);
      }
      const recovered = readPanelState(`${key}:new:conversation`);
      if (recovered && !panelRef.current.selected) {
        changePanel({ selected: recovered, title: 'New conversation' });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [key, changePanel]);
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
              <>
                <div className="d-flex gap-2 mb-3 course-agent-picker">
                  <Dropdown className="flex-grow-1">
                    <Dropdown.Toggle
                      variant="light"
                      className="course-agent-selector w-100 d-flex justify-content-between align-items-center text-start"
                      aria-label="Conversation"
                    >
                      {current?.title ?? panel.title}
                    </Dropdown.Toggle>
                    <Dropdown.Menu
                      className="w-100 course-agent-conversations"
                      align={{ sm: 'start' }}
                    >
                      <Dropdown.Item
                        as="button"
                        active={!panel.selected}
                        disabled={startingAgent || !canStartNewWork}
                        onClick={() => changePanel({ selected: '', title: 'New conversation' })}
                      >
                        New conversation
                      </Dropdown.Item>
                      {conversations.data?.conversations.map((c) => (
                        <Dropdown.Item
                          key={c.id}
                          active={c.id === panel.selected}
                          onClick={() => changePanel({ selected: c.id, title: c.title })}
                        >
                          <span className="d-flex align-items-center justify-content-between gap-2">
                            {c.title}
                            {c.running || sending === c.id ? (
                              <span
                                className="spinner-border spinner-border-sm"
                                role="status"
                                aria-label="Working"
                              />
                            ) : c.finishedAt &&
                              readPanelState(`${key}:read:${c.id}`) !== c.finishedAt ? (
                              <span
                                className="course-agent-unread bg-primary"
                                role="img"
                                aria-label="New response"
                              />
                            ) : null}
                          </span>
                        </Dropdown.Item>
                      ))}
                    </Dropdown.Menu>
                  </Dropdown>
                  <Button
                    variant="outline-primary"
                    disabled={startingAgent || !canStartNewWork}
                    aria-label="New conversation"
                    title="New conversation"
                    onClick={() => changePanel({ selected: '', title: 'New conversation' })}
                  >
                    <i className="bi bi-plus-lg" aria-hidden="true" />
                  </Button>
                </div>
                <AppErrorAlert
                  error={getAppError<CourseAgentError['List' | 'Panel']>(
                    conversations.error ?? settings.error,
                  )}
                  render={{ UNKNOWN: ({ message }) => message }}
                />
              </>
            )}
            courseId={courseId}
            id={panel.selected}
            storageKey={`${key}:${panel.selected || 'new'}`}
            userName={userName}
            timezone={timezone}
            canStartNewWork={canStartNewWork}
            onCreated={(id, title) => {
              if (!panelRef.current.selected) changePanel({ selected: id, title });
              void conversations.refetch();
            }}
            onSending={(id) => {
              setSending(id);
              void conversations.refetch();
            }}
          />
        </div>
      </Offcanvas>
    </>
  );
}

CourseAgentPanel.displayName = 'CourseAgentPanel';
