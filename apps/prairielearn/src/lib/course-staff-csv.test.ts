import { expect, test } from 'vitest';

import {
  COURSE_STAFF_CSV_MAX_BYTES,
  COURSE_STAFF_CSV_MAX_ROWS,
  parseCourseStaffCsv,
  stringifyCourseStaffCsv,
} from './course-staff-csv.js';

test('exports complete roles, explicit None, and only supplied instances in deterministic order', async () => {
  const text = await stringifyCourseStaffCsv({
    courseInstances: [
      { id: '20', short_name: 'Sp27' },
      { id: '10', short_name: 'Fa26' },
    ],
    staff: [
      {
        user: { uid: 'z@example.com' },
        course_permission: { course_role: null },
        course_instance_roles: null,
      },
      {
        user: { uid: 'a@example.com' },
        course_permission: { course_role: 'Owner' },
        course_instance_roles: [
          { id: '10', course_instance_role: 'Student Data Editor' },
          { id: '99', course_instance_role: 'Student Data Viewer' },
        ],
      },
    ],
  });
  expect(text).toBe(
    'uid,course,Fa26,Sp27\na@example.com,Owner,Student Data Editor,None\nz@example.com,None,None,None\n',
  );
  expect((await parseCourseStaffCsv(text)).operations.map((row) => row.action)).toEqual([
    'update',
    'update',
  ]);
});

test('exports quoted names and a course instance named course with importable positional headers', async () => {
  const text = await stringifyCourseStaffCsv({
    courseInstances: [
      { id: '10', short_name: 'course' },
      { id: '20', short_name: 'Spring, "2027"' },
    ],
    staff: [
      {
        user: { uid: 'a@example.com' },
        course_permission: { course_role: 'Viewer' },
        course_instance_roles: [],
      },
    ],
  });
  const parsed = await parseCourseStaffCsv(text);
  expect(parsed.courseInstanceNames).toEqual(['course', 'Spring, "2027"']);
  expect(parsed.operations).toMatchObject([
    {
      action: 'update',
      courseRole: 'Viewer',
      courseInstanceRoles: [
        { shortName: 'course', role: 'None' },
        { shortName: 'Spring, "2027"', role: 'None' },
      ],
    },
  ]);
});

test('exports an empty roster as a header-only file', async () => {
  expect(await stringifyCourseStaffCsv({ courseInstances: [], staff: [] })).toBe('uid,course\n');
});

test('rejects inconsistent duplicate instance names during export', async () => {
  await expect(
    stringifyCourseStaffCsv({
      courseInstances: [
        { id: '10', short_name: 'Fa26' },
        { id: '20', short_name: 'Fa26' },
      ],
      staff: [],
    }),
  ).rejects.toThrow('Duplicate course instance short names');
});

test('preserves instance names and normalizes aliases in spreadsheet CSV', async () => {
  expect(
    await parseCourseStaffCsv(
      '\ufeffuid,course,Fa26,"Spring, ""2027"""\r\n staff-123 , Owner , Editor , Student Data Viewer \r\n',
    ),
  ).toEqual({
    courseInstanceNames: ['Fa26', 'Spring, "2027"'],
    operations: [
      {
        action: 'update',
        uid: 'staff-123',
        line: 2,
        courseRole: 'Owner',
        courseInstanceRoles: [
          { shortName: 'Fa26', role: 'Student Data Editor' },
          { shortName: 'Spring, "2027"', role: 'Student Data Viewer' },
        ],
      },
    ],
  });
});

test('distinguishes removal from keeping staff without permissions', async () => {
  expect(
    await parseCourseStaffCsv(
      'uid,course,Fa26\nremove@example.com, , \nkeep@example.com,None,None',
    ),
  ).toEqual({
    courseInstanceNames: ['Fa26'],
    operations: [
      { action: 'remove', uid: 'remove@example.com', line: 2 },
      {
        action: 'update',
        uid: 'keep@example.com',
        line: 3,
        courseRole: 'None',
        courseInstanceRoles: [{ shortName: 'Fa26', role: 'None' }],
      },
    ],
  });
});

