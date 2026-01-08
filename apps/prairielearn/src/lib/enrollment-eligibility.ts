import type { CourseInstance, Enrollment } from './db-types.js';

export type EnrollmentIneligibilityReason =
  | 'blocked'
  | 'self-enrollment-disabled'
  | 'self-enrollment-expired'
  | 'institution-restriction';

export interface EnrollmentEligibilityResult {
  eligible: boolean;
  reason?: EnrollmentIneligibilityReason;
}

/**
 * Check if a user is eligible to self-enroll in a course instance.
 *
 * This function checks:
 * 1. If the user is blocked from the course
 * 2. If self-enrollment is enabled for the course instance
 * 3. If self-enrollment has expired
 * 4. If the institution restriction is satisfied (user's institution matches course's institution)
 *
 * Note: This function does NOT check if the user is already enrolled. That check
 * should be done separately if needed.
 */
export function checkEnrollmentEligibility({
  userInstitutionId,
  courseInstitutionId,
  courseInstance,
  existingEnrollment,
}: {
  userInstitutionId: string;
  courseInstitutionId: string;
  courseInstance: CourseInstance;
  existingEnrollment: Pick<Enrollment, 'status'> | null;
}): EnrollmentEligibilityResult {
  // Check if user is blocked
  if (existingEnrollment?.status === 'blocked') {
    return { eligible: false, reason: 'blocked' };
  }

  // Check if self-enrollment is enabled
  if (!courseInstance.self_enrollment_enabled) {
    return { eligible: false, reason: 'self-enrollment-disabled' };
  }

  // Check if self-enrollment has expired
  if (
    courseInstance.self_enrollment_enabled_before_date != null &&
    new Date() >= courseInstance.self_enrollment_enabled_before_date
  ) {
    return { eligible: false, reason: 'self-enrollment-expired' };
  }

  // Check if the self-enrollment institution restriction is satisfied.
  // The default value for self-enrollment restriction is true.
  // In the old system (before publishing was introduced), the default was false.
  // So if publishing is not set up, we should ignore the restriction.
  const institutionRestrictionSatisfied =
    userInstitutionId === courseInstitutionId ||
    !courseInstance.modern_publishing ||
    !courseInstance.self_enrollment_restrict_to_institution;

  if (!institutionRestrictionSatisfied) {
    return { eligible: false, reason: 'institution-restriction' };
  }

  return { eligible: true };
}
