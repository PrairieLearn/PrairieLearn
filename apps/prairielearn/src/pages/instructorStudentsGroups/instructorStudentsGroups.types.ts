import { z } from 'zod';

import { IdSchema } from '@prairielearn/zod';

import { StudentGroupSchema } from '../../lib/db-types.js';

export const StudentGroupRowSchema = z.object({
  id: IdSchema,
  name: z.string(),
  student_count: z.coerce.number(),
});
export type StudentGroupRow = z.infer<typeof StudentGroupRowSchema>;

export const StudentGroupUserDataSchema = z.object({
  uid: z.string(),
  name: z.string().nullable(),
  enrollment_id: IdSchema,
});
export type StudentGroupUserData = z.infer<typeof StudentGroupUserDataSchema>;

export const StudentGroupWithUserDataSchema = z.object({
  student_group: StudentGroupSchema,
  user_data: z.array(StudentGroupUserDataSchema),
});
export type StudentGroupWithUserData = z.infer<typeof StudentGroupWithUserDataSchema>;
