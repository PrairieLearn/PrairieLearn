import { QueryClient, useMutation, useQuery } from '@tanstack/react-query';
import { type ReactNode, useEffect, useState } from 'react';
import { Alert, Form, Spinner } from 'react-bootstrap';

import type { CourseAgentEvent } from '@prairielearn/course-agent-protocol';
import { QueryClientProviderDebug } from '@prairielearn/trpc/react';
import { OverlayTrigger } from '@prairielearn/ui';

import { createCourseTrpcClient } from '../../trpc/course/client.js';
import { TRPCProvider, useTRPC } from '../../trpc/course/context.js';

function CourseAgentPanelInner({
  courseId,
  courseShortName,
  diagnosticsEnabled,
}: {
  courseId: string;
  courseShortName: string;
  diagnosticsEnabled: boolean;
}) {
  const trpc = useTRPC();
  const [open, setOpen] = useState(true);
  const [prompt, setPrompt] = useState('');
  const [events, setEvents] = useState<CourseAgentEvent[]>([]);
  const [streamOffset, setStreamOffset] = useState(0);
  const [streamRunId, setStreamRunId] = useState<string | null>(null);
  const [conversation, setConversation] = useState<{
    conversationId: string;
    sandboxId: string;
  } | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(
    () =>
      diagnosticsEnabled && localStorage.getItem(`course-agent-diagnostics:${courseId}`) === '1',
  );
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
  const toolEvents = events.filter((event) => event.type.startsWith('tool.'));
  const messages = events.filter(
    (event) => event.type === 'user.message' || event.type === 'assistant.delta',
  );
  const lastFailure = findLastEvent(events, 'run.failed');
  const lastCompletion = findLastEvent(events, 'agent.completed');
  const failure =
    !busy && lastFailure && (!lastCompletion || lastFailure.sequence > lastCompletion.sequence)
      ? lastFailure
      : undefined;
  const snapshotError = !busy && snapshot.data?.status === 'failed' ? snapshot.data.error : null;

  return (
    <aside
      className={`course-agent-panel ${open ? 'course-agent-panel-open' : 'course-agent-panel-collapsed'}`}
      aria-label="Course agent panel"
    >
      <div className="course-agent-panel-rail border-start bg-light">
        <OverlayTrigger
          placement="left"
          tooltip={{ body: 'Expand course agent', props: { id: 'course-agent-expand-tooltip' } }}
        >
          <button
            type="button"
            className="btn btn-link text-primary p-2"
            aria-label="Expand course agent"
            onClick={() => setOpen(true)}
          >
            <i className="bi bi-stars fs-5" aria-hidden="true" />
          </button>
        </OverlayTrigger>
      </div>

      <div className="course-agent-panel-content border-start bg-light">
        <header className="course-agent-header border-bottom bg-white px-3 py-3">
          <div className="d-flex align-items-center gap-2">
            <OverlayTrigger
              placement="bottom"
              tooltip={{ body: 'Collapse', props: { id: 'course-agent-collapse-tooltip' } }}
            >
              <button
                type="button"
                className="btn btn-sm btn-light"
                aria-label="Collapse course agent"
                onClick={() => setOpen(false)}
              >
                <i className="bi bi-arrow-bar-right" />
              </button>
            </OverlayTrigger>
            <strong className="d-flex align-items-center gap-2">
              <i className="bi bi-stars text-primary" aria-hidden="true" /> Course agent
            </strong>
            <span className="text-muted small text-truncate ms-auto">{courseShortName}</span>
          </div>
        </header>

        <div className="course-agent-transcript px-4 py-4" aria-live="polite">
          {messages.length === 0 && (
            <div className="course-agent-empty text-center text-muted px-3 py-5">
              <i className="bi bi-stars fs-2 text-primary" aria-hidden="true" />
              <p className="fw-semibold text-body mt-3 mb-1">What would you like to build?</p>
              <p className="small mb-0">
                Ask the agent to create or improve PrairieLearn course content.
              </p>
            </div>
          )}
          {messages.map((event) =>
            event.type === 'user.message' ? (
              <UserMessage key={event.sequence}>{String(event.data.text ?? '')}</UserMessage>
            ) : (
              <AgentMessage key={event.sequence}>{String(event.data.text ?? '')}</AgentMessage>
            ),
          )}
          {toolEvents.length > 0 && <ToolCallGroup events={toolEvents} busy={busy} />}
          {busy && (
            <div className="d-flex align-items-center gap-2 small text-muted mb-3">
              <Spinner size="sm" /> Course agent is working…
            </div>
          )}
          {(snapshotError || failure) && (
            <Alert variant="danger">
              {snapshotError ?? String(failure?.data.message ?? 'The run failed.')}
            </Alert>
          )}
          {start.error && <Alert variant="danger">{start.error.message}</Alert>}
          {diagnosticsEnabled && (
            <div className="border-top pt-3 mt-3">
              <Form.Check
                type="switch"
                id="course-agent-diagnostics"
                label="Diagnostic mode"
                checked={showDiagnostics}
                onChange={(event) => {
                  const checked = event.currentTarget.checked;
                  setShowDiagnostics(checked);
                  localStorage.setItem(`course-agent-diagnostics:${courseId}`, checked ? '1' : '0');
                }}
              />
              {showDiagnostics && (
                <Diagnostics
                  conversation={conversation}
                  runId={streamRunId}
                  offset={streamOffset}
                  events={events}
                  status={snapshot.data?.status ?? (busy ? 'running' : 'offline')}
                />
              )}
            </div>
          )}
        </div>

        <footer className="course-agent-footer border-top bg-white p-3">
          <Form
            onSubmit={(event) => {
              event.preventDefault();
              start.mutate({ conversationId: conversation?.conversationId, prompt });
            }}
          >
            <Form.Control
              as="textarea"
              rows={3}
              className="course-agent-chat-input shadow-none"
              aria-label="Message course agent"
              placeholder="Ask anything about your course…"
              value={prompt}
              disabled={busy}
              onChange={(event) => setPrompt(event.target.value)}
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

function UserMessage({ children }: { children: ReactNode }) {
  return (
    <div
      className="d-flex flex-column align-items-end mb-4"
      role="article"
      aria-label="Message from you"
    >
      <div className="course-agent-user-message rounded bg-secondary-subtle p-3">{children}</div>
    </div>
  );
}

function AgentMessage({ children }: { children: ReactNode }) {
  return (
    <div
      className="course-agent-agent-message mb-4"
      role="article"
      aria-label="Message from PrairieLearn"
    >
      {children}
    </div>
  );
}

function ToolCallGroup({ events, busy }: { events: CourseAgentEvent[]; busy: boolean }) {
  const [expanded, setExpanded] = useState(true);
  const starts = events.filter((event) => event.type === 'tool.started');
  return (
    <div className="course-agent-tool-group mb-4">
      <button
        type="button"
        className="course-agent-tool-group-toggle btn btn-sm d-flex align-items-center gap-2 border-0 px-0 py-1 text-muted"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        <span className="flex-grow-1 text-start">
          {busy
            ? 'Working'
            : `Made ${starts.length} tool ${starts.length === 1 ? 'call' : 'calls'}`}
        </span>
        <i className={`bi bi-chevron-${expanded ? 'down' : 'up'}`} aria-hidden="true" />
      </button>
      {expanded && (
        <div className="d-flex flex-column gap-1 border-start ms-2 mt-1 ps-3 py-1">
          {starts.map((event) => {
            const completed = events.find(
              (candidate) =>
                candidate.data.operationId === event.data.operationId &&
                ['tool.completed', 'tool.failed'].includes(candidate.type),
            );
            return (
              <div key={event.sequence} className="small text-muted">
                <i
                  className={`bi bi-fw me-1 ${completed ? (completed.type === 'tool.failed' ? 'bi-x-lg text-danger' : 'bi-check-lg text-success') : 'bi-three-dots'}`}
                  aria-hidden="true"
                />
                {String(event.data.tool ?? 'Use tool')}
              </div>
            );
          })}
        </div>
      )}
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
  return (
    <details className="small mt-2" open>
      <summary>Live conversation state</summary>
      <dl className="course-agent-diagnostics mt-2 mb-0">
        <dt>Status</dt>
        <dd>{status}</dd>
        <dt>Conversation</dt>
        <dd>{conversation?.conversationId ?? 'Not started'}</dd>
        <dt>Sandbox</dt>
        <dd>{conversation?.sandboxId ?? 'Not started'}</dd>
        <dt>Run</dt>
        <dd>{runId ?? 'Idle'}</dd>
        <dt>Codex thread</dt>
        <dd>{String(agentStarted?.data.threadId ?? 'Pending')}</dd>
        <dt>Stream cursor</dt>
        <dd>{offset}</dd>
        <dt>Events</dt>
        <dd>{events.length}</dd>
        <dt>Usage</dt>
        <dd>{usage ? JSON.stringify(usage.data) : 'Pending'}</dd>
      </dl>
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
  courseShortName,
  diagnosticsEnabled,
}: {
  trpcCsrfToken: string;
  courseId: string;
  courseShortName: string;
  diagnosticsEnabled: boolean;
}) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    createCourseTrpcClient({ csrfToken: trpcCsrfToken, courseId }),
  );
  return (
    <QueryClientProviderDebug client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <CourseAgentPanelInner
          courseId={courseId}
          courseShortName={courseShortName}
          diagnosticsEnabled={diagnosticsEnabled}
        />
      </TRPCProvider>
    </QueryClientProviderDebug>
  );
}

CourseAgentPanel.displayName = 'CourseAgentPanel';
