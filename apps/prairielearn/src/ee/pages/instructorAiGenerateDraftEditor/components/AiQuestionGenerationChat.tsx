import { useChat } from '@ai-sdk/react';
import {
  DefaultChatTransport,
  type ReasoningUIPart,
  type TextUIPart,
  type ToolUIPart,
  type UIMessage,
  type UIToolInvocation,
} from 'ai';
import clsx from 'clsx';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Modal } from 'react-bootstrap';
import { useStickToBottom } from 'use-stick-to-bottom';

import { run } from '@prairielearn/run';
import { assertNever } from '@prairielearn/utils';

import type {
  QuestionGenerationToolUIPart,
  QuestionGenerationUIMessage,
} from '../../../lib/ai-question-generation/agent.js';

import { MemoizedMarkdown } from './MemoizedMarkdown.js';
import { PromptInput } from './PromptInput.js';

function isToolPart(part: UIMessage['parts'][0]): part is ToolUIPart {
  return part.type.startsWith('tool-');
}

function ProgressStatus({
  state,
  statusText,
  showSpinner,
}: {
  state: 'streaming' | 'success' | 'error';
  statusText: ReactNode;
  showSpinner?: boolean;
}) {
  return (
    <div className="d-flex flex-row align-items-center gap-1 small text-muted">
      {run(() => {
        if (state === 'streaming' || showSpinner) {
          return (
            <div className="spinner-border spinner-border-text" role="status">
              <span className="visually-hidden">Loading...</span>
            </div>
          );
        } else if (state === 'success') {
          return <i className="bi bi-fw bi-check-lg text-success" aria-hidden="true" />;
        } else {
          return <i className="bi bi-fw bi-x text-danger" aria-hidden="true" />;
        }
      })}
      <span>{statusText}</span>
    </div>
  );
}

function ToolCallStatus({
  state,
  statusText,
  showSpinner,
  children,
}: {
  state: Exclude<
    ToolUIPart['state'],
    'approval-requested' | 'approval-responded' | 'output-denied' | undefined
  >;
  statusText: ReactNode;
  showSpinner?: boolean;
  children?: ReactNode;
}) {
  return (
    <div>
      <ProgressStatus
        state={run(() => {
          switch (state) {
            case 'input-streaming':
            case 'input-available':
              return 'streaming';
            case 'output-available':
              return 'success';
            case 'output-error':
              return 'error';
            default:
              assertNever(state);
          }
        })}
        statusText={statusText}
        showSpinner={showSpinner}
      />
      <div>{children}</div>
    </div>
  );
}

function getStatusForState(
  state: UIToolInvocation<any>['state'],
  messages: { streaming: ReactNode; pending: ReactNode; done: ReactNode; error: ReactNode },
): ReactNode {
  switch (state) {
    case 'input-streaming':
      return messages.streaming;
    case 'input-available':
      return messages.pending;
    case 'output-available':
      return messages.done;
    case 'output-error':
      return messages.error;
  }
}

