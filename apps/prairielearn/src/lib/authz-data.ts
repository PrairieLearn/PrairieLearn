import assert from 'assert';

import * as sqldb from '@prairielearn/postgres';
import { run } from '@prairielearn/run';

import { FullAuthzDataSchema } from './authz-data-lib.js';
import {
  type EnumCourseInstanceRole,
  type EnumCourseRole,
  type EnumMode,
  type EnumModeReason,
  type User,
} from './db-types.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

/**
 * If course_id is not provided, but course_instance_id is,
 * the function will use the course_id from the course instance.
 */
async function selectAuthzData({
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
  /**
   * IF is_administrator THEN
   * course_instance_role := 'Student Data Editor';
   * END IF;
   *
   * IF req_course_instance_role IS NOT NULL THEN
   * course_instance_role := req_course_instance_role;
   * END IF;
   */
  return sqldb.queryOptionalRow(
    sql.select_authz_data,
    {
      user_id,
      course_id,
      course_instance_id,
      ip,
      req_date,
    },
    FullAuthzDataSchema,
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
 * @param params.overrides.req_mode - The mode to request.
 * @param params.overrides.req_course_role - The course role to request.
 * @param params.overrides.req_course_instance_role - The course instance role to request.
 * @param params.overrides.allow_example_course_override - Whether to allow overriding the course role for example courses.
 */
export async function calculateAuthData({
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
}) {
  const resolvedOverrides = {
    allow_example_course_override: true,
    ...overrides,
  };
  assert(course_id !== null || course_instance_id !== null);

  const isCourseInstance = Boolean(course_instance_id);

  const rawAuthzData = await selectAuthzData({
    user_id: user.user_id,
    course_id,
    course_instance_id,
    ip,
    req_date,
  });

  if (rawAuthzData === null) {
    return {
      authResult: null,
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

    // If the course is an example course and the override is not allowed, return None.
    if (rawAuthzData.course.example_course && !resolvedOverrides.allow_example_course_override) {
      return 'None';
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

  const authResult = {
    user,
    mode,
    mode_reason: rawAuthzData.mode_reason,
    course_role,
    ...calculateCourseRolePermissions(course_role),
    ...run<{
      course_instance_role?: EnumCourseInstanceRole;
      has_student_access_with_enrollment?: boolean;
      has_student_access?: boolean;
      has_course_instance_permission_view?: boolean;
      has_course_instance_permission_edit?: boolean;
    }>(() => {
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
    authResult,
    course: rawAuthzData.course,
    institution: rawAuthzData.institution,
    courseInstance: rawAuthzData.course_instance,
  };
}

export type CalculateAuthDataResult = Awaited<ReturnType<typeof calculateAuthData>>;
export type CalculateAuthDataSuccessResult = Exclude<CalculateAuthDataResult, { authResult: null }>;

export async function calculateFallbackAuthData({
  user,
  includeCourseInstance,
  mode,
  mode_reason,
}: {
  user: User;
  includeCourseInstance: boolean;
  mode: EnumMode;
  mode_reason: EnumModeReason;
}) {
  return {
    user,
    is_administrator: false,
    course_role: 'None',
    mode,
    mode_reason,
    ...calculateCourseRolePermissions('None'),
    ...run(() => {
      if (includeCourseInstance) {
        return {
          course_instance_role: 'None',
          has_student_access: false,
          has_student_access_with_enrollment: false,
          ...calculateCourseInstanceRolePermissions('None'),
        };
      }
      return {};
    }),
  };
}
export function calculateCourseRolePermissions(role: EnumCourseRole) {
  return {
    has_course_permission_preview: ['Previewer', 'Viewer', 'Editor', 'Owner'].includes(role),
    has_course_permission_view: ['Viewer', 'Editor', 'Owner'].includes(role),
    has_course_permission_edit: ['Editor', 'Owner'].includes(role),
    has_course_permission_own: ['Owner'].includes(role),
  };
}

export function calculateCourseInstanceRolePermissions(role: EnumCourseInstanceRole) {
  return {
    has_course_instance_permission_view: ['Student Data Viewer', 'Student Data Editor'].includes(
      role,
    ),
    has_course_instance_permission_edit: ['Student Data Editor'].includes(role),
  };
}
