import { Badge } from 'react-bootstrap';

import { formatInterval } from '@prairielearn/formatter';
import { run } from '@prairielearn/run';
import { OverlayTrigger } from '@prairielearn/ui';

import type { StudentQuestionRow } from './types.js';

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
  row: StudentQuestionRow;
  realTimeGradingPartiallyDisabled: boolean;
}) {
  if (row.question_access_mode === 'blocked_lockpoint') {
    return <Badge bg="secondary">Locked</Badge>;
  }

  if (
    row.instance_question.status === 'saved' &&
    !row.assessment_question.max_auto_points &&
    row.assessment_question.max_manual_points
  ) {
    return <Badge bg="success">saved for manual grading</Badge>;
  }

  const { badgeText, badgeColor } = run(() => {
    if (
      realTimeGradingPartiallyDisabled &&
      row.instance_question.status === 'saved' &&
      !row.assessment_question.allow_real_time_grading
    ) {
      return { badgeText: 'saved for grading after finish', badgeColor: 'success' };
    }

    const status = (row.instance_question.status ?? 'unanswered') as QuestionStatus;
    return {
      badgeText: status,
      badgeColor: badgeColorMap[status],
    };
  });

  return (
    <>
      <Badge bg={badgeColor}>{badgeText}</Badge>
      {row.allow_grade_left_ms > 0 && (
        <OverlayTrigger
          trigger="click"
          popover={{
            body: `This question limits the rate of submissions. Further grade allowed in ${formatInterval(row.allow_grade_left_ms, { fullPartNames: true, firstOnly: true })} (as of the loading of this page).`,
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
