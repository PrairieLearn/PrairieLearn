import { z } from 'zod';

import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { CourseInstanceSchema, CourseSchema, UserSchema } from '../lib/db-types.js';

import type { AdministratorQueryResult } from './index.types.js';

const EnrolledUserSchema = z.object({
  user_id: UserSchema.shape.user_id,
  uid: UserSchema.shape.uid,
  name: UserSchema.shape.name,
  course_id: CourseSchema.shape.id,
  course: CourseSchema.shape.short_name,
  course_instance_id: CourseInstanceSchema.shape.id,
  course_instance: CourseInstanceSchema.shape.short_name,
});

const sql = loadSqlEquiv(import.meta.url);

export default async function (params: Record<string, any>): Promise<AdministratorQueryResult> {
  const rows = await queryRows(sql.generate_and_enroll_users, params, EnrolledUserSchema);
  return { rows, columns: Object.keys(EnrolledUserSchema.shape) };
}
