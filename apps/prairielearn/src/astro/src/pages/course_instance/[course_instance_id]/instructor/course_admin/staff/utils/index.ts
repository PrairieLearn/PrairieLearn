import { z } from 'zod';
import {
  type CourseInstance,
  CourseInstanceSchema,
  CourseInstancePermissionSchema,
  CoursePermissionSchema,
  type User,
  UserSchema,
} from '../../../../../../../../../lib/db-types.js';

export const CourseUsersRowSchema = z.object({
  user: UserSchema,
  course_permission: CoursePermissionSchema,
  course_instance_roles: z
    .array(
      z.object({
        id: CourseInstanceSchema.shape.id,
        short_name: CourseInstanceSchema.shape.short_name,
        course_instance_permission_id: CourseInstancePermissionSchema.shape.id,
        course_instance_role: CourseInstancePermissionSchema.shape.course_instance_role,
        course_instance_role_formatted: z.string(),
      }),
    )
    .nullable(),
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

export function hasUnknownUsers(courseUsers: CourseUsersRow[]) {
  return courseUsers.some((courseUser) => courseUser.user.name == null);
}

export const MAX_UIDS = 100;
