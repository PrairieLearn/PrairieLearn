import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type SyntheticEvent, useState } from 'react';
import { Modal } from 'react-bootstrap';

import { formatDate } from '@prairielearn/formatter';

import { AppErrorAlert, getAppError } from '../../../lib/client/errors.js';
import { QueryClientProviderDebug } from '../../../lib/client/tanstackQuery.js';
import type { AgentConversationsError } from '../../../trpc/course/agent-conversations.js';
import { createCourseTrpcClient } from '../../../trpc/course/client.js';
import { TRPCProvider, useTRPC } from '../../../trpc/course/context.js';

const POLL_INTERVAL_MS = 2_000;
const ACTIVE_RUN_STATUSES = new Set(['pending', 'queued', 'running', 'stopping', 'cancelling']);
const RETRYABLE_RUN_STATUSES = new Set(['failed', 'canceled', 'cancelled']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getProperty(value: unknown, property: string): unknown {
  return isRecord(value) ? value[property] : undefined;
}

function getArrayProperty(value: unknown, property: string): unknown[] {
  const result = getProperty(value, property);
  return Array.isArray(result) ? result : [];
}

function getStringProperty(value: unknown, ...properties: string[]): string | null {
  for (const property of properties) {
    const result = getProperty(value, property);
    if (typeof result === 'string' && result.length > 0) return result;
    if (typeof result === 'number' || typeof result === 'bigint') return String(result);
  }
  return null;
}

function getNumberProperty(value: unknown, ...properties: string[]): number | null {
  for (const property of properties) {
    const result = getProperty(value, property);
    if (typeof result === 'number' && Number.isSafeInteger(result)) return result;
    if (typeof result === 'string') {
      const parsed = Number(result);
      if (Number.isSafeInteger(parsed)) return parsed;
    }
  }
  return null;
}

function getConversationId(conversation: unknown): string {
  return getStringProperty(conversation, 'id') ?? '';
}

function getConversationTitle(conversation: unknown): string {
  const id = getConversationId(conversation);
  return getStringProperty(conversation, 'title') ?? `Conversation ${id}`;
}

function getLatestRun(detail: unknown): unknown {
  const explicitlyLatest =
    getProperty(detail, 'latestRun') ??
    getProperty(detail, 'latest_run') ??
    getProperty(detail, 'currentRun') ??
    getProperty(detail, 'current_run');
  if (explicitlyLatest) return explicitlyLatest;
  return getArrayProperty(detail, 'runs').at(-1);
}

function getRunStatus(run: unknown): string | null {
  return getStringProperty(run, 'status')?.toLowerCase() ?? null;
}

function isRunActive(run: unknown): boolean {
  const status = getRunStatus(run);
  return status !== null && ACTIVE_RUN_STATUSES.has(status);
}

function isRunRetryable(run: unknown): boolean {
  const status = getRunStatus(run);
  return status !== null && RETRYABLE_RUN_STATUSES.has(status);
}

export function getAgentConversationUiState(run: unknown, events: unknown[]) {
  const status = getRunStatus(run);
  const hasCheckpoint =
    [
      'head_sha',
      'headSha',
      'checkpoint_sha',
      'checkpointSha',
      'checkpoint_key',
      'checkpointKey',
    ].some((property) => getStringProperty(run, property) !== null) ||
    events.some((event) => getEventType(event) === 'checkpoint');

  return {
    canPublish: status === 'completed' && hasCheckpoint,
    runActive: isRunActive(run),
    runRetryable: isRunRetryable(run),
    status,
  };
}

export function shouldPollAgentEventPage(page: unknown, run: unknown): boolean {
  if (getProperty(page, 'hasMore') === true) return false;
  if (isRunActive(run)) return true;

  const status = getRunStatus(run);
  const expectedTerminalEvent =
    status === 'completed'
      ? 'run_completed'
      : status === 'failed'
        ? 'run_failed'
        : status === 'canceled' || status === 'cancelled'
          ? 'run_cancelled'
          : null;
  if (expectedTerminalEvent === null) return false;

  const lastEvent = getArrayProperty(page, 'events').at(-1);
  return getEventType(lastEvent) !== expectedTerminalEvent;
}

function formatUnknownDate(value: unknown, timezone: string): string | null {
  if (value instanceof Date) return formatDate(value, timezone);
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : formatDate(date, timezone);
}

function formatJson(value: unknown): string {
  return JSON.stringify(
    value,
    (_key, item: unknown) => (typeof item === 'bigint' ? item.toString() : item),
    2,
  );
}

function safeUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return value.startsWith('/') || value.startsWith('https://') || value.startsWith('http://')
    ? value
    : null;
}

