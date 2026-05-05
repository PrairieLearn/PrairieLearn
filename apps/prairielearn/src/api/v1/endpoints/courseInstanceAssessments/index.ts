import * as path from 'node:path';

import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import z from 'zod';

import {
  MINUTE_IN_MILLISECONDS,
  SECOND_IN_MILLISECONDS,
  formatDateISO,
} from '@prairielearn/formatter';
import * as sqldb from '@prairielearn/postgres';

import {
  AssessmentAccessRuleSchema,
  AssessmentInstanceSchema,
  AssessmentSchema,
  AssessmentSetSchema,
  SprocTeamInfoSchema,
  SprocUsersGetDisplayedRoleSchema,
  UserSchema,
} from '../../../../lib/db-types.js';

const sql = sqldb.loadSql(path.join(import.meta.dirname, '..', 'queries.sql'));
const router = Router({ mergeParams: true });

const AssessmentDataSchema = z.object({
  assessment_id: AssessmentSchema.shape.id,
  assessment_name: AssessmentSchema.shape.tid,
  assessment_label: z.string(),
  type: AssessmentSchema.shape.type,
  assessment_number: AssessmentSchema.shape.number,
  assessment_order_by: AssessmentSchema.shape.order_by,
  title: AssessmentSchema.shape.title,
  assessment_set_id: AssessmentSchema.shape.assessment_set_id,
  assessment_set_abbreviation: AssessmentSetSchema.shape.abbreviation,
  assessment_set_name: AssessmentSetSchema.shape.name,
  assessment_set_number: AssessmentSetSchema.shape.number,
  assessment_set_heading: AssessmentSetSchema.shape.heading,
  assessment_set_color: AssessmentSetSchema.shape.color,
});

const AssessmentAccessRuleDataSchema = z.object({
  assessment_id: AssessmentSchema.shape.id,
  assessment_name: AssessmentSchema.shape.tid,
  assessment_title: AssessmentSchema.shape.title,
  assessment_label: z.string(),
  assessment_set_abbreviation: AssessmentSetSchema.shape.abbreviation,
  assessment_number: AssessmentSchema.shape.number,
  credit: AssessmentAccessRuleSchema.shape.credit,
  end_date: z.string().nullable(),
  exam_uuid: AssessmentAccessRuleSchema.shape.exam_uuid,
  assessment_access_rule_id: AssessmentAccessRuleSchema.shape.id,
  mode: AssessmentAccessRuleSchema.shape.mode,
  assessment_access_rule_number: AssessmentAccessRuleSchema.shape.number,
  password: AssessmentAccessRuleSchema.shape.password,
  show_closed_assessment: AssessmentAccessRuleSchema.shape.show_closed_assessment,
  show_closed_assessment_score: AssessmentAccessRuleSchema.shape.show_closed_assessment_score,
  start_date: z.string().nullable(),
  time_limit_min: AssessmentAccessRuleSchema.shape.time_limit_min,
  uids: AssessmentAccessRuleSchema.shape.uids,
});

export const AssessmentInstanceDataSchema = z.object({
  assessment_instance_id: AssessmentInstanceSchema.shape.id,
  assessment_id: AssessmentInstanceSchema.shape.assessment_id,
  assessment_name: AssessmentSchema.shape.tid,
  assessment_title: AssessmentSchema.shape.title,
  assessment_label: z.string(),
  assessment_set_abbreviation: AssessmentSetSchema.shape.abbreviation,
  assessment_number: AssessmentSchema.shape.number,
  user_id: UserSchema.shape.id.nullable(),
  user_uid: UserSchema.shape.uid.nullable(),
  user_uin: UserSchema.shape.uin.nullable(),
  user_name: UserSchema.shape.name.nullable(),
  user_role: SprocUsersGetDisplayedRoleSchema,
  max_points: AssessmentInstanceSchema.shape.max_points,
  max_bonus_points: AssessmentInstanceSchema.shape.max_bonus_points,
  points: AssessmentInstanceSchema.shape.points,
  score_perc: AssessmentInstanceSchema.shape.score_perc,
  assessment_instance_number: AssessmentInstanceSchema.shape.number,
  open: AssessmentInstanceSchema.shape.open,
  modified_at: AssessmentInstanceSchema.shape.modified_at,
  group_id: AssessmentInstanceSchema.shape.team_id.nullable(),
  group_name: SprocTeamInfoSchema.shape.name.nullable(),
  group_uids: SprocTeamInfoSchema.shape.uid_list.nullable(),
  date_limit: AssessmentInstanceSchema.shape.date_limit,
  date: AssessmentInstanceSchema.shape.date,
  duration: AssessmentInstanceSchema.shape.duration,
  highest_score: z.boolean(),
});

export function formatAssessmentInstanceDataForResponse(
  data: z.infer<typeof AssessmentInstanceDataSchema>,
  resLocals: Record<string, any>,
) {
  const { date_limit, date, duration, modified_at, ...instance } = data;
  return {
    ...instance,
    modified_at: formatDateISO(modified_at, resLocals.course_instance.display_timezone),
    time_remaining: instance.open
      ? date_limit
        ? Math.floor((date_limit.getTime() - Date.now()) / MINUTE_IN_MILLISECONDS) + ' min'
        : 'Open'
      : 'Closed',
    start_date: formatDateISO(date!, resLocals.course_instance.display_timezone),
    duration_seconds: duration ? duration / SECOND_IN_MILLISECONDS : null,
  };
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const data = await sqldb.queryRows(
      sql.select_assessments,
      {
        course_instance_id: res.locals.course_instance.id,
        unsafe_assessment_id: null,
      },
      AssessmentDataSchema,
    );
    res.status(200).send(data);
  }),
);

router.get(
  '/:unsafe_assessment_id(\\d+)',
  asyncHandler(async (req, res) => {
    const data = await sqldb.queryOptionalRow(
      sql.select_assessments,
      {
        course_instance_id: res.locals.course_instance.id,
        unsafe_assessment_id: req.params.unsafe_assessment_id,
      },
      AssessmentDataSchema,
    );
    if (data == null) {
      res.status(404).send({ message: 'Not Found' });
    } else {
      res.status(200).send(data);
    }
  }),
);

router.get(
  '/:unsafe_assessment_id(\\d+)/assessment_instances',
  asyncHandler(async (req, res) => {
    const data = await sqldb.queryRows(
      sql.select_assessment_instances,
      {
        course_instance_id: res.locals.course_instance.id,
        unsafe_assessment_id: req.params.unsafe_assessment_id,
        unsafe_assessment_instance_id: null,
      },
      AssessmentInstanceDataSchema,
    );
    res
      .status(200)
      .send(data.map((row) => formatAssessmentInstanceDataForResponse(row, res.locals)));
  }),
);

router.get(
  '/:unsafe_assessment_id(\\d+)/assessment_access_rules',
  asyncHandler(async (req, res) => {
    const data = await sqldb.queryRows(
      sql.select_assessment_access_rules,
      {
        course_instance_id: res.locals.course_instance.id,
        unsafe_assessment_id: req.params.unsafe_assessment_id,
      },
      AssessmentAccessRuleDataSchema,
    );
    res.status(200).send(data);
  }),
);

export default router;
