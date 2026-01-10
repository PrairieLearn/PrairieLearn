import { describe, expect, it } from 'vitest';

import type { CourseInstance } from './db-types.js';
import { checkEnrollmentEligibility } from './enrollment-eligibility.js';

describe('checkEnrollmentEligibility', () => {
  const baseParams = {
    userInstitutionId: 'inst-1',
    courseInstitutionId: 'inst-1',
    courseInstance: {
      modern_publishing: true,
      self_enrollment_enabled: true,
      self_enrollment_enabled_before_date: null,
      self_enrollment_restrict_to_institution: true,
    } as CourseInstance,
    existingEnrollment: null,
  };

  it('returns eligible when all conditions are met', () => {
    const result = checkEnrollmentEligibility(baseParams);
    expect(result).toEqual({ eligible: true });
  });

  it('returns blocked when user has blocked enrollment', () => {
    const result = checkEnrollmentEligibility({
      ...baseParams,
      existingEnrollment: { status: 'blocked' },
    });
    expect(result).toEqual({ eligible: false, reason: 'blocked' });
  });

  it('returns self-enrollment-disabled when self_enrollment_enabled is false', () => {
    const result = checkEnrollmentEligibility({
      ...baseParams,
      courseInstance: {
        ...baseParams.courseInstance,
        self_enrollment_enabled: false,
      },
    });
    expect(result).toEqual({ eligible: false, reason: 'self-enrollment-disabled' });
  });

  it('returns self-enrollment-expired when date has passed', () => {
    const pastDate = new Date('2020-01-01');
    const result = checkEnrollmentEligibility({
      ...baseParams,
      courseInstance: {
        ...baseParams.courseInstance,
        self_enrollment_enabled_before_date: pastDate,
      },
    });
    expect(result).toEqual({ eligible: false, reason: 'self-enrollment-expired' });
  });

  it('returns eligible when self_enrollment_enabled_before_date is in the future', () => {
    const futureDate = new Date(Date.now() + 1000 * 60 * 60 * 24); // tomorrow
    const result = checkEnrollmentEligibility({
      ...baseParams,
      courseInstance: {
        ...baseParams.courseInstance,
        self_enrollment_enabled_before_date: futureDate,
      },
    });
    expect(result).toEqual({ eligible: true });
  });

  it('returns institution-restriction when institutions do not match and restriction is enabled', () => {
    const result = checkEnrollmentEligibility({
      ...baseParams,
      userInstitutionId: 'inst-2',
      courseInstitutionId: 'inst-1',
    });
    expect(result).toEqual({ eligible: false, reason: 'institution-restriction' });
  });

  it('returns eligible when institutions do not match but modern_publishing is false', () => {
    const result = checkEnrollmentEligibility({
      ...baseParams,
      userInstitutionId: 'inst-2',
      courseInstitutionId: 'inst-1',
      courseInstance: {
        ...baseParams.courseInstance,
        modern_publishing: false,
      },
    });
    expect(result).toEqual({ eligible: true });
  });

  it('returns eligible when institutions do not match but restrict_to_institution is false', () => {
    const result = checkEnrollmentEligibility({
      ...baseParams,
      userInstitutionId: 'inst-2',
      courseInstitutionId: 'inst-1',
      courseInstance: {
        ...baseParams.courseInstance,
        self_enrollment_restrict_to_institution: false,
      },
    });
    expect(result).toEqual({ eligible: true });
  });

  it('checks blocked status before other conditions', () => {
    // If user is blocked, they should see blocked error even if self-enrollment is disabled
    const result = checkEnrollmentEligibility({
      ...baseParams,
      existingEnrollment: { status: 'blocked' },
      courseInstance: {
        ...baseParams.courseInstance,
        self_enrollment_enabled: false,
      },
    });
    expect(result).toEqual({ eligible: false, reason: 'blocked' });
  });

  it('returns eligible when user has non-blocked enrollment', () => {
    // A joined/invited/removed enrollment should not block eligibility
    const statuses = ['joined', 'invited', 'removed', 'rejected'] as const;
    for (const status of statuses) {
      const result = checkEnrollmentEligibility({
        ...baseParams,
        existingEnrollment: { status },
      });
      expect(result).toEqual({ eligible: true });
    }
  });
});
