import assert from 'assert';

import z from 'zod';

import * as sqldb from '@prairielearn/postgres';
import { run } from '@prairielearn/run';

import { selectOptionalEnrollmentByUserId } from '../models/enrollment.js';

import {
  type ConstructedCourseOrInstanceContext,
  CourseOrInstanceContextDataSchema,
  calculateCourseInstanceRolePermissions,
  calculateCourseRolePermissions,
  dangerousFullSystemAuthz,
} from './authz-data-lib.js';
import {
  type CourseInstance,
  EnumCourseInstanceRoleSchema,
  EnumCourseRoleSchema,
  EnumModeSchema,
  type User,
} from './db-types.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

/**
 * If `course_id` is not provided, but `course_instance_id` is,
 * the function will use the `course_id` from the course instance.
 */
async function selectCourseOrInstanceContextData({
  user_id,
  course_id,
  course_instance_id,
  ip,
  req_date,
}: {
  user_id: string;
  course_id: string | null;
  course_instance_id: string | null;
  ip: string | null;
  req_date: Date;
}) {
  return sqldb.queryOptionalRow(
    sql.select_course_or_instance_context_data,
    {
      user_id,
      course_id,
      course_instance_id,
      ip,
      req_date,
    },
    CourseOrInstanceContextDataSchema,
  );
}

export const CourseOrInstanceOverridesSchema = z.object({
  mode: EnumModeSchema.nullable().optional(),
  course_role: EnumCourseRoleSchema.nullable().optional(),
  course_instance_role: EnumCourseInstanceRoleSchema.nullable().optional(),
  allow_example_course_override: z.boolean().optional(),
});
type CourseOrInstanceOverrides = z.infer<typeof CourseOrInstanceOverridesSchema>;

/**
 * Checks if the user has access to the course instance. If the user is a student,
 * the course instance must be published to them.
 *
 * @param courseInstance - The course instance to check access for.
 * @param userId - The ID of the user to check access for.
 * @param reqDate - The date of the request.
 */
export async function calculateModernCourseInstanceStudentAccess(
  courseInstance: CourseInstance,
  userId: string,
  reqDate: Date,
) {
  // This function should only be called for course instances that are using
  // modern publishing configs.
  assert(courseInstance.modern_publishing);

  // We can't trust the authzData to have the correct permissioning,
  // so we need to use system auth to get the enrollment.
  const enrollment = await selectOptionalEnrollmentByUserId({
    userId,
    requestedRole: 'System',
    authzData: dangerousFullSystemAuthz(),
    courseInstance,
  });

  // Not published at all.
  if (courseInstance.publishing_start_date == null) {
    return { has_student_access: false, has_student_access_with_enrollment: false };
  }

  // End date is always set alongside start date
  assert(courseInstance.publishing_end_date != null);

  // Before the start date, we definitely don't have access.
  if (reqDate < courseInstance.publishing_start_date) {
    return { has_student_access: false, has_student_access_with_enrollment: false };
  }

  // If we are before the end date and after the start date, we definitely have access.
  if (reqDate < courseInstance.publishing_end_date) {
    return { has_student_access: true, has_student_access_with_enrollment: enrollment != null };
  }

  return { has_student_access: false, has_student_access_with_enrollment: false };
}

/**
 * Builds the authorization data for a user on a page. The optional parameters are used for effective user overrides,
 * most scenarios should not need to change these parameters.
 *
 * @param params
 * @param params.user - The authenticated user.
 * @param params.course_id - The ID of the course. Inferred from the course instance if null.
 * @param params.course_instance_id - The ID of the course instance.
 * @param params.ip - The IP address of the request.
 * @param params.req_date - The date of the request.
 * @param params.is_administrator - Whether the user is an administrator.
 * @param params.overrides - The overrides to apply to the authorization data.
 */
export async function constructCourseOrInstanceContext({
  user,
  course_id,
  course_instance_id,
  ip,
  req_date,
  is_administrator,
  overrides = {},
}: {
  user: User;
  course_id: string | null;
  course_instance_id: string | null;
  ip: string | null;
  req_date: Date;
  is_administrator: boolean;
  overrides?: CourseOrInstanceOverrides;
}): Promise<ConstructedCourseOrInstanceContext> {
  const resolvedOverrides = {
    mode: null,
    course_role: null,
    course_instance_role: null,
    allow_example_course_override: true,
    ...overrides,
  };
  assert(course_id !== null || course_instance_id !== null);

  const isCourseInstance = Boolean(course_instance_id);

  const rawAuthzData = await selectCourseOrInstanceContextData({
    user_id: user.user_id,
    course_id,
    course_instance_id,
    ip,
    req_date,
  });

  if (rawAuthzData === null) {
    return {
      authzData: null,
      course: null,
      institution: null,
      courseInstance: null,
    };
  }

  const course_role = run(() => {
    if (resolvedOverrides.course_role != null) {
      return resolvedOverrides.course_role;
    }
    if (is_administrator) {
      return 'Owner';
    }

    if (rawAuthzData.course.example_course) {
      // If the course is an example course and the override is allowed, return Viewer.
      if (
        resolvedOverrides.allow_example_course_override &&
        // If we can step _up_ to Viewer, do so.
        // We don't want to accidentally decrease the role of an existing user.
        ['None', 'Previewer'].includes(rawAuthzData.permissions_course.course_role)
      ) {
        return 'Viewer';
      }

      // Otherwise, return the actual role.
      return rawAuthzData.permissions_course.course_role;
    }

    return rawAuthzData.permissions_course.course_role;
  });

  const course_instance_role = run(() => {
    if (resolvedOverrides.course_instance_role != null) {
      return resolvedOverrides.course_instance_role;
    }
    if (is_administrator) {
      return 'Student Data Editor';
    }
    return rawAuthzData.permissions_course_instance.course_instance_role;
  });

  const mode = resolvedOverrides.mode ?? rawAuthzData.mode;

  const authzData = {
    user,
    mode,
    mode_reason: rawAuthzData.mode_reason,
    course_role,
    ...calculateCourseRolePermissions(course_role),
    ...(await run(async () => {
      if (isCourseInstance) {
        return {
          course_instance_role,
          ...calculateCourseInstanceRolePermissions(course_instance_role),

          ...(await run(async () => {
            assert(rawAuthzData.course_instance != null);
            if (rawAuthzData.course_instance.modern_publishing) {
              return await calculateModernCourseInstanceStudentAccess(
                rawAuthzData.course_instance,
                user.user_id,
                req_date,
              );
            }
            return {
              has_student_access: rawAuthzData.permissions_course_instance.has_student_access,
              has_student_access_with_enrollment:
                rawAuthzData.permissions_course_instance.has_student_access_with_enrollment,
            };
          })),
        };
      }
    })),
  };

  const hasCourseAccess = course_role !== 'None';
  const hasCourseInstanceAccess =
    isCourseInstance && (course_instance_role !== 'None' || authzData.has_student_access);

  // If you don't have course or course instance access, return null.
  if (!hasCourseAccess && !hasCourseInstanceAccess) {
    return {
      authzData: null,
      course: null,
      institution: null,
      courseInstance: null,
    };
  }

  return {
    authzData,
    course: rawAuthzData.course,
    institution: rawAuthzData.institution,
    courseInstance: rawAuthzData.course_instance,
  };
}
