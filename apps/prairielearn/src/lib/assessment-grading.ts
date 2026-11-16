import { groupBy } from 'es-toolkit';
import z from 'zod';

import {
  execute,
  loadSqlEquiv,
  queryOptionalScalar,
  queryRow,
  queryRows,
  runInTransactionAsync,
} from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { selectPendingInstanceQuestions } from '../models/instance-question.js';

import { type AssessmentInstance, AssessmentInstanceSchema, SubmissionSchema } from './db-types.js';
import { computeInstanceQuestionPendingPoints } from './question-points.js';

const sql = loadSqlEquiv(import.meta.url);

const AssessmentInstanceZonePointsSchema = z.object({
  assessment_instance_id: IdSchema,
  zone_id: IdSchema,
  points: z.number(),
  potential_points: z.number(),
  grading_pending: z.boolean(),
  pending_credit: z.number(),
  iq_ids: IdSchema.array(),
  max_points: z.number(),
  max_iq_ids: IdSchema.array(),
});
type AssessmentInstanceZonePoints = z.infer<typeof AssessmentInstanceZonePointsSchema>;

export async function updateAssessmentInstanceGrade({
  assessment_instance_id,
  authn_user_id,
  credit = null,
  onlyLogIfScoreUpdated = false,
  allowDecrease = false,
  precomputedPointsByZone,
}: {
  assessment_instance_id: string;
  authn_user_id: string | null;
  credit?: number | null;
  onlyLogIfScoreUpdated?: boolean;
  allowDecrease?: boolean;
  precomputedPointsByZone?: AssessmentInstanceZonePoints[];
}): Promise<{ updated: boolean; points: number; score_perc: number }> {
  return await runInTransactionAsync(async () => {
    const assessmentInstance = await queryRow(
      sql.select_and_lock_assessment_instance,
      { assessment_instance_id },
      AssessmentInstanceSchema,
    );

    if (credit == null) {
      // If credit was not explicitly set, fetch it from the last submission.
      credit =
        (await queryOptionalScalar(
          sql.select_credit_of_last_submission,
          { assessment_instance_id },
          SubmissionSchema.shape.credit,
        )) ?? 0;
    }

    const pointsByZone =
      precomputedPointsByZone ??
      (await computeAssessmentInstanceScoreByZone({ assessment_instance_id }));
    const instanceQuestionsUsedForGrade = pointsByZone.flatMap((zone) => zone.iq_ids);
    const totalPoints = pointsByZone.reduce((sum, zone) => sum + zone.points, 0);

    // compute the score in points, maxing out at max_points + max_bonus_points
    const points = Math.min(
      totalPoints,
      (assessmentInstance.max_points ?? 0) + (assessmentInstance.max_bonus_points ?? 0),
    );

    // Compute the score as a percentage, applying credit bonus/limits. If
    // max_points is zero (or null), points will typically also be zero, so we
    // avoid division by zero by using 1 as denominator in that case. If points
    // happens to have a positive value (which can only happen if bonus points
    // is positive), for legacy reasons we still compute a percentage score
    // based on 1 point total (with the usual credit bonus/limit applied),
    // though we don't expect this to be commonly used.
    let score_perc = computeScorePercentage(assessmentInstance, points, credit);
    if (!allowDecrease) {
      score_perc = Math.max(score_perc, assessmentInstance.score_perc ?? 0);
    }

    const updated =
      points !== assessmentInstance.points || score_perc !== assessmentInstance.score_perc;
    const pending = computePendingScore({ assessmentInstance, pointsByZone, score_perc });
    const pendingUpdated =
      pending.score_perc_pending !== assessmentInstance.score_perc_pending ||
      pending.grading_pending !== assessmentInstance.grading_pending;

    await execute(sql.update_assessment_instance_grade, {
      assessment_instance_id,
      points,
      score_perc,
      ...pending,
      authn_user_id,
      insert_log: updated || pendingUpdated || !onlyLogIfScoreUpdated,
      instance_questions_used_for_grade: instanceQuestionsUsedForGrade,
    });

    return { updated, points, score_perc };
  });
}

