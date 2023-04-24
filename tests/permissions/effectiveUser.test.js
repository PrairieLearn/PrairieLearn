const util = require('util');
const assert = require('chai').assert;
const { step } = require('mocha-steps');
const { config } = require('../../lib/config');
const sqldb = require('@prairielearn/postgres');
const sql = sqldb.loadSqlEquiv(__filename);
const helperServer = require('../helperServer');
const helperClient = require('../helperClient');

describe('effective user', function () {
  this.timeout(60000);

  const context = {};
  context.siteUrl = `http://localhost:${config.serverPort}`;
  context.baseUrl = `${context.siteUrl}/pl`;
  context.pageUrlCourse = `${context.baseUrl}/course/1`;
  context.pageUrlCourseInstance = `${context.baseUrl}/course_instance/1/instructor`;
  context.pageUrlStudent = `${context.baseUrl}/course_instance/1`;
  context.userId = 2;

  before('set up testing server', async function () {
    await util.promisify(helperServer.before().bind(this))();
  });

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
    await sqldb.callOneRowAsync('course_permissions_insert_by_user_uid', [
      1,
      'instructor@illinois.edu',
      'Owner',
      1,
    ]);
    await sqldb.callOneRowAsync('course_permissions_insert_by_user_uid', [
      1,
      'staff03@illinois.edu',
      'Editor',
      2,
    ]);
    await sqldb.queryAsync(sql.insert_enrollment, {
      user_id: 4,
      course_instance_id: 1,
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

  step('instructor can override date (and becomes enrolled)', async () => {
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
    assert.lengthOf(result.rows, 1);
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
    await sqldb.callOneRowAsync('course_instance_permissions_insert', [
      1,
      2,
      1,
      'Student Data Viewer',
      2,
    ]);
    const headers = {
      cookie: 'pl_test_user=test_instructor; pl_requested_uid=student@illinois.edu',
    };
    const response = await helperClient.fetchCheerio(context.pageUrlStudent, {
      headers,
    });
    assert.equal(response.status, 403);
  });

  step('instructor (student data editor) can emulate student', async () => {
    await sqldb.callOneRowAsync('course_instance_permissions_update_role', [
      1,
      2,
      1,
      'Student Data Editor',
      2,
    ]);
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
    }
  );

  step(
    'instructor can emulate student and be denied access to instructor page (course instance route)',
    async () => {
      const headers = {
        cookie: 'pl_test_user=test_instructor; pl_requested_uid=student@illinois.edu',
      };
      const response = await helperClient.fetchCheerio(context.pageUrlCourseInstance, { headers });
      assert.equal(response.status, 403);
    }
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
    }
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
    await sqldb.callAsync('course_permissions_update_role', [1, 2, 'Viewer', 1]);
    const headers = {
      cookie:
        'pl_test_user=test_instructor; pl_access_as_administrator=inactive; pl_requested_uid=staff03@illinois.edu',
    };
    const response = await helperClient.fetchCheerio(context.pageUrlCourseInstance, { headers });
    assert.equal(response.status, 403);
  });

  step('can request uid of student data viewer as student data editor', async () => {
    await sqldb.callAsync('course_permissions_update_role', [1, 2, 'Owner', 1]);
    await sqldb.callOneRowAsync('course_instance_permissions_insert', [
      1,
      3,
      1,
      'Student Data Viewer',
      2,
    ]);
    const headers = {
      cookie:
        'pl_test_user=test_instructor; pl_access_as_administrator=inactive; pl_requested_uid=staff03@illinois.edu',
    };
    const response = await helperClient.fetchCheerio(context.pageUrlCourseInstance, { headers });
    assert.isTrue(response.ok);
  });

  step('cannot request uid of student data editor as student data viewer', async () => {
    await sqldb.callOneRowAsync('course_instance_permissions_update_role', [
      1,
      2,
      1,
      'Student Data Viewer',
      2,
    ]);
    await sqldb.callOneRowAsync('course_instance_permissions_update_role', [
      1,
      3,
      1,
      'Student Data Editor',
      2,
    ]);
    const headers = {
      cookie:
        'pl_test_user=test_instructor; pl_access_as_administrator=inactive; pl_requested_uid=staff03@illinois.edu',
    };
    const response = await helperClient.fetchCheerio(context.pageUrlCourseInstance, { headers });
    assert.equal(response.status, 403);
  });

  step('instructor can request lower course role', async () => {
    await sqldb.callAsync('course_permissions_update_role', [1, 2, 'Viewer', 1]);
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
    await sqldb.callOneRowAsync('course_instance_permissions_update_role', [
      1,
      2,
      1,
      'Student Data Editor',
      2,
    ]);
    const headers = {
      cookie:
        'pl_test_user=test_instructor; pl_access_as_administrator=inactive; pl_requested_course_instance_role=Student Data Viewer',
    };
    const response = await helperClient.fetchCheerio(context.pageUrlCourseInstance, { headers });
    assert.isTrue(response.ok);
  });

  step('instructor cannot request higher course instance role', async () => {
    await sqldb.callOneRowAsync('course_instance_permissions_update_role', [
      1,
      2,
      1,
      'Student Data Viewer',
      2,
    ]);
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
    }
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
    }
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
    }
  );
});
