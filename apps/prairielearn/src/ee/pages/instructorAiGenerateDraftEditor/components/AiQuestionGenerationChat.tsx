import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type ToolUIPart, type UIMessage } from 'ai';
import { useEffect, useRef, useState } from 'preact/hooks';
import Markdown from 'react-markdown';

import { run } from '@prairielearn/run';

import type {
  QuestionGenerationToolUIPart,
  QuestionGenerationUIMessage,
} from '../../../lib/ai-question-generation/agent.types.js';

function isToolPart(part: UIMessage['parts'][0]): part is ToolUIPart {
  return part.type.startsWith('tool-');
}

function ToolCallStatus({
  state,
  statusText,
  children,
}: {
  state: ToolUIPart['state'];
  statusText: preact.ComponentChildren;
  children?: preact.ComponentChildren;
}) {
  return (
    <div class="border rounded p-2">
      <div class="d-flex flex-row align-items-center gap-2">
        {run(() => {
          if (state === 'input-streaming' || state === 'input-available') {
            return (
              <div class="spinner-border spinner-border-sm text-primary" role="status">
                <span class="visually-hidden">Loading...</span>
              </div>
            );
          } else if (state === 'output-available') {
            return <i class="bi bi-check-circle-fill text-success" aria-hidden="true" />;
          } else {
            return <i class="bi bi-x-circle-fill text-danger" aria-hidden="true" />;
          }
        })}
        <span>{statusText}</span>
      </div>
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

function MessageParts({ parts }: { parts: QuestionGenerationUIMessage['parts'] }) {
  return parts.map((part, index) => {
    const key = `part-${index}`;
    if (isToolPart(part)) {
      return <ToolCall key={key} part={part} />;
    } else if (part.type === 'text') {
      return (
        <div key={key} class="markdown-body">
          <Markdown>{part.text}</Markdown>
        </div>
      );
    } else if (part.type === 'reasoning') {
      if (!part.text) return '';
      return (
        <div key={key} class="d-flex flex-column gap-2 border rounded p-2">
          <div class="d-flex flex-row gap-2 mb-1">
            <i class="bi bi-lightbulb" aria-hidden="true" />
            <span>Thinking...</span>
          </div>

          <div class="markdown-body">
            <Markdown>{part.text}</Markdown>
          </div>
        </div>
      );
    } else if (['reasoning', 'step-start'].includes(part.type)) {
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

function Messages({
  messages,
  urlPrefix,
}: {
  messages: QuestionGenerationUIMessage[];
  urlPrefix: string;
}) {
  return messages.map((message) => {
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
      // TODO: strongly type metadata.
      const metadata: any = message.metadata;
      const job_sequence_id = metadata?.job_sequence_id;
      if (!job_sequence_id) return null;

      return urlPrefix + '/jobSequence/' + job_sequence_id;
    });

    return (
      <div key={message.id} class="d-flex flex-column gap-2 mb-3">
        <MessageParts parts={message.parts} />
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

export function AiQuestionGenerationChat({
  initialMessages,
  questionId,
  urlPrefix,
  csrfToken,
}: {
  initialMessages: QuestionGenerationUIMessage[];
  questionId: string;
  urlPrefix: string;
  csrfToken: string;
}) {
  const { messages, sendMessage, status } = useChat<QuestionGenerationUIMessage>({
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
    }),
  });

  const [input, setInput] = useState('');
  const chatHistoryRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const resizerRef = useRef<HTMLDivElement>(null);
  const isUserAtBottomRef = useRef(true);

  // Track whether the user is at the bottom via scroll events
  useEffect(() => {
    const el = chatHistoryRef.current;
    if (!el) return;

    const updateIsAtBottom = () => {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 10;
      isUserAtBottomRef.current = atBottom;
    };

    // Initialize on mount
    updateIsAtBottom();

    el.addEventListener('scroll', updateIsAtBottom, { passive: true });
    return () => {
      el.removeEventListener('scroll', updateIsAtBottom);
    };
  }, []);

  // Auto-scroll only when the user is already at the bottom
  useEffect(() => {
    const el = chatHistoryRef.current;
    if (!el) return;

    // Defer to next animation frame to ensure layout is updated
    const id = requestAnimationFrame(() => {
      if (isUserAtBottomRef.current) {
        el.scrollTop = el.scrollHeight;
      }
    });

    return () => cancelAnimationFrame(id);
  }, [messages]);

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

  return (
    <div ref={containerRef} class="app-chat px-2 pb-2 bg-light border-end">
      <div ref={chatHistoryRef} class="app-chat-history pt-2">
        <Messages messages={messages} urlPrefix={urlPrefix} />
      </div>
      <div class="app-chat-prompt mt-2">
        <form
          class="js-revision-form"
          onSubmit={(e) => {
            e.preventDefault();
            const trimmedInput = input.trim();
            if (trimmedInput) {
              void sendMessage({ text: trimmedInput });
              setInput('');
            }
          }}
        >
          <textarea
            id="user-prompt-llm"
            class="form-control mb-2"
            placeholder="What would you like to revise?"
            aria-label="Modification instructions"
            value={input}
            required
            onInput={(e) => setInput((e.target as HTMLTextAreaElement).value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.closest('form')?.requestSubmit();
              }
            }}
          />
          <button type="submit" class="btn btn-dark w-100" disabled={status !== 'ready'}>
            Revise question
          </button>
          <div class="text-muted small text-center mt-1">
            AI can make mistakes. Review the generated question.
          </div>
        </form>
      </div>
      <div ref={resizerRef} class="app-chat-resizer" aria-label="Resize chat" role="separator" />
    </div>
  );
}

AiQuestionGenerationChat.displayName = 'AiQuestionGenerationChat';
