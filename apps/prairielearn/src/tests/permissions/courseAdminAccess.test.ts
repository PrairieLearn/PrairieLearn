import { assert } from 'chai';
import { step } from 'mocha-steps';
import * as sqldb from '@prairielearn/postgres';

import { config } from '../../lib/config';
import * as helperServer from '../helperServer';
import * as helperClient from '../helperClient';
import { insertCoursePermissionsByUserUid } from '../../models/course-permissions';

const sql = sqldb.loadSqlEquiv(__filename);

async function checkPermissions(users) {
  const result = await sqldb.queryAsync(sql.select_permissions, {
    course_id: 1,
    course_instance_id: 1,
  });
  assert.includeMembers(
    users.map((user) => user.uid),
    result.rows.map((row) => row.uid),
  );
  users.forEach((user) => {
    const row = result.rows.find((row) => row.uid === user.uid);
    if (!user.cr) {
      assert.isNotOk(row);
    } else {
      assert.isOk(row);
      assert.equal(row.course_role, user.cr);
      assert.equal(row.course_instance_role, user.cir);
    }
  });
}

function updatePermissions(users, uid, cr, cir) {
  let user = users.find((user) => user.uid === uid);
  if (!user) {
    user = { uid };
    users.push(user);
  }
  user.cr = cr;
  user.cir = cir;
}

