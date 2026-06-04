import { assertNever } from '@prairielearn/utils';

import type { Course, CourseInstance, Enrollment, User } from './db-types.js';

type EnrollmentIneligibilityReason =
  | 'blocked'
  | 'self-enrollment-disabled'
  | 'self-enrollment-expired'
  | 'institution-restriction';

type EnrollmentEligibilityResult =
  | { eligible: true }
  | { eligible: false; reason: EnrollmentIneligibilityReason };

export function getEligibilityErrorMessage(reason: EnrollmentIneligibilityReason) {
  switch (reason) {
    case 'blocked':
      return 'You are blocked from accessing this course';
    case 'institution-restriction':
      return 'Self-enrollment for this course is restricted to users from the same institution';
    case 'self-enrollment-expired':
      return 'Self-enrollment for this course has expired';
    case 'self-enrollment-disabled':
      return 'Self-enrollment is not enabled for this course';
    default:
      assertNever(reason);
  }
}
/**
 * Check if a user is eligible to self-enroll in a course instance.
 *
 * When `allowAccess` rules are present, self-enrollment is always enabled,
 * and all additional restrictions are disabled / not allowed (they can only be changed after publishing is enabled).
 * Thus, for course instances with `allowAccess`, this should always return `{ eligible: true }`.
 *
 * This function checks (in order):
 * 1. If the user is blocked from the course, they are not eligible.
 * 2. If the user has an existing enrollment (joined or invited), they are eligible.
 * 3. If self-enrollment is not enabled for the course instance, they are not eligible.
 * 4. If self-enrollment has expired, they are not eligible.
 * 5. If the institution restriction is not satisfied (user's institution does not match course's institution), they are not eligible.
 *
 */
export function checkEnrollmentEligibility({
  user,
  course,
  courseInstance,
  existingEnrollment,
}: {
  user: User;
  course: Course;
  courseInstance: CourseInstance;
  existingEnrollment: Pick<Enrollment, 'status'> | null;
}): EnrollmentEligibilityResult {
  // Check if user is blocked
  if (existingEnrollment?.status === 'blocked') {
    return { eligible: false, reason: 'blocked' };
  }

  // If user has an existing enrollment (joined or invited), they are eligible.
  if (existingEnrollment?.status === 'joined' || existingEnrollment?.status === 'invited') {
    return { eligible: true };
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
    user.institution_id === course.institution_id ||
    !courseInstance.modern_publishing ||
    !courseInstance.self_enrollment_restrict_to_institution;

  if (!institutionRestrictionSatisfied) {
    return { eligible: false, reason: 'institution-restriction' };
  }

  return { eligible: true };
}
