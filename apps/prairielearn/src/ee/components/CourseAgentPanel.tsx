import { QueryClient, useMutation, useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { Fragment, type ReactNode, useEffect, useId, useState } from 'react';
import { Alert, Collapse, Form, Spinner } from 'react-bootstrap';
import { useStickToBottom } from 'use-stick-to-bottom';

import type { CourseAgentEvent } from '@prairielearn/course-agent-protocol';
import { formatDate, formatDateFriendly } from '@prairielearn/formatter';
import { QueryClientProviderDebug } from '@prairielearn/trpc/react';
import { OverlayTrigger } from '@prairielearn/ui';

import { createCourseTrpcClient } from '../../trpc/course/client.js';
import { TRPCProvider, useTRPC } from '../../trpc/course/context.js';

import { CourseAgentMarkdown } from './CourseAgentMarkdown.js';
import {
  getCourseAgentActivity,
  getCourseAgentDuration,
  getCourseAgentResponse,
  groupCourseAgentTurns,
} from './courseAgentEvents.js';

function CourseAgentPanelInner({
  courseId,
  userName,
  timezone,
}: {
  courseId: string;
  userName: string;
  timezone: string;
}) {
  const trpc = useTRPC();
  const [open, setOpen] = useState(true);
  const [closing, setClosing] = useState(false);
  const stickToBottom = useStickToBottom({ initial: 'smooth', resize: 'smooth' });

  function closePanel() {
    if (window.matchMedia('(min-width: 1200px), (prefers-reduced-motion: reduce)').matches) {
      setOpen(false);
    } else {
      setClosing(true);
    }
  }
  const [prompt, setPrompt] = useState('');
  const [events, setEvents] = useState<CourseAgentEvent[]>([]);
  const [streamOffset, setStreamOffset] = useState(0);
  const [streamRunId, setStreamRunId] = useState<string | null>(null);
  const [conversation, setConversation] = useState<{
    conversationId: string;
    sandboxId: string;
  } | null>(null);
  const snapshot = useQuery(
    trpc.courseAgent.get.queryOptions(
      conversation ?? { conversationId: '00000000-0000-0000-0000-000000000000', sandboxId: '' },
      { enabled: false },
    ),
  );
  const refetchSnapshot = snapshot.refetch;
  const start = useMutation(
    trpc.courseAgent.start.mutationOptions({
      onSuccess: (result) => {
        setConversation(result);
        setPrompt('');
        setStreamOffset(0);
        setStreamRunId(result.runId);
      },
    }),
  );

  // Keep the transcript attached to the resumable SSE relay while a run is active.
  useEffect(() => {
    if (!streamRunId) return;
    const abortController = new AbortController();
    let offset = 0;

    void (async () => {
      try {
        const response = await fetch(
          `/pl/course/${courseId}/course_agent/stream?runId=${streamRunId}&offset=${offset}`,
          { signal: abortController.signal },
        );
        if (response.status !== 204 && response.body) {
          if (!response.ok) throw new Error(`Stream failed (${response.status})`);
          const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
          let buffer = '';
          while (true) {
            const { done, value = '' } = await reader.read();
            if (done) break;
            offset += value.length;
            setStreamOffset(offset);
            buffer += value;
            const frames = buffer.split('\n\n');
            buffer = frames.pop() ?? '';
            for (const frame of frames) {
              const data = frame
                .split('\n')
                .find((line) => line.startsWith('data: '))
                ?.slice(6);
              if (!data) continue;
              const event = JSON.parse(data) as CourseAgentEvent;
              setEvents((current) => {
                const next = current.filter((existing) => existing.sequence !== event.sequence);
                return [...next, event].sort((left, right) => left.sequence - right.sequence);
              });
            }
          }
        }
        const result = await refetchSnapshot();
        if (result.data) setEvents(result.data.events);
      } catch (error) {
        if (!abortController.signal.aborted) {
          setStreamRunId(null);
          setEvents((current) => [
            ...current,
            {
              sequence: current.length,
              type: 'run.failed',
              occurredAt: new Date().toISOString(),
              data: { message: error instanceof Error ? error.message : String(error) },
            },
          ]);
        }
      } finally {
        if (!abortController.signal.aborted) setStreamRunId(null);
      }
    })();

    return () => abortController.abort();
  }, [courseId, refetchSnapshot, streamRunId]);

  const busy = start.isPending || streamRunId !== null;
  const turns = groupCourseAgentTurns(events);
  const lastFailure = findLastEvent(events, 'run.failed');
  const lastCompletion = findLastEvent(events, 'agent.completed');
  const failure =
    !busy && lastFailure && (!lastCompletion || lastFailure.sequence > lastCompletion.sequence)
      ? lastFailure
      : undefined;
  const snapshotError = !busy && snapshot.data?.status === 'failed' ? snapshot.data.error : null;

  return (
    <aside
      className={clsx('course-agent-panel', {
        'course-agent-panel-open': open,
        'course-agent-panel-collapsed': !open,
        'course-agent-panel-closing': closing,
      })}
      aria-label="Course agent panel"
    >
      <div className="course-agent-panel-rail border-start bg-light">
        <OverlayTrigger
          placement="left"
          tooltip={{ body: 'Expand course agent', props: { id: 'course-agent-expand-tooltip' } }}
        >
          <button
            type="button"
            className="course-agent-launcher btn bg-primary-subtle text-primary border border-primary-subtle rounded-circle shadow-sm p-2"
            aria-label="Expand course agent"
            onClick={() => setOpen(true)}
          >
            <i className="bi bi-stars fs-5" aria-hidden="true" />
          </button>
        </OverlayTrigger>
      </div>

      <div
        className="course-agent-panel-content border-start bg-light"
        onTransitionEnd={(event) => {
          if (closing && event.target === event.currentTarget && event.propertyName === 'opacity') {
            setOpen(false);
            setClosing(false);
          }
        }}
      >
        <header className="course-agent-header border-bottom bg-white px-3 py-3">
          <div className="d-flex align-items-center gap-2">
            <button
              type="button"
              className="btn btn-sm btn-light me-1 d-none d-xl-inline-flex"
              aria-label="Collapse course agent"
              onClick={closePanel}
            >
              <i className="bi bi-arrow-bar-right" aria-hidden="true" />
            </button>
            <strong className="d-flex align-items-center gap-2">
              <i className="bi bi-stars text-primary" aria-hidden="true" /> Course agent
            </strong>
            <button
              type="button"
              className="btn-close ms-auto d-xl-none"
              aria-label="Close course agent"
              onClick={closePanel}
            />
          </div>
        </header>

        <div
          ref={stickToBottom.scrollRef}
          className="course-agent-transcript"
          aria-label="Conversation messages"
          role="log"
          aria-live="polite"
        >
          <div ref={stickToBottom.contentRef} className="px-4 py-4">
            {turns.length === 0 && (
              <div className="course-agent-empty text-center text-muted px-3 py-5">
                <i className="bi bi-stars fs-2 text-primary" aria-hidden="true" />
                <p className="fw-semibold text-body mt-3 mb-1">What would you like to build?</p>
                <p className="small mb-0">
                  Ask the agent to create or improve PrairieLearn course content.
                </p>
              </div>
            )}
            {turns.map((turn, index) => {
              const active = busy && index === turns.length - 1;
              const response = getCourseAgentResponse(turn.events);
              const turnFailure = findLastEvent(turn.events, 'run.failed');
              return (
                <div key={turn.userMessage.sequence} className="course-agent-turn">
                  <UserMessage
                    userName={userName}
                    createdAt={turn.userMessage.occurredAt}
                    timezone={timezone}
                  >
                    {String(turn.userMessage.data.text ?? '')}
                  </UserMessage>
                  <AgentMessage>
                    <ToolCallGroup
                      events={turn.events}
                      startedAt={turn.userMessage.occurredAt}
                      busy={active}
                    />
                    {response && <CourseAgentMarkdown>{response}</CourseAgentMarkdown>}
                    {turnFailure && (
                      <Alert variant="danger" className="mb-0">
                        {String(turnFailure.data.message ?? 'The request could not be completed.')}
                      </Alert>
                    )}
                    {!active && (response || turnFailure) && (
                      <MessageMetadata
                        author="PrairieLearn"
                        createdAt={
                          findLastEvent(turn.events, 'agent.completed')?.occurredAt ??
                          turnFailure?.occurredAt ??
                          turn.userMessage.occurredAt
                        }
                        timezone={timezone}
                      />
                    )}
                  </AgentMessage>
                </div>
              );
            })}
            {busy && turns.length === 0 && (
              <div className="d-flex align-items-center gap-2 small text-muted mb-3">
                <Spinner size="sm" /> Starting agent…
              </div>
            )}
            {snapshotError && !failure && <Alert variant="danger">{snapshotError}</Alert>}
            {start.error && <Alert variant="danger">{start.error.message}</Alert>}
            <div className="pt-3 mt-3">
              <Diagnostics
                conversation={conversation}
                runId={streamRunId}
                offset={streamOffset}
                events={events}
                status={busy ? 'running' : (snapshot.data?.status ?? 'offline')}
              />
            </div>
          </div>
        </div>

        <footer className="course-agent-footer border-top bg-white p-3">
          <Form
            onSubmit={(event) => {
              event.preventDefault();
              if (busy || !prompt.trim()) return;
              void stickToBottom.scrollToBottom();
              start.mutate({ conversationId: conversation?.conversationId, prompt });
            }}
          >
            <Form.Control
              as="textarea"
              rows={2}
              className="course-agent-chat-input shadow-none"
              aria-label="Message course agent"
              placeholder="Ask anything about your course…"
              value={prompt}
              disabled={busy}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <div className="d-flex align-items-center mt-2">
              <span className="small text-muted">Codex</span>
              <button
                type="submit"
                className="btn btn-sm btn-primary ms-auto"
                aria-label="Send message"
                disabled={busy || !prompt.trim()}
              >
                {busy ? <Spinner size="sm" /> : <i className="bi bi-send-fill" />}
              </button>
            </div>
          </Form>
        </footer>
      </div>
    </aside>
  );
}

function UserMessage({
  children,
  userName,
  createdAt,
  timezone,
}: {
  children: ReactNode;
  userName: string;
  createdAt: string;
  timezone: string;
}) {
  return (
    <div
      className="d-flex flex-column align-items-end mb-4"
      role="article"
      aria-label="Message from you"
    >
      <div className="course-agent-user-message rounded bg-secondary-subtle p-3">{children}</div>
      <MessageMetadata author={userName} createdAt={createdAt} timezone={timezone} />
    </div>
  );
}

function MessageMetadata({
  author,
  createdAt,
  timezone,
}: {
  author: string;
  createdAt: string;
  timezone: string;
}) {
  const date = new Date(createdAt);
  return (
    <div className="small text-muted mt-1 d-flex align-items-center gap-2">
      <span>{author}</span>
      <span aria-hidden="true">·</span>
      <time dateTime={createdAt} title={formatDate(date, timezone)}>
        {formatDateFriendly(date, timezone, {
          includeTz: false,
          maxPrecision: 'minute',
          minPrecision: 'minute',
        })}
      </time>
    </div>
  );
}

function AgentMessage({ children }: { children: ReactNode }) {
  return (
    <div
      className="course-agent-agent-message d-flex flex-column gap-2 mb-4"
      role="article"
      aria-label="Message from PrairieLearn"
    >
      {children}
    </div>
  );
}

export function ToolCallGroup({
  events,
  startedAt,
  busy,
}: {
  events: CourseAgentEvent[];
  startedAt: string;
  busy: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const [now, setNow] = useState(Date.now);
  // Update elapsed time while the agent is working; completed turns use their recorded end time.
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [busy]);
  const activity = getCourseAgentActivity(events);
  const visible = expanded;
  const seconds = getCourseAgentDuration(startedAt, events, now);
  if (activity.length === 0) return busy ? <div className="small text-muted">Working…</div> : null;
  return (
    <div className="course-agent-tool-group">
      <button
        type="button"
        className="course-agent-tool-group-toggle btn btn-sm d-flex align-items-center gap-2 border-0 px-0 py-1 text-muted"
        aria-expanded={visible}
        aria-controls={id}
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-start">
          {busy ? `Working for ${seconds}s` : `Worked for ${seconds}s`}
        </span>
        {busy ? (
          <Spinner size="sm" />
        ) : (
          <i
            className={clsx(
              'bi course-agent-tool-chevron',
              visible ? 'bi-chevron-down' : 'bi-chevron-right',
            )}
            aria-hidden="true"
          />
        )}
      </button>
      <Collapse in={visible}>
        <div id={id}>
          <div className="d-flex flex-column gap-1 border-start ms-2 mt-1 ps-3 py-1">
            {activity.map((item) => (
              <div key={item.key} className="small text-muted d-flex align-items-start gap-1">
                <i
                  className={clsx('bi bi-fw flex-shrink-0', {
                    'bi-x-lg text-danger': item.status === 'failed',
                    'bi-check-lg text-success': item.status === 'completed',
                    'bi-three-dots': item.status === 'pending',
                  })}
                  aria-hidden="true"
                />
                <span className="text-break">
                  {item.label}
                  {item.status === 'pending' ? '…' : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      </Collapse>
    </div>
  );
}

function Diagnostics({
  conversation,
  runId,
  offset,
  events,
  status,
}: {
  conversation: { conversationId: string; sandboxId: string } | null;
  runId: string | null;
  offset: number;
  events: CourseAgentEvent[];
  status: string;
}) {
  const agentStarted = findLastEvent(events, 'agent.started');
  const usage = findLastEvent(events, 'usage.updated');
  const statusLabel =
    {
      offline: 'Not started',
      starting: 'Starting',
      running: 'Working',
      waiting_for_user: 'Ready',
      failed: 'Needs attention',
    }[status] ?? status;
  const identifiers = [
    ['Conversation', conversation?.conversationId ?? 'Not started'],
    ['Sandbox', conversation?.sandboxId ?? 'Not started'],
    ['Run', runId ?? 'Idle'],
    ['Codex thread', String(agentStarted?.data.threadId ?? 'Pending')],
  ];
  const tokenFields = [
    ['input_tokens', 'Input'],
    ['cached_input_tokens', 'Cached input'],
    ['cache_write_input_tokens', 'Cache writes'],
    ['output_tokens', 'Output'],
    ['reasoning_output_tokens', 'Reasoning'],
  ];
  return (
    <details className="course-agent-diagnostic-card small text-muted">
      <summary className="d-flex align-items-center gap-2 py-2">
        <i className="bi bi-activity text-muted" aria-hidden="true" />
        <span>Conversation diagnostics</span>
        <i className="course-agent-diagnostic-chevron bi bi-chevron-down" aria-hidden="true" />
      </summary>
      <div className="pt-2">
        <div className="mb-3">Status: {statusLabel}</div>
        <dl className="course-agent-diagnostics mb-3">
          {identifiers.map(([label, value]) => (
            <Fragment key={label}>
              <dt>{label}</dt>
              <dd>
                <code className="text-body">{value}</code>
              </dd>
            </Fragment>
          ))}
        </dl>
        <div className="d-flex flex-wrap gap-2 text-muted mb-3">
          <span className="rounded bg-light px-2 py-1">
            {events.length.toLocaleString('en-US')} events
          </span>
          <span className="rounded bg-light px-2 py-1">
            Stream cursor: {offset.toLocaleString('en-US')}
          </span>
        </div>
        <div className="fw-medium mb-2">Token usage</div>
        {usage ? (
          <dl className="course-agent-token-usage mb-0">
            {tokenFields.map(([key, label]) => {
              const value = usage.data[key];
              return typeof value === 'number' ? (
                <div key={key} className="d-flex justify-content-between gap-3 py-1">
                  <dt className="text-muted fw-normal">{label}</dt>
                  <dd className="mb-0 font-monospace">{value.toLocaleString('en-US')}</dd>
                </div>
              ) : null;
            })}
          </dl>
        ) : (
          <p className="text-muted mb-0">Available after the agent responds.</p>
        )}
      </div>
    </details>
  );
}

function findLastEvent(events: CourseAgentEvent[], type: CourseAgentEvent['type']) {
  for (let index = events.length - 1; index >= 0; index--) {
    if (events[index].type === type) return events[index];
  }
  return undefined;
}

export function CourseAgentPanel({
  trpcCsrfToken,
  courseId,
  userName,
  timezone,
}: {
  trpcCsrfToken: string;
  courseId: string;
  userName: string;
  timezone: string;
}) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    createCourseTrpcClient({ csrfToken: trpcCsrfToken, courseId }),
  );
  return (
    <QueryClientProviderDebug client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <CourseAgentPanelInner courseId={courseId} userName={userName} timezone={timezone} />
      </TRPCProvider>
    </QueryClientProviderDebug>
  );
}

CourseAgentPanel.displayName = 'CourseAgentPanel';
