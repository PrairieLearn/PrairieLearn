import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as accessControlData from './access-control-data.js';
import {
  type ModernAssessmentInstanceAccessInput,
  resolveModernAssessmentInstanceAccess,
} from './access-control-modern.js';
import type { Assessment, CourseInstance } from './db-types.js';
import * as groups from './groups.js';

describe('resolveModernAssessmentInstanceAccess', () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    // By default, return a simple main rule that grants access.
    vi.spyOn(accessControlData, 'selectAccessControlRulesForAssessment').mockResolvedValue([
      {
        rule: {},
        number: 0,
        targetType: 'none',
        enrollmentIds: [],
        studentLabelIds: [],
        prairietestExams: [],
      },
    ]);

    vi.spyOn(accessControlData, 'selectStudentContext').mockResolvedValue({
      enrollmentId: 'enroll-1',
      studentLabelIds: [],
    });

    vi.spyOn(accessControlData, 'selectPrairieTestReservations').mockResolvedValue([]);
  });

  const baseInput = {
    assessment: { id: '1', team_work: false } as Assessment,
    userId: 'user-1',
    courseInstance: { id: 'ci-1', display_timezone: 'America/Chicago' } as CourseInstance,
    authzData: {
      user: { id: 'user-1' },
      mode: 'Public',
      course_role: 'None',
      course_instance_role: 'None',
      has_course_instance_permission_view: false,
    },
    reqDate: new Date('2025-03-15T12:00:00Z'),
  } satisfies Partial<ModernAssessmentInstanceAccessInput>;

  describe('individual (non-group) assessment instances', () => {
    it('grants access when user owns the instance', async () => {
      const result = await resolveModernAssessmentInstanceAccess({
        ...baseInput,
        assessmentInstance: {
          id: 'ai-1',
          user_id: 'user-1',
          team_id: null,
          date_limit: null,
        },
      });

      expect(result.authorized).toBe(true);
      expect(result.authorized_edit).toBe(true);
    });

    it('denies edit access when user does not own the instance', async () => {
      const result = await resolveModernAssessmentInstanceAccess({
        ...baseInput,
        assessmentInstance: {
          id: 'ai-1',
          user_id: 'user-other',
          team_id: null,
          date_limit: null,
        },
      });

      expect(result.authorized).toBe(false);
      expect(result.authorized_edit).toBe(false);
    });

    it('grants view access to non-owner with course instance permission', async () => {
      const result = await resolveModernAssessmentInstanceAccess({
        ...baseInput,
        authzData: {
          ...baseInput.authzData,
          has_course_instance_permission_view: true,
        },
        assessmentInstance: {
          id: 'ai-1',
          user_id: 'user-other',
          team_id: null,
          date_limit: null,
        },
      });

      expect(result.authorized).toBe(true);
      expect(result.authorized_edit).toBe(false);
    });
  });

  describe('group work assessment instances', () => {
    it('grants access when user is a member of the group', async () => {
      vi.spyOn(groups, 'getGroupId').mockResolvedValue('team-1');

      const result = await resolveModernAssessmentInstanceAccess({
        ...baseInput,
        assessment: { ...baseInput.assessment, team_work: true } as Assessment,
        assessmentInstance: {
          id: 'ai-1',
          user_id: null,
          team_id: 'team-1',
          date_limit: null,
        },
      });

      expect(result.authorized).toBe(true);
      expect(result.authorized_edit).toBe(true);
      expect(groups.getGroupId).toHaveBeenCalledWith('1', 'user-1');
    });

    it('denies access when user is NOT a member of the group', async () => {
      vi.spyOn(groups, 'getGroupId').mockResolvedValue(null);

      const result = await resolveModernAssessmentInstanceAccess({
        ...baseInput,
        assessment: { ...baseInput.assessment, team_work: true } as Assessment,
        assessmentInstance: {
          id: 'ai-1',
          user_id: null,
          team_id: 'team-1',
          date_limit: null,
        },
      });

      expect(result.authorized).toBe(false);
      expect(result.authorized_edit).toBe(false);
    });

    it('denies access when user is in a different group', async () => {
      vi.spyOn(groups, 'getGroupId').mockResolvedValue('team-other');

      const result = await resolveModernAssessmentInstanceAccess({
        ...baseInput,
        assessment: { ...baseInput.assessment, team_work: true } as Assessment,
        assessmentInstance: {
          id: 'ai-1',
          user_id: null,
          team_id: 'team-1',
          date_limit: null,
        },
      });

      expect(result.authorized).toBe(false);
      expect(result.authorized_edit).toBe(false);
    });

    it('grants view (not edit) access to non-member with course instance permission', async () => {
      vi.spyOn(groups, 'getGroupId').mockResolvedValue(null);

      const result = await resolveModernAssessmentInstanceAccess({
        ...baseInput,
        assessment: { ...baseInput.assessment, team_work: true } as Assessment,
        authzData: {
          ...baseInput.authzData,
          has_course_instance_permission_view: true,
        },
        assessmentInstance: {
          id: 'ai-1',
          user_id: null,
          team_id: 'team-1',
          date_limit: null,
        },
      });

      expect(result.authorized).toBe(true);
      expect(result.authorized_edit).toBe(false);
    });
  });

  describe('time limit expiration', () => {
    it('reports time_limit_expired when date_limit has passed', async () => {
      const result = await resolveModernAssessmentInstanceAccess({
        ...baseInput,
        assessmentInstance: {
          id: 'ai-1',
          user_id: 'user-1',
          team_id: null,
          date_limit: new Date('2025-03-15T11:00:00Z'),
        },
      });

      expect(result.time_limit_expired).toBe(true);
    });

    it('reports time_limit_expired as false when date_limit has not passed', async () => {
      const result = await resolveModernAssessmentInstanceAccess({
        ...baseInput,
        assessmentInstance: {
          id: 'ai-1',
          user_id: 'user-1',
          team_id: null,
          date_limit: new Date('2025-03-15T13:00:00Z'),
        },
      });

      expect(result.time_limit_expired).toBe(false);
    });
  });
});
