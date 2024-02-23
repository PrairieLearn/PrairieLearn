// @ts-check
import { assert } from 'chai';
import { step } from 'mocha-steps';
import * as sqldb from '@prairielearn/postgres';

import { config } from '../../lib/config';
import * as helperServer from '../helperServer';
import * as helperClient from '../helperClient';
import { ensureEnrollment } from '../../models/enrollment';
import {
  insertCourseInstancePermissions,
  insertCoursePermissionsByUserUid,
  updateCourseInstancePermissionsRole,
  updateCoursePermissionsRole,
} from '../../models/course-permissions';

const sql = sqldb.loadSqlEquiv(__filename);

describe('effective user', function () {
  this.timeout(60000);

  const context: Record<string, any> = {};
  context.siteUrl = `http://localhost:${config.serverPort}`;
  context.baseUrl = `${context.siteUrl}/pl`;
  context.pageUrlCourse = `${context.baseUrl}/course/1`;
  context.pageUrlCourseInstance = `${context.baseUrl}/course_instance/1/instructor`;
  context.pageUrlStudent = `${context.baseUrl}/course_instance/1`;
  context.userId = 2;

  before('set up testing server', helperServer.before().bind(this));

  before('insert users', async function () {
    await sqldb.callAsync('users_select_or_insert', [
      'instructor@illinois.edu',
      'Instructor User',
      '100000000',
      'dev',
    ]);
    await sqldb.callAsync('users_select_or_insert', [
      'staff03@illinois.edu',
      'Staff Three',
      null,
      'dev',
    ]);
    await sqldb.callAsync('users_select_or_insert', [
      'student@illinois.edu',
      'Student User',
      '000000001',
      'dev',
    ]);
    await insertCoursePermissionsByUserUid({
      course_id: '1',
      uid: 'instructor@illinois.edu',
      course_role: 'Owner',
      authn_user_id: '1',
    });
    await insertCoursePermissionsByUserUid({
      course_id: '1',
      uid: 'staff03@illinois.edu',
      course_role: 'Editor',
      authn_user_id: '2',
    });
    await ensureEnrollment({
      user_id: '4',
      course_instance_id: '1',
    });
  });

  after('shut down testing server', helperServer.after);

  step('student can access course instance', async () => {
    const headers = { cookie: 'pl_test_user=test_student' };
    const response = await helperClient.fetchCheerio(context.pageUrlStudent, {
      headers,
    });
    assert.isTrue(response.ok);
  });

  step('student cannot override date (ignore when on student page)', async () => {
    const headers = {
      cookie: 'pl_test_user=test_student; pl_requested_date=1700-01-19T00:00:01',
    };
    const response = await helperClient.fetchCheerio(context.pageUrlStudent, {
      headers,
    });
    assert.isTrue(response.ok);
  });

  step('student cannot override date (error when on instructor page)', async () => {
    const headers = {
      cookie: 'pl_test_user=test_student; pl_requested_date=1700-01-19T00:00:01',
    };
    const response = await helperClient.fetchCheerio(context.pageUrlCourseInstance, { headers });
    assert.equal(response.status, 403);
  });

  step('student cannot override date (error when on instructor page) - course route', async () => {
    const headers = {
      cookie: 'pl_test_user=test_student; pl_requested_date=1700-01-19T00:00:01',
    };
    const response = await helperClient.fetchCheerio(context.pageUrlCourse, {
      headers,
    });
    assert.equal(response.status, 403);
  });

  step('instructor can override date and does not become enrolled', async () => {
    let result = await sqldb.queryAsync(sql.select_enrollment, {
      user_id: 2,
      course_instance_id: 1,
    });
    assert.lengthOf(result.rows, 0);
    const headers = {
      cookie: 'pl_test_user=test_instructor; pl_requested_date=1700-01-19T00:00:01',
    };
    const response = await helperClient.fetchCheerio(context.pageUrlStudent, {
      headers,
    });
    assert.isTrue(response.ok);
    result = await sqldb.queryAsync(sql.select_enrollment, {
      user_id: 2,
      course_instance_id: 1,
    });
    assert.lengthOf(result.rows, 0);
  });

  step('instructor can access course instance', async () => {
    const headers = { cookie: 'pl_test_user=test_instructor' };
    const response = await helperClient.fetchCheerio(context.pageUrlStudent, {
      headers,
    });
    assert.isTrue(response.ok);
  });

  step('instructor (no course instance role) cannot emulate student', async () => {
    const headers = {
      cookie: 'pl_test_user=test_instructor; pl_requested_uid=student@illinois.edu',
    };
    const response = await helperClient.fetchCheerio(context.pageUrlStudent, {
      headers,
    });
    assert.equal(response.status, 403);
  });

  step('instructor (student data viewer) cannot emulate student', async () => {
    await insertCourseInstancePermissions({
      course_id: '1',
      user_id: '2',
      course_instance_id: '1',
      course_instance_role: 'Student Data Viewer',
      authn_user_id: '2',
    });
    const headers = {
      cookie: 'pl_test_user=test_instructor; pl_requested_uid=student@illinois.edu',
    };
    const response = await helperClient.fetchCheerio(context.pageUrlStudent, {
      headers,
    });
    assert.equal(response.status, 403);
  });

  step('instructor (student data editor) can emulate student', async () => {
    await updateCourseInstancePermissionsRole({
      course_id: '1',
      user_id: '2',
      course_instance_id: '1',
      course_instance_role: 'Student Data Editor',
      authn_user_id: '2',
    });
    const headers = {
      cookie: 'pl_test_user=test_instructor; pl_requested_uid=student@illinois.edu',
    };
    const response = await helperClient.fetchCheerio(context.pageUrlStudent, {
      headers,
    });
    assert.isTrue(response.ok);
  });

  step('instructor can emulate student and override date in range (expect success)', async () => {
    const headers = {
      cookie:
        'pl_test_user=test_instructor; pl_requested_date=1900-01-19T00:00:01; pl_requested_uid=student@illinois.edu',
    };
    const response = await helperClient.fetchCheerio(context.pageUrlStudent, {
      headers,
    });
    assert.isTrue(response.ok);
  });

  step(
    'instructor can emulate student and override date out of range (expect failure)',
    async () => {
      const headers = {
        cookie:
          'pl_test_user=test_instructor; pl_requested_date=1700-01-19T00:00:01; pl_requested_uid=student@illinois.edu',
      };
      const response = await helperClient.fetchCheerio(context.pageUrlStudent, {
        headers,
      });
      assert.equal(response.status, 403);
    },
  );

  step(
    'instructor can emulate student and be denied access to instructor page (course instance route)',
    async () => {
      const headers = {
        cookie: 'pl_test_user=test_instructor; pl_requested_uid=student@illinois.edu',
      };
      const response = await helperClient.fetchCheerio(context.pageUrlCourseInstance, { headers });
      assert.equal(response.status, 403);
    },
  );

  step(
    'instructor can emulate student and be denied access to instructor page (course route)',
    async () => {
      const headers = {
        cookie: 'pl_test_user=test_instructor; pl_requested_uid=student@illinois.edu',
      };
      const response = await helperClient.fetchCheerio(context.pageUrlCourse, {
        headers,
      });
      assert.equal(response.status, 403);
    },
  );

  step('cannot request invalid date', async () => {
    const headers = {
      cookie: 'pl_test_user=test_instructor; pl_requested_date=garbage',
    };
    const response = await helperClient.fetchCheerio(context.pageUrlStudent, {
      headers,
    });
    assert.equal(response.status, 403);
  });

  step('cannot request invalid uid', async () => {
    const headers = {
      cookie: 'pl_test_user=test_instructor; pl_requested_uid=garbage',
    };
    const response = await helperClient.fetchCheerio(context.pageUrlStudent, {
      headers,
    });
    assert.equal(response.status, 403);
  });

  step('cannot request uid of administrator when not administrator', async () => {
    const headers = {
      cookie: 'pl_test_user=test_instructor; pl_requested_uid=dev@illinois.edu',
    };
    const response = await helperClient.fetchCheerio(context.pageUrlStudent, {
      headers,
    });
    assert.equal(response.status, 403);
  });

  step('can request uid of administrator when administrator', async () => {
    await sqldb.queryAsync(sql.insert_administrator, { user_id: 2 });
    const headers = {
      cookie: 'pl_test_user=test_instructor; pl_requested_uid=dev@illinois.edu',
    };
    const response = await helperClient.fetchCheerio(context.pageUrlStudent, {
      headers,
    });
    assert.isTrue(response.ok);
  });

  step('cannot request uid of administrator when administrator access is inactive', async () => {
    const headers = {
      cookie:
        'pl_test_user=test_instructor; pl_access_as_administrator=inactive; pl_requested_uid=dev@illinois.edu',
    };
    const response = await helperClient.fetchCheerio(context.pageUrlStudent, {
      headers,
    });
    assert.equal(response.status, 403);
  });

  step('can request uid of course editor as course owner', async () => {
    const headers = {
      cookie:
        'pl_test_user=test_instructor; pl_access_as_administrator=inactive; pl_requested_uid=staff03@illinois.edu',
    };
    const response = await helperClient.fetchCheerio(context.pageUrlCourseInstance, { headers });
    assert.isTrue(response.ok);
  });

  step('cannot request uid of course editor as course viewer', async () => {
    await updateCoursePermissionsRole({
      course_id: '1',
      user_id: '2',
      course_role: 'Viewer',
      authn_user_id: '1',
    });
    const headers = {
      cookie:
        'pl_test_user=test_instructor; pl_access_as_administrator=inactive; pl_requested_uid=staff03@illinois.edu',
    };
    const response = await helperClient.fetchCheerio(context.pageUrlCourseInstance, { headers });
    assert.equal(response.status, 403);
  });

  step('can request uid of student data viewer as student data editor', async () => {
    await updateCoursePermissionsRole({
      course_id: '1',
      user_id: '2',
      course_role: 'Owner',
      authn_user_id: '1',
    });
    await insertCourseInstancePermissions({
      course_id: '1',
      user_id: '3',
      course_instance_id: '1',
      course_instance_role: 'Student Data Viewer',
      authn_user_id: '2',
    });
    const headers = {
      cookie:
        'pl_test_user=test_instructor; pl_access_as_administrator=inactive; pl_requested_uid=staff03@illinois.edu',
    };
    const response = await helperClient.fetchCheerio(context.pageUrlCourseInstance, { headers });
    assert.isTrue(response.ok);
  });

  step('cannot request uid of student data editor as student data viewer', async () => {
    await updateCourseInstancePermissionsRole({
      course_id: '1',
      user_id: '2',
      course_instance_id: '1',
      course_instance_role: 'Student Data Viewer',
      authn_user_id: '2',
    });
    await updateCourseInstancePermissionsRole({
      course_id: '1',
      user_id: '3',
      course_instance_id: '1',
      course_instance_role: 'Student Data Editor',
      authn_user_id: '2',
    });
    const headers = {
      cookie:
        'pl_test_user=test_instructor; pl_access_as_administrator=inactive; pl_requested_uid=staff03@illinois.edu',
    };
    const response = await helperClient.fetchCheerio(context.pageUrlCourseInstance, { headers });
    assert.equal(response.status, 403);
  });

  step('instructor can request lower course role', async () => {
    await updateCoursePermissionsRole({
      course_id: '1',
      user_id: '2',
      course_role: 'Viewer',
      authn_user_id: '1',
    });
    const headers = {
      cookie:
        'pl_test_user=test_instructor; pl_access_as_administrator=inactive; pl_requested_course_role=Previewer',
    };
    const response = await helperClient.fetchCheerio(context.pageUrlCourseInstance, { headers });
    assert.isTrue(response.ok);
  });

  step('instructor cannot request higher course role', async () => {
    const headers = {
      cookie:
        'pl_test_user=test_instructor; pl_access_as_administrator=inactive; pl_requested_course_role=Editor',
    };
    const response = await helperClient.fetchCheerio(context.pageUrlCourseInstance, { headers });
    assert.equal(response.status, 403);
  });

  step('instructor can request lower course instance role', async () => {
    await updateCourseInstancePermissionsRole({
      course_id: '1',
      course_instance_id: '1',
      user_id: '2',
      course_instance_role: 'Student Data Editor',
      authn_user_id: '2',
    });
    const headers = {
      cookie:
        'pl_test_user=test_instructor; pl_access_as_administrator=inactive; pl_requested_course_instance_role=Student Data Viewer',
    };
    const response = await helperClient.fetchCheerio(context.pageUrlCourseInstance, { headers });
    assert.isTrue(response.ok);
  });

  step('instructor cannot request higher course instance role', async () => {
    updateCourseInstancePermissionsRole({
      course_id: '1',
      course_instance_id: '1',
      user_id: '2',
      course_instance_role: 'Student Data Viewer',
      authn_user_id: '2',
    });
    const headers = {
      cookie:
        'pl_test_user=test_instructor; pl_access_as_administrator=inactive; pl_requested_course_instance_role=Student Data Editor',
    };
    const response = await helperClient.fetchCheerio(context.pageUrlCourseInstance, { headers });
    assert.equal(response.status, 403);
  });

  step('instructor can request no role and be granted access to student page', async () => {
    const headers = {
      cookie:
        'pl_test_user=test_instructor; pl_access_as_administrator=inactive; pl_requested_course_role=None; pl_requested_course_instance_role=None',
    };
    const response = await helperClient.fetchCheerio(context.pageUrlStudent, {
      headers,
    });
    assert.isTrue(response.ok);
  });

  step(
    'instructor can request no role and be denied access to instructor page (course instance route)',
    async () => {
      const headers = {
        cookie:
          'pl_test_user=test_instructor; pl_access_as_administrator=inactive; pl_requested_course_role=None; pl_requested_course_instance_role=None',
      };
      const response = await helperClient.fetchCheerio(context.pageUrlCourseInstance, { headers });
      assert.equal(response.status, 403);
    },
  );

  step(
    'instructor can request no course role and be denied access to instructor page (course route)',
    async () => {
      const headers = {
        cookie:
          'pl_test_user=test_instructor; pl_access_as_administrator=inactive; pl_requested_course_role=None',
      };
      const response = await helperClient.fetchCheerio(context.pageUrlCourse, {
        headers,
      });
      assert.equal(response.status, 403);
    },
  );

  step(
    'instructor can request no course role and be granted access to instructor page (course instance route)',
    async () => {
      const headers = {
        cookie:
          'pl_test_user=test_instructor; pl_access_as_administrator=inactive; pl_requested_course_role=None',
      };
      const response = await helperClient.fetchCheerio(context.pageUrlCourseInstance, { headers });
      assert.isTrue(response.ok);
    },
  );
});
