import { useEffect, useState } from 'react';
import { Alert, Button } from 'react-bootstrap';

import type { ConversationState } from '@prairielearn/course-agent-types';
import { formatIntervalMinutes } from '@prairielearn/formatter';

const blockedMessage = {
  budget_exhausted: 'Hourly AI usage limit reached.',
  access_revoked:
    'You no longer have access to run the course agent in this course. If your access is restored, Resume to continue.',
  startup_failed:
    'The course agent could not start. Resume to clear the incomplete setup, then send a new message.',
  runtime_failed:
    "The course agent was interrupted. It may have made some changes, and its reply may be incomplete. Resume to continue; your previous message won't run again.",
  checkpoint_failed:
    "The course agent couldn't pause. Resume to try again; its changes are still there.",
  cleanup_failed: 'The course agent paused, but cleanup did not finish. Resume to finish cleanup.',
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
  return (
    <Alert variant="warning">
      <p>
        {blockedMessage[state.reason]}{' '}
        {retryAt &&
          (remaining > 0
            ? `You can retry in ${formatIntervalMinutes(remaining)}.`
            : 'You can now retry.')}
      </p>
      <Button
        variant="outline-dark"
        size="sm"
        disabled={disabled || remaining > 0}
        onClick={onResume}
      >
        Resume
      </Button>
    </Alert>
  );
}
