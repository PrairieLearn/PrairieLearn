import { type Request, type Response } from 'express';
import asyncHandler from 'express-async-handler';
import z from 'zod';

import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';

import {
  AssessmentInstanceSchema,
  AssessmentSchema,
  AssessmentSetSchema,
  FileSchema,
  GroupSchema,
  SprocAuthzAssessmentInstanceSchema,
  SprocUsersGetDisplayedRoleSchema,
  UserSchema,
} from '../lib/db-types.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

const SelectAndAuthzAssessmentInstanceSchema = z.object({
  assessment_instance: AssessmentInstanceSchema.extend({
    formatted_date: z.string(),
  }),
  assessment_instance_remaining_ms: z.number().nullable(),
  assessment_instance_time_limit_ms: z.number().nullable(),
  assessment_instance_time_limit_expired: z.boolean(),
  instance_user: UserSchema.nullable(),
  instance_role: SprocUsersGetDisplayedRoleSchema,
  assessment: AssessmentSchema,
  assessment_set: AssessmentSetSchema,
  authz_result: SprocAuthzAssessmentInstanceSchema,
  assessment_instance_label: z.string(),
  assessment_label: z.string(),
  file_list: z.array(FileSchema),
  instance_group: GroupSchema.nullable(),
  instance_group_uid_list: z.array(z.string()),
});

export type ResLocalsAssessmentInstance = z.infer<typeof SelectAndAuthzAssessmentInstanceSchema>;

async function selectAndAuthzAssessmentInstance(req: Request, res: Response) {
  const row = await sqldb.queryOptionalRow(
    sql.select_and_auth,
    {
      assessment_instance_id: req.params.assessment_instance_id,
      course_instance_id: res.locals.course_instance.id,
      authz_data: res.locals.authz_data,
      req_date: res.locals.req_date,
    },
    SelectAndAuthzAssessmentInstanceSchema,
  );
  if (row === null) throw new error.HttpStatusError(403, 'Access denied');
  Object.assign(res.locals, row);
}

export default asyncHandler(async (req, res, next) => {
  await selectAndAuthzAssessmentInstance(req, res);
  next();
});
