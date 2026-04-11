import { formatInterval } from '@prairielearn/formatter';
import { run } from '@prairielearn/run';

import type { ClientQuestionRow } from './types.js';

export function ExamQuestionStatus({
  row,
  realTimeGradingPartiallyDisabled,
}: {
  row: ClientQuestionRow;
  realTimeGradingPartiallyDisabled: boolean;
}) {
  if (row.questionAccessMode === 'blocked_lockpoint') {
    return <span className="badge text-bg-secondary">Locked</span>;
  }

  // Special case: if this is a manually graded question in the "saved" state,
  // we want to differentiate it from saved auto-graded questions which can
  // be graded immediately. We'll use a green badge so that student can drive
  // towards all status badges being green.
  if (row.status === 'saved' && !row.maxAutoPoints && row.maxManualPoints) {
    return <span className="badge text-bg-success">saved for manual grading</span>;
  }

  const badgeColorMap: Record<string, string> = {
    unanswered: 'warning',
    invalid: 'danger',
    grading: 'secondary',
    saved: 'info',
    complete: 'success',
    correct: 'success',
    incorrect: 'danger',
  };

  const { badgeText, badgeColor } = run(() => {
    if (realTimeGradingPartiallyDisabled && row.status === 'saved' && !row.allowRealTimeGrading) {
      return { badgeText: 'saved for grading after finish', badgeColor: 'success' };
    }

    return {
      badgeText: row.status ?? 'unanswered',
      badgeColor: badgeColorMap[row.status ?? 'unanswered'] ?? 'warning',
    };
  });

  return (
    <>
      <span className={`badge text-bg-${badgeColor}`}>{badgeText}</span>
      {row.allowGradeLeftMs > 0 && (
        <button
          type="button"
          className="grade-rate-limit-popover btn btn-xs"
          data-bs-toggle="popover"
          data-bs-container="body"
          data-bs-html="true"
          data-bs-content={`This question limits the rate of submissions. Further grade allowed in ${formatInterval(row.allowGradeLeftMs, { fullPartNames: true, firstOnly: true })} (as of the loading of this page).`}
          data-bs-placement="auto"
        >
          <i className="fa fa-hourglass-half" aria-hidden="true" />
        </button>
      )}
    </>
  );
}
