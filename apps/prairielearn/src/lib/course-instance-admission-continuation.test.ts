import { describe, expect, it } from 'vitest';

import {
  clearCourseInstanceAdmissionContinuation,
  getCourseInstanceAdmissionContinuation,
  replaceLti13ContinuationWithOrdinary,
  setLti13CourseInstanceAdmissionContinuation,
} from './course-instance-admission-continuation.js';

describe('course instance admission continuation', () => {
  it('stores an exact LTI continuation and replaces it with pinned ordinary policy', () => {
    const session: Record<string, unknown> = {};
    const exact = setLti13CourseInstanceAdmissionContinuation({
      courseInstanceId: '10',
      launchExpiresAtSeconds: 2_000_000_000,
      lti13CourseInstanceId: '20',
      session,
      sub: 'launch-sub',
      userId: '30',
    });

    expect(
      getCourseInstanceAdmissionContinuation({
        courseInstanceId: '10',
        now: new Date('2030-01-01T00:00:00Z'),
        session,
        userId: '30',
      }),
    ).toEqual(exact);

    const ordinary = replaceLti13ContinuationWithOrdinary({
      continuation: exact,
      session,
    });
    expect(ordinary).toEqual({
      course_instance_id: '10',
      expires_at: exact.expires_at,
      type: 'ordinary',
      user_id: '30',
    });
  });

  it.each([
    {
      continuation: { marker: 'invalid' },
      courseInstanceId: '10',
      now: new Date('2030-01-01T00:00:00Z'),
      userId: '30',
    },
    {
      continuation: {
        course_instance_id: '10',
        expires_at: '2040-01-01T00:00:00.000Z',
        retained_claims: { sub: 'must-not-survive' },
        type: 'ordinary',
        user_id: '30',
      },
      courseInstanceId: '10',
      now: new Date('2030-01-01T00:00:00Z'),
      userId: '30',
    },
    {
      continuation: {
        course_instance_id: '10',
        expires_at: '2030-01-01T00:00:00.000Z',
        type: 'ordinary',
        user_id: '30',
      },
      courseInstanceId: '10',
      now: new Date('2030-01-01T00:00:00Z'),
      userId: '30',
    },
    {
      continuation: {
        course_instance_id: '10',
        expires_at: '2040-01-01T00:00:00.000Z',
        type: 'ordinary',
        user_id: '30',
      },
      courseInstanceId: '11',
      now: new Date('2030-01-01T00:00:00Z'),
      userId: '30',
    },
    {
      continuation: {
        course_instance_id: '10',
        expires_at: '2040-01-01T00:00:00.000Z',
        type: 'ordinary',
        user_id: '30',
      },
      courseInstanceId: '10',
      now: new Date('2030-01-01T00:00:00Z'),
      userId: '31',
    },
  ])('clears invalid, expired, or mismatched state: %#', (testCase) => {
    const session: Record<string, unknown> = {
      course_instance_admission_continuation: testCase.continuation,
    };

    expect(
      getCourseInstanceAdmissionContinuation({
        courseInstanceId: testCase.courseInstanceId,
        now: testCase.now,
        session,
        userId: testCase.userId,
      }),
    ).toBeNull();
    expect(session).not.toHaveProperty('course_instance_admission_continuation');
  });

  it('allows a new launch to replace an older continuation', () => {
    const session: Record<string, unknown> = {};
    setLti13CourseInstanceAdmissionContinuation({
      courseInstanceId: '10',
      launchExpiresAtSeconds: 2_000_000_000,
      lti13CourseInstanceId: '20',
      session,
      sub: 'old-sub',
      userId: '30',
    });
    const replacement = setLti13CourseInstanceAdmissionContinuation({
      courseInstanceId: '11',
      launchExpiresAtSeconds: 2_000_000_100,
      lti13CourseInstanceId: '21',
      session,
      sub: 'new-sub',
      userId: '30',
    });

    expect(session.course_instance_admission_continuation).toEqual(replacement);
    clearCourseInstanceAdmissionContinuation(session);
    expect(session).not.toHaveProperty('course_instance_admission_continuation');
  });
});
