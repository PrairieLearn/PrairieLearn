import superjson from 'superjson';
import { afterAll, assert, beforeAll, describe, expect, test } from 'vitest';
import z from 'zod';

import * as sqldb from '@prairielearn/postgres';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';
import { getAppError } from '@prairielearn/trpc/client';

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
import {
  insertCourseInstancePermissions,
  insertCoursePermissionsByUserUid,
} from '../../models/course-permissions.js';
import { createCourseTrpcClient } from '../../trpc/course/client.js';
import type { CourseStaffError } from '../../trpc/course/course-staff.js';
import * as helperClient from '../helperClient.js';
import * as helperServer from '../helperServer.js';
import { getOrCreateUser, withUser } from '../utils/auth.js';

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
  courseInstanceId,
}: { authnUserId?: string; cookie?: string; courseInstanceId?: string } = {}) {
  const siteUrl = `http://localhost:${config.serverPort}`;
  const csrfToken = generatePrefixCsrfToken(
    { url: getCourseTrpcUrl('1', courseInstanceId), authn_user_id: authnUserId },
    config.secretKey,
  );
  return createCourseTrpcClient({
    csrfToken,
    courseId: '1',
    courseInstanceId,
    urlBase: siteUrl,
    extraHeaders: { cookie },
  });
}

function expectSafeStaffUsers(rows: { user: Record<string, unknown> }[]) {
  for (const { user } of rows) {
    expect(Object.keys(user).sort()).toEqual([
      'email',
      'id',
      'institution_id',
      'name',
      'uid',
      'uin',
    ]);
  }
  expect(rows.find(({ user }) => user.uid === 'instructor@example.com')).toMatchObject({
    user: { name: 'Instructor User', uin: '100000000' },
  });
}

function expectSafeStaffPage(response: Awaited<ReturnType<typeof helperClient.fetchCheerio>>) {
  const props = superjson.parse<{ courseUsers: { user: Record<string, unknown> }[] }>(
    response.$('script[data-component-props][data-component="StaffTable"]').text(),
  );
  expectSafeStaffUsers(props.courseUsers);
}

