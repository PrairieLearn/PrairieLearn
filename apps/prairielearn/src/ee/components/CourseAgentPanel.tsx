import { QueryClient, useMutation, useQuery } from '@tanstack/react-query';
import { type ReactNode, useEffect, useState } from 'react';
import { Alert, Dropdown, Form, Spinner } from 'react-bootstrap';

import type { CourseAgentEvent } from '@prairielearn/course-agent-protocol';
import { QueryClientProviderDebug } from '@prairielearn/trpc/react';
import { OverlayTrigger } from '@prairielearn/ui';

import { formatMilliDollars } from '../../lib/ai-grading-credits.js';
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
  const [startingNewConversation, setStartingNewConversation] = useState(false);
  const [conversation, setConversation] = useState<{
    conversationId: string;
    sandboxId: string;
  } | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(
    () =>
      diagnosticsEnabled && localStorage.getItem(`course-agent-diagnostics:${courseId}`) === '1',
  );
  const conversations = useQuery(trpc.courseAgent.list.queryOptions());
  const latestConversation = conversations.data?.conversations[0];
  const selectedConversation = startingNewConversation
    ? null
    : (conversation ??
      (latestConversation
        ? { conversationId: latestConversation.id, sandboxId: latestConversation.sandbox_id }
        : null));
  const snapshot = useQuery(
    trpc.courseAgent.get.queryOptions(
      selectedConversation ?? {
        conversationId: '00000000-0000-0000-0000-000000000000',
        sandboxId: '',
      },
      { enabled: selectedConversation !== null && streamRunId === null },
    ),
  );
  const refetchSnapshot = snapshot.refetch;
  const activeStreamRunId = streamRunId ?? snapshot.data?.activeRunId ?? null;
  const start = useMutation(
    trpc.courseAgent.start.mutationOptions({
      onSuccess: (result) => {
        setConversation(result);
        setStartingNewConversation(false);
        setPrompt('');
        setStreamOffset(0);
        setStreamRunId(result.runId);
        void conversations.refetch();
      },
    }),
  );

  // Keep the transcript attached to the resumable SSE relay while a run is active.
  useEffect(() => {
    if (!activeStreamRunId) return;
    const abortController = new AbortController();
    let offset = 0;

    void (async () => {
      try {
        const response = await fetch(
          `/pl/course/${courseId}/course_agent/stream?runId=${activeStreamRunId}&offset=${offset}`,
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
              if (event.type === 'git.push.approval.requested') void refetchSnapshot();
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
  }, [activeStreamRunId, courseId, refetchSnapshot]);

  const displayedEvents = events.length > 0 ? events : (snapshot.data?.events ?? []);
  const busy = start.isPending || activeStreamRunId !== null;
  const toolEvents = displayedEvents.filter((event) => event.type.startsWith('tool.'));
  const messages = displayedEvents.filter(
    (event) => event.type === 'user.message' || event.type === 'assistant.delta',
  );
  const approval = useMutation(
    trpc.courseAgent.respondToPushApproval.mutationOptions({
      onSuccess: () => void snapshot.refetch(),
    }),
  );
  const failure = findLastEvent(displayedEvents, 'run.failed');

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
            {conversations.data?.conversations.length ? (
              <div className="d-flex align-items-center gap-1 min-width-0 ms-auto">
                <OverlayTrigger
                  placement="bottom"
                  tooltip={{
                    body: 'New conversation',
                    props: { id: 'course-agent-new-conversation-tooltip' },
                  }}
                >
                  <button
                    type="button"
                    className="btn btn-sm btn-light"
                    aria-label="New course-agent conversation"
                    onClick={() => {
                      setEvents([]);
                      setConversation(null);
                      setStartingNewConversation(true);
                    }}
                  >
                    <i className="bi bi-plus-lg" aria-hidden="true" />
                  </button>
                </OverlayTrigger>
                <Dropdown className="min-width-0">
                  <Dropdown.Toggle
                    size="sm"
                    variant="light"
                    className="course-agent-conversation-picker border bg-white text-truncate"
                  >
                    {startingNewConversation
                      ? 'New conversation'
                      : selectedConversation
                        ? (conversations.data.conversations.find(
                            (item) => item.id === selectedConversation.conversationId,
                          )?.title ?? courseShortName)
                        : courseShortName}
                  </Dropdown.Toggle>
                  <Dropdown.Menu align="end">
                    {conversations.data.conversations.map((item) => (
                      <Dropdown.Item
                        key={item.id}
                        active={item.id === selectedConversation?.conversationId}
                        onClick={() => {
                          setEvents([]);
                          setConversation({ conversationId: item.id, sandboxId: item.sandbox_id });
                          setStartingNewConversation(false);
                        }}
                      >
                        {item.title}
                      </Dropdown.Item>
                    ))}
                  </Dropdown.Menu>
                </Dropdown>
              </div>
            ) : (
              <span className="text-muted small text-truncate ms-auto">{courseShortName}</span>
            )}
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
          {(snapshot.data?.error || failure) && (
            <Alert variant="danger">
              {snapshot.data?.error ?? String(failure?.data.message ?? 'The run failed.')}
            </Alert>
          )}
          {snapshot.data && (
            <div className="small text-muted border rounded bg-white p-2 mb-3">
              Active run: {snapshot.data.usage.normalizedTotalTokens.toLocaleString()} tokens ·{' '}
              {formatMilliDollars(snapshot.data.usage.estimatedCostMilliDollars)} estimated
              <br />
              Conversation:{' '}
              {snapshot.data.conversationUsage.normalized_total_tokens.toLocaleString()} tokens ·{' '}
              {formatMilliDollars(snapshot.data.conversationUsage.estimated_cost_milli_dollars)}{' '}
              estimated
            </div>
          )}
          {start.error && <Alert variant="danger">{start.error.message}</Alert>}
          {approval.error && <Alert variant="danger">{approval.error.message}</Alert>}
          {snapshot.data?.pendingApproval && (
            <div className="course-agent-approval border rounded bg-white overflow-hidden mb-4">
              <div className="border-bottom px-3 py-2">
                <div className="d-flex align-items-center gap-2 fw-semibold">
                  <i className="bi bi-shield-check text-warning" aria-hidden="true" /> Approval
                  required
                </div>
                <p className="small mb-0 mt-1">{snapshot.data.pendingApproval.diffSummary}</p>
              </div>
              <details>
                <summary className="small px-3 py-2">View full diff</summary>
                <pre className="course-agent-diff-body small overflow-auto border-top p-3 mb-0">
                  {snapshot.data.pendingApproval.diff}
                </pre>
              </details>
              <div className="d-flex justify-content-end gap-2 border-top px-2 py-2">
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  disabled={approval.isPending}
                  onClick={() =>
                    approval.mutate({
                      approvalId: snapshot.data.pendingApproval!.id,
                      decision: 'approve',
                    })
                  }
                >
                  Approve, push, and sync
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-danger"
                  disabled={approval.isPending}
                  onClick={() =>
                    approval.mutate({
                      approvalId: snapshot.data.pendingApproval!.id,
                      decision: 'deny',
                    })
                  }
                >
                  Deny
                </button>
              </div>
            </div>
          )}
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
                  conversation={selectedConversation}
                  runId={activeStreamRunId}
                  offset={streamOffset}
                  events={displayedEvents}
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
              start.mutate({ conversationId: selectedConversation?.conversationId, prompt });
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
  const docs = findLastEvent(events, 'docs.mounted') ?? findLastEvent(events, 'docs.unavailable');
  const validation =
    findLastEvent(events, 'validation.completed') ?? findLastEvent(events, 'validation.failed');
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
        <dt>Documentation</dt>
        <dd>{docs?.type ?? 'Pending'}</dd>
        <dt>Validation</dt>
        <dd>{validation?.type ?? 'Pending'}</dd>
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
