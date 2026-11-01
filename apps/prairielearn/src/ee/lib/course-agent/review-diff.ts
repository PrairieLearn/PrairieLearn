import { isUtf8 } from 'node:buffer';

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

/** Read saved local originals or immutable Git objects without changing the checkout. */
export async function readReviewBaseFiles(
  course: Pick<Course, 'path' | 'repository' | 'branch'>,
  snapshot: ReviewSnapshot,
) {
  if (snapshot.type === 'local') {
    return new Map(
      snapshot.originals.map((file) => [
        file.path,
        file.contents === null ? null : Buffer.from(file.contents, 'base64'),
      ]),
    );
  }
  const options = {
    cwd: course.path,
    env: {
      ...process.env,
      ...(config.gitSshCommand ? { GIT_SSH_COMMAND: config.gitSshCommand } : {}),
    },
  };
  const exists = await execa('git', ['cat-file', '-e', `${snapshot.baseCommit}^{commit}`], {
    ...options,
    reject: false,
  });
  if (exists.exitCode !== 0) {
    await execa('git', ['fetch', '--', course.repository!, course.branch], {
      ...options,
      timeout: 30_000,
    });
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
      const [metadata, path] = entry.split('\t');
      const [mode, type, sha, size] = metadata.trim().split(/\s+/);
      entries.set(path, { mode, type, sha, size: Number(size) });
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

/** Build the displayed diff from the immutable originals and proposed file contents. */
export async function createReviewDiff(
  course: Pick<Course, 'path' | 'repository' | 'branch'>,
  snapshot: ReviewSnapshot,
) {
  return namedLocks.doWithLock(
    getLockNameForCoursePath(course.path),
    { timeout: 5000 },
    async () => {
      const baseFiles = await readReviewBaseFiles(course, snapshot);
      const additions = new Map(snapshot.additions.map((file) => [file.path, file.contents]));
      const patches: string[] = [];
      for (const file of [...snapshot.additions, ...snapshot.deletions]) {
        const base = baseFiles.get(file.path) ?? null;
        const old = base ?? Buffer.alloc(0);
        const contents = additions.get(file.path);
        const next = contents === undefined ? Buffer.alloc(0) : Buffer.from(contents, 'base64');
        if (old.includes(0) || next.includes(0) || !isUtf8(old) || !isUtf8(next)) {
          patches.push(
            `Binary file ${file.path}: ${base !== null ? (contents === undefined ? 'deleted' : 'modified') : 'added'}\n`,
          );
        } else {
          patches.push(
            createTwoFilesPatch(
              base !== null ? file.path : '/dev/null',
              contents === undefined ? '/dev/null' : file.path,
              old.toString('utf8'),
              next.toString('utf8'),
            ),
          );
        }
      }
      return patches.join('\n');
    },
  );
}
