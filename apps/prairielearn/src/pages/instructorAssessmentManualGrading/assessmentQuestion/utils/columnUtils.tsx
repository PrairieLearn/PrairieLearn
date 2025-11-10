import { EditQuestionPointsScoreButton } from '../../../../components/EditQuestionPointsScore.js';
import { Scorebar } from '../../../../components/Scorebar.js';
import { formatPoints } from '../../../../lib/format.js';
import type { InstanceQuestionRowWithAIGradingStats as InstanceQuestionRow } from '../assessmentQuestion.types.js';

export function generateAiGraderName(
  ai_grading_status?: 'Graded' | 'OutdatedRubric' | 'LatestRubric',
): string {
  return (
    'AI' +
    (ai_grading_status === undefined ||
    ai_grading_status === 'Graded' ||
    ai_grading_status === 'LatestRubric'
      ? ''
      : ' (outdated)')
  );
}

export function formatPointsWithEdit({
  row,
  field,
  hasCourseInstancePermissionEdit,
  urlPrefix,
  csrfToken,
}: {
  row: InstanceQuestionRow;
  field: 'manual_points' | 'auto_points' | 'points';
  hasCourseInstancePermissionEdit: boolean;
  urlPrefix: string;
  csrfToken: string;
}) {
  const points = row[field];
  const maxPoints = row.assessment_question[`max_${field}`];

  return (
    <div class="d-flex align-items-center justify-content-center gap-1">
      <span>
        {points != null ? formatPoints(points) : '—'}
        {maxPoints != null && (
          <small>
            /<span class="text-muted">{maxPoints}</span>
          </small>
        )}
      </span>
      {hasCourseInstancePermissionEdit && (
        <div
          // eslint-disable-next-line @eslint-react/dom/no-dangerously-set-innerhtml
          dangerouslySetInnerHTML={{
            __html: EditQuestionPointsScoreButton({
              field,
              instance_question: row,
              assessment_question: row.assessment_question,
              urlPrefix,
              csrfToken,
            }).toString(),
          }}
        />
      )}
    </div>
  );
}

export function formatScoreWithEdit({
  row,
  hasCourseInstancePermissionEdit,
  urlPrefix,
  csrfToken,
}: {
  row: InstanceQuestionRow;
  hasCourseInstancePermissionEdit: boolean;
  urlPrefix: string;
  csrfToken: string;
}) {
  const score = row.score_perc;

  return (
    <div class="d-flex align-items-center justify-content-center gap-1">
      {score != null && (
        <div class="d-inline-block align-middle">
          <Scorebar score={score} minWidth="10em" />
        </div>
      )}
      {hasCourseInstancePermissionEdit && (
        <div
          // eslint-disable-next-line @eslint-react/dom/no-dangerously-set-innerhtml
          dangerouslySetInnerHTML={{
            __html: EditQuestionPointsScoreButton({
              field: 'score_perc',
              instance_question: row,
              assessment_question: row.assessment_question,
              urlPrefix,
              csrfToken,
            }).toString(),
          }}
        />
      )}
    </div>
  );
}
