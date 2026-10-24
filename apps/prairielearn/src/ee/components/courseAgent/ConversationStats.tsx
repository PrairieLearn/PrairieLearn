import { useEffect, useState } from 'react';
import { Dropdown } from 'react-bootstrap';

import type { ConversationState } from '@prairielearn/course-agent-types';

export function ConversationStats({ state }: { state: ConversationState | null }) {
  const [show, setShow] = useState(false);
  return (
    <Dropdown drop="up" show={show} autoClose="outside" onToggle={setShow}>
      <Dropdown.Toggle variant="outline-secondary" size="sm">
        Stats
      </Dropdown.Toggle>
      {show && (
        <Dropdown.Menu className="p-3 text-nowrap">
          <dl className="mb-0">
            <dt>State</dt>
            <dd>{state?.status ?? 'Connecting'}</dd>
            <dt>Time to next deadline</dt>
            <dd className="mb-0">
              <DeadlineCountdown key={state?.deadlineAt} deadlineAt={state?.deadlineAt ?? null} />
            </dd>
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
