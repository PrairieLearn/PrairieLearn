/* eslint-disable vitest/no-commented-out-tests */
// import { afterAll, assert, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// import * as sqldb from '@prairielearn/postgres';

// import {
//   insertPublishingEnrollmentExtension,
//   insertPublishingExtension,
// } from '../models/course-instance-publishing-extensions.js';
// import { insertCourse } from '../models/course.js';
// import { ensureEnrollment } from '../models/enrollment.js';
// import { generateUser } from '../models/user.js';
// import * as helperDb from '../tests/helperDb.js';

// import { dangerousFullAuthzForTesting } from './authzData.js';
// import {
//   type CourseInstanceAccessParams,
//   evaluateModernCourseInstanceAccess as evaluateCourseInstanceAccess,
// } from './course-instance-access.js';
// import {
//   convertAccessRuleToJson,
//   migrateAccessRuleJsonToPublishingConfiguration,
// } from './course-instance-access.shared.js';
// import { type CourseInstance, type CourseInstanceAccessRule } from './db-types.js';

// const sql = sqldb.loadSqlEquiv(import.meta.url);

// // Global variable to store the test enrollment ID
// let testEnrollmentId: string;

// /**
//  * Sets up test data for course instance publishing extension tests.
//  *
//  * Creates a complete test environment with:
//  * - A course (ID: 100)
//  * - A course instance (ID: 100) with configurable end date
//  * - A test user (ID: 100) with email 'testuser@example.com'
//  * - An enrollment linking the user to the course instance
//  *
//  * @param courseInstanceEndDate - The end date for the course instance
//  */
// async function setupExtensionTests(courseInstanceEndDate: string): Promise<void> {
//   // Create course using model function
//   const course = await insertCourse({
//     institution_id: '1',
//     short_name: 'TEST100',
//     title: 'Test Course',
//     display_timezone: 'UTC',
//     path: '/path/to/course/100',
//     repository: 'https://github.com/test/course',
//     branch: 'main',
//     authn_user_id: '1',
//   });

//   // Create course instance using SQL (no model function available)
//   await sqldb.execute(sql.insert_course_instance, {
//     id: '100',
//     uuid: '5159a291-566f-4463-8f11-b07c931ad72a',
//     course_id: course.id,
//     display_timezone: 'UTC',
//     enrollment_code: 'TEST123',
//     publishing_start_date: '2024-01-01 00:00:00-00',
//     publishing_end_date: courseInstanceEndDate,
//   });

//   // Create user using model function
//   const user = await generateUser();

//   const courseInstance = createMockCourseInstance({ id: '100' });
//   // Create enrollment using model function
//   const enrollment = await ensureEnrollment({
//     courseInstance,
//     userId: user.user_id,
//     requestedRole: 'Student',
//     authzData: dangerousFullAuthzForTesting(),
//     actionDetail: 'implicit_joined',
//   });

//   // Store the enrollment ID for use in tests
//   testEnrollmentId = enrollment?.id || '100';
// }

// /**
//  * Cleans up test data created by setupExtensionTests.
//  *
//  * Removes all test data in the correct order to respect foreign key constraints:
//  * - Course instance publishing enrollment extensions
//  * - Course instance publishing extensions
//  * - Enrollments
//  * - Users
//  * - Course instances
//  * - Courses
//  *
//  * All deletions target test data with ID 100.
//  */
// async function cleanupExtensionTests(): Promise<void> {
//   await sqldb.execute(sql.cleanup_extension_tests);
// }

// /**
//  * Links a course instance publishing extension to a specific enrollment.
//  *
//  * @param extensionId - The ID of the publishing extension
//  * @param enrollmentId - The ID of the enrollment to link
//  * @returns The created enrollment extension link record
//  */
// async function linkExtensionToEnrollment(extensionId: string, enrollmentId: string) {
//   return await insertPublishingEnrollmentExtension({
//     course_instance_publishing_extension_id: extensionId,
//     enrollment_id: enrollmentId,
//   });
// }