function ToolCall({ part }: { part: QuestionGenerationToolUIPart }) {
  const toolName = part.type.slice('tool-'.length);

  if (
    part.state === 'approval-requested' ||
    part.state === 'approval-responded' ||
    part.state === 'output-denied'
  ) {
    // We don't currently use or support these states.
    return null;
  }

  const statusText = run(() => {
    switch (part.type) {
      case 'tool-getElementDocumentation': {
        const elementCode = <code>&lt;{part.input?.elementName}&gt;</code>;
        return getStatusForState(part.state, {
          streaming: 'Getting element documentation...',
          pending: <>Reading documentation for {elementCode}...</>,
          done: <>Read documentation for {elementCode}</>,
          error: 'Error getting element documentation',
        });
      }

      case 'tool-listElementExamples': {
        const elementCode = <code>&lt;{part.input?.elementName}&gt;</code>;
        return getStatusForState(part.state, {
          streaming: 'Listing element examples...',
          pending: <>Listing examples for {elementCode}...</>,
          done: <>Listed examples for {elementCode}</>,
          error: 'Error listing element examples',
        });
      }

      case 'tool-getExampleQuestions': {
        const questionCount = part.input?.qids?.length || 0;
        const pluralQuestions = questionCount === 1 ? 'question' : 'questions';
        return getStatusForState(part.state, {
          streaming: 'Getting example questions...',
          pending: `Reading ${questionCount} example ${pluralQuestions}...`,
          done: `Read ${questionCount} example ${pluralQuestions}`,
          error: 'Error getting example questions',
        });
      }

      case 'tool-writeFile': {
        const pathCode = <code>{part.input?.path}</code>;
        return getStatusForState(part.state, {
          streaming: 'Writing file...',
          pending: <>Writing file {pathCode}...</>,
          done: <>Wrote file {pathCode}</>,
          error: <>Error writing file {pathCode}</>,
        });
      }

      case 'tool-readFile': {
        const pathCode = <code>{part.input?.path}</code>;
        return getStatusForState(part.state, {
          streaming: 'Reading file...',
          pending: <>Reading file {pathCode}...</>,
          done: <>Read file {pathCode}</>,
          error: <>Error reading file {pathCode}</>,
        });
      }

      case 'tool-saveAndValidateQuestion': {
        // TODO: check output for validation results.
        return getStatusForState(part.state, {
          streaming: 'Saving and validating question...',
          pending: 'Saving and validating question...',
          done: 'Saved and validated question',
          error: 'Error saving and validating question',
        });
      }

      case 'tool-getPythonLibraries': {
        return getStatusForState(part.state, {
          streaming: 'Reading available Python libraries...',
          pending: 'Reading available Python libraries...',
          done: 'Read available Python libraries',
          error: 'Error reading available Python libraries',
        });
      }

      default: {
        return toolName;
      }
    }
  });

  return <ToolCallStatus state={part.state} statusText={statusText} />;
}

function ReasoningBlock({ part }: { part: ReasoningUIPart }) {
  // Track whether the user has explicitly interacted with the expand/collapse
  const [userControlled, setUserControlled] = useState(false);
  const [userExpanded, setUserExpanded] = useState(false);

  const isStreaming = part.state === 'streaming';

  // If user has taken control, use their preference. Otherwise, expand while streaming, collapse when done.
  const isExpanded = userControlled ? userExpanded : isStreaming;

  if (!part.text) return null;

  const toggleExpanded = () => {
    setUserControlled(true);
    setUserExpanded(!isExpanded);
  };

  return (
    <div className="d-flex flex-column gap-1 border rounded p-1 small">
      <button
        type="button"
        className="d-flex flex-row gap-2 align-items-center btn btn-link text-decoration-none p-0 text-start"
        aria-expanded={isExpanded}
        onClick={toggleExpanded}
      >
        <i
          className={clsx('bi small text-muted', {
            'bi-chevron-right': !isExpanded,
            'bi-chevron-down': isExpanded,
          })}
          aria-hidden="true"
        />
        <span className="small text-muted">{isStreaming ? 'Thinking...' : 'Thinking'}</span>
      </button>

      {isExpanded && (
        <div className="markdown-body reasoning-body p-1 pt-0">
          <MemoizedMarkdown content={part.text} />
        </div>
      )}
    </div>
  );
}

function TextPart({ part }: { part: TextUIPart }) {
  return (
    <div className="markdown-body">
      <MemoizedMarkdown content={part.text} />
    </div>
  );
}

function MessageParts({ parts }: { parts: QuestionGenerationUIMessage['parts'] }) {
  return parts.map((part, index) => {
    const key = `part-${index}`;
    if (isToolPart(part)) {
      return <ToolCall key={key} part={part} />;
    } else if (part.type === 'text') {
      return <TextPart key={key} part={part} />;
    } else if (part.type === 'reasoning') {
      return <ReasoningBlock key={key} part={part} />;
    } else if (['step-start'].includes(part.type)) {
      return '';
    } else {
      return (
        <pre key={key}>
          <code>{JSON.stringify(part, null, 2)}</code>
        </pre>
      );
    }
  });
}

