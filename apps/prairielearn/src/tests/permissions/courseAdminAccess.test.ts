import { afterAll, assert, beforeAll, describe, test } from 'vitest';
import z from 'zod';

import * as sqldb from '@prairielearn/postgres';

import { config } from '../../lib/config.js';
import {
  CourseInstancePermissionSchema,
  CoursePermissionSchema,
  SprocUsersSelectOrInsertSchema,
  UserSchema,
} from '../../lib/db-types.js';
import { insertCoursePermissionsByUserUid } from '../../models/course-permissions.js';
import * as helperClient from '../helperClient.js';
import * as helperServer from '../helperServer.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

async function checkPermissions(users) {
  const result = await sqldb.queryRows(
    sql.select_permissions,
    {
      course_id: 1,
      course_instance_id: 1,
    },
    z.object({
      uid: UserSchema.shape.uid,
      course_role: CoursePermissionSchema.shape.course_role,
      course_instance_role: CourseInstancePermissionSchema.shape.course_instance_role,
    }),
  );
  assert.includeMembers(
    users.map((user) => user.uid),
    result.map((row) => row.uid),
  );
  users.forEach((user) => {
    const row = result.find((row) => row.uid === user.uid);
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
      uid: 'instructor@example.com',
      name: 'Instructor User',
      uin: '100000000',
      email: 'instructor@example.com',
      cr: 'Owner',
      cir: null,
    },
    {
      uid: 'staff03@example.com',
      name: 'Staff Three',
      uin: null,
      email: 'staff03@example.com',
      cr: null,
      cir: null,
    },
    {
      uid: 'staff04@example.com',
      name: 'Staff Four',
      uin: null,
      email: 'staff04@example.com',
      cr: null,
      cir: null,
    },
    {
      uid: 'staff05@example.com',
      name: 'Staff Five',
      uin: null,
      email: 'staff05@example.com',
      cr: null,
      cir: null,
    },
  ];

  let new_user = 'garbage@example.com';

  beforeAll(helperServer.before());

  beforeAll(async function () {
    // Insert necessary users.
    for (const user of users) {
      await sqldb.callRow(
        'users_select_or_insert',
        [user.uid, user.name, user.uin, user.email, 'Shibboleth'],
        SprocUsersSelectOrInsertSchema,
      );
    }

    // Make the instructor a course owner.
    await insertCoursePermissionsByUserUid({
      course_id: '1',
      uid: 'instructor@example.com',
      course_role: 'Owner',
      authn_user_id: '1',
    });
    const new_user_uid = await sqldb.queryOptionalRow(sql.select_non_existent_user, z.string());
    if (new_user_uid) new_user = new_user_uid;
  });

  afterAll(helperServer.after);

  test.sequential('permissions should match', async () => {
    await checkPermissions(users);
  });

  test.sequential('can add multiple users', async () => {
    let response = await helperClient.fetchCheerio(context.pageUrl, {
      headers,
    });
    assert.isTrue(response.ok);
    helperClient.extractAndSaveCSRFTokenFromDataContent(
      context,
      response.$,
      'button[data-testid="add-users-button"]',
    );
    response = await helperClient.fetchCheerio(context.pageUrl, {
      method: 'POST',
      body: new URLSearchParams({
        __action: 'course_permissions_insert_by_user_uids',
        __csrf_token: context.__csrf_token,
        uid: ' staff03@example.com ,   ,   staff04@example.com',
        course_role: 'Viewer',
      }),
      headers,
    });
    assert.isTrue(response.ok);
    updatePermissions(users, 'staff03@example.com', 'Viewer', null);
    updatePermissions(users, 'staff04@example.com', 'Viewer', null);
    await checkPermissions(users);
  });

  test.sequential('can add valid subset of multiple users', async () => {
    let response = await helperClient.fetchCheerio(context.pageUrl, {
      headers,
    });
    assert.isTrue(response.ok);
    helperClient.extractAndSaveCSRFTokenFromDataContent(
      context,
      response.$,
      'button[data-testid="add-users-button"]',
    );
    response = await helperClient.fetchCheerio(context.pageUrl, {
      method: 'POST',
      body: new URLSearchParams({
        __action: 'course_permissions_insert_by_user_uids',
        __csrf_token: context.__csrf_token,
        uid: `staff03@example.com, staff05@example.com, ${new_user}`,
        course_role: 'None',
      }),
      headers,
    });
    assert.isTrue(response.ok);
    updatePermissions(users, 'staff05@example.com', 'None', null);
    updatePermissions(users, new_user, 'None', null);
    await checkPermissions(users);
  });

  test.sequential('can add course instance permission', async () => {
    let response = await helperClient.fetchCheerio(context.pageUrl, {
      headers,
    });
    assert.isTrue(response.ok);
    helperClient.extractAndSaveCSRFToken(
      context,
      response.$,
      'form[name=student-data-access-add-3]',
    );
    response = await helperClient.fetchCheerio(context.pageUrl, {
      method: 'POST',
      body: new URLSearchParams({
        __action: 'course_instance_permissions_insert',
        __csrf_token: context.__csrf_token,
        user_id: '3',
        course_instance_id: '1',
      }),
      headers,
    });
    assert.isTrue(response.ok);
    updatePermissions(users, 'staff03@example.com', 'Viewer', 'Student Data Viewer');
    await checkPermissions(users);
  });

  test.sequential('can delete user', async () => {
    let response = await helperClient.fetchCheerio(context.pageUrl, { headers });
    assert.isTrue(response.ok);
    helperClient.extractAndSaveCSRFTokenFromDataContent(
      context,
      response.$,
      '#course-permission-button-3',
    );
    response = await helperClient.fetchCheerio(context.pageUrl, {
      method: 'POST',
      body: new URLSearchParams({
        __action: 'course_permissions_delete',
        __csrf_token: context.__csrf_token,
        user_id: '3',
      }),
      headers,
    });
    assert.isTrue(response.ok);
    updatePermissions(users, 'staff03@example.com', null, null);
    await checkPermissions(users);
  });

  test.sequential('cannot delete self', async () => {
    let response = await helperClient.fetchCheerio(context.pageUrl, {
      headers,
    });
    assert.isTrue(response.ok);
    const __csrf_token = response.$('span[id=test_csrf_token]').text();
    assert.lengthOf(response.$(`form[name=course-content-access-form-${context.userId}]`), 0);
    response = await helperClient.fetchCheerio(context.pageUrl, {
      method: 'POST',
      body: new URLSearchParams({
        __action: 'course_permissions_delete',
        __csrf_token,
        user_id: '2',
      }),
      headers,
    });
    assert.equal(response.status, 403);
    await checkPermissions(users);
  });

  test.sequential('can change course role', async () => {
    let response = await helperClient.fetchCheerio(context.pageUrl, { headers });
    assert.isTrue(response.ok);
    helperClient.extractAndSaveCSRFTokenFromDataContent(
      context,
      response.$,
      '#course-permission-button-4',
    );
    response = await helperClient.fetchCheerio(context.pageUrl, {
      method: 'POST',
      body: new URLSearchParams({
        __action: 'course_permissions_update_role',
        __csrf_token: context.__csrf_token,
        user_id: '4',
        course_role: 'Owner',
      }),
      headers,
    });
    assert.isTrue(response.ok);
    updatePermissions(users, 'staff04@example.com', 'Owner', null);
    await checkPermissions(users);
  });

  test.sequential('cannot change course role of self', async () => {
    let response = await helperClient.fetchCheerio(context.pageUrl, {
      headers,
    });
    assert.isTrue(response.ok);
    const __csrf_token = response.$('span[id=test_csrf_token]').text();
    assert.lengthOf(response.$(`form[name=course-content-access-form-${context.userId}]`), 0);
    response = await helperClient.fetchCheerio(context.pageUrl, {
      method: 'POST',
      body: new URLSearchParams({
        __action: 'course_permissions_update_role',
        __csrf_token,
        user_id: context.userId,
        course_role: 'None',
      }),
      headers,
    });
    assert.equal(response.status, 403);
    await checkPermissions(users);
  });

  test.sequential('cannot delete self even when emulating another owner', async () => {
    const headers = {
      cookie: 'pl_test_user=test_instructor; pl2_requested_uid=staff04@example.com',
    };
    let response = await helperClient.fetchCheerio(context.pageUrl, {
      headers,
    });
    assert.isTrue(response.ok);
    const __csrf_token = response.$('span[id=test_csrf_token]').text();
    assert.lengthOf(response.$(`form[name=course-content-access-form-${context.userId}]`), 0);
    response = await helperClient.fetchCheerio(context.pageUrl, {
      method: 'POST',
      body: new URLSearchParams({
        __action: 'course_permissions_delete',
        __csrf_token,
        user_id: context.userId,
      }),
      headers,
    });
    assert.equal(response.status, 403);
    await checkPermissions(users);
  });

  test.sequential(
    'cannot change course role of self even when emulating another owner',
    async () => {
      const headers = {
        cookie: 'pl_test_user=test_instructor; pl2_requested_uid=staff04@example.com',
      };
      let response = await helperClient.fetchCheerio(context.pageUrl, {
        headers,
      });
      assert.isTrue(response.ok);
      const __csrf_token = response.$('span[id=test_csrf_token]').text();
      assert.lengthOf(response.$(`form[name=course-content-access-form-${context.userId}]`), 0);
      response = await helperClient.fetchCheerio(context.pageUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'course_permissions_update_role',
          __csrf_token,
          user_id: context.userId,
          course_role: 'None',
        }),
        headers,
      });
      assert.equal(response.status, 403);
      await checkPermissions(users);
    },
  );

  test.sequential('can add user', async () => {
    let response = await helperClient.fetchCheerio(context.pageUrl, {
      headers,
    });
    assert.isTrue(response.ok);
    helperClient.extractAndSaveCSRFTokenFromDataContent(
      context,
      response.$,
      'button[data-testid="add-users-button"]',
    );
    response = await helperClient.fetchCheerio(context.pageUrl, {
      method: 'POST',
      body: new URLSearchParams({
        __action: 'course_permissions_insert_by_user_uids',
        __csrf_token: context.__csrf_token,
        uid: 'staff03@example.com',
        course_role: 'None',
      }),
      headers,
    });
    assert.isTrue(response.ok);
    updatePermissions(users, 'staff03@example.com', 'None', null);
    await checkPermissions(users);
  });

  test.sequential('can add course instance permission', async () => {
    let response = await helperClient.fetchCheerio(context.pageUrl, {
      headers,
    });
    assert.isTrue(response.ok);
    helperClient.extractAndSaveCSRFToken(
      context,
      response.$,
      'form[name=student-data-access-add-3]',
    );
    response = await helperClient.fetchCheerio(context.pageUrl, {
      method: 'POST',
      body: new URLSearchParams({
        __action: 'course_instance_permissions_insert',
        __csrf_token: context.__csrf_token,
        user_id: '3',
        course_instance_id: '1',
      }),
      headers,
    });
    assert.isTrue(response.ok);
    updatePermissions(users, 'staff03@example.com', 'None', 'Student Data Viewer');
    await checkPermissions(users);
  });

  test.sequential('can update course instance permission', async () => {
    let response = await helperClient.fetchCheerio(context.pageUrl, { headers });
    assert.isTrue(response.ok);
    helperClient.extractAndSaveCSRFTokenFromDataContent(
      context,
      response.$,
      '#course-instance-permission-button-3-1',
    );
    response = await helperClient.fetchCheerio(context.pageUrl, {
      method: 'POST',
      body: new URLSearchParams({
        __action: 'course_instance_permissions_update_role_or_delete',
        __csrf_token: context.__csrf_token,
        user_id: '3',
        course_instance_id: '1',
        course_instance_role: 'Student Data Editor',
      }),
      headers,
    });
    assert.isTrue(response.ok);
    updatePermissions(users, 'staff03@example.com', 'None', 'Student Data Editor');
    await checkPermissions(users);
  });

  test.sequential('can add course instance permission', async () => {
    let response = await helperClient.fetchCheerio(context.pageUrl, {
      headers,
    });
    assert.isTrue(response.ok);
    helperClient.extractAndSaveCSRFToken(
      context,
      response.$,
      'form[name=student-data-access-add-5]',
    );
    response = await helperClient.fetchCheerio(context.pageUrl, {
      method: 'POST',
      body: new URLSearchParams({
        __action: 'course_instance_permissions_insert',
        __csrf_token: context.__csrf_token,
        user_id: '5',
        course_instance_id: '1',
      }),
      headers,
    });
    assert.isTrue(response.ok);
    updatePermissions(users, 'staff05@example.com', 'None', 'Student Data Viewer');
    await checkPermissions(users);
  });

  test.sequential('can delete course instance permission', async () => {
    let response = await helperClient.fetchCheerio(context.pageUrl, { headers });
    assert.isTrue(response.ok);
    helperClient.extractAndSaveCSRFTokenFromDataContent(
      context,
      response.$,
      '#course-instance-permission-button-5-1',
    );
    response = await helperClient.fetchCheerio(context.pageUrl, {
      method: 'POST',
      body: new URLSearchParams({
        __action: 'course_instance_permissions_update_role_or_delete',
        __csrf_token: context.__csrf_token,
        user_id: '5',
        course_instance_id: '1',
      }),
      headers,
    });
    assert.isTrue(response.ok);
    updatePermissions(users, 'staff05@example.com', 'None', null);
    await checkPermissions(users);
  });

  test.sequential('can delete all course instance permissions', async () => {
    let response = await helperClient.fetchCheerio(context.pageUrl, {
      headers,
    });
    assert.isTrue(response.ok);
    helperClient.extractAndSaveCSRFTokenFromDataContent(
      context,
      response.$,
      'button[data-testid="remove-all-student-data-access-button"]',
    );
    response = await helperClient.fetchCheerio(context.pageUrl, {
      method: 'POST',
      body: new URLSearchParams({
        __action: 'remove_all_student_data_access',
        __csrf_token: context.__csrf_token,
      }),
      headers,
    });
    assert.isTrue(response.ok);
    updatePermissions(users, 'staff03@example.com', 'None', null);
    await checkPermissions(users);
  });

  test.sequential('can add course instance permission', async () => {
    let response = await helperClient.fetchCheerio(context.pageUrl, {
      headers,
    });
    assert.isTrue(response.ok);
    helperClient.extractAndSaveCSRFToken(
      context,
      response.$,
      'form[name=student-data-access-add-5]',
    );
    response = await helperClient.fetchCheerio(context.pageUrl, {
      method: 'POST',
      body: new URLSearchParams({
        __action: 'course_instance_permissions_insert',
        __csrf_token: context.__csrf_token,
        user_id: '5',
        course_instance_id: '1',
      }),
      headers,
    });
    assert.isTrue(response.ok);
    updatePermissions(users, 'staff05@example.com', 'None', 'Student Data Viewer');
    await checkPermissions(users);
  });

  test.sequential('can delete users with no access', async () => {
    let response = await helperClient.fetchCheerio(context.pageUrl, {
      headers,
    });
    assert.isTrue(response.ok);
    helperClient.extractAndSaveCSRFTokenFromDataContent(
      context,
      response.$,
      'button[data-testid="delete-users-with-no-access-button"]',
    );
    response = await helperClient.fetchCheerio(context.pageUrl, {
      method: 'POST',
      body: new URLSearchParams({
        __action: 'delete_no_access',
        __csrf_token: context.__csrf_token,
      }),
      headers,
    });
    assert.isTrue(response.ok);
    updatePermissions(users, 'staff03@example.com', null, null);
    updatePermissions(users, new_user, null, null);
    await checkPermissions(users);
  });

  test.sequential('can delete non-owners', async () => {
    let response = await helperClient.fetchCheerio(context.pageUrl, {
      headers,
    });
    assert.isTrue(response.ok);
    helperClient.extractAndSaveCSRFTokenFromDataContent(
      context,
      response.$,
      'button[data-testid="delete-non-owners-button"]',
    );
    response = await helperClient.fetchCheerio(context.pageUrl, {
      method: 'POST',
      body: new URLSearchParams({
        __action: 'delete_non_owners',
        __csrf_token: context.__csrf_token,
      }),
      headers,
    });
    assert.isTrue(response.ok);
    updatePermissions(users, 'staff05@example.com', null, null);
    await checkPermissions(users);
  });

  test.sequential('can change course role', async () => {
    let response = await helperClient.fetchCheerio(context.pageUrl, { headers });
    assert.isTrue(response.ok);
    helperClient.extractAndSaveCSRFTokenFromDataContent(
      context,
      response.$,
      '#course-permission-button-4',
    );
    response = await helperClient.fetchCheerio(context.pageUrl, {
      method: 'POST',
      body: new URLSearchParams({
        __action: 'course_permissions_update_role',
        __csrf_token: context.__csrf_token,
        user_id: '4',
        course_role: 'Editor',
      }),
      headers,
    });
    assert.isTrue(response.ok);
    updatePermissions(users, 'staff04@example.com', 'Editor', null);
    await checkPermissions(users);
  });

  test.sequential('cannot GET if not an owner', async () => {
    const headers = {
      cookie: 'pl_test_user=test_instructor; pl2_requested_uid=staff04@example.com',
    };
    const response = await helperClient.fetchCheerio(context.pageUrl, {
      headers,
    });
    assert.equal(response.status, 403);
  });
}

describe('course admin access page through course route', { timeout: 60_000 }, function () {
  const context: Record<string, any> = {};
  context.siteUrl = `http://localhost:${config.serverPort}`;
  context.baseUrl = `${context.siteUrl}/pl/course/1`;

  runTest(context);
});

describe(
  'course admin access page through course instance route',
  { timeout: 60_000 },
  function () {
    const context: Record<string, any> = {};
    context.siteUrl = `http://localhost:${config.serverPort}`;
    context.baseUrl = `${context.siteUrl}/pl/course_instance/1/instructor`;

    runTest(context);
  },
);
