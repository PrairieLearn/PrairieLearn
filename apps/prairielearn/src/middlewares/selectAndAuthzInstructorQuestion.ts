import { type Request, type Response } from 'express';
import asyncHandler from 'express-async-handler';
import z from 'zod';

import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';

import {
  QuestionSchema,
  SprocAssessmentsFormatForQuestionSchema,
  TopicSchema,
} from '../lib/db-types.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

const SelectAndAuthSchema = z.object({
  question: QuestionSchema,
  topic: TopicSchema,
  open_issue_count: z.coerce.number(),
});

const SelectAndAuthWithCourseInstanceSchema = z.object({
  question: QuestionSchema,
  topic: TopicSchema,
  assessments: SprocAssessmentsFormatForQuestionSchema.nullable(),
  open_issue_count: z.coerce.number(),
});

export type ResLocalsInstructorQuestionWithCourseInstance = z.infer<
  typeof SelectAndAuthWithCourseInstanceSchema
>;

export type ResLocalsInstructorQuestion = z.infer<typeof SelectAndAuthSchema> & {
  questionRenderContext?: 'manual_grading' | 'ai_grading';
};

export async function selectAndAuthzInstructorQuestion(req: Request, res: Response) {
  if (res.locals.course_instance) {
    const row = await sqldb.queryOptionalRow(
      sql.select_and_auth_with_course_instance,
      {
        question_id: req.params.question_id,
        course_instance_id: res.locals.course_instance.id,
      },
      SelectAndAuthWithCourseInstanceSchema,
    );
    if (row === null) throw new error.HttpStatusError(403, 'Access denied');
    Object.assign(res.locals, row);
  } else {
    const row = await sqldb.queryOptionalRow(
      sql.select_and_auth,
      {
        question_id: req.params.question_id,
        course_id: res.locals.course.id,
      },
      SelectAndAuthSchema,
    );
    if (row === null) throw new error.HttpStatusError(403, 'Access denied');
    Object.assign(res.locals, row);
  }
}

export default asyncHandler(async (req, res, next) => {
  await selectAndAuthzInstructorQuestion(req, res);
  next();
});
