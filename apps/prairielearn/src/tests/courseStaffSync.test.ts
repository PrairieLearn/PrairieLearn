import { setTimeout } from 'node:timers/promises';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { z } from 'zod';

import { loadSqlEquiv, queryScalar, runInTransactionAsync } from '@prairielearn/postgres';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { dangerousFullSystemAuthz } from '../lib/authz-data-lib.js';
import { config } from '../lib/config.js';
import { parseCourseStaffCsv } from '../lib/course-staff-csv.js';
import { selectCourseInstanceById } from '../models/course-instances.js';
import {
  insertCourseInstancePermissions,
  insertCoursePermissionsByUserUid,
  selectCourseUsers,
  updateCoursePermissionsRole,
} from '../models/course-permissions.js';
import {
  generateAndEnrollUsers,
  selectEnrollmentsForUsersInCourse,
  setEnrollmentStatus,
} from '../models/enrollment.js';
import { selectOptionalUserByUid } from '../models/user.js';
import { createCourseTrpcClient } from '../trpc/course/client.js';

import * as helperServer from './helperServer.js';

const sql = loadSqlEquiv(import.meta.url);

function createClient(instructor = false) {
  return createCourseTrpcClient({
    courseId: '1',
    urlBase: `http://localhost:${config.serverPort}`,
    csrfToken: generatePrefixCsrfToken(
      { url: '/pl/course/1/trpc', authn_user_id: instructor ? '2' : '1' },
      config.secretKey,
    ),
    ...(instructor ? { extraHeaders: { cookie: 'pl_test_user=test_instructor' } } : {}),
  });
}

