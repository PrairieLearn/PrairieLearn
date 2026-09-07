import { useChat } from '@ai-sdk/react';
import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Fragment, useEffect, useRef, useState } from 'react';
import { Alert, Button, Dropdown, Spinner } from 'react-bootstrap';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useStickToBottom } from 'use-stick-to-bottom';

import type { CourseAgentEvent } from '@prairielearn/course-agent-protocol';
import { getAppError } from '@prairielearn/trpc/client';
import { AppErrorAlert, QueryClientProviderDebug } from '@prairielearn/trpc/react';

import { createCourseTrpcClient } from '../../trpc/course/client.js';
import { TRPCProvider, useTRPC } from '../../trpc/course/context.js';
import type { CourseAgentError } from '../../trpc/course/course-agent.js';
import type { CourseAgentMessage } from '../lib/course-agent/ui-stream.js';

import { CourseAgentConversationPicker } from './CourseAgentConversationPicker.js';
import { CourseAgentPanelShell } from './CourseAgentPanelShell.js';
import { ChatComposer } from './course-agent/ChatComposer.js';
import { AssistantMessage, MessageMetadata, UserMessage } from './course-agent/ChatMessage.js';
import { ChatMessageParts } from './course-agent/ChatMessageParts.js';
import { ToolCallStatus } from './course-agent/ChatProgressStatus.js';
import { ScrollToBottomButton } from './course-agent/ChatScrollToBottom.js';
import { CourseAgentDiff } from './course-agent/CourseAgentDiff.js';
import { type CourseAgentRun, CourseAgentTransport } from './courseAgentTransport.js';

const markdownPlugins = [remarkGfm];
export const workspaceMarkdownComponents: Components = {
  a: ({ href, children }) =>
    /^https?:\/\//i.test(href ?? '') ? (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    ) : (
      <>{children}</>
    ),
  img: ({ alt }) => <span>{alt}</span>,
};

function CourseAgentPanelInner(props: {
  initialOpen: boolean;
  courseId: string;
  userName: string;
  timeZone: string;
  showDiagnostics: boolean;
  trpcClient: ReturnType<typeof createCourseTrpcClient>;
}) {
  const trpc = useTRPC();
  const [selection, setSelection] = useState<{ id?: string; version: number }>({ version: 0 });
  const selectConversation = useMutation(trpc.courseAgent.selectConversation.mutationOptions());
  const conversations = useQuery(
    trpc.courseAgent.list.queryOptions(undefined, { refetchInterval: 3000 }),
  );
  const history = useQuery(
    trpc.courseAgent.history.queryOptions(
      { conversationId: selection.id === 'new' ? undefined : selection.id },
      {
        enabled: selection.id !== 'new',
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        staleTime: 0,
      },
    ),
  );
  const newConversation = selection.id === 'new';
  if (!newConversation && (history.isPending || history.isFetching)) {
    return (
      <CourseAgentPanelShell initialOpen={props.initialOpen} loading>
        {null}
      </CourseAgentPanelShell>
    );
  }
  if (!newConversation && history.isError) {
    return (
      <CourseAgentPanelShell initialOpen={props.initialOpen}>
        <div className="p-3">
          <AppErrorAlert
            error={getAppError<CourseAgentError['History']>(history.error)}
            render={{ UNKNOWN: ({ message }) => message }}
          />
          <Button variant="link" onClick={() => void history.refetch()}>
            Try again
          </Button>
          <Button
            variant="link"
            onClick={() => setSelection({ id: 'new', version: selection.version + 1 })}
          >
            New conversation
          </Button>
        </div>
      </CourseAgentPanelShell>
    );
  }
  return (
    <CourseAgentPanelShell initialOpen={props.initialOpen}>
      <CourseAgentConversationPanel
        key={selection.version}
        {...props}
        initialHistory={
          newConversation
            ? { run: null, activeRunId: null, messages: [], warning: null }
            : history.data!
        }
        conversations={conversations.data?.conversations ?? []}
        listError={getAppError<CourseAgentError['List']>(conversations.error)}
        onSelect={(id) => {
          setSelection({ id, version: selection.version + 1 });
          selectConversation.mutate({ conversationId: id === 'new' ? null : id });
        }}
      />
    </CourseAgentPanelShell>
  );
}

