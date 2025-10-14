import { afterAll, assert, beforeAll, describe, it } from 'vitest';
import { z } from 'zod';

import { execute, queryOptionalRow, queryRow } from '@prairielearn/postgres';

import { type Config, config } from '../lib/config.js';
import { EnrollmentSchema } from '../lib/db-types.js';
import { EXAMPLE_COURSE_PATH } from '../lib/paths.js';
import * as helperCourse from '../tests/helperCourse.js';
import * as helperServer from '../tests/helperServer.js';
import { getOrCreateUser } from '../tests/utils/auth.js';

describe('autoEnroll middleware with institution restrictions', () => {
  let originalIsEnterprise: boolean;
  let storedConfig: Partial<Config>;

  const siteUrl = 'http://localhost:' + config.serverPort;
  const baseUrl = siteUrl + '/pl';
  const courseInstanceUrl = baseUrl + '/course_instance/1';
  const assessmentsUrl = courseInstanceUrl + '/assessments';

  beforeAll(async function () {
    await helperServer.before()();
    await helperCourse.syncCourse(EXAMPLE_COURSE_PATH);

    // Ensure we're not in enterprise mode to avoid enterprise-specific checks
    originalIsEnterprise = config.isEnterprise;
    config.isEnterprise = false;
  });

  afterAll(async function () {
    await helperServer.after();

    // Restore original enterprise setting
    config.isEnterprise = originalIsEnterprise;
  });

  /** Helper function to clean up enrollments between tests */
  async function cleanupEnrollments() {
    await execute('DELETE FROM enrollments WHERE course_instance_id = $course_instance_id', {
      course_instance_id: '1',
    });
  }

  /** Helper function to create institutions */
  async function createInstitution(id: string, shortName: string, longName: string) {
    await queryOptionalRow(
      `INSERT INTO institutions (id, short_name, long_name, uid_regexp)
       VALUES ($id, $short_name, $long_name, $uid_regexp)
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      {
        id,
        short_name: shortName,
        long_name: longName,
        uid_regexp: `@${shortName}$`,
      },
      z.object({ id: z.string() }),
    );
  }

  /** Helper function to create a course instance with specific settings */
  async function createCourseInstanceWithSettings(
    courseInstanceId: string,
    selfEnrollmentEnabled: boolean,
    restrictToInstitution: boolean,
  ) {
    await execute(
      `UPDATE course_instances 
       SET self_enrollment_enabled = $self_enrollment_enabled,
           self_enrollment_restrict_to_institution = $restrict_to_institution
       WHERE id = $course_instance_id`,
      {
        course_instance_id: courseInstanceId,
        self_enrollment_enabled: selfEnrollmentEnabled,
        restrict_to_institution: restrictToInstitution,
      },
    );
  }

  it('allows user from same institution to self-enroll when restrictToInstitution is true', async () => {
    // Clean up any existing enrollments
    await cleanupEnrollments();

    // Create institutions
    await createInstitution('1', 'example.com', 'Example University');
    await createInstitution('2', 'other.com', 'Other University');

    // Set up course instance with institution restriction enabled
    await createCourseInstanceWithSettings('1', true, true);

    // Create user from same institution
    const sameInstitutionUser = await getOrCreateUser({
      uid: 'student@example.com',
      name: 'Same Institution Student',
      uin: 'same1',
      email: 'student@example.com',
    });

    // Update user's institution to match course institution
    await execute('UPDATE users SET institution_id = $institution_id WHERE user_id = $user_id', {
      institution_id: '1',
      user_id: sameInstitutionUser.user_id,
    });

    // Store original config
    storedConfig = {
      authUid: config.authUid,
      authName: config.authName,
      authUin: config.authUin,
    };

    // Set auth config to the test user
    config.authUid = sameInstitutionUser.uid;
    config.authName = sameInstitutionUser.name;
    config.authUin = sameInstitutionUser.uin;

    // Check that user is not enrolled initially
    const initialEnrollment = await queryOptionalRow(
      'SELECT * FROM enrollments WHERE user_id = $user_id AND course_instance_id = $course_instance_id',
      { user_id: sameInstitutionUser.user_id, course_instance_id: '1' },
      EnrollmentSchema,
    );
    assert.isNull(initialEnrollment);

    // Hit the assessments endpoint - this should trigger auto-enrollment
    const response = await fetch(assessmentsUrl);
    assert.equal(response.status, 200);

    // Check that user is now enrolled
    const finalEnrollment = await queryOptionalRow(
      'SELECT * FROM enrollments WHERE user_id = $user_id AND course_instance_id = $course_instance_id',
      { user_id: sameInstitutionUser.user_id, course_instance_id: '1' },
      EnrollmentSchema,
    );
    assert.isNotNull(finalEnrollment);
    assert.equal(finalEnrollment.status, 'joined');

    // Restore original config
    Object.assign(config, storedConfig);
  });

  it('blocks user from different institution when restrictToInstitution is true', async () => {
    // Clean up any existing enrollments
    await cleanupEnrollments();

    // Create institutions
    await createInstitution('1', 'example.com', 'Example University');
    await createInstitution('2', 'other.com', 'Other University');

    // Set up course instance with institution restriction enabled
    await createCourseInstanceWithSettings('1', true, true);

    // Create user from different institution
    const differentInstitutionUser = await getOrCreateUser({
      uid: 'student@other.com',
      name: 'Different Institution Student',
      uin: 'diff1',
      email: 'student@other.com',
    });

    // Update user's institution to be different from course institution
    await execute('UPDATE users SET institution_id = $institution_id WHERE user_id = $user_id', {
      institution_id: '2',
      user_id: differentInstitutionUser.user_id,
    });

    // Store original config
    storedConfig = {
      authUid: config.authUid,
      authName: config.authName,
      authUin: config.authUin,
    };

    // Set auth config to the test user
    config.authUid = differentInstitutionUser.uid;
    config.authName = differentInstitutionUser.name;
    config.authUin = differentInstitutionUser.uin;

    // Check that user is not enrolled initially
    const initialEnrollment = await queryOptionalRow(
      'SELECT * FROM enrollments WHERE user_id = $user_id AND course_instance_id = $course_instance_id',
      { user_id: differentInstitutionUser.user_id, course_instance_id: '1' },
      EnrollmentSchema,
    );
    assert.isNull(initialEnrollment);

    // Debug: Check the course instance and user institution settings
    const courseInstance = await queryRow(
      'SELECT * FROM course_instances WHERE id = $id',
      { id: '1' },
      z.object({ 
        id: z.string(), 
        course_id: z.string(), 
        self_enrollment_restrict_to_institution: z.boolean() 
      }),
    );
    const course = await queryRow(
      'SELECT * FROM pl_courses WHERE id = $id',
      { id: courseInstance.course_id },
      z.object({ id: z.string(), institution_id: z.string() }),
    );
    const user = await queryRow(
      'SELECT * FROM users WHERE user_id = $user_id',
      { user_id: differentInstitutionUser.user_id },
      z.object({ user_id: z.string(), institution_id: z.string().nullable() }),
    );
    
    console.log('Debug - Course institution_id:', course.institution_id);
    console.log('Debug - User institution_id:', user.institution_id);
    console.log('Debug - Course instance self_enrollment_restrict_to_institution:', courseInstance.self_enrollment_restrict_to_institution);

    // Hit the assessments endpoint - this should NOT trigger auto-enrollment
    const response = await fetch(assessmentsUrl);
    console.log('Response status:', response.status);
    console.log('Response URL:', response.url);
    
    // Check if user got enrolled despite the restriction
    const finalEnrollment = await queryOptionalRow(
      'SELECT * FROM enrollments WHERE user_id = $user_id AND course_instance_id = $course_instance_id',
      { user_id: differentInstitutionUser.user_id, course_instance_id: '1' },
      EnrollmentSchema,
    );
    console.log('Final enrollment:', finalEnrollment);
    
    assert.equal(response.status, 403);
    assert.isNull(finalEnrollment);

    // Restore original config
    Object.assign(config, storedConfig);
  });

  it('allows user from different institution when restrictToInstitution is false', async () => {
    // Clean up any existing enrollments
    await cleanupEnrollments();

    // Create institutions
    await createInstitution('1', 'example.com', 'Example University');
    await createInstitution('2', 'other.com', 'Other University');

    // Set up course instance with institution restriction disabled
    await createCourseInstanceWithSettings('1', true, false);

    // Create user from different institution
    const differentInstitutionUser = await getOrCreateUser({
      uid: 'student@other.com',
      name: 'Different Institution Student',
      uin: 'diff1',
      email: 'student@other.com',
    });

    // Update user's institution to be different from course institution
    await execute('UPDATE users SET institution_id = $institution_id WHERE user_id = $user_id', {
      institution_id: '2',
      user_id: differentInstitutionUser.user_id,
    });

    // Store original config
    storedConfig = {
      authUid: config.authUid,
      authName: config.authName,
      authUin: config.authUin,
    };

    // Set auth config to the test user
    config.authUid = differentInstitutionUser.uid;
    config.authName = differentInstitutionUser.name;
    config.authUin = differentInstitutionUser.uin;

    // Check that user is not enrolled initially
    const initialEnrollment = await queryOptionalRow(
      'SELECT * FROM enrollments WHERE user_id = $user_id AND course_instance_id = $course_instance_id',
      { user_id: differentInstitutionUser.user_id, course_instance_id: '1' },
      EnrollmentSchema,
    );
    assert.isNull(initialEnrollment);

    // Hit the assessments endpoint - this should trigger auto-enrollment
    const response = await fetch(assessmentsUrl);
    assert.equal(response.status, 200);

    // Check that user is now enrolled
    const finalEnrollment = await queryOptionalRow(
      'SELECT * FROM enrollments WHERE user_id = $user_id AND course_instance_id = $course_instance_id',
      { user_id: differentInstitutionUser.user_id, course_instance_id: '1' },
      EnrollmentSchema,
    );
    assert.isNotNull(finalEnrollment);
    assert.equal(finalEnrollment.status, 'joined');

    // Restore original config
    Object.assign(config, storedConfig);
  });

  it('allows invited user from different institution to enroll even when restrictToInstitution is true', async () => {
    // Clean up any existing enrollments
    await cleanupEnrollments();
    
    // Create institutions
    await createInstitution('1', 'example.com', 'Example University');
    await createInstitution('2', 'other.com', 'Other University');

    // Set up course instance with institution restriction enabled
    await createCourseInstanceWithSettings('1', true, true);

    // Create user from different institution
    const differentInstitutionUser = await getOrCreateUser({
      uid: 'invited@other.com',
      name: 'Invited Different Institution Student',
      uin: 'invited1',
      email: 'invited@other.com',
    });

    // Update user's institution to be different from course institution
    await execute('UPDATE users SET institution_id = $institution_id WHERE user_id = $user_id', {
      institution_id: '2',
      user_id: differentInstitutionUser.user_id,
    });

    // Create an invited enrollment for the user
    await queryRow(
      `INSERT INTO enrollments (user_id, course_instance_id, status, pending_uid)
       VALUES (NULL, $course_instance_id, 'invited', $pending_uid)
       RETURNING *`,
      {
        course_instance_id: '1',
        pending_uid: differentInstitutionUser.uid,
      },
      EnrollmentSchema,
    );

    // Store original config
    storedConfig = {
      authUid: config.authUid,
      authName: config.authName,
      authUin: config.authUin,
    };

    // Set auth config to the test user
    config.authUid = differentInstitutionUser.uid;
    config.authName = differentInstitutionUser.name;
    config.authUin = differentInstitutionUser.uin;

    // Check that user has an invited enrollment initially
    const initialEnrollment = await queryOptionalRow(
      'SELECT * FROM enrollments WHERE pending_uid = $pending_uid AND course_instance_id = $course_instance_id',
      { pending_uid: differentInstitutionUser.uid, course_instance_id: '1' },
      EnrollmentSchema,
    );
    assert.isNotNull(initialEnrollment);
    assert.equal(initialEnrollment.status, 'invited');

    // Hit the assessments endpoint - this should convert invited enrollment to joined
    const response = await fetch(assessmentsUrl);
    assert.equal(response.status, 200);

    // Check that user is now enrolled (invited enrollment should be converted to joined)
    const finalEnrollment = await queryOptionalRow(
      'SELECT * FROM enrollments WHERE user_id = $user_id AND course_instance_id = $course_instance_id',
      { user_id: differentInstitutionUser.user_id, course_instance_id: '1' },
      EnrollmentSchema,
    );
    assert.isNotNull(finalEnrollment);
    assert.equal(finalEnrollment.status, 'joined');
    assert.isNull(finalEnrollment.pending_uid);

    // Check that the invited enrollment is gone
    const invitedEnrollment = await queryOptionalRow(
      'SELECT * FROM enrollments WHERE pending_uid = $pending_uid AND course_instance_id = $course_instance_id',
      { pending_uid: differentInstitutionUser.uid, course_instance_id: '1' },
      EnrollmentSchema,
    );
    assert.isNull(invitedEnrollment);

    // Restore original config
    Object.assign(config, storedConfig);
  });
});
