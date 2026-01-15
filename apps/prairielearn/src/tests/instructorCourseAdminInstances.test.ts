import * as path from 'path';

import fs from 'fs-extra';
import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import { config } from '../lib/config.js';
import { features } from '../lib/features/index.js';
import {
  deleteCoursePermissions,
  selectCourseInstancePermissionForUser,
  selectCoursePermissionForUser,
} from '../models/course-permissions.js';

import { fetchCheerio } from './helperClient.js';
import { type CourseRepoSetup, createCourseRepo, updateCourseRepository } from './helperCourse.js';
import * as helperServer from './helperServer.js';

const siteUrl = `http://localhost:${config.serverPort}`;
const courseTemplateDir = path.join(import.meta.dirname, 'testFileEditor', 'courseTemplate');

let courseRepo: CourseRepoSetup;

const getCourseInstanceFileContents = async (shortName: string) => {
  const courseInstanceInfoPath = path.join(
    courseRepo.courseLiveDir,
    'courseInstances',
    shortName,
    'infoCourseInstance.json',
  );
  return await fs.readFile(courseInstanceInfoPath, 'utf8');
};

describe('Creating a course instance', () => {
  beforeAll(async () => {
    courseRepo = await createCourseRepo(courseTemplateDir);
    await helperServer.before(courseRepo.courseLiveDir)();
    await updateCourseRepository({ courseId: '1', repository: courseRepo.courseOriginDir });
  });

  afterAll(helperServer.after);

  test.sequential('create a new course instance', async () => {
    // Fetch the course instance page for the course
    const courseInstancePageResponse = await fetchCheerio(
      `${siteUrl}/pl/course/1/course_admin/instances`,
    );

    assert.equal(courseInstancePageResponse.status, 200);

    await features.runWithGlobalOverrides({ 'enrollment-management': true }, async () => {
      const courseInstanceCreationResponse = await fetch(
        `${siteUrl}/pl/course/1/course_admin/instances`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            __action: 'add_course_instance',
            __csrf_token: courseInstancePageResponse.$('#test_csrf_token').text(),
            short_name: 'Fa19',
            long_name: 'Fall 2019',
            start_date: '2021-01-01T00:00:00',
            end_date: '2021-01-02T00:00:00',
            self_enrollment_enabled: true,
            self_enrollment_use_enrollment_code: true,
            course_instance_permission: 'Student Data Editor',
          }),
        },
      );

      assert.equal(courseInstanceCreationResponse.status, 200);

      // Verify that the response contains the new course instance ID
      const responseBody = await courseInstanceCreationResponse.json();
      assert.equal(responseBody.course_instance_id, '2');
    });
  });

  test.sequential('verify course instance has the correct info', async () => {
    const courseInstanceInfo = JSON.parse(await getCourseInstanceFileContents('Fa19'));

    assert.equal(courseInstanceInfo.longName, 'Fall 2019');
    assert.equal(courseInstanceInfo.publishing.startDate, '2021-01-01T00:00:00');
    assert.equal(courseInstanceInfo.publishing.endDate, '2021-01-02T00:00:00');
    // self_enrollment_enabled: true matches the default
    assert.isUndefined(courseInstanceInfo.selfEnrollment.enabled);
    // self_enrollment_use_enrollment_code: true does NOT match the default
    assert.equal(courseInstanceInfo.selfEnrollment.useEnrollmentCode, true);
  });
  test.sequential('add the same course instance again', async () => {
    const courseInstancePageResponse = await fetchCheerio(
      `${siteUrl}/pl/course/1/course_admin/instances`,
    );

    assert.equal(courseInstancePageResponse.status, 200);

    const courseInstanceCreationResponse = await fetch(
      `${siteUrl}/pl/course/1/course_admin/instances`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          __action: 'add_course_instance',
          __csrf_token: courseInstancePageResponse.$('#test_csrf_token').text(),
          short_name: 'Fa19',
          long_name: 'Fall 2019',
          start_date: '2021-01-01T00:00:00',
          end_date: '2021-01-02T00:00:00',
          course_instance_permission: 'None',
        }),
      },
    );

    assert.equal(courseInstanceCreationResponse.status, 400);
    const responseBody = await courseInstanceCreationResponse.json();
    assert.isDefined(responseBody.error);
  });

  test.sequential('add course instance without start_access_date and end_access_date', async () => {
    const courseInstancePageResponse = await fetchCheerio(
      `${siteUrl}/pl/course/1/course_admin/instances`,
    );

    assert.equal(courseInstancePageResponse.status, 200);

    // Create the new course instance without a start_access_date and end_access_date
    const courseInstanceCreationResponse = await fetch(
      `${siteUrl}/pl/course/1/course_admin/instances`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          __action: 'add_course_instance',
          __csrf_token: courseInstancePageResponse.$('#test_csrf_token').text(),
          short_name: 'Fa20',
          long_name: 'Fall 2020',
          start_date: '',
          end_date: '',
          course_instance_permission: 'Student Data Editor',
        }),
      },
    );

    const responseBody = await courseInstanceCreationResponse.json();

    assert.equal(courseInstanceCreationResponse.status, 200);

    assert.equal(responseBody.course_instance_id, '3');
  });

  test.sequential('verify course instance is created without publishing config', async () => {
    const courseInstanceInfoPath = path.join(
      courseRepo.courseLiveDir,
      'courseInstances',
      'Fa20',
      'infoCourseInstance.json',
    );

    const courseInstanceInfo = JSON.parse(await fs.readFile(courseInstanceInfoPath, 'utf8'));

    assert.equal(courseInstanceInfo.longName, 'Fall 2020');

    assert.isUndefined(courseInstanceInfo.publishing);
  });

  test.sequential('add course instance with self-enrollment disabled', async () => {
    const courseInstancePageResponse = await fetchCheerio(
      `${siteUrl}/pl/course/1/course_admin/instances`,
    );

    assert.equal(courseInstancePageResponse.status, 200);

    await features.runWithGlobalOverrides({ 'enrollment-management': true }, async () => {
      const courseInstanceCreationResponse = await fetch(
        `${siteUrl}/pl/course/1/course_admin/instances`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            __action: 'add_course_instance',
            __csrf_token: courseInstancePageResponse.$('#test_csrf_token').text(),
            short_name: 'Sp21_disabled',
            long_name: 'Spring 2021 (Self-Enrollment Disabled)',
            start_date: '',
            end_date: '',
            self_enrollment_enabled: false,
            self_enrollment_use_enrollment_code: false,
            course_instance_permission: 'Student Data Editor',
          }),
        },
      );

      assert.equal(courseInstanceCreationResponse.status, 200);

      const responseBody = await courseInstanceCreationResponse.json();
      assert.isDefined(responseBody.course_instance_id);
    });
  });

  test.sequential('verify self-enrollment disabled is persisted correctly', async () => {
    const courseInstanceInfo = JSON.parse(await getCourseInstanceFileContents('Sp21_disabled'));

    assert.equal(courseInstanceInfo.longName, 'Spring 2021 (Self-Enrollment Disabled)');
    // self_enrollment_enabled: false does NOT match the default
    assert.equal(courseInstanceInfo.selfEnrollment.enabled, false);
    // self_enrollment_use_enrollment_code: false matches the default
    assert.isUndefined(courseInstanceInfo.selfEnrollment.useEnrollmentCode);
  });

  test.sequential('should not be able to create course instance with no short_name', async () => {
    const courseInstancePageResponse = await fetchCheerio(
      `${siteUrl}/pl/course/1/course_admin/instances`,
    );

    assert.equal(courseInstancePageResponse.status, 200);

    const courseInstanceCreationResponse = await fetch(
      `${siteUrl}/pl/course/1/course_admin/instances`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          __action: 'add_course_instance',
          __csrf_token: courseInstancePageResponse.$('#test_csrf_token').text(),
          // No short_name specified
          short_name: '',
          long_name: 'Fall 2019',
          start_date: '2021-01-01T00:00:00',
          end_date: '2021-01-02T00:00:00',
          course_instance_permission: 'None',
        }),
      },
    );

    assert.equal(courseInstanceCreationResponse.status, 400);
    const responseBody = await courseInstanceCreationResponse.json();
    assert.isDefined(responseBody.error);
  });

  test.sequential('should not be able to create course instance with no long_name', async () => {
    const courseInstancePageResponse = await fetchCheerio(
      `${siteUrl}/pl/course/1/course_admin/instances`,
    );

    assert.equal(courseInstancePageResponse.status, 200);

    const courseInstanceCreationResponse = await fetch(
      `${siteUrl}/pl/course/1/course_admin/instances`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          __action: 'add_course_instance',
          __csrf_token: courseInstancePageResponse.$('#test_csrf_token').text(),
          short_name: 'Sp21',
          // No long_name specified
          long_name: '',
          start_date: '2021-01-01T00:00:00',
          end_date: '2021-01-02T00:00:00',
          course_instance_permission: 'None',
        }),
      },
    );

    assert.equal(courseInstanceCreationResponse.status, 400);
    const responseBody = await courseInstanceCreationResponse.json();
    assert.isDefined(responseBody.error);
  });

  test.sequential(
    'should not be able to create course instance with short_name that falls outside correct root directory',
    async () => {
      const courseInstancePageResponse = await fetchCheerio(
        `${siteUrl}/pl/course/1/course_admin/instances`,
      );

      assert.equal(courseInstancePageResponse.status, 200);

      // Create the new course instance with a short_name that falls outside the correct root directory
      const courseInstanceCreationResponse = await fetch(
        `${siteUrl}/pl/course/1/course_admin/instances`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            __action: 'add_course_instance',
            __csrf_token: courseInstancePageResponse.$('#test_csrf_token').text(),
            short_name: '../Fa26', // Try to do a path traversal attack
            long_name: 'Fall 2026',
            start_date: '',
            end_date: '',
            course_instance_permission: 'None',
          }),
        },
      );

      const responseBody = await courseInstanceCreationResponse.json();
      assert.equal(courseInstanceCreationResponse.status, 400);
      assert.isDefined(responseBody.error);
    },
  );

  test.sequential(
    'create course instance with permission parameter succeeds for admin user',
    async () => {
      // The dev user is an administrator without a course_permissions record.
      // Creating a course instance with a permission will create both the
      // course_permissions record (with 'None' role) and the course_instance_permissions.
      const courseInstancePageResponse = await fetchCheerio(
        `${siteUrl}/pl/course/1/course_admin/instances`,
      );

      assert.equal(courseInstancePageResponse.status, 200);

      const courseInstanceCreationResponse = await fetch(
        `${siteUrl}/pl/course/1/course_admin/instances`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            __action: 'add_course_instance',
            __csrf_token: courseInstancePageResponse.$('#test_csrf_token').text(),
            short_name: 'Fa25_perms',
            long_name: 'Fall 2025 (Permissions Test)',
            start_date: '',
            end_date: '',
            course_instance_permission: 'Student Data Editor',
          }),
        },
      );

      assert.equal(courseInstanceCreationResponse.status, 200);

      const responseBody = await courseInstanceCreationResponse.json();
      const newCourseInstanceId = responseBody.course_instance_id;
      assert.isDefined(newCourseInstanceId);

      // Verify that the course_permission was created with role 'None'
      const coursePermission = await selectCoursePermissionForUser({
        course_id: '1',
        user_id: '1',
      });
      assert.isNotNull(coursePermission);
      assert.equal(coursePermission, 'None');

      // Verify that the course_instance_permission was created with the specified role
      const courseInstancePermission = await selectCourseInstancePermissionForUser({
        course_instance_id: newCourseInstanceId,
        user_id: '1',
      });
      assert.isNotNull(courseInstancePermission);
      assert.equal(courseInstancePermission, 'Student Data Editor');
    },
  );

  test.sequential(
    'create course instance with None permission does not create permission record',
    async () => {
      await deleteCoursePermissions({
        course_id: '1',
        user_id: '1',
        authn_user_id: '1',
      });

      const courseInstancePageResponse = await fetchCheerio(
        `${siteUrl}/pl/course/1/course_admin/instances`,
      );

      assert.equal(courseInstancePageResponse.status, 200);

      const courseInstanceCreationResponse = await fetch(
        `${siteUrl}/pl/course/1/course_admin/instances`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            __action: 'add_course_instance',
            __csrf_token: courseInstancePageResponse.$('#test_csrf_token').text(),
            short_name: 'Fa25_no_perms',
            long_name: 'Fall 2025 (No Permissions)',
            start_date: '',
            end_date: '',
            course_instance_permission: 'None',
          }),
        },
      );

      assert.equal(courseInstanceCreationResponse.status, 200);

      const responseBody = await courseInstanceCreationResponse.json();
      const newCourseInstanceId = responseBody.course_instance_id;
      assert.isDefined(newCourseInstanceId);

      // Verify that no course_instance_permissions record was created
      const courseInstancePermission = await selectCourseInstancePermissionForUser({
        course_instance_id: newCourseInstanceId,
        user_id: '1',
      });
      assert.isNull(courseInstancePermission);

      // Verify that no course_permissions record was created
      const coursePermission = await selectCoursePermissionForUser({
        course_id: '1',
        user_id: '1',
      });
      assert.isNull(coursePermission);
    },
  );

  test.sequential(
    'should not be able to add another course instance that causes an edit error',
    async () => {
      const courseInstancePageResponse = await fetchCheerio(
        `${siteUrl}/pl/course/1/course_admin/instances`,
      );

      assert.equal(courseInstancePageResponse.status, 200);

      const courseInstanceCreationResponse = await fetch(
        `${siteUrl}/pl/course/1/course_admin/instances`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            __action: 'add_course_instance',
            __csrf_token: courseInstancePageResponse.$('#test_csrf_token').text(),
            short_name: 'Fa19_2',
            long_name: 'Fall 2019 (2)',
            start_date: '', // It is invalid to specify an end date without a start date
            end_date: '2021-01-02T00:00:00',
            course_instance_permission: 'None',
          }),
        },
      );
      const responseBody = await courseInstanceCreationResponse.json();

      assert.equal(courseInstanceCreationResponse.status, 400);

      // This implies an edit error was thrown, and the client will redirect to it.
      assert.isDefined(responseBody.job_sequence_id);

      // Any tests after this one are going to also fail with a edit error.
    },
  );
});
