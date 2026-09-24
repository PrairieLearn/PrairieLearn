import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { ensureInstitutionAdministrator } from '../../ee/models/institution-administrator.js';
import { getCourseTrpcUrl } from '../../lib/client/url.js';
import { config } from '../../lib/config.js';
import type { EnumCourseRole } from '../../lib/db-types.js';
import {
  insertCoursePermissionsByUserUid,
  selectCourseUsers,
  upsertCourseInstancePermissionsRole,
} from '../../models/course-permissions.js';
import { insertInstitution } from '../../models/institution.js';
import { createCourseTrpcClient } from '../../trpc/course/client.js';
import * as helperServer from '../helperServer.js';
import { getOrCreateUser, withUser } from '../utils/auth.js';

const siteUrl = `http://localhost:${config.serverPort}`;
let userNumber = 0;
let otherInstitutionId: string;

async function createStaffUser(courseRole: EnumCourseRole) {
  const user = await getOrCreateUser({
    name: `Staff ${++userNumber}`,
    uid: `staff-${userNumber}@other.example.edu`,
    uin: null,
    institutionId: otherInstitutionId,
  });
  await insertCoursePermissionsByUserUid({
    course_id: '1',
    uid: user.uid,
    course_role: courseRole,
    authn_user_id: '1',
  });
  await upsertCourseInstancePermissionsRole({
    course_id: '1',
    course_instance_id: '1',
    user_id: user.id,
    course_instance_role: 'Student Data Editor',
    authn_user_id: '1',
  });
  return user;
}

function createClient(userId: string, effectiveUid?: string) {
  return createCourseTrpcClient({
    courseId: '1',
    urlBase: siteUrl,
    csrfToken: generatePrefixCsrfToken(
      { url: getCourseTrpcUrl('1'), authn_user_id: userId },
      config.secretKey,
    ),
    extraHeaders: effectiveUid ? { cookie: `pl2_requested_uid=${effectiveUid}` } : undefined,
  }).courseStaff;
}

async function getPermissions(userIds: string[]) {
  return (await selectCourseUsers({ course_id: '1' })).filter((row) =>
    userIds.includes(row.user.id),
  );
}

