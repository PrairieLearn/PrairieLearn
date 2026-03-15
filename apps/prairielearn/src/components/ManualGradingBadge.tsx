import { renderHtml } from '@prairielearn/react';

import { getAssessmentManualGradingUrl } from '../lib/client/url.js';

function ManualGradingBadge({
  numToGrade,
  courseInstanceId,
  assessmentId,
}: {
  numToGrade: number;
  courseInstanceId: string;
  assessmentId: string;
}) {
  if (numToGrade === 0) return null;

  return (
    <a
      className="badge rounded-pill text-bg-primary ms-1"
      href={getAssessmentManualGradingUrl({ courseInstanceId, assessmentId })}
      aria-label={`${numToGrade} ungraded`}
      data-testid="manual-grading-badge"
    >
      <i className="bi bi-pen-fill" aria-hidden="true" /> {numToGrade}
    </a>
  );
}

export function ManualGradingBadgeHtml(props: {
  numToGrade: number;
  courseInstanceId: string;
  assessmentId: string;
}) {
  return renderHtml(<ManualGradingBadge {...props} />);
}