function getLink(value: unknown): string | null {
  for (const property of ['url', 'href', 'download_url', 'downloadUrl']) {
    const url = safeUrl(getProperty(value, property));
    if (url) return url;
  }
  return null;
}

function getEventData(event: unknown): unknown {
  return getProperty(event, 'data') ?? getProperty(event, 'payload');
}

function getEventType(event: unknown): string {
  return getStringProperty(event, 'type') ?? 'event';
}

function getEventMessage(event: unknown): string | null {
  const data = getEventData(event);
  return getStringProperty(data, 'message', 'text', 'content', 'delta');
}

export function getQuestionPreview(event: unknown): {
  html: string;
  variantSeed: string | null;
} | null {
  if (getEventType(event) !== 'tool_result') return null;
  const data = getEventData(event);
  if (getStringProperty(data, 'tool_name') !== 'render_question') return null;
  const result = getProperty(data, 'result');
  if (getProperty(result, 'rendered') !== true) return null;
  const preview = getProperty(result, 'preview');
  const html = getStringProperty(preview, 'html');
  if (html === null) return null;
  const extraHeadersHtml = getStringProperty(preview, 'extra_headers_html') ?? '';
  return {
    html: `<!doctype html><html><head><meta charset="utf-8">${extraHeadersHtml}</head><body>${html}</body></html>`,
    variantSeed: getStringProperty(result, 'variant_seed'),
  };
}

function eventLabel(type: string): string {
  return type.replaceAll('_', ' ').replace(/^./, (character) => character.toUpperCase());
}

function statusBadgeClass(status: string | null): string {
  switch (status) {
    case 'completed':
      return 'text-bg-success';
    case 'failed':
      return 'text-bg-danger';
    case 'canceled':
    case 'cancelled':
      return 'text-bg-secondary';
    case 'pending':
    case 'queued':
    case 'stopping':
    case 'cancelling':
      return 'text-bg-warning';
    case 'running':
      return 'text-bg-primary';
    default:
      return 'text-bg-light';
  }
}

function TimelineEvent({ event, timezone }: { event: unknown; timezone: string }) {
  const type = getEventType(event);
  const data = getEventData(event);
  const message = getEventMessage(event);
  const link = getLink(data) ?? getLink(event);
  const createdAt = formatUnknownDate(
    getProperty(event, 'created_at') ?? getProperty(event, 'createdAt'),
    timezone,
  );
  const isMessage = type === 'user_message' || type.startsWith('assistant_message');
  const questionPreview = getQuestionPreview(event);

  return (
    <li className="list-group-item px-0 py-3 border-start-0 border-end-0">
      <div className="d-flex align-items-start gap-2">
        <span className={`badge ${isMessage ? 'text-bg-light' : 'text-bg-secondary'}`}>
          {eventLabel(type)}
        </span>
        {createdAt && <small className="text-muted ms-auto">{createdAt}</small>}
      </div>
      {message && (
        <div className="mt-2 text-break" style={{ whiteSpace: 'pre-wrap' }}>
          {message}
        </div>
      )}
      {link && (
        <div className="mt-2">
          <a href={link}>Open related item</a>
        </div>
      )}
      {questionPreview && (
        <section className="mt-3" aria-label="Rendered question preview">
          <div className="d-flex align-items-center mb-2">
            <strong>Question preview</strong>
            {questionPreview.variantSeed && (
              <small className="text-muted ms-auto">
                Variant seed: <code>{questionPreview.variantSeed}</code>
              </small>
            )}
          </div>
          <iframe
            className="border rounded w-100 bg-white"
            sandbox="allow-forms allow-scripts"
            srcDoc={questionPreview.html}
            style={{ minHeight: '24rem' }}
            title="Rendered PrairieLearn question"
          />
        </section>
      )}
      {!isMessage && data !== undefined && (
        <details className="mt-2">
          <summary>Details</summary>
          <pre className="bg-light border rounded p-2 mt-2 mb-0 text-wrap">{formatJson(data)}</pre>
        </details>
      )}
    </li>
  );
}

