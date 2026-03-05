import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import {
  createCourseFromRequest,
  denyCourseRequest,
  updateCourseRequestNote,
} from '../../lib/course-request.js';
import { coursePathAvailability, courseRepositoryAvailability } from '../../lib/course.js';

import { requireAdministrator, t } from './trpc-init.js';

const checkRepoAvailability = t.procedure
  .use(requireAdministrator)
  .input(z.object({ repoName: z.string() }))
  .output(z.object({ exists: z.boolean() }))
  .query(async (opts) => {
    const exists = await courseRepositoryAvailability(opts.input.repoName);
    return { exists };
  });

const checkPathAvailability = t.procedure
  .use(requireAdministrator)
  .input(z.object({ path: z.string() }))
  .output(z.object({ exists: z.boolean() }))
  .query(async (opts) => {
    const exists = await coursePathAvailability(opts.input.path);
    return { exists };
  });

const denyCourseRequestMutation = t.procedure
  .use(requireAdministrator)
  .input(z.object({ courseRequestId: z.string() }))
  .mutation(async ({ input, ctx }) => {
    await denyCourseRequest({
      courseRequestId: input.courseRequestId,
      authnUser: ctx.authn_user,
    });
  });

const updateCourseRequestNoteMutation = t.procedure
  .use(requireAdministrator)
  .input(z.object({ courseRequestId: z.string(), note: z.string() }))
  .mutation(async ({ input }) => {
    await updateCourseRequestNote({
      courseRequestId: input.courseRequestId,
      note: input.note,
    });
  });

const createCourseMutation = t.procedure
  .use(requireAdministrator)
  .input(
    z.object({
      courseRequestId: z.string().min(1),
      shortName: z.string().min(1, 'Short name is required'),
      title: z.string().min(1, 'Title is required'),
      institutionId: z.string().min(1, 'Institution is required'),
      displayTimezone: z.string().min(1, 'Timezone is required'),
      path: z.string().min(1, 'Path is required'),
      repoShortName: z.string().min(1, 'Repository name is required'),
      githubUser: z.string(),
    }),
  )
  .output(z.object({ jobSequenceId: z.string() }))
  .mutation(async ({ input, ctx }) => {
    const repoExists = await courseRepositoryAvailability(input.repoShortName);
    if (repoExists) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'A course with this repository already exists.',
      });
    }

    const pathExists = await coursePathAvailability(input.path);
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
  checkRepoAvailability,
  checkPathAvailability,
  denyCourseRequestMutation,
  updateCourseRequestNoteMutation,
  createCourseMutation,
});
