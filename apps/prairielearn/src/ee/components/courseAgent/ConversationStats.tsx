import { useEffect, useState } from 'react';
import { Dropdown } from 'react-bootstrap';

import type { ConversationState } from '@prairielearn/course-agent-types';

import { formatMilliDollars } from '../../../lib/ai-grading-credits.js';
import type { StaffCourseAgentConversation } from '../../../lib/client/safe-db-types.js';

export function ConversationStats({
  state,
  usage,
}: {
  state: ConversationState | null;
  usage: StaffCourseAgentConversation;
}) {
  const [show, setShow] = useState(false);
  return (
    <Dropdown drop="up" show={show} autoClose="outside" onToggle={setShow}>
      <Dropdown.Toggle variant="outline-secondary" size="sm">
        Stats
      </Dropdown.Toggle>
      {show && (
        <Dropdown.Menu align="end" className="p-3 text-nowrap">
          <dl className="mb-0">
            <dt>State</dt>
            <dd>{state?.status ?? 'Connecting'}</dd>
            <dt>Time to next deadline</dt>
            <dd>
              <DeadlineCountdown key={state?.deadlineAt} deadlineAt={state?.deadlineAt ?? null} />
            </dd>
            <dt>Input tokens</dt>
            <dd>{usage.usage_input_tokens.toLocaleString()}</dd>
            <dt>Cached input tokens</dt>
            <dd>{usage.usage_input_tokens_cache_read.toLocaleString()}</dd>
            <dt>Output tokens</dt>
            <dd>{usage.usage_output_tokens.toLocaleString()}</dd>
            <dt>Reasoning tokens</dt>
            <dd>{usage.usage_output_tokens_reasoning.toLocaleString()}</dd>
            <dt>Model cost</dt>
            <dd className="mb-0">{formatMilliDollars(usage.usage_cost_milli_dollars)}</dd>
          </dl>
        </Dropdown.Menu>
      )}
    </Dropdown>
  );
}

function DeadlineCountdown({ deadlineAt }: { deadlineAt: string | null }) {
  const [now, setNow] = useState(Date.now);
  // Recalculate from the absolute deadline so delayed browser timers do not accumulate drift.
  useEffect(() => {
    if (!deadlineAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [deadlineAt]);
  if (!deadlineAt) return <>No deadline</>;
  return <>{Math.max(0, Math.ceil((Date.parse(deadlineAt) - now) / 1000))} seconds</>;
}
