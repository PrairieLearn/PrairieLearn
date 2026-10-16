import type { ReactNode } from 'react';

import { run } from '@prairielearn/run';

export function ActivityStatus({
  state,
  statusText,
  showSpinner,
}: {
  state: 'streaming' | 'success' | 'error';
  statusText: ReactNode;
  showSpinner?: boolean;
}) {
  return (
    // Screen-reader announcements are handled centrally by the persistent live
    // region in AiQuestionGenerationChat. These per-instance elements
    // mount/unmount per tool call, so a fresh live region here would not
    // announce reliably.
    <div className="d-flex flex-row align-items-center gap-1 small text-muted">
      {run(() => {
        if (state === 'streaming' || showSpinner) {
          return <div className="spinner-border spinner-border-text" aria-hidden="true" />;
        } else if (state === 'success') {
          return <i className="bi bi-fw bi-check-lg text-success" aria-hidden="true" />;
        } else {
          return <i className="bi bi-fw bi-x text-danger" aria-hidden="true" />;
        }
      })}
      <span>{statusText}</span>
    </div>
  );
}
