import { mapSeries } from 'async';
import { z } from 'zod';

import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { makeAssessmentInstance } from '../lib/assessment.js';
import {
  type AssessmentInstance,
  AssessmentSchema,
  CourseInstanceSchema,
  CourseSchema,
  GroupSchema,
  UserSchema,
} from '../lib/db-types.js';

import { type AdministratorQueryResult } from './util.js';

const sql = loadSqlEquiv(import.meta.url);

const GroupRowSchema = z.object({
  user_id: UserSchema.shape.user_id,
  uid: UserSchema.shape.uid,
  name: UserSchema.shape.name,
  group_name: GroupSchema.shape.name,
  course_id: CourseSchema.shape.id,
  course: CourseSchema.shape.short_name,
  course_instance_id: CourseInstanceSchema.shape.id,
  course_instance: CourseInstanceSchema.shape.short_name,
  assessment_id: AssessmentSchema.shape.id,
  assessment: AssessmentSchema.shape.title,
});
type GroupRow = z.infer<typeof GroupRowSchema>;

export default async function ({
  assessment_id,
  mode,
}: {
  assessment_id: string;
  mode: AssessmentInstance['mode'];
}): Promise<AdministratorQueryResult> {
  const groups = await queryRows(sql.select_groups, { assessment_id }, GroupRowSchema);
  const assessment_instances = await mapSeries(groups, async (group: GroupRow) => ({
    ...group,
    assessment_instance_id: await makeAssessmentInstance({
      assessment_id: group.assessment_id,
      user_id: group.user_id,
      group_work: true,
      authn_user_id: group.user_id,
      mode,
      date: new Date(),
      time_limit_min: null,
      client_fingerprint_id: null,
    }),
  }));

  return {
    rows: assessment_instances,
    columns: Object.keys(GroupRowSchema.shape).concat(['assessment_instance_id']),
  };
}