describe('Course staff CSV preview', { concurrent: false }, () => {
  beforeAll(helperServer.before());
  beforeAll(async () => {
    await insertCoursePermissionsByUserUid({
      course_id: '1',
      uid: 'instructor@example.com',
      course_role: 'Viewer',
      authn_user_id: '1',
    });
  });
  afterAll(helperServer.after);

  test('previews additions and updates without changing staff', async () => {
    const before = await selectCourseUsers({ course_id: '1' });
    const instance = await selectCourseInstanceById('1');
    const result = await createClient().courseStaff.preview.mutate({
      text: `uid,course,${instance.short_name}\ninstructor@example.com,Editor,Viewer\nnew-staff@example.com,None,None`,
    });
    expect(result.summary).toEqual({ add: 1, update: 1, remove: 0, unchanged: 0 });
    expect(result.rows).toMatchObject([
      {
        action: 'update',
        courseRole: 'Editor',
        courseInstanceChanges: [{ courseInstanceId: '1', role: 'Student Data Viewer' }],
      },
      { action: 'add', expected: null },
    ]);
    expect(await selectCourseUsers({ course_id: '1' })).toEqual(before);
  });

  test.each([
    ['uid,course\na,Invalid', 'invalid permission'],
    ['uid,course,Unknown\na,None,None', 'Unknown or inaccessible'],
  ])('returns a bad request for invalid CSV %s', async (text, message) => {
    await expect(createClient().courseStaff.preview.mutate({ text })).rejects.toMatchObject({
      data: { code: 'BAD_REQUEST' },
      message: expect.stringContaining(message),
    });
  });

  test('rejects preview requests from staff without Owner access', async () => {
    await expect(
      createClient(true).courseStaff.preview.mutate({ text: 'uid,course\na,None' }),
    ).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } });
  });

  test('staff with Viewer access can export even though they cannot import', async () => {
    const result = await createClient(true).courseStaff.export.query();
    expect(result.filename).toBe('course-staff.csv');
    const csv = await parseCourseStaffCsv(result.text);
    expect(csv.operations).toMatchObject([
      { uid: 'instructor@example.com', action: 'update', courseRole: 'Viewer' },
    ]);
  });

  test('exporting and reimporting the same permissions produces no changes', async () => {
    await insertCourseInstancePermissions({
      course_id: '1',
      course_instance_id: '1',
      user_id: '2',
      course_instance_role: 'Student Data Editor',
      authn_user_id: '1',
    });
    const client = createClient();
    const before = await selectCourseUsers({ course_id: '1' });
    const exported = await client.courseStaff.export.query();
    expect(exported.text).toContain('Student Data Editor');
    const preview = await client.courseStaff.preview.mutate({ text: exported.text });
    expect(preview.summary).toEqual({ add: 0, update: 0, remove: 0, unchanged: before.length });
    expect(await selectCourseUsers({ course_id: '1' })).toEqual(before);
  });

  test('allows an Owner to preview unchanged own access but rejects changing or removing it', async () => {
    await updateCoursePermissionsRole({
      course_id: '1',
      user_id: '2',
      course_role: 'Owner',
      authn_user_id: '1',
    });
    const client = createClient(true);
    expect(
      (
        await client.courseStaff.preview.mutate({
          text: 'uid,course\ninstructor@example.com,Owner',
        })
      ).summary.unchanged,
    ).toBe(1);
    for (const text of [
      'uid,course\ninstructor@example.com,Viewer',
      'uid,course\ninstructor@example.com,',
    ]) {
      await expect(client.courseStaff.preview.mutate({ text })).rejects.toMatchObject({
        data: { code: 'FORBIDDEN' },
        message: expect.stringContaining('Only administrators can'),
      });
    }
  });

  test('previews enrollment deletion only for removed staff, including instances omitted from the CSV', async () => {
    const [removed, kept] = await generateAndEnrollUsers({ count: 2, course_instance_id: '1' });
    for (const user of [removed, kept]) {
      await insertCoursePermissionsByUserUid({
        course_id: '1',
        uid: user.uid,
        course_role: 'Viewer',
        authn_user_id: '1',
      });
    }
    const before = await selectEnrollmentsForUsersInCourse({
      courseId: '1',
      userIds: [removed.id, kept.id],
    });
    const instance = await selectCourseInstanceById('1');
    const result = await createClient().courseStaff.preview.mutate({
      text: `uid,course\n${removed.uid},\n${kept.uid},None`,
    });
    const enrollment = before.find((row) => row.enrollment.user_id === removed.id)!.enrollment;
    expect(result.removalEnrollments).toEqual([
      {
        enrollmentId: enrollment.id,
        userId: removed.id,
        courseInstanceId: '1',
        shortName: instance.short_name,
        instanceDeleted: false,
        status: 'joined',
      },
    ]);
    expect(
      await selectEnrollmentsForUsersInCourse({ courseId: '1', userIds: [removed.id, kept.id] }),
    ).toEqual(before);
    const updateOnly = await createClient().courseStaff.preview.mutate({
      text: `uid,course\n${removed.uid},None`,
    });
    expect(updateOnly.removalEnrollments).toEqual([]);
  });

  test('confirms additions, exact role changes, and permission removal atomically', async () => {
    const client = createClient();
    const instance = await selectCourseInstanceById('1');
    const uid = 'csv-added@example.com';
    const text = `uid,course,${instance.short_name}\n${uid},Editor,Editor`;
    const preview = await client.courseStaff.preview.mutate({ text });
    expect(
      await client.courseStaff.sync.mutate({ text, confirmationToken: preview.confirmationToken }),
    ).toEqual({ add: 1, update: 0, remove: 0, unchanged: 0 });
    const added = (await client.courseStaff.list.query()).find((row) => row.user.uid === uid)!;
    expect(added.course_permission.course_role).toBe('Editor');
    expect(added.course_instance_roles).toMatchObject([
      { id: '1', course_instance_role: 'Student Data Editor' },
    ]);
    const reducedText = `uid,course,${instance.short_name}\n${uid},None,None`;
    const reduced = await client.courseStaff.preview.mutate({ text: reducedText });
    await client.courseStaff.sync.mutate({
      text: reducedText,
      confirmationToken: reduced.confirmationToken,
    });
    const kept = (await client.courseStaff.list.query()).find((row) => row.user.uid === uid)!;
    expect(kept.course_permission.course_role).toBe('None');
    expect(kept.course_instance_roles).toBeNull();
  });

  test('refuses tampered confirmation tokens and a different CSV', async () => {
    const client = createClient();
    const text = 'uid,course\ntoken-test@example.com,None';
    const preview = await client.courseStaff.preview.mutate({ text });
    for (const input of [
      { text, confirmationToken: `invalid${preview.confirmationToken}` },
      { text: text.replace('None', 'Owner'), confirmationToken: preview.confirmationToken },
    ]) {
      await expect(client.courseStaff.sync.mutate(input)).rejects.toMatchObject({
        data: { code: 'BAD_REQUEST' },
      });
    }
  });

  test('rejects stale permissions without applying any other CSV row', async () => {
    const client = createClient();
    const uid = 'csv-conflict@example.com';
    const user = await insertCoursePermissionsByUserUid({
      course_id: '1',
      uid,
      course_role: 'Viewer',
      authn_user_id: '1',
    });
    const text = `uid,course\nrollback@example.com,Editor\n${uid},None`;
    const preview = await client.courseStaff.preview.mutate({ text });
    await updateCoursePermissionsRole({
      course_id: '1',
      user_id: user.id,
      course_role: 'Editor',
      authn_user_id: '1',
    });
    await expect(
      client.courseStaff.sync.mutate({ text, confirmationToken: preview.confirmationToken }),
    ).rejects.toMatchObject({ data: { code: 'CONFLICT' } });
    const staff = await client.courseStaff.list.query();
    expect(staff.some((row) => row.user.uid === 'rollback@example.com')).toBe(false);
    expect(staff.find((row) => row.user.uid === uid)!.course_permission.course_role).toBe('Editor');
  });

  test('removes staff and their reviewed enrollments', async () => {
    const [user] = await generateAndEnrollUsers({ count: 1, course_instance_id: '1' });
    await insertCoursePermissionsByUserUid({
      course_id: '1',
      uid: user.uid,
      course_role: 'Viewer',
      authn_user_id: '1',
    });
    const client = createClient();
    const text = `uid,course\n${user.uid},`;
    const preview = await client.courseStaff.preview.mutate({ text });
    expect(preview.removalEnrollments).toHaveLength(1);
    await client.courseStaff.sync.mutate({ text, confirmationToken: preview.confirmationToken });
    expect((await client.courseStaff.list.query()).some((row) => row.user.id === user.id)).toBe(
      false,
    );
    expect(await selectEnrollmentsForUsersInCourse({ courseId: '1', userIds: [user.id] })).toEqual(
      [],
    );
  });

  test('rejects removal when enrollment status changes after preview', async () => {
    const [user] = await generateAndEnrollUsers({ count: 1, course_instance_id: '1' });
    await insertCoursePermissionsByUserUid({
      course_id: '1',
      uid: user.uid,
      course_role: 'Viewer',
      authn_user_id: '1',
    });
    const [{ enrollment }] = await selectEnrollmentsForUsersInCourse({
      courseId: '1',
      userIds: [user.id],
    });
    const client = createClient();
    const text = `uid,course\n${user.uid},`;
    const preview = await client.courseStaff.preview.mutate({ text });
    await setEnrollmentStatus({
      enrollment,
      status: 'blocked',
      requiredRole: ['System'],
      authzData: dangerousFullSystemAuthz(),
    });
    await expect(
      client.courseStaff.sync.mutate({ text, confirmationToken: preview.confirmationToken }),
    ).rejects.toMatchObject({ data: { code: 'CONFLICT' } });
    expect((await client.courseStaff.list.query()).some((row) => row.user.id === user.id)).toBe(
      true,
    );
    expect(
      (await selectEnrollmentsForUsersInCourse({ courseId: '1', userIds: [user.id] }))[0].enrollment
        .status,
    ).toBe('blocked');
  });

  test('preserves permissions for course instance columns omitted from confirmation', async () => {
    const client = createClient();
    const user = await insertCoursePermissionsByUserUid({
      course_id: '1',
      uid: 'omitted@example.com',
      course_role: 'Editor',
      authn_user_id: '1',
    });
    await insertCourseInstancePermissions({
      course_id: '1',
      user_id: user.id,
      course_instance_id: '1',
      course_instance_role: 'Student Data Editor',
      authn_user_id: '1',
    });
    const text = 'uid,course\nomitted@example.com,Viewer';
    const preview = await client.courseStaff.preview.mutate({ text });
    await client.courseStaff.sync.mutate({ text, confirmationToken: preview.confirmationToken });
    expect(
      (await client.courseStaff.list.query()).find((row) => row.user.id === user.id),
    ).toMatchObject({
      course_permission: { course_role: 'Viewer' },
      course_instance_roles: [{ course_instance_role: 'Student Data Editor' }],
    });
  });

  test('rolls back earlier writes when a concurrent permission change invalidates confirmation', async () => {
    const client = createClient();
    const user = await insertCoursePermissionsByUserUid({
      course_id: '1',
      uid: 'concurrent@example.com',
      course_role: 'Viewer',
      authn_user_id: '1',
    });
    const text = 'uid,course\nconcurrent@example.com,None\nconcurrent-rollback@example.com,Editor';
    const preview = await client.courseStaff.preview.mutate({ text });
    const confirmation = await runInTransactionAsync(async () => {
      await updateCoursePermissionsRole({
        course_id: '1',
        user_id: user.id,
        course_role: 'Editor',
        authn_user_id: '1',
      });
      const pending = client.courseStaff.sync
        .mutate({ text, confirmationToken: preview.confirmationToken })
        .then(
          () => ({ ok: true }),
          (error: unknown) => ({ ok: false, error }),
        );
      // Release the competing write only after confirmation reaches its permission write.
      let blocked = false;
      for (let attempt = 0; attempt < 200; attempt++) {
        blocked = await queryScalar(sql.confirmation_waiting_on_current_transaction, z.boolean());
        if (blocked) break;
        await setTimeout(25);
      }
      expect(blocked).toBe(true);
      return { pending };
    });
    expect(await confirmation.pending).toMatchObject({
      ok: false,
      error: { data: { code: 'CONFLICT' } },
    });
    expect(await selectOptionalUserByUid('concurrent-rollback@example.com')).toBeNull();
    const staff = await client.courseStaff.list.query();
    expect(staff.find((row) => row.user.id === user.id)!.course_permission.course_role).toBe(
      'Editor',
    );
  });
});
