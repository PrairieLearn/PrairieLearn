import asyncHandler from 'express-async-handler';

import { loadSqlEquiv, queryValidatedZeroOrOneRow } from '@prairielearn/postgres';

import { AccessDenied } from './selectAndAuthzAssessment.html.js';
import {
  AssessmentSetSchema,
  AssessmentModuleSchema,
  AssessmentSchema,
  AuthzAssessmentSchema,
} from '../lib/db-types.js';
import z from 'zod';

const sql = loadSqlEquiv(import.meta.url);

const SelectAndAuthzAssessmentSchema = z.object({
  assessment: AssessmentSchema,
  assessment_set: AssessmentSetSchema,
  assessment_module: AssessmentModuleSchema,
  authz_result: AuthzAssessmentSchema,
  assessment_label: z.string(),
});

export default asyncHandler(async (req, res, next) => {
  const row = await queryValidatedZeroOrOneRow(
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
