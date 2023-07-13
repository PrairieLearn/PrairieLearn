// @ts-check
const util = require('util');
const assert = require('chai').assert;
const { step } = require('mocha-steps');
const { z } = require('zod');
const sqldb = require('@prairielearn/postgres');

const { config } = require('../../lib/config');
const { EXAMPLE_COURSE_PATH, TEST_COURSE_PATH } = require('../../lib/paths');
const helperServer = require('../helperServer');
const helperClient = require('../helperClient');

const sql = sqldb.loadSqlEquiv(__filename);

const UserWithIdSchema = z.object({
  user_id: z.string(),
});

describe('effective user', function () {
  this.timeout(60000);

  const context = {};
  context.siteUrl = `http://localhost:${config.serverPort}`;
  context.baseUrl = `${context.siteUrl}/pl`;
  context.pageUrlTestCourse = `${context.baseUrl}/course/1`;
  context.pageUrlExampleCourse = `${context.baseUrl}/course/2`;
  context.pageUrlTestCourseInstance = `${context.baseUrl}/course_instance/1/instructor`;
  context.pageUrlExampleCourseInstance = `${context.baseUrl}/course_instance/2/instructor`;
  context.pageUrlStudent = `${context.baseUrl}/course_instance/1`;

  before('set up testing server', async function () {
    await util.promisify(
      helperServer
        .before([
          // We need two courses for this test so that we can validate behavior of
          // institution administrators.
          TEST_COURSE_PATH,
          EXAMPLE_COURSE_PATH,
        ])
        .bind(this),
    )();
  });

  let institutionAdminId;
  let instructorId;
  let staffId;
  let studentId;

  before('insert users', async function () {
    const institutionAdmin = await sqldb.callValidatedOneRow(
      'users_select_or_insert',
      ['institution-admin@illinois.edu', 'Institution Admin', null, 'dev'],
      UserWithIdSchema,
    );
    institutionAdminId = institutionAdmin.user_id;
    await sqldb.queryAsync(sql.insert_institution_administrator, {
      user_id: institutionAdminId,
      institution_id: 1,
    });

    const instructor = await sqldb.callValidatedOneRow(
      'users_select_or_insert',
      ['instructor@illinois.edu', 'Instructor User', '100000000', 'dev'],
      UserWithIdSchema,
    );
    instructorId = instructor.user_id;
    await sqldb.callOneRowAsync('course_permissions_insert_by_user_uid', [
      1,
      'instructor@illinois.edu',
      'Owner',
      instructorId,
    ]);

    const staff = await sqldb.callValidatedOneRow(
      'users_select_or_insert',
      ['staff03@illinois.edu', 'Staff Three', null, 'dev'],
      UserWithIdSchema,
    );
    staffId = staff.user_id;
    await sqldb.callOneRowAsync('course_permissions_insert_by_user_uid', [
      1,
      'staff03@illinois.edu',
      'Editor',
      staffId,
    ]);

    const student = await sqldb.callValidatedOneRow(
      'users_select_or_insert',
      ['student@illinois.edu', 'Student User', '000000001', 'dev'],
      UserWithIdSchema,
    );
    studentId = student.user_id;
    await sqldb.queryAsync(sql.insert_enrollment, {
      user_id: studentId,
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
    const response = await helperClient.fetchCheerio(context.pageUrlTestCourseInstance, {
      headers,
    });
    assert.equal(response.status, 403);
  });

  step('student cannot override date (error when on instructor page) - course route', async () => {
    const headers = {
      cookie: 'pl_test_user=test_student; pl_requested_date=1700-01-19T00:00:01',
    };
    const response = await helperClient.fetchCheerio(context.pageUrlTestCourse, {
      headers,
    });
    assert.equal(response.status, 403);
  });

  step('instructor can override date (and becomes enrolled)', async () => {
    let result = await sqldb.queryAsync(sql.select_enrollment, {
      user_id: instructorId,
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
      user_id: instructorId,
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
      instructorId,
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
      instructorId,
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
    },
  );

  step(
    'instructor can emulate student and be denied access to instructor page (course instance route)',
    async () => {
      const headers = {
        cookie: 'pl_test_user=test_instructor; pl_requested_uid=student@illinois.edu',
      };
      const response = await helperClient.fetchCheerio(context.pageUrlTestCourseInstance, {
        headers,
      });
      assert.equal(response.status, 403);
    },
  );

  step(
    'instructor can emulate student and be denied access to instructor page (course route)',
    async () => {
      const headers = {
        cookie: 'pl_test_user=test_instructor; pl_requested_uid=student@illinois.edu',
      };
      const response = await helperClient.fetchCheerio(context.pageUrlTestCourse, {
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
    await sqldb.queryAsync(sql.insert_administrator, { user_id: instructorId });
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
    const response = await helperClient.fetchCheerio(context.pageUrlTestCourseInstance, {
      headers,
    });
    assert.isTrue(response.ok);
  });

  step('cannot request uid of course editor as course viewer', async () => {
    await sqldb.callAsync('course_permissions_update_role', [1, instructorId, 'Viewer', 1]);
    const headers = {
      cookie:
        'pl_test_user=test_instructor; pl_access_as_administrator=inactive; pl_requested_uid=staff03@illinois.edu',
    };
    const response = await helperClient.fetchCheerio(context.pageUrlTestCourseInstance, {
      headers,
    });
    assert.equal(response.status, 403);
  });

  step('can request uid of student data viewer as student data editor', async () => {
    await sqldb.callAsync('course_permissions_update_role', [1, instructorId, 'Owner', 1]);
    await sqldb.callOneRowAsync('course_instance_permissions_insert', [
      1,
      staffId,
      1,
      'Student Data Viewer',
      2,
    ]);
    const headers = {
      cookie:
        'pl_test_user=test_instructor; pl_access_as_administrator=inactive; pl_requested_uid=staff03@illinois.edu',
    };
    const response = await helperClient.fetchCheerio(context.pageUrlTestCourseInstance, {
      headers,
    });
    assert.isTrue(response.ok);
  });

  step('cannot request uid of student data editor as student data viewer', async () => {
    await sqldb.callOneRowAsync('course_instance_permissions_update_role', [
      1,
      instructorId,
      1,
      'Student Data Viewer',
      2,
    ]);
    await sqldb.callOneRowAsync('course_instance_permissions_update_role', [
      1,
      staffId,
      1,
      'Student Data Editor',
      2,
    ]);
    const headers = {
      cookie:
        'pl_test_user=test_instructor; pl_access_as_administrator=inactive; pl_requested_uid=staff03@illinois.edu',
    };
    const response = await helperClient.fetchCheerio(context.pageUrlTestCourseInstance, {
      headers,
    });
    assert.equal(response.status, 403);
  });

  step('instructor can request lower course role', async () => {
    await sqldb.callAsync('course_permissions_update_role', [1, instructorId, 'Viewer', 1]);
    const headers = {
      cookie:
        'pl_test_user=test_instructor; pl_access_as_administrator=inactive; pl_requested_course_role=Previewer',
    };
    const response = await helperClient.fetchCheerio(context.pageUrlTestCourseInstance, {
      headers,
    });
    assert.isTrue(response.ok);
  });

  step('instructor cannot request higher course role', async () => {
    const headers = {
      cookie:
        'pl_test_user=test_instructor; pl_access_as_administrator=inactive; pl_requested_course_role=Editor',
    };
    const response = await helperClient.fetchCheerio(context.pageUrlTestCourseInstance, {
      headers,
    });
    assert.equal(response.status, 403);
  });

  step('instructor can request lower course instance role', async () => {
    await sqldb.callOneRowAsync('course_instance_permissions_update_role', [
      1,
      instructorId,
      1,
      'Student Data Editor',
      2,
    ]);
    const headers = {
      cookie:
        'pl_test_user=test_instructor; pl_access_as_administrator=inactive; pl_requested_course_instance_role=Student Data Viewer',
    };
    const response = await helperClient.fetchCheerio(context.pageUrlTestCourseInstance, {
      headers,
    });
    assert.isTrue(response.ok);
  });

  step('instructor cannot request higher course instance role', async () => {
    await sqldb.callOneRowAsync('course_instance_permissions_update_role', [
      1,
      instructorId,
      1,
      'Student Data Viewer',
      2,
    ]);
    const headers = {
      cookie:
        'pl_test_user=test_instructor; pl_access_as_administrator=inactive; pl_requested_course_instance_role=Student Data Editor',
    };
    const response = await helperClient.fetchCheerio(context.pageUrlTestCourseInstance, {
      headers,
    });
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
      const response = await helperClient.fetchCheerio(context.pageUrlTestCourseInstance, {
        headers,
      });
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
      const response = await helperClient.fetchCheerio(context.pageUrlTestCourse, {
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
      const response = await helperClient.fetchCheerio(context.pageUrlTestCourseInstance, {
        headers,
      });
      assert.isTrue(response.ok);
    },
  );

  step('reset instructor course role to maximum permissions', async () => {
    await sqldb.callAsync('course_permissions_update_role', [1, instructorId, 'Owner', 1]);
    await sqldb.callOneRowAsync('course_instance_permissions_update_role', [
      1,
      instructorId,
      1,
      'Student Data Editor',
      2,
    ]);
  });

  step(
    'instructor can access their own course when requesting access as institution administrator',
    async () => {
      const headers = {
        cookie:
          'pl_test_user=test_instructor; pl_access_as_administrator=inactive; pl_requested_uid=institution-admin@illinois.edu',
      };
      const response = await helperClient.fetchCheerio(context.pageUrlTestCourse, {
        headers,
      });
      assert.isTrue(response.ok);
    },
  );

  step(
    'instructor can access their own course instance when requesting access as institution administrator',
    async () => {
      const headers = {
        cookie:
          'pl_test_user=test_instructor; pl_access_as_administrator=inactive; pl_requested_uid=institution-admin@illinois.edu',
      };
      const response = await helperClient.fetchCheerio(context.pageUrlTestCourseInstance, {
        headers,
      });
      assert.isTrue(response.ok);
    },
  );

  step(
    'instructor cannot access other courses when requesting access as institution administrator',
    async () => {
      const headers = {
        cookie:
          'pl_test_user=test_instructor; pl_access_as_administrator=inactive; pl_requested_uid=institution-admin@illinois.edu',
      };
      const response = await helperClient.fetchCheerio(context.pageUrlExampleCourse, {
        headers,
      });
      assert.isFalse(response.ok);
    },
  );

  step(
    'instructor cannot access other course instances when requesting access as institution administrator',
    async () => {
      const headers = {
        cookie:
          'pl_test_user=test_instructor; pl_access_as_administrator=inactive; pl_requested_uid=institution-admin@illinois.edu',
      };
      const response = await helperClient.fetchCheerio(context.pageUrlExampleCourseInstance, {
        headers,
      });
      assert.isFalse(response.ok);
    },
  );
});
