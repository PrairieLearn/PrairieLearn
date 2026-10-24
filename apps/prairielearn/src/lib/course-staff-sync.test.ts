import { expect, test } from 'vitest';

import { AugmentedError, HttpStatusError } from '@prairielearn/error';

import { parseCourseStaffCsv } from './course-staff-csv.js';
import { computeCourseStaffSyncPreview } from './course-staff-sync.js';

const courseInstances = [
  { id: '10', short_name: 'Fa26' },
  { id: '20', short_name: 'Sp27' },
];
const staff = [
  {
    user: { id: '1', uid: 'viewer@example.com' },
    course_permission: { id: '100', course_role: 'Viewer' as const },
    course_instance_roles: [
      {
        id: '20',
        short_name: 'Sp27',
        course_instance_permission_id: '200',
        course_instance_role: 'Student Data Editor' as const,
        course_instance_role_formatted: 'Editor',
      },
    ],
  },
];

test('resolves names and reports exact role changes while preserving omitted instances', async () => {
  const preview = computeCourseStaffSyncPreview({
    csv: await parseCourseStaffCsv('uid,course,Fa26\nviewer@example.com,Editor,Viewer'),
    courseInstances,
    staff,
  });
  expect(preview).toEqual({
    courseInstances: [{ id: '10', shortName: 'Fa26' }],
    summary: { add: 0, update: 1, remove: 0, unchanged: 0 },
    rows: [
      {
        uid: 'viewer@example.com',
        line: 2,
        action: 'update',
        previousCourseRole: 'Viewer',
        courseRole: 'Editor',
        expected: {
          coursePermissionId: '100',
          userId: '1',
          courseRole: 'Viewer',
          courseInstanceRoles: [
            { courseInstanceId: '10', courseInstancePermissionId: null, role: null },
          ],
        },
        courseInstanceChanges: [
          {
            courseInstanceId: '10',
            shortName: 'Fa26',
            previousRole: 'None',
            role: 'Student Data Viewer',
          },
        ],
      },
    ],
  });
});

test('does not modify users absent from the CSV and adds staff even with no permissions', async () => {
  const preview = computeCourseStaffSyncPreview({
    csv: await parseCourseStaffCsv('uid,course\nnew@example.com,None'),
    courseInstances,
    staff,
  });
  expect(preview.rows).toEqual([
    {
      uid: 'new@example.com',
      line: 2,
      action: 'add',
      expected: null,
      previousCourseRole: null,
      courseRole: 'None',
      courseInstanceChanges: [],
    },
  ]);
});

test('reports no changes for equivalent existing permissions', async () => {
  const preview = computeCourseStaffSyncPreview({
    csv: await parseCourseStaffCsv('uid,course,Fa26,Sp27\nviewer@example.com,Viewer,None,Editor'),
    courseInstances,
    staff,
  });
  expect(preview.summary).toEqual({ add: 0, update: 0, remove: 0, unchanged: 1 });
  expect(preview.rows[0].action).toBe('unchanged');
});

test('reports reductions and explicit None as permission changes', async () => {
  const preview = computeCourseStaffSyncPreview({
    csv: await parseCourseStaffCsv('uid,course,Sp27\nviewer@example.com,None,None'),
    courseInstances,
    staff,
  });
  expect(preview.rows).toMatchObject([
    {
      action: 'update',
      courseRole: 'None',
      courseInstanceChanges: [
        { courseInstanceId: '20', previousRole: 'Student Data Editor', role: 'None' },
      ],
    },
  ]);
});

test('removal includes all existing instance permissions, even with omitted columns', async () => {
  const preview = computeCourseStaffSyncPreview({
    csv: await parseCourseStaffCsv('uid,course\nviewer@example.com,\nmissing@example.com,'),
    courseInstances,
    staff,
  });
  expect(preview.summary).toEqual({ add: 0, update: 0, remove: 1, unchanged: 1 });
  expect(preview.rows).toEqual([
    {
      uid: 'viewer@example.com',
      line: 2,
      action: 'remove',
      expected: {
        coursePermissionId: '100',
        userId: '1',
        courseRole: 'Viewer',
        courseInstanceRoles: [
          {
            courseInstanceId: '20',
            courseInstancePermissionId: '200',
            role: 'Student Data Editor',
          },
        ],
      },
    },
    { uid: 'missing@example.com', line: 3, action: 'unchanged', expected: null },
  ]);
});

test.each([
  ['Unknown', courseInstances, 'Unknown or inaccessible'],
  ['fa26', courseInstances, 'Unknown or inaccessible'],
])('rejects unresolved instance %s', async (name, instances, message) => {
  const csv = await parseCourseStaffCsv(`uid,course,${name}\nviewer@example.com,Viewer,None`);
  expect(() => computeCourseStaffSyncPreview({ csv, courseInstances: instances, staff })).toThrow(
    message,
  );
  expect(() => computeCourseStaffSyncPreview({ csv, courseInstances: instances, staff })).toThrow(
    HttpStatusError,
  );
});

test('treats duplicate database instance names as an internal consistency error', async () => {
  const csv = await parseCourseStaffCsv('uid,course,Fa26\nviewer@example.com,Viewer,None');
  const preview = () =>
    computeCourseStaffSyncPreview({
      csv,
      courseInstances: [...courseInstances, { id: '30', short_name: 'Fa26' }],
      staff,
    });
  expect(preview).toThrow(AugmentedError);
  expect(preview).not.toThrow(HttpStatusError);
  expect(preview).toThrow('Duplicate course instance short names found in database');
});

test('matches reordered CSV columns to the correct instances', async () => {
  const preview = computeCourseStaffSyncPreview({
    csv: await parseCourseStaffCsv('uid,course,Sp27,Fa26\nviewer@example.com,Viewer,Viewer,Editor'),
    courseInstances,
    staff,
  });
  expect(preview.rows).toMatchObject([
    {
      courseInstanceChanges: [
        { courseInstanceId: '20', role: 'Student Data Viewer' },
        { courseInstanceId: '10', role: 'Student Data Editor' },
      ],
      expected: { courseInstanceRoles: [{ courseInstanceId: '10' }, { courseInstanceId: '20' }] },
    },
  ]);
});