function ScrollToBottomButton({
  isAtBottom,
  scrollToBottom,
}: {
  isAtBottom?: boolean;
  scrollToBottom: () => void;
}) {
  return (
    !isAtBottom && (
      <button
        type="button"
        className={clsx(
          'position-absolute',
          'bottom-0',
          'start-50',
          'translate-middle',
          'rounded-circle',
          'bg-primary',
          'text-white',
          'p-2',
          'd-flex',
          'align-items-center',
          'justify-content-center',
          'border-0',
          'fs-3',
        )}
        style={{ aspectRatio: '1 / 1' }}
        aria-label="Scroll to bottom"
        onClick={() => scrollToBottom()}
      >
        <i className="bi bi-arrow-down-circle-fill lh-1" aria-hidden="true" />
      </button>
    )
  );
}

function Message({
  message,
  isLastMessage,
  showJobLogsLink,
  showSpinner,
  urlPrefix,
}: {
  message: QuestionGenerationUIMessage;
  isLastMessage: boolean;
  showJobLogsLink: boolean;
  showSpinner: boolean;
  urlPrefix: string;
}) {
  if (message.role === 'user') {
    const textContent = message.parts
      .filter((part): part is TextUIPart => part.type === 'text')
      .map((part) => part.text)
      .join('\n');

    return (
      <div className="d-flex flex-row-reverse mb-3">
        <div
          className="d-flex flex-column gap-2 p-3 rounded bg-secondary-subtle"
          style={{ maxWidth: '90%', whiteSpace: 'pre-wrap' }}
        >
          {textContent}
        </div>
      </div>
    );
  }

  const jobLogsUrl = run(() => {
    if (!showJobLogsLink) return null;

    const job_sequence_id = message.metadata?.job_sequence_id;
    if (!job_sequence_id) return null;

    return urlPrefix + '/jobSequence/' + job_sequence_id;
  });

  return (
    <div className="d-flex flex-column gap-2 mb-3">
      <MessageParts parts={message.parts} />
      {message.metadata?.status === 'canceled' && (
        <div className="small text-muted fst-italic">
          <i className="bi bi-stop-circle me-1" aria-hidden="true" />
          Generation was stopped
        </div>
      )}
      {isLastMessage && showSpinner && <ProgressStatus state="streaming" statusText="Working..." />}
      {jobLogsUrl && (
        <a className="small" href={jobLogsUrl} target="_blank">
          View job logs (link only visible to administrators)
        </a>
      )}
    </div>
  );
}

function Messages({
  messages,
  showJobLogsLink,
  showSpinner,
  urlPrefix,
}: {
  messages: QuestionGenerationUIMessage[];
  showJobLogsLink: boolean;
  showSpinner: boolean;
  urlPrefix: string;
}) {
  const [showExcluded, setShowExcluded] = useState(false);

  const excludedMessages = messages.filter((m) => m.metadata?.include_in_context === false);
  const activeMessages = messages.filter((m) => m.metadata?.include_in_context !== false);

  return (
    <>
      {excludedMessages.length > 0 && (
        <div className="mb-3">
          <button
            type="button"
            className="btn btn-link btn-sm text-decoration-none text-muted p-0 d-flex align-items-center gap-1"
            aria-expanded={showExcluded}
            onClick={() => setShowExcluded(!showExcluded)}
          >
            <i
              className={clsx('bi small', {
                'bi-chevron-right': !showExcluded,
                'bi-chevron-down': showExcluded,
              })}
              aria-hidden="true"
            />
            <span>
              {excludedMessages.length} earlier{' '}
              {excludedMessages.length === 1 ? 'message' : 'messages'} excluded from context
            </span>
          </button>
          {showExcluded && (
            <div className="mt-2" style={{ opacity: 0.6 }}>
              {excludedMessages.map((message) => (
                <Message
                  key={message.id}
                  message={message}
                  isLastMessage={false}
                  showJobLogsLink={showJobLogsLink}
                  showSpinner={false}
                  urlPrefix={urlPrefix}
                />
              ))}
            </div>
          )}
          {activeMessages.length > 0 && <hr className="my-2" />}
        </div>
      )}
      {activeMessages.map((message, index) => {
        const isLastMessage = index === activeMessages.length - 1;
        return (
          <Message
            key={message.id}
            message={message}
            isLastMessage={isLastMessage}
            showJobLogsLink={showJobLogsLink}
            showSpinner={showSpinner}
            urlPrefix={urlPrefix}
          />
        );
      })}
    </>
  );
}