function CourseAgentConversationPanel({
  courseId,
  userName,
  timeZone,
  showDiagnostics,
  trpcClient,
  initialHistory,
  conversations,
  listError,
  onSelect,
}: {
  courseId: string;
  userName: string;
  timeZone: string;
  showDiagnostics: boolean;
  trpcClient: ReturnType<typeof createCourseTrpcClient>;
  initialHistory: Awaited<
    ReturnType<ReturnType<typeof createCourseTrpcClient>['courseAgent']['history']['query']>
  >;
  conversations: Awaited<
    ReturnType<ReturnType<typeof createCourseTrpcClient>['courseAgent']['list']['query']>
  >['conversations'];
  listError: ReturnType<typeof getAppError<CourseAgentError['List']>>;
  onSelect: (id: string) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const stickToBottom = useStickToBottom({ initial: 'smooth', resize: 'smooth' });

  const [prompt, setPrompt] = useState('');
  const [queuedPrompts, setQueuedPrompts] = useState<
    { id: string; text: string; createdAt: string }[]
  >([]);
  const queuedPromptsRef = useRef(queuedPrompts);
  const [conversation, setConversation] = useState<CourseAgentRun | null>(initialHistory.run);
  const [transport] = useState(
    () =>
      new CourseAgentTransport(
        (input) => trpcClient.courseAgent.start.mutate(input),
        courseId,
        (run) => {
          // Keep the conversation selected while the next run is being submitted.
          if (run) {
            setConversation(run);
            void queryClient.invalidateQueries(trpc.courseAgent.list.queryFilter());
          }
        },
        initialHistory.run,
      ),
  );
  const snapshot = useQuery(
    trpc.courseAgent.get.queryOptions(
      conversation ?? { conversationId: '00000000-0000-0000-0000-000000000000', sandboxId: '' },
      { enabled: conversation !== null, retry: false },
    ),
  );
  const { messages, sendMessage, status, error, resumeStream, setMessages, stop } =
    useChat<CourseAgentMessage>({
      transport,
      messages: initialHistory.messages,
      onData: () => void snapshot.refetch(),
      onFinish: () => {
        if (showDiagnostics) void diagnostics.refetch();
        void queryClient.invalidateQueries(trpc.courseAgent.list.queryFilter());
        const next = queuedPromptsRef.current.at(0);
        if (next) {
          const remaining = queuedPromptsRef.current.slice(1);
          queuedPromptsRef.current = remaining;
          setQueuedPrompts(remaining);
          queueMicrotask(() => {
            void sendMessage({
              text: next.text,
              metadata: { createdAt: next.createdAt },
            });
          });
        }
      },
    });
  const resumedRef = useRef(false);
  const [runToResume] = useState(initialHistory.activeRunId);
  // A page reload reconnects to the existing run instead of submitting another prompt.
  useEffect(() => {
    if (runToResume && !resumedRef.current) {
      resumedRef.current = true;
      void resumeStream();
    }
  }, [runToResume, resumeStream]);
  // Switching conversations disconnects this browser stream, not the server-side agent run.
  useEffect(
    () => () => {
      void stop();
    },
    [stop],
  );
  const busy = status === 'submitted' || status === 'streaming';
  const lastMessage = messages.at(-1);
  const hasActiveTool =
    lastMessage?.role === 'assistant' &&
    lastMessage.parts.some(
      (part) =>
        part.type === 'tool-activity' &&
        (part.state === 'input-streaming' || part.state === 'input-available'),
    );
  const diagnostics = useQuery(
    trpc.courseAgent.diagnostics.queryOptions(
      conversation ?? { conversationId: '00000000-0000-0000-0000-000000000000', sandboxId: '' },
      { enabled: showDiagnostics && conversation !== null, refetchInterval: busy ? 1000 : false },
    ),
  );
  const approval = useMutation(
    trpc.courseAgent.respondToPushApproval.mutationOptions({
      onSuccess: () => void snapshot.refetch(),
    }),
  );
  const approvalMode = useQuery(trpc.courseAgent.getApprovalMode.queryOptions());
  const setApprovalMode = useMutation(
    trpc.courseAgent.setApprovalMode.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.courseAgent.getApprovalMode.queryFilter());
        if (snapshot.data?.pendingApproval) await snapshot.refetch();
      },
    }),
  );
  const approvalError = getAppError<CourseAgentError['RespondToPushApproval']>(approval.error);
  const approvalModeError = getAppError<CourseAgentError['SetApprovalMode']>(setApprovalMode.error);

  return (
    <div className="course-agent-conversation">
      <div className="border-bottom bg-white px-3 pb-3">
        <CourseAgentConversationPicker
          conversations={conversations}
          selectedId={conversation?.conversationId ?? 'new'}
          busy={busy}
          disabled={status === 'submitted'}
          onSelect={onSelect}
        />
        <AppErrorAlert error={listError} render={{ UNKNOWN: ({ message }) => message }} />
      </div>
      <div className="course-agent-history position-relative">
        <div
          ref={stickToBottom.scrollRef}
          className="course-agent-transcript h-100"
          aria-label="Conversation messages"
          role="log"
          aria-live="polite"
        >
          <div ref={stickToBottom.contentRef} className="px-4 py-4">
            {initialHistory.warning && <Alert variant="warning">{initialHistory.warning}</Alert>}
            {messages.length === 0 && (
              <div className="course-agent-empty text-center text-muted px-3 py-5">
                <i className="bi bi-stars fs-2 text-primary" aria-hidden="true" />
                <p className="fw-semibold text-body mt-3 mb-1">What would you like to build?</p>
                <p className="small mb-0">
                  Ask the agent to create or improve PrairieLearn course content.
                </p>
              </div>
            )}
            {messages.map((message) =>
              message.role === 'user' ? (
                <UserMessage
                  key={message.id}
                  userName={userName}
                  createdAt={message.metadata?.createdAt}
                  timeZone={timeZone}
                >
                  {message.parts
                    .filter((part) => part.type === 'text')
                    .map((part) => part.text)
                    .join('')}
                </UserMessage>
              ) : (
                <AssistantMessage key={message.id}>
                  <ChatMessageParts<CourseAgentMessage>
                    parts={message.parts}
                    renderTool={(part) => {
                      if (
                        part.type !== 'tool-activity' ||
                        part.state === 'approval-requested' ||
                        part.state === 'approval-responded' ||
                        part.state === 'output-denied'
                      ) {
                        return null;
                      }
                      const waitingForApproval =
                        snapshot.data?.pendingApproval &&
                        (part.state === 'input-streaming' || part.state === 'input-available') &&
                        ['Proposing changes', 'Used push sync'].includes(part.input?.label ?? '');
                      if (waitingForApproval) {
                        if (approvalMode.data?.mode === 'always') {
                          return (
                            <ToolCallStatus
                              state={part.state}
                              statusText="Publishing proposed changes"
                            />
                          );
                        }
                        return (
                          <div
                            role="status"
                            className="d-flex align-items-start gap-1 small text-warning-emphasis"
                          >
                            <i className="bi bi-person-check flex-shrink-0" aria-hidden="true" />
                            <span>Waiting for your approval</span>
                          </div>
                        );
                      }
                      return (
                        <ToolCallStatus
                          state={part.state}
                          statusText={
                            part.state === 'output-available'
                              ? part.output.label
                              : part.state === 'output-error'
                                ? part.errorText
                                : (part.input?.label ?? 'Working…')
                          }
                        />
                      );
                    }}
                    markdownOptions={{
                      components: workspaceMarkdownComponents,
                      remarkPlugins: markdownPlugins,
                    }}
                  />
                  {message.metadata?.failure && (
                    <Alert variant="danger">{message.metadata.failure}</Alert>
                  )}
                  {(!busy || message.id !== messages.at(-1)?.id) && (
                    <MessageMetadata
                      author="PrairieLearn"
                      createdAt={message.metadata?.createdAt}
                      timeZone={timeZone}
                    />
                  )}
                </AssistantMessage>
              ),
            )}
            {queuedPrompts.map((message) => (
              <UserMessage
                key={message.id}
                userName={userName}
                createdAt={message.createdAt}
                timeZone={timeZone}
              >
                <span>{message.text}</span>
                <span className="small text-muted">
                  <i className="bi bi-clock me-1" aria-hidden="true" />
                  Queued
                </span>
              </UserMessage>
            ))}
            {busy && !hasActiveTool && !snapshot.data?.pendingApproval && (
              <div role="status" className="d-flex align-items-center gap-2 small text-muted mb-3">
                <Spinner size="sm" /> Working…
              </div>
            )}
            {error && (
              <Alert variant="danger">
                {error.message}
                {conversation && (
                  <Button
                    variant="link"
                    onClick={() => {
                      // Redis replays the complete run. Rebuild its message instead of appending it twice.
                      setMessages((current) =>
                        current.filter((message) => message.id !== conversation.runId),
                      );
                      void resumeStream();
                    }}
                  >
                    Reconnect
                  </Button>
                )}
              </Alert>
            )}
            <AppErrorAlert
              error={approvalError}
              render={{ UNKNOWN: ({ message }) => message }}
              onDismiss={() => approval.reset()}
            />
            {approval.data?.status === 'failed' && (
              <Alert variant="danger" dismissible onClose={() => approval.reset()}>
                <Alert.Heading className="h6">Proposed changes were not published</Alert.Heading>
                <div className="small" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                  {approval.data.message}
                </div>
              </Alert>
            )}
            <AppErrorAlert
              error={approvalModeError}
              render={{ UNKNOWN: ({ message }) => message }}
              onDismiss={() => setApprovalMode.reset()}
            />
            {snapshot.data?.pendingApproval && approvalMode.data?.mode !== 'always' && (
              <div className="course-agent-approval border rounded bg-white overflow-hidden mb-4">
                <div className="border-bottom px-3 py-2">
                  <div className="d-flex align-items-center gap-2 fw-semibold">
                    <i className="bi bi-shield-check text-warning" aria-hidden="true" />
                    Proposed changes
                  </div>
                  <p className="small text-muted mb-1 mt-1">
                    Review the proposed changes and provide your approval.
                  </p>
                  <p className="small text-break mb-0">
                    {snapshot.data.pendingApproval.diffSummary}
                  </p>
                </div>
                <details>
                  <summary className="small px-3 py-2">View full diff</summary>
                  <CourseAgentDiff diff={snapshot.data.pendingApproval.diff} />
                </details>
                <div className="d-flex justify-content-end gap-2 border-top px-2 py-2">
                  <Button
                    size="sm"
                    disabled={approval.isPending}
                    onClick={() =>
                      approval.mutate({
                        approvalId: snapshot.data.pendingApproval!.id,
                        decision: 'approve',
                      })
                    }
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline-danger"
                    disabled={approval.isPending}
                    onClick={() =>
                      approval.mutate({
                        approvalId: snapshot.data.pendingApproval!.id,
                        decision: 'deny',
                      })
                    }
                  >
                    Deny
                  </Button>
                </div>
              </div>
            )}
            <div className="pt-3 mt-3">
              {showDiagnostics && (
                <Diagnostics
                  conversation={conversation}
                  runId={busy ? (conversation?.runId ?? null) : null}
                  events={diagnostics.data?.events ?? []}
                  status={busy ? 'running' : (diagnostics.data?.status ?? 'offline')}
                />
              )}
            </div>
          </div>
        </div>

        <ScrollToBottomButton
          isAtBottom={stickToBottom.isAtBottom}
          scrollToBottom={() => void stickToBottom.scrollToBottom()}
        />
      </div>
      <footer className="course-agent-footer border-top bg-white p-3">
        <ChatComposer
          value={prompt}
          disabled={false}
          isGenerating={busy}
          label="Message course agent"
          sendLabel="Send message"
          placeholder="Ask anything about your course…"
          textareaClassName="form-control course-agent-chat-input shadow-none mb-2"
          footer={
            <ApprovalModePicker
              mode={approvalMode.data?.mode ?? 'ask'}
              loading={approvalMode.isPending}
              disabled={setApprovalMode.isPending}
              onSelect={(mode) => setApprovalMode.mutate({ mode })}
            />
          }
          allowSubmitWhileGenerating
          onChange={setPrompt}
          onSubmit={(text) => {
            void stickToBottom.scrollToBottom();
            setPrompt('');
            const createdAt = new Date().toISOString();
            if (busy) {
              const queued = { id: crypto.randomUUID(), text, createdAt };
              setQueuedPrompts((current) => {
                const next = [...current, queued];
                queuedPromptsRef.current = next;
                return next;
              });
            } else {
              void sendMessage({ text, metadata: { createdAt } });
            }
          }}
        />
      </footer>
    </div>
  );
}

