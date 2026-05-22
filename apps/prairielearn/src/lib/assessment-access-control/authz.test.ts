import { describe, expect, it } from 'vitest';

import type { SprocAuthzAssessment } from '../db-types.js';

import { applyInstanceAccess, resolverResultToAuthzAssessmentForInstance } from './authz.js';
import type { AccessControlResolverResult } from './resolver.js';

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
  access_timeline: [],
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
  submittable: true,
  visibility: {
    showQuestions: true,
    showScore: true,
  },
  afterCompleteVisibility: {
    showQuestions: false,
    showScore: false,
  },
  visibilitySource: 'default',
  complete: false,
  examAccessEnd: null,
  showBeforeRelease: false,
  accessTimeline: [],
  nextActiveDate: null,
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

describe('resolverResultToAuthzAssessmentForInstance', () => {
  it('does not apply afterComplete score visibility while an instance is open and unexpired', () => {
    const result = resolverResultToAuthzAssessmentForInstance({
      result: baseResolverResult,
      authzMode: 'Public',
      displayTimezone: 'America/Chicago',
      assessmentInstance: { open: true, date_limit: new Date('2025-03-20T00:00:00Z') },
      reqDate: new Date('2025-03-15T00:00:00Z'),
    });

    expect(result.show_closed_assessment).toBe(true);
    expect(result.show_closed_assessment_score).toBe(true);
    expect(result.active).toBe(true);
  });

  it('applies afterComplete score visibility when an instance is closed', () => {
    const result = resolverResultToAuthzAssessmentForInstance({
      result: {
        ...baseResolverResult,
        creditDateString: '100% until 12:00, Sat, Mar 15',
        timeLimitMin: 60,
        password: 'secret',
      },
      authzMode: 'Public',
      displayTimezone: 'America/Chicago',
      assessmentInstance: { open: false, date_limit: null },
      reqDate: new Date('2025-03-15T00:00:00Z'),
    });

    expect(result.show_closed_assessment).toBe(false);
    expect(result.show_closed_assessment_score).toBe(false);
    expect(result.active).toBe(false);
    expect(result.credit_date_string).toBe('None');
    expect(result.time_limit_min).toBeNull();
    expect(result.password).toBeNull();
  });

  it('applies afterComplete score visibility when the time limit has expired', () => {
    const result = resolverResultToAuthzAssessmentForInstance({
      result: {
        ...baseResolverResult,
        creditDateString: '100% until 12:00, Sat, Mar 15',
        timeLimitMin: 60,
        password: 'secret',
      },
      authzMode: 'Public',
      displayTimezone: 'America/Chicago',
      assessmentInstance: { open: true, date_limit: new Date('2025-03-10T00:00:00Z') },
      reqDate: new Date('2025-03-15T00:00:00Z'),
    });

    expect(result.show_closed_assessment).toBe(false);
    expect(result.show_closed_assessment_score).toBe(false);
    expect(result.active).toBe(false);
    expect(result.credit_date_string).toBe('None');
    expect(result.time_limit_min).toBeNull();
    expect(result.password).toBeNull();
  });

  it('leaves PrairieTest visibility in control while a reservation is active', () => {
    const result = resolverResultToAuthzAssessmentForInstance({
      result: {
        ...baseResolverResult,
        visibility: {
          showQuestions: true,
          showScore: true,
        },
        visibilitySource: 'prairieTest',
      },
      authzMode: 'Exam',
      displayTimezone: 'America/Chicago',
      assessmentInstance: { open: false, date_limit: null },
      reqDate: new Date('2025-03-15T00:00:00Z'),
    });

    expect(result.show_closed_assessment).toBe(true);
    expect(result.show_closed_assessment_score).toBe(true);
  });
});
