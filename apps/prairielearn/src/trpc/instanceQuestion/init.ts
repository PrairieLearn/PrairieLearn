import { TRPCError, initTRPC } from '@trpc/server';
import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import superjson from 'superjson';

import { appErrorFormatter } from '@prairielearn/trpc/server';

import type { ResLocalsForPage } from '../../lib/res-locals.js';

export function createContext({ req, res }: CreateExpressContextOptions) {
  const locals = res.locals as ResLocalsForPage<'instance-question'>;
  return {
    req,
    res,
    user: locals.user,
    authn_user: locals.authn_user,
    course: locals.course,
    course_instance: locals.course_instance,
    question: locals.question,
    instance_question: locals.instance_question,
    authz_result: locals.authz_result,
    locals,
  };
}

export const t = initTRPC.context<ReturnType<typeof createContext>>().create({
  transformer: superjson,
  errorFormatter: appErrorFormatter,
});

export const requireInstanceQuestionEdit = t.middleware(async (opts) => {
  if (!opts.ctx.authz_result.authorized_edit) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' });
  }
  return opts.next();
});