/**
 * This custom error is used to signal that a rate limit has been exceeded, which
 * we'll know happens when we get a 429 response from the server.
 */
class RateLimitError extends Error {}

function useShowSpinner({
  status,
  messages,
}: {
  status: string;
  messages: QuestionGenerationUIMessage[];
}) {
  const [timerElapsed, setTimerElapsed] = useState(false);

  const isActive = status === 'streaming' || status === 'submitted';

  // The effect manages the timeout: it resets and starts a new timer when dependencies change.
  useEffect(() => {
    // eslint-disable-next-line react-you-might-not-need-an-effect/no-adjust-state-on-prop-change, @eslint-react/hooks-extra/no-direct-set-state-in-use-effect
    setTimerElapsed(false);

    if (!isActive) return;

    const id = setTimeout(() => setTimerElapsed(true), 800);
    return () => clearTimeout(id);
  }, [isActive, messages]);

  // Derive whether to show the spinner from current state.
  if (!isActive || !timerElapsed) return false;

  const lastMessage = messages.at(-1);
  const lastPart = lastMessage?.parts.at(-1);

  // Show spinner when:
  // 1. We have no parts yet (waiting for first response), or
  // 2. We have an empty reasoning part (thinking started but no text yet)
  // In all other cases, we have visible content so no spinner needed.
  return !lastPart || (lastPart.type === 'reasoning' && !lastPart.text);
}

