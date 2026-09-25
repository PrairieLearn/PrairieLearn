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

  test('Editor with student data editor access cannot call any Staff mutation', async () => {
    const user = await createStaffUser('Editor');
    const target = await createStaffUser('Editor');
    const before = await getPermissions([user.id, target.id]);
    const trpc = createClient(user.id);

    await withUser(user, async () => {
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
        trpc.bulkEditAccess.mutate({
          userIds: [target.id],
          courseRole: 'Owner',
          courseInstanceChanges: [{ courseInstanceId: '1', courseInstanceRole: 'None' }],
        }),
      ).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } });
    });
    expect(await getPermissions([user.id, target.id])).toEqual(before);
  });

  test('administrator of another institution retains Owner restrictions', async () => {
    const user = await createStaffUser('Owner');
    const owner = await createStaffUser('Owner');
    const editor = await createStaffUser('Editor');
    await ensureInstitutionAdministrator({
      institution_id: otherInstitutionId,
      user_id: user.id,
      authn_user_id: '1',
    });
    const userIds = [user.id, owner.id, editor.id];
    const before = await getPermissions(userIds);
    const trpc = createClient(user.id);

    await withUser(user, async () => {
      await expect(
        trpc.updateCourseRole.mutate({ userId: user.id, courseRole: 'Editor' }),
      ).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } });
      await expect(trpc.deleteUser.mutate({ userId: owner.id })).rejects.toMatchObject({
        data: { code: 'FORBIDDEN' },
      });
      await expect(
        trpc.bulkEditAccess.mutate({ userIds: [editor.id, user.id], courseRole: 'Viewer' }),
      ).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } });
      await expect(
        trpc.bulkDelete.mutate({ userIds: [editor.id, owner.id] }),
      ).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } });
    });
    expect(await getPermissions(userIds)).toEqual(before);
  });

  test('institution admin can remove their own Owner entry', async () => {
    // The admin's home institution differs from the course's institution.
    const admin = await createStaffUser('Owner');
    await ensureInstitutionAdministrator({
      institution_id: '1',
      user_id: admin.id,
      authn_user_id: '1',
    });
    await withUser(admin, () => createClient(admin.id).deleteUser.mutate({ userId: admin.id }));
    expect(await getPermissions([admin.id])).toEqual([]);
  });

  test.each(['authenticated', 'effective'] as const)(
    'no administrative powers when only the %s user is an institution admin',
    async (adminUser) => {
      const owner = await createStaffUser('Owner');
      const admin = await createStaffUser('Owner');
      await ensureInstitutionAdministrator({
        institution_id: '1',
        user_id: adminUser === 'authenticated' ? owner.id : admin.id,
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
    },
  );
});
