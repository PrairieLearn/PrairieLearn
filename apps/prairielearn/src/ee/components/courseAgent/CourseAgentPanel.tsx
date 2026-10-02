/* eslint-disable @eslint-react/no-array-index-key -- Text segments and immutable diff lines keep their order within a message. */
import { useChat } from '@ai-sdk/react';
import { QueryClient, useMutation, useQuery } from '@tanstack/react-query';
import { DefaultChatTransport, type UIMessage } from 'ai';
import clsx from 'clsx';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Alert, Button, Dropdown, Form, Modal } from 'react-bootstrap';
import { useForm } from 'react-hook-form';

import {
  type ApprovalDisplay,
  type ChatSnapshot,
  type SandboxDiagnostics,
  sendRequestSchema,
} from '@prairielearn/course-agent-contract';
import { getAppError } from '@prairielearn/trpc/client';
import { AppErrorAlert, QueryClientProviderDebug } from '@prairielearn/trpc/react';

import { formatCourseAgentDate } from '../../../lib/course-agent-date.js';
import type { CourseAgentPanelState } from '../../../lib/course-agent-panel.js';
import { createCourseTrpcClient } from '../../../trpc/course/client.js';
import { TRPCProvider, useTRPC } from '../../../trpc/course/context.js';
import type { CourseAgentError } from '../../../trpc/course/course-agent.js';
import { ActivityStatus } from '../ai/ActivityStatus.js';
import { ChatMessage } from '../ai/ChatMessage.js';
import { MemoizedMarkdown } from '../ai/MemoizedMarkdown.js';
import { ReasoningSummary } from '../ai/ReasoningSummary.js';

import { buildTranscript } from './message-parts.js';
import { readPanelState, savePanelState, usePanelState } from './panelState.js';

