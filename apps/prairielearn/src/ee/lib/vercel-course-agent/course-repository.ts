import { TRPCError } from '@trpc/server';

import type { Course } from '../../../lib/db-types.js';
import { parseGithubRepository } from '../../../lib/github-utils.js';

export function courseRepository(course: Pick<Course, 'repository' | 'branch'>) {
  const repository = course.repository && parseGithubRepository(course.repository);
  if (
    !repository ||
    !/^[A-Za-z0-9_-]+$/.test(repository.owner) ||
    !/^[A-Za-z0-9_.-]+$/.test(repository.repo)
  ) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Configure a GitHub repository for this course before starting the agent.',
    });
  }
  // PL also stores SSH remotes. Use credential-free HTTPS for Vercel's request injection.
  return {
    url: `https://github.com/${repository.owner}/${repository.repo}.git`,
    branch: course.branch,
  };
}
