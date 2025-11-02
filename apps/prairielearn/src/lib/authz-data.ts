import assert from 'assert';

import * as sqldb from '@prairielearn/postgres';
import { run } from '@prairielearn/run';

import { selectLatestPublishingExtensionByEnrollment } from '../models/course-instance-publishing-extensions.js';
import { selectOptionalEnrollmentByUserId } from '../models/enrollment.js';

import { FullAuthzDataSchema, dangerousFullSystemAuthz } from './authz-data-lib.js';
import { type CourseInstance, type User } from './db-types.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

/**
 * If course_id is not provided, but course_instance_id is,
 * the function will use the course_id from the course instance.
 */
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
    FullAuthzDataSchema,
  );
}

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

  // We are after the end date. We might have access if we have an extension.
  // Only enrolled students can have extensions.
  if (!enrollment) {
    return { has_student_access: false, has_student_access_with_enrollment: false };
  }

  const latestPublishingExtension = await selectLatestPublishingExtensionByEnrollment({
    enrollment,
    // Our current authzData would say we can't access this, but we are actually building up
    // authzData with this function, so we use system auth to get the latest extension.
    authzData: dangerousFullSystemAuthz(),
    requestedRole: 'System',
  });

  // Check if we have access via extension.
  const hasAccessViaExtension =
    latestPublishingExtension !== null && reqDate < latestPublishingExtension.end_date;

  return {
    has_student_access: hasAccessViaExtension,
    has_student_access_with_enrollment: hasAccessViaExtension,
  };
}

/**
 * Builds the authorization data for a user on a page.
 *
 * @param params
 * @param params.authn_user - The authenticated user.
 * @param params.course_id - The ID of the course. Inferred from the course instance if null.
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
  assert(course_id !== null || course_instance_id !== null);

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

  const authzData = {
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
    ...run(() => {
      if (!isCourseInstance) return {};

      const {
        course_instance_role,
        has_course_instance_permission_view,
        has_course_instance_permission_edit,
        has_student_access,
        has_student_access_with_enrollment,
      } = rawAuthzData.permissions_course_instance;
      return {
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
    }),
  };

  // Only students and instructors in 'Student view' (users with role 'None') should run this code.
  if (
    rawAuthzData.course_instance?.modern_publishing &&
    authzData.course_instance_role === 'None'
  ) {
    // We use this access system instead of the legacy access system.
    const { has_student_access, has_student_access_with_enrollment } =
      await calculateModernCourseInstanceStudentAccess(
        rawAuthzData.course_instance,
        authzData.user.user_id,
        req_date,
      );
    authzData.has_student_access = has_student_access;
    authzData.has_student_access_with_enrollment = has_student_access_with_enrollment;
    authzData.authn_has_student_access = has_student_access;
    authzData.authn_has_student_access_with_enrollment = has_student_access_with_enrollment;
  }

  return {
    authzData,
    authzCourse: rawAuthzData.course,
    authzInstitution: rawAuthzData.institution,
    authzCourseInstance: rawAuthzData.course_instance,
  };
}
