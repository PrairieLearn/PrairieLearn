import { describe, expect, it } from 'vitest';
import type { z } from 'zod';

import type { SprocAuthzAssessmentSchema } from '../db-types.js';

import { applyInstanceAccess, buildAccessDisplayModelFromResult } from './authz.js';
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
  availabilityState: 'open',
  availabilityListed: true,
  opensAt: null,
  timeline: [],
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

describe('buildAccessDisplayModelFromResult', () => {
  it('passes future-open availability through to the display model', () => {
    const model = buildAccessDisplayModelFromResult({
      result: {
        ...baseResolverResult,
        active: false,
        showBeforeRelease: true,
        availabilityState: 'future_open',
        availabilityListed: true,
        opensAt: new Date('2025-04-01T00:00:00Z'),
      },
      effectiveRule: {
        listBeforeRelease: true,
        dateControl: {
          releaseDate: new Date('2025-04-01T00:00:00Z'),
          dueDate: new Date('2025-05-01T00:00:00Z'),
        },
      },
      prairieTestExamCount: 0,
      displayTimezone: 'UTC',
    });

    expect(model.availability.state).toBe('future_open');
    expect(model.availability.listed).toBe(true);
  });

  it('passes closed availability through to the display model', () => {
    const model = buildAccessDisplayModelFromResult({
      result: {
        ...baseResolverResult,
        active: false,
        availabilityState: 'closed',
        availabilityListed: true,
      },
      effectiveRule: {
        dateControl: {
          releaseDate: new Date('2025-03-01T00:00:00Z'),
          dueDate: new Date('2025-05-01T00:00:00Z'),
        },
      },
      prairieTestExamCount: 0,
      displayTimezone: 'UTC',
    });

    expect(model.availability.state).toBe('closed');
    expect(model.availability.listed).toBe(true);
  });

  it('passes PrairieTest-gated availability through to the display model', () => {
    const model = buildAccessDisplayModelFromResult({
      result: {
        ...baseResolverResult,
        authorized: false,
        active: false,
        showBeforeRelease: true,
        availabilityState: 'prairietest_gated_unavailable',
        availabilityListed: true,
      },
      effectiveRule: {
        listBeforeRelease: true,
        dateControl: {
          releaseDate: new Date('2025-03-01T00:00:00Z'),
          dueDate: new Date('2025-05-01T00:00:00Z'),
        },
      },
      prairieTestExamCount: 1,
      displayTimezone: 'UTC',
    });

    expect(model.availability.state).toBe('prairietest_gated_unavailable');
    expect(model.availability.listed).toBe(true);
  });

  it('uses the resolver timeline for display rows', () => {
    const model = buildAccessDisplayModelFromResult({
      result: {
        ...baseResolverResult,
        timeline: [{ type: 'due', date: new Date('2025-05-01T00:00:00Z'), credit: 100, index: 0 }],
      },
      effectiveRule: {
        dateControl: {
          releaseDate: new Date('2025-03-01T00:00:00Z'),
          dueDate: new Date('2025-05-01T00:00:00Z'),
        },
      },
      prairieTestExamCount: 0,
      displayTimezone: 'UTC',
    });

    expect(model.rows.map((r) => r.label)).toEqual(['Release', 'Due', null]);
  });
});
