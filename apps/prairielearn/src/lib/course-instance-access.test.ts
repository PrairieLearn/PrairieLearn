import { assert, describe, it } from 'vitest';

import { evaluateCourseInstanceAccess } from './course-instance-access.js';
import { type CourseInstance } from './db-types.js';

function createMockCourseInstance(overrides: Partial<CourseInstance> = {}): CourseInstance {
  return {
    id: '1',
    course_id: '1',
    short_name: 'test',
    long_name: 'Test Course Instance',
    uuid: '12345678-1234-1234-1234-123456789012',
    deleted_at: null,
    display_timezone: 'UTC',
    enrollment_code: 'TEST123',
    enrollment_limit: null,
    hide_in_enroll_page: false,
    json_comment: null,
    self_enrollment_enabled: true,
    self_enrollment_enabled_before_date: null,
    self_enrollment_enabled_before_date_enabled: false,
    self_enrollment_use_enrollment_code: false,
    share_source_publicly: false,
    sync_errors: null,
    sync_job_sequence_id: null,
    sync_warnings: null,
    assessments_group_by: 'Set',
    access_control_published: null,
    access_control_published_start_date: null,
    access_control_published_start_date_enabled: null,
    access_control_published_end_date: null,
    ...overrides,
  };
}

function createMockParams(
  overrides: Partial<CourseInstanceAccessParams> = {},
): CourseInstanceAccessParams {
  return {
    authz_mode_reason: 'Default',
    authz_mode: 'Public',
    course_instance_role: 'None',
    course_role: 'None',
    ...overrides,
  };
}

