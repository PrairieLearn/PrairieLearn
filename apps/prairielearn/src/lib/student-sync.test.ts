import { expect, test } from 'vitest';

import { parseStudentSyncCsv } from './student-sync.js';

const labels = [
  { id: '1', name: 'Section A' },
  { id: '2', name: 'Arts, "humanities" | science' },
];

test('parses semicolon-separated labels with BOM, CRLF, punctuation, whitespace, and duplicates', async () => {
  const cell = ` ${labels[0].name}; ;${labels[1].name};${labels[0].name}; `.replaceAll('"', '""');
  const rows = await parseStudentSyncCsv(
    `\ufeffUID,labels\r\nstudent@example.com,"${cell}"\r\n`,
    labels,
  );
  expect(rows.get('student@example.com')).toEqual(['1', '2']);
});

test('distinguishes an omitted labels column from a blank cell or empty entries', async () => {
  expect(
    (await parseStudentSyncCsv('uid\na@example.com', labels)).get('a@example.com'),
  ).toBeUndefined();
  expect(
    await parseStudentSyncCsv('uid,labels\na@example.com,\nb@example.com, ; ; ', labels),
  ).toEqual(
    new Map([
      ['a@example.com', []],
      ['b@example.com', []],
    ]),
  );
});

test('treats a whitespace-only labels cell as clearing labels', async () => {
  expect(await parseStudentSyncCsv('uid,labels\na@example.com,"   "', labels)).toEqual(
    new Map([['a@example.com', []]]),
  );
});

test.each([
  ['uid,labels,labels\na@example.com,,', 'no duplicate'],
  ['email,labels\na@example.com,[]', 'header'],
  ['uid,name\na@example.com,Adam', 'header'],
  ['uid,label1\na@example.com,Section A', 'not supported'],
  ['uid\na@example.com\na@example.com', 'more than once'],
  ['uid\ninvalid', 'valid student UID'],
  ['uid,labels\na@example.com,Unknown', 'a@example.com: unknown label'],
  ['uid,labels\na@example.com,section a', 'a@example.com: unknown label'],
  ['uid,labels\na@example.com', 'Invalid CSV'],
  ['uid,labels', 'at least one student'],
])('rejects invalid CSV: %s', async (text, message) => {
  await expect(parseStudentSyncCsv(text, labels)).rejects.toThrow(message);
});

test('enforces the existing student limit', async () => {
  const text =
    'uid\n' + Array.from({ length: 5001 }, (_, i) => `student${i}@example.com`).join('\n');
  await expect(parseStudentSyncCsv(text, labels)).rejects.toThrow('5,000');
});
