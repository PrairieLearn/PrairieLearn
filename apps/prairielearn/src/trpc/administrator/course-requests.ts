import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import {
  createCourseFromRequest,
  denyCourseRequest,
  updateCourseRequestNote,
} from '../../lib/course-request.js';
import { checkCoursePathExists, checkCourseRepositoryExists } from '../../lib/course.js';

import { requireAdministrator, t } from './trpc-init.js';

const deny = t.procedure
  .use(requireAdministrator)
  .input(z.object({ courseRequestId: z.string() }))
  .mutation(async ({ input, ctx }) => {
    await denyCourseRequest({
      courseRequestId: input.courseRequestId,
      authnUser: ctx.authn_user,
    });
  });

const updateNote = t.procedure
  .use(requireAdministrator)
  .input(z.object({ courseRequestId: z.string(), note: z.string() }))
  .mutation(async ({ input }) => {
    await updateCourseRequestNote({
      courseRequestId: input.courseRequestId,
      note: input.note,
    });
  });

const createCourse = t.procedure
  .use(requireAdministrator)
  .input(
    z.object({
      courseRequestId: z.string().min(1),
      shortName: z
        .string()
        .min(1, 'Short name is required')
        .regex(
          /^[A-Z]+ [A-Z0-9]+$/,
          'The course rubric and number should be a series of letters, followed by a space, followed by a series of numbers and/or letters.',
        ),
      title: z.string().min(1, 'Title is required').max(75, 'Title must be at most 75 characters'),
      institutionId: z.string().min(1, 'Institution is required'),
      displayTimezone: z.string().min(1, 'Timezone is required'),
      path: z.string().min(1, 'Path is required'),
      repoShortName: z.string().min(1, 'Repository name is required'),
      githubUser: z.string(),
    }),
  )
  .output(z.object({ jobSequenceId: z.string() }))
  .mutation(async ({ input, ctx }) => {
    const repoExists = await checkCourseRepositoryExists(input.repoShortName);
    if (repoExists) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'A course with this repository already exists.',
      });
    }

    const pathExists = await checkCoursePathExists(input.path);
    if (pathExists) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'A course with this path already exists.',
      });
    }

    const jobSequenceId = await createCourseFromRequest({
      courseRequestId: input.courseRequestId,
      shortName: input.shortName,
      title: input.title,
      institutionId: input.institutionId,
      displayTimezone: input.displayTimezone,
      path: input.path,
      repoShortName: input.repoShortName,
      githubUser: input.githubUser.trim().length > 0 ? input.githubUser.trim() : null,
      authnUser: ctx.authn_user,
    });
    return { jobSequenceId };
  });

export const administratorCourseRequestsRouter = t.router({
  deny,
  updateNote,
  createCourse,
});
