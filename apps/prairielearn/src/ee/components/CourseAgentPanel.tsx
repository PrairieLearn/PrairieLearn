import { useChat } from '@ai-sdk/react';
import { QueryClient, useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { Fragment, useState } from 'react';
import { Alert, Button, Spinner } from 'react-bootstrap';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useStickToBottom } from 'use-stick-to-bottom';

import type { CourseAgentEvent } from '@prairielearn/course-agent-protocol';
import { QueryClientProviderDebug } from '@prairielearn/trpc/react';
import { OverlayTrigger } from '@prairielearn/ui';

import { createCourseTrpcClient } from '../../trpc/course/client.js';
import { TRPCProvider, useTRPC } from '../../trpc/course/context.js';
import type { CourseAgentMessage } from '../lib/course-agent/ui-stream.js';

import { ChatComposer } from './chat/ChatComposer.js';
import { AssistantMessage, MessageMetadata, UserMessage } from './chat/ChatMessage.js';
import { ChatMessageParts } from './chat/ChatMessageParts.js';
import { ToolCallStatus } from './chat/ChatProgressStatus.js';
import { ScrollToBottomButton } from './chat/ChatScrollToBottom.js';
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

function CourseAgentPanelInner({
  courseId,
  userName,
  showDiagnostics,
  trpcClient,
}: {
  courseId: string;
  userName: string;
  showDiagnostics: boolean;
  trpcClient: ReturnType<typeof createCourseTrpcClient>;
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
  const [conversation, setConversation] = useState<CourseAgentRun | null>(null);
  const [transport] = useState(
    () =>
      new CourseAgentTransport(
        (input) => trpcClient.courseAgent.start.mutate(input),
        courseId,
        setConversation,
      ),
  );
  const { messages, sendMessage, status, error, resumeStream, setMessages } =
    useChat<CourseAgentMessage>({
      transport,
      onFinish: () => {
        if (showDiagnostics) void diagnostics.refetch();
      },
    });
  const busy = status === 'submitted' || status === 'streaming';
  const diagnostics = useQuery(
    trpc.courseAgent.diagnostics.queryOptions(
      conversation ?? { conversationId: '00000000-0000-0000-0000-000000000000', sandboxId: '' },
      { enabled: showDiagnostics && conversation !== null, refetchInterval: busy ? 1000 : false },
    ),
  );

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

        <div className="course-agent-history position-relative">
          <div
            ref={stickToBottom.scrollRef}
            className="course-agent-transcript h-100"
            aria-label="Conversation messages"
            role="log"
            aria-live="polite"
          >
            <div ref={stickToBottom.contentRef} className="px-4 py-4">
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
                      />
                    )}
                  </AssistantMessage>
                ),
              )}
              {busy && (
                <div
                  role="status"
                  className="d-flex align-items-center gap-2 small text-muted mb-3"
                >
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
            disabled={busy}
            isGenerating={busy}
            label="Message course agent"
            sendLabel="Send message"
            placeholder="Ask anything about your course…"
            textareaClassName="form-control course-agent-chat-input shadow-none mb-2"
            footer={<span className="small text-muted">Codex</span>}
            onChange={setPrompt}
            onSubmit={(text) => {
              void stickToBottom.scrollToBottom();
              setPrompt('');
              void sendMessage({ text, metadata: { createdAt: new Date().toISOString() } });
            }}
          />
        </footer>
      </div>
    </aside>
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
  showDiagnostics,
}: {
  trpcCsrfToken: string;
  courseId: string;
  userName: string;
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
          trpcClient={trpcClient}
          courseId={courseId}
          userName={userName}
          showDiagnostics={showDiagnostics}
        />
      </TRPCProvider>
    </QueryClientProviderDebug>
  );
}

CourseAgentPanel.displayName = 'CourseAgentPanel';