// function createMockCourseInstance(overrides: Partial<CourseInstance> = {}): CourseInstance {
//   return {
//     id: '1',
//     course_id: '1',
//     short_name: 'test',
//     long_name: 'Test Course Instance',
//     uuid: '12345678-1234-1234-1234-123456789012',
//     deleted_at: null,
//     display_timezone: 'UTC',
//     enrollment_code: 'TEST123',
//     enrollment_limit: null,
//     hide_in_enroll_page: false,
//     json_comment: null,
//     self_enrollment_enabled: true,
//     self_enrollment_enabled_before_date: null,
//     self_enrollment_use_enrollment_code: false,
//     self_enrollment_restrict_to_institution: false,
//     share_source_publicly: false,
//     sync_errors: null,
//     sync_job_sequence_id: null,
//     sync_warnings: null,
//     assessments_group_by: 'Set',

//     // These are the only fields we care about.
//     modern_publishing: false,
//     publishing_start_date: null,
//     publishing_end_date: null,
//     ...overrides,
//   };
// }

// function createMockParams(
//   overrides: Partial<CourseInstanceAccessParams> = {},
// ): CourseInstanceAccessParams {
//   return {
//     course_instance_role: 'None',
//     course_role: 'None',
//     enrollment: null,
//     ...overrides,
//   };
// }

// describe('evaluateCourseInstanceAccess', () => {
//   it('allows access for staff with course roles', async () => {
//     const courseInstance = createMockCourseInstance();
//     const params = createMockParams({ course_role: 'Editor' });

//     const result = await evaluateCourseInstanceAccess(courseInstance, params, new Date());

//     assert.isTrue(result.has_instructor_access);
//   });

//   it('allows access for staff with course instance roles', async () => {
//     const courseInstance = createMockCourseInstance();
//     const params = createMockParams({ course_instance_role: 'Student Data Viewer' });

//     const result = await evaluateCourseInstanceAccess(courseInstance, params, new Date());

//     assert.isTrue(result.has_instructor_access);
//   });

//   it('allows access for course owners', async () => {
//     const courseInstance = createMockCourseInstance();
//     const params = createMockParams({ course_role: 'Owner' });

//     const result = await evaluateCourseInstanceAccess(courseInstance, params, new Date());

//     assert.isTrue(result.has_instructor_access);
//   });

//   it('denies access when course instance is not published', async () => {
//     const courseInstance = createMockCourseInstance({});
//     const params = createMockParams();

//     const result = await evaluateCourseInstanceAccess(courseInstance, params, new Date());

//     assert.isFalse(result.has_instructor_access);
//   });

//   it('denies access when published start date is enabled and current date is before start date', async () => {
//     const startDate = new Date('2024-06-01T00:00:00Z');
//     const currentDate = new Date('2024-05-01T00:00:00Z');

//     const courseInstance = createMockCourseInstance({
//       publishing_start_date: startDate,
//     });
//     const params = createMockParams();

//     const result = await evaluateCourseInstanceAccess(courseInstance, params, currentDate);

//     assert.isFalse(result.hasAccess);
//     assert.equal(result.reason, 'Course instance is not yet published');
//   });

//   it('denies access when current date is after published end date', async () => {
//     const startDate = new Date('2024-04-01T00:00:00Z');
//     const endDate = new Date('2024-05-01T00:00:00Z');
//     const currentDate = new Date('2024-06-01T00:00:00Z');

//     const courseInstance = createMockCourseInstance({
//       publishing_start_date: startDate,
//       publishing_end_date: endDate,
//     });
//     const params = createMockParams();

//     const result = await evaluateCourseInstanceAccess(courseInstance, params, currentDate);

//     assert.isFalse(result.hasAccess);
//     assert.equal(result.reason, 'Course instance is not published');
//   });

