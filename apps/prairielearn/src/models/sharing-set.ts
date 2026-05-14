import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { type SharingSet, SharingSetSchema } from '../lib/db-types.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

const SharingSetRowSchema = z.object({
  name: z.string(),
  id: z.string(),
  description: z.string().nullable(),
  shared_with: z.string().array(),
  question_count: z.number(),
  questions: z.object({ id: IdSchema, qid: z.string() }).array(),
});
export type SharingSetRow = z.infer<typeof SharingSetRowSchema>;

export async function selectOptionalSharingSetByName({
  course_id,
  name,
}: {
  course_id: string;
  name: string;
}): Promise<SharingSet | null> {
  return await sqldb.queryOptionalRow(
    sql.select_sharing_set_by_name,
    { course_id, name },
    SharingSetSchema,
  );
}

const QuestionSharingSetRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  in_set: z.boolean(),
});
export type QuestionSharingSetRow = z.infer<typeof QuestionSharingSetRowSchema>;

export async function selectSharingSetsForCourse({
  course_id,
}: {
  course_id: string;
}): Promise<SharingSetRow[]> {
  return await sqldb.queryRows(
    sql.select_sharing_sets_for_course,
    { course_id },
    SharingSetRowSchema,
  );
}

export async function selectSharingSetsForQuestion({
  question_id,
  course_id,
}: {
  question_id: string;
  course_id: string;
}): Promise<QuestionSharingSetRow[]> {
  return await sqldb.queryRows(
    sql.select_sharing_sets_for_question,
    { question_id, course_id },
    QuestionSharingSetRowSchema,
  );
}

/**
 * Returns the sync-time constraints that gate which sharing toggles can be
 * unset for a question, so the UI can disable controls whose change would
 * fail sync. Mirrors the checks in `sync/sharing.ts`:
 *
 * - `used_in_other_course`: any assessment in a different course uses Q.
 *   While true, `share_publicly` cannot transition from true to false.
 * - `used_in_same_course_public_assessment`: an assessment in this same
 *   course is `share_source_publicly` and uses Q. While true,
 *   `share_publicly` can transition to false only if `share_source_publicly`
 *   stays true.
 * - `locked_sharing_set_names`: sharing sets the question is in where some
 *   course granted access via that set has an assessment that uses Q;
 *   those memberships cannot be removed.
 */
export async function selectQuestionSharingConstraints({
  question_id,
  course_id,
}: {
  question_id: string;
  course_id: string;
}): Promise<{
  used_in_other_course: boolean;
  used_in_same_course_public_assessment: boolean;
  locked_sharing_set_names: string[];
}> {
  const usage = await sqldb.queryRow(
    sql.select_question_sharing_constraints,
    { question_id, course_id },
    z.object({
      used_in_other_course: z.boolean(),
      used_in_same_course_public_assessment: z.boolean(),
    }),
  );
  const locked_sharing_set_names = await sqldb.queryScalars(
    sql.select_locked_sharing_set_memberships,
    { question_id, course_id },
    z.string(),
  );
  return {
    used_in_other_course: usage.used_in_other_course,
    used_in_same_course_public_assessment: usage.used_in_same_course_public_assessment,
    locked_sharing_set_names,
  };
}

interface SharingSetUsage {
  question_count: number;
  consumer_count: number;
}

export async function selectSharingSetUsage({
  course_id,
  name,
}: {
  course_id: string;
  name: string;
}): Promise<SharingSetUsage> {
  return await sqldb.queryRow(
    sql.select_sharing_set_usage,
    { course_id, name },
    z.object({
      question_count: z.coerce.number(),
      consumer_count: z.coerce.number(),
    }),
  );
}
