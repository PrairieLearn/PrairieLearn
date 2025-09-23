import * as cheerio from 'cheerio';
import fs from 'fs-extra';
import fetch from 'node-fetch';
import * as tmp from 'tmp-promise';
import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import * as sqldb from '@prairielearn/postgres';

import { ensureInstitutionAdministrator } from '../../ee/models/institution-administrator.js';
import { config } from '../../lib/config.js';
import { TEST_COURSE_PATH } from '../../lib/paths.js';
import {
  insertCourseInstancePermissions,
  insertCoursePermissionsByUserUid,
  updateCourseInstancePermissionsRole,
  updateCoursePermissionsRole,
} from '../../models/course-permissions.js';
import { ensureEnrollment } from '../../models/enrollment.js';
import * as helperClient from '../helperClient.js';
import * as helperServer from '../helperServer.js';
import { getOrCreateUser } from '../utils/auth.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

describe('effective user', { timeout: 60_000 }, function () {
  const context: Record<string, any> = {};
  context.siteUrl = `http://localhost:${config.serverPort}`;
  context.baseUrl = `${context.siteUrl}/pl`;
  context.pageUrlTestCourse = `${context.baseUrl}/course/1`;
  context.pageUrlExampleCourse = `${context.baseUrl}/course/2`;
  context.pageUrlTestCourseInstance = `${context.baseUrl}/course_instance/1/instructor`;
  context.pageUrlExampleCourseInstance = `${context.baseUrl}/course_instance/2/instructor`;
  context.pageUrlStudent = `${context.baseUrl}/course_instance/1`;

  beforeAll(async function () {
    // We need two courses for this test so that we can validate behavior of
    // institution administrators, specifically what happens when an instructor
    // in one course tries to emulate an institution administrator and then
    // access another course.
    //
    // However, we want to avoid using the example course, which has all sorts of
    // weird special-cased permissions that make it harder to assert the expected
    // behavior. So, we make a copy of the test course for our second course.
    const secondCourseDir = await tmp.dir({ unsafeCleanup: true });
    await fs.copy(TEST_COURSE_PATH, secondCourseDir.path);

    await helperServer.before([TEST_COURSE_PATH, secondCourseDir.path])();
  });

  let institutionAdminId: string;
  let instructorId: string;
  let staffId: string;
  let studentId: string;

  beforeAll(async function () {
    const institutionAdmin = await getOrCreateUser({
      uid: 'institution-admin@example.com',
      name: 'Institution Admin',
      uin: null,
      email: 'institution-admin@example.com',
    });
    institutionAdminId = institutionAdmin.user_id;
    await ensureInstitutionAdministrator({
      institution_id: '1',
      user_id: institutionAdminId,
      authn_user_id: '1',
    });

    const instructor = await getOrCreateUser({
      uid: 'instructor@example.com',
      name: 'Instructor User',
      uin: '100000000',
      email: 'instructor@example.com',
    });
    instructorId = instructor.user_id;
    await insertCoursePermissionsByUserUid({
      course_id: '1',
      uid: 'instructor@example.com',
      course_role: 'Owner',
      authn_user_id: '1',
    });

    const staff = await getOrCreateUser({
      uid: 'staff@example.com',
      name: 'Staff Three',
      uin: null,
      email: 'staff@example.com',
    });
    staffId = staff.user_id;
    await insertCoursePermissionsByUserUid({
      course_id: '1',
      uid: 'staff@example.com',
      course_role: 'Editor',
      authn_user_id: '2',
    });

    const student = await getOrCreateUser({
      uid: 'student@example.com',
      name: 'Student User',
      uin: '000000001',
      email: 'student@example.com',
    });
    studentId = student.user_id;
    await ensureEnrollment({
      user_id: studentId,
      course_instance_id: '1',
    });
  });

  afterAll(helperServer.after);

  test.sequential('student can access course instance', async () => {
    const headers = { cookie: 'pl_test_user=test_student' };
    const res = await helperClient.fetchCheerio(context.pageUrlStudent, { headers });
    assert.equal(res.status, 200);
  });

  test.sequential('student cannot override date (ignore when on student page)', async () => {
    const headers = {
      cookie: 'pl_test_user=test_student; pl2_requested_date=1700-01-19T00:00:01',
    };
    const res = await helperClient.fetchCheerio(context.pageUrlStudent, { headers });
    assert.equal(res.status, 200);
  });

  test.sequential('student cannot override date (error when on instructor page)', async () => {
    const headers = {
      cookie: 'pl_test_user=test_student; pl2_requested_date=1700-01-19T00:00:01',
    };
    const res = await helperClient.fetchCheerio(context.pageUrlTestCourseInstance, { headers });
    assert.equal(res.status, 403);
  });

  test.sequential(
    'student cannot override date (error when on instructor page) - course route',
    async () => {
      const headers = {
        cookie: 'pl_test_user=test_student; pl2_requested_date=1700-01-19T00:00:01',
      };
      const res = await helperClient.fetchCheerio(context.pageUrlTestCourse, { headers });
      assert.equal(res.status, 403);
    },
  );

  test.sequential('instructor can override date and does not become enrolled', async () => {
    let rowCount = await sqldb.execute(sql.select_enrollment, {
      user_id: instructorId,
      course_instance_id: 1,
    });
    assert.equal(rowCount, 0);
    const headers = {
      cookie: 'pl_test_user=test_instructor; pl2_requested_date=1700-01-19T00:00:01',
    };
    const res = await helperClient.fetchCheerio(context.pageUrlStudent, { headers });
    assert.equal(res.status, 200);
    rowCount = await sqldb.execute(sql.select_enrollment, {
      user_id: instructorId,
      course_instance_id: 1,
    });
    assert.equal(rowCount, 0);
  });

  test.sequential('instructor can access course instance', async () => {
    const headers = { cookie: 'pl_test_user=test_instructor' };
    const res = await helperClient.fetchCheerio(context.pageUrlStudent, { headers });
    assert.equal(res.status, 200);
  });

  test.sequential('instructor (no course instance role) cannot emulate student', async () => {
    const headers = {
      cookie: 'pl_test_user=test_instructor; pl2_requested_uid=student@example.com',
    };
    const res = await helperClient.fetchCheerio(context.pageUrlStudent, { headers });
    assert.equal(res.status, 403);
  });

  test.sequential('instructor (student data viewer) cannot emulate student', async () => {
    await insertCourseInstancePermissions({
      course_id: '1',
      user_id: instructorId,
      course_instance_id: '1',
      course_instance_role: 'Student Data Viewer',
      authn_user_id: '2',
    });
    const headers = {
      cookie: 'pl_test_user=test_instructor; pl2_requested_uid=student@example.com',
    };
    const res = await helperClient.fetchCheerio(context.pageUrlStudent, { headers });
    assert.equal(res.status, 403);
  });

  test.sequential('instructor (student data editor) can emulate student', async () => {
    await updateCourseInstancePermissionsRole({
      course_id: '1',
      user_id: instructorId,
      course_instance_id: '1',
      course_instance_role: 'Student Data Editor',
      authn_user_id: '2',
    });
    const headers = {
      cookie: 'pl_test_user=test_instructor; pl2_requested_uid=student@example.com',
    };
    const res = await helperClient.fetchCheerio(context.pageUrlStudent, { headers });
    assert.equal(res.status, 200);
  });

  test.sequential(
    'instructor can emulate student and override date in range (expect success)',
    async () => {
      const headers = {
        cookie:
          'pl_test_user=test_instructor; pl2_requested_date=1900-01-19T00:00:01; pl2_requested_uid=student@example.com',
      };
      const res = await helperClient.fetchCheerio(context.pageUrlStudent, { headers });
      assert.equal(res.status, 200);
    },
  );

  test.sequential(
    'instructor can emulate student and override date out of range (expect failure)',
    async () => {
      const headers = {
        cookie:
          'pl_test_user=test_instructor; pl2_requested_date=1700-01-19T00:00:01; pl2_requested_uid=student@example.com',
      };
      const res = await helperClient.fetchCheerio(context.pageUrlStudent, { headers });
      assert.equal(res.status, 403);
    },
  );

  test.sequential(
    'instructor can emulate student and be denied access to instructor page (course instance route)',
    async () => {
      const headers = {
        cookie: 'pl_test_user=test_instructor; pl2_requested_uid=student@example.com',
      };
      const res = await helperClient.fetchCheerio(context.pageUrlTestCourseInstance, { headers });
      assert.equal(res.status, 403);
    },
  );

  test.sequential(
    'instructor can emulate student and be denied access to instructor page (course route)',
    async () => {
      const headers = {
        cookie: 'pl_test_user=test_instructor; pl2_requested_uid=student@example.com',
      };
      const res = await helperClient.fetchCheerio(context.pageUrlTestCourse, { headers });
      assert.equal(res.status, 403);
    },
  );

  test.sequential('cannot request invalid date', async () => {
    const headers = {
      cookie: 'pl_test_user=test_instructor; pl2_requested_date=garbage',
    };
    const res = await helperClient.fetchCheerio(context.pageUrlStudent, { headers });
    assert.equal(res.status, 403);
  });

  test.sequential('cannot request invalid uid', async () => {
    const headers = {
      cookie: 'pl_test_user=test_instructor; pl2_requested_uid=garbage',
    };
    const res = await helperClient.fetchCheerio(context.pageUrlStudent, { headers });
    assert.equal(res.status, 403);
  });

  test.sequential('cannot request uid of administrator when not administrator', async () => {
    const headers = {
      cookie: 'pl_test_user=test_instructor; pl2_requested_uid=dev@example.com',
    };
    const res = await helperClient.fetchCheerio(context.pageUrlStudent, { headers });
    assert.equal(res.status, 403);
  });

  test.sequential('can request uid of administrator when administrator', async () => {
    await sqldb.execute(sql.insert_administrator, { user_id: instructorId });
    const headers = {
      cookie: 'pl_test_user=test_instructor; pl2_requested_uid=dev@example.com',
    };
    const res = await helperClient.fetchCheerio(context.pageUrlStudent, { headers });
    assert.equal(res.status, 200);
  });

  test.sequential(
    'cannot request uid of administrator when administrator access is inactive',
    async () => {
      const headers = {
        cookie:
          'pl_test_user=test_instructor; pl2_access_as_administrator=inactive; pl2_requested_uid=dev@example.com',
      };
      const res = await helperClient.fetchCheerio(context.pageUrlStudent, { headers });
      assert.equal(res.status, 403);
    },
  );

  test.sequential('can request uid of course editor as course owner', async () => {
    const headers = {
      cookie:
        'pl_test_user=test_instructor; pl2_access_as_administrator=inactive; pl2_requested_uid=staff@example.com',
    };
    const res = await helperClient.fetchCheerio(context.pageUrlTestCourseInstance, { headers });
    assert.equal(res.status, 200);
  });

  test.sequential('cannot request uid of course editor as course viewer', async () => {
    await updateCoursePermissionsRole({
      course_id: '1',
      user_id: instructorId,
      course_role: 'Viewer',
      authn_user_id: '1',
    });
    const headers = {
      cookie:
        'pl_test_user=test_instructor; pl2_access_as_administrator=inactive; pl2_requested_uid=staff@example.com',
    };
    const res = await helperClient.fetchCheerio(context.pageUrlTestCourseInstance, { headers });
    assert.equal(res.status, 403);
  });

  test.sequential('can request uid of student data viewer as student data editor', async () => {
    await updateCoursePermissionsRole({
      course_id: '1',
      user_id: instructorId,
      course_role: 'Owner',
      authn_user_id: '1',
    });
    await insertCourseInstancePermissions({
      course_id: '1',
      user_id: staffId,
      course_instance_id: '1',
      course_instance_role: 'Student Data Viewer',
      authn_user_id: '2',
    });
    const headers = {
      cookie:
        'pl_test_user=test_instructor; pl2_access_as_administrator=inactive; pl2_requested_uid=staff@example.com',
    };
    const res = await helperClient.fetchCheerio(context.pageUrlTestCourseInstance, { headers });
    assert.equal(res.status, 200);
  });

  test.sequential('cannot request uid of student data editor as student data viewer', async () => {
    await updateCourseInstancePermissionsRole({
      course_id: '1',
      user_id: instructorId,
      course_instance_id: '1',
      course_instance_role: 'Student Data Viewer',
      authn_user_id: '2',
    });
    await updateCourseInstancePermissionsRole({
      course_id: '1',
      user_id: staffId,
      course_instance_id: '1',
      course_instance_role: 'Student Data Editor',
      authn_user_id: '2',
    });
    const headers = {
      cookie:
        'pl_test_user=test_instructor; pl2_access_as_administrator=inactive; pl2_requested_uid=staff@example.com',
    };
    const res = await helperClient.fetchCheerio(context.pageUrlTestCourseInstance, { headers });
    assert.equal(res.status, 403);
  });

  test.sequential('instructor can request lower course role', async () => {
    await updateCoursePermissionsRole({
      course_id: '1',
      user_id: instructorId,
      course_role: 'Viewer',
      authn_user_id: '1',
    });
    const headers = {
      cookie:
        'pl_test_user=test_instructor; pl2_access_as_administrator=inactive; pl2_requested_course_role=Previewer',
    };
    const res = await helperClient.fetchCheerio(context.pageUrlTestCourseInstance, { headers });
    assert.equal(res.status, 200);
  });

  test.sequential('instructor cannot request higher course role', async () => {
    const headers = {
      cookie:
        'pl_test_user=test_instructor; pl2_access_as_administrator=inactive; pl2_requested_course_role=Editor',
    };
    const res = await helperClient.fetchCheerio(context.pageUrlTestCourseInstance, { headers });
    assert.equal(res.status, 403);
  });

  test.sequential('instructor can request lower course instance role', async () => {
    await updateCourseInstancePermissionsRole({
      course_id: '1',
      user_id: instructorId,
      course_instance_id: '1',
      course_instance_role: 'Student Data Editor',
      authn_user_id: '2',
    });
    const headers = {
      cookie:
        'pl_test_user=test_instructor; pl2_access_as_administrator=inactive; pl2_requested_course_instance_role=Student Data Viewer',
    };
    const res = await helperClient.fetchCheerio(context.pageUrlTestCourseInstance, { headers });
    assert.equal(res.status, 200);
  });

  test.sequential('instructor cannot request higher course instance role', async () => {
    await updateCourseInstancePermissionsRole({
      course_id: '1',
      user_id: instructorId,
      course_instance_id: '1',
      course_instance_role: 'Student Data Viewer',
      authn_user_id: '2',
    });
    const headers = {
      cookie:
        'pl_test_user=test_instructor; pl2_access_as_administrator=inactive; pl2_requested_course_instance_role=Student Data Editor',
    };
    const res = await helperClient.fetchCheerio(context.pageUrlTestCourseInstance, { headers });
    assert.equal(res.status, 403);
  });

  test.sequential(
    'instructor can request no role and be granted access to student page',
    async () => {
      const headers = {
        cookie:
          'pl_test_user=test_instructor; pl2_access_as_administrator=inactive; pl2_requested_course_role=None; pl2_requested_course_instance_role=None',
      };
      const res = await helperClient.fetchCheerio(context.pageUrlStudent, { headers });
      assert.equal(res.status, 200);
    },
  );

  test.sequential(
    'instructor can request no role and be denied access to instructor page (course instance route)',
    async () => {
      const headers = {
        cookie:
          'pl_test_user=test_instructor; pl2_access_as_administrator=inactive; pl2_requested_course_role=None; pl2_requested_course_instance_role=None',
      };
      const res = await helperClient.fetchCheerio(context.pageUrlTestCourseInstance, { headers });
      assert.equal(res.status, 403);
    },
  );

  test.sequential(
    'instructor can request no course role and be denied access to instructor page (course route)',
    async () => {
      const headers = {
        cookie:
          'pl_test_user=test_instructor; pl2_access_as_administrator=inactive; pl2_requested_course_role=None',
      };
      const res = await helperClient.fetchCheerio(context.pageUrlTestCourse, { headers });
      assert.equal(res.status, 403);
    },
  );

  test.sequential(
    'instructor can request no course role and be granted access to instructor page (course instance route)',
    async () => {
      const headers = {
        cookie:
          'pl_test_user=test_instructor; pl2_access_as_administrator=inactive; pl2_requested_course_role=None',
      };
      const res = await helperClient.fetchCheerio(context.pageUrlTestCourseInstance, { headers });
      assert.equal(res.status, 200);
    },
  );

  test.sequential(
    'less-privileged instructor cannot request access as institution administrator',
    async () => {
      const headers = {
        cookie:
          'pl_test_user=test_instructor; pl2_access_as_administrator=inactive; pl2_requested_uid=institution-admin@example.com',
      };
      const res = await helperClient.fetchCheerio(context.pageUrlTestCourse, { headers });
      assert.equal(res.status, 403);
    },
  );

  test.sequential('reset instructor course role to maximum permissions', async () => {
    await updateCoursePermissionsRole({
      course_id: '1',
      user_id: instructorId,
      course_role: 'Owner',
      authn_user_id: '1',
    });
    await updateCourseInstancePermissionsRole({
      course_id: '1',
      user_id: instructorId,
      course_instance_id: '1',
      course_instance_role: 'Student Data Editor',
      authn_user_id: '2',
    });
  });

  test.sequential(
    'instructor can access their own course when requesting access as institution administrator',
    async () => {
      const headers = {
        cookie:
          'pl_test_user=test_instructor; pl2_access_as_administrator=inactive; pl2_requested_uid=institution-admin@example.com',
      };
      const res = await helperClient.fetchCheerio(context.pageUrlTestCourse, { headers });
      assert.equal(res.status, 200);
    },
  );

  test.sequential(
    'instructor can access their own course instance when requesting access as institution administrator',
    async () => {
      const headers = {
        cookie:
          'pl_test_user=test_instructor; pl2_access_as_administrator=inactive; pl2_requested_uid=institution-admin@example.com',
      };
      const res = await helperClient.fetchCheerio(context.pageUrlTestCourseInstance, { headers });
      assert.equal(res.status, 200);
    },
  );

  test.sequential(
    'instructor cannot access other courses when requesting access as institution administrator',
    async () => {
      const headers = {
        cookie:
          'pl_test_user=test_instructor; pl2_access_as_administrator=inactive; pl2_requested_uid=institution-admin@example.com',
      };
      const res = await helperClient.fetchCheerio(context.pageUrlExampleCourse, { headers });
      assert.equal(res.status, 403);
    },
  );

  test.sequential(
    'instructor cannot access other course instances when requesting access as institution administrator',
    async () => {
      const headers = {
        cookie:
          'pl_test_user=test_instructor; pl2_access_as_administrator=inactive; pl2_requested_uid=institution-admin@example.com',
      };
      const res = await helperClient.fetchCheerio(context.pageUrlExampleCourseInstance, {
        headers,
      });
      assert.equal(res.status, 403);
    },
  );

  test.sequential(
    'instructor is denied access when emulating student, and no redirect is available',
    async () => {
      const headers = {
        cookie: 'pl2_requested_uid=student@example.com; pl2_requested_data_changed=true',
      };
      // Test that instructor is denied access to instructor pages when emulating student
      const instructorPageUrl = `${context.baseUrl}/course/1/course_admin/instance_admin`;
      const response = await fetch(instructorPageUrl, {
        headers,
        redirect: 'manual',
      });
      // This should result in a fancy 403 error page
      const body = await response.text();
      const $ = cheerio.load(body);
      const authzAccessMismatch = $('div[data-component="AuthzAccessMismatch"]');
      assert.equal(authzAccessMismatch.length, 1);
      assert.equal(response.status, 403);
    },
  );

  test.sequential(
    'instructor is allowed access when emulating student, and a redirect is available',
    async () => {
      const courseInstanceId = '1';
      const studentUid = 'student@example.com';
      const user = await getOrCreateUser({
        uid: studentUid,
        name: 'Example Student',
        uin: 'student',
        email: 'student@example.com',
      });
      await ensureEnrollment({ course_instance_id: courseInstanceId, user_id: user.user_id });

      const headers = {
        // We don't include the pl_test_user cookie since that will short-circuit the authzHelper middleware
        cookie: `pl2_requested_uid=${studentUid}; pl2_requested_data_changed=true`,
      };
      const instructorPageUrl = `/pl/course_instance/${courseInstanceId}/instructor/instance_admin/assessments`;
      const studentPageUrl = `/pl/course_instance/${courseInstanceId}`;
      const response = await fetch(context.siteUrl + instructorPageUrl, {
        headers,
        redirect: 'manual',
      });

      assert.equal(response.status, 302);
      assert.equal(response.headers.get('Location'), studentPageUrl);
    },
  );
});
