import os from 'node:os';
import path from 'node:path';

import { execa } from 'execa';
import fs from 'fs-extra';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { ReviewSnapshot } from '@prairielearn/course-agent-types';

import { updateChunksForCourse } from '../../../lib/chunks.js';
import { config } from '../../../lib/config.js';
import type { Course, User } from '../../../lib/db-types.js';
import type { ServerJob } from '../../../lib/server-jobs.js';
import * as courseModel from '../../../models/course.js';
import {
  checkSharingConfigurationValid,
  syncDiskToSqlWithLock,
} from '../../../sync/syncFromDisk.js';

import { createReviewDiff } from './review-diff.js';
import { ReviewedChangesEditor } from './reviewed-changes-editor.js';

vi.hoisted(() => vi.resetModules());
vi.mock('@prairielearn/named-locks', () => ({
  doWithLock: async (_name: string, _options: unknown, fn: () => Promise<void>) => fn(),
}));
vi.mock('../../../models/course.js', async (importOriginal) => ({
  ...(await importOriginal<typeof courseModel>()),
  getOrUpdateCourseCommitHash: (course: Course) => courseModel.getCourseCommitHash(course.path),
  updateCourseCommitHash: vi.fn(),
}));
vi.mock('../../../sync/course-db.js', () => ({ loadFullCourse: vi.fn(async () => ({})) }));
vi.mock('../../../sync/syncFromDisk.js', () => ({
  checkSharingConfigurationValid: vi.fn(async () => true),
  syncDiskToSqlWithLock: vi.fn(async () => ({
    status: 'complete',
    hadJsonErrors: false,
    courseData: {},
  })),
}));
vi.mock('../../../lib/chunks.js', () => ({
  updateChunksForCourse: vi.fn(async () => []),
  logChunkChangesToJob: vi.fn(),
}));

let directory: string;
let course: Course;
let snapshot: ReviewSnapshot;
let job: ServerJob;
const user = { id: '2', uid: 'instructor@example.com', name: 'Instructor', email: null } as User;

async function git(...args: string[]) {
  return (await execa('git', args, { cwd: course.path })).stdout;
}

async function advanceRemote() {
  const commit = await git(
    '--git-dir',
    course.repository!,
    '-c',
    'user.name=Other instructor',
    '-c',
    'user.email=other@example.com',
    'commit-tree',
    `${snapshot.baseCommit}^{tree}`,
    '-p',
    snapshot.baseCommit,
    '-m',
    'Concurrent edit',
  );
  await git('--git-dir', course.repository!, 'update-ref', 'refs/heads/master', commit);
  return commit;
}

function execute() {
  const editor = new ReviewedChangesEditor({
    course,
    user,
    authzData: { has_course_permission_edit: true, authn_user: user },
    snapshot,
  });
  return editor.executeWithJob(job, { expectedBaseCommit: snapshot.baseCommit });
}

beforeEach(async () => {
  vi.clearAllMocks();
  config.fileEditorUseGit = true;
  config.chunksGenerator = true;
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'pl-reviewed-edits-'));
  course = {
    id: '1',
    path: path.join(directory, 'checkout'),
    repository: path.join(directory, 'remote.git'),
    branch: 'master',
    example_course: false,
  } as Course;
  await fs.ensureDir(course.path);
  await git('init', '--bare', '--initial-branch=master', course.repository!);
  await git('init', '--initial-branch=master');
  await fs.writeFile(path.join(course.path, 'question.html'), 'Original\n');
  await fs.writeFile(path.join(course.path, 'old.txt'), 'Delete me\n');
  await git('add', '.');
  await git(
    '-c',
    'user.name=Instructor',
    '-c',
    'user.email=instructor@example.com',
    'commit',
    '-m',
    'Initial',
  );
  await git('remote', 'add', 'origin', course.repository!);
  await git('push', '--set-upstream', 'origin', 'master');
  snapshot = {
    repository: 'PrairieLearn/course',
    branch: 'master',
    baseCommit: await git('rev-parse', 'HEAD'),
    additions: [
      { path: 'question.html', contents: Buffer.from('Reviewed\n').toString('base64') },
      { path: 'new [file].bin', contents: Buffer.from([0, 255, 1]).toString('base64') },
    ],
    deletions: [{ path: 'old.txt' }],
  };
  job = {
    data: {},
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    verbose: vi.fn(),
    fail: (message) => {
      throw new Error(message);
    },
    stop: (message) => {
      throw new Error(message);
    },
    exec: vi.fn(async (file, args, options) => {
      await execa(file, args, options);
      return { data: {} };
    }),
  };
});

afterEach(async () => {
  vi.mocked(checkSharingConfigurationValid).mockResolvedValue(true);
  config.chunksGenerator = false;
  await fs.remove(directory);
});

