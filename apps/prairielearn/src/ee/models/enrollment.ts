import { z } from 'zod';
import { loadSqlEquiv, queryOptionalRow } from '@prairielearn/postgres';

import { Institution, Course, CourseInstance } from '../../lib/db-types';
import { checkPlanGrants } from '../lib/billing/plan-grants';
import { getPlanGrantsForContext, getPlanNamesFromPlanGrants } from '../lib/billing/plans';
import { planGrantsMatchPlanFeatures } from '../lib/billing/plans-types';

const sql = loadSqlEquiv(__filename);

const EnrollmentCountsSchema = z.object({
  paid: z.number().nullable(),
  free: z.number().nullable(),
});

interface EnrollmentCounts {
  paid: number;
  free: number;
}

/**
 * Returns counts of free and paid enrollments for the given institution.
 * Enrollments are counted during the time period spanning from the current
 * time back to the given `created_since` time, which is a Postgres interval
 * string like '1 year' or '6 months'.
 */
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

/**
 * Returns counts of free and paid enrollments for the given course.
 * Enrollments are counted during the time period spanning from the current
 * time back to the given `created_since` time, which is a Postgres interval
 * string like '1 year' or '6 months'.
 */
export async function getEnrollmentCountsForCourse({
  course_id,
  created_since,
}: {
  course_id: string;
  created_since: string;
}): Promise<EnrollmentCounts> {
  const result = await queryOptionalRow(
    sql.select_enrollment_counts_for_course,
    {
      course_id,
      created_since,
    },
    EnrollmentCountsSchema,
  );

  return {
    paid: result?.paid ?? 0,
    free: result?.free ?? 0,
  };
}

/**
 * Returns counts of free and paid enrollments for the given course instance.
 */
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

export enum PotentialEnterpriseEnrollmentStatus {
  ALLOWED = 'allowed',
  LIMIT_EXCEEDED = 'limit_exceeded',
  PLAN_GRANTS_REQUIRED = 'plan_grants_required',
}

/**
 * Performs enterprise-specific checks for a potential enrollment:
 *
 * - The new enrollment must not push either the institution or the course instance
 *   over either of their enrollment limits.
 * - The user must have any necessary plan grants.
 *
 * This function will return `true` if the enrollment would be allowed.
 * Otherwise, it will redirect the user to the appropriate page and
 * return `false`.
 */
export async function checkPotentialEnterpriseEnrollment({
  institution,
  course,
  course_instance,
  authz_data,
}: {
  institution: Institution;
  course: Course;
  course_instance: CourseInstance;
  authz_data: any;
}): Promise<PotentialEnterpriseEnrollmentStatus> {
  const hasPlanGrants = await checkPlanGrants({
    institution,
    course_instance,
    authz_data,
  });

  if (!hasPlanGrants) {
    return PotentialEnterpriseEnrollmentStatus.PLAN_GRANTS_REQUIRED;
  }

  // Check if the user is a paid user. If they are, we'll bypass any enrollment
  // limits entirely.
  //
  // This helps avoid a specific edge case. Consider a course instance with an
  // enrollment limit of 20 where 20 free users have enrolled. Next, we enable
  // student billing. If we then have a user pay and try to enroll, we need to
  // ensure that they can enroll even though the enrollment limit has been
  // reached. In the past, without specifically checking if the user was a paid
  // user, we would have blocked the enrollment.
  const planGrants = await getPlanGrantsForContext({
    institution_id: institution.id,
    course_instance_id: course_instance.id,
    user_id: authz_data.user.user_id,
  });
  const planNames = getPlanNamesFromPlanGrants(planGrants);
  if (planGrantsMatchPlanFeatures(planNames, ['basic'])) {
    return PotentialEnterpriseEnrollmentStatus.ALLOWED;
  }

  // Note that this check is susceptible to race conditions: if two users
  // enroll at the same time, they may both be able to enroll even if the
  // enrollment limit would be exceeded. We've decided that this is
  // acceptable behavior as we don't really care if the enrollment limit is
  // exceeded by one or two users. Future enrollments will still be blocked,
  // which will prompt course/institution staff to seek an increase in their
  // enrollment limit.
  const institutionEnrollmentCounts = await getEnrollmentCountsForInstitution({
    institution_id: institution.id,
    created_since: '1 year',
  });
  const courseEnrollmentCounts = await getEnrollmentCountsForCourse({
    course_id: course_instance.course_id,
    created_since: '1 year',
  });
  const courseInstanceEnrollmentCounts = await getEnrollmentCountsForCourseInstance(
    course_instance.id,
  );

  const freeInstitutionEnrollmentCount = institutionEnrollmentCounts.free;
  const freeCourseEnrollmentCount = courseEnrollmentCounts.free;
  const freeCourseInstanceEnrollmentCount = courseInstanceEnrollmentCounts.free;

  // If both an institutional and course yearly enrollment limit are defined, we'll
  // always enforce both of them. That is, the institutional yearly enrollment limit
  // always applies, and the course yearly enrollment can only serve as a tighter
  // bound on that.
  //
  // If a course yearly enrollment limit is not defined, we'll use the institutional
  // enrollment limit as the upper bound, as the number of enrollments in the course
  // must by definition be less than or equal to the number of enrollments in the
  // institution as a whole.
  const institutionYearlyEnrollmentLimit = institution.yearly_enrollment_limit;
  const courseYearlyEnrollmentLimit =
    course.yearly_enrollment_limit ?? institutionYearlyEnrollmentLimit;
  const courseInstanceEnrollmentLimit =
    course_instance.enrollment_limit ??
    course.course_instance_enrollment_limit ??
    institution.course_instance_enrollment_limit;

  if (
    freeInstitutionEnrollmentCount + 1 > institutionYearlyEnrollmentLimit ||
    freeCourseEnrollmentCount + 1 > courseYearlyEnrollmentLimit ||
    freeCourseInstanceEnrollmentCount + 1 > courseInstanceEnrollmentLimit
  ) {
    return PotentialEnterpriseEnrollmentStatus.LIMIT_EXCEEDED;
  }

  return PotentialEnterpriseEnrollmentStatus.ALLOWED;
}
