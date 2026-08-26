import { useChat } from '@ai-sdk/react';
import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ChatTransport, UIMessage, UIMessageChunk } from 'ai';
import clsx from 'clsx';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Badge, Button, Offcanvas, Spinner } from 'react-bootstrap';

import { getAppError } from '@prairielearn/trpc/client';
import { QueryClientProviderDebug } from '@prairielearn/trpc/react';

import { createCourseTrpcClient } from '../../trpc/course/client.js';
import { TRPCProvider, useTRPC } from '../../trpc/course/context.js';
import type { CourseAgentError } from '../../trpc/course/course-agent.js';
import { MemoizedMarkdown } from '../pages/instructorAiGenerateDraftEditor/components/MemoizedMarkdown.js';
import { PromptInput } from '../pages/instructorAiGenerateDraftEditor/components/PromptInput.js';

function textFromParts(parts: unknown) {
  if (!Array.isArray(parts)) return '';
  return parts
    .filter(
      (part): part is { type: 'text'; text: string } =>
        typeof part === 'object' &&
        part !== null &&
        'type' in part &&
        part.type === 'text' &&
        'text' in part &&
        typeof part.text === 'string',
    )
    .map((part) => part.text)
    .join('\n');
}

function formatStatus(status: string) {
  return status.replaceAll('_', ' ');
}

function statusVariant(status: string) {
  if (status === 'ready' || status === 'completed') return 'success';
  if (status === 'error' || status === 'failed') return 'danger';
  if (status === 'offline' || status === 'unallocated') return 'secondary';
  return 'primary';
}

const noopSubscribe = () => () => {};

function toUIMessages(
  messages: {
    id: string;
    role: 'user' | 'assistant';
    parts: unknown;
  }[],
): UIMessage[] {
  return messages.map((message) => ({
    id: message.id,
    role: message.role,
    parts: [{ type: 'text', text: textFromParts(message.parts) }],
  }));
}

function waitForPoll(signal: AbortSignal | undefined) {
  return new Promise<void>((resolve) => {
    const timeout = window.setTimeout(resolve, 500);
    signal?.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
  });
}

function createCourseAgentChatTransport({
  submit,
  getAssistantMessage,
}: {
  submit: (prompt: string) => Promise<{ assistantMessageId: string }>;
  getAssistantMessage: (messageId: string) => Promise<{ status: string; text: string } | null>;
}): ChatTransport<UIMessage> {
  return {
    async sendMessages({ messages, abortSignal, trigger }) {
      if (trigger !== 'submit-message') throw new Error('Regeneration is not supported yet');
      const prompt = textFromParts(messages.at(-1)?.parts);
      if (!prompt) throw new Error('Course-agent instructions cannot be empty');
      const { assistantMessageId } = await submit(prompt);
      const textPartId = `response-${assistantMessageId}`;

      return new ReadableStream<UIMessageChunk>({
        async start(controller) {
          try {
            controller.enqueue({ type: 'start', messageId: assistantMessageId });
            controller.enqueue({ type: 'text-start', id: textPartId });
            while (!abortSignal?.aborted) {
              const message = await getAssistantMessage(assistantMessageId);
              if (message?.status === 'completed') {
                if (message.text) {
                  controller.enqueue({ type: 'text-delta', id: textPartId, delta: message.text });
                }
                controller.enqueue({ type: 'text-end', id: textPartId });
                controller.enqueue({ type: 'finish', finishReason: 'stop' });
                controller.close();
                return;
              }
              if (message?.status === 'errored' || message?.status === 'canceled') {
                controller.enqueue({
                  type: 'error',
                  errorText: message.text || 'The course-agent run failed.',
                });
                controller.close();
                return;
              }
              await waitForPoll(abortSignal);
            }
            controller.enqueue({
              type: 'abort',
              reason: 'The browser stopped waiting for this run.',
            });
            controller.close();
          } catch (error) {
            controller.error(error);
          }
        },
      });
    },
    async reconnectToStream() {
      return null;
    },
  };
}