it('reviews immutable local blobs and publishes the saved bytes through the editor pipeline', async () => {
  await fs.writeFile(path.join(course.path, 'question.html'), 'Later working copy\n');
  await git('add', 'question.html');
  const index = await git('write-tree');
  const diff = await createReviewDiff(course, snapshot);
  expect(diff).toContain('-Original\n+Reviewed\n');
  expect(diff).toContain('Binary file new [file].bin: added');
  expect(await git('write-tree')).toBe(index);
  expect(await fs.readFile(path.join(course.path, 'question.html'), 'utf8')).toBe(
    'Later working copy\n',
  );

  await execute();
  const published = await git('--git-dir', course.repository!, 'rev-parse', 'master');
  expect(await git('--git-dir', course.repository!, 'show', `${published}:question.html`)).toBe(
    'Reviewed',
  );
  expect(await git('--git-dir', course.repository!, 'ls-tree', '--name-only', published)).toBe(
    'new [file].bin\nquestion.html',
  );
  expect(await fs.readFile(path.join(course.path, 'new [file].bin'))).toEqual(
    Buffer.from([0, 255, 1]),
  );
  expect(await fs.pathExists(path.join(course.path, 'old.txt'))).toBe(false);
  expect(job.data).toMatchObject({
    saveSucceeded: true,
    syncSucceeded: true,
    commitHash: published,
  });
  expect(updateChunksForCourse).toHaveBeenCalledWith(
    expect.objectContaining({ oldHash: snapshot.baseCommit, newHash: published }),
  );
});

it('fetches a missing review base without replacing working files or staging', async () => {
  snapshot.baseCommit = await advanceRemote();
  await fs.writeFile(path.join(course.path, 'question.html'), 'Working edit\n');
  await git('add', 'question.html');
  const index = await git('write-tree');
  expect(await createReviewDiff(course, snapshot)).toContain('-Original\n+Reviewed\n');
  expect(await git('write-tree')).toBe(index);
  expect(await fs.readFile(path.join(course.path, 'question.html'), 'utf8')).toBe('Working edit\n');
});

it('rejects a stale review before writing or syncing', async () => {
  const head = await advanceRemote();
  await expect(execute()).rejects.toThrow('The course branch changed');
  expect(await git('rev-parse', 'HEAD')).toBe(snapshot.baseCommit);
  expect(await git('--git-dir', course.repository!, 'rev-parse', 'master')).toBe(head);
  expect(syncDiskToSqlWithLock).not.toHaveBeenCalled();
});

it('does not reapply reviewed edits when another writer pushes during publication', async () => {
  const exec = job.exec.bind(job);
  let head: string;
  job.exec = async (file, args, options) => {
    if (args[0] === 'push') head = await advanceRemote();
    return exec(file, args, options);
  };
  await expect(execute()).rejects.toThrow();
  expect(await git('--git-dir', course.repository!, 'rev-parse', 'master')).toBe(head!);
  expect(await fs.readFile(path.join(course.path, 'question.html'), 'utf8')).toBe('Original\n');
  expect(job.data.saveSucceeded).toBeUndefined();
});

it('recognizes a successful push after its connection reports failure', async () => {
  const exec = job.exec.bind(job);
  job.exec = async (file, args, options) => {
    const result = await exec(file, args, options);
    if (args[0] === 'push') throw new Error('Connection lost after push');
    return result;
  };
  await execute();
  expect(job.data).toMatchObject({ saveSucceeded: true, syncSucceeded: true });
  expect(await git('--git-dir', course.repository!, 'rev-parse', 'master')).toBe(
    job.data.commitHash,
  );
});

it('leaves an unconfirmed push blocked without syncing or trying another publication', async () => {
  const exec = job.exec.bind(job);
  let pushed = false;
  job.exec = async (file, args, options) => {
    if (args[0] === 'push') {
      pushed = true;
      throw new Error('Connection lost');
    }
    if (pushed && args[0] === 'fetch') throw new Error('Remote unavailable');
    return exec(file, args, options);
  };
  await expect(execute()).rejects.toThrow('Git publication could not be confirmed');
  expect(job.data.publicationUncertain).toBe(true);
  expect(syncDiskToSqlWithLock).not.toHaveBeenCalled();
  expect(await git('rev-parse', 'HEAD')).toBe(snapshot.baseCommit);
});

it('validates sharing before publication and restores the checkout on rejection', async () => {
  vi.mocked(checkSharingConfigurationValid).mockResolvedValue(false);
  await expect(execute()).rejects.toThrow('Invalid sharing operation');
  expect(await git('--git-dir', course.repository!, 'rev-parse', 'master')).toBe(
    snapshot.baseCommit,
  );
  expect(await git('status', '--porcelain')).toBe('');
});

it('rejects Git attribute transformations of approved bytes', async () => {
  snapshot.additions.push({
    path: '.gitattributes',
    contents: Buffer.from('question.html text\n').toString('base64'),
  });
  snapshot.additions[0].contents = Buffer.from('Reviewed\r\n').toString('base64');
  await expect(execute()).rejects.toThrow(
    'Git attributes or filters changed the reviewed contents',
  );
  expect(await git('--git-dir', course.repository!, 'rev-parse', 'master')).toBe(
    snapshot.baseCommit,
  );
  expect(await git('status', '--porcelain')).toBe('');
});

it('rejects writes through a tracked symlink', async () => {
  await fs.symlink(directory, path.join(course.path, 'outside'));
  await git('add', 'outside');
  await git(
    '-c',
    'user.name=Instructor',
    '-c',
    'user.email=instructor@example.com',
    'commit',
    '-m',
    'Symlink',
  );
  await git('push');
  snapshot.baseCommit = await git('rev-parse', 'HEAD');
  snapshot.additions.push({ path: 'outside/escaped.txt', contents: 'eA==' });
  await expect(execute()).rejects.toThrow('Only regular course files');
  expect(await fs.pathExists(path.join(directory, 'escaped.txt'))).toBe(false);
});
