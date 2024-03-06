import { Response } from 'express';
import { loadSqlEquiv, queryAsync, queryOptionalRow } from '@prairielearn/postgres';
import * as error from '@prairielearn/error';

import { Course, CourseInstance, Enrollment, EnrollmentSchema, Institution } from '../lib/db-types';
import { isEnterprise } from '../lib/license';
import {
  PotentialEnterpriseEnrollmentStatus,
  checkPotentialEnterpriseEnrollment,
} from '../ee/models/enrollment';
import { assertNever } from '../lib/types';

const sql = loadSqlEquiv(__filename);

export async function ensureEnrollment({
  course_instance_id,
  user_id,
}: {
  course_instance_id: string;
  user_id: string;
}): Promise<void> {
  await queryAsync(sql.ensure_enrollment, { course_instance_id, user_id });
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
  redirect,
}: {
  institution: Institution;
  course: Course;
  course_instance: CourseInstance;
  authz_data: any;
  redirect: Response['redirect'];
}): Promise<boolean> {
  // Safety check: ensure the student would otherwise have access to the course.
  // If they don't, throw an access denied error. In most cases, this should
  // have already been checked.
  if (!authz_data.has_student_access) {
    throw error.make(403, 'Access denied');
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
        redirect(`/pl/course_instance/${course_instance.id}/upgrade`);
        return false;
      case PotentialEnterpriseEnrollmentStatus.LIMIT_EXCEEDED:
        redirect('/pl/enroll/limit_exceeded');
        return false;
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

  return true;
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
