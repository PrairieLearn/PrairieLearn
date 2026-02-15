import { initTRPC } from '@trpc/server';
import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import superjson from 'superjson';

import { SafeQuestionsPageDataSchema } from '../../components/QuestionsTable.shared.js';
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
  const rawQuestions = await selectPublicQuestionsForCourse(opts.ctx.course.id);
  return rawQuestions.map((q) => SafeQuestionsPageDataSchema.parse(q));
});

export const publicQuestionsRouter = t.router({
  questions: questionsQuery,
});

export type PublicQuestionsRouter = typeof publicQuestionsRouter;
