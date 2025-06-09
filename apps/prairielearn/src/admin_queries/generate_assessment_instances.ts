import { mapSeries } from 'async';
import { z } from 'zod';

import { loadSqlEquiv, queryRows, runInTransactionAsync } from '@prairielearn/postgres';

import { makeAssessmentInstance } from '../lib/assessment.js';
import {
  type AssessmentInstance,
  CourseInstanceSchema,
  CourseSchema,
  UserSchema,
} from '../lib/db-types.js';
import { selectOptionalAssessmentById } from '../models/assessment.js';

import { type AdministratorQueryResult } from './util.js';

const sql = loadSqlEquiv(import.meta.url);

const UserRowSchema = z.object({
  user_id: UserSchema.shape.user_id,
  uid: UserSchema.shape.uid,
  name: UserSchema.shape.name,
  course_id: CourseSchema.shape.id,
  course: CourseSchema.shape.short_name,
  course_instance_id: CourseInstanceSchema.shape.id,
  course_instance: CourseInstanceSchema.shape.short_name,
});
type UserRow = z.infer<typeof UserRowSchema>;
const GroupRowSchema = UserRowSchema.extend({
  group_name: z.string(),
});
type GroupRow = z.infer<typeof GroupRowSchema>;

export default async function ({
  assessment_id,
  mode,
}: {
  assessment_id: string;
  mode: AssessmentInstance['mode'];
}): Promise<AdministratorQueryResult> {
  return await runInTransactionAsync(async () => {
    const columns = Object.keys(UserRowSchema.shape).concat([
      'assessment_id',
      'assessment',
      'assessment_instance_id',
    ]);
    const assessment = await selectOptionalAssessmentById(assessment_id);
    if (!assessment) return { rows: [], columns };

    const users = assessment.group_work
      ? await queryRows(sql.select_groups, { assessment_id }, GroupRowSchema)
      : await queryRows(sql.select_users, { assessment_id }, UserRowSchema);
    if (assessment.group_work) columns.splice(0, 0, 'group_name');

    const rows = await mapSeries(users, async (user: UserRow | GroupRow) => ({
      ...user,
      assessment_id: assessment.id,
      assessment: assessment.title,
      assessment_instance_id: await makeAssessmentInstance({
        assessment,
        user_id: user.user_id,
        authn_user_id: user.user_id,
        mode,
        date: new Date(),
        time_limit_min: null,
        client_fingerprint_id: null,
      }),
    }));

    return { rows, columns };
  });
}
