import z from 'zod';

import * as sqldb from '@prairielearn/postgres';

import {
  CourseInstanceSchema,
  CourseSchema,
  type EnumCourseInstanceRole,
  EnumModeReasonSchema,
  EnumModeSchema,
  InstitutionSchema,
  SprocAuthzCourseInstanceSchema,
  SprocAuthzCourseSchema,
  type User,
} from './db-types.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

export const SelectAuthzDataSchema = z.object({
  mode: EnumModeSchema,
  mode_reason: EnumModeReasonSchema,
  course: CourseSchema,
  institution: InstitutionSchema,
  course_instance: CourseInstanceSchema.nullable(),
  permissions_course: SprocAuthzCourseSchema,
  permissions_course_instance: SprocAuthzCourseInstanceSchema,
});

export type SelectAuthzData = z.infer<typeof SelectAuthzDataSchema>;

export async function selectAuthzData({
  user_id,
  course_id,
  course_instance_id,
  is_administrator,
  allow_example_course_override,
  ip,
  req_date,
  req_mode,
  req_course_role,
  req_course_instance_role,
}: {
  user_id: string;
  course_id: string | null;
  course_instance_id: string | null;
  is_administrator: boolean;
  allow_example_course_override: boolean;
  ip: string | null;
  req_date: Date;
  req_mode: string | null;
  req_course_role: string | null;
  req_course_instance_role: string | null;
}) {
  return sqldb.queryOptionalRow(
    sql.select_authz_data,
    {
      user_id,
      course_id,
      course_instance_id,
      is_administrator,
      allow_example_course_override,
      ip,
      req_date,
      req_mode,
      req_course_role,
      req_course_instance_role,
    },
    SelectAuthzDataSchema,
  );
}

/**
 * Builds the authorization data for a user on a page.
 *
 * @param params
 * @param params.authn_user - The authenticated user.
 * @param params.course_id - The ID of the course.
 * @param params.course_instance_id - The ID of the course instance.
 * @param params.is_administrator - Whether the user is an administrator.
 * @param params.ip - The IP address of the request.
 * @param params.req_date - The date of the request.
 * @param params.req_mode - The mode of the request.
 */
export async function buildAuthzData({
  authn_user,
  course_id,
  course_instance_id,
  is_administrator,
  ip,
  req_date,
  req_mode = null,
}: {
  authn_user: User;
  course_id: string | null;
  course_instance_id: string | null;
  is_administrator: boolean;
  ip: string | null;
  req_date: Date;
  req_mode?: string | null;
}) {
  const isCourseInstance = Boolean(course_instance_id);

  const rawAuthzData = await selectAuthzData({
    user_id: authn_user.user_id,
    course_id,
    course_instance_id,
    is_administrator,
    allow_example_course_override: true,
    ip,
    req_date,
    req_mode,
    req_course_role: null,
    req_course_instance_role: null,
  });

  if (rawAuthzData === null) {
    return {
      authzData: null,
      authzCourse: null,
      authzInstitution: null,
      authzPermissionsCourse: null,
      authzCourseInstance: null,
    };
  }

  const permissions_course = rawAuthzData.permissions_course;

  let authzData = {
    authn_user: structuredClone(authn_user),
    authn_mode: rawAuthzData.mode,
    authn_mode_reason: rawAuthzData.mode_reason,
    authn_is_administrator: is_administrator,
    authn_course_role: permissions_course.course_role,
    authn_has_course_permission_preview: permissions_course.has_course_permission_preview,
    authn_has_course_permission_view: permissions_course.has_course_permission_view,
    authn_has_course_permission_edit: permissions_course.has_course_permission_edit,
    authn_has_course_permission_own: permissions_course.has_course_permission_own,
    user: structuredClone(authn_user),
    mode: rawAuthzData.mode,
    mode_reason: rawAuthzData.mode_reason,
    is_administrator,
    course_role: permissions_course.course_role,
    has_course_permission_preview: permissions_course.has_course_permission_preview,
    has_course_permission_view: permissions_course.has_course_permission_view,
    has_course_permission_edit: permissions_course.has_course_permission_edit,
    has_course_permission_own: permissions_course.has_course_permission_own,
    // Course instance fields are undefined
    authn_course_instance_role: undefined as EnumCourseInstanceRole | undefined,
    authn_has_course_instance_permission_view: undefined as boolean | undefined,
    authn_has_course_instance_permission_edit: undefined as boolean | undefined,
    authn_has_student_access: undefined as boolean | undefined,
    authn_has_student_access_with_enrollment: undefined as boolean | undefined,
    course_instance_role: undefined as EnumCourseInstanceRole | undefined,
    has_course_instance_permission_view: undefined as boolean | undefined,
    has_course_instance_permission_edit: undefined as boolean | undefined,
    has_student_access_with_enrollment: undefined as boolean | undefined,
    has_student_access: undefined as boolean | undefined,
  };

  if (isCourseInstance) {
    const {
      course_instance_role,
      has_course_instance_permission_view,
      has_course_instance_permission_edit,
      has_student_access,
      has_student_access_with_enrollment,
    } = rawAuthzData.permissions_course_instance;
    authzData = {
      ...authzData,
      authn_course_instance_role: course_instance_role,
      authn_has_course_instance_permission_view: has_course_instance_permission_view,
      authn_has_course_instance_permission_edit: has_course_instance_permission_edit,
      authn_has_student_access: has_student_access,
      authn_has_student_access_with_enrollment: has_student_access_with_enrollment,
      course_instance_role,
      has_course_instance_permission_view,
      has_course_instance_permission_edit,
      has_student_access_with_enrollment,
      has_student_access,
    };
  }

  return {
    authzData,
    authzCourse: rawAuthzData.course,
    authzInstitution: rawAuthzData.institution,
    authzCourseInstance: rawAuthzData.course_instance,
  };
}
