import { afterAll, assert, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';

import * as helperDb from '../tests/helperDb.js';

import {
  type CourseInstanceAccessParams,
  evaluateCourseInstanceAccess,
} from './course-instance-access.js';
import {
  convertAccessRuleToJson,
  migrateAccessRuleJsonToPublishingConfiguration,
} from './course-instance-access.shared.js';
import { type CourseInstance, type CourseInstancePublishingRule, IdSchema } from './db-types.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

/**
 * Sets up test data for course instance publishing extension tests.
 *
 * Creates a complete test environment with:
 * - A course (ID: 100)
 * - A course instance (ID: 100) with configurable archive date
 * - A test user (ID: 100) with email 'testuser@example.com'
 * - An enrollment linking the user to the course instance
 *
 * @param courseInstanceArchiveDate - The archive date for the course instance
 */
async function setupExtensionTests(courseInstanceArchiveDate: string): Promise<void> {
  await sqldb.execute(sql.setup_extension_tests, {
    course_instance_archive_date: courseInstanceArchiveDate,
  });
}

/**
 * Cleans up test data created by setupExtensionTests.
 *
 * Removes all test data in the correct order to respect foreign key constraints:
 * - Course instance publishing enrollment extensions
 * - Course instance publishing extensions
 * - Enrollments
 * - Users
 * - Course instances
 * - Courses
 *
 * All deletions target test data with ID 100.
 */
async function cleanupExtensionTests(): Promise<void> {
  await sqldb.execute(sql.cleanup_extension_tests);
}

/**
 * Creates a new course instance publishing extension for testing.
 *
 * @param courseInstanceId - The ID of the course instance
 * @param name - The name of the extension (can be null)
 * @param archiveDate - The archive date for the extension
 * @returns The created extension record
 */
async function insertExtension(
  courseInstanceId: string,
  name: string,
  archiveDate: string,
): Promise<{
  id: string;
  course_instance_id: string;
  name: string | null;
  archive_date: Date;
}> {
  return await sqldb.queryRow(
    sql.insert_extension,
    {
      course_instance_id: courseInstanceId,
      name,
      archive_date: archiveDate,
    },
    z.object({
      id: IdSchema,
      course_instance_id: IdSchema,
      name: z.string().nullable(),
      archive_date: z.date(),
    }),
  );
}

/**
 * Links a course instance publishing extension to a specific enrollment.
 *
 * @param extensionId - The ID of the publishing extension
 * @param enrollmentId - The ID of the enrollment to link
 * @returns The created enrollment extension link record
 */
async function linkExtensionToEnrollment(extensionId: string, enrollmentId: string) {
  return await sqldb.queryRow(
    sql.link_extension_to_enrollment,
    {
      extension_id: extensionId,
      enrollment_id: enrollmentId,
    },
    z.object({
      id: IdSchema,
      course_instance_publishing_extension_id: IdSchema,
      enrollment_id: IdSchema,
    }),
  );
}

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
    self_enrollment_use_enrollment_code: false,
    share_source_publicly: false,
    sync_errors: null,
    sync_job_sequence_id: null,
    sync_warnings: null,
    assessments_group_by: 'Set',

    // These are the only fields we care about.
    publishing_publish_date: null,
    publishing_archive_date: null,
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
    enrollment: null,
    ...overrides,
  };
}

