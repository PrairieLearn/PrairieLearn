import { EditQuestionPointsScoreButton } from '../../../../components/EditQuestionPointsScore.js';
import { Scorebar } from '../../../../components/Scorebar.js';
import { formatPoints } from '../../../../lib/format.js';
import type { InstanceQuestionRowWithAIGradingStats } from '../assessmentQuestion.types.js';

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
  onSuccess,
  onConflict,
}: {
  row: InstanceQuestionRowWithAIGradingStats;
  field: 'manual_points' | 'auto_points' | 'points';
  hasCourseInstancePermissionEdit: boolean;
  urlPrefix: string;
  csrfToken: string;
  onSuccess?: () => void;
  onConflict?: (conflictDetailsUrl: string) => void;
}) {
  const points = row.instance_question[field];
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
        <EditQuestionPointsScoreButton
          field={field}
          instanceQuestion={row.instance_question}
          assessmentQuestion={row.assessment_question}
          urlPrefix={urlPrefix}
          csrfToken={csrfToken}
          onSuccess={onSuccess}
          onConflict={onConflict}
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
  onSuccess,
  onConflict,
}: {
  row: InstanceQuestionRowWithAIGradingStats;
  hasCourseInstancePermissionEdit: boolean;
  urlPrefix: string;
  csrfToken: string;
  onSuccess?: () => void;
  onConflict?: (conflictDetailsUrl: string) => void;
}) {
  const score = row.instance_question.score_perc;

  return (
    <div class="d-flex align-items-center justify-content-center gap-1">
      {score != null && (
        <div class="d-inline-block align-middle">
          <Scorebar score={score} minWidth="10em" />
        </div>
      )}
      {hasCourseInstancePermissionEdit && (
        <EditQuestionPointsScoreButton
          field="score_perc"
          instanceQuestion={row.instance_question}
          assessmentQuestion={row.assessment_question}
          urlPrefix={urlPrefix}
          csrfToken={csrfToken}
          onSuccess={onSuccess}
          onConflict={onConflict}
        />
      )}
    </div>
  );
}
