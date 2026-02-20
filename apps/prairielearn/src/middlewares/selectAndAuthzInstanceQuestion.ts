import { type Request, type Response } from 'express';
import asyncHandler from 'express-async-handler';
import z from 'zod';

import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { assessmentInstanceLabel } from '../lib/assessment.shared.js';
import {
  AssessmentInstanceSchema,
  AssessmentQuestionSchema,
  AssessmentSchema,
  AssessmentSetSchema,
  EnumQuestionAccessModeSchema,
  FileSchema,
  type GroupConfig,
  GroupSchema,
  InstanceQuestionSchema,
  QuestionSchema,
  SprocAuthzAssessmentInstanceSchema,
  SprocUsersGetDisplayedRoleSchema,
  UserSchema,
} from '../lib/db-types.js';
import {
  type GroupInfo,
  type QuestionGroupPermissions,
  getGroupConfig,
  getGroupInfo,
  getQuestionGroupPermissions,
} from '../lib/groups.js';
import type { SimpleVariantWithScore } from '../models/variant.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

const InstanceQuestionInfoSchema = z.object({
  id: IdSchema,
  prev_instance_question: z.object({
    id: IdSchema.nullable(),
  }),
  next_instance_question: z.object({
    id: IdSchema.nullable(),
    question_access_mode: EnumQuestionAccessModeSchema.nullable(),
  }),
  question_number: z.string(),
  advance_score_perc: z.number().nullable(),
  question_access_mode: EnumQuestionAccessModeSchema,
  instructor_question_number: z.string(),
});
type InstanceQuestionInfo = z.infer<typeof InstanceQuestionInfoSchema>;

const SelectAndAuthzInstanceQuestionSchema = z.object({
  assessment_instance: AssessmentInstanceSchema.extend({
    formatted_date: z.string(),
  }),
  assessment_instance_remaining_ms: z.number().nullable(),
  assessment_instance_time_limit_ms: z.number().nullable(),
  assessment_instance_time_limit_expired: z.boolean(),
  instance_user: UserSchema.nullable(),
  instance_role: SprocUsersGetDisplayedRoleSchema,
  instance_group: GroupSchema.nullable(),
  instance_group_uid_list: z.array(z.string()),
  instance_question: InstanceQuestionSchema,
  instance_question_info: InstanceQuestionInfoSchema,
  assessment_question: AssessmentQuestionSchema,
  question: QuestionSchema,
  assessment: AssessmentSchema,
  assessment_set: AssessmentSetSchema,
  authz_result: SprocAuthzAssessmentInstanceSchema,
  file_list: z.array(FileSchema),
});

export type ResLocalsInstanceQuestion = z.infer<typeof SelectAndAuthzInstanceQuestionSchema> & {
  assessment_instance_label: string;

  instance_question_info: InstanceQuestionInfo & {
    previous_variants?: SimpleVariantWithScore[];
  };

  /** These are only set if the assessment has group work. */
  prev_instance_question_role_permissions?: QuestionGroupPermissions;
  next_instance_question_role_permissions?: QuestionGroupPermissions;
  group_config?: GroupConfig;
  group_info?: GroupInfo;
  group_role_permissions?: QuestionGroupPermissions;
};

export async function selectAndAuthzInstanceQuestion(req: Request, res: Response) {
  const row = await sqldb.queryOptionalRow(
    sql.select_and_auth,
    {
      instance_question_id: req.params.instance_question_id,
      assessment_id: req.params.assessment_id,
      course_instance_id: res.locals.course_instance.id,
      authz_data: res.locals.authz_data,
      req_date: res.locals.req_date,
    },
    SelectAndAuthzInstanceQuestionSchema,
  );
  if (row === null) throw new error.HttpStatusError(403, 'Access denied');

  // TODO: consider row.assessment.modern_access_control
  if (!row.authz_result.authorized) throw new error.HttpStatusError(403, 'Access denied');

  Object.assign(res.locals, row, {
    assessment_instance_label: assessmentInstanceLabel(
      row.assessment_instance,
      row.assessment,
      row.assessment_set,
    ),
  });
  if (res.locals.assessment.team_work) {
    res.locals.group_config = await getGroupConfig(res.locals.assessment.id);
    res.locals.group_info = await getGroupInfo(
      res.locals.assessment_instance.team_id,
      res.locals.group_config,
    );
    if (res.locals.group_config.has_roles) {
      if (
        !res.locals.group_info.start &&
        !res.locals.authz_data.has_course_instance_permission_view
      ) {
        throw new error.HttpStatusError(
          400,
          'Group role assignments do not match required settings for this assessment. Questions cannot be viewed until the group role assignments are updated.',
        );
      }

      // Get the role permissions. If the current user has course instance
      // permission and is viewing in "Student view without access permissions",
      // then role restrictions don't apply.
      if (res.locals.authz_data.has_course_instance_permission_view) {
        res.locals.group_role_permissions = { can_view: true, can_submit: true };
      } else {
        res.locals.group_role_permissions = await getQuestionGroupPermissions(
          res.locals.instance_question.id,
          res.locals.assessment_instance.team_id,
          res.locals.authz_data.user.id,
        );
        if (!res.locals.group_role_permissions.can_view) {
          throw new error.HttpStatusError(
            400,
            'Your current group role does not give you permission to see this question.',
          );
        }
      }
    }
  }
}

export default asyncHandler(async (req, res, next) => {
  await selectAndAuthzInstanceQuestion(req, res);
  next();
});