describe('evaluateCourseInstanceAccess', () => {
  it('allows access for staff with course roles', async () => {
    const courseInstance = createMockCourseInstance();
    const params = createMockParams({ course_role: 'Editor' });

    const result = await evaluateCourseInstanceAccess(courseInstance, params);

    assert.isTrue(result.hasAccess);
  });

  it('allows access for staff with course instance roles', async () => {
    const courseInstance = createMockCourseInstance();
    const params = createMockParams({ course_instance_role: 'Student Data Viewer' });

    const result = await evaluateCourseInstanceAccess(courseInstance, params);

    assert.isTrue(result.hasAccess);
  });

  it('allows access for course owners', async () => {
    const courseInstance = createMockCourseInstance();
    const params = createMockParams({ course_role: 'Owner' });

    const result = await evaluateCourseInstanceAccess(courseInstance, params);

    assert.isTrue(result.hasAccess);
  });

  it('denies access when course instance is not published', async () => {
    const courseInstance = createMockCourseInstance({});
    const params = createMockParams();

    const result = await evaluateCourseInstanceAccess(courseInstance, params);

    assert.isFalse(result.hasAccess);
    assert.equal(result.reason, 'Course instance is not published');
  });

  it('denies access when published start date is enabled and current date is before start date', async () => {
    const publishDate = new Date('2024-06-01T00:00:00Z');
    const currentDate = new Date('2024-05-01T00:00:00Z');

    const courseInstance = createMockCourseInstance({
      publishing_publish_date: publishDate,
    });
    const params = createMockParams();

    const result = await evaluateCourseInstanceAccess(courseInstance, params, currentDate);

    assert.isFalse(result.hasAccess);
    assert.equal(result.reason, 'Course instance is not yet published');
  });

  it('denies access when current date is after published end date', async () => {
    const publishDate = new Date('2024-04-01T00:00:00Z');
    const archiveDate = new Date('2024-05-01T00:00:00Z');
    const currentDate = new Date('2024-06-01T00:00:00Z');

    const courseInstance = createMockCourseInstance({
      publishing_publish_date: publishDate,
      publishing_archive_date: archiveDate,
    });
    const params = createMockParams();

    const result = await evaluateCourseInstanceAccess(courseInstance, params, currentDate);

    assert.isFalse(result.hasAccess);
    assert.equal(result.reason, 'Course instance has been archived');
  });

  it('combines start and end date restrictions correctly', async () => {
    const publishDate = new Date('2024-05-01T00:00:00Z');
    const archiveDate = new Date('2024-07-01T00:00:00Z');
    const currentDate = new Date('2024-06-01T00:00:00Z');

    const courseInstance = createMockCourseInstance({
      publishing_publish_date: publishDate,
      publishing_archive_date: archiveDate,
    });
    const params = createMockParams();

    const result = await evaluateCourseInstanceAccess(courseInstance, params, currentDate);

    assert.isTrue(result.hasAccess);
  });

  it('prioritizes start date restriction over end date restriction', async () => {
    const publishDate = new Date('2024-07-01T00:00:00Z');
    const archiveDate = new Date('2024-05-01T00:00:00Z');
    const currentDate = new Date('2024-06-01T00:00:00Z');

    const courseInstance = createMockCourseInstance({
      publishing_publish_date: publishDate,
      publishing_archive_date: archiveDate,
    });
    const params = createMockParams();

    const result = await evaluateCourseInstanceAccess(courseInstance, params, currentDate);

    assert.isFalse(result.hasAccess);
    assert.equal(result.reason, 'Course instance is not yet published');
  });

  it('staff bypass all restrictions even when course instance is not published', async () => {
    const courseInstance = createMockCourseInstance({
      publishing_publish_date: new Date('2024-07-01T00:00:00Z'),
      publishing_archive_date: new Date('2024-05-01T00:00:00Z'),
    });
    const params = createMockParams({ course_role: 'Viewer' });

    const result = await evaluateCourseInstanceAccess(courseInstance, params);

    assert.isTrue(result.hasAccess);
  });

  it('uses current date when no date is provided', async () => {
    const courseInstance = createMockCourseInstance({
      publishing_publish_date: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
    });
    const params = createMockParams();

    const result = await evaluateCourseInstanceAccess(courseInstance, params);

    assert.isFalse(result.hasAccess);
    assert.equal(result.reason, 'Course instance is not yet published');
  });
});

