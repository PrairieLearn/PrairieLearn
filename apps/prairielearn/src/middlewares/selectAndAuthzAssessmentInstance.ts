import { type Request, type Response } from 'express';
import asyncHandler from 'express-async-handler';
import z from 'zod';

import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';

import type { AssessmentInstanceAuthzResult } from '../lib/assessment-access-control/authz-result.js';
import { resolveModernAssessmentInstanceAccess } from '../lib/assessment-access-control/authz.js';
import { formatLegacyAssessmentInstanceAccess } from '../lib/assessment-access-control/legacy.js';
import {
  type AssessmentInstanceTimeLimit,
  assessmentInstanceLabel,
  assessmentLabel,
  getAssessmentInstanceTimeLimit,
} from '../lib/assessment.shared.js';
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
  assessment_instance: AssessmentInstanceSchema,
  instance_role: SprocUsersGetDisplayedRoleSchema,
  assessment: AssessmentSchema,
  assessment_set: AssessmentSetSchema,
  file_list: z.array(FileSchema),
  instance_group_uid_list: z.array(z.string()),
});

// See `user_team_xor` constraint
const AssessmentInstanceOwnerSchema = z.union([
  z.object({
    instance_user: UserSchema,
    instance_group: z.null(),
  }),
  z.object({
    instance_user: z.null(),
    instance_group: GroupSchema,
  }),
]);

const SelectAndAuthzAssessmentInstanceRowSchema = z.intersection(
  SelectAndAuthzAssessmentInstanceBaseSchema.extend({
    authz_result: SprocAuthzAssessmentInstanceSchema,
  }),
  AssessmentInstanceOwnerSchema,
);

type SelectAndAuthzAssessmentInstance = z.infer<typeof SelectAndAuthzAssessmentInstanceBaseSchema> &
  z.infer<typeof AssessmentInstanceOwnerSchema> & {
    authz_result: AssessmentInstanceAuthzResult;
  };

export type ResLocalsAssessmentInstance = SelectAndAuthzAssessmentInstance &
  AssessmentInstanceTimeLimit & {
    assessment_instance_label: string;
    assessment_label: string;
  };

async function selectAndAuthzAssessmentInstance(req: Request, res: Response) {
  const rawRow = await sqldb.queryOptionalRow(
    sql.select_and_auth,
    {
      assessment_instance_id: req.params.assessment_instance_id,
      course_instance_id: res.locals.course_instance.id,
      authz_data: res.locals.authz_data,
      req_date: res.locals.req_date,
    },
    SelectAndAuthzAssessmentInstanceRowSchema,
  );
  if (rawRow === null) throw new error.HttpStatusError(403, 'Access denied');

  const authzResult = rawRow.assessment.modern_access_control
    ? await resolveModernAssessmentInstanceAccess({
        assessment: rawRow.assessment,
        userId: res.locals.authz_data.user.id,
        courseInstance: res.locals.course_instance,
        authzData: res.locals.authz_data,
        reqDate: res.locals.req_date,
        assessmentInstance: rawRow.assessment_instance,
      })
    : formatLegacyAssessmentInstanceAccess(
        rawRow.authz_result,
        res.locals.course_instance.display_timezone,
      );
  const row: SelectAndAuthzAssessmentInstance = { ...rawRow, authz_result: authzResult };

  if (!row.authz_result.authorized) {
    throw new error.HttpStatusError(403, 'Access denied');
  }
  Object.assign(res.locals, row, {
    ...getAssessmentInstanceTimeLimit({
      examAccessEnd: row.authz_result.exam_access_end,
      date: row.assessment_instance.date,
      dateLimit: row.assessment_instance.date_limit,
      reqDate: res.locals.req_date,
    }),
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
