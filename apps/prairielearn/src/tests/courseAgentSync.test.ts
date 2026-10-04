import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { execa } from 'execa';
import { afterAll, beforeAll, expect, it } from 'vitest';

import { pullAndUpdateCourse } from '../lib/course.js';
import { TEST_COURSE_PATH } from '../lib/paths.js';
import { selectJobsByJobSequenceId } from '../lib/server-jobs.js';
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

it('retains the published commit and reports course-content validation through Course Sync', async () => {
  const path = join(repository.courseOriginDir, 'infoCourse.json');
  await writeFile(path, '{invalid JSON');
  await execa('git', ['add', 'infoCourse.json'], { cwd: repository.courseOriginDir });
  await execa('git', ['commit', '-m', 'Published invalid course content'], {
    cwd: repository.courseOriginDir,
  });
  const publishedSha = (
    await execa('git', ['rev-parse', 'HEAD'], { cwd: repository.courseOriginDir })
  ).stdout;
  let validationFailed = false;
  let savedSha: string | undefined;
  const job = await pullAndUpdateCourse({
    course: await selectCourseById('1'),
    userId: '1',
    authnUserId: '1',
    expectedAncestorSha: publishedSha,
    onValidationFailure: async () => {
      validationFailed = true;
    },
    onSynced: async (sha) => {
      savedSha = sha;
    },
  });
  await job.jobPromise;
  expect((await helperServer.waitForJobSequence(job.jobSequenceId)).status).toBe('Error');
  expect(validationFailed).toBe(true);
  expect(savedSha).toBeUndefined();
  expect((await selectCourseById('1')).sync_errors).toContain('Error parsing JSON');
  expect(
    (await selectJobsByJobSequenceId(job.jobSequenceId)).map((job) => job.output).join('\n'),
  ).toContain('infoCourse.json');
  expect(
    (await execa('git', ['rev-parse', 'HEAD'], { cwd: repository.courseOriginDir })).stdout,
  ).toBe(publishedSha);
  expect(
    (await execa('git', ['rev-parse', 'HEAD'], { cwd: repository.courseLiveDir })).stdout,
  ).toBe(publishedSha);
  expect(await readFile(join(repository.courseLiveDir, 'infoCourse.json'), 'utf8')).toBe(
    '{invalid JSON',
  );
});
