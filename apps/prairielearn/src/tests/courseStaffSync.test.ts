import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { config } from '../lib/config.js';
import { parseCourseStaffCsv } from '../lib/course-staff-csv.js';
import { selectCourseInstanceById } from '../models/course-instances.js';
import {
  insertCourseInstancePermissions,
  insertCoursePermissionsByUserUid,
  selectCourseUsers,
  updateCoursePermissionsRole,
} from '../models/course-permissions.js';
import { createCourseTrpcClient } from '../trpc/course/client.js';

import * as helperServer from './helperServer.js';

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
});