//   it('combines start and end date restrictions correctly', async () => {
//     const startDate = new Date('2024-05-01T00:00:00Z');
//     const endDate = new Date('2024-07-01T00:00:00Z');
//     const currentDate = new Date('2024-06-01T00:00:00Z');

//     const courseInstance = createMockCourseInstance({
//       publishing_start_date: startDate,
//       publishing_end_date: endDate,
//     });
//     const params = createMockParams();

//     const result = await evaluateCourseInstanceAccess(courseInstance, params, currentDate);

//     assert.isTrue(result.hasAccess);
//   });

//   it('prioritizes start date restriction over end date restriction', async () => {
//     const startDate = new Date('2024-07-01T00:00:00Z');
//     const endDate = new Date('2024-05-01T00:00:00Z');
//     const currentDate = new Date('2024-06-01T00:00:00Z');

//     const courseInstance = createMockCourseInstance({
//       publishing_start_date: startDate,
//       publishing_end_date: endDate,
//     });
//     const params = createMockParams();

//     const result = await evaluateCourseInstanceAccess(courseInstance, params, currentDate);

//     assert.isFalse(result.hasAccess);
//     assert.equal(result.reason, 'Course instance is not yet published');
//   });

//   it('staff bypass all restrictions even when course instance is not published', async () => {
//     const courseInstance = createMockCourseInstance({
//       publishing_start_date: new Date('2024-07-01T00:00:00Z'),
//       publishing_end_date: new Date('2024-05-01T00:00:00Z'),
//     });
//     const params = createMockParams({ course_role: 'Viewer' });

//     const result = await evaluateCourseInstanceAccess(courseInstance, params, new Date());

//     assert.isTrue(result.hasAccess);
//   });

//   it('uses current date when no date is provided', async () => {
//     const courseInstance = createMockCourseInstance({
//       publishing_start_date: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
//     });
//     const params = createMockParams();

//     const result = await evaluateCourseInstanceAccess(courseInstance, params, new Date());

//     assert.isFalse(result.hasAccess);
//     assert.equal(result.reason, 'Course instance is not yet published');
//   });
// });

// describe('convertAccessRuleToJson', () => {
//   function createMockAccessRule(
//     overrides: Partial<CourseInstanceAccessRule> = {},
//   ): CourseInstanceAccessRule {
//     return {
//       id: '1',
//       course_instance_id: '1',
//       start_date: null,
//       end_date: null,
//       uids: null,
//       institution: null,
//       json_comment: null,
//       number: null,
//       ...overrides,
//     };
//   }

//   it('converts access rule with all fields', () => {
//     const startDate = new Date('2024-05-01T00:00:00Z');
//     const endDate = new Date('2024-07-01T00:00:00Z');
//     const accessRule = createMockAccessRule({
//       start_date: startDate,
//       end_date: endDate,
//       uids: ['user1', 'user2'],
//       institution: 'Test University',
//       json_comment: { text: 'Test comment' },
//     });

//     const result = convertAccessRuleToJson(accessRule, 'UTC');

//     expect(result).toMatchInlineSnapshot(`
//       {
//         "comment": {
//           "text": "Test comment",
//         },
//         "endDate": "2024-07-01T00:00:00",
//         "institution": "Test University",
//         "startDate": "2024-05-01T00:00:00",
//         "uids": [
//           "user1",
//           "user2",
//         ],
//       }
//     `);
//   });

//   it('converts access rule with minimal fields', () => {
//     const accessRule = createMockAccessRule({
//       start_date: new Date('2024-05-01T00:00:00Z'),
//     });

//     const result = convertAccessRuleToJson(accessRule, 'UTC');

//     expect(result).toMatchInlineSnapshot(`
//       {
//         "startDate": "2024-05-01T00:00:00",
//       }
//     `);
//   });

//   it('handles null and empty values correctly', () => {
//     const accessRule = createMockAccessRule({
//       uids: [],
//     });

//     const result = convertAccessRuleToJson(accessRule, 'UTC');