function ApprovalModePicker({
  mode,
  loading,
  disabled,
  onSelect,
}: {
  mode: 'ask' | 'always';
  loading: boolean;
  disabled: boolean;
  onSelect: (mode: 'ask' | 'always') => void;
}) {
  const label = mode === 'always' ? 'Always approve' : 'Ask for approval';
  return (
    <Dropdown>
      <Dropdown.Toggle
        size="sm"
        variant="light"
        className="border-0 px-1 text-muted"
        disabled={loading || disabled}
      >
        {loading && <Spinner size="sm" className="me-2" aria-hidden="true" />}
        {loading ? 'Loading approval setting' : label}
      </Dropdown.Toggle>
      <Dropdown.Menu>
        <Dropdown.Header>Approvals for course editing</Dropdown.Header>
        <Dropdown.Item active={mode === 'ask'} onClick={() => onSelect('ask')}>
          Ask for approval
        </Dropdown.Item>
        <Dropdown.Item active={mode === 'always'} onClick={() => onSelect('always')}>
          Always approve
        </Dropdown.Item>
      </Dropdown.Menu>
    </Dropdown>
  );
}

function Diagnostics({
  conversation,
  runId,
  events,
  status,
}: {
  conversation: { conversationId: string; sandboxId: string } | null;
  runId: string | null;
  events: CourseAgentEvent[];
  status: string;
}) {
  const agentStarted = findLastEvent(events, 'agent.started');
  const usage = findLastEvent(events, 'usage.updated');
  const docs = findLastEvent(events, 'docs.mounted', 'docs.unavailable');
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
    [
      'Documentation',
      docs?.type === 'docs.mounted' ? 'Mounted' : docs ? 'Bundled skill only' : 'Pending',
    ],
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
        <span>Conversation info (only visible to administrators)</span>
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

function findLastEvent(events: CourseAgentEvent[], ...types: CourseAgentEvent['type'][]) {
  for (let index = events.length - 1; index >= 0; index--) {
    if (types.includes(events[index].type)) return events[index];
  }
  return undefined;
}

export function CourseAgentPanel({
  initialOpen,
  trpcCsrfToken,
  courseId,
  userName,
  timeZone,
  showDiagnostics,
}: {
  initialOpen: boolean;
  trpcCsrfToken: string;
  courseId: string;
  userName: string;
  timeZone: string;
  showDiagnostics: boolean;
}) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    createCourseTrpcClient({ csrfToken: trpcCsrfToken, courseId }),
  );
  return (
    <QueryClientProviderDebug client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <CourseAgentPanelInner
          initialOpen={initialOpen}
          trpcClient={trpcClient}
          courseId={courseId}
          userName={userName}
          timeZone={timeZone}
          showDiagnostics={showDiagnostics}
        />
      </TRPCProvider>
    </QueryClientProviderDebug>
  );
}

CourseAgentPanel.displayName = 'CourseAgentPanel';
