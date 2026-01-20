import { z } from 'zod';

import { IdSchema } from '@prairielearn/zod';

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
  student_group: z.object({
    id: IdSchema,
    name: z.string(),
    color: z.string().nullable(),
    course_instance_id: IdSchema,
    deleted_at: z.coerce.date().nullable(),
  }),
  user_data: z.array(StudentGroupUserDataSchema),
});
export type StudentGroupWithUserData = z.infer<typeof StudentGroupWithUserDataSchema>;