export function CourseAgentPanel({
  courseId,
  userId,
  csrfToken,
  userName,
  timezone,
  initialPanelState,
}: {
  courseId: string;
  userId: string;
  csrfToken: string;
  userName: string;
  timezone: string;
  initialPanelState: CourseAgentPanelState;
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
}: {
  courseId: string;
  userId: string;
  userName: string;
  timezone: string;
  initialPanelState: CourseAgentPanelState;
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
    refetchInterval: 3000,
  });
  const [sending, setSending] = useState('');
  const current = conversations.data?.find((c) => c.id === panel.selected);
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

  function changePanel(change: Partial<CourseAgentPanelState>) {
    if (change.open !== undefined) setAnimate(true);
    const next = { ...panelRef.current, ...change };
    panelRef.current = next;
    setPanel(next);
    settings.mutate(next);
  }
  return (
    <>
      <Button
        hidden={panel.open}
        title="Open course agent"
        className="course-agent-toggle"
        variant="primary"
        aria-label="Open course agent"
        onClick={() => changePanel({ open: true })}
      >
        <i className="bi bi-stars" aria-hidden="true" />
      </Button>
      <aside
        data-open={panel.open}
        inert={!panel.open}
        aria-hidden={!panel.open}
        className={clsx('course-agent-panel', animate && 'course-agent-panel-animate')}
        aria-label="Course agent"
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
          <div className="d-flex gap-2 mb-3 course-agent-picker">
            <Dropdown className="flex-grow-1">
              <Dropdown.Toggle
                variant="light"
                className="course-agent-selector w-100 d-flex justify-content-between align-items-center text-start"
                aria-label="Conversation"
              >
                {current?.title ?? panel.title}
              </Dropdown.Toggle>
              <Dropdown.Menu className="w-100 course-agent-conversations" align={{ sm: 'start' }}>
                <Dropdown.Item
                  active={!panel.selected}
                  onClick={() => changePanel({ selected: '', title: 'New conversation' })}
                >
                  New conversation
                </Dropdown.Item>
                {conversations.data?.map((c) => (
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
                      ) : c.finishedAt && readPanelState(`${key}:read:${c.id}`) !== c.finishedAt ? (
                        <span
                          className="course-agent-unread bg-primary"
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
          <Conversation
            key={panel.selected || 'new'}
            courseId={courseId}
            id={panel.selected}
            storageKey={`${key}:${panel.selected || 'new'}`}
            userName={userName}
            timezone={timezone}
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
      </aside>
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
}: {
  courseId: string;
  id: string;
  storageKey: string;
  userName: string;
  timezone: string;
  onCreated: (id: string, title: string) => void;
  onSending: (id: string) => void;
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
  const { messages, setMessages, status, resumeStream, stop } = useChat({ id, transport });
  const busy = status === 'streaming' || status === 'submitted';
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const create = useMutation(trpc.courseAgent.create.mutationOptions());
  const createdIdRef = useRef(id);
  const [optimistic, setOptimistic] = useState<UIMessage | null>(null);
  const send = useMutation(trpc.courseAgent.send.mutationOptions());
  const cancel = useMutation(trpc.courseAgent.stop.mutationOptions());
  const cleanup = useMutation(trpc.courseAgent.cleanup.mutationOptions());
  const decision = useMutation(trpc.courseAgent.decide.mutationOptions());
  const prepare = useMutation(trpc.courseAgent.prepare.mutationOptions());
  const working =
    !snapshot.blocked &&
    (send.isPending ||
      create.isPending ||
      busy ||
      snapshot.diagnostics?.state === 'waiting_for_agent');
  const pendingRef = useRef<{ id: string; text: string; expectedRevision: number } | null>(null);
  // Stream observation is re-established after navigation; closing it never stops native execution.
  useEffect(() => {
    setValue('draft', readPanelState(storageKey + ':draft'));
    const saved = readPanelState(storageKey + ':pending');
    if (saved) {
      const value = sendRequestSchema.safeParse(JSON.parse(saved));
      if (value.success) pendingRef.current = value.data;
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
      setSnapshot(next);
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
      setConnection('disconnected');
      setFailure('Conversation disconnected');
      source.close();
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
    if (!draft.trim() || snapshot.blocked || connection !== 'connected') return;
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
      onSending(conversationId);
      const result = await send.mutateAsync({ conversationId, message });
      pendingRef.current = null;
      savePanelState(storageKey + ':pending', '');
      if (!id) {
        savePanelState(
          storageKey.replace(/:new$/, `:${conversationId}`) + ':draft',
          readPanelState(storageKey + ':draft'),
        );
        savePanelState(storageKey + ':draft', '');
        onCreated(conversationId, result.title);
      } else {
        await stop();
        void resumeStream();
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

  function decide(approval: ApprovalDisplay, approved: boolean) {
    decision.mutate({
      conversationId: id,
      decision: {
        id: approval.id,
        digest: approval.digest,
        expectedRevision: snapshot.revision,
        approved,
      },
    });
  }
  const mutationError =
    create.error ?? send.error ?? cancel.error ?? decision.error ?? prepare.error ?? cleanup.error;
  return (
    <>
      {failure && (
        <Alert variant="warning">
          Conversation disconnected{' '}
          <Button
            variant="link"
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
        error={getAppError<
          CourseAgentError['Create' | 'Send' | 'Stop' | 'Decide' | 'Prepare' | 'Cleanup']
        >(mutationError)}
        render={{ UNKNOWN: ({ message }) => message }}
      />
      {(snapshot.diagnostics?.cleanup?.error || snapshot.diagnostics?.checkpointError) && (
        <Alert variant="warning">
          {snapshot.diagnostics.cleanup?.error ?? snapshot.diagnostics.checkpointError}
          {snapshot.diagnostics.cleanup?.error && (
            <Button variant="link" onClick={() => cleanup.mutate({ conversationId: id })}>
              Retry cleanup
            </Button>
          )}
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
              optimistic && !messages.some((m) => m.id === optimistic.id)
                ? [...messages, optimistic]
                : messages
            }
            approvals={snapshot.approvals ?? []}
            renderCodeChange={(approval) => (
              <section className="card mb-3">
                <div className="card-body">
                  <strong>
                    {approval.status === 'pending'
                      ? 'Code change · Review requested'
                      : approval.status === 'approved'
                        ? 'Code change · Approved'
                        : 'Code change · Rejected'}
                  </strong>
                  <ChangeDiff diff={approval.diff} />

                  {snapshot.approval?.id === approval.id && (
                    <>
                      <p className="text-danger">
                        {snapshot.publication?.error &&
                          (snapshot.blocked
                            ? snapshot.publication.error
                            : 'Course sync failed; the agent was notified.')}
                      </p>
                      {approval.status === 'pending' ? (
                        <>
                          <Button
                            disabled={
                              decision.isPending || snapshot.publication?.status === 'invalid'
                            }
                            onClick={() => decide(approval, true)}
                          >
                            Approve and sync
                          </Button>{' '}
                          <Button
                            variant="outline-secondary"
                            disabled={decision.isPending}
                            onClick={() => decide(approval, false)}
                          >
                            Reject
                          </Button>
                          {snapshot.publication?.status === 'invalid' && (
                            <Button
                              variant="link"
                              onClick={() =>
                                prepare.mutate({ conversationId: id, operationId: approval.id })
                              }
                            >
                              Retry preparation
                            </Button>
                          )}
                        </>
                      ) : (
                        snapshot.blocked && (
                          <Button
                            disabled={decision.isPending}
                            onClick={() => decide(approval, approval.status === 'approved')}
                          >
                            Retry completion
                          </Button>
                        )
                      )}
                    </>
                  )}
                </div>
              </section>
            )}
          />
        )}
        <div role="status" aria-live="polite" className="px-3 pb-3">
          {working && <ActivityStatus state="streaming" statusText="Working…" />}
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
            <span
              className="ms-auto"
              title={
                snapshot.blocked
                  ? 'Act on the code change request before sending a message.'
                  : 'Send'
              }
            >
              <Button
                type="submit"
                aria-label="Send"
                title={
                  snapshot.blocked
                    ? 'Act on the code change request before sending a message.'
                    : working
                      ? 'Send to steer the agent'
                      : 'Send'
                }
                className="course-agent-action"
                disabled={
                  connection !== 'connected' ||
                  snapshot.blocked ||
                  !draft.trim() ||
                  send.isPending ||
                  create.isPending
                }
              >
                <i className="bi bi-send-fill" aria-hidden="true" />
              </Button>
            </span>
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
            return <ReasoningSummary key={index} text={value.text} state={value.state} />;
          }
          if (
            value.type === 'data-steering' &&
            value.data &&
            typeof value.data === 'object' &&
            'text' in value.data
          ) {
            return <blockquote key={index}>{String(value.data.text)}</blockquote>;
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

function ChangeDiff({ diff }: { diff: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="my-2">
        <Button variant="outline-secondary" size="sm" onClick={() => setOpen(true)}>
          View changes
        </Button>
      </div>
      <Modal
        show={open}
        size="xl"
        aria-labelledby="course-agent-diff-title"
        scrollable
        onHide={() => setOpen(false)}
      >
        <Modal.Header closeButton>
          <Modal.Title id="course-agent-diff-title">Code changes</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <pre className="course-agent-diff">
            {diff.split('\n').map((line, index) => (
              <span
                key={index}
                className={
                  line.startsWith('+') && !line.startsWith('+++')
                    ? 'bg-success-subtle'
                    : line.startsWith('-') && !line.startsWith('---')
                      ? 'bg-danger-subtle'
                      : ''
                }
              >
                {line}
                {'\n'}
              </span>
            ))}
          </pre>
        </Modal.Body>
      </Modal>
    </>
  );
}

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
