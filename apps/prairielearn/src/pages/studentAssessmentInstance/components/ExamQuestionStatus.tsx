import { Badge } from 'react-bootstrap';

import { formatInterval } from '@prairielearn/formatter';
import { run } from '@prairielearn/run';
import { OverlayTrigger } from '@prairielearn/ui';

import type { ClientQuestionRow } from './types.js';

type QuestionStatus =
  | 'unanswered'
  | 'invalid'
  | 'grading'
  | 'saved'
  | 'complete'
  | 'correct'
  | 'incorrect';

const badgeColorMap: Record<QuestionStatus, string> = {
  unanswered: 'warning',
  invalid: 'danger',
  grading: 'secondary',
  saved: 'info',
  complete: 'success',
  correct: 'success',
  incorrect: 'danger',
};

export function ExamQuestionStatus({
  row,
  realTimeGradingPartiallyDisabled,
}: {
  row: ClientQuestionRow;
  realTimeGradingPartiallyDisabled: boolean;
}) {
  if (row.questionAccessMode === 'blocked_lockpoint') {
    return <Badge bg="secondary">Locked</Badge>;
  }

  // Special case: if this is a manually graded question in the "saved" state,
  // we want to differentiate it from saved auto-graded questions which can
  // be graded immediately. We'll use a green badge so that student can drive
  // towards all status badges being green.
  if (row.status === 'saved' && !row.maxAutoPoints && row.maxManualPoints) {
    return <Badge bg="success">saved for manual grading</Badge>;
  }

  const { badgeText, badgeColor } = run(() => {
    if (realTimeGradingPartiallyDisabled && row.status === 'saved' && !row.allowRealTimeGrading) {
      return { badgeText: 'saved for grading after finish', badgeColor: 'success' };
    }

    const status = (row.status ?? 'unanswered') as QuestionStatus;
    return {
      badgeText: status,
      badgeColor: badgeColorMap[status],
    };
  });

  return (
    <>
      <Badge bg={badgeColor}>{badgeText}</Badge>
      {row.allowGradeLeftMs > 0 && (
        <OverlayTrigger
          trigger="click"
          popover={{
            body: `This question limits the rate of submissions. Further grade allowed in ${formatInterval(row.allowGradeLeftMs, { fullPartNames: true, firstOnly: true })} (as of the loading of this page).`,
          }}
          rootClose
        >
          <button type="button" className="btn btn-xs">
            <i className="fa fa-hourglass-half" aria-hidden="true" />
          </button>
        </OverlayTrigger>
      )}
    </>
  );
}
