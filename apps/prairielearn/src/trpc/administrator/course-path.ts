import path from 'path';

import { TRPCError } from '@trpc/server';

import { contains } from '@prairielearn/path-utils';

import { config } from '../../lib/config.js';

export function normalizeCoursePathInput(coursePath: string): string {
  if (!path.isAbsolute(coursePath)) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Path must be absolute.',
    });
  }

  const normalizedCoursePath = path.resolve(coursePath);

  if (config.coursesRoot && !contains(config.coursesRoot, normalizedCoursePath, false)) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Path must be within ${config.coursesRoot}/`,
    });
  }

  return normalizedCoursePath;
}
