/* eslint-disable @eslint-react/no-array-index-key -- Text segments and immutable diff lines keep their order within a message. */
import { useChat } from '@ai-sdk/react';
import { QueryClient, useMutation, useQuery } from '@tanstack/react-query';
import { DefaultChatTransport, type UIMessage } from 'ai';
import clsx from 'clsx';
import {
  type ComponentRef,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { Alert, Button, Dropdown, Form, Modal, Offcanvas } from 'react-bootstrap';
import { useForm } from 'react-hook-form';

import {
  type ApprovalDisplay,
  type ChatSnapshot,
  type SandboxDiagnostics,
  sendRequestSchema,
} from '@prairielearn/course-agent-contract';
import { getAppError } from '@prairielearn/trpc/client';
import { AppErrorAlert, QueryClientProviderDebug } from '@prairielearn/trpc/react';
import { OverlayTrigger } from '@prairielearn/ui';

import { formatCourseAgentDate } from '../../../lib/course-agent-date.js';
import type { CourseAgentPanelState } from '../../../lib/course-agent-panel.js';
import { createCourseTrpcClient } from '../../../trpc/course/client.js';
import { TRPCProvider, useTRPC } from '../../../trpc/course/context.js';
import type { CourseAgentError } from '../../../trpc/course/course-agent.js';
import { ActivityStatus } from '../ai/ActivityStatus.js';
import { ChatMessage } from '../ai/ChatMessage.js';
import { MemoizedMarkdown } from '../ai/MemoizedMarkdown.js';
import { ReasoningSummary } from '../ai/ReasoningSummary.js';

import { buildTranscript, mergeSnapshotMessages } from './message-parts.js';
import { readPanelState, savePanelState, usePanelState } from './panelState.js';

const pendingApprovalMessage =
  'A code change is pending approval. After approving or denying it, you can send a message.';

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
  const settings = useMutation(trpc.courseAgent.panel.mutationOptions());
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
      if (change.open !== undefined) setAnimate(true);
      const next = { ...panelRef.current, ...change };
      panelRef.current = next;
      setPanel(next);
      saveSettings(next);
      if (change.open === false && !mobile) requestAnimationFrame(() => toggleRef.current?.focus());
    },
    [saveSettings, mobile],
  );
  // A first Send can outlive navigation before its acknowledgement selects the conversation.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
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

