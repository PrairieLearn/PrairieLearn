import { TRPCError, initTRPC } from '@trpc/server';
import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import superjson from 'superjson';

import type { ResLocalsForPage } from '../../lib/res-locals.js';
import { appErrorFormatter } from '../app-errors.js';

export function createContext({ req, res }: CreateExpressContextOptions) {
  const locals = res.locals as ResLocalsForPage<'instance-question'>;

  return {
    user: locals.authz_data.user,
    authn_user: locals.authz_data.authn_user,
    course: locals.course,
    course_instance: locals.course_instance,
    assessment: locals.assessment,
    assessment_instance: locals.assessment_instance,
    question: locals.question,
    assessment_question: locals.assessment_question,
    instance_question: locals.instance_question,
    urlPrefix: locals.urlPrefix,
    authz_data: locals.authz_data,
    session: req.session,
    locals,
  };
}

export type TRPCContext = Awaited<ReturnType<typeof createContext>>;

export const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
  errorFormatter: appErrorFormatter,
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
