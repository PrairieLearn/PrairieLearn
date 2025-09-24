import * as error from '@prairielearn/error';
import {
  execute,
  loadSqlEquiv,
  queryOptionalRow,
  queryRows,
  runInTransactionAsync,
} from '@prairielearn/postgres';

import {
  PotentialEnterpriseEnrollmentStatus,
  checkPotentialEnterpriseEnrollment,
} from '../ee/models/enrollment.js';
import {
  type Course,
  type CourseInstance,
  type Enrollment,
  EnrollmentSchema,
  type Institution,
} from '../lib/db-types.js';
import { isEnterprise } from '../lib/license.js';
import { HttpRedirect } from '../lib/redirect.js';
import { assertNever } from '../lib/types.js';

import { generateUsers, selectUserById } from './user.js';

const sql = loadSqlEquiv(import.meta.url);

export async function enrollInvitedUserInCourseInstance({
  course_instance_id,
  user_id,
  pending_uid,
}: {
  course_instance_id: string;
  user_id: string;
  pending_uid: string;
}): Promise<void> {
  await execute(sql.enroll_invited_user_in_course_instance, {
    course_instance_id,
    pending_uid,
    user_id,
  });
}

/**
 * Ensures that the user is enrolled in the given course instance. If the
 * enrollment already exists, this is a no-op.
 *
 * If the user was invited to the course instance, this will set the
 * enrollment status to 'joined'.
 */
export async function ensureEnrollment({
  course_instance_id,
  user_id,
}: {
  course_instance_id: string;
  user_id: string;
}): Promise<void> {
  const user = await selectUserById(user_id);
  const enrollment = await getEnrollmentForUserInCourseInstanceByPendingUid({
    course_instance_id,
    pending_uid: user.uid,
  });

  if (enrollment && enrollment.status === 'invited') {
    await enrollInvitedUserInCourseInstance({ course_instance_id, user_id, pending_uid: user.uid });
    return;
  }

  await execute(sql.ensure_enrollment, { course_instance_id, user_id });
}

/**
 * Ensures that the user is enrolled in the given course instance. If the
 * enrollment already exists, this is a no-op.
 *
 * For enterprise installations, this will also check if the user is eligible
 * for an enrollment. They are considered eligible if they have all required
 * plan grants and if their enrollment wouldn't cause an institution or course
 * instance enrollment limit to be exceeded.
 *
 * If the user was successfully enrolled, returns true. Otherwise, returns
 * false. If false is returned, the response has already been redirected to
 * an appropriate page.
 */
export async function ensureCheckedEnrollment({
  institution,
  course,
  course_instance,
  authz_data,
}: {
  institution: Institution;
  course: Course;
  course_instance: CourseInstance;
  authz_data: any;
}) {
  // Safety check: ensure the student would otherwise have access to the course.
  // If they don't, throw an access denied error. In most cases, this should
  // have already been checked.
  if (!authz_data.has_student_access) {
    throw new error.HttpStatusError(403, 'Access denied');
  }

  if (isEnterprise()) {
    const status = await checkPotentialEnterpriseEnrollment({
      institution,
      course,
      course_instance,
      authz_data,
    });

    switch (status) {
      case PotentialEnterpriseEnrollmentStatus.PLAN_GRANTS_REQUIRED:
        throw new HttpRedirect(`/pl/course_instance/${course_instance.id}/upgrade`);
      case PotentialEnterpriseEnrollmentStatus.LIMIT_EXCEEDED:
        throw new HttpRedirect('/pl/enroll/limit_exceeded');
      case PotentialEnterpriseEnrollmentStatus.ALLOWED:
        break;
      default:
        assertNever(status);
    }
  }

  await ensureEnrollment({
    course_instance_id: course_instance.id,
    user_id: authz_data.authn_user.user_id,
  });
}

export async function getEnrollmentForUserInCourseInstance({
  user_id,
  course_instance_id,
}): Promise<Enrollment | null> {
  return await queryOptionalRow(
    sql.select_enrollment_for_user_in_course_instance,
    { user_id, course_instance_id },
    EnrollmentSchema,
  );
}

export async function getEnrollmentForUserInCourseInstanceByPendingUid({
  pending_uid,
  course_instance_id,
}): Promise<Enrollment | null> {
  return await queryOptionalRow(
    sql.select_enrollment_for_user_in_course_instance_by_pending_uid,
    { pending_uid, course_instance_id },
    EnrollmentSchema,
  );
}

export async function generateAndEnrollUsers({
  count,
  course_instance_id,
}: {
  count: number;
  course_instance_id: string;
}) {
  return await runInTransactionAsync(async () => {
    const users = await generateUsers(count);
    for (const user of users) {
      await ensureEnrollment({ course_instance_id, user_id: user.user_id });
    }
    return users;
  });
}

/**
 * Gets enrollments for users with the specified UIDs in a course instance.
 */
export async function getEnrollmentsByUidsInCourseInstance({
  uids,
  course_instance_id,
}: {
  uids: string[];
  course_instance_id: string;
}): Promise<Enrollment[]> {
  return await queryRows(
    sql.select_enrollments_by_uids_in_course_instance,
    { uids, course_instance_id },
    EnrollmentSchema,
  );
}