describe('Staff authorization', { concurrent: false }, () => {
  beforeAll(helperServer.before());
  beforeAll(async () => {
    otherInstitutionId = await insertInstitution({
      shortName: 'Other',
      longName: 'Other institution',
      displayTimezone: 'America/Chicago',
      uidRegexp: '@other\\.example\\.edu$',
    });
  });
  afterAll(helperServer.after);

  test.each(['None', 'Previewer', 'Viewer', 'Editor'] as const)(
    '%s with student data editor access cannot open Staff or call any mutation',
    async (role) => {
      const user = await createStaffUser(role);
      const target = await createStaffUser('Editor');
      const before = await getPermissions([user.id, target.id]);
      const trpc = createClient(user.id);

      await withUser(user, async () => {
        for (const basePath of ['/pl/course/1', '/pl/course_instance/1/instructor']) {
          const response = await fetch(`${siteUrl}${basePath}/course_admin/staff`);
          expect(response.status).toBe(403);
        }
        await expect(trpc.list.query()).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } });
        await expect(
          trpc.insertByUserUids.mutate({ uids: [user.uid, target.uid], courseRole: 'Owner' }),
        ).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } });
        await expect(
          trpc.updateCourseRole.mutate({ userId: target.id, courseRole: 'Owner' }),
        ).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } });
        await expect(
          trpc.updateInstanceRole.mutate({
            userId: target.id,
            courseInstanceId: '1',
            courseInstanceRole: 'None',
          }),
        ).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } });
        await expect(trpc.deleteUser.mutate({ userId: target.id })).rejects.toMatchObject({
          data: { code: 'FORBIDDEN' },
        });
        await expect(trpc.bulkDelete.mutate({ userIds: [target.id] })).rejects.toMatchObject({
          data: { code: 'FORBIDDEN' },
        });
        await expect(
          trpc.bulkEditAccess.mutate({ userIds: [user.id, target.id], courseRole: 'Owner' }),
        ).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } });
        await expect(
          trpc.bulkEditAccess.mutate({
            userIds: [target.id],
            courseInstanceChanges: [{ courseInstanceId: '1', courseInstanceRole: 'None' }],
          }),
        ).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } });
      });
      expect(await getPermissions([user.id, target.id])).toEqual(before);
    },
  );

  test.each(['regular Owner', 'administrator of another institution'] as const)(
    '%s retains self-edit and Owner-removal restrictions',
    async (kind) => {
      const user = await createStaffUser('Owner');
      const owner = await createStaffUser('Owner');
      const editor = await createStaffUser('Editor');
      if (kind === 'administrator of another institution') {
        await ensureInstitutionAdministrator({
          institution_id: otherInstitutionId,
          user_id: user.id,
          authn_user_id: '1',
        });
      }
      const userIds = [user.id, owner.id, editor.id];
      const before = await getPermissions(userIds);
      const trpc = createClient(user.id);

      await withUser(user, async () => {
        await expect(
          trpc.updateCourseRole.mutate({ userId: user.id, courseRole: 'Editor' }),
        ).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } });
        await expect(trpc.deleteUser.mutate({ userId: user.id })).rejects.toMatchObject({
          data: { code: 'FORBIDDEN' },
        });
        await expect(trpc.deleteUser.mutate({ userId: owner.id })).rejects.toMatchObject({
          data: { code: 'FORBIDDEN' },
        });
        await expect(
          trpc.bulkEditAccess.mutate({ userIds: [editor.id, user.id], courseRole: 'Viewer' }),
        ).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } });
        await expect(
          trpc.bulkDelete.mutate({ userIds: [editor.id, owner.id] }),
        ).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } });
        await expect(
          trpc.bulkDelete.mutate({ userIds: [editor.id, user.id] }),
        ).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } });
      });
      expect(await getPermissions(userIds)).toEqual(before);
    },
  );

  test('institution admin can edit and remove themselves and Owners using single and bulk actions', async () => {
    // The admin's home institution differs from the course's institution.
    const admin = await createStaffUser('None');
    const owner = await createStaffUser('Owner');
    await ensureInstitutionAdministrator({
      institution_id: '1',
      user_id: admin.id,
      authn_user_id: '1',
    });
    const trpc = createClient(admin.id);

    await withUser(admin, async () => {
      for (const basePath of ['/pl/course/1', '/pl/course_instance/1/instructor']) {
        const response = await fetch(`${siteUrl}${basePath}/course_admin/staff`);
        expect(response.status).toBe(200);
      }
      await trpc.updateCourseRole.mutate({ userId: admin.id, courseRole: 'Editor' });
      expect((await getPermissions([admin.id]))[0].course_permission.course_role).toBe('Editor');
      await trpc.updateInstanceRole.mutate({
        userId: admin.id,
        courseInstanceId: '1',
        courseInstanceRole: 'None',
      });
      await trpc.bulkEditAccess.mutate({
        userIds: [admin.id, owner.id],
        courseRole: 'Viewer',
        courseInstanceChanges: [
          { courseInstanceId: '1', courseInstanceRole: 'Student Data Viewer' },
        ],
      });
      for (const row of await getPermissions([admin.id, owner.id])) {
        expect(row.course_permission.course_role).toBe('Viewer');
        expect(row.course_instance_roles).toContainEqual(
          expect.objectContaining({
            id: '1',
            course_instance_role: 'Student Data Viewer',
          }),
        );
      }
      await trpc.updateCourseRole.mutate({ userId: owner.id, courseRole: 'Owner' });
      await trpc.deleteUser.mutate({ userId: owner.id });
      await trpc.deleteUser.mutate({ userId: admin.id });
      expect(await getPermissions([admin.id, owner.id])).toEqual([]);

      await trpc.insertByUserUids.mutate({ uids: [admin.uid, owner.uid], courseRole: 'Owner' });
      await trpc.bulkDelete.mutate({ userIds: [admin.id, owner.id] });
      expect(await getPermissions([admin.id, owner.id])).toEqual([]);
    });
  });

  test('emulating an institution admin does not give a regular Owner administrative powers', async () => {
    const owner = await createStaffUser('Owner');
    const admin = await createStaffUser('Owner');
    await ensureInstitutionAdministrator({
      institution_id: '1',
      user_id: admin.id,
      authn_user_id: '1',
    });
    const trpc = createClient(owner.id, admin.uid);
    const before = await getPermissions([owner.id, admin.id]);
    await withUser(owner, async () => {
      await expect(
        trpc.updateCourseRole.mutate({ userId: owner.id, courseRole: 'Editor' }),
      ).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } });
      await expect(trpc.deleteUser.mutate({ userId: admin.id })).rejects.toMatchObject({
        data: { code: 'FORBIDDEN' },
      });
    });
    expect(await getPermissions([owner.id, admin.id])).toEqual(before);
  });
});
