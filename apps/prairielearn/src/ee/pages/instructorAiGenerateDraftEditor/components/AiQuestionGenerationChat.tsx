import { useChat } from '@ai-sdk/react';
import { type Signal, useSignal } from '@preact/signals';
import { Show } from '@preact/signals/utils';
import {
  DefaultChatTransport,
  type ReasoningUIPart,
  type TextUIPart,
  type ToolUIPart,
  type UIMessage,
} from 'ai';
import clsx from 'clsx';
import { useEffect, useRef, useState } from 'preact/hooks';
import Markdown from 'react-markdown';
import { useStickToBottom } from 'use-stick-to-bottom';

import { run } from '@prairielearn/run';

import { assertNever } from '../../../../lib/types.js';
import type {
  QuestionGenerationToolUIPart,
  QuestionGenerationUIMessage,
} from '../../../lib/ai-question-generation/agent.types.js';

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
  statusText: preact.ComponentChildren;
  showSpinner?: boolean;
}) {
  return (
    <div class="d-flex flex-row align-items-center gap-1">
      {run(() => {
        if (state === 'streaming' || showSpinner) {
          return (
            <div class="spinner-border spinner-border-text" role="status">
              <span class="visually-hidden">Loading...</span>
            </div>
          );
        } else if (state === 'success') {
          return <i class="bi bi-fw bi-check-lg text-success" aria-hidden="true" />;
        } else {
          return <i class="bi bi-fw bi-x text-danger" aria-hidden="true" />;
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
  state: ToolUIPart['state'];
  statusText: preact.ComponentChildren;
  showSpinner?: boolean;
  children?: preact.ComponentChildren;
}) {
  return (
    <div class="small text-muted">
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
      {children}
    </div>
  );
}

function ToolCall({ part }: { part: QuestionGenerationToolUIPart }) {
  const toolName = part.type.slice('tool-'.length);

  const statusText = run(() => {
    if (part.type === 'tool-getElementDocumentation') {
      if (part.state === 'input-streaming') {
        return <span>Getting element documentation...</span>;
      } else if (part.state === 'input-available') {
        return (
          <span>
            Getting documentation for <code>&lt;{part.input.elementName}&gt;</code>...
          </span>
        );
      } else if (part.state === 'output-available') {
        return (
          <span>
            Got documentation for <code>&lt;{part.input.elementName}&gt;</code>
          </span>
        );
      } else {
        return <span>Error getting element documentation</span>;
      }
    }

    if (part.type === 'tool-listElementExamples') {
      if (part.state === 'input-streaming') {
        return <span>Listing element examples...</span>;
      } else if (part.state === 'input-available') {
        return (
          <span>
            Listing examples for <code>&lt;{part.input.elementName}&gt;</code>...
          </span>
        );
      } else if (part.state === 'output-available') {
        return (
          <span>
            Listed examples for <code>&lt;{part.input.elementName}&gt;</code>
          </span>
        );
      } else {
        return <span>Error listing element examples</span>;
      }
    }

    if (part.type === 'tool-getExampleQuestions') {
      const questionCount = part.input?.qids?.length || 0;
      const pluralQuestions = questionCount === 1 ? 'question' : 'questions';
      if (part.state === 'input-streaming') {
        return <span>Getting example questions...</span>;
      } else if (part.state === 'input-available') {
        return (
          <span>
            Getting {questionCount} example {pluralQuestions}...
          </span>
        );
      } else if (part.state === 'output-available') {
        return (
          <span>
            Got {questionCount} example {pluralQuestions}
          </span>
        );
      } else {
        return <span>Error getting example questions</span>;
      }
    }

    if (part.type === 'tool-writeFile') {
      if (part.state === 'input-streaming') {
        return <span>Writing file...</span>;
      } else if (part.state === 'input-available') {
        return (
          <span>
            Writing file <code>{part.input.path}</code>...
          </span>
        );
      } else if (part.state === 'output-available') {
        return (
          <span>
            Wrote file <code>{part.input.path}</code>
          </span>
        );
      } else {
        return (
          <span>
            Error writing file <code>{part.input?.path}</code>
          </span>
        );
      }
    }

    if (part.type === 'tool-readFile') {
      if (part.state === 'input-streaming') {
        return <span>Reading file...</span>;
      } else if (part.state === 'input-available') {
        return (
          <span>
            Reading file <code>{part.input.path}</code>...
          </span>
        );
      } else if (part.state === 'output-available') {
        return (
          <span>
            Read file <code>{part.input.path}</code>
          </span>
        );
      } else {
        return (
          <span>
            Error reading file <code>{part.input?.path}</code>
          </span>
        );
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (part.type === 'tool-saveAndValidateQuestion') {
      if (part.state === 'input-streaming') {
        return <span>Saving and validating question...</span>;
      } else if (part.state === 'input-available') {
        return <span>Saving and validating question...</span>;
      } else if (part.state === 'output-available') {
        // TODO: check output for validation results.
        return <span>Saved and validated question</span>;
      } else {
        return <span>Error saving and validating question</span>;
      }
    }

    return <span>{toolName}</span>;
  });

  return (
    <ToolCallStatus state={part.state} statusText={statusText}>
      {/* <>
        <pre>
          <code>{JSON.stringify(part.input, null, 2)}</code>
        </pre>
        {part.output && (
          <pre>
            <code>{JSON.stringify(part.output, null, 2)}</code>
          </pre>
        )}
      </> */}
    </ToolCallStatus>
  );
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
    <div class="d-flex flex-column gap-1 border rounded p-1 small">
      <button
        type="button"
        class="d-flex flex-row gap-2 align-items-center btn btn-link text-decoration-none p-0 text-start"
        aria-expanded={isExpanded}
        onClick={toggleExpanded}
      >
        <i
          class={clsx('bi small text-muted', {
            'bi-chevron-right': !isExpanded,
            'bi-chevron-down': isExpanded,
          })}
          aria-hidden="true"
        />
        <span class="small text-muted">{isStreaming ? 'Thinking...' : 'Reasoning'}</span>
      </button>

      {isExpanded && (
        <div class="markdown-body reasoning-body p-1 pt-0">
          <Markdown>{part.text}</Markdown>
        </div>
      )}
    </div>
  );
}

function TextPart({ part }: { part: TextUIPart }) {
  return (
    <div class="markdown-body">
      <Markdown>{part.text}</Markdown>
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
        class={clsx(
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
        <i class="bi bi-arrow-down-circle-fill lh-1" aria-hidden="true" />
      </button>
    )
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
  showSpinner: Signal<boolean>;
  urlPrefix: string;
}) {
  return messages.map((message, index) => {
    const isLastMessage = index === messages.length - 1;

    if (message.role === 'user') {
      return (
        <div key={message.id} class="d-flex flex-row-reverse mb-3">
          <div
            class="d-flex flex-column gap-2 p-3 rounded bg-secondary-subtle"
            style="max-width: 90%"
          >
            <MessageParts parts={message.parts} />
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
      <div key={message.id} class="d-flex flex-column gap-2 mb-3">
        <MessageParts parts={message.parts} />
        {isLastMessage && (
          <Show when={showSpinner}>
            <ProgressStatus state="streaming" statusText="Working..." />
          </Show>
        )}
        {jobLogsUrl && (
          <a class="small" href={jobLogsUrl} target="_blank">
            {' '}
            View job logs{' '}
          </a>
        )}
      </div>
    );
  });
}

class RateLimitError extends Error {}

function useShowSpinner({
  status,
  messages,
}: {
  status: string;
  messages: QuestionGenerationUIMessage[];
}) {
  const signal = useSignal<boolean>(false);

  // Queue a show of the spinner after a delay when messages change.
  useEffect(() => {
    if (status !== 'streaming' && status !== 'submitted') {
      signal.value = false;
      return;
    }

    // We sometimes get empty thinking parts. We don't want to hide the spinner
    // until we know that we're actually streaming thinking text.
    const lastMessage = messages.at(-1);
    const lastPart = lastMessage?.parts.at(-1);
    if (!lastPart || lastPart.type !== 'reasoning' || lastPart.text) {
      signal.value = false;
    }

    const id = setTimeout(() => {
      signal.value = true;
    }, 800);

    return () => clearTimeout(id);
  }, [signal, status, messages]);

  return signal;
}

export function AiQuestionGenerationChat({
  initialMessages,
  questionId,
  showJobLogsLink,
  urlPrefix,
  csrfToken,
}: {
  initialMessages: QuestionGenerationUIMessage[];
  questionId: string;
  showJobLogsLink: boolean;
  urlPrefix: string;
  csrfToken: string;
}) {
  const { messages, sendMessage, status, error } = useChat<QuestionGenerationUIMessage>({
    // Currently, we assume one chat per question. This should change in the future.
    id: questionId,
    messages: initialMessages,
    resume: true,
    transport: new DefaultChatTransport({
      api: `${urlPrefix}/ai_generate_editor/${questionId}/chat`,
      headers: { 'X-CSRF-Token': csrfToken },
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
    onError(error) {
      console.error('Chat error:', error);
    },
  });

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
      const newWidth = Math.min(maxWidth, Math.max(minWidth, startWidth + dx));
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
      const current = styles.getPropertyValue('--chat-width').trim() || '400px';
      startWidth =
        Number.parseInt(current) || containerRef.current?.getBoundingClientRect().width || 400;
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
    <div class="app-chat-container">
      <div ref={containerRef} class="app-chat px-2 pb-2 bg-light border-end">
        <div
          class={clsx('app-chat-history', {
            'd-flex align-items-center justify-content-center': !hasMessages,
          })}
        >
          {hasMessages ? (
            <div ref={stickToBottom.scrollRef} class="overflow-y-auto w-100 h-100 pe-2">
              <div ref={stickToBottom.contentRef} class="pt-2">
                <Messages
                  messages={messages}
                  urlPrefix={urlPrefix}
                  showJobLogsLink={showJobLogsLink}
                  showSpinner={showSpinner}
                />
              </div>
            </div>
          ) : (
            // If this is an old draft question that was using `ai_question_generation_prompts`,
            // we won't have any messages to display. That's fine, just warn the user.
            <div class="text-muted my-5">Message history unavailable.</div>
          )}

          <ScrollToBottomButton
            isAtBottom={stickToBottom.isAtBottom}
            scrollToBottom={stickToBottom.scrollToBottom}
          />
        </div>

        <div class="app-chat-prompt mt-2">
          {error && (
            <div class="alert alert-danger mb-2" role="alert">
              {run(() => {
                if (error instanceof RateLimitError) {
                  return 'Rate limit exceeded. Please try again later.';
                }
                return 'An error occurred. Please try again.';
              })}
            </div>
          )}
          <PromptInput
            sendMessage={(message: { text: string }) => {
              void sendMessage(message);
              void stickToBottom.scrollToBottom();
            }}
            disabled={status !== 'ready' && status !== 'error'}
          />
        </div>
        <div ref={resizerRef} class="app-chat-resizer" aria-label="Resize chat" role="separator" />
      </div>
    </div>
  );
}

AiQuestionGenerationChat.displayName = 'AiQuestionGenerationChat';
