import { describe, expect, it } from 'vitest';
import type { z } from 'zod';

import type { SprocAuthzAssessmentSchema } from '../db-types.js';

import { applyInstanceAccess } from './authz.js';

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
