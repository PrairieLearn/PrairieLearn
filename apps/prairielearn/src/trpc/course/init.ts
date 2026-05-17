import { TRPCError, initTRPC } from '@trpc/server';
import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import superjson from 'superjson';

import { extractPageContext } from '../../lib/client/page-context.js';
import type { ResLocalsForPage } from '../../lib/res-locals.js';
import { appErrorFormatter } from '../app-errors.js';

export function createContext({ res }: CreateExpressContextOptions) {
  const locals = res.locals as ResLocalsForPage<'course'>;
  const { authz_data: authzData, course } = extractPageContext(locals, {
    pageType: 'course',
    accessType: 'instructor',
  });

  return {
    course,
    authz_data: authzData,
    locals,
  };
}

type TRPCContext = Awaited<ReturnType<typeof createContext>>;

export const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
  errorFormatter: appErrorFormatter,
});

export const requireCoursePermissionOwn = t.middleware(async (opts) => {
  if (!opts.ctx.authz_data.has_course_permission_own) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Access denied (must be a course owner)',
    });
  }
  return opts.next();
});

export const requireCoursePermissionEdit = t.middleware(async (opts) => {
  if (!opts.ctx.authz_data.has_course_permission_edit) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Access denied (must be a course editor)',
    });
  }
  return opts.next();
});

export const requireCoursePermissionPreview = t.middleware(async (opts) => {
  if (!opts.ctx.authz_data.has_course_permission_preview) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Access denied (must be a course previewer)',
    });
  }
  return opts.next();
});

export const requireNotExampleCourse = t.middleware(async (opts) => {
  if (opts.ctx.course.example_course) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Access denied. Cannot make changes to example course.',
    });
  }
  return opts.next();
});
