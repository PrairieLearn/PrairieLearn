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
    >
      <i className="bi bi-pencil-square" /> {numToGrade}
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