function Conversation({
  courseId,
  id,
  storageKey,
  userName,
  timezone,
  onCreated,
  onSending,
  renderPicker,
  canStartNewWork,
}: {
  courseId: string;
  id: string;
  storageKey: string;
  userName: string;
  timezone: string;
  onCreated: (id: string, title: string) => void;
  onSending: (id: string) => void;
  renderPicker: (startingAgent: boolean) => ReactNode;
  canStartNewWork: boolean;
}) {
  const trpc = useTRPC();
  const base = `/pl/course/${courseId}/course-agent/${id}`;
  const [snapshot, setSnapshot] = useState<ChatSnapshot>({ messages: [], revision: 0 });
  const { register, watch, setValue, handleSubmit } = useForm({ defaultValues: { draft: '' } });
  const draft = watch('draft');
  const [statisticsOpen, setStatisticsOpen] = useState(false);
  const [loaded, setLoaded] = useState(!id);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const [failure, setFailure] = useState('');
  const [connection, setConnection] = useState<'connecting' | 'connected' | 'disconnected'>(
    id ? 'connecting' : 'connected',
  );
  const [connectionAttempt, setConnectionAttempt] = useState(0);
  const [transport] = useState(
    () =>
      new DefaultChatTransport({
        api: base,
        prepareReconnectToStreamRequest: () => ({ api: `${base}/stream` }),
      }),
  );
  const { messages, setMessages, status, resumeStream } = useChat({ id, transport });
  const busy = status === 'streaming' || status === 'submitted';
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const create = useMutation(trpc.courseAgent.create.mutationOptions());
  const createdIdRef = useRef(id);
  const [optimistic, setOptimistic] = useState<UIMessage | null>(null);
  const send = useMutation(trpc.courseAgent.send.mutationOptions());
  const cancel = useMutation(trpc.courseAgent.stop.mutationOptions());
  const cleanup = useMutation(trpc.courseAgent.cleanup.mutationOptions());
  const working =
    !snapshot.blocked &&
    (send.isPending ||
      create.isPending ||
      busy ||
      ['starting', 'waiting_for_agent'].includes(snapshot.diagnostics?.state ?? ''));
  const startingAgent =
    snapshot.diagnostics?.state === 'starting' ||
    create.isPending ||
    (send.isPending && (!snapshot.diagnostics || snapshot.diagnostics.state === 'absent'));
  const pendingRef = useRef<{ id: string; text: string; expectedRevision: number } | null>(null);
  // Stream observation is re-established after navigation; closing it never stops native execution.
  useEffect(() => {
    setValue('draft', readPanelState(storageKey + ':draft'));
    const saved = readPanelState(storageKey + ':pending');
    if (saved) {
      const value = sendRequestSchema.safeParse(JSON.parse(saved));
      if (value.success) {
        pendingRef.current = value.data;
        if (!readPanelState(storageKey + ':draft')) {
          setValue('draft', value.data.text);
          savePanelState(storageKey + ':draft', value.data.text);
        }
      }
    }
    if (!id) return;
    const source = new EventSource(`${base}/events`);
    const connectionError = (event: MessageEvent) => {
      setFailure(JSON.parse(event.data).message);
      setConnection('disconnected');
      source.close();
    };
    source.addEventListener('connection-error', connectionError);
    source.onmessage = (event) => {
      const next = JSON.parse(event.data) as ChatSnapshot;
      const pending = pendingRef.current;
      if (pending && next.messages.some((message) => message.id === pending.id)) {
        pendingRef.current = null;
        savePanelState(storageKey + ':pending', '');
        if (readPanelState(storageKey + ':draft') === pending.text) {
          setValue('draft', '');
          savePanelState(storageKey + ':draft', '');
        }
        const startupKey = storageKey.replace(/:[^:]+$/, ':new:conversation');
        if (readPanelState(startupKey) === id) savePanelState(startupKey, '');
      }
      setSnapshot((current) => ({ ...next, revision: Math.max(current.revision, next.revision) }));
      setLoaded(true);
      setConnection('connected');
      setFailure('');
      if (!busyRef.current) {
        setMessages(next.messages);
        if (
          !next.blocked &&
          ['starting', 'waiting_for_agent'].includes(next.diagnostics?.state ?? '')
        ) {
          busyRef.current = true;
          void resumeStream().finally(() => {
            busyRef.current = false;
          });
        }
      }
    };
    source.onerror = () => {
      // EventSource retries transport errors and the server's scheduled five-minute close.
      // Explicit connection-error events above still stop retries on authorization failures.
      if (source.readyState === EventSource.CLOSED) {
        setConnection('disconnected');
        setFailure(
          'The conversation connection closed. Reload the page to check your access, or reconnect.',
        );
      } else {
        setConnection('connecting');
      }
    };
    return () => {
      source.removeEventListener('connection-error', connectionError);
      source.close();
    };
  }, [base, id, storageKey, setMessages, resumeStream, setValue, connectionAttempt]);

  // Keep incoming output and newly loaded conversations visible at the end of the transcript.
  useEffect(() => {
    const transcript = transcriptRef.current;
    if (transcript) transcript.scrollTop = transcript.scrollHeight;
  }, [messages, optimistic, loaded, snapshot.approvals]);

  async function submit() {
    if (!canStartNewWork || !draft.trim() || snapshot.blocked || connection !== 'connected') return;
    const message =
      pendingRef.current?.text === draft
        ? pendingRef.current
        : { id: crypto.randomUUID(), text: draft, expectedRevision: snapshot.revision };
    pendingRef.current = message;
    savePanelState(storageKey + ':pending', JSON.stringify(message));
    setValue('draft', '');
    savePanelState(storageKey + ':draft', '');
    setOptimistic({
      id: message.id,
      role: 'user',
      parts: [{ type: 'text', text: message.text }],
      metadata: { created_at: new Date().toISOString() },
    });
    try {
      const conversationId = createdIdRef.current || (await create.mutateAsync()).id;
      createdIdRef.current = conversationId;
      if (!id) {
        savePanelState(storageKey + ':conversation', conversationId);
        const target = storageKey.replace(/:new$/, `:${conversationId}`);
        savePanelState(target + ':pending', JSON.stringify(message));
        savePanelState(target + ':draft', readPanelState(storageKey + ':draft'));
      }
      onSending(conversationId);
      const result = await send.mutateAsync({ conversationId, message });
      setSnapshot((current) => ({
        ...current,
        revision: Math.max(current.revision, result.revision),
      }));
      pendingRef.current = null;
      savePanelState(storageKey + ':pending', '');
      if (!id) {
        savePanelState(
          storageKey.replace(/:new$/, `:${conversationId}`) + ':draft',
          readPanelState(storageKey + ':draft'),
        );
        savePanelState(storageKey + ':draft', '');
        savePanelState(storageKey + ':conversation', '');
        savePanelState(storageKey.replace(/:new$/, `:${conversationId}`) + ':pending', '');
        onCreated(conversationId, result.title);
      } else if (!busyRef.current) {
        busyRef.current = true;
        void resumeStream().finally(() => {
          busyRef.current = false;
        });
      }
    } catch {
      setOptimistic(null);
      // Restore the failed send only if the user has not started another draft.
      if (!readPanelState(storageKey + ':draft')) {
        setValue('draft', message.text);
        savePanelState(storageKey + ':draft', message.text);
      }
    } finally {
      onSending('');
    }
  }

  const transcriptMessages = mergeSnapshotMessages(snapshot.messages, messages);
  const mutationError = create.error ?? send.error ?? cancel.error ?? cleanup.error;
  return (
    <>
      {renderPicker(startingAgent)}
      {failure && (
        <Alert
          variant="warning"
          className="d-flex align-items-center justify-content-between gap-3"
        >
          <span>{failure}</span>
          <Button
            size="sm"
            className="flex-shrink-0"
            onClick={() => {
              setConnection('connecting');
              setConnectionAttempt((value) => value + 1);
            }}
          >
            Reconnect
          </Button>
        </Alert>
      )}
      <AppErrorAlert
        error={getAppError<CourseAgentError['Create' | 'Send' | 'Stop' | 'Cleanup']>(mutationError)}
        render={{ UNKNOWN: ({ message }) => message }}
      />
      {snapshot.diagnostics?.cleanup?.error && (
        <Alert
          variant="warning"
          className="d-flex align-items-center justify-content-between gap-3"
        >
          <span>We couldn’t finish cleaning up the workspace.</span>
          <Button
            size="sm"
            className="flex-shrink-0"
            disabled={cleanup.isPending}
            onClick={() => cleanup.mutate({ conversationId: id })}
          >
            Retry cleanup
          </Button>
        </Alert>
      )}
      {snapshot.diagnostics?.checkpointError && (
        <Alert variant="warning">
          We couldn’t save the latest file changes. Some changes may be lost if the workspace
          restarts.
        </Alert>
      )}
      <div ref={transcriptRef} className="flex-grow-1 overflow-auto course-agent-transcript">
        {!loaded && (
          <div className="d-flex justify-content-center align-items-center h-100" role="status">
            <span className="spinner-border text-secondary" />
            <span className="visually-hidden">Loading conversation</span>
          </div>
        )}
        {loaded && messages.length === 0 && !optimistic && (
          <div className="course-agent-empty text-center text-muted py-5 px-3">
            <i className="bi bi-stars fs-1 text-primary" aria-hidden="true" />
            <h3 className="h5 mt-3 text-body">What would you like to work on?</h3>
            <p>Set up your course, improve a question, or build an assessment.</p>
          </div>
        )}
        {loaded && (
          <Transcript
            userName={userName}
            timezone={timezone}
            messages={
              optimistic && !transcriptMessages.some((m) => m.id === optimistic.id)
                ? [...transcriptMessages, optimistic]
                : transcriptMessages
            }
            approvals={snapshot.approvals ?? []}
            renderCodeChange={() => null}
          />
        )}
        <div role="status" aria-live="polite" className="px-3 pb-3">
          {working && (
            <ActivityStatus
              state="streaming"
              statusText={startingAgent ? 'Starting agent…' : 'Working…'}
            />
          )}
        </div>
      </div>
      <Modal
        show={statisticsOpen}
        aria-labelledby="course-agent-statistics-title"
        onHide={() => setStatisticsOpen(false)}
      >
        <Modal.Header closeButton>
          <Modal.Title as="h2" id="course-agent-statistics-title">
            Conversation statistics
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <dl>
            <dt>Estimated cost</dt>
            <dd>
              {!id
                ? '$0.0000'
                : snapshot.usage?.estimatedCost == null
                  ? 'Unknown'
                  : `$${snapshot.usage.estimatedCost.toFixed(4)}`}
            </dd>
            <dt>Input tokens</dt>
            <dd>{!id ? 0 : (snapshot.usage?.input ?? 'Unknown')}</dd>
            <dt>Output tokens</dt>
            <dd>{!id ? 0 : (snapshot.usage?.output ?? 'Unknown')}</dd>
          </dl>
          {statisticsOpen && (
            <SandboxStatistics
              diagnostics={snapshot.diagnostics}
              timezone={timezone}
              newConversation={!id}
            />
          )}
        </Modal.Body>
      </Modal>
      <Form className="course-agent-composer pt-3 mt-2" onSubmit={handleSubmit(submit)}>
        {(!canStartNewWork || connection !== 'connected') && (
          <p id={`course-agent-send-reason-${id}`} className="small text-muted" role="status">
            {!canStartNewWork
              ? 'New messages are disabled. Saved conversations and recovery remain available.'
              : 'Connecting to conversation…'}
          </p>
        )}
        <Form.Control
          id={`course-agent-input-${id}`}
          aria-label="Message"
          placeholder="Ask anything about your course…"
          as="textarea"
          rows={3}
          defaultValue=""
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              if (!send.isPending && !create.isPending) void handleSubmit(submit)();
            }
          }}
          {...register('draft', {
            onChange: (event) => {
              savePanelState(storageKey + ':draft', event.target.value);
              if (!id && createdIdRef.current) {
                savePanelState(
                  storageKey.replace(/:new$/, `:${createdIdRef.current}`) + ':draft',
                  event.target.value,
                );
              }
              if (pendingRef.current && pendingRef.current.text !== event.target.value) {
                pendingRef.current = null;
                savePanelState(storageKey + ':pending', '');
              }
            },
          })}
        />
        <div className="d-flex gap-2 mt-2">
          <Button
            className="course-agent-action"
            variant="outline-secondary"
            aria-label="Statistics"
            title="Statistics"
            onClick={() => setStatisticsOpen(true)}
          >
            <i className="bi bi-bar-chart" aria-hidden="true" />
          </Button>
          {working && !draft.trim() ? (
            <Button
              type="button"
              className="course-agent-action ms-auto"
              variant="primary"
              aria-label="Stop"
              title="Stop"
              disabled={
                cancel.isPending || create.isPending || send.isPending || !createdIdRef.current
              }
              onClick={() => cancel.mutate({ conversationId: createdIdRef.current })}
            >
              <i className="bi bi-stop-fill" aria-hidden="true" />
            </Button>
          ) : (
            <OverlayTrigger
              placement="top"
              trigger={snapshot.blocked ? ['hover', 'focus'] : []}
              show={snapshot.blocked ? undefined : false}
              tooltip={{
                props: { id: `course-agent-send-tooltip-${id}` },
                body: pendingApprovalMessage,
              }}
            >
              <span className="ms-auto">
                {snapshot.blocked && (
                  <span id={`course-agent-pending-approval-${id}`} className="visually-hidden">
                    {pendingApprovalMessage}
                  </span>
                )}
                <Button
                  type="submit"
                  aria-label="Send"
                  aria-describedby={
                    snapshot.blocked
                      ? `course-agent-pending-approval-${id}`
                      : !canStartNewWork || connection !== 'connected'
                        ? `course-agent-send-reason-${id}`
                        : undefined
                  }
                  style={snapshot.blocked ? { pointerEvents: 'none' } : undefined}
                  className="course-agent-action"
                  disabled={
                    connection !== 'connected' ||
                    !canStartNewWork ||
                    snapshot.blocked ||
                    !draft.trim() ||
                    send.isPending ||
                    create.isPending
                  }
                >
                  <i className="bi bi-send-fill" aria-hidden="true" />
                </Button>
              </span>
            </OverlayTrigger>
          )}
        </div>
      </Form>
    </>
  );
}

