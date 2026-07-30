import { z } from 'zod';

import { IdSchema } from '@prairielearn/zod';

import { StaffStudentLabelSchema } from '../../lib/client/safe-db-types.js';
import { UserSchema } from '../../lib/db-types.js';

export const MAX_LABEL_UIDS = 1000;

const StudentLabelUserDataSchema = z.object({
  uid: UserSchema.shape.uid,
  name: UserSchema.shape.name,
  enrollment_id: IdSchema,
});
export type StudentLabelUserData = z.infer<typeof StudentLabelUserDataSchema>;

export const StudentLabelWithUserDataSchema = z.object({
  student_label: StaffStudentLabelSchema,
  user_data: z.array(StudentLabelUserDataSchema),
});
export type StudentLabelWithUserData = z.infer<typeof StudentLabelWithUserDataSchema>;
