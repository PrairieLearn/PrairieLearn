import { TRPCError, initTRPC } from '@trpc/server';
import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import superjson from 'superjson';

import type { ResLocalsForPage } from '../../lib/res-locals.js';
import { appErrorFormatter } from '../app-errors.js';

export function createContext({ res }: CreateExpressContextOptions) {
  const locals = res.locals as ResLocalsForPage<'assessment'>;

  return {
    course: locals.course,
    course_instance: locals.course_instance,
    assessment: locals.assessment,
    authz_data: locals.authz_data,
    authn_user: locals.authn_user,
    locals,
  };
}

type TRPCContext = Awaited<ReturnType<typeof createContext>>;

export const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
  errorFormatter: appErrorFormatter,
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

export const requireCourseInstancePermissionView = t.middleware(async (opts) => {
  if (!opts.ctx.authz_data.has_course_instance_permission_view) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Access denied (must be a student data viewer)',
    });
  }
  return opts.next();
});

export const requireCourseInstancePermissionEdit = t.middleware(async (opts) => {
  if (!opts.ctx.authz_data.has_course_instance_permission_edit) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Access denied (must be a student data editor)',
    });
  }
  return opts.next();
});

// This mirrors courseInstance/init.ts's requireCoursePermissionEdit but is
// bound to the assessment scope's `t` instance. Each tRPC scope needs its
// own middleware created from its own `t` so that the context type is correct.
export const requireCoursePermissionEdit = t.middleware(async (opts) => {
  if (!opts.ctx.authz_data.has_course_permission_edit) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Access denied (must be a course editor)',
    });
  }
  return opts.next();
});