test('allows omitted instances and a course instance named course', async () => {
  expect(await parseCourseStaffCsv('uid,course\na,Viewer\nb,')).toEqual({
    courseInstanceNames: [],
    operations: [
      { action: 'update', uid: 'a', line: 2, courseRole: 'Viewer', courseInstanceRoles: [] },
      { action: 'remove', uid: 'b', line: 3 },
    ],
  });
  expect((await parseCourseStaffCsv('uid,course,course\na,Previewer,Viewer')).operations).toEqual([
    {
      action: 'update',
      uid: 'a',
      line: 2,
      courseRole: 'Previewer',
      courseInstanceRoles: [{ shortName: 'course', role: 'Student Data Viewer' }],
    },
  ]);
});

test.each(['None', 'Previewer', 'Viewer', 'Editor', 'Owner'])(
  'accepts course role %s',
  async (role) => {
    expect((await parseCourseStaffCsv(`uid,course\na,${role}`)).operations).toMatchObject([
      { courseRole: role },
    ]);
  },
);

test.each([
  ['Viewer', 'Student Data Viewer'],
  ['Editor', 'Student Data Editor'],
  ['Student Data Viewer', 'Student Data Viewer'],
  ['Student Data Editor', 'Student Data Editor'],
  ['None', 'None'],
])('accepts instance role %s', async (value, role) => {
  expect((await parseCourseStaffCsv(`uid,course,Fa26\na,None,${value}`)).operations).toMatchObject([
    { courseInstanceRoles: [{ role }] },
  ]);
});

test.each([
  ['course,uid\nOwner,a', 'headers uid,course'],
  ['uid\na', 'headers uid,course'],
  ['uid,course,\na,None,None', 'nonempty and unique'],
  ['uid,course,Fa26,Fa26\na,None,None,None', 'nonempty and unique'],
  ['uid,course\n,Owner', 'enter a staff UID'],
  ['uid,course\na,Owner\n a ,Viewer', 'appears more than once'],
  ['uid,course,Fa26\na,Owner,', 'column 3 (Fa26)'],
  ['uid,course,Fa26\na,,Viewer', 'column 2 (course)'],
  ['uid,course\na,Student Data Editor', 'invalid permission'],
  ['uid,course,Fa26\na,Owner,Owner', 'invalid permission'],
  ['uid,course,Fa26\na,Owner,viewer', 'invalid permission'],
  ['uid,course\na', 'Invalid CSV'],
  ['uid,course\na,Owner,Viewer', 'Invalid CSV'],
  ['uid,course\na,"unterminated', 'Invalid CSV'],
  ['uid,course', 'at least one staff user'],
  ['', 'at least one staff user'],
])('rejects invalid CSV: %s', async (text, message) => {
  await expect(parseCourseStaffCsv(text)).rejects.toThrow(message);
});

test('reports physical lines for quoted multiline records and blank lines', async () => {
  const result = await parseCourseStaffCsv('uid,course,"Spring\n2027"\n\na,Editor,None');
  expect(result.courseInstanceNames).toEqual(['Spring\n2027']);
  expect(result.operations).toMatchObject([{ line: 4 }]);
});

test('accepts the row limit and rejects one additional staff user', async () => {
  const text =
    'uid,course\n' +
    Array.from({ length: COURSE_STAFF_CSV_MAX_ROWS }, (_, i) => `staff${i},None`).join('\n');
  expect((await parseCourseStaffCsv(text)).operations).toHaveLength(COURSE_STAFF_CSV_MAX_ROWS);
  await expect(parseCourseStaffCsv(text + '\nextra,None')).rejects.toThrow('5,000');
});

test('bounds UTF-8 byte size rather than character count', async () => {
  await expect(parseCourseStaffCsv('é'.repeat(COURSE_STAFF_CSV_MAX_BYTES / 2 + 1))).rejects.toThrow(
    '1 MiB',
  );
});
