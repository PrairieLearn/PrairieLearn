import { useEffect, useState } from 'react';
import { Alert, Button } from 'react-bootstrap';

import type { ConversationState } from '@prairielearn/course-agent-types';
import { formatIntervalMinutes } from '@prairielearn/formatter';

const blockedMessage = {
  budget_exhausted: 'Hourly AI usage limit reached.',
  budget_unavailable: 'Could not reach the AI credit service. Resume to try again.',
  usage_unavailable:
    'Model usage could not be recorded. Your workspace is preserved. Contact support to recover this conversation.',
  access_revoked: 'You no longer have access to run the course agent in this course.',
  startup_failed:
    'Your workspace could not start. Resume to clear the incomplete setup, then send a new message.',
  runtime_failed:
    'The course agent was interrupted. Resume to recover and save your workspace. Your previous message will not run again.',
  checkpoint_failed: 'Your workspace could not be saved. Resume to try saving it again.',
  cleanup_failed: 'Your workspace is saved, but cleanup did not finish. Resume to finish cleanup.',
} satisfies Record<Extract<ConversationState, { status: 'blocked' }>['reason'], string>;

export function BlockedNotice({
  state,
  disabled,
  onResume,
}: {
  state: Extract<ConversationState, { status: 'blocked' }>;
  disabled: boolean;
  onResume: () => void;
}) {
  const [now, setNow] = useState(Date.now);
  const retryAt = state.reason === 'budget_exhausted' ? state.retryAt : undefined;
  // Derive the countdown from the persisted deadline so refreshes and background tabs stay accurate.
  useEffect(() => {
    if (!retryAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [retryAt]);
  const remaining = retryAt ? Math.max(0, Date.parse(retryAt) - now) : 0;
  const recoverable = !['usage_unavailable', 'access_revoked'].includes(state.reason);
  return (
    <Alert variant="warning">
      <p>
        {blockedMessage[state.reason]}{' '}
        {retryAt &&
          (remaining > 0
            ? `You can retry in ${formatIntervalMinutes(remaining)}.`
            : 'You can now retry.')}
      </p>
      {recoverable && (
        <Button
          variant="outline-dark"
          size="sm"
          disabled={disabled || remaining > 0}
          onClick={onResume}
        >
          Resume
        </Button>
      )}
    </Alert>
  );
}
