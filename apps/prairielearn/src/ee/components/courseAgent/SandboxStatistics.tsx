import { useEffect, useState } from 'react';

import { type SandboxDiagnostics } from '@prairielearn/course-agent-contract';

import { formatCourseAgentDate } from '../../../lib/course-agent-date.js';

export function SandboxStatistics({
  diagnostics,
  timezone,
  newConversation,
}: {
  diagnostics?: SandboxDiagnostics;
  timezone: string;
  newConversation: boolean;
}) {
  const [now, setNow] = useState(Date.now);
  // Countdown ticks only while statistics are open; diagnostics come from the existing snapshot stream.
  useEffect(() => {
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(clock);
  }, []);

  function expiration(at: number | null | undefined) {
    if (at == null) return '—';
    const seconds = Math.max(0, Math.ceil((at - now) / 1000));
    return `${formatCourseAgentDate(new Date(at), timezone)} (${seconds ? `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m ${seconds % 60}s remaining` : 'due; awaiting cleanup'})`;
  }
  return (
    <dl aria-label="Sandbox diagnostics">
      <dt>Sandbox state</dt>
      <dd>
        <code>{diagnostics?.state ?? (newConversation ? 'absent' : 'Unavailable')}</code>
      </dd>
      <dt>Idle expiration</dt>
      <dd>{expiration(diagnostics?.idleExpiresAt)}</dd>
      <dt>Interaction expiration</dt>
      <dd>{expiration(diagnostics?.interactionExpiresAt)}</dd>
    </dl>
  );
}