function Transcript({
  messages,
  approvals,
  renderCodeChange,
  userName,
  timezone,
}: {
  messages: UIMessage[];
  approvals: ApprovalDisplay[];
  renderCodeChange: (approval: ApprovalDisplay) => ReactNode;
  userName: string;
  timezone: string;
}) {
  return buildTranscript(messages, approvals).map((entry) =>
    entry.role === 'user' ? (
      <ChatMessage
        key={entry.id}
        messageRole="user"
        className="d-flex flex-column align-items-end mb-3"
        label={`Message from ${userName}`}
      >
        <div className="p-3 rounded bg-secondary-subtle course-agent-user-message">
          {entry.parts
            .flatMap((p) => (p.kind === 'part' && p.part.type === 'text' ? [p.part.text] : []))
            .join('\n')}
        </div>
        <div className="small text-muted px-1 mt-1">
          {userName}
          {(() => {
            const metadata = messages.find((m) => m.id === entry.id)?.metadata;
            return metadata &&
              typeof metadata === 'object' &&
              'created_at' in metadata &&
              typeof metadata.created_at === 'string' ? (
              <> · {formatCourseAgentDate(new Date(metadata.created_at), timezone, false)}</>
            ) : null;
          })()}
        </div>
      </ChatMessage>
    ) : (
      <ChatMessage key={entry.id} messageRole={entry.role}>
        {entry.parts.map((part, index) => {
          if (part.kind === 'code-change') {
            return <div key={part.approval.id}>{renderCodeChange(part.approval)}</div>;
          }
          if (part.kind === 'tools') {
            return (
              <div key={index} className="d-flex flex-column gap-2 my-2">
                {part.parts.map((tool) => {
                  const state = toolState(tool);
                  const details = toolDetails(tool);
                  if (!details) {
                    return (
                      <div
                        key={'toolCallId' in tool ? String(tool.toolCallId) : index}
                        className="course-agent-tool-empty"
                      >
                        <ActivityStatus state={state} statusText={toolTitle(tool)} />
                      </div>
                    );
                  }
                  return (
                    <details
                      key={'toolCallId' in tool ? String(tool.toolCallId) : index}
                      className="course-agent-tool"
                      open={state === 'error'}
                    >
                      <summary>
                        <ActivityStatus state={state} statusText={toolTitle(tool)} />
                      </summary>
                      <pre className="small mt-2 mb-0 p-2 bg-body border rounded">{details}</pre>
                    </details>
                  );
                })}
              </div>
            );
          }
          const value = part.part;
          if (value.type === 'text') return <MemoizedMarkdown key={index} content={value.text} />;
          if (value.type === 'reasoning') {
            return (
              <div key={index} className="mb-2">
                <ReasoningSummary text={value.text} state={value.state} />
              </div>
            );
          }
          return null;
        })}
      </ChatMessage>
    ),
  );
}

