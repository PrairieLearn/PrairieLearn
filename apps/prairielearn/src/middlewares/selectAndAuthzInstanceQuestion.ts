import { type Request, type Response } from 'express';
import asyncHandler from 'express-async-handler';

import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';

import { getGroupConfig, getGroupInfo, getQuestionGroupPermissions } from '../lib/groups.js';
import {
  AssessmentInstanceSchema,
  AssessmentSchema,
  AssessmentQuestionSchema,
  FileSchema,
  GroupSchema,
  InstanceQuestionSchema,
  QuestionSchema,
  AssessmentSetSchema,
  PermissionsCourseInstanceSchema,
  UserSchema,
} from '../lib/db-types.js';
import z from 'zod';

const sql = sqldb.loadSqlEquiv(import.meta.url);

const InstanceQuestionInfoSchema = z.object({
  id: z.number(),
  prev_instance_question: z.object({
    id: z.number(),
  }),
  next_instance_question: z.object({
    id: z.number(),
    sequence_locked: z.boolean(),
  }),
  question_number: z.number(),
  advance_score_perc: z.number().nullable(),
  sequence_locked: z.boolean(),
  instructor_question_number: z.number(),
});

const SelectAndAuthzInstanceQuestionSchema = z.object({
  assessment_instance: AssessmentInstanceSchema,
  assessment_instance_remaining_ms: z.number().nullable(),
  assessment_instance_time_limit_ms: z.number().nullable(),
  assessment_instance_time_limit_expired: z.boolean(),
  instance_user: UserSchema,
  instance_role: z.string(),
  instance_group: GroupSchema,
  instance_group_uid_list: z.array(z.string()),
  instance_question: InstanceQuestionSchema,
  instance_question_info: InstanceQuestionInfoSchema,
  assessment_question: AssessmentQuestionSchema,
  question: QuestionSchema,
  assessment: AssessmentSchema,
  assessment_set: AssessmentSetSchema,
  authz_result: PermissionsCourseInstanceSchema,
  assessment_instance_label: z.string(),
  file_list: z.array(FileSchema),
});

export async function selectAndAuthzInstanceQuestion(req: Request, res: Response) {
  const row = await sqldb.queryValidatedZeroOrOneRow(
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

  Object.assign(res.locals, row);
  if (res.locals.assessment.group_work) {
    res.locals.group_config = await getGroupConfig(res.locals.assessment.id);
    res.locals.group_info = await getGroupInfo(
      res.locals.assessment_instance.group_id,
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
          res.locals.assessment_instance.group_id,
          res.locals.authz_data.user.user_id,
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
