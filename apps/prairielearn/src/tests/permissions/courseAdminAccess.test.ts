import { afterAll, assert, beforeAll, describe, test } from 'vitest';
import z from 'zod';

import * as sqldb from '@prairielearn/postgres';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { getAppError } from '../../lib/client/errors.js';
import { getCourseTrpcUrl } from '../../lib/client/url.js';
import { config } from '../../lib/config.js';
import {
  CourseInstancePermissionSchema,
  CoursePermissionSchema,
  type EnumCourseInstanceRole,
  type EnumCourseRole,
  SprocUsersSelectOrInsertSchema,
  UserSchema,
} from '../../lib/db-types.js';
import { insertCoursePermissionsByUserUid } from '../../models/course-permissions.js';
import { createCourseTrpcClient } from '../../trpc/course/client.js';
import type { CourseStaffError } from '../../trpc/course/course-staff.js';
import * as helperClient from '../helperClient.js';
import * as helperServer from '../helperServer.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

interface TestUser {
  uid: string;
  name?: string;
  uin?: string | null;
  email?: string;
  cr?: EnumCourseRole | null;
  cir?: EnumCourseInstanceRole | null;
}

async function checkPermissions(users: TestUser[]) {
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

function updatePermissions(
  users: TestUser[],
  uid: string,
  cr: EnumCourseRole | null,
  cir: EnumCourseInstanceRole | null,
) {
  let user = users.find((user) => user.uid === uid);
  if (!user) {
    user = { uid };
    users.push(user);
  }
  user.cr = cr;
  user.cir = cir;
}

interface TestContext {
  siteUrl: string;
  baseUrl: string;
  pageUrl: string;
  userId: string;
}

function createTrpcClient({
  authnUserId = '2',
  cookie = 'pl_test_user=test_instructor',
}: { authnUserId?: string; cookie?: string } = {}) {
  const siteUrl = `http://localhost:${config.serverPort}`;
  const csrfToken = generatePrefixCsrfToken(
    { url: getCourseTrpcUrl('1'), authn_user_id: authnUserId },
    config.secretKey,
  );
  return createCourseTrpcClient({
    csrfToken,
    courseId: '1',
    urlBase: siteUrl,
    extraHeaders: { cookie },
  });
}

function runTest(context: TestContext) {
  context.pageUrl = `${context.baseUrl}/course_admin/staff`;
  context.userId = '2';

  const users: TestUser[] = [
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
    for (const user of users) {
      await sqldb.callRow(
        'users_select_or_insert',
        [user.uid, user.name, user.uin, user.email, 'Shibboleth'],
        SprocUsersSelectOrInsertSchema,
      );
    }

    await insertCoursePermissionsByUserUid({
      course_id: '1',
      uid: 'instructor@example.com',
      course_role: 'Owner',
      authn_user_id: '1',
    });
    const new_user_uid = await sqldb.queryOptionalScalar(sql.select_non_existent_user, z.string());
    if (new_user_uid) new_user = new_user_uid;
  });

  afterAll(helperServer.after);

  test.sequential('permissions should match', async () => {
    await checkPermissions(users);
  });

  test.sequential('can add multiple users', async () => {
    const trpc = createTrpcClient();
    await trpc.courseStaff.insertByUserUids.mutate({
      uids: ['staff03@example.com', 'staff04@example.com'],
      courseRole: 'Viewer',
    });
    updatePermissions(users, 'staff03@example.com', 'Viewer', null);
    updatePermissions(users, 'staff04@example.com', 'Viewer', null);
    await checkPermissions(users);
  });

  test.sequential('can add valid subset of multiple users', async () => {
    const trpc = createTrpcClient();
    await trpc.courseStaff.insertByUserUids.mutate({
      uids: ['staff03@example.com', 'staff05@example.com', new_user],
      courseRole: 'None',
    });
    updatePermissions(users, 'staff05@example.com', 'None', null);
    updatePermissions(users, new_user, 'None', null);
    await checkPermissions(users);
  });

  test.sequential('can add course instance permission', async () => {
    const trpc = createTrpcClient();
    await trpc.courseStaff.updateInstanceRole.mutate({
      userId: '3',
      courseInstanceId: '1',
      courseInstanceRole: 'Student Data Viewer',
    });
    updatePermissions(users, 'staff03@example.com', 'Viewer', 'Student Data Viewer');
    await checkPermissions(users);
  });

  test.sequential('can delete user', async () => {
    const trpc = createTrpcClient();
    await trpc.courseStaff.deleteUser.mutate({ userId: '3' });
    updatePermissions(users, 'staff03@example.com', null, null);
    await checkPermissions(users);
  });

  test.sequential('cannot delete self', async () => {
    const trpc = createTrpcClient();
    try {
      await trpc.courseStaff.deleteUser.mutate({ userId: context.userId });
      assert.fail('Expected FORBIDDEN error');
    } catch (err) {
      const appError = getAppError<CourseStaffError>(err);
      assert.isNotNull(appError);
      assert.include(appError.message, 'Only administrators can');
    }
    await checkPermissions(users);
  });

  test.sequential('can change course role', async () => {
    const trpc = createTrpcClient();
    await trpc.courseStaff.updateCourseRole.mutate({
      userId: '4',
      courseRole: 'Owner',
    });
    updatePermissions(users, 'staff04@example.com', 'Owner', null);
    await checkPermissions(users);
  });

  test.sequential('cannot change course role of self', async () => {
    const trpc = createTrpcClient();
    try {
      await trpc.courseStaff.updateCourseRole.mutate({
        userId: context.userId,
        courseRole: 'None',
      });
      assert.fail('Expected FORBIDDEN error');
    } catch (err) {
      const appError = getAppError<CourseStaffError>(err);
      assert.isNotNull(appError);
      assert.include(appError.message, 'Only administrators can');
    }
    await checkPermissions(users);
  });

  test.sequential('cannot delete self even when emulating another owner', async () => {
    const trpc = createTrpcClient({
      cookie: 'pl_test_user=test_instructor; pl2_requested_uid=staff04@example.com',
    });
    try {
      await trpc.courseStaff.deleteUser.mutate({ userId: context.userId });
      assert.fail('Expected FORBIDDEN error');
    } catch (err) {
      const appError = getAppError<CourseStaffError>(err);
      assert.isNotNull(appError);
      assert.include(appError.message, 'while emulating');
    }
    await checkPermissions(users);
  });

  test.sequential(
    'cannot change course role of self even when emulating another owner',
    async () => {
      const trpc = createTrpcClient({
        cookie: 'pl_test_user=test_instructor; pl2_requested_uid=staff04@example.com',
      });
      try {
        await trpc.courseStaff.updateCourseRole.mutate({
          userId: context.userId,
          courseRole: 'None',
        });
        assert.fail('Expected FORBIDDEN error');
      } catch (err) {
        const appError = getAppError<CourseStaffError>(err);
        assert.isNotNull(appError);
        assert.include(appError.message, 'while emulating');
      }
      await checkPermissions(users);
    },
  );

  test.sequential('cannot change instance role of self', async () => {
    const trpc = createTrpcClient();
    try {
      await trpc.courseStaff.updateInstanceRole.mutate({
        userId: context.userId,
        courseInstanceId: '1',
        courseInstanceRole: 'Student Data Viewer',
      });
      assert.fail('Expected FORBIDDEN error');
    } catch (err) {
      const appError = getAppError<CourseStaffError>(err);
      assert.isNotNull(appError);
      assert.include(appError.message, 'Only administrators can');
    }
    await checkPermissions(users);
  });

  test.sequential(
    'cannot change instance role of self even when emulating another owner',
    async () => {
      const trpc = createTrpcClient({
        cookie: 'pl_test_user=test_instructor; pl2_requested_uid=staff04@example.com',
      });
      try {
        await trpc.courseStaff.updateInstanceRole.mutate({
          userId: context.userId,
          courseInstanceId: '1',
          courseInstanceRole: 'Student Data Viewer',
        });
        assert.fail('Expected FORBIDDEN error');
      } catch (err) {
        const appError = getAppError<CourseStaffError>(err);
        assert.isNotNull(appError);
        assert.include(appError.message, 'while emulating');
      }
      await checkPermissions(users);
    },
  );

  test.sequential('can add user', async () => {
    const trpc = createTrpcClient();
    await trpc.courseStaff.insertByUserUids.mutate({
      uids: ['staff03@example.com'],
      courseRole: 'None',
    });
    updatePermissions(users, 'staff03@example.com', 'None', null);
    await checkPermissions(users);
  });

  test.sequential('can add course instance permission', async () => {
    const trpc = createTrpcClient();
    await trpc.courseStaff.updateInstanceRole.mutate({
      userId: '3',
      courseInstanceId: '1',
      courseInstanceRole: 'Student Data Viewer',
    });
    updatePermissions(users, 'staff03@example.com', 'None', 'Student Data Viewer');
    await checkPermissions(users);
  });

  test.sequential('can update course instance permission', async () => {
    const trpc = createTrpcClient();
    await trpc.courseStaff.updateInstanceRole.mutate({
      userId: '3',
      courseInstanceId: '1',
      courseInstanceRole: 'Student Data Editor',
    });
    updatePermissions(users, 'staff03@example.com', 'None', 'Student Data Editor');
    await checkPermissions(users);
  });

  test.sequential('can add course instance permission for another user', async () => {
    const trpc = createTrpcClient();
    await trpc.courseStaff.updateInstanceRole.mutate({
      userId: '5',
      courseInstanceId: '1',
      courseInstanceRole: 'Student Data Viewer',
    });
    updatePermissions(users, 'staff05@example.com', 'None', 'Student Data Viewer');
    await checkPermissions(users);
  });

  test.sequential('can delete course instance permission', async () => {
    const trpc = createTrpcClient();
    await trpc.courseStaff.updateInstanceRole.mutate({
      userId: '5',
      courseInstanceId: '1',
      courseInstanceRole: 'None',
    });
    updatePermissions(users, 'staff05@example.com', 'None', null);
    await checkPermissions(users);
  });

  test.sequential('can bulk edit student data access', async () => {
    const trpc = createTrpcClient();
    await trpc.courseStaff.bulkEditAccess.mutate({
      userIds: ['3', '5'],
      courseInstanceChanges: [{ courseInstanceId: '1', courseInstanceRole: 'None' }],
    });
    updatePermissions(users, 'staff03@example.com', 'None', null);
    await checkPermissions(users);
  });

  test.sequential('can add back course instance permission', async () => {
    const trpc = createTrpcClient();
    await trpc.courseStaff.updateInstanceRole.mutate({
      userId: '5',
      courseInstanceId: '1',
      courseInstanceRole: 'Student Data Viewer',
    });
    updatePermissions(users, 'staff05@example.com', 'None', 'Student Data Viewer');
    await checkPermissions(users);
  });

  test.sequential('can delete users with no access', async () => {
    const trpc = createTrpcClient();
    await trpc.courseStaff.deleteUser.mutate({ userId: '3' });
    updatePermissions(users, 'staff03@example.com', null, null);

    const newUserRow = await sqldb.queryRow(
      'SELECT id FROM users WHERE uid = $1;',
      [new_user],
      z.object({ id: z.string() }),
    );
    await trpc.courseStaff.deleteUser.mutate({ userId: newUserRow.id });
    updatePermissions(users, new_user, null, null);
    await checkPermissions(users);
  });

  test.sequential('can bulk delete non-owners via bulk delete', async () => {
    const trpc = createTrpcClient();
    await trpc.courseStaff.bulkDelete.mutate({ userIds: ['5'] });
    updatePermissions(users, 'staff05@example.com', null, null);
    await checkPermissions(users);
  });

  test.sequential('can change course role via bulk edit', async () => {
    const trpc = createTrpcClient();
    await trpc.courseStaff.bulkEditAccess.mutate({
      userIds: ['4'],
      courseRole: 'Editor',
    });
    updatePermissions(users, 'staff04@example.com', 'Editor', null);
    await checkPermissions(users);
  });

  test.sequential('cannot GET if not an owner', async () => {
    const response = await helperClient.fetchCheerio(context.pageUrl, {
      headers: {
        cookie: 'pl_test_user=test_instructor; pl2_requested_uid=staff04@example.com',
      },
    });
    assert.equal(response.status, 403);
  });
}

describe('course admin access page through course route', { timeout: 60_000 }, function () {
  const siteUrl = `http://localhost:${config.serverPort}`;

  runTest({
    siteUrl,
    baseUrl: `${siteUrl}/pl/course/1`,
  } as TestContext);
});

describe(
  'course admin access page through course instance route',
  { timeout: 60_000 },
  function () {
    const siteUrl = `http://localhost:${config.serverPort}`;

    runTest({
      siteUrl,
      baseUrl: `${siteUrl}/pl/course_instance/1/instructor`,
    } as TestContext);
  },
);
