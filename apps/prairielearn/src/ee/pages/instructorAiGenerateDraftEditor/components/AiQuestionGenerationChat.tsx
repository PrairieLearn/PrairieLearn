import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { useEffect, useRef, useState } from 'preact/hooks';

import { run } from '@prairielearn/run';

function MessageParts({ parts }: { parts: UIMessage['parts'] }) {
  return parts.map((part, index) => {
    const key = `part-${index}`;
    if (part.type.startsWith('tool-')) {
      const toolName = part.type.slice('tool-'.length);
      return (
        <div key={key} class="border rounded p-2">
          <i class="bi bi-tools me-2" aria-hidden="true" />
          <span class="font-monospace">{toolName}</span>
        </div>
      );
    } else if (part.type === 'text') {
      return (
        <p key={key} class="mb-0" style="white-space: pre-wrap;">
          {part.text}
        </p>
      );
    } else if (part.type === 'reasoning') {
      if (!part.text) return '';
      return (
        <div key={key} class="d-flex flex-column gap-2 border rounded p-2">
          <div class="d-flex flex-row gap-2 mb-1">
            <i class="bi bi-lightbulb" aria-hidden="true" />
            <span>Thinking...</span>
          </div>
          <p class="small mb-0" style="white-space: pre-wrap;">
            {part.text}
          </p>
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

function Messages({ messages, urlPrefix }: { messages: UIMessage[]; urlPrefix: string }) {
  return messages.map((message) => {
    if (message.role === 'user') {
      return (
        <div key={message.id} class="d-flex flex-row-reverse">
          <div
            class="d-flex flex-column gap-2 p-3 mb-2 rounded bg-secondary-subtle"
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
      <div key={message.id} class="d-flex flex-column gap-2">
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
  initialMessages: UIMessage[];
  questionId: string;
  urlPrefix: string;
  csrfToken: string;
}) {
  const { messages, sendMessage, status } = useChat({
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

  // Scroll to bottom on initial load and when messages change
  useEffect(() => {
    if (chatHistoryRef.current) {
      chatHistoryRef.current.scrollTop = chatHistoryRef.current.scrollHeight;
    }
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
    <div ref={containerRef} class="app-chat p-2 bg-light border-end">
      <div ref={chatHistoryRef} class="app-chat-history">
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