function toolState(part: UIMessage['parts'][number]): 'streaming' | 'success' | 'error' {
  if ('state' in part && part.state === 'output-error') return 'error';
  if (!('state' in part) || part.state !== 'output-available') return 'streaming';
  const output = 'output' in part ? part.output : undefined;
  if (
    output &&
    typeof output === 'object' &&
    (('exitCode' in output && typeof output.exitCode === 'number' && output.exitCode !== 0) ||
      ('status' in output && output.status === 'failed'))
  ) {
    return 'error';
  }
  return 'success';
}

function toolTitle(part: UIMessage['parts'][number]) {
  const running = toolState(part) === 'streaming';
  const name = 'toolName' in part ? String(part.toolName) : part.type.replace(/^tool-/, '');
  if (name === 'push_sync') return 'Code change request';
  if (name === 'command_execution') {
    const input = 'input' in part ? part.input : undefined;
    const command =
      input && typeof input === 'object' && 'command' in input ? String(input.command) : '';
    if (command) return `${running ? 'Running' : 'Command'}: ${command}`;
    return running ? 'Running command…' : 'Ran command';
  }
  if (name === 'file_change') return running ? 'Editing files…' : 'Edited files';
  return name.replaceAll('_', ' ');
}

function toolDetails(part: UIMessage['parts'][number]) {
  const input = 'input' in part ? part.input : undefined;
  const output = 'output' in part ? part.output : undefined;
  if (input && typeof input === 'object' && 'command' in input) {
    const text = output && typeof output === 'object' && 'output' in output ? output.output : '';
    return `${String(input.command)}\n${String(text ?? '')}`;
  }
  if ('errorText' in part) return String(part.errorText);
  const value = output ?? input;
  return value == null || (typeof value === 'object' && Object.keys(value).length === 0)
    ? ''
    : JSON.stringify(value, null, 2);
}