function TimelineContinuation({
  afterSequence,
  conversationId,
  latestRun,
  timezone,
}: {
  afterSequence: number;
  conversationId: string;
  latestRun: unknown;
  timezone: string;
}) {
  const trpc = useTRPC();
  const eventsQuery = useQuery({
    ...trpc.agentConversations.listEvents.queryOptions({ conversationId, afterSequence }),
    refetchInterval: (query) =>
      shouldPollAgentEventPage(query.state.data, latestRun) ? POLL_INTERVAL_MS : false,
  });
  const events = getArrayProperty(eventsQuery.data, 'events');
  const hasMore = getProperty(eventsQuery.data, 'hasMore') === true;
  const nextSequence = getNumberProperty(eventsQuery.data, 'nextSequence');
  const error = getAppError<AgentConversationsError['ListEvents']>(eventsQuery.error);

  return (
    <>
      {error && (
        <li>
          <AppErrorAlert error={error} render={{ UNKNOWN: ({ message }) => message }} />
        </li>
      )}
      {events.map((event) => (
        <TimelineEvent
          key={
            getStringProperty(event, 'id', 'sequence') ??
            `${getEventType(event)}-${formatJson(event)}`
          }
          event={event}
          timezone={timezone}
        />
      ))}
      {hasMore && nextSequence !== null && nextSequence > afterSequence && (
        <TimelineContinuation
          afterSequence={nextSequence}
          conversationId={conversationId}
          latestRun={latestRun}
          timezone={timezone}
        />
      )}
    </>
  );
}

