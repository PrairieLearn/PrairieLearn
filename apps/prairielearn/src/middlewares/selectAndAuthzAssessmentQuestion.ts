import asyncHandler from 'express-async-handler';
import z from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';

import { AssessmentQuestionSchema, QuestionSchema } from '../lib/db-types.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

const SelectAndAuthzAssessmentQuestionSchema = z.object({
  assessment_question: AssessmentQuestionSchema,
  question: QuestionSchema,
  number_in_alternative_group: z.string(),
  num_open_instances: z.number(),
});

export type ResLocalsAssessmentQuestion = z.infer<typeof SelectAndAuthzAssessmentQuestionSchema>;

export default asyncHandler(async (req, res, next) => {
  const row = await sqldb.queryOptionalRow(
    sql.select_and_auth,
    {
      assessment_question_id: req.params.assessment_question_id,
      assessment_id: res.locals.assessment.id,
    },
    SelectAndAuthzAssessmentQuestionSchema,
  );
  if (row === null) throw new HttpStatusError(403, 'Access denied');
  Object.assign(res.locals, row);
  next();
});
