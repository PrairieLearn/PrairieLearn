import { initTRPC } from '@trpc/server';
import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import superjson from 'superjson';

import type { ResLocalsForPage } from '../../lib/res-locals.js';
import { selectPublicQuestionsForCourse } from '../../models/questions.js';

export function createContext({ res }: CreateExpressContextOptions) {
  const locals = res.locals as ResLocalsForPage<'public-course'>;
  return { course: locals.course };
}

export type TRPCContext = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
});

const questionsQuery = t.procedure.query(async (opts) => {
  return await selectPublicQuestionsForCourse(opts.ctx.course.id);
});

export const publicQuestionsRouter = t.router({
  questions: questionsQuery,
});

export type PublicQuestionsRouter = typeof publicQuestionsRouter;
