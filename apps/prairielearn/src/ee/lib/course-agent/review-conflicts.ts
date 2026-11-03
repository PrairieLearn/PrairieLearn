import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';

import { execa } from 'execa';
import { z } from 'zod';

import {
  MAX_REVIEW_FILE_BYTES,
  ReviewBaseFilesSchema,
  type ReviewSnapshot,
} from '@prairielearn/course-agent-types';

import type { Course } from '../../../lib/db-types.js';
import type { ServerJob } from '../../../lib/server-jobs.js';

import { readReviewBaseFiles } from './review-diff.js';

export const ReviewConflictSchema = z.object({
  paths: z.array(z.string()),
  files: ReviewBaseFilesSchema.optional(),
});

/** Called under the editor's course lock before any writes, and again on Git push retry. */
export async function checkReviewConflicts(
  course: Pick<Course, 'path' | 'repository' | 'branch'>,
  snapshot: ReviewSnapshot,
  job: ServerJob,
) {
  const originals = await readReviewBaseFiles(course, snapshot);
  const current = new Map<string, Buffer | null>();
  if (snapshot.type === 'github') {
    // Compare Git objects after the editor's reset, so working-tree filters and
    // line-ending conversion don't cause false conflicts against the reviewed blobs.
    const { stdout: baseCommit } = await execa('git', ['rev-parse', 'HEAD'], { cwd: course.path });
    const files = await readReviewBaseFiles(course, {
      ...snapshot,
      baseCommit,
      additions: [...originals.keys()].map((path) => ({ path, contents: '' })),
      deletions: [],
    });
    for (const [path, contents] of files) current.set(path, contents);
  } else {
    for (const file of originals.keys()) {
      const filePath = path.join(course.path, file);
      let stat;
      try {
        stat = await lstat(filePath);
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
      }
      if (!stat) {
        current.set(file, null);
        continue;
      }
      if (!stat.isFile() || (stat.mode & 0o100) !== 0 || stat.size > MAX_REVIEW_FILE_BYTES) {
        throw new Error(`Current course file cannot be reviewed: ${file}`);
      }
      current.set(file, await readFile(filePath));
    }
  }
  const paths = [...originals.keys()].filter((path) => {
    const original = originals.get(path) ?? null;
    const contents = current.get(path) ?? null;
    return original === null || contents === null
      ? original !== contents
      : !original.equals(contents);
  });
  if (paths.length === 0) return;
  // Resume must deliver the same local baseline even if host files change again.
  job.data.courseAgentConflict = ReviewConflictSchema.parse({
    paths,
    ...(snapshot.type === 'local'
      ? {
          files: paths.map((path) => ({
            path,
            contents: current.get(path)?.toString('base64') ?? null,
          })),
        }
      : {}),
  });
  throw new Error(
    `Course files changed since this proposal: ${paths.join(', ')}. No proposed changes were saved.`,
  );
}