describe('convertAccessRuleToJson', () => {
  function createMockAccessRule(
    overrides: Partial<CourseInstancePublishingRule> = {},
  ): CourseInstancePublishingRule {
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

describe('migrateAccessRulesToPublishingConfiguration (using convertAccessRuleToJson + migrateAccessRuleJsonToPublishingConfiguration)', () => {
  function createMockAccessRule(
    overrides: Partial<CourseInstancePublishingRule> = {},
  ): CourseInstancePublishingRule {
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
    const result = migrateAccessRuleJsonToPublishingConfiguration([accessRuleJson]);

    expect(result).toMatchInlineSnapshot(`
      {
        "publishingConfiguration": {
          "archiveDate": "2024-07-01T00:00:00",
          "publishDate": "2024-05-01T00:00:00",
        },
        "success": true,
      }
    `);
  });

  it('fails when there are no access rules', () => {
    const accessRules: CourseInstancePublishingRule[] = [];

    // Convert to JSON format first
    const accessRuleJsonArray = accessRules.map((rule) => convertAccessRuleToJson(rule, 'UTC'));
    const result = migrateAccessRuleJsonToPublishingConfiguration(accessRuleJsonArray);

    expect(result).toMatchInlineSnapshot(`
      {
        "error": "Cannot migrate access rules since there is no start or end date that can be inferred.",
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
    const result = migrateAccessRuleJsonToPublishingConfiguration(accessRuleJsonArray);

    expect(result).toMatchInlineSnapshot(`
      {
        "error": "Cannot migrate access rules since there is no start or end date that can be inferred.",
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
    const result = migrateAccessRuleJsonToPublishingConfiguration([accessRuleJson]);

    expect(result).toMatchInlineSnapshot(`
      {
        "publishingConfiguration": {
          "archiveDate": "2024-07-01T00:00:00",
          "publishDate": "2024-05-01T00:00:00",
        },
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
    const result = migrateAccessRuleJsonToPublishingConfiguration([accessRuleJson]);

    expect(result).toMatchInlineSnapshot(`
      {
        "publishingConfiguration": {
          "archiveDate": "2024-07-01T00:00:00",
          "publishDate": "2024-05-01T00:00:00",
        },
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
    const result = migrateAccessRuleJsonToPublishingConfiguration([accessRuleJson]);

    expect(result).toMatchInlineSnapshot(`
      {
        "error": "Cannot migrate access rules since there is no start or end date that can be inferred.",
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
    const result = migrateAccessRuleJsonToPublishingConfiguration([accessRuleJson]);

    expect(result).toMatchInlineSnapshot(`
      {
        "publishingConfiguration": {
          "archiveDate": "2024-07-01T00:00:00",
          "publishDate": "2024-05-01T00:00:00",
        },
        "success": true,
      }
    `);
  });
});

describe('evaluateCourseInstanceAccess with publishing extensions', () => {
  beforeAll(helperDb.before);
  afterAll(helperDb.after);

  beforeEach(async () => {
    // Clean up test data before each test
    await cleanupExtensionTests();
  });

  afterAll(async () => {
    // Clean up test data after all tests
    await cleanupExtensionTests();
  });

  it('denies access for student with no enrollment when course instance is archived', async () => {
    // Setup course instance with archive date
    await setupExtensionTests('2024-06-01 00:00:00-00');

    const courseInstance = createMockCourseInstance({
      id: '100',
      course_id: '100',
      publishing_publish_date: new Date('2024-01-01T00:00:00Z'),
      publishing_archive_date: new Date('2024-06-01T00:00:00Z'),
    });

    const params = createMockParams({
      enrollment: null,
    });

    const currentDate = new Date('2024-07-01T00:00:00Z'); // After archive date

    const result = await evaluateCourseInstanceAccess(courseInstance, params, currentDate);

    assert.isFalse(result.hasAccess);
    assert.equal(result.reason, 'Course instance has been archived');
  });

  it('denies access for student with enrollment but no extensions when course instance is archived', async () => {
    // Setup course instance with archive date
    await setupExtensionTests('2024-06-01 00:00:00-00');

    const courseInstance = createMockCourseInstance({
      id: '100',
      course_id: '100',
      publishing_publish_date: new Date('2024-01-01T00:00:00Z'),
      publishing_archive_date: new Date('2024-06-01T00:00:00Z'),
    });

    const params = createMockParams({
      enrollment: { id: '100' } as any, // Mock enrollment object
    });

    const currentDate = new Date('2024-07-01T00:00:00Z'); // After archive date

    const result = await evaluateCourseInstanceAccess(courseInstance, params, currentDate);

    assert.isFalse(result.hasAccess);
    assert.equal(result.reason, 'Course instance has been archived');
  });

  it('grants access for student with one extension that extends access beyond course instance archive', async () => {
    // Setup course instance with archive date
    await setupExtensionTests('2024-06-01 00:00:00-00');

    // Create extension that extends access
    const extension = await insertExtension('100', 'Extended Access', '2024-08-01 00:00:00-00');

    // Link extension to enrollment
    await linkExtensionToEnrollment(extension.id, '100');

    const courseInstance = createMockCourseInstance({
      id: '100',
      course_id: '100',
      publishing_publish_date: new Date('2024-01-01T00:00:00Z'),
      publishing_archive_date: new Date('2024-06-01T00:00:00Z'),
    });

    const params = createMockParams({
      enrollment: { id: '100' } as any,
    });

    const currentDate = new Date('2024-07-01T00:00:00Z'); // After course instance archive, before extension archive

    const result = await evaluateCourseInstanceAccess(courseInstance, params, currentDate);

    assert.isTrue(result.hasAccess);
  });

  it('uses latest extension archive date when student has multiple extensions', async () => {
    // Setup course instance with archive date
    await sqldb.execute(sql.setup_extension_tests, {
      course_instance_archive_date: '2024-06-01 00:00:00-00',
    });

    // Create first extension
    const extension1 = await sqldb.queryRow(
      sql.insert_extension,
      {
        course_instance_id: '100',
        name: 'Extension 1',
        archive_date: '2024-07-01 00:00:00-00',
      },
      z.object({
        id: z.string(),
        course_instance_id: z.string(),
        name: z.string().nullable(),
        archive_date: z.date(),
      }),
    );

    // Create second extension with later archive date
    const extension2 = await sqldb.queryRow(
      sql.insert_extension,
      {
        course_instance_id: '100',
        name: 'Extension 2',
        archive_date: '2024-09-01 00:00:00-00',
      },
      z.object({
        id: z.string(),
        course_instance_id: z.string(),
        name: z.string().nullable(),
        archive_date: z.date(),
      }),
    );

    // Link both extensions to enrollment
    await sqldb.queryRow(
      sql.link_extension_to_enrollment,
      {
        extension_id: extension1.id,
        enrollment_id: '100',
      },
      z.object({
        id: z.string(),
        course_instance_publishing_extension_id: z.string(),
        enrollment_id: z.string(),
      }),
    );

    await sqldb.queryRow(
      sql.link_extension_to_enrollment,
      {
        extension_id: extension2.id,
        enrollment_id: '100',
      },
      z.object({
        id: z.string(),
        course_instance_publishing_extension_id: z.string(),
        enrollment_id: z.string(),
      }),
    );

    const courseInstance = createMockCourseInstance({
      id: '100',
      course_id: '100',
      publishing_publish_date: new Date('2024-01-01T00:00:00Z'),
      publishing_archive_date: new Date('2024-06-01T00:00:00Z'),
    });

    const params = createMockParams({
      enrollment: { id: '100' } as any,
    });

    const currentDate = new Date('2024-08-01T00:00:00Z'); // After first extension, before second extension

    const result = await evaluateCourseInstanceAccess(courseInstance, params, currentDate);

    assert.isTrue(result.hasAccess); // Should use latest extension (2024-09-01)
  });

  it('denies access when extension restricts access earlier than course instance archive', async () => {
    // Setup course instance with archive date
    await sqldb.execute(sql.setup_extension_tests, {
      course_instance_archive_date: '2024-08-01 00:00:00-00',
    });

    // Create extension that restricts access earlier
    const extension = await sqldb.queryRow(
      sql.insert_extension,
      {
        course_instance_id: '100',
        name: 'Early Restriction',
        archive_date: '2024-06-01 00:00:00-00',
      },
      z.object({
        id: z.string(),
        course_instance_id: z.string(),
        name: z.string().nullable(),
        archive_date: z.date(),
      }),
    );

    // Link extension to enrollment
    await sqldb.queryRow(
      sql.link_extension_to_enrollment,
      {
        extension_id: extension.id,
        enrollment_id: '100',
      },
      z.object({
        id: z.string(),
        course_instance_publishing_extension_id: z.string(),
        enrollment_id: z.string(),
      }),
    );

    const courseInstance = createMockCourseInstance({
      id: '100',
      course_id: '100',
      publishing_publish_date: new Date('2024-01-01T00:00:00Z'),
      publishing_archive_date: new Date('2024-08-01T00:00:00Z'),
    });

    const params = createMockParams({
      enrollment: { id: '100' } as any,
    });

    const currentDate = new Date('2024-07-01T00:00:00Z'); // After extension archive, before course instance archive

    const result = await evaluateCourseInstanceAccess(courseInstance, params, currentDate);

    assert.isFalse(result.hasAccess);
    assert.equal(result.reason, 'Course instance has been archived');
  });

  it('denies access when current date is after both course instance and extension have archived', async () => {
    // Setup course instance with archive date
    await sqldb.execute(sql.setup_extension_tests, {
      course_instance_archive_date: '2024-06-01 00:00:00-00',
    });

    // Create extension that extends access
    const extension = await sqldb.queryRow(
      sql.insert_extension,
      {
        course_instance_id: '100',
        name: 'Extended Access',
        archive_date: '2024-08-01 00:00:00-00',
      },
      z.object({
        id: z.string(),
        course_instance_id: z.string(),
        name: z.string().nullable(),
        archive_date: z.date(),
      }),
    );

    // Link extension to enrollment
    await sqldb.queryRow(
      sql.link_extension_to_enrollment,
      {
        extension_id: extension.id,
        enrollment_id: '100',
      },
      z.object({
        id: z.string(),
        course_instance_publishing_extension_id: z.string(),
        enrollment_id: z.string(),
      }),
    );

    const courseInstance = createMockCourseInstance({
      id: '100',
      course_id: '100',
      publishing_publish_date: new Date('2024-01-01T00:00:00Z'),
      publishing_archive_date: new Date('2024-06-01T00:00:00Z'),
    });

    const params = createMockParams({
      enrollment: { id: '100' } as any,
    });

    const currentDate = new Date('2024-09-01T00:00:00Z'); // After both course instance and extension have archived

    const result = await evaluateCourseInstanceAccess(courseInstance, params, currentDate);

    assert.isFalse(result.hasAccess);
    assert.equal(result.reason, 'Course instance has been archived');
  });
});
