import { TRPCError, type TRPCMiddlewareFunction, initTRPC } from '@trpc/server';
import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import superjson from 'superjson';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import { appErrorFormatter } from '@prairielearn/trpc/server';
import { IdSchema, parseRequestParams } from '@prairielearn/zod';

import {
  type VerifiedExamGraceContext,
  verifyExamGraceContext,
} from '../../lib/exam-grace-context.js';
import type { ResLocalsForPage } from '../../lib/res-locals.js';
import { selectAndAuthzAssessmentInstance } from '../../middlewares/selectAndAuthzAssessmentInstance.js';

const ParamsSchema = z.object({ assessment_instance_id: IdSchema });

export function createContext({ req, res }: CreateExpressContextOptions) {
  const locals = res.locals as ResLocalsForPage<'course-instance'>;
  const params = parseRequestParams(req, ParamsSchema);
  return {
    req,
    res,
    locals,
    assessmentInstanceId: params.assessment_instance_id,
    course: locals.course,
    courseInstance: locals.course_instance,
    user: locals.user,
    authnUser: locals.authn_user,
  };
}

type TRPCContext = ReturnType<typeof createContext>;

export const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
  errorFormatter: appErrorFormatter,
});

export const requireAssessmentInstanceAccess = t.middleware(async ({ ctx, next }) => {
  try {
    await selectAndAuthzAssessmentInstance(ctx.req, ctx.res);
  } catch (err) {
    if (err instanceof HttpStatusError && err.status === 403) {
      throw new TRPCError({ code: 'FORBIDDEN', message: err.message, cause: err });
    }
    throw err;
  }
  const assessmentInstanceLocals = ctx.res.locals as ResLocalsForPage<'assessment-instance'>;
  return next({ ctx: { assessmentInstanceLocals } });
});

// This middleware requires the procedure's input parser to validate the token first.
export const requireExamGraceCapability: TRPCMiddlewareFunction<
  TRPCContext,
  object,
  object,
  { grace: VerifiedExamGraceContext },
  { token: string }
> = async ({ input, ctx, next }) => {
  const grace = await verifyExamGraceContext({
    token: input.token,
    assessmentInstanceId: ctx.assessmentInstanceId,
    course: ctx.course,
    courseInstance: ctx.courseInstance,
    user: ctx.user,
    authnUser: ctx.authnUser,
  });
  if (!grace) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'This exam saving period is no longer available',
    });
  }
  return next({ ctx: { grace } });
};
