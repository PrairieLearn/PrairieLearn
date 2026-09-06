import { type ReactNode, useSyncExternalStore } from 'react';

import { formatDateFriendly } from '@prairielearn/formatter';

const noopSubscribe = () => () => {};

/** Render after hydration so relative date labels cannot mismatch across the SSR boundary. */
function MessageTimestamp({ createdAt, timeZone }: { createdAt: string; timeZone: string }) {
  const isClient = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  if (!isClient) return null;

  const formatted = formatDateFriendly(new Date(createdAt), timeZone, {
    maxPrecision: 'minute',
    minPrecision: 'minute',
  });

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
  timeZone,
}: {
  children: ReactNode;
  userName?: string | null;
  createdAt?: string;
  timeZone: string;
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
      <MessageMetadata
        author={userName ?? 'Unknown user'}
        createdAt={createdAt}
        timeZone={timeZone}
      />
    </div>
  );
}
export function MessageMetadata({
  author,
  createdAt,
  timeZone,
}: {
  author: string;
  createdAt?: string;
  timeZone: string;
}) {
  return (
    <div className="d-flex flex-wrap align-items-center gap-2 small text-muted mb-1 px-1">
      <span className="fw-medium">{author}</span>
      {createdAt && <MessageTimestamp createdAt={createdAt} timeZone={timeZone} />}
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