//     expect(result).toMatchInlineSnapshot('{}');
//   });
// });

// describe('migrateAccessRulesToPublishingConfiguration (using convertAccessRuleToJson + migrateAccessRuleJsonToPublishingConfiguration)', () => {
//   function createMockAccessRule(
//     overrides: Partial<CourseInstanceAccessRule> = {},
//   ): CourseInstanceAccessRule {
//     return {
//       id: '1',
//       course_instance_id: '1',
//       start_date: null,
//       end_date: null,
//       uids: null,
//       institution: null,
//       json_comment: null,
//       number: null,
//       ...overrides,
//     };
//   }

//   it('successfully migrates a single rule with start and end dates', () => {
//     const startDate = new Date('2024-05-01T00:00:00Z');
//     const endDate = new Date('2024-07-01T00:00:00Z');
//     const accessRules = [createMockAccessRule({ start_date: startDate, end_date: endDate })];

//     // Convert to JSON format first
//     const accessRuleJson = convertAccessRuleToJson(accessRules[0], 'UTC');
//     const result = migrateAccessRuleJsonToPublishingConfiguration([accessRuleJson]);

//     expect(result).toMatchInlineSnapshot(`
//       {
//         "publishingConfiguration": {
//           "endDate": "2024-07-01T00:00:00",
//           "startDate": "2024-05-01T00:00:00",
//         },
//         "success": true,
//       }
//     `);
//   });

//   it('fails when there are no access rules', () => {
//     const accessRules: CourseInstanceAccessRule[] = [];

//     // Convert to JSON format first
//     const accessRuleJsonArray = accessRules.map((rule) => convertAccessRuleToJson(rule, 'UTC'));
//     const result = migrateAccessRuleJsonToPublishingConfiguration(accessRuleJsonArray);

//     expect(result).toMatchInlineSnapshot(`
//       {
//         "error": "Cannot migrate access rules since there is no start or end date that can be inferred.",
//         "success": false,
//       }
//     `);
//   });

//   it('fails when there are multiple access rules', () => {
//     const accessRules = [
//       createMockAccessRule({ start_date: new Date('2024-05-01T00:00:00Z') }),
//       createMockAccessRule({ start_date: new Date('2024-06-01T00:00:00Z') }),
//     ];

//     // Convert to JSON format first
//     const accessRuleJsonArray = accessRules.map((rule) => convertAccessRuleToJson(rule, 'UTC'));
//     const result = migrateAccessRuleJsonToPublishingConfiguration(accessRuleJsonArray);

//     expect(result).toMatchInlineSnapshot(`
//       {
//         "error": "Cannot migrate access rules since there is no start or end date that can be inferred.",
//         "success": false,
//       }
//     `);
//   });

//   it('successfully migrates access rule with UID selectors to overrides', () => {
//     const startDate = new Date('2024-05-01T00:00:00Z');
//     const endDate = new Date('2024-07-01T00:00:00Z');
//     const accessRules = [
//       createMockAccessRule({
//         start_date: startDate,
//         end_date: endDate,
//         uids: ['user1@example.com', 'user2@example.com'],
//         json_comment: 'Test comment',
//       }),
//     ];

//     // Convert to JSON format first
//     const accessRuleJson = convertAccessRuleToJson(accessRules[0], 'UTC');
//     const result = migrateAccessRuleJsonToPublishingConfiguration([accessRuleJson]);

//     expect(result).toMatchInlineSnapshot(`
//       {
//         "publishingConfiguration": {
//           "endDate": "2024-07-01T00:00:00",
//           "startDate": "2024-05-01T00:00:00",
//         },
//         "success": true,
//       }
//     `);
//   });

//   it('successfully migrates access rule with UID selectors and no comment', () => {
//     const startDate = new Date('2024-05-01T00:00:00Z');
//     const endDate = new Date('2024-07-01T00:00:00Z');
//     const accessRules = [
//       createMockAccessRule({
//         start_date: startDate,
//         end_date: endDate,
//         uids: ['user1@example.com'],
//         json_comment: null,
//       }),
//     ];

