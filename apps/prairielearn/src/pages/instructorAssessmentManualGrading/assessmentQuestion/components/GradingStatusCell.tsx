import { OverlayTrigger } from '@prairielearn/ui';
import { assertNever } from '@prairielearn/utils';

import { JobItemStatus } from '../../../../lib/serverJobProgressSocket.shared.js';

export function GradingStatusCell({
  aiGradingMode,
  requiresGrading,
  instanceQuestionId,
  displayedStatuses,
}: {
  aiGradingMode: boolean;
  requiresGrading: boolean;
  instanceQuestionId: string;
  displayedStatuses: Record<string, JobItemStatus | undefined>;
}) {
  const aiGradingStatus = displayedStatuses[instanceQuestionId];
  if (!aiGradingMode || aiGradingStatus === undefined) {
    return requiresGrading ? 'Requires grading' : 'Graded';
  }
  return <AiGradingStatusCell rowId={instanceQuestionId} aiGradingStatus={aiGradingStatus} />;
}

/**
 * In the manual instance question grading table,
 * when an instance question is being AI graded,
 * this cell displays its grading status.
 */
function AiGradingStatusCell({
  rowId,
  aiGradingStatus,
}: {
  rowId: string;
  aiGradingStatus: JobItemStatus;
}) {
  switch (aiGradingStatus) {
    case JobItemStatus.queued:
      return (
        <OverlayTrigger
          tooltip={{
            body: 'AI grading queued',
            props: { id: `ai-status-${rowId}-queued-tooltip` },
          }}
        >
          <span className="d-flex align-items-center gap-2">
            <i className="bi bi-clock text-secondary" aria-hidden="true" />
            <span>Queued</span>
          </span>
        </OverlayTrigger>
      );
    case JobItemStatus.in_progress:
      return (
        <OverlayTrigger
          tooltip={{
            body: 'AI grading in progress',
            props: { id: `ai-status-${rowId}-progress-tooltip` },
          }}
        >
          <span className="d-flex align-items-center gap-2">
            <div className="spinner-grow spinner-grow-sm text-secondary bg-secondary" role="status">
              <span className="visually-hidden">Loading...</span>
            </div>
            <span>AI grading...</span>
          </span>
        </OverlayTrigger>
      );
    case JobItemStatus.failed:
      return (
        <OverlayTrigger
          tooltip={{
            body: 'AI grading failed',
            props: { id: `ai-status-${rowId}-failed-tooltip` },
          }}
        >
          <span className="d-flex align-items-center gap-2">
            <i className="bi bi-exclamation-octagon-fill text-danger" aria-hidden="true" />
            <span>Failed</span>
          </span>
        </OverlayTrigger>
      );
    case JobItemStatus.complete:
      return (
        <OverlayTrigger
          tooltip={{
            body: 'AI grading completed successfully',
            props: { id: `ai-status-${rowId}-success-tooltip` },
          }}
        >
          <span className="d-flex align-items-center gap-2">
            <i className="bi bi-check-circle-fill text-success" aria-hidden="true" />
            <span>Graded</span>
          </span>
        </OverlayTrigger>
      );
    default:
      assertNever(aiGradingStatus);
  }
}