function runTest(context: TestContext) {
  context.pageUrl = `${context.baseUrl}/course_admin/staff`;
  context.userId = '2';
  const createClient = (options: Parameters<typeof createTrpcClient>[0] = {}) =>
    createTrpcClient({
      courseInstanceId: context.baseUrl.includes('/course_instance/') ? '1' : undefined,
      ...options,
    });

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

  test('permissions should match', async () => {
    await checkPermissions(users);
  });

  test('can add multiple users', async () => {
    const trpc = createClient();
    await trpc.courseStaff.insertByUserUids.mutate({
      uids: ['staff03@example.com', 'staff04@example.com'],
      courseRole: 'Viewer',
    });
    updatePermissions(users, 'staff03@example.com', 'Viewer', null);
    updatePermissions(users, 'staff04@example.com', 'Viewer', null);
    await checkPermissions(users);
  });

  test('can add valid subset of multiple users', async () => {
    const trpc = createClient();
    await trpc.courseStaff.insertByUserUids.mutate({
      uids: ['staff03@example.com', 'staff05@example.com', new_user],
      courseRole: 'None',
    });
    updatePermissions(users, 'staff05@example.com', 'None', null);
    updatePermissions(users, new_user, 'None', null);
    await checkPermissions(users);
  });

  test('can add course instance permission', async () => {
    const trpc = createClient();
    await trpc.courseStaff.updateInstanceRole.mutate({
      userId: '3',
      courseInstanceId: '1',
      courseInstanceRole: 'Student Data Viewer',
    });
    updatePermissions(users, 'staff03@example.com', 'Viewer', 'Student Data Viewer');
    await checkPermissions(users);
  });

  test('can delete user', async () => {
    const trpc = createClient();
    await trpc.courseStaff.deleteUser.mutate({ userId: '3' });
    updatePermissions(users, 'staff03@example.com', null, null);
    await checkPermissions(users);
  });

  test('cannot delete self', async () => {
    const trpc = createClient();
    try {
      await trpc.courseStaff.deleteUser.mutate({ userId: context.userId });
      assert.fail('Expected FORBIDDEN error');
    } catch (err) {
      const appError = getAppError<CourseStaffError['DeleteUser']>(err);
      assert.isNotNull(appError);
      assert.include(appError.message, 'Only administrators can');
    }
    await checkPermissions(users);
  });

  test('can change course role', async () => {
    const trpc = createClient();
    await trpc.courseStaff.updateCourseRole.mutate({
      userId: '4',
      courseRole: 'Owner',
    });
    updatePermissions(users, 'staff04@example.com', 'Owner', null);
    await checkPermissions(users);
  });

  test('cannot change course role of self', async () => {
    const trpc = createClient();
    try {
      await trpc.courseStaff.updateCourseRole.mutate({
        userId: context.userId,
        courseRole: 'None',
      });
      assert.fail('Expected FORBIDDEN error');
    } catch (err) {
      const appError = getAppError<CourseStaffError['UpdateCourseRole']>(err);
      assert.isNotNull(appError);
      assert.include(appError.message, 'Only administrators can');
    }
    await checkPermissions(users);
  });

  test('cannot delete self even when emulating another owner', async () => {
    const trpc = createClient({
      cookie: 'pl_test_user=test_instructor; pl2_requested_uid=staff04@example.com',
    });
    try {
      await trpc.courseStaff.deleteUser.mutate({ userId: context.userId });
      assert.fail('Expected FORBIDDEN error');
    } catch (err) {
      const appError = getAppError<CourseStaffError['DeleteUser']>(err);
      assert.isNotNull(appError);
      assert.include(appError.message, 'while emulating');
    }
    await checkPermissions(users);
  });

  test('cannot change course role of self even when emulating another owner', async () => {
    const trpc = createClient({
      cookie: 'pl_test_user=test_instructor; pl2_requested_uid=staff04@example.com',
    });
    try {
      await trpc.courseStaff.updateCourseRole.mutate({
        userId: context.userId,
        courseRole: 'None',
      });
      assert.fail('Expected FORBIDDEN error');
    } catch (err) {
      const appError = getAppError<CourseStaffError['UpdateCourseRole']>(err);
      assert.isNotNull(appError);
      assert.include(appError.message, 'while emulating');
    }
    await checkPermissions(users);
  });

  test('can change instance role of self', async () => {
    const trpc = createClient();
    await trpc.courseStaff.updateInstanceRole.mutate({
      userId: context.userId,
      courseInstanceId: '1',
      courseInstanceRole: 'Student Data Viewer',
    });
    updatePermissions(users, 'instructor@example.com', 'Owner', 'Student Data Viewer');
    await checkPermissions(users);
  });

  test('can change instance role of self when emulating another owner', async () => {
    const trpc = createClient({
      cookie: 'pl_test_user=test_instructor; pl2_requested_uid=staff04@example.com',
    });
    await trpc.courseStaff.updateInstanceRole.mutate({
      userId: context.userId,
      courseInstanceId: '1',
      courseInstanceRole: 'Student Data Viewer',
    });
    updatePermissions(users, 'instructor@example.com', 'Owner', 'Student Data Viewer');
    await checkPermissions(users);
  });

  test('can revert own instance role after emulation test', async () => {
    const trpc = createClient();
    await trpc.courseStaff.updateInstanceRole.mutate({
      userId: context.userId,
      courseInstanceId: '1',
      courseInstanceRole: 'None',
    });
    updatePermissions(users, 'instructor@example.com', 'Owner', null);
    await checkPermissions(users);
  });

  test('can add user', async () => {
    const trpc = createClient();
    await trpc.courseStaff.insertByUserUids.mutate({
      uids: ['staff03@example.com'],
      courseRole: 'None',
    });
    updatePermissions(users, 'staff03@example.com', 'None', null);
    await checkPermissions(users);
  });

  test('can add course instance permission', async () => {
    const trpc = createClient();
    await trpc.courseStaff.updateInstanceRole.mutate({
      userId: '3',
      courseInstanceId: '1',
      courseInstanceRole: 'Student Data Viewer',
    });
    updatePermissions(users, 'staff03@example.com', 'None', 'Student Data Viewer');
    await checkPermissions(users);
  });

  test('can update course instance permission', async () => {
    const trpc = createClient();
    await trpc.courseStaff.updateInstanceRole.mutate({
      userId: '3',
      courseInstanceId: '1',
      courseInstanceRole: 'Student Data Editor',
    });
    updatePermissions(users, 'staff03@example.com', 'None', 'Student Data Editor');
    await checkPermissions(users);
  });

  test('can add course instance permission for another user', async () => {
    const trpc = createClient();
    await trpc.courseStaff.updateInstanceRole.mutate({
      userId: '5',
      courseInstanceId: '1',
      courseInstanceRole: 'Student Data Viewer',
    });
    updatePermissions(users, 'staff05@example.com', 'None', 'Student Data Viewer');
    await checkPermissions(users);
  });

  test('can delete course instance permission', async () => {
    const trpc = createClient();
    await trpc.courseStaff.updateInstanceRole.mutate({
      userId: '5',
      courseInstanceId: '1',
      courseInstanceRole: 'None',
    });
    updatePermissions(users, 'staff05@example.com', 'None', null);
    await checkPermissions(users);
  });

  test('can bulk edit student data access', async () => {
    const trpc = createClient();
    await trpc.courseStaff.bulkEditAccess.mutate({
      userIds: ['3', '5'],
      courseInstanceChanges: [{ courseInstanceId: '1', courseInstanceRole: 'None' }],
    });
    updatePermissions(users, 'staff03@example.com', 'None', null);
    await checkPermissions(users);
  });

  test('can bulk edit own instance role', async () => {
    const trpc = createClient();
    await trpc.courseStaff.bulkEditAccess.mutate({
      userIds: [context.userId],
      courseInstanceChanges: [{ courseInstanceId: '1', courseInstanceRole: 'Student Data Viewer' }],
    });
    updatePermissions(users, 'instructor@example.com', 'Owner', 'Student Data Viewer');
    await checkPermissions(users);
  });

  test('can bulk edit own instance role back to None', async () => {
    const trpc = createClient();
    await trpc.courseStaff.bulkEditAccess.mutate({
      userIds: [context.userId],
      courseInstanceChanges: [{ courseInstanceId: '1', courseInstanceRole: 'None' }],
    });
    updatePermissions(users, 'instructor@example.com', 'Owner', null);
    await checkPermissions(users);
  });

  test('can add back course instance permission', async () => {
    const trpc = createClient();
    await trpc.courseStaff.updateInstanceRole.mutate({
      userId: '5',
      courseInstanceId: '1',
      courseInstanceRole: 'Student Data Viewer',
    });
    updatePermissions(users, 'staff05@example.com', 'None', 'Student Data Viewer');
    await checkPermissions(users);
  });

  test('can delete users with no access', async () => {
    const trpc = createClient();
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

  test('can bulk delete non-owners via bulk delete', async () => {
    const trpc = createClient();
    await trpc.courseStaff.bulkDelete.mutate({ userIds: ['5'] });
    updatePermissions(users, 'staff05@example.com', null, null);
    await checkPermissions(users);
  });

  test('can change course role via bulk edit', async () => {
    const trpc = createClient();
    await trpc.courseStaff.bulkEditAccess.mutate({
      userIds: ['4'],
      courseRole: 'Editor',
    });
    updatePermissions(users, 'staff04@example.com', 'Editor', null);
    await checkPermissions(users);
  });

  test('can GET read-only staff page when not an owner', async () => {
    const response = await helperClient.fetchCheerio(context.pageUrl, {
      headers: {
        cookie: 'pl_test_user=test_instructor; pl2_requested_uid=staff04@example.com',
      },
    });
    assert.equal(response.status, 200);
    assert.notInclude(response.$('body').text(), 'Add users');
  });

  test('non-Owner staff can list safe user data but cannot edit', async () => {
    const courseInstanceId = context.baseUrl.includes('/course_instance/') ? '1' : undefined;
    const courseRole = courseInstanceId ? 'None' : 'Previewer';
    const user = await getOrCreateUser({
      uid: `readonly-${courseRole}@example.com`,
      name: 'Read-only staff',
      uin: null,
    });
    await insertCoursePermissionsByUserUid({
      course_id: '1',
      uid: user.uid,
      course_role: courseRole,
      authn_user_id: '1',
    });
    if (courseInstanceId) {
      await insertCourseInstancePermissions({
        course_id: '1',
        user_id: user.id,
        course_instance_id: courseInstanceId,
        course_instance_role: 'Student Data Viewer',
        authn_user_id: '1',
      });
    }
    await withUser(user, async () => {
      const response = await helperClient.fetchCheerio(context.pageUrl);
      expect(response.status).toBe(200);
      expectSafeStaffPage(response);
      const trpc = createClient({ authnUserId: user.id, cookie: '' });
      const staff = await trpc.courseStaff.list.query();
      expectSafeStaffUsers(staff);
      for (const mutation of [
        () =>
          trpc.courseStaff.insertByUserUids.mutate({
            uids: ['forbidden@example.com'],
            courseRole: 'Owner',
          }),
        () => trpc.courseStaff.updateCourseRole.mutate({ userId: '4', courseRole: 'Owner' }),
        () =>
          trpc.courseStaff.updateInstanceRole.mutate({
            userId: '4',
            courseInstanceId: '1',
            courseInstanceRole: 'Student Data Editor',
          }),
        () => trpc.courseStaff.deleteUser.mutate({ userId: '4' }),
        () => trpc.courseStaff.bulkDelete.mutate({ userIds: ['4'] }),
        () => trpc.courseStaff.bulkEditAccess.mutate({ userIds: ['4'], courseRole: 'Owner' }),
      ]) {
        await expect(mutation()).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } });
      }
      expect(await trpc.courseStaff.list.query()).toEqual(staff);
    });
  });

  test('users with no staff permissions cannot view the staff page or list', async () => {
    const user = await getOrCreateUser({
      uid: 'not-staff@example.com',
      name: 'Not staff',
      uin: null,
    });
    await insertCoursePermissionsByUserUid({
      course_id: '1',
      uid: user.uid,
      course_role: 'None',
      authn_user_id: '1',
    });
    await withUser(user, async () => {
      const response = await helperClient.fetchCheerio(context.pageUrl);
      expect(response.status).toBe(403);
      const trpc = createClient({ authnUserId: user.id, cookie: '' });
      await expect(trpc.courseStaff.list.query()).rejects.toMatchObject({
        data: { code: 'FORBIDDEN' },
      });
    });
  });
}

describe(
  'course admin access page through course route',
  { timeout: 60_000, concurrent: false },
  function () {
    const siteUrl = `http://localhost:${config.serverPort}`;

    runTest({
      siteUrl,
      baseUrl: `${siteUrl}/pl/course/1`,
    } as TestContext);
  },
);

describe(
  'course admin access page through course instance route',
  { timeout: 60_000, concurrent: false },
  function () {
    const siteUrl = `http://localhost:${config.serverPort}`;

    runTest({
      siteUrl,
      baseUrl: `${siteUrl}/pl/course_instance/1/instructor`,
    } as TestContext);
  },
);