//     // Convert to JSON format first
//     const accessRuleJson = convertAccessRuleToJson(accessRules[0], 'UTC');
//     const result = migrateAccessRuleJsonToPublishingConfiguration([accessRuleJson]);

//     expect(result).toMatchInlineSnapshot(`
//       {
//         "publishingConfiguration": {
//           "endDate": "2024-07-01T00:00:00",
//           "startDate": "2024-05-01T00:00:00",
//         },
//         "success": true,
//       }
//     `);
//   });

//   it('fails when access rule has no dates', () => {
//     const accessRules = [
//       createMockAccessRule({
//         start_date: null,
//         end_date: null,
//       }),
//     ];

//     // Convert to JSON format first
//     const accessRuleJson = convertAccessRuleToJson(accessRules[0], 'UTC');
//     const result = migrateAccessRuleJsonToPublishingConfiguration([accessRuleJson]);

//     expect(result).toMatchInlineSnapshot(`
//       {
//         "error": "Cannot migrate access rules since there is no start or end date that can be inferred.",
//         "success": false,
//       }
//     `);
//   });

//   it('handles empty UID array as global rule', () => {
//     const startDate = new Date('2024-05-01T00:00:00Z');
//     const endDate = new Date('2024-07-01T00:00:00Z');
//     const accessRules = [
//       createMockAccessRule({
//         start_date: startDate,
//         end_date: endDate,
//         uids: [],
//       }),
//     ];

//     // Convert to JSON format first
//     const accessRuleJson = convertAccessRuleToJson(accessRules[0], 'UTC');
//     const result = migrateAccessRuleJsonToPublishingConfiguration([accessRuleJson]);

//     expect(result).toMatchInlineSnapshot(`
//       {
//         "publishingConfiguration": {
//           "endDate": "2024-07-01T00:00:00",
//           "startDate": "2024-05-01T00:00:00",
//         },
//         "success": true,
//       }
//     `);
//   });
// });

// describe('evaluateCourseInstanceAccess with publishing extensions', () => {
//   beforeAll(helperDb.before);
//   afterAll(helperDb.after);

//   beforeEach(async () => {
//     // Clean up test data before each test
//     await cleanupExtensionTests();
//   });

//   afterAll(async () => {
//     // Clean up test data after all tests
//     await cleanupExtensionTests();
//   });

//   it('denies access for student with no enrollment when course instance is unpublished', async () => {
//     // Setup course instance with end date
//     await setupExtensionTests('2024-06-01 00:00:00-00');

//     const courseInstance = createMockCourseInstance({
//       id: '100',
//       course_id: '100',
//       publishing_start_date: new Date('2024-01-01T00:00:00Z'),
//       publishing_end_date: new Date('2024-06-01T00:00:00Z'),
//     });

//     const params = createMockParams({
//       enrollment: null,
//     });

//     const currentDate = new Date('2024-07-01T00:00:00Z'); // After end date

//     const result = await evaluateCourseInstanceAccess(courseInstance, params, currentDate);

//     assert.isFalse(result.hasAccess);
//     assert.equal(result.reason, 'Course instance is not published');
//   });

//   it('denies access for student with enrollment but no extensions when course instance is unpublished', async () => {
//     // Setup course instance with end date
//     await setupExtensionTests('2024-06-01 00:00:00-00');

//     const courseInstance = createMockCourseInstance({
//       id: '100',
//       course_id: '100',
//       publishing_start_date: new Date('2024-01-01T00:00:00Z'),
//       publishing_end_date: new Date('2024-06-01T00:00:00Z'),
//     });

//     const params = createMockParams({
//       enrollment: { id: '100' } as any, // Mock enrollment object
//     });

//     const currentDate = new Date('2024-07-01T00:00:00Z'); // After end date

//     const result = await evaluateCourseInstanceAccess(courseInstance, params, currentDate);

