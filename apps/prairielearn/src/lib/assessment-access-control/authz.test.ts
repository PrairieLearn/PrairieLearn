import { describe, expect, it } from 'vitest';
import type { z } from 'zod';

import type { SprocAuthzAssessmentSchema } from '../db-types.js';

import { applyInstanceAccess, buildModernAccessRenderInfo } from './authz.js';
import type { AccessControlResolverResult } from './resolver.js';

type SprocAuthzAssessment = z.infer<typeof SprocAuthzAssessmentSchema>;

const baseAssessmentResult: SprocAuthzAssessment = {
  authorized: true,
  credit: 100,
  credit_date_string: '2025-03-15T12:00:00Z',
  time_limit_min: null,
  password: null,
  active: true,
  show_closed_assessment: true,
  show_closed_assessment_score: true,
  exam_access_end: null,
  mode: null,
  show_before_release: false,
  next_active_time: null,
  access_rules: [],
};

const unauthorizedResult: SprocAuthzAssessment = {
  ...baseAssessmentResult,
  authorized: false,
};

const baseResolverResult: AccessControlResolverResult = {
  authorized: true,
  credit: 100,
  creditDateString: '100%',
  timeLimitMin: null,
  password: null,
  active: true,
  showClosedAssessment: true,
  showClosedAssessmentScore: true,
  examAccessEnd: null,
  showBeforeRelease: false,
};

describe('applyInstanceAccess', () => {
  describe('owner access', () => {
    it('grants full access when user owns the instance', () => {
      const result = applyInstanceAccess({
        assessmentResult: baseAssessmentResult,
        ownsInstance: true,
        timeLimitExpired: false,
        hasCourseInstancePermissionView: false,
      });

      expect(result.authorized).toBe(true);
      expect(result.authorized_edit).toBe(true);
    });

    it('denies edit when assessment is unauthorized, even if user owns the instance', () => {
      const result = applyInstanceAccess({
        assessmentResult: unauthorizedResult,
        ownsInstance: true,
        timeLimitExpired: false,
        hasCourseInstancePermissionView: false,
      });

      expect(result.authorized).toBe(false);
      expect(result.authorized_edit).toBe(false);
    });
  });

  describe('non-owner access', () => {
    it('denies all access without view permission', () => {
      const result = applyInstanceAccess({
        assessmentResult: baseAssessmentResult,
        ownsInstance: false,
        timeLimitExpired: false,
        hasCourseInstancePermissionView: false,
      });

      expect(result.authorized).toBe(false);
      expect(result.authorized_edit).toBe(false);
    });

    it('grants view-only access with view permission', () => {
      const result = applyInstanceAccess({
        assessmentResult: baseAssessmentResult,
        ownsInstance: false,
        timeLimitExpired: false,
        hasCourseInstancePermissionView: true,
      });

      expect(result.authorized).toBe(true);
      expect(result.authorized_edit).toBe(false);
    });

    it('view permission does not override an unauthorized assessment', () => {
      const result = applyInstanceAccess({
        assessmentResult: unauthorizedResult,
        ownsInstance: false,
        timeLimitExpired: false,
        hasCourseInstancePermissionView: true,
      });

      expect(result.authorized).toBe(false);
      expect(result.authorized_edit).toBe(false);
    });
  });

  describe('time limit', () => {
    it('passes through timeLimitExpired=true', () => {
      const result = applyInstanceAccess({
        assessmentResult: baseAssessmentResult,
        ownsInstance: true,
        timeLimitExpired: true,
        hasCourseInstancePermissionView: false,
      });

      expect(result.time_limit_expired).toBe(true);
    });

    it('passes through timeLimitExpired=false', () => {
      const result = applyInstanceAccess({
        assessmentResult: baseAssessmentResult,
        ownsInstance: true,
        timeLimitExpired: false,
        hasCourseInstancePermissionView: false,
      });

      expect(result.time_limit_expired).toBe(false);
    });
  });
});

