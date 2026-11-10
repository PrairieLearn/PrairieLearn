import { isUtf8 } from 'node:buffer';
import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';

import { createTwoFilesPatch } from 'diff';
import { execa } from 'execa';

import {
  MAX_REVIEW_BYTES,
  MAX_REVIEW_FILE_BYTES,
  type ReviewSnapshot,
} from '@prairielearn/course-agent-types';
import { HttpStatusError } from '@prairielearn/error';
import * as namedLocks from '@prairielearn/named-locks';

import { config } from '../../../lib/config.js';
import type { Course } from '../../../lib/db-types.js';
import { getLockNameForCoursePath } from '../../../models/course.js';

/** Local development reviews compare against, and then overwrite, the files on disk. */
async function readLocalFiles(coursePath: string, snapshot: ReviewSnapshot) {
  const files = new Map<string, Buffer | null>();
  for (const { path: file } of [...snapshot.additions, ...snapshot.deletions]) {
    const filePath = path.join(coursePath, file);
    const stat = await lstat(filePath).catch((error: unknown) => {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
      throw error;
    });
    if (stat && (!stat.isFile() || stat.size > MAX_REVIEW_FILE_BYTES)) {
      throw new HttpStatusError(400, `Course file cannot be reviewed: ${file}`);
    }
    files.set(file, stat ? await readFile(filePath) : null);
  }
  return files;
}

async function hasCommit(coursePath: string, commit: string) {
  const result = await execa('git', ['cat-file', '-e', `${commit}^{commit}`], {
    cwd: coursePath,
    reject: false,
  });
  return result.exitCode === 0;
}

/** Read immutable Git objects (or local files in development) without changing the checkout. */
export async function readReviewBaseFiles(
  course: Pick<Course, 'path' | 'repository' | 'branch'>,
  snapshot: ReviewSnapshot,
) {
  if (snapshot.type === 'local') return readLocalFiles(course.path, snapshot);
  const options = {
    cwd: course.path,
    env: {
      ...process.env,
      ...(config.gitSshCommand ? { GIT_SSH_COMMAND: config.gitSshCommand } : {}),
    },
  };
  if (!(await hasCommit(course.path, snapshot.baseCommit))) {
    await execa('git', ['fetch', '--', course.repository!, course.branch], {
      ...options,
      timeout: 30_000,
    });
    // A force-push can remove the reviewed commit from the branch.
    if (!(await hasCommit(course.path, snapshot.baseCommit))) {
      throw new HttpStatusError(409, 'The reviewed version is no longer in the course repository.');
    }
  }
  const paths = [...snapshot.additions, ...snapshot.deletions].map((file) => file.path);
  const entries = new Map<string, { mode: string; type: string; sha: string; size: number }>();
  if (paths.length > 0) {
    const { stdout } = await execa(
      'git',
      ['--literal-pathspecs', 'ls-tree', '-r', '-z', '-l', snapshot.baseCommit, '--', ...paths],
      options,
    );
    for (const entry of stdout.split('\0').filter(Boolean)) {
      const [metadata, entryPath] = entry.split('\t');
      const [mode, type, sha, size] = metadata.trim().split(/\s+/);
      entries.set(entryPath, { mode, type, sha, size: Number(size) });
    }
  }
  const additions = new Map(snapshot.additions.map((file) => [file.path, file.contents]));
  const baseFiles = new Map<string, Buffer | null>();
  let total = 0;
  for (const file of [...snapshot.additions, ...snapshot.deletions]) {
    const entry = entries.get(file.path);
    if (entry && (entry.type !== 'blob' || entry.mode !== '100644')) {
      throw new HttpStatusError(
        400,
        `Only non-executable regular files are supported: ${file.path}`,
      );
    }
    if (!entry && !additions.has(file.path)) {
      throw new HttpStatusError(400, `Deleted file does not exist: ${file.path}`);
    }
    if ((entry?.size ?? 0) > MAX_REVIEW_FILE_BYTES) {
      throw new HttpStatusError(400, `Review file is too large: ${file.path}`);
    }
    const old = entry
      ? Buffer.from(
          (
            await execa('git', ['cat-file', 'blob', entry.sha], {
              ...options,
              encoding: 'buffer',
              stripFinalNewline: false,
            })
          ).stdout,
        )
      : null;
    const contents = additions.get(file.path);
    const next = contents === undefined ? Buffer.alloc(0) : Buffer.from(contents, 'base64');
    total += (old?.length ?? 0) + next.length;
    if (total > MAX_REVIEW_BYTES) throw new HttpStatusError(400, 'Reviewed changes are too large.');
    baseFiles.set(file.path, old);
  }
  return baseFiles;
}

export interface ReviewDiffFile {
  path: string;
  change: 'added' | 'modified' | 'deleted';
  /** Size of the proposed contents, or of the original contents for a deletion. */
  bytes: number;
  /** A unified diff, or `null` for binary files. */
  patch: string | null;
}

/**
 * @param base The original contents, or `null` if the file is new.
 * @param contents The proposed base64 contents, or `undefined` if the file is deleted.
 */
export function createReviewDiffFile(
  filePath: string,
  base: Buffer | null,
  contents: string | undefined,
): ReviewDiffFile {
  const old = base ?? Buffer.alloc(0);
  const next = contents === undefined ? Buffer.alloc(0) : Buffer.from(contents, 'base64');
  const change = contents === undefined ? 'deleted' : base === null ? 'added' : 'modified';
  const binary = old.includes(0) || next.includes(0) || !isUtf8(old) || !isUtf8(next);
  return {
    path: filePath,
    change,
    bytes: change === 'deleted' ? old.length : next.length,
    patch: binary
      ? null
      : createTwoFilesPatch(
          change === 'added' ? '/dev/null' : filePath,
          change === 'deleted' ? '/dev/null' : filePath,
          old.toString('utf8'),
          next.toString('utf8'),
        ),
  };
}

/** Build the displayed diff from the base files and proposed file contents. */
export async function createReviewDiff(
  course: Pick<Course, 'path' | 'repository' | 'branch'>,
  snapshot: ReviewSnapshot,
) {
  // Committed objects can be read while an editor job holds the course lock for its whole
  // save and sync. Only fetching a missing base or reading local files needs the lock.
  const locked = snapshot.type === 'local' || !(await hasCommit(course.path, snapshot.baseCommit));
  const run = <T>(fn: () => Promise<T>) =>
    locked
      ? namedLocks.doWithLock(
          getLockNameForCoursePath(course.path),
          {
            timeout: 5000,
            onNotAcquired: () => {
              throw new HttpStatusError(409, 'The course is being updated. Try again shortly.');
            },
          },
          fn,
        )
      : fn();
  return run(async () => {
    const baseFiles = await readReviewBaseFiles(course, snapshot);
    const additions = new Map(snapshot.additions.map((file) => [file.path, file.contents]));
    return [...snapshot.additions, ...snapshot.deletions].map((file) =>
      createReviewDiffFile(file.path, baseFiles.get(file.path) ?? null, additions.get(file.path)),
    );
  });
}
