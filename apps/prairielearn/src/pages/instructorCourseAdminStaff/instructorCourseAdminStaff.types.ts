import { z } from 'zod';

import {
  CourseInstancePermissionSchema,
  CourseInstanceSchema,
  CoursePermissionSchema,
  UserSchema,
} from '../../lib/db-types.js';

const CourseInstanceRoleRowSchema = z.object({
  id: CourseInstanceSchema.shape.id,
  short_name: CourseInstanceSchema.shape.short_name,
  course_instance_permission_id: CourseInstancePermissionSchema.shape.id,
  course_instance_role: CourseInstancePermissionSchema.shape.course_instance_role,
  course_instance_role_formatted: z.string(),
});
export const CourseUsersRowSchema = z.object({
  user: UserSchema,
  course_permission: CoursePermissionSchema,
  course_instance_roles: CourseInstanceRoleRowSchema.array().nullable(),
  other_course_instances: z
    .array(
      z.object({
        id: CourseInstanceSchema.shape.id,
        short_name: CourseInstanceSchema.shape.short_name,
      }),
    )
    .nullable(),
});
export type CourseUsersRow = z.infer<typeof CourseUsersRowSchema>;