export function AiQuestionGenerationChat({
  chatCsrfToken,
  initialMessages,
  questionId,
  showJobLogsLink,
  urlPrefix,
  refreshQuestionPreview,
  onGeneratingChange,
  onGenerationComplete,
  hasUnsavedChanges,
  discardUnsavedChanges,
  isQuestionEmpty,
}: {
  chatCsrfToken: string;
  initialMessages: QuestionGenerationUIMessage[];
  questionId: string;
  showJobLogsLink: boolean;
  urlPrefix: string;
  refreshQuestionPreview: () => void;
  onGeneratingChange?: (isGenerating: boolean) => void;
  onGenerationComplete?: () => void;
  hasUnsavedChanges: boolean;
  discardUnsavedChanges: () => void;
  isQuestionEmpty: boolean;
}) {
  const [refreshQuestionPreviewAfterChanges, setRefreshQuestionPreviewAfterChanges] =
    useState(true);
  const [showUnsavedChangesModal, setShowUnsavedChangesModal] = useState(false);
  const [promptInput, setPromptInput] = useState('');
  const prevIsGeneratingRef = useRef<boolean | null>(null);
  const { messages, sendMessage, status, error } = useChat<QuestionGenerationUIMessage>({
    // Currently, we assume one chat per question. This should change in the future.
    id: questionId,
    messages: initialMessages,
    resume: true,
    transport: new DefaultChatTransport({
      api: `${urlPrefix}/ai_generate_editor/${questionId}/chat`,
      headers: { 'X-CSRF-Token': chatCsrfToken },
      prepareSendMessagesRequest: ({ messages, headers }) => {
        // Only send the latest message to the server. The server sources
        // conversation context from the database, so we don't need to
        // send the full history.
        const lastMessage = messages.at(-1);
        return {
          body: { message: lastMessage ?? null },
          headers,
        };
      },
      prepareReconnectToStreamRequest: ({ id }) => {
        return {
          api: `${urlPrefix}/ai_generate_editor/${id}/chat/stream`,
        };
      },
      async fetch(input, init) {
        const res = await fetch(input, init);
        if (res.status === 429) {
          throw new RateLimitError();
        }
        return res;
      },
    }),
    // Limit the frequency of updates to avoid overwhelming React. This approach
    // was recommended on https://github.com/vercel/ai/issues/6166.
    experimental_throttle: 100,
    onFinish({ messages, message }) {
      // We receive this event on page load, even when there's no active streaming in progress.
      // In that case, we want to avoid immediately loading a new variant.
      //
      // TODO: is there a better way to detect this case? We could watch for changes to
      // the `status` signal.
      const isExistingMessage =
        messages.length === initialMessages.length &&
        message.parts.length === initialMessages.at(-1)?.parts.length;
      if (isExistingMessage) return;

      const didWriteFile = message.parts.some((part) => {
        return (
          isToolPart(part) && part.type === 'tool-writeFile' && part.state === 'output-available'
        );
      });

      if (didWriteFile && refreshQuestionPreviewAfterChanges) {
        refreshQuestionPreview();
      }
    },
    onError(error) {
      console.error('Chat error:', error);
    },
  });

  const isGenerating = status === 'streaming' || status === 'submitted';

  // Notify parent of generation state changes.
  // We need to use an effect here because `useChat` doesn't provide callbacks for
  // status changes, only for message completion. The parent needs to know about
  // the generating state to control read-only mode on editors.
  useEffect(() => {
    // Skip initial render
    if (prevIsGeneratingRef.current === null) {
      prevIsGeneratingRef.current = isGenerating;
      // If we're already generating on mount (e.g., resuming a stream), notify parent

      // eslint-disable-next-line react-you-might-not-need-an-effect/no-event-handler
      if (isGenerating) {
        onGeneratingChange?.(true);
      }
      return;
    }

    // eslint-disable-next-line react-you-might-not-need-an-effect/no-event-handler
    if (prevIsGeneratingRef.current !== isGenerating) {
      prevIsGeneratingRef.current = isGenerating;
      // eslint-disable-next-line react-you-might-not-need-an-effect/no-pass-data-to-parent, react-you-might-not-need-an-effect/no-pass-live-state-to-parent
      onGeneratingChange?.(isGenerating);

      // If generation just finished, call the completion callback

      // eslint-disable-next-line react-you-might-not-need-an-effect/no-event-handler
      if (!isGenerating) {
        onGenerationComplete?.();
      }
    }
  }, [isGenerating, onGeneratingChange, onGenerationComplete]);

  const showSpinner = useShowSpinner({ status, messages });

  const containerRef = useRef<HTMLDivElement>(null);
  const resizerRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useStickToBottom({
    initial: 'smooth',
    // The experience with animated collapsible sections is currently janky.
    // Ideally a fix to this comment would allow us to improve things:
    // https://github.com/stackblitz-labs/use-stick-to-bottom/issues/19#issuecomment-3457630069
    resize: 'smooth',
  });

  // Chat width resizing
  useEffect(() => {
    const container = containerRef.current?.closest<HTMLElement>('.app-container');
    const resizer = resizerRef.current;

    if (!container || !resizer) return;

    const minWidth = 260;
    const maxWidth = 800;
    let startX = 0;
    let startWidth = 0;

    const onMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - startX;
      const newWidth = Math.min(maxWidth, Math.max(minWidth, startWidth - dx));
      container.style.setProperty('--chat-width', `${newWidth}px`);
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.classList.remove('user-select-none');
    };

    const onMouseDown = (e: MouseEvent) => {
      startX = e.clientX;
      const styles = getComputedStyle(container);
      const current = styles.getPropertyValue('--chat-width').trim() || '500px';
      startWidth =
        Number.parseInt(current) || containerRef.current?.getBoundingClientRect().width || 500;
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      document.body.classList.add('user-select-none');
    };

    resizer.addEventListener('mousedown', onMouseDown);

    return () => {
      resizer.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  const hasMessages = messages.length > 0;

  return (
    <div className="app-chat-container">
      <div ref={containerRef} className="app-chat px-2 pb-2 bg-light border-start">
        <div
          className={clsx('app-chat-history', {
            'd-flex align-items-center justify-content-center': !hasMessages,
          })}
        >
          {hasMessages ? (
            <div ref={stickToBottom.scrollRef} className="overflow-y-auto w-100 h-100 pe-2">
              <div ref={stickToBottom.contentRef} className="pt-2">
                <Messages
                  messages={messages}
                  urlPrefix={urlPrefix}
                  showJobLogsLink={showJobLogsLink}
                  showSpinner={showSpinner}
                />
              </div>
            </div>
          ) : (
            <div
              className="d-inline-flex align-items-center justify-content-center rounded-circle bg-primary bg-opacity-10"
              style={{ width: '3rem', height: '3rem' }}
            >
              <i
                className="bi bi-stars text-primary"
                style={{ fontSize: '1.1rem' }}
                aria-hidden="true"
              />
            </div>
          )}

          <ScrollToBottomButton
            isAtBottom={stickToBottom.isAtBottom}
            scrollToBottom={stickToBottom.scrollToBottom}
          />
        </div>

        <div className="app-chat-prompt mt-2">
          {error && (
            <div className="alert alert-danger mb-2" role="alert">
              {run(() => {
                if (error instanceof RateLimitError) {
                  return 'Rate limit exceeded. Please try again later.';
                }
                return 'An error occurred. Please try again.';
              })}
            </div>
          )}
          <PromptInput
            value={promptInput}
            disabled={status !== 'ready' && status !== 'error'}
            isGenerating={isGenerating}
            refreshQuestionPreviewAfterChanges={refreshQuestionPreviewAfterChanges}
            setRefreshQuestionPreviewAfterChanges={setRefreshQuestionPreviewAfterChanges}
            placeholder={
              isQuestionEmpty ? 'Describe the question you want to create...' : 'Ask anything...'
            }
            onChange={setPromptInput}
            onSubmit={(text) => {
              if (hasUnsavedChanges) {
                setShowUnsavedChangesModal(true);
              } else {
                void sendMessage({ text });
                void stickToBottom.scrollToBottom();
                setPromptInput('');
              }
            }}
            onStop={async () => {
              await fetch(`${urlPrefix}/ai_generate_editor/${questionId}/chat/cancel`, {
                method: 'POST',
                headers: { 'X-CSRF-Token': chatCsrfToken },
              });
            }}
          />
        </div>
        <div
          ref={resizerRef}
          className="app-chat-resizer"
          aria-label="Resize chat"
          role="separator"
        />
      </div>

      <Modal show={showUnsavedChangesModal} onHide={() => setShowUnsavedChangesModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Unsaved changes</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p>
            You have unsaved changes to the question files. If you continue, your changes will be
            discarded when the AI updates the files.
          </p>
        </Modal.Body>
        <Modal.Footer>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setShowUnsavedChangesModal(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setShowUnsavedChangesModal(false);
              // Immediately discard the unsaved changes so the user sees the
              // editor state revert to the last saved version.
              discardUnsavedChanges();
              const text = promptInput.trim();
              if (text) {
                void sendMessage({ text });
                void stickToBottom.scrollToBottom();
                setPromptInput('');
              }
            }}
          >
            Continue anyway
          </button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}

AiQuestionGenerationChat.displayName = 'AiQuestionGenerationChat';
