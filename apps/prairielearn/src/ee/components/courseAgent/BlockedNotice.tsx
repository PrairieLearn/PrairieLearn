import { useEffect, useState } from 'react';
import { Alert, Button } from 'react-bootstrap';

import type { ConversationState } from '@prairielearn/course-agent-types';
import { formatIntervalMinutes } from '@prairielearn/formatter';

const blockedMessage = {
  usage_limit: "You've reached the hourly AI usage limit.",
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
  const retryAt = state.reason === 'usage_limit' ? state.retryAt : undefined;
  // Derive the countdown from the persisted deadline so refreshes and background tabs stay accurate.
  useEffect(() => {
    if (!retryAt) return;
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= Date.parse(retryAt)) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [retryAt]);
  const remaining = retryAt ? Math.max(0, Date.parse(retryAt) - now) : 0;
  return (
    <Alert variant="warning">
      <p>
        {retryAt && remaining === 0
          ? 'The hourly AI usage limit has reset.'
          : blockedMessage[state.reason]}
        {retryAt && remaining > 0 && ` It resets in ${formatIntervalMinutes(remaining)}.`}
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
