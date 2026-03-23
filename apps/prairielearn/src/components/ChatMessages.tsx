import type { ReactNode } from 'react';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export function Message({ message }: { message: ChatMessage }) {
  if (message.role === 'user') {
    return (
      <div className="d-flex flex-row-reverse mb-3">
        <div
          className="d-flex flex-column gap-2 p-3 rounded bg-secondary-subtle"
          style={{ maxWidth: '90%', whiteSpace: 'pre-wrap' }}
        >
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="d-flex flex-column gap-2 mb-3">
      <div style={{ whiteSpace: 'pre-wrap' }}>{message.content}</div>
    </div>
  );
}

export function Messages({
  messages,
  renderAfterMessage,
}: {
  messages: ChatMessage[];
  renderAfterMessage?: (message: ChatMessage) => ReactNode;
}) {
  return (
    <>
      {messages.map((message) => (
        <div key={message.id}>
          <Message message={message} />
          {renderAfterMessage?.(message)}
        </div>
      ))}
    </>
  );
}
