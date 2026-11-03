import { execa } from 'execa';
import { z } from 'zod';

import type { ReviewSnapshot } from '@prairielearn/course-agent-types';

import type { Course } from '../../../lib/db-types.js';
import type { ServerJob } from '../../../lib/server-jobs.js';

import { readReviewBaseFiles } from './review-diff.js';

export const ReviewConflictSchema = z.object({ paths: z.array(z.string()) });

/** Called under the editor's course lock before any writes, and again on Git push retry. */
export async function checkReviewConflicts(
  course: Pick<Course, 'path' | 'repository' | 'branch'>,
  snapshot: Extract<ReviewSnapshot, { type: 'github' }>,
  job: ServerJob,
) {
  const originals = await readReviewBaseFiles(course, snapshot);
  // Compare Git objects after the editor's reset, so working-tree filters and
  // line-ending conversion don't cause false conflicts against the reviewed blobs.
  const { stdout: baseCommit } = await execa('git', ['rev-parse', 'HEAD'], { cwd: course.path });
  const current = await readReviewBaseFiles(course, {
    ...snapshot,
    baseCommit,
    additions: [...originals.keys()].map((path) => ({ path, contents: '' })),
    deletions: [],
  });
  const paths = [...originals.keys()].filter((path) => {
    const original = originals.get(path) ?? null;
    const contents = current.get(path) ?? null;
    return original === null || contents === null
      ? original !== contents
      : !original.equals(contents);
  });
  if (paths.length === 0) return;
  job.data.courseAgentConflict = ReviewConflictSchema.parse({ paths });
  throw new Error(
    `Course files changed since this proposal: ${paths.join(', ')}. No proposed changes were saved.`,
  );
}
