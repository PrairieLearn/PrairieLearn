import { expect, test } from 'vitest';

import { parseStudentSyncCsv } from './student-sync.js';

const labels = [
  { id: '1', name: 'Section A' },
  { id: '2', name: 'Arts, "humanities"' },
];

test('parses spreadsheet CSV with BOM, CRLF, quoted punctuation, and repeated labels', async () => {
  const rows = await parseStudentSyncCsv(
    '\ufeffUID,label1,label2,label3\r\nstudent@example.com,Section A,"Arts, ""humanities""",Section A\r\n',
    labels,
  );
  expect(rows.get('student@example.com')).toEqual(['1', '2']);
});

test('distinguishes omitted label columns from empty cells', async () => {
  expect(
    (await parseStudentSyncCsv('uid\na@example.com', labels)).get('a@example.com'),
  ).toBeUndefined();
  expect(
    await parseStudentSyncCsv(
      'uid,label1,label2\na@example.com,,\nb@example.com,,Section A',
      labels,
    ),
  ).toEqual(
    new Map([
      ['a@example.com', []],
      ['b@example.com', ['1']],
    ]),
  );
});

test.each([
  ['uid,label1,label1\na@example.com,,', 'headers'],
  ['email,label1\na@example.com,Section A', 'headers'],
  ['uid,name\na@example.com,Adam', 'headers'],
  ['uid,label0\na@example.com,Section A', 'headers'],
  ['uid\na@example.com\na@example.com', 'more than once'],
  ['uid\ninvalid', 'valid student UID'],
  ['uid,label1\na@example.com,Unknown', 'unknown label'],
  ['uid,label1\na@example.com,section a', 'unknown label'],
  ['uid,label1\na@example.com', 'Invalid CSV'],
  ['uid,label1\na@example.com,"unterminated', 'Invalid CSV'],
  ['uid,label1', 'at least one student'],
])('rejects invalid CSV: %s', async (text, message) => {
  await expect(parseStudentSyncCsv(text, labels)).rejects.toThrow(message);
});

test('enforces the existing student limit', async () => {
  const text =
    'uid\n' + Array.from({ length: 5001 }, (_, i) => `student${i}@example.com`).join('\n');
  await expect(parseStudentSyncCsv(text, labels)).rejects.toThrow('5,000');
});
