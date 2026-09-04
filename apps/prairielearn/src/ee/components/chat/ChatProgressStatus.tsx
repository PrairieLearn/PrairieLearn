import type { ToolUIPart } from 'ai';
import type { ReactNode } from 'react';

import { run } from '@prairielearn/run';
import { assertNever } from '@prairielearn/utils';

export function ProgressStatus({
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
    <div className="d-flex flex-row align-items-start gap-1 small text-muted">
      {run(() => {
        if (state === 'streaming' || showSpinner) {
          return (
            <div className="spinner-border spinner-border-sm flex-shrink-0" aria-hidden="true" />
          );
        } else if (state === 'success') {
          return (
            <i className="bi bi-fw bi-check-lg text-success flex-shrink-0" aria-hidden="true" />
          );
        } else {
          return <i className="bi bi-fw bi-x text-danger flex-shrink-0" aria-hidden="true" />;
        }
      })}
      <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{statusText}</span>
    </div>
  );
}

export function ToolCallStatus({
  state,
  statusText,
  showSpinner,
  children,
}: {
  state: Exclude<
    ToolUIPart['state'],
    'approval-requested' | 'approval-responded' | 'output-denied' | undefined
  >;
  statusText: ReactNode;
  showSpinner?: boolean;
  children?: ReactNode;
}) {
  return (
    <div>
      <ProgressStatus
        state={run(() => {
          switch (state) {
            case 'input-streaming':
            case 'input-available':
              return 'streaming';
            case 'output-available':
              return 'success';
            case 'output-error':
              return 'error';
            default:
              assertNever(state);
          }
        })}
        statusText={statusText}
        showSpinner={showSpinner}
      />
      <div>{children}</div>
    </div>
  );
}
