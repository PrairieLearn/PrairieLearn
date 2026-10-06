import { expect, test } from 'vitest';

import {
  COURSE_STAFF_CSV_MAX_BYTES,
  COURSE_STAFF_CSV_MAX_ROWS,
  parseCourseStaffCsv,
} from './course-staff-csv.js';

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