function runTest(context) {
  context.pageUrl = `${context.baseUrl}/course_admin/staff`;
  context.userId = 2;

  const headers = {
    cookie: 'pl_test_user=test_instructor',
  };

  const users = [
    {
      uid: 'instructor@illinois.edu',
      name: 'Instructor User',
      uin: '100000000',
      cr: 'Owner',
      cir: null,
    },
    {
      uid: 'staff03@illinois.edu',
      name: 'Staff Three',
      uin: null,
      cr: null,
      cir: null,
    },
    {
      uid: 'staff04@illinois.edu',
      name: 'Staff Four',
      uin: null,
      cr: null,
      cir: null,
    },
    {
      uid: 'staff05@illinois.edu',
      name: 'Staff Five',
      uin: null,
      cr: null,
      cir: null,
    },
  ];

  let new_user = 'garbage@illinois.edu';

  before('set up testing server', helperServer.before().bind(this));

  before('insert users and make instructor course owner', async function () {
    for (const user of users) {
      await sqldb.callAsync('users_select_or_insert', [
        user.uid,
        user.name,
        user.uin,
        'Shibboleth',
      ]);
    }
    await insertCoursePermissionsByUserUid({
      course_id: '1',
      uid: 'instructor@illinois.edu',
      course_role: 'Owner',
      authn_user_id: '1',
    });
    const result = await sqldb.queryAsync(sql.select_non_existent_user, {});
    if (result.rowCount) new_user = result.rows[0].uid;
  });

  after('shut down testing server', helperServer.after);

  step('permissions should match', async () => {
    await checkPermissions(users);
  });

  step('cannot add multiple users with owner role', async () => {
    let response = await helperClient.fetchCheerio(context.pageUrl, {
      headers,
    });
    assert.isTrue(response.ok);
    helperClient.extractAndSaveCSRFTokenFromDataContent(
      context,
      response.$,
      'button[id=coursePermissionsInsertButton]',
    );
    const form = {
      __action: 'course_permissions_insert_by_user_uids',
      __csrf_token: context.__csrf_token,
      uid: ' staff03@illinois.edu ,   ,   staff04@illinois.edu',
      course_role: 'Owner',
    };
    response = await helperClient.fetchCheerio(context.pageUrl, {
      method: 'POST',
      form,
      headers,
    });
    assert.equal(response.status, 400);
    await checkPermissions(users);
  });

  step('can add multiple users', async () => {
    let response = await helperClient.fetchCheerio(context.pageUrl, {
      headers,
    });
    assert.isTrue(response.ok);
    helperClient.extractAndSaveCSRFTokenFromDataContent(
      context,
      response.$,
      'button[id=coursePermissionsInsertButton]',
    );
    const form = {
      __action: 'course_permissions_insert_by_user_uids',
      __csrf_token: context.__csrf_token,
      uid: ' staff03@illinois.edu ,   ,   staff04@illinois.edu',
      course_role: 'Viewer',
    };
    response = await helperClient.fetchCheerio(context.pageUrl, {
      method: 'POST',
      form,
      headers,
    });
    assert.isTrue(response.ok);
    updatePermissions(users, 'staff03@illinois.edu', 'Viewer', null);
    updatePermissions(users, 'staff04@illinois.edu', 'Viewer', null);
    await checkPermissions(users);
  });

  step('can add valid subset of multiple users', async () => {
    let response = await helperClient.fetchCheerio(context.pageUrl, {
      headers,
    });
    assert.isTrue(response.ok);
    helperClient.extractAndSaveCSRFTokenFromDataContent(
      context,
      response.$,
      'button[id=coursePermissionsInsertButton]',
    );
    const form = {
      __action: 'course_permissions_insert_by_user_uids',
      __csrf_token: context.__csrf_token,
      uid: `staff03@illinois.edu, staff05@illinois.edu, ${new_user}`,
      course_role: 'None',
    };
    response = await helperClient.fetchCheerio(context.pageUrl, {
      method: 'POST',
      form,
      headers,
    });
    assert.isTrue(response.ok);
    updatePermissions(users, 'staff05@illinois.edu', 'None', null);
    updatePermissions(users, new_user, 'None', null);
    await checkPermissions(users);
  });

  step('can add course instance permission', async () => {
    let response = await helperClient.fetchCheerio(context.pageUrl, {
      headers,
    });
    assert.isTrue(response.ok);
    helperClient.extractAndSaveCSRFToken(
      context,
      response.$,
      `form[name=student-data-access-add-3]`,
    );
    const form = {
      __action: 'course_instance_permissions_insert',
      __csrf_token: context.__csrf_token,
      user_id: 3,
      course_instance_id: 1,
    };
    response = await helperClient.fetchCheerio(context.pageUrl, {
      method: 'POST',
      form,
      headers,
    });
    assert.isTrue(response.ok);
    updatePermissions(users, 'staff03@illinois.edu', 'Viewer', 'Student Data Viewer');
    await checkPermissions(users);
  });

  step('can delete user', async () => {
    let response = await helperClient.fetchCheerio(context.pageUrl, {
      headers,
    });
    assert.isTrue(response.ok);
    helperClient.extractAndSaveCSRFToken(
      context,
      response.$,
      `form[name=course-content-access-form-3]`,
    );
    const form = {
      __action: 'course_permissions_delete',
      __csrf_token: context.__csrf_token,
      user_id: 3,
    };
    response = await helperClient.fetchCheerio(context.pageUrl, {
      method: 'POST',
      form,
      headers,
    });
    assert.isTrue(response.ok);
    updatePermissions(users, 'staff03@illinois.edu', null, null);
    await checkPermissions(users);
  });

  step('cannot delete self', async () => {
    let response = await helperClient.fetchCheerio(context.pageUrl, {
      headers,
    });
    assert.isTrue(response.ok);
    const __csrf_token = response.$('span[id=test_csrf_token]').text();
    assert.lengthOf(response.$(`form[name=course-content-access-form-${context.userId}]`), 0);
    const form = {
      __action: 'course_permissions_delete',
      __csrf_token,
      user_id: 2,
    };
    response = await helperClient.fetchCheerio(context.pageUrl, {
      method: 'POST',
      form,
      headers,
    });
    assert.equal(response.status, 403);
    await checkPermissions(users);
  });

  step('can change course role', async () => {
    let response = await helperClient.fetchCheerio(context.pageUrl, {
      headers,
    });
    assert.isTrue(response.ok);
    helperClient.extractAndSaveCSRFToken(
      context,
      response.$,
      `form[name=course-content-access-form-4]`,
    );
    const form = {
      __action: 'course_permissions_update_role',
      __csrf_token: context.__csrf_token,
      user_id: 4,
      course_role: 'Owner',
    };
    response = await helperClient.fetchCheerio(context.pageUrl, {
      method: 'POST',
      form,
      headers,
    });
    assert.isTrue(response.ok);
    updatePermissions(users, 'staff04@illinois.edu', 'Owner', null);
    await checkPermissions(users);
  });

  step('cannot change course role of self', async () => {
    let response = await helperClient.fetchCheerio(context.pageUrl, {
      headers,
    });
    assert.isTrue(response.ok);
    const __csrf_token = response.$('span[id=test_csrf_token]').text();
    assert.lengthOf(response.$(`form[name=course-content-access-form-${context.userId}]`), 0);
    const form = {
      __action: 'course_permissions_update_role',
      __csrf_token,
      user_id: context.userId,
      course_role: 'None',
    };
    response = await helperClient.fetchCheerio(context.pageUrl, {
      method: 'POST',
      form,
      headers,
    });
    assert.equal(response.status, 403);
    await checkPermissions(users);
  });

  step('cannot delete self even when emulating another owner', async () => {
    const headers = {
      cookie: 'pl_test_user=test_instructor; pl_requested_uid=staff04@illinois.edu',
    };
    let response = await helperClient.fetchCheerio(context.pageUrl, {
      headers,
    });
    assert.isTrue(response.ok);
    const __csrf_token = response.$('span[id=test_csrf_token]').text();
    assert.lengthOf(response.$(`form[name=course-content-access-form-${context.userId}]`), 0);
    const form = {
      __action: 'course_permissions_delete',
      __csrf_token,
      user_id: context.userId,
    };
    response = await helperClient.fetchCheerio(context.pageUrl, {
      method: 'POST',
      form,
      headers,
    });
    assert.equal(response.status, 403);
    await checkPermissions(users);
  });

  step('cannot change course role of self even when emulating another owner', async () => {
    const headers = {
      cookie: 'pl_test_user=test_instructor; pl_requested_uid=staff04@illinois.edu',
    };
    let response = await helperClient.fetchCheerio(context.pageUrl, {
      headers,
    });
    assert.isTrue(response.ok);
    const __csrf_token = response.$('span[id=test_csrf_token]').text();
    assert.lengthOf(response.$(`form[name=course-content-access-form-${context.userId}]`), 0);
    const form = {
      __action: 'course_permissions_update_role',
      __csrf_token,
      user_id: context.userId,
      course_role: 'None',
    };
    response = await helperClient.fetchCheerio(context.pageUrl, {
      method: 'POST',
      form,
      headers,
    });
    assert.equal(response.status, 403);
    await checkPermissions(users);
  });

  step('can add user', async () => {
    let response = await helperClient.fetchCheerio(context.pageUrl, {
      headers,
    });
    assert.isTrue(response.ok);
    helperClient.extractAndSaveCSRFTokenFromDataContent(
      context,
      response.$,
      'button[id=coursePermissionsInsertButton]',
    );
    const form = {
      __action: 'course_permissions_insert_by_user_uids',
      __csrf_token: context.__csrf_token,
      uid: 'staff03@illinois.edu',
      course_role: 'None',
    };
    response = await helperClient.fetchCheerio(context.pageUrl, {
      method: 'POST',
      form,
      headers,
    });
    assert.isTrue(response.ok);
    updatePermissions(users, 'staff03@illinois.edu', 'None', null);
    await checkPermissions(users);
  });

  step('can add course instance permission', async () => {
    let response = await helperClient.fetchCheerio(context.pageUrl, {
      headers,
    });
    assert.isTrue(response.ok);
    helperClient.extractAndSaveCSRFToken(
      context,
      response.$,
      `form[name=student-data-access-add-3]`,
    );
    const form = {
      __action: 'course_instance_permissions_insert',
      __csrf_token: context.__csrf_token,
      user_id: 3,
      course_instance_id: 1,
    };
    response = await helperClient.fetchCheerio(context.pageUrl, {
      method: 'POST',
      form,
      headers,
    });
    assert.isTrue(response.ok);
    updatePermissions(users, 'staff03@illinois.edu', 'None', 'Student Data Viewer');
    await checkPermissions(users);
  });

  step('can update course instance permission', async () => {
    let response = await helperClient.fetchCheerio(context.pageUrl, {
      headers,
    });
    assert.isTrue(response.ok);
    helperClient.extractAndSaveCSRFToken(
      context,
      response.$,
      `form[name=student-data-access-change-3-1]`,
    );
    const form = {
      __action: 'course_instance_permissions_update_role_or_delete',
      __csrf_token: context.__csrf_token,
      user_id: 3,
      course_instance_id: 1,
      course_instance_role: 'Student Data Editor',
    };
    response = await helperClient.fetchCheerio(context.pageUrl, {
      method: 'POST',
      form,
      headers,
    });
    assert.isTrue(response.ok);
    updatePermissions(users, 'staff03@illinois.edu', 'None', 'Student Data Editor');
    await checkPermissions(users);
  });

  step('can add course instance permission', async () => {
    let response = await helperClient.fetchCheerio(context.pageUrl, {
      headers,
    });
    assert.isTrue(response.ok);
    helperClient.extractAndSaveCSRFToken(
      context,
      response.$,
      `form[name=student-data-access-add-5]`,
    );
    const form = {
      __action: 'course_instance_permissions_insert',
      __csrf_token: context.__csrf_token,
      user_id: 5,
      course_instance_id: 1,
    };
    response = await helperClient.fetchCheerio(context.pageUrl, {
      method: 'POST',
      form,
      headers,
    });
    assert.isTrue(response.ok);
    updatePermissions(users, 'staff05@illinois.edu', 'None', 'Student Data Viewer');
    await checkPermissions(users);
  });

  step('can delete course instance permission', async () => {
    let response = await helperClient.fetchCheerio(context.pageUrl, {
      headers,
    });
    assert.isTrue(response.ok);
    helperClient.extractAndSaveCSRFToken(
      context,
      response.$,
      `form[name=student-data-access-change-5-1]`,
    );
    const form = {
      __action: 'course_instance_permissions_update_role_or_delete',
      __csrf_token: context.__csrf_token,
      user_id: 5,
      course_instance_id: 1,
    };
    response = await helperClient.fetchCheerio(context.pageUrl, {
      method: 'POST',
      form,
      headers,
    });
    assert.isTrue(response.ok);
    updatePermissions(users, 'staff05@illinois.edu', 'None', null);
    await checkPermissions(users);
  });

  step('can delete all course instance permissions', async () => {
    let response = await helperClient.fetchCheerio(context.pageUrl, {
      headers,
    });
    assert.isTrue(response.ok);
    helperClient.extractAndSaveCSRFTokenFromDataContent(
      context,
      response.$,
      'button[id=coursePermissionsRemoveStudentDataAccessButton]',
    );
    const form = {
      __action: 'remove_all_student_data_access',
      __csrf_token: context.__csrf_token,
    };
    response = await helperClient.fetchCheerio(context.pageUrl, {
      method: 'POST',
      form,
      headers,
    });
    assert.isTrue(response.ok);
    updatePermissions(users, 'staff03@illinois.edu', 'None', null);
    await checkPermissions(users);
  });

  step('can add course instance permission', async () => {
    let response = await helperClient.fetchCheerio(context.pageUrl, {
      headers,
    });
    assert.isTrue(response.ok);
    helperClient.extractAndSaveCSRFToken(
      context,
      response.$,
      `form[name=student-data-access-add-5]`,
    );
    const form = {
      __action: 'course_instance_permissions_insert',
      __csrf_token: context.__csrf_token,
      user_id: 5,
      course_instance_id: 1,
    };
    response = await helperClient.fetchCheerio(context.pageUrl, {
      method: 'POST',
      form,
      headers,
    });
    assert.isTrue(response.ok);
    updatePermissions(users, 'staff05@illinois.edu', 'None', 'Student Data Viewer');
    await checkPermissions(users);
  });

  step('can delete users with no access', async () => {
    let response = await helperClient.fetchCheerio(context.pageUrl, {
      headers,
    });
    assert.isTrue(response.ok);
    helperClient.extractAndSaveCSRFTokenFromDataContent(
      context,
      response.$,
      'button[id=coursePermissionsDeleteNoAccessButton]',
    );
    const form = {
      __action: 'delete_no_access',
      __csrf_token: context.__csrf_token,
    };
    response = await helperClient.fetchCheerio(context.pageUrl, {
      method: 'POST',
      form,
      headers,
    });
    assert.isTrue(response.ok);
    updatePermissions(users, 'staff03@illinois.edu', null, null);
    updatePermissions(users, new_user, null, null);
    await checkPermissions(users);
  });

  step('can delete non-owners', async () => {
    let response = await helperClient.fetchCheerio(context.pageUrl, {
      headers,
    });
    assert.isTrue(response.ok);
    helperClient.extractAndSaveCSRFTokenFromDataContent(
      context,
      response.$,
      'button[id=coursePermissionsDeleteNonOwnersButton]',
    );
    const form = {
      __action: 'delete_non_owners',
      __csrf_token: context.__csrf_token,
    };
    response = await helperClient.fetchCheerio(context.pageUrl, {
      method: 'POST',
      form,
      headers,
    });
    assert.isTrue(response.ok);
    updatePermissions(users, 'staff05@illinois.edu', null, null);
    await checkPermissions(users);
  });

  step('can change course role', async () => {
    let response = await helperClient.fetchCheerio(context.pageUrl, {
      headers,
    });
    assert.isTrue(response.ok);
    helperClient.extractAndSaveCSRFToken(
      context,
      response.$,
      `form[name=course-content-access-form-4]`,
    );
    const form = {
      __action: 'course_permissions_update_role',
      __csrf_token: context.__csrf_token,
      user_id: 4,
      course_role: 'Editor',
    };
    response = await helperClient.fetchCheerio(context.pageUrl, {
      method: 'POST',
      form,
      headers,
    });
    assert.isTrue(response.ok);
    updatePermissions(users, 'staff04@illinois.edu', 'Editor', null);
    await checkPermissions(users);
  });

  step('cannot GET if not an owner', async () => {
    const headers = {
      cookie: 'pl_test_user=test_instructor; pl_requested_uid=staff04@illinois.edu',
    };
    const response = await helperClient.fetchCheerio(context.pageUrl, {
      headers,
    });
    assert.equal(response.status, 403);
  });
}

describe('course admin access page through course route', function () {
  this.timeout(60000);

  const context: Record<string, any> = {};
  context.siteUrl = `http://localhost:${config.serverPort}`;
  context.baseUrl = `${context.siteUrl}/pl/course/1`;

  runTest(context);
});

describe('course admin access page through course instance route', function () {
  this.timeout(60000);

  const context: Record<string, any> = {};
  context.siteUrl = `http://localhost:${config.serverPort}`;
  context.baseUrl = `${context.siteUrl}/pl/course_instance/1/instructor`;

  runTest(context);
});
