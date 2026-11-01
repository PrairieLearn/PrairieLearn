import os from 'node:os';
import path from 'node:path';

import { execa } from 'execa';
import fs from 'fs-extra';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { ReviewSnapshot } from '@prairielearn/course-agent-types';

import type { Course, User } from '../../../lib/db-types.js';
import type { ServerJob } from '../../../lib/server-jobs.js';
import * as courseModel from '../../../models/course.js';
import { syncDiskToSqlWithLock } from '../../../sync/syncFromDisk.js';
import { withConfig } from '../../../tests/utils/config.js';

import { ReviewedChangesEditor } from './reviewed-changes-editor.js';

vi.hoisted(() => vi.resetModules());
vi.mock('@prairielearn/named-locks', () => ({
  doWithLock: async (_name: string, _options: unknown, fn: () => Promise<void>) => fn(),
}));
vi.mock('../../../models/course.js', async (importOriginal) => ({
  ...(await importOriginal<typeof courseModel>()),
  getOrUpdateCourseCommitHash: (course: Course) => courseModel.getCourseCommitHash(course.path),
}));
vi.mock('../../../sync/syncFromDisk.js', () => ({
  syncDiskToSqlWithLock: vi.fn(),
}));

let directory: string;
let course: Course;
let job: ServerJob;
const user = { id: '2', uid: 'instructor@example.com', name: 'Instructor', email: null } as User;
const executeCommand = vi.fn<ServerJob['exec']>(async (file, args, options) => {
  await execa(file, args, options);
  return { data: {} };
});

async function git(cwd: string, ...args: string[]) {
  return (await execa('git', args, { cwd })).stdout;
}

function commit(cwd: string, message: string) {
  return git(
    cwd,
    '-c',
    'user.name=Instructor',
    '-c',
    'user.email=instructor@example.com',
    'commit',
    '-am',
    message,
  );
}

function execute(snapshot: ReviewSnapshot) {
  const editor = new ReviewedChangesEditor({
    course,
    user,
    authzData: { has_course_permission_edit: true, authn_user: user },
    snapshot,
  });
  return editor.executeWithJob(
    job,
    snapshot.type === 'github' ? { expectedBaseCommit: snapshot.baseCommit } : {},
  );
}

beforeEach(async () => {
  vi.clearAllMocks();
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'pl-reviewed-edits-'));
  course = {
    id: '1',
    path: path.join(directory, 'checkout'),
    repository: path.join(directory, 'remote.git'),
    branch: 'master',
    example_course: false,
  } as Course;
  await fs.ensureDir(course.path);
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
    exec: executeCommand,
  };
});

afterEach(async () => {
  await fs.remove(directory);
});

it('rejects a Git review when another checkout has pushed a course edit', async () => {
  await withConfig({ fileEditorUseGit: true }, async () => {
    await git(directory, 'init', '--bare', '--initial-branch=master', course.repository!);
    await git(directory, 'clone', course.repository!, course.path);
    await fs.writeFile(path.join(course.path, 'question.html'), 'Original\n');
    await git(course.path, 'add', 'question.html');
    await commit(course.path, 'Initial');
    await git(course.path, 'push', 'origin', 'master');
    const snapshot: ReviewSnapshot = {
      type: 'github',
      repository: 'PrairieLearn/course',
      branch: 'master',
      baseCommit: await git(course.path, 'rev-parse', 'HEAD'),
      additions: [
        { path: 'question.html', contents: Buffer.from('Reviewed\n').toString('base64') },
      ],
      deletions: [],
    };

    const otherCheckout = path.join(directory, 'other-checkout');
    await git(directory, 'clone', course.repository!, otherCheckout);
    await fs.writeFile(path.join(otherCheckout, 'question.html'), 'Instructor edit\n');
    await commit(otherCheckout, 'Edit question');
    await git(otherCheckout, 'push', 'origin', 'master');
    const remoteHead = await git(otherCheckout, 'rev-parse', 'HEAD');

    await expect(execute(snapshot)).rejects.toThrow('The course branch changed');
    expect(await fs.readFile(path.join(course.path, 'question.html'), 'utf8')).toBe('Original\n');
    expect(await git(directory, '--git-dir', course.repository!, 'rev-parse', 'master')).toBe(
      remoteHead,
    );
    expect(syncDiskToSqlWithLock).not.toHaveBeenCalled();
  });
});

it('rejects a stale local deletion before applying any reviewed files, without Git', async () => {
  await withConfig({ fileEditorUseGit: false }, async () => {
    await fs.writeFile(path.join(course.path, 'question.html'), 'Original\n');
    await fs.writeFile(path.join(course.path, 'old.txt'), 'Delete me\n');
    const snapshot: ReviewSnapshot = {
      type: 'local',
      additions: [
        { path: 'question.html', contents: Buffer.from('Reviewed\n').toString('base64') },
      ],
      deletions: [{ path: 'old.txt' }],
      originals: [
        { path: 'question.html', contents: Buffer.from('Original\n').toString('base64') },
        { path: 'old.txt', contents: Buffer.from('Delete me\n').toString('base64') },
      ],
    };
    await fs.writeFile(path.join(course.path, 'old.txt'), 'Instructor edit\n');

    await expect(execute(snapshot)).rejects.toThrow('Local course files changed: old.txt');
    expect(await fs.readFile(path.join(course.path, 'question.html'), 'utf8')).toBe('Original\n');
    expect(await fs.readFile(path.join(course.path, 'old.txt'), 'utf8')).toBe('Instructor edit\n');
    expect(syncDiskToSqlWithLock).not.toHaveBeenCalled();
    expect(executeCommand).not.toHaveBeenCalled();
  });
});
