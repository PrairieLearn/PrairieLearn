import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';

import { type SharingSet, SharingSetSchema } from '../lib/db-types.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

const SharingSetRowSchema = z.object({
  name: z.string(),
  id: z.string(),
  description: z.string().nullable(),
  shared_with: z.string().array(),
  question_count: z.number(),
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

export async function deleteSharingSet({
  course_id,
  name,
}: {
  course_id: string;
  name: string;
}): Promise<void> {
  await sqldb.execute(sql.delete_sharing_set, { course_id, name });
}
