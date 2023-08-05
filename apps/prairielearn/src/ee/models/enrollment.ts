import { Response } from 'express';
import { z } from 'zod';
import { loadSqlEquiv, queryOptionalRow } from '@prairielearn/postgres';
import error = require('@prairielearn/error');

import { Institution, CourseInstance } from '../../lib/db-types';
import { checkPlanGrants } from '../lib/billing/plan-grants';
import { insertEnrollment } from '../../models/enrollment';

const sql = loadSqlEquiv(__filename);

const EnrollmentCountsSchema = z.object({
  paid: z.number().nullable(),
  free: z.number().nullable(),
});

interface EnrollmentCounts {
  paid: number;
  free: number;
}

export async function getEnrollmentCountsForInstitution({
  institution_id,
  created_since,
}: {
  institution_id: string;
  created_since: string;
}): Promise<EnrollmentCounts> {
  const result = await queryOptionalRow(
    sql.select_enrollment_counts_for_institution,
    { institution_id, created_since },
    EnrollmentCountsSchema,
  );

  return {
    paid: result?.paid ?? 0,
    free: result?.free ?? 0,
  };
}

export async function getEnrollmentCountsForCourseInstance(
  course_instance_id: string,
): Promise<EnrollmentCounts> {
  const result = await queryOptionalRow(
    sql.select_enrollment_counts_for_course_instance,
    { course_instance_id },
    EnrollmentCountsSchema,
  );

  return {
    paid: result?.paid ?? 0,
    free: result?.free ?? 0,
  };
}

/**
 * Inserts an enrollment into the database, but only if two checks pass:
 *
 * - The new enrollment must not push either the institution or the course instance
 *   over either of their enrollment limits.
 * - The user must have any necessary plan grants.
 *
 * This function will return `true` if the enrollment was successfully inserted.
 * Otherwise, it will redirect the user to the appropriate page and return `false`.
 */
export async function insertCheckedEnrollment(
  res: Response,
  {
    institution,
    course_instance,
    authz_data,
  }: {
    institution: Institution;
    course_instance: CourseInstance;
    authz_data: any;
  },
): Promise<boolean> {
  // Safety check: ensure the student would otherwise have access to the course.
  // If they don't, throw an access denied error. In most cases, this should
  // have already been checked.
  if (!authz_data.has_student_access) {
    throw error.make(403, 'Access denied');
  }

  const hasPlanGrants = await checkPlanGrants({
    institution,
    course_instance,
    authz_data,
  });

  if (!hasPlanGrants) {
    // The user does not have the necessary plan grants. Redirect them to the
    // upgrade page where they can purchase any necessary plans.
    res.redirect(`/pl/course_instance/${course_instance.id}/upgrade`);
    return false;
  }

  const institutionEnrollmentCounts = await getEnrollmentCountsForInstitution({
    institution_id: institution.id,
    created_since: '1 year',
  });
  const courseInstanceEnrollmentCounts = await getEnrollmentCountsForCourseInstance(
    course_instance.id,
  );

  const freeInstitutionEnrollmentCount = institutionEnrollmentCounts.free;
  const freeCourseInstanceEnrollmentCount = courseInstanceEnrollmentCounts.free;

  const yearlyEnrollmentLimit = institution.yearly_enrollment_limit;
  const courseInstanceEnrollmentLimit =
    course_instance.enrollment_limit ?? institution.course_instance_enrollment_limit;

  if (
    freeInstitutionEnrollmentCount + 1 > yearlyEnrollmentLimit ||
    freeCourseInstanceEnrollmentCount + 1 > courseInstanceEnrollmentLimit
  ) {
    // We would exceed an enrollment limit. We won't share any specific
    // details here. In the future, course staff will be able to check
    // their enrollment limits for themselves.
    res.redirect('/pl/enroll/limit_exceeded');
    return false;
  }

  await insertEnrollment({
    course_instance_id: course_instance.id,
    user_id: res.locals.authn_user.user_id,
  });

  return true;
}
