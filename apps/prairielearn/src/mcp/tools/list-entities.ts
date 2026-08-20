import * as path from 'node:path';

import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';

import { type Course } from '../../lib/db-types.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

export const ENTITY_SCOPES = ['questions', 'course_instances', 'assessments'] as const;
export type EntityScope = (typeof ENTITY_SCOPES)[number];

const QuestionRowSchema = z.object({
  question_id: z.string(),
  qid: z.string().nullable(),
  title: z.string().nullable(),
  topic: z.string().nullable(),
  tags: z.array(z.string()),
  grading_method: z.string(),
  draft: z.boolean(),
});

const CourseInstanceRowSchema = z.object({
  course_instance_id: z.string(),
  short_name: z.string(),
  long_name: z.string().nullable(),
  assessment_count: z.number(),
});

const AssessmentRowSchema = z.object({
  assessment_id: z.string(),
  tid: z.string().nullable(),
  title: z.string().nullable(),
  type: z.string(),
  course_instance_short_name: z.string(),
  question_count: z.number(),
});

/**
 * Lists course entities with both their database IDs and their paths on disk.
 *
 * This is the bridge between the agent's two halves: it edits files addressed
 * by `qid`/`tid`, but student data is keyed by `question_id` and
 * `assessment_question_id`. Without this mapping it can't connect a question it
 * just wrote to the rows describing how students did on it.
 */
export async function listEntities({
  course,
  scope,
}: {
  course: Course;
  scope: EntityScope;
}): Promise<unknown> {
  if (scope === 'questions') {
    const rows = await sqldb.queryRows(
      sql.select_questions,
      { course_id: course.id },
      QuestionRowSchema,
    );
    return rows.map((row) => ({
      ...row,
      // Questions live at `questions/<qid>/` relative to the course root.
      path: row.qid ? path.join('questions', row.qid) : null,
    }));
  }

  if (scope === 'course_instances') {
    const rows = await sqldb.queryRows(
      sql.select_course_instances,
      { course_id: course.id },
      CourseInstanceRowSchema,
    );
    return rows.map((row) => ({
      ...row,
      path: path.join('courseInstances', row.short_name),
    }));
  }

  const rows = await sqldb.queryRows(
    sql.select_assessments,
    { course_id: course.id },
    AssessmentRowSchema,
  );
  return rows.map((row) => ({
    ...row,
    path: row.tid
      ? path.join('courseInstances', row.course_instance_short_name, 'assessments', row.tid)
      : null,
  }));
}
