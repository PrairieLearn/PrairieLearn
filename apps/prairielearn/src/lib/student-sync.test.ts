import { expect, test } from 'vitest';

import { parseStudentSyncCsv } from './student-sync.js';

const labels = [
  { id: '1', name: 'Section A' },
  { id: '2', name: 'Arts, "humanities"; science|math' },
];

test('parses JSON label arrays with BOM, CRLF, punctuation, and repeated labels', async () => {
  const cell = JSON.stringify([labels[0].name, labels[1].name, labels[0].name]).replaceAll(
    '"',
    '""',
  );
  const rows = await parseStudentSyncCsv(
    `\ufeffUID,labels\r\nstudent@example.com,"${cell}"\r\n`,
    labels,
  );
  expect(rows.get('student@example.com')).toEqual(['1', '2']);
});

test('distinguishes an omitted labels column from a blank cell or empty array', async () => {
  expect(
    (await parseStudentSyncCsv('uid\na@example.com', labels)).get('a@example.com'),
  ).toBeUndefined();
  expect(await parseStudentSyncCsv('uid,labels\na@example.com,\nb@example.com,[]', labels)).toEqual(
    new Map([
      ['a@example.com', []],
      ['b@example.com', []],
    ]),
  );
});

test('accepts reordered headers', async () => {
  expect(await parseStudentSyncCsv('labels,uid\n"[""Section A""]",a@example.com', labels)).toEqual(
    new Map([['a@example.com', ['1']]]),
  );
});

test.each([
  ['uid,labels,labels\na@example.com,,', 'no duplicate'],
  ['email,labels\na@example.com,[]', 'header'],
  ['uid,name\na@example.com,Adam', 'header'],
  ['uid,label1\na@example.com,Section A', 'not supported'],
  ['uid\na@example.com\na@example.com', 'more than once'],
  ['uid\ninvalid', 'valid student UID'],
  ['uid,labels\na@example.com,"[""Unknown""]"', 'unknown label'],
  ['uid,labels\na@example.com,"[""section a""]"', 'unknown label'],
  ['uid,labels\na@example.com', 'Invalid CSV'],
  ['uid,labels\na@example.com,"unterminated', 'Invalid CSV'],
  ['uid,labels', 'at least one student'],
])('rejects invalid CSV: %s', async (text, message) => {
  await expect(parseStudentSyncCsv(text, labels)).rejects.toThrow(message);
});

test.each(['Section A;Extra time', '[', 'null', '{}', '1', '"Section A"', '[1]', '[null]', '[[]]'])(
  'rejects labels that are not a JSON string array: %s',
  async (value) => {
    const cell = value.replaceAll('"', '""');
    await expect(
      parseStudentSyncCsv(`uid,labels\na@example.com,"${cell}"`, labels),
    ).rejects.toThrow('Row ending on line 2: labels must be a JSON array');
  },
);

test('enforces the existing student limit', async () => {
  const text =
    'uid\n' + Array.from({ length: 5001 }, (_, i) => `student${i}@example.com`).join('\n');
  await expect(parseStudentSyncCsv(text, labels)).rejects.toThrow('5,000');
});
