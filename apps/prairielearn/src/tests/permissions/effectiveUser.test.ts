import { assert } from 'chai';
import fs from 'fs-extra';
import { step } from 'mocha-steps';
import * as tmp from 'tmp-promise';
import { z } from 'zod';

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

const sql = sqldb.loadSqlEquiv(import.meta.url);

const UserWithIdSchema = z.object({
  user_id: z.string(),
});

describe('effective user', function () {
  this.timeout(60000);

  const context: Record<string, any> = {};
  context.siteUrl = `http://localhost:${config.serverPort}`;
  context.baseUrl = `${context.siteUrl}/pl`;
  context.pageUrlTestCourse = `${context.baseUrl}/course/1`;
  context.pageUrlExampleCourse = `${context.baseUrl}/course/2`;
  context.pageUrlTestCourseInstance = `${context.baseUrl}/course_instance/1/instructor`;
  context.pageUrlExampleCourseInstance = `${context.baseUrl}/course_instance/2/instructor`;
  context.pageUrlStudent = `${context.baseUrl}/course_instance/1`;

  before('set up testing server', async function () {
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

    await helperServer.before([TEST_COURSE_PATH, secondCourseDir.path]).call(this);
  });

  let institutionAdminId: string;
  let instructorId: string;
  let staffId: string;
  let studentId: string;

  before('insert users', async function () {
    const institutionAdmin = await sqldb.callValidatedOneRow(
      'users_select_or_insert',
      [
        'institution-admin@example.com',
        'Institution Admin',
        null,
        'institution-admin@example.com',
        'dev',
      ],
      UserWithIdSchema,
    );
    institutionAdminId = institutionAdmin.user_id;
    await ensureInstitutionAdministrator({
      institution_id: '1',
      user_id: institutionAdminId,
      authn_user_id: '1',
    });

    const instructor = await sqldb.callValidatedOneRow(
      'users_select_or_insert',
      ['instructor@example.com', 'Instructor User', '100000000', 'instructor@example.com', 'dev'],
      UserWithIdSchema,
    );
    instructorId = instructor.user_id;
    await insertCoursePermissionsByUserUid({
      course_id: '1',
      uid: 'instructor@example.com',
      course_role: 'Owner',
      authn_user_id: '1',
    });

    const staff = await sqldb.callValidatedOneRow(
      'users_select_or_insert',
      ['staff@example.com', 'Staff Three', null, 'staff@example.com', 'dev'],
      UserWithIdSchema,
    );
    staffId = staff.user_id;
    await insertCoursePermissionsByUserUid({
      course_id: '1',
      uid: 'staff@example.com',
      course_role: 'Editor',
      authn_user_id: '2',
    });

    const student = await sqldb.callValidatedOneRow(
      'users_select_or_insert',
      ['student@example.com', 'Student User', '000000001', 'student@example.com', 'dev'],
      UserWithIdSchema,
    );
    studentId = student.user_id;
    await ensureEnrollment({
      user_id: studentId,
      course_instance_id: '1',
    });
  });

  after('shut down testing server', helperServer.after);

  step('student can access course instance', async () => {
    const headers = { cookie: 'pl_test_user=test_student' };
    const res = await helperClient.fetchCheerio(context.pageUrlStudent, { headers });
    assert.equal(res.status, 200);
  });

  step('student cannot override date (ignore when on student page)', async () => {
    const headers = {
      cookie: 'pl_test_user=test_student; pl2_requested_date=1700-01-19T00:00:01',
    };
    const res = await helperClient.fetchCheerio(context.pageUrlStudent, { headers });
    assert.equal(res.status, 200);
  });

  step('student cannot override date (error when on instructor page)', async () => {
    const headers = {
      cookie: 'pl_test_user=test_student; pl2_requested_date=1700-01-19T00:00:01',
    };
    const res = await helperClient.fetchCheerio(context.pageUrlTestCourseInstance, { headers });
    assert.equal(res.status, 403);
  });

  step('student cannot override date (error when on instructor page) - course route', async () => {
    const headers = {
      cookie: 'pl_test_user=test_student; pl2_requested_date=1700-01-19T00:00:01',
    };
    const res = await helperClient.fetchCheerio(context.pageUrlTestCourse, { headers });
    assert.equal(res.status, 403);
  });

  step('instructor can override date and does not become enrolled', async () => {
    let result = await sqldb.queryAsync(sql.select_enrollment, {
      user_id: instructorId,
      course_instance_id: 1,
    });
    assert.lengthOf(result.rows, 0);
    const headers = {
      cookie: 'pl_test_user=test_instructor; pl2_requested_date=1700-01-19T00:00:01',
    };
    const res = await helperClient.fetchCheerio(context.pageUrlStudent, { headers });
    assert.equal(res.status, 200);
    result = await sqldb.queryAsync(sql.select_enrollment, {
      user_id: instructorId,
      course_instance_id: 1,
    });
    assert.lengthOf(result.rows, 0);
  });

  step('instructor can access course instance', async () => {
    const headers = { cookie: 'pl_test_user=test_instructor' };
    const res = await helperClient.fetchCheerio(context.pageUrlStudent, { headers });
    assert.equal(res.status, 200);
  });

  step('instructor (no course instance role) cannot emulate student', async () => {
    const headers = {
      cookie: 'pl_test_user=test_instructor; pl2_requested_uid=student@example.com',
    };
    const res = await helperClient.fetchCheerio(context.pageUrlStudent, { headers });
    assert.equal(res.status, 403);
  });

  step('instructor (student data viewer) cannot emulate student', async () => {
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

  step('instructor (student data editor) can emulate student', async () => {
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

  step('instructor can emulate student and override date in range (expect success)', async () => {
    const headers = {
      cookie:
        'pl_test_user=test_instructor; pl2_requested_date=1900-01-19T00:00:01; pl2_requested_uid=student@example.com',
    };
    const res = await helperClient.fetchCheerio(context.pageUrlStudent, { headers });
    assert.equal(res.status, 200);
  });

  step(
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

  step(
    'instructor can emulate student and be denied access to instructor page (course instance route)',
    async () => {
      const headers = {
        cookie: 'pl_test_user=test_instructor; pl2_requested_uid=student@example.com',
      };
      const res = await helperClient.fetchCheerio(context.pageUrlTestCourseInstance, { headers });
      assert.equal(res.status, 403);
    },
  );

  step(
    'instructor can emulate student and be denied access to instructor page (course route)',
    async () => {
      const headers = {
        cookie: 'pl_test_user=test_instructor; pl2_requested_uid=student@example.com',
      };
      const res = await helperClient.fetchCheerio(context.pageUrlTestCourse, { headers });
      assert.equal(res.status, 403);
    },
  );

  step('cannot request invalid date', async () => {
    const headers = {
      cookie: 'pl_test_user=test_instructor; pl2_requested_date=garbage',
    };
    const res = await helperClient.fetchCheerio(context.pageUrlStudent, { headers });
    assert.equal(res.status, 403);
  });

  step('cannot request invalid uid', async () => {
    const headers = {
      cookie: 'pl_test_user=test_instructor; pl2_requested_uid=garbage',
    };
    const res = await helperClient.fetchCheerio(context.pageUrlStudent, { headers });
    assert.equal(res.status, 403);
  });

  step('cannot request uid of administrator when not administrator', async () => {
    const headers = {
      cookie: 'pl_test_user=test_instructor; pl2_requested_uid=dev@example.com',
    };
    const res = await helperClient.fetchCheerio(context.pageUrlStudent, { headers });
    assert.equal(res.status, 403);
  });

  step('can request uid of administrator when administrator', async () => {
    await sqldb.queryAsync(sql.insert_administrator, { user_id: instructorId });
    const headers = {
      cookie: 'pl_test_user=test_instructor; pl2_requested_uid=dev@example.com',
    };
    const res = await helperClient.fetchCheerio(context.pageUrlStudent, { headers });
    assert.equal(res.status, 200);
  });

  step('cannot request uid of administrator when administrator access is inactive', async () => {
    const headers = {
      cookie:
        'pl_test_user=test_instructor; pl2_access_as_administrator=inactive; pl2_requested_uid=dev@example.com',
    };
    const res = await helperClient.fetchCheerio(context.pageUrlStudent, { headers });
    assert.equal(res.status, 403);
  });

  step('can request uid of course editor as course owner', async () => {
    const headers = {
      cookie:
        'pl_test_user=test_instructor; pl2_access_as_administrator=inactive; pl2_requested_uid=staff@example.com',
    };
    const res = await helperClient.fetchCheerio(context.pageUrlTestCourseInstance, { headers });
    assert.equal(res.status, 200);
  });

  step('cannot request uid of course editor as course viewer', async () => {
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

  step('can request uid of student data viewer as student data editor', async () => {
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

  step('cannot request uid of student data editor as student data viewer', async () => {
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

  step('instructor can request lower course role', async () => {
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

  step('instructor cannot request higher course role', async () => {
    const headers = {
      cookie:
        'pl_test_user=test_instructor; pl2_access_as_administrator=inactive; pl2_requested_course_role=Editor',
    };
    const res = await helperClient.fetchCheerio(context.pageUrlTestCourseInstance, { headers });
    assert.equal(res.status, 403);
  });

  step('instructor can request lower course instance role', async () => {
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

  step('instructor cannot request higher course instance role', async () => {
    updateCourseInstancePermissionsRole({
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

  step('instructor can request no role and be granted access to student page', async () => {
    const headers = {
      cookie:
        'pl_test_user=test_instructor; pl2_access_as_administrator=inactive; pl2_requested_course_role=None; pl2_requested_course_instance_role=None',
    };
    const res = await helperClient.fetchCheerio(context.pageUrlStudent, { headers });
    assert.equal(res.status, 200);
  });

  step(
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

  step(
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

  step(
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

  step(
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

  step('reset instructor course role to maximum permissions', async () => {
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

  step(
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

  step(
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

  step(
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

  step(
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
});