describe('buildModernAccessRenderInfo', () => {
  it('derives listed future-open availability from the release date', () => {
    const result = buildModernAccessRenderInfo({
      result: { ...baseResolverResult, active: false, showBeforeRelease: true },
      effectiveRule: {
        listBeforeRelease: true,
        dateControl: {
          releaseDate: new Date('2025-04-01T00:00:00Z'),
          dueDate: new Date('2025-05-01T00:00:00Z'),
        },
      },
      prairieTestExamCount: 0,
      prairieTestExams: [],
      prairieTestReservations: [],
      displayTimezone: 'UTC',
      authzMode: null,
      reqDate: new Date('2025-03-15T00:00:00Z'),
    });

    expect(result.availability).toEqual({
      state: 'future_open',
      listed: true,
      opensAt: new Date('2025-04-01T00:00:00Z'),
    });
  });

  it('derives hidden future-open availability when listBeforeRelease is disabled', () => {
    const result = buildModernAccessRenderInfo({
      result: { ...baseResolverResult, authorized: false, active: false, showBeforeRelease: false },
      effectiveRule: {
        dateControl: {
          releaseDate: new Date('2025-04-01T00:00:00Z'),
          dueDate: new Date('2025-05-01T00:00:00Z'),
        },
      },
      prairieTestExamCount: 0,
      prairieTestExams: [],
      prairieTestReservations: [],
      displayTimezone: 'UTC',
      authzMode: null,
      reqDate: new Date('2025-03-15T00:00:00Z'),
    });

    expect(result.availability).toEqual({
      state: 'future_open',
      listed: false,
      opensAt: new Date('2025-04-01T00:00:00Z'),
    });
  });

  it('derives before-release availability when no release date is configured', () => {
    const result = buildModernAccessRenderInfo({
      result: { ...baseResolverResult, active: false, showBeforeRelease: true },
      effectiveRule: {
        listBeforeRelease: true,
        dateControl: {
          dueDate: new Date('2025-05-01T00:00:00Z'),
        },
      },
      prairieTestExamCount: 0,
      prairieTestExams: [],
      prairieTestReservations: [],
      displayTimezone: 'UTC',
      authzMode: null,
      reqDate: new Date('2025-03-15T00:00:00Z'),
    });

    expect(result.availability).toEqual({
      state: 'before_release',
      listed: true,
      opensAt: null,
    });
  });

  it('derives listed PrairieTest-gated availability outside exam mode', () => {
    const result = buildModernAccessRenderInfo({
      result: { ...baseResolverResult, authorized: false, active: false, showBeforeRelease: true },
      effectiveRule: {
        listBeforeRelease: true,
        dateControl: {
          releaseDate: new Date('2025-03-01T00:00:00Z'),
          dueDate: new Date('2025-05-01T00:00:00Z'),
        },
      },
      prairieTestExamCount: 1,
      prairieTestExams: [{ uuid: 'exam-1', readOnly: false }],
      prairieTestReservations: [],
      displayTimezone: 'UTC',
      authzMode: null,
      reqDate: new Date('2025-03-15T00:00:00Z'),
    });

    expect(result.availability).toEqual({
      state: 'prairietest_gated_unavailable',
      listed: true,
      opensAt: null,
    });
  });

  it('derives hidden PrairieTest-gated availability in exam mode without a matching reservation', () => {
    const result = buildModernAccessRenderInfo({
      result: { ...baseResolverResult, authorized: false, active: false, showBeforeRelease: false },
      effectiveRule: {
        listBeforeRelease: true,
        dateControl: {
          releaseDate: new Date('2025-03-01T00:00:00Z'),
          dueDate: new Date('2025-05-01T00:00:00Z'),
        },
      },
      prairieTestExamCount: 1,
      prairieTestExams: [{ uuid: 'exam-1', readOnly: false }],
      prairieTestReservations: [
        { examUuid: 'other-exam', accessEnd: new Date('2025-04-01T00:00:00Z') },
      ],
      displayTimezone: 'UTC',
      authzMode: 'Exam',
      reqDate: new Date('2025-03-15T00:00:00Z'),
    });

    expect(result.availability).toEqual({
      state: 'prairietest_gated_unavailable',
      listed: false,
      opensAt: null,
    });
  });

  it('derives open and closed availability from the authz result once released', () => {
    const effectiveRule = {
      dateControl: {
        releaseDate: new Date('2025-03-01T00:00:00Z'),
        dueDate: new Date('2025-05-01T00:00:00Z'),
      },
    };

    expect(
      buildModernAccessRenderInfo({
        result: baseResolverResult,
        effectiveRule,
        prairieTestExamCount: 0,
        prairieTestExams: [],
        prairieTestReservations: [],
        displayTimezone: 'UTC',
        authzMode: null,
        reqDate: new Date('2025-03-15T00:00:00Z'),
      }).availability,
    ).toEqual({
      state: 'open',
      listed: true,
      opensAt: null,
    });

    expect(
      buildModernAccessRenderInfo({
        result: { ...baseResolverResult, active: false },
        effectiveRule,
        prairieTestExamCount: 0,
        prairieTestExams: [],
        prairieTestReservations: [],
        displayTimezone: 'UTC',
        authzMode: null,
        reqDate: new Date('2025-03-15T00:00:00Z'),
      }).availability,
    ).toEqual({
      state: 'closed',
      listed: true,
      opensAt: null,
    });
  });
});
