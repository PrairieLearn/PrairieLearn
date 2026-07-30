import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

const sql = sqldb.loadSqlEquiv(import.meta.url);

const NonPublicQuestionSchema = z.object({ id: IdSchema, qid: z.string() });
type NonPublicQuestion = z.infer<typeof NonPublicQuestionSchema>;

const NonPublicAssessmentSchema = z.object({ id: IdSchema, tid: z.string() });
type NonPublicAssessment = z.infer<typeof NonPublicAssessmentSchema>;

export async function selectNonPublicQuestionsInAssessment({
  assessment_id,
}: {
  assessment_id: string;
}): Promise<NonPublicQuestion[]> {
  return await sqldb.queryRows(
    sql.select_non_public_questions_in_assessment,
    { assessment_id },
    NonPublicQuestionSchema,
  );
}

export async function selectNonPublicAssessmentsInCourseInstance({
  course_instance_id,
}: {
  course_instance_id: string;
}): Promise<NonPublicAssessment[]> {
  return await sqldb.queryRows(
    sql.select_non_public_assessments_in_course_instance,
    { course_instance_id },
    NonPublicAssessmentSchema,
  );
}

/**
 * Formats a list of names with a "and N more" tail when there are more than
 * `maxListed` entries. Keeps the user-facing message short when there are many
 * children, while still naming the first few. Pure formatting helper.
 */
function formatTruncatedList(names: string[], maxListed = 5): string {
  if (names.length <= maxListed) return names.join(', ');
  const remaining = names.length - maxListed;
  return `${names.slice(0, maxListed).join(', ')}, and ${remaining} more`;
}

/**
 * Throws a 400 HttpStatusError if the assessment cannot transition to publicly
 * shared because one or more of its questions are not publicly shared. Used at
 * both page-load time (to disable the checkbox + render the warning) and
 * submit time (to enforce the invariant server-side).
 */
export async function assertAssessmentCanBeSharedPublicly({
  assessment_id,
}: {
  assessment_id: string;
}): Promise<void> {
  const nonPublic = await selectNonPublicQuestionsInAssessment({ assessment_id });
  if (nonPublic.length > 0) {
    throw new HttpStatusError(
      400,
      `Cannot share this assessment publicly because it contains questions that are not publicly shared: ${formatTruncatedList(nonPublic.map((q) => q.qid))}.`,
    );
  }
}

/**
 * Throws a 400 HttpStatusError if the course instance cannot transition to
 * publicly shared because one or more of its assessments are not publicly shared.
 */
export async function assertCourseInstanceCanBeSharedPublicly({
  course_instance_id,
}: {
  course_instance_id: string;
}): Promise<void> {
  const nonPublic = await selectNonPublicAssessmentsInCourseInstance({ course_instance_id });
  if (nonPublic.length > 0) {
    throw new HttpStatusError(
      400,
      `Cannot share this course instance publicly because it contains assessments that are not publicly shared: ${formatTruncatedList(nonPublic.map((a) => a.tid))}.`,
    );
  }
}
