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
  // Once AI grading completes, show the actual grading status so that later
  // changes (e.g. tagging the submission for human review) are reflected.
  if (
    !aiGradingMode ||
    aiGradingStatus === undefined ||
    aiGradingStatus === JobItemStatus.complete
  ) {
    return requiresGrading ? 'Requires grading' : 'Graded';
  }
  return <AiGradingStatusCell aiGradingStatus={aiGradingStatus} />;
}

/**
 * In the manual instance question grading table,
 * when an instance question is being AI graded,
 * this cell displays its grading status.
 */
function AiGradingStatusCell({
  aiGradingStatus,
}: {
  aiGradingStatus: Exclude<JobItemStatus, JobItemStatus.complete>;
}) {
  switch (aiGradingStatus) {
    case JobItemStatus.queued:
      return (
        <span className="d-flex align-items-center gap-2">
          <i className="bi bi-clock text-secondary" aria-hidden="true" />
          <span>Queued for AI grading</span>
        </span>
      );
    case JobItemStatus.in_progress:
      return (
        <span className="d-flex align-items-center gap-2">
          <div className="spinner-grow spinner-grow-sm text-secondary bg-secondary" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
          <span>AI grading...</span>
        </span>
      );
    case JobItemStatus.failed:
      return (
        <span className="d-flex align-items-center gap-2">
          <i className="bi bi-exclamation-octagon-fill text-danger" aria-hidden="true" />
          <span>AI grading failed</span>
        </span>
      );
    default:
      assertNever(aiGradingStatus);
  }
}
