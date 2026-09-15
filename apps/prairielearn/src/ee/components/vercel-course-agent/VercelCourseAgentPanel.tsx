import { useChat } from '@ai-sdk/react';
import { QueryClient, useMutation } from '@tanstack/react-query';
import { DefaultChatTransport, getToolName, isToolUIPart } from 'ai';
import { useRef, useState } from 'react';
import { Alert, Button, Spinner } from 'react-bootstrap';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useStickToBottom } from 'use-stick-to-bottom';

import { getAppError, renderAppError } from '@prairielearn/trpc/client';
import { QueryClientProviderDebug } from '@prairielearn/trpc/react';

import { createCourseTrpcClient } from '../../../trpc/course/client.js';
import { TRPCProvider, useTRPC } from '../../../trpc/course/context.js';
import type { VercelCourseAgentError } from '../../../trpc/course/vercel-course-agent.js';

import { ChatComposer } from './ChatComposer.js';
import { AssistantMessage, UserMessage } from './ChatMessage.js';
import { ChatMessageParts } from './ChatMessageParts.js';
import { ToolCallStatus } from './ChatProgressStatus.js';
import { ScrollToBottomButton } from './ChatScrollToBottom.js';
import { VercelCourseAgentPanelShell } from './VercelCourseAgentPanelShell.js';

const markdownPlugins = [remarkGfm];
const workspaceMarkdownComponents: Components = {
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

function Conversation({
  courseId,
  streamCsrfToken,
  userName,
  showDiagnostics,
}: {
  courseId: string;
  streamCsrfToken: string;
  userName: string;
  showDiagnostics: boolean;
}) {
  const trpc = useTRPC();
  const create = useMutation(trpc.vercelCourseAgent.create.mutationOptions());
  const conversationIdRef = useRef<string | null>(null);
  const [stopped, setStopped] = useState(false);
  const stickToBottom = useStickToBottom({ initial: 'smooth', resize: 'smooth' });
  const [transport] = useState(
    () =>
      new DefaultChatTransport({
        api: `/pl/course/${courseId}/vercel_course_agent`,
        headers: { 'X-CSRF-Token': streamCsrfToken },
        prepareSendMessagesRequest: async ({ messages }) => {
          conversationIdRef.current ??= (await create.mutateAsync()).conversationId;
          return {
            body: {
              conversationId: conversationIdRef.current,
              prompt: messages
                .at(-1)
                ?.parts.filter((part) => part.type === 'text')
                .map((part) => part.text)
                .join(''),
            },
          };
        },
      }),
  );
  const { messages, sendMessage, status, error, stop, setMessages, clearError } = useChat({
    transport,
  });
  const busy = status === 'submitted' || status === 'streaming';
  const createError = getAppError<VercelCourseAgentError['Create']>(create.error);
  return (
    <>
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
                <p className="small mb-0">Try creating course content in a temporary workspace.</p>
              </div>
            )}
            {messages.map((message) =>
              message.role === 'user' ? (
                <UserMessage key={message.id} userName={userName}>
                  {message.parts
                    .filter((part) => part.type === 'text')
                    .map((part) => part.text)
                    .join('')}
                </UserMessage>
              ) : (
                <AssistantMessage key={message.id}>
                  <ChatMessageParts
                    parts={message.parts}
                    markdownOptions={{
                      components: workspaceMarkdownComponents,
                      remarkPlugins: markdownPlugins,
                    }}
                    renderTool={(part) => {
                      if (
                        !isToolUIPart(part) ||
                        part.state === 'approval-requested' ||
                        part.state === 'approval-responded' ||
                        part.state === 'output-denied'
                      ) {
                        return null;
                      }
                      return <ToolCallStatus state={part.state} statusText={getToolName(part)} />;
                    }}
                  />
                </AssistantMessage>
              ),
            )}
            {busy && (
              <div role="status" className="d-flex align-items-center gap-2 small text-muted mb-3">
                <Spinner size="sm" /> Working…
              </div>
            )}
            {(error || stopped) && (
              <Alert variant="danger">
                {createError
                  ? renderAppError(createError, { UNKNOWN: ({ message }) => message })
                  : stopped
                    ? 'Generation stopped. Start over to continue.'
                    : 'The agent could not finish. Start over to try again.'}
              </Alert>
            )}
            {showDiagnostics && (
              <details className="course-agent-diagnostic-card small text-muted mt-3">
                <summary>Conversation info (only visible to administrators)</summary>
                <div>
                  Conversation: <code>{conversationIdRef.current ?? 'Not started'}</code>
                </div>
                <div>
                  Status: <code>{status}</code>
                </div>
              </details>
            )}
          </div>
        </div>
        <ScrollToBottomButton
          isAtBottom={stickToBottom.isAtBottom}
          scrollToBottom={() => void stickToBottom.scrollToBottom()}
        />
      </div>
      <footer className="course-agent-footer border-top bg-white p-3">
        <ChatComposer
          disabled={busy || stopped || !!error}
          isGenerating={busy}
          label="Message course agent"
          sendLabel="Send message"
          placeholder="Ask anything about your course…"
          textareaClassName="form-control course-agent-chat-input shadow-none mb-2"
          footer={
            <>
              <span className="small text-muted">Codex</span>
              <Button
                variant="link"
                size="sm"
                disabled={busy}
                onClick={() => {
                  conversationIdRef.current = null;
                  setMessages([]);
                  clearError();
                  create.reset();
                  setStopped(false);
                }}
              >
                Start over
              </Button>
            </>
          }
          disclaimer="Temporary session. Reloading or sandbox expiry requires starting over."
          onStop={() => {
            setStopped(true);
            void stop();
          }}
          onSubmit={(text) => {
            void stickToBottom.scrollToBottom();
            void sendMessage({ text });
          }}
        />
      </footer>
    </>
  );
}

export function VercelCourseAgentPanel({
  initialOpen,
  trpcCsrfToken,
  streamCsrfToken,
  courseId,
  userName,
  showDiagnostics,
}: {
  initialOpen: boolean;
  trpcCsrfToken: string;
  streamCsrfToken: string;
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
        <VercelCourseAgentPanelShell initialOpen={initialOpen}>
          <Conversation
            courseId={courseId}
            streamCsrfToken={streamCsrfToken}
            userName={userName}
            showDiagnostics={showDiagnostics}
          />
        </VercelCourseAgentPanelShell>
      </TRPCProvider>
    </QueryClientProviderDebug>
  );
}
VercelCourseAgentPanel.displayName = 'VercelCourseAgentPanel';
