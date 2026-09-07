import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { buildCourseManifest, formatCourseContext } from './course-context.mjs';

const directories = [];

afterEach(async () => {
  await Promise.all(directories.map((path) => rm(path, { recursive: true, force: true })));
  directories.length = 0;
});

async function writeJson(root, path, value) {
  const destination = join(root, path);
  await mkdir(join(destination, '..'), { recursive: true });
  await writeFile(destination, JSON.stringify(value));
}

it('describes the active course instance and ranks relevant questions first', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pl-course-context-test-'));
  directories.push(root);
  await writeJson(root, 'infoCourse.json', {
    title: 'Data Structures',
    name: 'CS 225',
    topics: [{ name: 'Hash tables' }, { name: 'Trees' }],
    assessmentSets: [{ name: 'Homework' }],
  });
  await writeJson(root, 'courseInstances/Fa26/infoCourseInstance.json', {
    longName: 'Fall 2026',
  });
  await writeJson(root, 'courseInstances/Fa26/assessments/hw01/infoAssessment.json', {
    title: 'Homework 1',
    type: 'Homework',
    set: 'Homework',
    number: '1',
    zones: [],
  });
  await writeJson(root, 'courseInstances/Broken/assessments/hw02/infoAssessment.json', {
    title: 'Homework 2',
  });
  await writeJson(root, 'questions/hashTables/info.json', {
    title: 'Hash table operations',
    topic: 'Hash tables',
    type: 'v3',
  });
  await writeJson(root, 'questions/trees/info.json', {
    title: 'Tree traversal',
    topic: 'Trees',
    type: 'v3',
  });

  const manifest = await buildCourseManifest({
    courseRoot: root,
    authoringContext: {
      courseInstance: { id: '91', shortName: 'Fa26', longName: 'Fall 2026' },
    },
    request: 'Make an assessment about hash maps',
  });

  expect(manifest.activeCourseInstance).toMatchObject({
    id: '91',
    directory: 'Fa26',
    metadataStatus: 'valid',
    assessmentFormatExamplePath: 'courseInstances/Fa26/assessments/hw01/infoAssessment.json',
  });
  expect(manifest.questions.entries[0].qid).toBe('hashTables');
  expect(
    manifest.courseInstances.entries.find(({ directory }) => directory === 'Broken'),
  ).toMatchObject({ metadataStatus: 'missing' });
  expect(formatCourseContext(manifest)).toContain(
    'A new assessment requires string fields uuid, title, set, and number',
  );
});
