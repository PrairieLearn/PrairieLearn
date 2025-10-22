import z from 'zod';

import { callRows, execute, loadSqlEquiv, queryOptionalRow } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { selectAssessmentInstanceById } from '../models/assessment-instance.js';

import { SubmissionSchema } from './db-types.js';

const sql = loadSqlEquiv(import.meta.url);

const AssessmentInstanceZonePointsSchema = z.object({
  zid: IdSchema,
  points: z.number(),
  iq_ids: IdSchema.array(),
  max_points: z.number(),
  max_iq_ids: IdSchema.array(),
});

export async function computeAssessmentInstanceScore({
  assessment_instance_id,
  authn_user_id,
  credit = null,
  onlyLogIfScoreUpdated = false,
  allowDecrease = false,
}: {
  assessment_instance_id: string;
  authn_user_id: string | null;
  credit?: number | null;
  onlyLogIfScoreUpdated?: boolean;
  allowDecrease?: boolean;
}): Promise<{ updated: boolean; points: number; score_perc: number }> {
  const assessmentInstance = await selectAssessmentInstanceById(assessment_instance_id);

  if (credit == null) {
    // If credit was not explicitly set, fetch it from the last submission.
    credit =
      (await queryOptionalRow(
        sql.select_credit_of_last_submission,
        { assessment_instance_id },
        SubmissionSchema.shape.credit,
      )) ?? 0;
  }

  const pointsByZone = await callRows(
    'assessment_instances_points',
    [assessment_instance_id],
    AssessmentInstanceZonePointsSchema,
  );
  const instanceQuestionsUsedForGrade = pointsByZone.flatMap((zone) => zone.iq_ids);
  const totalPoints = pointsByZone.reduce((sum, zone) => sum + zone.points, 0);

  // compute the score in points, maxing out at max_points + max_bonus_points
  const points = Math.min(
    totalPoints,
    (assessmentInstance.max_points ?? 0) + (assessmentInstance.max_bonus_points ?? 0),
  );

  // compute the score as a percentage, applying credit bonus/limits
  let score_perc = (points * 100) / (assessmentInstance.max_points || 1);
  if (credit < 100) {
    score_perc = Math.min(score_perc, credit);
  } else if (credit > 100 && points >= assessmentInstance.max_points!) {
    score_perc = (credit * score_perc) / 100;
  }
  if (!allowDecrease) {
    score_perc = Math.max(score_perc, assessmentInstance.score_perc ?? 0);
  }

  const updated =
    points !== assessmentInstance.points || score_perc !== assessmentInstance.score_perc;

  await execute(sql.update_assessment_instance_grade, {
    assessment_instance_id,
    points,
    score_perc,
    authn_user_id,
    insert_log: updated || !onlyLogIfScoreUpdated,
    instance_questions_used_for_grade: instanceQuestionsUsedForGrade,
  });

  return { updated, points, score_perc };
}
