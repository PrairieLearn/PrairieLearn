import { assert, describe, expect, it } from 'vitest';

import {
  type CourseInstanceAccessParams,
  convertAccessRuleToJson,
  evaluateCourseInstanceAccess,
  migrateAccessRuleJsonToAccessControl,
} from './course-instance-access.js';
import { type CourseInstance, type CourseInstanceAccessRule } from './db-types.js';

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

    // These are the only fields we care about.
    access_control_publish_date: null,
    access_control_archive_date: null,
    ...overrides,
  };
}

function createMockParams(
  overrides: Partial<CourseInstanceAccessParams> = {},
): CourseInstanceAccessParams {
  return {
    mode_reason: 'Default',
    mode: 'Public',
    course_instance_role: 'None',
    course_role: 'None',
    accessControlExtensions: [],
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
    const courseInstance = createMockCourseInstance({});
    const params = createMockParams();

    const result = evaluateCourseInstanceAccess(courseInstance, params);

    assert.isFalse(result.hasAccess);
    assert.equal(result.reason, 'Course instance is not published');
  });

  it('denies access when published start date is enabled and current date is before start date', () => {
    const startDate = new Date('2024-06-01T00:00:00Z');
    const currentDate = new Date('2024-05-01T00:00:00Z');

    const courseInstance = createMockCourseInstance({
      access_control_publish_date: startDate,
    });
    const params = createMockParams();

    const result = evaluateCourseInstanceAccess(courseInstance, params, currentDate);

    assert.isFalse(result.hasAccess);
    assert.equal(result.reason, 'Course instance is not yet published');
  });

  it('denies access when current date is after published end date', () => {
    const startDate = new Date('2024-04-01T00:00:00Z');
    const endDate = new Date('2024-05-01T00:00:00Z');
    const currentDate = new Date('2024-06-01T00:00:00Z');

    const courseInstance = createMockCourseInstance({
      access_control_publish_date: startDate,
      access_control_archive_date: endDate,
    });
    const params = createMockParams();

    const result = evaluateCourseInstanceAccess(courseInstance, params, currentDate);

    assert.isFalse(result.hasAccess);
    assert.equal(result.reason, 'Course instance has been archived');
  });

  it('combines start and end date restrictions correctly', () => {
    const startDate = new Date('2024-05-01T00:00:00Z');
    const endDate = new Date('2024-07-01T00:00:00Z');
    const currentDate = new Date('2024-06-01T00:00:00Z');

    const courseInstance = createMockCourseInstance({
      access_control_publish_date: startDate,
      access_control_archive_date: endDate,
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
      access_control_publish_date: startDate,
      access_control_archive_date: endDate,
    });
    const params = createMockParams();

    const result = evaluateCourseInstanceAccess(courseInstance, params, currentDate);

    assert.isFalse(result.hasAccess);
    assert.equal(result.reason, 'Course instance is not yet published');
  });

  it('staff bypass all restrictions even when course instance is not published', () => {
    const courseInstance = createMockCourseInstance({
      access_control_publish_date: new Date('2024-07-01T00:00:00Z'),
      access_control_archive_date: new Date('2024-05-01T00:00:00Z'),
    });
    const params = createMockParams({ course_role: 'Viewer' });

    const result = evaluateCourseInstanceAccess(courseInstance, params);

    assert.isTrue(result.hasAccess);
  });

  it('uses current date when no date is provided', () => {
    const courseInstance = createMockCourseInstance({
      access_control_publish_date: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
    });
    const params = createMockParams();

    const result = evaluateCourseInstanceAccess(courseInstance, params);

    assert.isFalse(result.hasAccess);
    assert.equal(result.reason, 'Course instance is not yet published');
  });
});