export async function computeAssessmentInstanceScoreByZone({
  assessment_instance_id,
}: {
  assessment_instance_id: string;
}) {
  return await computeAssessmentInstancesScoresByZone([assessment_instance_id]);
}

async function computeAssessmentInstancesScoresByZone(assessment_instance_ids: string[]) {
  const pendingQuestions = await selectPendingInstanceQuestions({ assessment_instance_ids });
  const pendingScores = pendingQuestions.map(
    ({
      assessment,
      assessment_question,
      instance_question,
      rubric,
      auto_grading_pending,
      credit,
    }) => ({
      id: instance_question.id,
      pending_points: computeInstanceQuestionPendingPoints({
        assessment,
        assessmentQuestion: assessment_question,
        instanceQuestion: instance_question,
        rubric,
        autoGradingPending: auto_grading_pending,
      }),
      pending_credit: Math.max(
        instance_question.requires_manual_grading ? 100 : 0,
        auto_grading_pending ? (credit ?? 0) : 0,
      ),
    }),
  );
  return await queryRows(
    sql.compute_assessment_instance_points_by_zone,
    { assessment_instance_ids, pending_questions: JSON.stringify(pendingScores) },
    AssessmentInstanceZonePointsSchema,
  );
}

function computeScorePercentage(
  assessmentInstance: AssessmentInstance,
  points: number,
  credit: number,
) {
  const score = (points * 100) / (assessmentInstance.max_points || 1);
  if (credit < 100) return Math.min(score, credit);
  if (credit > 100 && points >= (assessmentInstance.max_points ?? 0)) return (credit * score) / 100;
  return score;
}

function computePendingScore({
  assessmentInstance,
  pointsByZone,
  score_perc = assessmentInstance.score_perc ?? 0,
}: {
  assessmentInstance: AssessmentInstance;
  pointsByZone: AssessmentInstanceZonePoints[];
  score_perc?: number;
}) {
  const potentialPoints = Math.min(
    pointsByZone.reduce((sum, zone) => sum + zone.potential_points, 0),
    (assessmentInstance.max_points ?? 0) + (assessmentInstance.max_bonus_points ?? 0),
  );
  const gradingPending = pointsByZone.some((zone) => zone.grading_pending);
  // Automatic grading applies the resolving submission's credit; manual grading applies 100%.
  // Different completion orders may yield different scores, so use the highest eligible credit.
  const potentialCredit = Math.max(0, ...pointsByZone.map((zone) => zone.pending_credit));
  return {
    grading_pending: gradingPending,
    score_perc_pending: gradingPending
      ? Math.max(
          0,
          computeScorePercentage(assessmentInstance, potentialPoints, potentialCredit) - score_perc,
        )
      : 0,
  };
}

/** Refresh pending grading without changing earned scores or best-question selections. */
export async function updateAssessmentInstancesScorePending(
  assessment_instance_ids: string[],
  authn_user_id: string | null = null,
  { log = 'changed' }: { log?: 'always' | 'changed' | 'never' } = {},
) {
  if (assessment_instance_ids.length === 0) return;
  await runInTransactionAsync(async () => {
    const instances = await queryRows(
      sql.select_and_lock_assessment_instances_for_pending,
      { assessment_instance_ids },
      AssessmentInstanceSchema,
    );
    const pointsByZone = await computeAssessmentInstancesScoresByZone(assessment_instance_ids);
    const zonesByInstance = groupBy(pointsByZone, (zone) => zone.assessment_instance_id);
    await execute(sql.update_assessment_instances_pending, {
      pending_scores: JSON.stringify(
        instances.map((assessmentInstance) => ({
          id: assessmentInstance.id,
          ...computePendingScore({
            assessmentInstance,
            pointsByZone: zonesByInstance[assessmentInstance.id] ?? [],
          }),
        })),
      ),
      authn_user_id,
      force_log: log === 'always',
      insert_log: log !== 'never',
    });
  });
}
