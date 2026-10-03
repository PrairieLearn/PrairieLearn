import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { execa } from 'execa';
import { afterAll, beforeAll, expect, it } from 'vitest';

import { pullAndUpdateCourse, selectCourseHasSyncErrors } from '../lib/course.js';
import { TEST_COURSE_PATH } from '../lib/paths.js';
import { selectCourseById } from '../models/course.js';

import {
  type CourseRepoFixture,
  createCourseRepoFixture,
  updateCourseRepository,
} from './helperCourse.js';
import * as helperServer from './helperServer.js';

let repository: CourseRepoFixture;
beforeAll(async () => {
  repository = await createCourseRepoFixture(TEST_COURSE_PATH);
  await helperServer.before(repository.courseLiveDir)();
  await updateCourseRepository({ courseId: '1', repository: repository.courseOriginDir });
});
afterAll(helperServer.after);
it('syncs a descendant of the approved commit and persists the exact synced SHA', async () => {
  const base = (await execa('git', ['rev-parse', 'HEAD'], { cwd: repository.courseOriginDir }))
    .stdout;
  await writeFile(join(repository.courseOriginDir, 'agent-test.txt'), 'Approved content\n');
  await execa('git', ['add', 'agent-test.txt'], { cwd: repository.courseOriginDir });
  await execa('git', ['commit', '-m', 'Approved test change'], { cwd: repository.courseOriginDir });
  const head = (await execa('git', ['rev-parse', 'HEAD'], { cwd: repository.courseOriginDir }))
    .stdout;
  let savedJob: string | undefined;
  let savedSha: string | undefined;
  const job = await pullAndUpdateCourse({
    course: await selectCourseById('1'),
    userId: '1',
    authnUserId: '1',
    expectedAncestorSha: base,
    onJobCreated: async (id) => {
      savedJob = id;
    },
    onSynced: async (sha) => {
      savedSha = sha;
    },
  });
  await job.jobPromise;
  expect((await helperServer.waitForJobSequence(job.jobSequenceId)).status).toBe('Success');
  expect(savedJob).toBe(job.jobSequenceId);
  expect(savedSha).toBe(head);
  expect((await selectCourseById('1')).commit_hash).toBe(head);
});
it('rejects a missing approved commit before resetting local files or reporting sync success', async () => {
  const path = join(repository.courseLiveDir, 'keep-until-validated.txt');
  await writeFile(path, 'Keep me');
  let savedSha: string | undefined;
  const job = await pullAndUpdateCourse({
    course: await selectCourseById('1'),
    userId: '1',
    authnUserId: '1',
    expectedAncestorSha: 'f'.repeat(40),
    onSynced: async (sha) => {
      savedSha = sha;
    },
  });
  await job.jobPromise;
  expect((await helperServer.waitForJobSequence(job.jobSequenceId)).status).toBe('Error');
  expect(savedSha).toBeUndefined();
  expect(await readFile(path, 'utf8')).toBe('Keep me');
});

it('identifies partial validation failure and restores the database after syncing a compensating commit', async () => {
  const baseline = await selectCourseById('1');
  const courseFile = join(repository.courseOriginDir, 'infoCourse.json');
  const instanceFile = join(
    repository.courseOriginDir,
    'courseInstances/Sp15/infoCourseInstance.json',
  );
  const originalCourse = await readFile(courseFile, 'utf8');
  const originalInstance = await readFile(instanceFile, 'utf8');
  await writeFile(
    courseFile,
    JSON.stringify({ ...JSON.parse(originalCourse), title: 'Partially synced agent change' }),
  );
  await writeFile(instanceFile, '{ invalid JSON');
  await execa('git', ['add', '-A'], { cwd: repository.courseOriginDir });
  await execa('git', ['commit', '-m', 'Invalid instance and valid course change'], {
    cwd: repository.courseOriginDir,
  });
  const published = (await execa('git', ['rev-parse', 'HEAD'], { cwd: repository.courseOriginDir }))
    .stdout;
  let validationFailed = false;
  let confirmedSha: string | undefined;
  const invalidSync = await pullAndUpdateCourse({
    course: baseline,
    userId: '1',
    authnUserId: '1',
    expectedAncestorSha: published,
    onValidationFailure: async () => {
      validationFailed = true;
    },
    onSynced: async (sha) => {
      confirmedSha = sha;
    },
  });
  await invalidSync.jobPromise;
  expect((await helperServer.waitForJobSequence(invalidSync.jobSequenceId)).status).toBe('Error');
  expect(validationFailed).toBe(true);
  expect(confirmedSha).toBeUndefined();
  expect((await selectCourseById('1')).title).toBe('Partially synced agent change');
  expect((await selectCourseById('1')).sync_errors).toBeNull();
  expect((await selectCourseHasSyncErrors('1')).has_errors).toBe(true);
  await writeFile(courseFile, originalCourse);
  await writeFile(instanceFile, originalInstance);
  await execa('git', ['add', '-A'], { cwd: repository.courseOriginDir });
  await execa('git', ['commit', '-m', 'Compensating course-agent rollback'], {
    cwd: repository.courseOriginDir,
  });
  const reverted = (await execa('git', ['rev-parse', 'HEAD'], { cwd: repository.courseOriginDir }))
    .stdout;
  const restoredSync = await pullAndUpdateCourse({
    course: await selectCourseById('1'),
    userId: '1',
    authnUserId: '1',
    expectedAncestorSha: reverted,
    onSynced: async (sha) => {
      confirmedSha = sha;
    },
  });
  await restoredSync.jobPromise;
  expect((await helperServer.waitForJobSequence(restoredSync.jobSequenceId)).status).toBe(
    'Success',
  );
  expect(confirmedSha).toBe(reverted);
  const restored = await selectCourseById('1');
  expect(restored.title).toBe(baseline.title);
  expect(restored.commit_hash).toBe(reverted);
  expect(restored.sync_errors).toBeNull();
  expect((await selectCourseHasSyncErrors('1')).has_errors).toBe(false);
});
