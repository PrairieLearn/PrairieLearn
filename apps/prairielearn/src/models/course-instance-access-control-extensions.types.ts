import { z } from 'zod';

import { CourseInstanceAccessControlExtensionSchema } from '../lib/db-types.js';

export const CourseInstanceAccessControlExtensionWithUsersSchema =
  CourseInstanceAccessControlExtensionSchema.extend({
    user_data: z.array(z.object({ uid: z.string(), name: z.string().nullable() })),
  });
export type CourseInstanceAccessControlExtensionWithUsers = z.infer<
  typeof CourseInstanceAccessControlExtensionWithUsersSchema
>;