describe('migrateAccessRulesToAccessControl (using convertAccessRuleToJson + migrateAccessRuleJsonToAccessControl)', () => {
  function createMockAccessRule(
    overrides: Partial<CourseInstanceAccessRule> = {},
  ): CourseInstanceAccessRule {
    return {
      id: '1',
      course_instance_id: '1',
      start_date: null,
      end_date: null,
      uids: null,
      institution: null,
      json_comment: null,
      number: null,
      ...overrides,
    };
  }

  it('successfully migrates a single rule with start and end dates', () => {
    const startDate = new Date('2024-05-01T00:00:00Z');
    const endDate = new Date('2024-07-01T00:00:00Z');
    const accessRules = [createMockAccessRule({ start_date: startDate, end_date: endDate })];

    // Convert to JSON format first
    const accessRuleJson = convertAccessRuleToJson(accessRules[0], 'UTC');
    const result = migrateAccessRuleJsonToAccessControl([accessRuleJson]);

    expect(result).toMatchInlineSnapshot(`
      {
        "accessControl": {
          "archiveDate": "2024-07-01T00:00:00",
          "publishDate": "2024-05-01T00:00:00",
        },
        "extensions": [],
        "success": true,
      }
    `);
  });

  it('fails when there are no access rules', () => {
    const accessRules: CourseInstanceAccessRule[] = [];

    // Convert to JSON format first
    const accessRuleJsonArray = accessRules.map((rule) => convertAccessRuleToJson(rule, 'UTC'));
    const result = migrateAccessRuleJsonToAccessControl(accessRuleJsonArray);

    expect(result).toMatchInlineSnapshot(`
      {
        "error": "Expected exactly 1 access rule, but found 0",
        "success": false,
      }
    `);
  });

  it('fails when there are multiple access rules', () => {
    const accessRules = [
      createMockAccessRule({ start_date: new Date('2024-05-01T00:00:00Z') }),
      createMockAccessRule({ start_date: new Date('2024-06-01T00:00:00Z') }),
    ];

    // Convert to JSON format first
    const accessRuleJsonArray = accessRules.map((rule) => convertAccessRuleToJson(rule, 'UTC'));
    const result = migrateAccessRuleJsonToAccessControl(accessRuleJsonArray);

    expect(result).toMatchInlineSnapshot(`
      {
        "error": "Expected exactly 1 access rule, but found 2",
        "success": false,
      }
    `);
  });

  it('successfully migrates access rule with UID selectors to overrides', () => {
    const startDate = new Date('2024-05-01T00:00:00Z');
    const endDate = new Date('2024-07-01T00:00:00Z');
    const accessRules = [
      createMockAccessRule({
        start_date: startDate,
        end_date: endDate,
        uids: ['user1@example.com', 'user2@example.com'],
        json_comment: 'Test comment',
      }),
    ];

    // Convert to JSON format first
    const accessRuleJson = convertAccessRuleToJson(accessRules[0], 'UTC');
    const result = migrateAccessRuleJsonToAccessControl([accessRuleJson]);

    expect(result).toMatchInlineSnapshot(`
      {
        "accessControl": {
          "archiveDate": "2024-07-01T00:00:00",
          "publishDate": "2024-05-01T00:00:00",
        },
        "extensions": [
          {
            "enabled": true,
            "name": "Test comment",
            "published_end_date": "2024-07-01T00:00:00",
            "uids": [
              "user1@example.com",
              "user2@example.com",
            ],
          },
        ],
        "success": true,
      }
    `);
  });

  it('successfully migrates access rule with UID selectors and no comment', () => {
    const startDate = new Date('2024-05-01T00:00:00Z');
    const endDate = new Date('2024-07-01T00:00:00Z');
    const accessRules = [
      createMockAccessRule({
        start_date: startDate,
        end_date: endDate,
        uids: ['user1@example.com'],
        json_comment: null,
      }),
    ];

    // Convert to JSON format first
    const accessRuleJson = convertAccessRuleToJson(accessRules[0], 'UTC');
    const result = migrateAccessRuleJsonToAccessControl([accessRuleJson]);

    expect(result).toMatchInlineSnapshot(`
      {
        "accessControl": {
          "archiveDate": "2024-07-01T00:00:00",
          "publishDate": "2024-05-01T00:00:00",
        },
        "extensions": [
          {
            "enabled": true,
            "name": null,
            "published_end_date": "2024-07-01T00:00:00",
            "uids": [
              "user1@example.com",
            ],
          },
        ],
        "success": true,
      }
    `);
  });

  it('fails when access rule has no dates', () => {
    const accessRules = [
      createMockAccessRule({
        start_date: null,
        end_date: null,
      }),
    ];

    // Convert to JSON format first
    const accessRuleJson = convertAccessRuleToJson(accessRules[0], 'UTC');
    const result = migrateAccessRuleJsonToAccessControl([accessRuleJson]);

    expect(result).toMatchInlineSnapshot(`
      {
        "error": "Cannot migrate access rules without start or end dates.",
        "success": false,
      }
    `);
  });

  it('handles empty UID array as global rule', () => {
    const startDate = new Date('2024-05-01T00:00:00Z');
    const endDate = new Date('2024-07-01T00:00:00Z');
    const accessRules = [
      createMockAccessRule({
        start_date: startDate,
        end_date: endDate,
        uids: [],
      }),
    ];

    // Convert to JSON format first
    const accessRuleJson = convertAccessRuleToJson(accessRules[0], 'UTC');
    const result = migrateAccessRuleJsonToAccessControl([accessRuleJson]);

    expect(result).toMatchInlineSnapshot(`
      {
        "accessControl": {
          "archiveDate": "2024-07-01T00:00:00",
          "publishDate": "2024-05-01T00:00:00",
        },
        "extensions": [],
        "success": true,
      }
    `);
  });
});

describe('convertAccessRuleToJson', () => {
  function createMockAccessRule(
    overrides: Partial<CourseInstanceAccessRule> = {},
  ): CourseInstanceAccessRule {
    return {
      id: '1',
      course_instance_id: '1',
      start_date: null,
      end_date: null,
      uids: null,
      institution: null,
      json_comment: null,
      number: null,
      ...overrides,
    };
  }

  it('converts access rule with all fields', () => {
    const startDate = new Date('2024-05-01T00:00:00Z');
    const endDate = new Date('2024-07-01T00:00:00Z');
    const accessRule = createMockAccessRule({
      start_date: startDate,
      end_date: endDate,
      uids: ['user1', 'user2'],
      institution: 'Test University',
      json_comment: { text: 'Test comment' },
    });

    const result = convertAccessRuleToJson(accessRule, 'UTC');

    expect(result).toMatchInlineSnapshot(`
      {
        "comment": {
          "text": "Test comment",
        },
        "endDate": "2024-07-01T00:00:00",
        "institution": "Test University",
        "startDate": "2024-05-01T00:00:00",
        "uids": [
          "user1",
          "user2",
        ],
      }
    `);
  });

  it('converts access rule with minimal fields', () => {
    const accessRule = createMockAccessRule({
      start_date: new Date('2024-05-01T00:00:00Z'),
    });

    const result = convertAccessRuleToJson(accessRule, 'UTC');

    expect(result).toMatchInlineSnapshot(`
      {
        "startDate": "2024-05-01T00:00:00",
      }
    `);
  });

  it('handles null and empty values correctly', () => {
    const accessRule = createMockAccessRule({
      uids: [],
    });

    const result = convertAccessRuleToJson(accessRule, 'UTC');

    expect(result).toMatchInlineSnapshot('{}');
  });
});
