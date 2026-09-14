import { type ReactNode, useSyncExternalStore } from 'react';

const noopSubscribe = () => () => {};

/**
 * Renders a message's timestamp in the viewer's local timezone, with a leading
 * separator. The server can't know the viewer's timezone, so we render nothing
 * during SSR and the initial hydration pass, then render once on the client.
 * This avoids a hydration mismatch without an effect, and keeps the separator
 * from dangling while the timestamp is absent.
 */
function MessageTimestamp({ createdAt }: { createdAt: string }) {
  const isClient = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  if (!isClient) return null;

  const formatted = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(createdAt));

  return (
    <>
      <span aria-hidden="true">&middot;</span>
      <time dateTime={createdAt} style={{ fontVariantNumeric: 'tabular-nums' }}>
        {formatted}
      </time>
    </>
  );
}

export function UserMessage({
  children,
  userName,
  createdAt,
}: {
  children: ReactNode;
  userName?: string | null;
  createdAt?: string;
}) {
  return (
    <div
      className="d-flex flex-column align-items-end mb-3"
      role="article"
      aria-label={`Message from ${userName ?? 'you'}`}
    >
      <div
        className="d-flex flex-column gap-2 p-3 rounded bg-secondary-subtle"
        style={{ maxWidth: '90%', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
      >
        {children}
      </div>
      <MessageMetadata author={userName ?? 'Unknown user'} createdAt={createdAt} />
    </div>
  );
}
export function MessageMetadata({ author, createdAt }: { author: string; createdAt?: string }) {
  return (
    <div className="d-flex flex-wrap align-items-center gap-2 small text-muted mb-1 px-1">
      <span className="fw-medium">{author}</span>
      {createdAt && <MessageTimestamp createdAt={createdAt} />}
    </div>
  );
}
export function AssistantMessage({ children }: { children: ReactNode }) {
  return (
    <div
      className="d-flex flex-column gap-2 mb-3"
      role="article"
      aria-label="Message from PrairieLearn"
    >
      {children}
    </div>
  );
}
