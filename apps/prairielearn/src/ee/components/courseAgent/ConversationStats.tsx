import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Dropdown } from 'react-bootstrap';

import type { ConversationState } from '@prairielearn/course-agent-types';

import { useTRPC } from '../../../trpc/course/context.js';

const currencyFormat = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});

export function ConversationStats({
  state,
  conversationId,
}: {
  state: ConversationState | null;
  conversationId: string;
}) {
  const [show, setShow] = useState(false);
  const trpc = useTRPC();
  // Usage is recorded every 30 seconds or so while the agent works, so refresh while open.
  const usage = useQuery({
    ...trpc.courseAgent.usage.queryOptions({ conversationId }),
    enabled: show,
    refetchInterval: show ? 5_000 : false,
  }).data;
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
            <dd>{usage?.input_tokens.toLocaleString() ?? 'Loading'}</dd>
            <dt>Cached input tokens</dt>
            <dd>{usage?.input_tokens_cache_read.toLocaleString() ?? 'Loading'}</dd>
            <dt>Output tokens</dt>
            <dd>{usage?.output_tokens.toLocaleString() ?? 'Loading'}</dd>
            <dt>Reasoning tokens</dt>
            <dd>{usage?.output_tokens_reasoning.toLocaleString() ?? 'Loading'}</dd>
            <dt>Model cost</dt>
            <dd className="mb-0">
              {usage ? currencyFormat.format(usage.cost_milli_dollars / 1000) : 'Loading'}
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
