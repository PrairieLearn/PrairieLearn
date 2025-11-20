import { z } from 'zod';

import { CourseInstancePublishingExtensionSchema, IdSchema } from '../../lib/db-types.js';

export const CourseInstancePublishingExtensionWithUsersSchema =
  CourseInstancePublishingExtensionSchema.extend({
    user_data: z.array(
      z.object({ uid: z.string(), name: z.string().nullable(), enrollment_id: IdSchema }),
    ),
  });
export type CourseInstancePublishingExtensionWithUsers = z.infer<
  typeof CourseInstancePublishingExtensionWithUsersSchema
>;