function ConversationList({
  conversations,
  selectedConversationId,
  onSelect,
  onCreate,
  creating,
  displayTimezone,
}: {
  conversations: unknown[];
  selectedConversationId: string | null;
  onSelect: (conversationId: string) => void;
  onCreate: () => void;
  creating: boolean;
  displayTimezone: string;
}) {
  return (
    <div className="card h-100">
      <div className="card-header d-flex align-items-center gap-2">
        <h2 className="h5 mb-0">Conversations</h2>
        <button
          type="button"
          className="btn btn-sm btn-primary ms-auto"
          disabled={creating}
          onClick={onCreate}
        >
          {creating ? (
            <span className="spinner-border spinner-border-sm me-1" aria-hidden="true" />
          ) : (
            <i className="bi bi-plus-lg me-1" aria-hidden="true" />
          )}
          New
        </button>
      </div>
      <div className="list-group list-group-flush overflow-auto">
        {conversations.length === 0 ? (
          <div className="p-3 text-muted">Start a conversation to work on this course.</div>
        ) : (
          conversations.map((conversation) => {
            const conversationId = getConversationId(conversation);
            const updatedAt = formatUnknownDate(
              getProperty(conversation, 'updated_at') ?? getProperty(conversation, 'updatedAt'),
              displayTimezone,
            );
            return (
              <button
                key={conversationId}
                type="button"
                className={`list-group-item list-group-item-action ${
                  conversationId === selectedConversationId ? 'active' : ''
                }`}
                aria-current={conversationId === selectedConversationId ? 'page' : undefined}
                onClick={() => onSelect(conversationId)}
              >
                <span className="d-block text-truncate">{getConversationTitle(conversation)}</span>
                {updatedAt && <small className="d-block opacity-75 mt-1">{updatedAt}</small>}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function ConversationWorkspace({
  conversationId,
  displayTimezone,
  onDeleted,
}: {
  conversationId: string;
  displayTimezone: string;
  onDeleted: () => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const detailQuery = useQuery({
    ...trpc.agentConversations.get.queryOptions({ conversationId }),
    refetchInterval: (query) =>
      isRunActive(getLatestRun(query.state.data)) ? POLL_INTERVAL_MS : false,
  });
  const latestRun = getLatestRun(detailQuery.data);
  const eventsQuery = useQuery({
    ...trpc.agentConversations.listEvents.queryOptions({ conversationId }),
    refetchInterval: (query) =>
      shouldPollAgentEventPage(query.state.data, latestRun) ? POLL_INTERVAL_MS : false,
  });
  const events = getArrayProperty(eventsQuery.data, 'events');
  const hasMoreEvents = getProperty(eventsQuery.data, 'hasMore') === true;
  const nextSequence = getNumberProperty(eventsQuery.data, 'nextSequence');
  const checkpoint = getProperty(detailQuery.data, 'checkpoint');
  const { canPublish, runActive, runRetryable, status } = getAgentConversationUiState(
    latestRun,
    checkpoint ? [...events, checkpoint] : events,
  );

  async function refreshConversation() {
    await Promise.all([
      queryClient.invalidateQueries(trpc.agentConversations.list.queryFilter()),
      queryClient.invalidateQueries(trpc.agentConversations.get.queryFilter({ conversationId })),
      queryClient.invalidateQueries(
        trpc.agentConversations.listEvents.queryFilter({ conversationId }),
      ),
    ]);
  }

  const startTurnMutation = useMutation(
    trpc.agentConversations.startTurn.mutationOptions({
      onSuccess: async () => {
        setMessage('');
        await refreshConversation();
      },
    }),
  );
  const stopMutation = useMutation(
    trpc.agentConversations.stop.mutationOptions({ onSuccess: refreshConversation }),
  );
  const deleteMutation = useMutation(
    trpc.agentConversations.delete.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.agentConversations.list.queryFilter());
        onDeleted();
      },
    }),
  );
  const publishMutation = useMutation(
    trpc.agentConversations.publish.mutationOptions({ onSuccess: refreshConversation }),
  );

  const mutationError =
    getAppError<AgentConversationsError['StartTurn']>(startTurnMutation.error) ??
    getAppError<AgentConversationsError['Stop']>(stopMutation.error) ??
    getAppError<AgentConversationsError['Delete']>(deleteMutation.error) ??
    getAppError<AgentConversationsError['Publish']>(publishMutation.error);
  const queryError =
    getAppError<AgentConversationsError['Get']>(detailQuery.error) ??
    getAppError<AgentConversationsError['ListEvents']>(eventsQuery.error);
  const retryMessage = getStringProperty(latestRun, 'message', 'prompt');
  const artifacts = getArrayProperty(detailQuery.data, 'artifacts');

  function submitMessage(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedMessage = message.trim();
    if (!trimmedMessage || runActive) return;
    startTurnMutation.mutate({ conversationId, message: trimmedMessage });
  }

  return (
    <div className="card h-100">
      <div className="card-header d-flex flex-wrap align-items-center gap-2">
        <h2 className="h5 mb-0">Conversation</h2>
        {status && <span className={`badge ${statusBadgeClass(status)}`}>{status}</span>}
        <div className="d-flex gap-2 ms-auto">
          {runActive && (
            <button
              type="button"
              className="btn btn-sm btn-outline-danger"
              disabled={stopMutation.isPending}
              onClick={() => stopMutation.mutate({ conversationId })}
            >
              <i className="bi bi-stop-circle me-1" aria-hidden="true" />
              Stop
            </button>
          )}
          {canPublish && (
            <button
              type="button"
              className="btn btn-sm btn-outline-primary"
              disabled={publishMutation.isPending}
              onClick={() => publishMutation.mutate({ conversationId })}
            >
              {publishMutation.isPending ? (
                <span className="spinner-border spinner-border-sm me-1" aria-hidden="true" />
              ) : (
                <i className="bi bi-git me-1" aria-hidden="true" />
              )}
              Create draft pull request
            </button>
          )}
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            disabled={deleteMutation.isPending}
            onClick={() => setShowDeleteModal(true)}
          >
            <i className="bi bi-trash me-1" aria-hidden="true" />
            Delete
          </button>
        </div>
      </div>

      <AppErrorAlert
        className="m-3 mb-0"
        error={mutationError ?? queryError}
        render={{ UNKNOWN: ({ message: errorMessage }) => errorMessage }}
        onDismiss={() => {
          startTurnMutation.reset();
          stopMutation.reset();
          deleteMutation.reset();
          publishMutation.reset();
        }}
      />

      <div className="card-body overflow-auto" aria-live="polite" aria-busy={runActive}>
        {events.length === 0 ? (
          <div className="text-center text-muted py-5">
            <i className="bi bi-stars fs-2 d-block mb-2" aria-hidden="true" />
            Describe what you want to change, investigate, or create in this course.
          </div>
        ) : (
          <ol className="list-group list-group-flush list-unstyled mb-0">
            {events.map((event) => (
              <TimelineEvent
                key={
                  getStringProperty(event, 'id', 'sequence') ??
                  `${getEventType(event)}-${formatJson(event)}`
                }
                event={event}
                timezone={displayTimezone}
              />
            ))}
            {hasMoreEvents && nextSequence !== null && (
              <TimelineContinuation
                afterSequence={nextSequence}
                conversationId={conversationId}
                latestRun={latestRun}
                timezone={displayTimezone}
              />
            )}
          </ol>
        )}

        {artifacts.length > 0 && (
          <section className="border-top pt-3 mt-3" aria-labelledby="agent-artifacts-heading">
            <h3 id="agent-artifacts-heading" className="h6">
              Artifacts
            </h3>
            <ul className="mb-0">
              {artifacts.map((artifact) => {
                const link = getLink(artifact) ?? getLink(getProperty(artifact, 'metadata'));
                const label = getStringProperty(artifact, 'title', 'name', 'kind') ?? 'Artifact';
                return (
                  <li
                    key={
                      getStringProperty(artifact, 'id', 'sha256', 'storage_key', 'storageKey') ??
                      formatJson(artifact)
                    }
                  >
                    {link ? <a href={link}>{label}</a> : label}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>

      <div className="card-footer">
        {runRetryable && retryMessage && (
          <div className="d-flex align-items-center gap-2 mb-2">
            <span className="text-muted small">The last turn did not complete.</span>
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              disabled={startTurnMutation.isPending}
              onClick={() => startTurnMutation.mutate({ conversationId, message: retryMessage })}
            >
              <i className="bi bi-arrow-clockwise me-1" aria-hidden="true" />
              Retry
            </button>
          </div>
        )}
        <form onSubmit={submitMessage}>
          <label htmlFor="agent-message" className="visually-hidden">
            Message
          </label>
          <textarea
            id="agent-message"
            className="form-control"
            rows={3}
            value={message}
            placeholder={runActive ? 'The agent is working…' : 'Message the course agent'}
            disabled={runActive || startTurnMutation.isPending}
            onChange={(event) => setMessage(event.target.value)}
          />
          <div className="d-flex align-items-center mt-2">
            <small className="text-muted">Runs continue if you leave this page.</small>
            <button
              type="submit"
              className="btn btn-primary ms-auto"
              disabled={runActive || startTurnMutation.isPending || message.trim().length === 0}
            >
              {startTurnMutation.isPending && (
                <span className="spinner-border spinner-border-sm me-1" aria-hidden="true" />
              )}
              {status === 'completed' ? 'Resume' : 'Send message'}
            </button>
          </div>
        </form>
      </div>

      <Modal
        show={showDeleteModal}
        aria-labelledby="agent-conversation-delete-modal-title"
        onHide={() => setShowDeleteModal(false)}
      >
        <Modal.Header closeButton>
          <Modal.Title id="agent-conversation-delete-modal-title">Delete conversation?</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          This deletes the conversation history and its saved artifacts. This action cannot be
          undone.
        </Modal.Body>
        <Modal.Footer>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={deleteMutation.isPending}
            onClick={() => setShowDeleteModal(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-danger"
            disabled={deleteMutation.isPending}
            onClick={() => deleteMutation.mutate({ conversationId })}
          >
            {deleteMutation.isPending && (
              <span className="spinner-border spinner-border-sm me-1" aria-hidden="true" />
            )}
            Delete conversation
          </button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}

function AgentConversationsInner({ displayTimezone }: { displayTimezone: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const listQuery = useQuery(trpc.agentConversations.list.queryOptions());
  const conversations = getArrayProperty(listQuery.data, 'conversations');
  const createMutation = useMutation(
    trpc.agentConversations.create.mutationOptions({
      onSuccess: async (data) => {
        const conversationId = getConversationId(getProperty(data, 'conversation'));
        await queryClient.invalidateQueries(trpc.agentConversations.list.queryFilter());
        setSelectedConversationId(conversationId);
      },
    }),
  );

  const activeConversationId =
    selectedConversationId ??
    (conversations.length > 0 ? getConversationId(conversations[0]) : null);

  const listError =
    getAppError<AgentConversationsError['List']>(listQuery.error) ??
    getAppError<AgentConversationsError['Create']>(createMutation.error);

  return (
    <>
      <h1 className="visually-hidden">Course agent</h1>
      <AppErrorAlert
        error={listError}
        render={{ UNKNOWN: ({ message }) => message }}
        onDismiss={() => createMutation.reset()}
      />
      <div className="row g-3 h-100">
        <div className="col-12 col-lg-3" style={{ minHeight: 0 }}>
          <ConversationList
            conversations={conversations}
            selectedConversationId={activeConversationId}
            creating={createMutation.isPending}
            displayTimezone={displayTimezone}
            onCreate={() => createMutation.mutate({})}
            onSelect={(conversationId) => setSelectedConversationId(conversationId)}
          />
        </div>
        <div className="col-12 col-lg-9" style={{ minHeight: 0 }}>
          {activeConversationId ? (
            <ConversationWorkspace
              key={activeConversationId}
              conversationId={activeConversationId}
              displayTimezone={displayTimezone}
              onDeleted={() => setSelectedConversationId(null)}
            />
          ) : (
            <div className="card h-100">
              <div className="card-body d-flex align-items-center justify-content-center text-muted text-center">
                Create a conversation to begin working with the course agent.
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export function AgentConversationsPage({
  courseId,
  displayTimezone,
  isDevMode,
  trpcCsrfToken,
}: {
  courseId: string;
  displayTimezone: string;
  isDevMode: boolean;
  trpcCsrfToken: string;
}) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    createCourseTrpcClient({ csrfToken: trpcCsrfToken, courseId }),
  );

  return (
    <QueryClientProviderDebug client={queryClient} isDevMode={isDevMode}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <AgentConversationsInner displayTimezone={displayTimezone} />
      </TRPCProvider>
    </QueryClientProviderDebug>
  );
}

AgentConversationsPage.displayName = 'AgentConversationsPage';
