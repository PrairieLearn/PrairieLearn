import { TRPCError, initTRPC } from '@trpc/server';
import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import superjson from 'superjson';
import { z } from 'zod';

import {
  createCourseFromRequest,
  denyCourseRequest,
  updateCourseRequestNote,
} from '../../lib/course-request.js';
import { coursePathAvailability, courseRepositoryAvailability } from '../../lib/course.js';
import type { ResLocalsForPage } from '../../lib/res-locals.js';

export function createContext({ res }: CreateExpressContextOptions) {
  const locals = res.locals as ResLocalsForPage<'plain'>;
  return {
    authn_user: locals.authn_user,
    is_administrator: locals.is_administrator,
  };
}

type TRPCContext = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
});

const requireAdministrator = t.middleware((opts) => {
  if (!opts.ctx.is_administrator) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied (must be an administrator)' });
  }
  return opts.next();
});

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
      courseRequestId: z.string(),
      shortName: z.string(),
      title: z.string(),
      institutionId: z.string(),
      displayTimezone: z.string(),
      path: z.string(),
      repoShortName: z.string(),
      githubUser: z.string(),
    }),
  )
  .output(z.object({ jobSequenceId: z.string() }))
  .mutation(async ({ input, ctx }) => {
    const jobSequenceId = await createCourseFromRequest({
      courseRequestId: input.courseRequestId,
      shortName: input.shortName,
      title: input.title,
      institutionId: input.institutionId,
      displayTimezone: input.displayTimezone,
      path: input.path,
      repoShortName: input.repoShortName,
      githubUser: input.githubUser.length > 0 ? input.githubUser : null,
      authnUser: ctx.authn_user,
    });
    return { jobSequenceId };
  });

export const courseRequestsRouter = t.router({
  checkRepoAvailability,
  checkPathAvailability,
  denyCourseRequestMutation,
  updateCourseRequestNoteMutation,
  createCourseMutation,
});

export type CourseRequestsRouter = typeof courseRequestsRouter;
