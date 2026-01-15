import { z } from 'zod';

import { IdSchema } from '@prairielearn/zod';

import {
  StaffCourseInstancePublishingExtensionSchema,
  StaffUserSchema,
} from '../../lib/client/safe-db-types.js';

export const CourseInstancePublishingExtensionRowSchema = z.object({
  course_instance_publishing_extension: StaffCourseInstancePublishingExtensionSchema,
  user_data: z.array(
    z.object({
      uid: StaffUserSchema.unwrap().shape.uid,
      name: StaffUserSchema.unwrap().shape.name,
      enrollment_id: IdSchema,
    }),
  ),
});
export type CourseInstancePublishingExtensionRow = z.infer<
  typeof CourseInstancePublishingExtensionRowSchema
>;
