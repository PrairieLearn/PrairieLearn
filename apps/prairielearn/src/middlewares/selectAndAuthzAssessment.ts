import asyncHandler from 'express-async-handler';
import z from 'zod';

import { loadSqlEquiv, queryOptionalRow } from '@prairielearn/postgres';

import {
  AssessmentModuleSchema,
  AssessmentSchema,
  AssessmentSetSchema,
  AuthzAssessmentSchema,
} from '../lib/db-types.js';

import { AccessDenied } from './selectAndAuthzAssessment.html.js';

const sql = loadSqlEquiv(import.meta.url);

const SelectAndAuthzAssessmentSchema = z.strictObject({
  assessment: z.strictObject(AssessmentSchema.shape),
  assessment_set: z.strictObject(AssessmentSetSchema.shape),
  assessment_module: z.strictObject(AssessmentModuleSchema.shape),
  authz_result: z.strictObject(AuthzAssessmentSchema.shape),
  assessment_label: z.string(),
});

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
