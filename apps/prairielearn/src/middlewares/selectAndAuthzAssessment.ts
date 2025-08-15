import asyncHandler from 'express-async-handler';
import z from 'zod';

import { loadSqlEquiv, queryOptionalRow } from '@prairielearn/postgres';

import {
  AssessmentModuleSchema,
  AssessmentSchema,
  AssessmentSetSchema,
  SprocAuthzAssessmentSchema,
} from '../lib/db-types.js';

import { AccessDenied } from './selectAndAuthzAssessment.html.js';

const sql = loadSqlEquiv(import.meta.url);

const SelectAndAuthzAssessmentSchema = z.object({
  assessment: AssessmentSchema,
  assessment_set: AssessmentSetSchema,
  assessment_module: AssessmentModuleSchema.nullable(),
  authz_result: SprocAuthzAssessmentSchema,
  assessment_label: z.string(),
});

export type ResLocalsAssessment = z.infer<typeof SelectAndAuthzAssessmentSchema>;

export default asyncHandler(async (req, res, next) => {
  const row = await queryOptionalRow(
    sql.select_and_auth,
    {
      assessment_id: req.params.assessment_id,
      course_instance_id: res.locals.course_instance.id,
      authz_data: res.locals.authz_data,
      req_date: res.locals.req_date,
    },
    SelectAndAuthzAssessmentSchema,
  );
  if (row === null) {
    res.status(403).send(AccessDenied({ resLocals: res.locals }));
    return;
  }
  Object.assign(res.locals, row);
  next();
});
