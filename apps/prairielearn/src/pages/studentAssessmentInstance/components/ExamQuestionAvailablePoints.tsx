import { OverlayTrigger } from '@prairielearn/ui';

import { formatPoints, formatPointsOrList } from '../../../lib/format.js';

import type { StudentQuestionRow } from './types.js';

export function ExamQuestionAvailablePoints({ row }: { row: StudentQuestionRow }) {
  if (!row.assessment_question.max_auto_points) {
    return <>&mdash;</>;
  }

  const open = row.instance_question.open;
  const pointsList = row.instance_question.points_list?.map(
    (p) => p - (row.assessment_question.max_manual_points ?? 0),
  );
  const currentWeight =
    (row.instance_question.points_list_original?.[row.instance_question.number_attempts] ?? 0) -
    (row.assessment_question.max_manual_points ?? 0);
  const highestSubmissionScore = row.instance_question.highest_submission_score;

  if (!open || pointsList == null || pointsList.length === 0) {
    return <>&mdash;</>;
  }

  const bestScore = Math.floor((highestSubmissionScore ?? 0) * 100);

  return (
    <>
      {pointsList.length === 1 ? (
        formatPoints(pointsList[0])
      ) : (
        <>
          {formatPoints(pointsList[0])},{' '}
          <span className="text-muted">{formatPointsOrList(pointsList.slice(1))}</span>
        </>
      )}
      <OverlayTrigger
        trigger="click"
        popover={{
          header: 'Explanation of available points',
          body: (
            <>
              <p>
                You have {pointsList.length} remaining attempt
                {pointsList.length !== 1 ? 's' : ''} for this question.
              </p>
              <p>
                If you score 100% on your next submission, then you will be awarded an additional{' '}
                {formatPoints(pointsList[0])} points.
              </p>
              {bestScore > 0 ? (
                <>
                  <p>
                    If you score less than {bestScore}% on your next submission, then you will be
                    awarded no additional points, but you will keep any awarded points that you
                    already have.
                  </p>
                  <p className="mb-0">
                    If you score between {bestScore}% and 100% on your next submission, then you
                    will be awarded an additional{' '}
                    <code>
                      ({formatPoints(currentWeight)} * (score - {bestScore})/100)
                    </code>{' '}
                    points.
                  </p>
                </>
              ) : (
                <p className="mb-0">
                  If you score less than 100% on your next submission, then you will be awarded an
                  additional <code>({formatPoints(currentWeight)} * score / 100)</code> points.
                </p>
              )}
            </>
          ),
        }}
        rootClose
      >
        <button
          type="button"
          className="btn btn-xs btn-ghost"
          aria-label="Explanation of available points"
        >
          <i className="fa fa-question-circle" aria-hidden="true" />
        </button>
      </OverlayTrigger>
    </>
  );
}
