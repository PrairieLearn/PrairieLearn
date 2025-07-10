import asyncHandler from 'express-async-handler';
import z from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';

import { AssessmentQuestionSchema, QuestionSchema } from '../lib/db-types.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

/*
  to_jsonb(aq) AS assessment_question,
  to_jsonb(q) AS question,
  admin_assessment_question_number (aq.id) as number_in_alternative_group,
  COALESCE(oi.num_open_instances, 0) AS num_open_instances
*/

const SelectAndAuthzAssessmentQuestionSchema = z.object({
  assessment_question: AssessmentQuestionSchema,
  question: QuestionSchema,
  number_in_alternative_group: z.number(),
  num_open_instances: z.number(),
});

export default asyncHandler(async (req, res, next) => {
  const row = await sqldb.queryValidatedZeroOrOneRow(
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
