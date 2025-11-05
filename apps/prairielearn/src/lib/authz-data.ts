import assert from 'assert';

import * as sqldb from '@prairielearn/postgres';
import { run } from '@prairielearn/run';

import {
  type ConstructedCourseOrInstanceContext,
  CourseOrInstanceContextDataSchema,
  calculateCourseInstanceRolePermissions,
  calculateCourseRolePermissions,
} from './authz-data-lib.js';
import {
  type EnumCourseInstanceRole,
  type EnumCourseRole,
  type EnumMode,
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
 * @param params.overrides - The overrides to apply to the authorization data.
 * @param params.overrides.is_administrator - Whether the user is an administrator.
 * @param params.overrides.req_mode - The requested mode to use.
 * @param params.overrides.req_course_role - The requested course role to use.
 * @param params.overrides.req_course_instance_role - The requested course instance role to use.
 * @param params.overrides.allow_example_course_override - Whether to allow overriding the course role for example courses.
 */
export async function constructCourseOrInstanceContext({
  user,
  course_id,
  course_instance_id,
  ip,
  req_date,
  overrides,
}: {
  user: User;
  course_id: string | null;
  course_instance_id: string | null;
  ip: string | null;
  req_date: Date;
  overrides: {
    is_administrator: boolean;
    req_mode?: EnumMode;
    req_course_role?: EnumCourseRole;
    req_course_instance_role?: EnumCourseInstanceRole;
    allow_example_course_override?: boolean;
  };
}): Promise<ConstructedCourseOrInstanceContext> {
  const resolvedOverrides = {
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
    if (resolvedOverrides.req_course_role != null) {
      return resolvedOverrides.req_course_role;
    }
    if (resolvedOverrides.is_administrator) {
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
    if (resolvedOverrides.req_course_instance_role != null) {
      return resolvedOverrides.req_course_instance_role;
    }
    if (resolvedOverrides.is_administrator) {
      return 'Student Data Editor';
    }
    return rawAuthzData.permissions_course_instance.course_instance_role;
  });

  const mode = run(() => {
    if (resolvedOverrides.req_mode != null) {
      return resolvedOverrides.req_mode;
    }
    return rawAuthzData.mode;
  });

  const hasCourseAccess = course_role !== 'None';
  const hasCourseInstanceAccess =
    isCourseInstance &&
    (course_instance_role !== 'None' ||
      rawAuthzData.permissions_course_instance.has_student_access);

  // If you don't have course or course instance access, return null.
  if (!hasCourseAccess && !hasCourseInstanceAccess) {
    return {
      authzData: null,
      course: null,
      institution: null,
      courseInstance: null,
    };
  }

  const authzData = {
    user,
    mode,
    mode_reason: rawAuthzData.mode_reason,
    course_role,
    ...calculateCourseRolePermissions(course_role),
    ...run(() => {
      if (!isCourseInstance) return {};

      const { has_student_access, has_student_access_with_enrollment } =
        rawAuthzData.permissions_course_instance;
      return {
        course_instance_role,
        has_student_access_with_enrollment,
        has_student_access,
        ...calculateCourseInstanceRolePermissions(course_instance_role),
      };
    }),
  };

  return {
    authzData,
    course: rawAuthzData.course,
    institution: rawAuthzData.institution,
    courseInstance: rawAuthzData.course_instance,
  };
}
