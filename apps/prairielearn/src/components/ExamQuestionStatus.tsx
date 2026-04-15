import { formatInterval } from '@prairielearn/formatter';
import { run } from '@prairielearn/run';

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
  instanceQuestion,
  assessmentQuestion,
  allowGradeLeftMs,
  questionAccessMode,
  realTimeGradingPartiallyDisabled,
}: {
  instanceQuestion: { status: QuestionStatus | null };
  assessmentQuestion: {
    max_auto_points: number | null;
    max_manual_points: number | null;
    allow_real_time_grading: boolean;
  };
  allowGradeLeftMs: number;
  questionAccessMode?: string;
  realTimeGradingPartiallyDisabled?: boolean;
}) {
  if (questionAccessMode === 'blocked_lockpoint') {
    return <span className="badge text-bg-secondary">Locked</span>;
  }

  if (
    instanceQuestion.status === 'saved' &&
    !assessmentQuestion.max_auto_points &&
    assessmentQuestion.max_manual_points
  ) {
    return <span className="badge text-bg-success">saved for manual grading</span>;
  }

  const { badgeText, badgeColor } = run(() => {
    if (
      realTimeGradingPartiallyDisabled &&
      instanceQuestion.status === 'saved' &&
      !assessmentQuestion.allow_real_time_grading
    ) {
      return { badgeText: 'saved for grading after finish', badgeColor: 'success' };
    }

    const status = instanceQuestion.status ?? 'unanswered';
    return {
      badgeText: status,
      badgeColor: badgeColorMap[status],
    };
  });

  return (
    <>
      <span className={`badge text-bg-${badgeColor}`}>{badgeText}</span>
      {allowGradeLeftMs > 0 && (
        <button
          type="button"
          className="grade-rate-limit-popover btn btn-xs"
          aria-label="Submission rate limit details"
          data-bs-toggle="popover"
          data-bs-container="body"
          data-bs-html="true"
          data-bs-placement="auto"
          data-bs-content={`This question limits the rate of submissions. Further grade allowed in ${formatInterval(allowGradeLeftMs, { fullPartNames: true, firstOnly: true })} (as of the loading of this page).`}
        >
          <i className="fa fa-hourglass-half" aria-hidden="true" />
        </button>
      )}
    </>
  );
}