function CourseAgentChat({
  conversationId,
  persistedMessages,
  active,
  submit,
  getAssistantMessage,
}: {
  conversationId: string;
  persistedMessages: {
    id: string;
    role: 'user' | 'assistant';
    parts: unknown;
  }[];
  active: boolean;
  submit: (prompt: string) => Promise<{ assistantMessageId: string }>;
  getAssistantMessage: (messageId: string) => Promise<{ status: string; text: string } | null>;
}) {
  const [prompt, setPrompt] = useState('');
  const [transport] = useState(() =>
    createCourseAgentChatTransport({ submit, getAssistantMessage }),
  );
  const { messages, sendMessage, setMessages, status, error, stop } = useChat({
    id: conversationId,
    messages: toUIMessages(persistedMessages),
    transport,
    throttle: 100,
  });
  const isGenerating = status === 'submitted' || status === 'streaming';

  useEffect(() => {
    if (!isGenerating) setMessages(toUIMessages(persistedMessages));
  }, [isGenerating, persistedMessages, setMessages]);

  return (
    <>
      <section className="flex-grow-1 overflow-auto px-3" aria-label="Course agent messages">
        {messages.length === 0 ? (
          <div className="text-center text-muted py-5">
            Ask the agent to edit this course. A sandbox is created only when you send the first
            message.
          </div>
        ) : (
          <div className="d-flex flex-column gap-3 pb-3">
            {messages.map((message) => {
              const text = textFromParts(message.parts);
              return (
                <div
                  key={message.id}
                  className={clsx(
                    'rounded-3 p-3',
                    message.role === 'user' ? 'bg-primary-subtle ms-5' : 'bg-light me-4',
                  )}
                >
                  <div className="small fw-semibold mb-1">
                    {message.role === 'user' ? 'You' : 'Course agent'}
                  </div>
                  {text ? (
                    <MemoizedMarkdown content={text} />
                  ) : isGenerating && message.role === 'assistant' ? (
                    <span className="text-muted">
                      <Spinner size="sm" className="me-2" /> Working…
                    </span>
                  ) : (
                    <span className="text-muted">No response</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="border-top p-3 pt-2">
        <PromptInput
          value={prompt}
          disabled={active || isGenerating}
          isGenerating={isGenerating}
          refreshQuestionPreviewAfterChanges={false}
          showRefreshQuestionPreviewOption={false}
          placeholder="Ask the agent to edit this course…"
          ariaLabel="Course agent instructions"
          inputId="course-agent-prompt"
          disclaimer="The agent commits, pushes, and syncs successful edits automatically."
          onChange={setPrompt}
          onSubmit={(text) => {
            setPrompt('');
            void sendMessage({ text });
          }}
          onStop={() => void stop()}
        />
        {error && <div className="alert alert-danger mt-2 mb-0">{error.message}</div>}
      </div>
    </>
  );
}

function CourseAgentPanelInner({
  courseShortName,
  testControlsEnabled,
}: {
  courseShortName: string;
  testControlsEnabled: boolean;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [show, setShow] = useState(false);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);

  const conversationsQuery = useQuery({
    ...trpc.courseAgent.list.queryOptions(),
    refetchInterval: show ? 2000 : false,
  });

  const conversationId = conversationsQuery.data?.some(
    (conversation) => conversation.id === selectedConversationId,
  )
    ? selectedConversationId
    : (conversationsQuery.data?.[0]?.id ?? null);

  const stateQuery = useQuery({
    ...trpc.courseAgent.get.queryOptions(
      { conversationId: conversationId ?? '', afterSequence: '0' },
      { enabled: conversationId !== null },
    ),
    refetchInterval: show && conversationId ? 1000 : false,
  });

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries(trpc.courseAgent.list.queryFilter()),
      queryClient.invalidateQueries(trpc.courseAgent.get.queryFilter()),
    ]);
  }

  const createMutation = useMutation({
    ...trpc.courseAgent.create.mutationOptions(),
    onSuccess: async (conversation) => {
      setSelectedConversationId(conversation.id);
      await refresh();
    },
  });
  const submitMutation = useMutation({
    ...trpc.courseAgent.submit.mutationOptions(),
    onSuccess: refresh,
  });
  const destroyMutation = useMutation({
    ...trpc.courseAgent.destroy.mutationOptions(),
    onSuccess: refresh,
  });
  const killMutation = useMutation({
    ...trpc.courseAgent.killSandbox.mutationOptions(),
    onSuccess: refresh,
  });

  const state = stateQuery.data;
  const activeRun = state?.activeRun;
  const browserConnection = stateQuery.isError
    ? 'disconnected'
    : stateQuery.isLoading
      ? 'reconnecting'
      : 'live';
  const appError =
    getAppError<CourseAgentError['Create']>(createMutation.error) ??
    getAppError<CourseAgentError['Submit']>(submitMutation.error) ??
    getAppError<CourseAgentError['Destroy']>(destroyMutation.error) ??
    getAppError<CourseAgentError['KillSandbox']>(killMutation.error) ??
    getAppError<CourseAgentError['Get']>(stateQuery.error) ??
    getAppError<CourseAgentError['List']>(conversationsQuery.error);

  return (
    <>
      <Button
        className="position-fixed bottom-0 end-0 m-3 rounded-pill shadow"
        style={{ zIndex: 1035 }}
        aria-label="Open course agent"
        onClick={() => setShow(true)}
      >
        <i className="bi bi-stars me-2" />
        Course agent
      </Button>

      <Offcanvas
        show={show}
        placement="end"
        style={{ width: 'min(560px, 100vw)' }}
        aria-label="Course agent panel"
        scroll
        onHide={() => setShow(false)}
      >
        <Offcanvas.Header className="border-bottom" closeButton>
          <div className="flex-grow-1 me-3">
            <Offcanvas.Title>Course agent</Offcanvas.Title>
            <div className="small text-muted">{courseShortName}</div>
          </div>
          <Button
            size="sm"
            variant="outline-primary"
            disabled={createMutation.isPending}
            onClick={() => createMutation.mutate({})}
          >
            <i className="bi bi-plus-lg me-1" /> New chat
          </Button>
        </Offcanvas.Header>

        <Offcanvas.Body className="d-flex flex-column gap-3 p-0 overflow-hidden">
          <div className="border-bottom p-3 pb-2">
            <label className="form-label small fw-semibold" htmlFor="course-agent-conversation">
              Chat
            </label>
            <select
              id="course-agent-conversation"
              className="form-select form-select-sm"
              value={conversationId ?? ''}
              disabled={!conversationsQuery.data?.length}
              onChange={(event) => setSelectedConversationId(event.currentTarget.value || null)}
            >
              {!conversationsQuery.data?.length && <option value="">No chats yet</option>}
              {conversationsQuery.data?.map((conversation) => (
                <option key={conversation.id} value={conversation.id}>
                  {conversation.title}
                </option>
              ))}
            </select>
          </div>

          {state ? (
            <>
              <section className="border-bottom px-3 pb-3" aria-label="Sandbox status">
                <div className="d-flex align-items-center justify-content-between mb-2">
                  <div className="d-flex align-items-center gap-2">
                    <span className="small fw-semibold">Sandbox</span>
                    <Badge bg={statusVariant(state.conversation.runtime_status)}>
                      {formatStatus(state.conversation.runtime_status)}
                    </Badge>
                  </div>
                  <div className="d-flex gap-1">
                    {testControlsEnabled && state.conversation.container_id && (
                      <Button
                        size="sm"
                        variant="outline-danger"
                        disabled={killMutation.isPending}
                        onClick={() =>
                          killMutation.mutate({ conversationId: state.conversation.id, hard: true })
                        }
                      >
                        Kill sandbox
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline-secondary"
                      disabled={destroyMutation.isPending || Boolean(activeRun)}
                      onClick={() =>
                        destroyMutation.mutate({ conversationId: state.conversation.id })
                      }
                    >
                      Delete chat
                    </Button>
                  </div>
                </div>
                <div className="d-flex gap-2 mb-2">
                  <Badge bg={browserConnection === 'disconnected' ? 'danger' : 'secondary'}>
                    browser {browserConnection}
                  </Badge>
                  {state.latestRun && (
                    <Badge bg={statusVariant(state.latestRun.status)}>
                      run {formatStatus(state.latestRun.status)}
                    </Badge>
                  )}
                </div>
                <dl className="row small mb-0">
                  <dt className="col-3 text-muted">ID</dt>
                  <dd className="col-9 text-break font-monospace mb-1">
                    {state.conversation.container_id ?? 'Not allocated'}
                  </dd>
                  <dt className="col-3 text-muted">Path</dt>
                  <dd className="col-9 text-break font-monospace mb-1">
                    {state.conversation.workspace_path}
                  </dd>
                  <dt className="col-3 text-muted">Idle deadline</dt>
                  <dd className="col-9 mb-1">
                    {state.conversation.idle_deadline_at?.toLocaleString() ?? '—'}
                  </dd>
                  <dt className="col-3 text-muted">Backup</dt>
                  <dd className="col-9 mb-0">
                    {state.latestBackup
                      ? `${state.latestBackup.reason} · ${state.latestBackup.created_at.toLocaleString()}`
                      : 'None'}
                  </dd>
                  <dt className="col-3 text-muted">Commit</dt>
                  <dd className="col-9 text-break font-monospace mb-1">
                    {state.latestRun?.commit_sha ?? '—'}
                  </dd>
                  <dt className="col-3 text-muted">Pushed</dt>
                  <dd className="col-9 text-break font-monospace mb-1">
                    {state.latestRun?.pushed_sha ?? '—'}
                  </dd>
                  <dt className="col-3 text-muted">Sync job</dt>
                  <dd className="col-9 mb-0">{state.latestRun?.sync_job_sequence_id ?? '—'}</dd>
                </dl>
              </section>

              <CourseAgentChat
                key={state.conversation.id}
                conversationId={state.conversation.id}
                persistedMessages={state.messages}
                active={Boolean(activeRun)}
                submit={async (text) => {
                  const result = await submitMutation.mutateAsync({
                    conversationId: state.conversation.id,
                    prompt: text,
                  });
                  return { assistantMessageId: result.assistantMessage.id };
                }}
                getAssistantMessage={async (messageId) => {
                  const result = await stateQuery.refetch();
                  const message = result.data?.messages.find((message) => message.id === messageId);
                  return message
                    ? { status: message.status, text: textFromParts(message.parts) }
                    : null;
                }}
              />

              <details className="border-top px-3 pt-2">
                <summary className="small fw-semibold mb-2">Runtime events</summary>
                <ol
                  className="list-unstyled small font-monospace overflow-auto mb-2"
                  style={{ maxHeight: 160 }}
                >
                  {state.events.map((event) => (
                    <li key={event.id} className="text-break mb-1">
                      <details>
                        <summary>
                          <span className="text-muted">#{event.sequence}</span> {event.event_type}
                        </summary>
                        <pre className="small text-wrap bg-light border rounded p-2 mb-2">
                          {JSON.stringify(event.data, null, 2)}
                        </pre>
                      </details>
                    </li>
                  ))}
                </ol>
              </details>
            </>
          ) : conversationId ? (
            <div className="m-auto text-muted">
              <Spinner size="sm" className="me-2" /> Loading chat…
            </div>
          ) : (
            <div className="m-auto text-center p-4">
              <p className="text-muted">
                Create a chat to get started. No sandbox will be allocated yet.
              </p>
              <Button onClick={() => createMutation.mutate({})}>Create chat</Button>
            </div>
          )}

          {appError && <div className="alert alert-danger m-3 mt-0">{appError.message}</div>}
        </Offcanvas.Body>
      </Offcanvas>
    </>
  );
}

export function CourseAgentPanel({
  trpcCsrfToken,
  courseId,
  courseShortName,
  testControlsEnabled,
}: {
  trpcCsrfToken: string;
  courseId: string;
  courseShortName: string;
  testControlsEnabled: boolean;
}) {
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    createCourseTrpcClient({ csrfToken: trpcCsrfToken, courseId }),
  );

  if (!mounted) return null;

  return (
    <QueryClientProviderDebug client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <CourseAgentPanelInner
          courseShortName={courseShortName}
          testControlsEnabled={testControlsEnabled}
        />
      </TRPCProvider>
    </QueryClientProviderDebug>
  );
}

CourseAgentPanel.displayName = 'CourseAgentPanel';