//     assert.isFalse(result.hasAccess);
//     assert.equal(result.reason, 'Course instance is not published');
//   });

//   it('grants access for student with one extension that extends access beyond course instance archive', async () => {
//     // Setup course instance with end date
//     await setupExtensionTests('2024-06-01 00:00:00-00');

//     // Create extension that extends access
//     const extension = await insertPublishingExtension({
//       course_instance_id: '100',
//       name: 'Extended Access',
//       end_date: new Date('2024-08-01 00:00:00-00'),
//     });

//     // Link extension to enrollment
//     await linkExtensionToEnrollment(extension.id, testEnrollmentId);

//     const courseInstance = createMockCourseInstance({
//       id: '100',
//       course_id: '100',
//       publishing_start_date: new Date('2024-01-01T00:00:00Z'),
//       publishing_end_date: new Date('2024-06-01T00:00:00Z'),
//     });

//     const params = createMockParams({
//       enrollment: { id: testEnrollmentId } as any,
//     });

//     const currentDate = new Date('2024-07-01T00:00:00Z'); // After course instance archive, before extension archive

//     const result = await evaluateCourseInstanceAccess(courseInstance, params, currentDate);

//     assert.isTrue(result.hasAccess);
//   });

//   it('uses latest extension end date when student has multiple extensions', async () => {
//     // Setup course instance with end date
//     await setupExtensionTests('2024-06-01 00:00:00-00');

//     // Create first extension
//     const extension1 = await insertPublishingExtension({
//       course_instance_id: '100',
//       name: 'Extension 1',
//       end_date: new Date('2024-07-01 00:00:00-00'),
//     });

//     // Create second extension with later end date
//     const extension2 = await insertPublishingExtension({
//       course_instance_id: '100',
//       name: 'Extension 2',
//       end_date: new Date('2024-09-01 00:00:00-00'),
//     });

//     // Link both extensions to enrollment
//     await linkExtensionToEnrollment(extension1.id, testEnrollmentId);
//     await linkExtensionToEnrollment(extension2.id, testEnrollmentId);

//     const courseInstance = createMockCourseInstance({
//       id: '100',
//       course_id: '100',
//       publishing_start_date: new Date('2024-01-01T00:00:00Z'),
//       publishing_end_date: new Date('2024-06-01T00:00:00Z'),
//     });

//     const params = createMockParams({
//       enrollment: { id: testEnrollmentId } as any,
//     });

//     const currentDate = new Date('2024-08-01T00:00:00Z'); // After first extension, before second extension

//     const result = await evaluateCourseInstanceAccess(courseInstance, params, currentDate);

//     assert.isTrue(result.hasAccess); // Should use latest extension (2024-09-01)
//   });

//   it('denies access when current date is after both course instance and extension have unpublished', async () => {
//     // Setup course instance with end date
//     await setupExtensionTests('2024-06-01 00:00:00-00');

//     // Create extension that extends access
//     const extension = await insertPublishingExtension({
//       course_instance_id: '100',
//       name: 'Extended Access',
//       end_date: new Date('2024-08-01 00:00:00-00'),
//     });

//     // Link extension to enrollment
//     await linkExtensionToEnrollment(extension.id, testEnrollmentId);

//     const courseInstance = createMockCourseInstance({
//       id: '100',
//       course_id: '100',
//       publishing_start_date: new Date('2024-01-01T00:00:00Z'),
//       publishing_end_date: new Date('2024-06-01T00:00:00Z'),
//     });

//     const params = createMockParams({
//       enrollment: { id: testEnrollmentId } as any,
//     });

//     const currentDate = new Date('2024-09-01T00:00:00Z'); // After both course instance and extension have unpublished

//     const result = await evaluateCourseInstanceAccess(courseInstance, params, currentDate);

//     assert.isFalse(result.hasAccess);
//     assert.equal(result.reason, 'Course instance is not published');
//   });
// });
