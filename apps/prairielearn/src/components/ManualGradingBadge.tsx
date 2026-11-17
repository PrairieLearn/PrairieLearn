import { renderHtml } from '@prairielearn/react';

import { getAssessmentManualGradingUrl } from '../lib/client/url.js';

function ManualGradingBadge({
  ungradedSubmissionCount,
  courseInstanceId,
  assessmentId,
}: {
  ungradedSubmissionCount: number;
  courseInstanceId: string;
  assessmentId: string;
}) {
  if (ungradedSubmissionCount === 0) return null;

  const label =
    ungradedSubmissionCount === 1
      ? '1 submission requires manual grading'
      : `${ungradedSubmissionCount} submissions require manual grading`;

  return (
    <a
      className="badge rounded-pill text-bg-primary ms-1"
      href={getAssessmentManualGradingUrl({ courseInstanceId, assessmentId })}
      data-bs-toggle="tooltip"
      data-bs-title={label}
      aria-label={label}
      data-testid="manual-grading-badge"
    >
      <i className="bi bi-pen-fill" aria-hidden="true" /> {ungradedSubmissionCount}
    </a>
  );
}

export function ManualGradingBadgeHtml(props: {
  ungradedSubmissionCount: number;
  courseInstanceId: string;
  assessmentId: string;
}) {
  return renderHtml(<ManualGradingBadge {...props} />);
}