CourseAgentPanel.displayName = 'CourseAgentPanel';

function SandboxStatistics({
  diagnostics,
  timezone,
  newConversation,
}: {
  diagnostics?: SandboxDiagnostics;
  timezone: string;
  newConversation: boolean;
}) {
  const [now, setNow] = useState(Date.now);
  // Countdown ticks only while statistics are open; diagnostics come from the existing snapshot stream.
  useEffect(() => {
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(clock);
  }, []);

  function expiration(at: number | null | undefined) {
    if (at == null) return '—';
    const seconds = Math.max(0, Math.ceil((at - now) / 1000));
    return `${formatCourseAgentDate(new Date(at), timezone)} (${seconds ? `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m ${seconds % 60}s remaining` : 'due; awaiting cleanup'})`;
  }
  return (
    <dl aria-label="Sandbox diagnostics">
      <dt>Sandbox state</dt>
      <dd>
        <code>{diagnostics?.state ?? (newConversation ? 'absent' : 'Unavailable')}</code>
      </dd>
      <dt>Idle expiration</dt>
      <dd>{expiration(diagnostics?.idleExpiresAt)}</dd>
      <dt>Interaction expiration</dt>
      <dd>{expiration(diagnostics?.interactionExpiresAt)}</dd>
    </dl>
  );
}
