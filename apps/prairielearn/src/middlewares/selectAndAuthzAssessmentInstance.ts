import { type Request, type Response } from 'express';
import asyncHandler from 'express-async-handler';
import z from 'zod';

import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';

import { assessmentInstanceLabel, assessmentLabel } from '../lib/assessment.shared.js';
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

const SelectAndAuthzAssessmentInstanceBaseSchema = z.object({
  assessment_instance: AssessmentInstanceSchema.extend({
    formatted_date: z.string(),
  }),
  assessment_instance_remaining_ms: z.number().nullable(),
  assessment_instance_time_limit_ms: z.number().nullable(),
  assessment_instance_time_limit_expired: z.boolean(),
  instance_role: SprocUsersGetDisplayedRoleSchema,
  assessment: AssessmentSchema,
  assessment_set: AssessmentSetSchema,
  authz_result: SprocAuthzAssessmentInstanceSchema,
  file_list: z.array(FileSchema),
  instance_group_uid_list: z.array(z.string()),
});

// See `user_team_xor` constraint
const SelectAndAuthzAssessmentInstanceSchema = z.union([
  SelectAndAuthzAssessmentInstanceBaseSchema.extend({
    instance_user: UserSchema,
    instance_group: z.null(),
  }),
  SelectAndAuthzAssessmentInstanceBaseSchema.extend({
    instance_user: z.null(),
    instance_group: GroupSchema,
  }),
]);

export type ResLocalsAssessmentInstance = z.infer<typeof SelectAndAuthzAssessmentInstanceSchema> & {
  assessment_instance_label: string;
  assessment_label: string;
};

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

  // TODO: consider row.assessment.modern_access_control

  if (!row.authz_result.authorized) {
    throw new error.HttpStatusError(403, 'Access denied');
  }
  Object.assign(res.locals, row, {
    assessment_instance_label: assessmentInstanceLabel(
      row.assessment_instance,
      row.assessment,
      row.assessment_set,
    ),
    assessment_label: assessmentLabel(row.assessment, row.assessment_set),
  });
}

export default asyncHandler(async (req, res, next) => {
  await selectAndAuthzAssessmentInstance(req, res);
  next();
});
