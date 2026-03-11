import { renderHtml } from '@prairielearn/react';

import { getAssessmentManualGradingUrl } from '../lib/client/url.js';

function ManualGradingBadge({
  numToGrade,
  numTotal,
  courseInstanceId,
  assessmentId,
}: {
  numToGrade: number;
  numTotal: number;
  courseInstanceId: string;
  assessmentId: string;
}) {
  if (numTotal === 0 || numToGrade === 0) return null;

  return (
    <a
      className="badge rounded-pill text-bg-primary ms-1"
      href={getAssessmentManualGradingUrl({ courseInstanceId, assessmentId })}
      data-bs-toggle="tooltip"
      data-bs-title={`${numToGrade} / ${numTotal} ungraded`}
      aria-label={`${numToGrade} / ${numTotal} ungraded`}
      data-testid="manual-grading-badge"
    >
      <i className="bi bi-pen-fill" aria-hidden="true" /> {numToGrade}
    </a>
  );
}

export function ManualGradingBadgeHtml(props: {
  numToGrade: number;
  numTotal: number;
  courseInstanceId: string;
  assessmentId: string;
}) {
  return renderHtml(<ManualGradingBadge {...props} />);
}