describe('evaluateCourseInstanceAccess', () => {
  it('allows access for staff with course roles', () => {
    const courseInstance = createMockCourseInstance();
    const params = createMockParams({ course_role: 'Editor' });

    const result = evaluateCourseInstanceAccess(courseInstance, params);

    assert.isTrue(result.hasAccess);
  });

  it('allows access for staff with course instance roles', () => {
    const courseInstance = createMockCourseInstance();
    const params = createMockParams({ course_instance_role: 'Student Data Viewer' });

    const result = evaluateCourseInstanceAccess(courseInstance, params);

    assert.isTrue(result.hasAccess);
  });

  it('allows access for course owners', () => {
    const courseInstance = createMockCourseInstance();
    const params = createMockParams({ course_role: 'Owner' });

    const result = evaluateCourseInstanceAccess(courseInstance, params);

    assert.isTrue(result.hasAccess);
  });

  it('denies access when course instance is not published', () => {
    const courseInstance = createMockCourseInstance({
      access_control_published: false,
    });
    const params = createMockParams();

    const result = evaluateCourseInstanceAccess(courseInstance, params);

    assert.isFalse(result.hasAccess);
    assert.equal(result.reason, 'Course instance is not published');
  });

  it('allows access when course instance is published', () => {
    const courseInstance = createMockCourseInstance({
      access_control_published: true,
    });
    const params = createMockParams();

    const result = evaluateCourseInstanceAccess(courseInstance, params);

    assert.isTrue(result.hasAccess);
  });

  it('allows access when access_control_published is null (default behavior)', () => {
    const courseInstance = createMockCourseInstance({
      access_control_published: null,
    });
    const params = createMockParams();

    const result = evaluateCourseInstanceAccess(courseInstance, params);

    assert.isTrue(result.hasAccess);
  });

  it('denies access when published start date is enabled and current date is before start date', () => {
    const startDate = new Date('2024-06-01T00:00:00Z');
    const currentDate = new Date('2024-05-01T00:00:00Z');

    const courseInstance = createMockCourseInstance({
      access_control_published_start_date_enabled: true,
      access_control_published_start_date: startDate,
    });
    const params = createMockParams();

    const result = evaluateCourseInstanceAccess(courseInstance, params, currentDate);

    assert.isFalse(result.hasAccess);
    assert.equal(result.reason, 'Course instance is not yet published');
  });

  it('allows access when published start date is enabled and current date is after start date', () => {
    const startDate = new Date('2024-05-01T00:00:00Z');
    const currentDate = new Date('2024-06-01T00:00:00Z');

    const courseInstance = createMockCourseInstance({
      access_control_published_start_date_enabled: true,
      access_control_published_start_date: startDate,
    });
    const params = createMockParams();

    const result = evaluateCourseInstanceAccess(courseInstance, params, currentDate);

    assert.isTrue(result.hasAccess);
  });

  it('allows access when published start date is enabled and current date equals start date', () => {
    const startDate = new Date('2024-06-01T00:00:00Z');
    const currentDate = new Date('2024-06-01T00:00:00Z');

    const courseInstance = createMockCourseInstance({
      access_control_published_start_date_enabled: true,
      access_control_published_start_date: startDate,
    });
    const params = createMockParams();

    const result = evaluateCourseInstanceAccess(courseInstance, params, currentDate);

    assert.isTrue(result.hasAccess);
  });

  it('ignores published start date when start date enabled is false', () => {
    const startDate = new Date('2024-06-01T00:00:00Z');
    const currentDate = new Date('2024-05-01T00:00:00Z');

    const courseInstance = createMockCourseInstance({
      access_control_published_start_date_enabled: false,
      access_control_published_start_date: startDate,
    });
    const params = createMockParams();

    const result = evaluateCourseInstanceAccess(courseInstance, params, currentDate);

    assert.isTrue(result.hasAccess);
  });

  it('ignores published start date when start date enabled is null', () => {
    const startDate = new Date('2024-06-01T00:00:00Z');
    const currentDate = new Date('2024-05-01T00:00:00Z');

    const courseInstance = createMockCourseInstance({
      access_control_published_start_date_enabled: null,
      access_control_published_start_date: startDate,
    });
    const params = createMockParams();

    const result = evaluateCourseInstanceAccess(courseInstance, params, currentDate);

    assert.isTrue(result.hasAccess);
  });

  it('ignores published start date when start date is null', () => {
    const currentDate = new Date('2024-06-01T00:00:00Z');

    const courseInstance = createMockCourseInstance({
      access_control_published_start_date_enabled: true,
      access_control_published_start_date: null,
    });
    const params = createMockParams();

    const result = evaluateCourseInstanceAccess(courseInstance, params, currentDate);

    assert.isTrue(result.hasAccess);
  });

  it('denies access when current date is after published end date', () => {
    const endDate = new Date('2024-05-01T00:00:00Z');
    const currentDate = new Date('2024-06-01T00:00:00Z');

    const courseInstance = createMockCourseInstance({
      access_control_published_end_date: endDate,
    });
    const params = createMockParams();

    const result = evaluateCourseInstanceAccess(courseInstance, params, currentDate);

    assert.isFalse(result.hasAccess);
    assert.equal(result.reason, 'Course instance has been archived');
  });

  it('allows access when current date is before published end date', () => {
    const endDate = new Date('2024-06-01T00:00:00Z');
    const currentDate = new Date('2024-05-01T00:00:00Z');

    const courseInstance = createMockCourseInstance({
      access_control_published_end_date: endDate,
    });
    const params = createMockParams();

    const result = evaluateCourseInstanceAccess(courseInstance, params, currentDate);

    assert.isTrue(result.hasAccess);
  });

  it('allows access when published end date is null', () => {
    const currentDate = new Date('2024-06-01T00:00:00Z');

    const courseInstance = createMockCourseInstance({
      access_control_published_end_date: null,
    });
    const params = createMockParams();

    const result = evaluateCourseInstanceAccess(courseInstance, params, currentDate);

    assert.isTrue(result.hasAccess);
  });

  it('combines start and end date restrictions correctly', () => {
    const startDate = new Date('2024-05-01T00:00:00Z');
    const endDate = new Date('2024-07-01T00:00:00Z');
    const currentDate = new Date('2024-06-01T00:00:00Z');

    const courseInstance = createMockCourseInstance({
      access_control_published_start_date_enabled: true,
      access_control_published_start_date: startDate,
      access_control_published_end_date: endDate,
    });
    const params = createMockParams();

    const result = evaluateCourseInstanceAccess(courseInstance, params, currentDate);

    assert.isTrue(result.hasAccess);
  });

  it('prioritizes start date restriction over end date restriction', () => {
    const startDate = new Date('2024-07-01T00:00:00Z');
    const endDate = new Date('2024-05-01T00:00:00Z');
    const currentDate = new Date('2024-06-01T00:00:00Z');

    const courseInstance = createMockCourseInstance({
      access_control_published_start_date_enabled: true,
      access_control_published_start_date: startDate,
      access_control_published_end_date: endDate,
    });
    const params = createMockParams();

    const result = evaluateCourseInstanceAccess(courseInstance, params, currentDate);

    assert.isFalse(result.hasAccess);
    assert.equal(result.reason, 'Course instance is not yet published');
  });

  it('prioritizes published restriction over date restrictions', () => {
    const startDate = new Date('2024-05-01T00:00:00Z');
    const endDate = new Date('2024-07-01T00:00:00Z');
    const currentDate = new Date('2024-06-01T00:00:00Z');

    const courseInstance = createMockCourseInstance({
      access_control_published: false,
      access_control_published_start_date_enabled: true,
      access_control_published_start_date: startDate,
      access_control_published_end_date: endDate,
    });
    const params = createMockParams();

    const result = evaluateCourseInstanceAccess(courseInstance, params, currentDate);

    assert.isFalse(result.hasAccess);
    assert.equal(result.reason, 'Course instance is not published');
  });

  it('staff bypass all restrictions even when course instance is not published', () => {
    const courseInstance = createMockCourseInstance({
      access_control_published: false,
      access_control_published_start_date_enabled: true,
      access_control_published_start_date: new Date('2024-07-01T00:00:00Z'),
      access_control_published_end_date: new Date('2024-05-01T00:00:00Z'),
    });
    const params = createMockParams({ course_role: 'Viewer' });

    const result = evaluateCourseInstanceAccess(courseInstance, params);

    assert.isTrue(result.hasAccess);
  });

  it('uses current date when no date is provided', () => {
    const courseInstance = createMockCourseInstance({
      access_control_published_start_date_enabled: true,
      access_control_published_start_date: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
    });
    const params = createMockParams();

    const result = evaluateCourseInstanceAccess(courseInstance, params);

    assert.isFalse(result.hasAccess);
    assert.equal(result.reason, 'Course instance is not yet published');
  });
});
