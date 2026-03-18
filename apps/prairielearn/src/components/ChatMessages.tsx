import type { ReactNode } from 'react';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  parts: ChatMessagePart[];
}

export type ChatMessagePart =
  | {
      type: 'text';
      text: string;
    }
  | {
      type: 'tool';
      state: 'streaming' | 'success' | 'error';
      text: ReactNode;
    };

function ProgressStatus({
  state,
  statusText,
}: {
  state: 'streaming' | 'success' | 'error';
  statusText: ReactNode;
}) {
  return (
    <div className="d-flex flex-row align-items-center gap-1 small text-muted">
      {state === 'streaming' ? (
        <div className="spinner-border spinner-border-text" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      ) : state === 'success' ? (
        <i className="bi bi-fw bi-check-lg text-success" aria-hidden="true" />
      ) : (
        <i className="bi bi-fw bi-x text-danger" aria-hidden="true" />
      )}
      <span>{statusText}</span>
    </div>
  );
}

export function Message({ message }: { message: ChatMessage }) {
  if (message.role === 'user') {
    const textContent = message.parts
      .filter((part): part is Extract<ChatMessagePart, { type: 'text' }> => part.type === 'text')
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

  const keyCounts = new Map<string, number>();

  return (
    <div className="d-flex flex-column gap-2 mb-3">
      {message.parts.map((part) => {
        const signature =
          part.type === 'text'
            ? `text-${part.text}`
            : `tool-${part.state}-${typeof part.text === 'string' ? part.text : 'status'}`;
        const count = (keyCounts.get(signature) ?? 0) + 1;
        keyCounts.set(signature, count);
        const key = `${signature}-${count}`;
        if (part.type === 'text') {
          return (
            <div key={key} style={{ whiteSpace: 'pre-wrap' }}>
              {part.text}
            </div>
          );
        }
        return <ProgressStatus key={key} state={part.state} statusText={part.text} />;
      })}
    </div>
  );
}

export function Messages({
  messages,
  renderAfterMessage,
  showWaitingIndicator,
}: {
  messages: ChatMessage[];
  renderAfterMessage?: (message: ChatMessage) => ReactNode;
  showWaitingIndicator?: boolean;
}) {
  return (
    <>
      {messages.map((message) => (
        <div key={message.id}>
          <Message message={message} />
          {renderAfterMessage?.(message)}
        </div>
      ))}
      {showWaitingIndicator && (
        <div className="mb-3">
          <ProgressStatus state="streaming" statusText="Working..." />
        </div>
      )}
    </>
  );
}
