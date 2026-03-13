import { z } from 'zod';

import { IdSchema } from '@prairielearn/zod';

import { StaffStudentLabelSchema } from '../../lib/client/safe-db-types.js';

export const MAX_LABEL_UIDS = 1000;

const StudentLabelUserDataSchema = z.object({
  uid: z.string(),
  name: z.string().nullable(),
  enrollment_id: IdSchema,
});

export const StudentLabelWithUserDataSchema = z.object({
  student_label: StaffStudentLabelSchema,
  user_data: z.array(StudentLabelUserDataSchema),
});
export type StudentLabelWithUserData = z.infer<typeof StudentLabelWithUserDataSchema>;
