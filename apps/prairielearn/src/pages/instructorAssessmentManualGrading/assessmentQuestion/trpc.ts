import { TRPCError, initTRPC } from '@trpc/server';
import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import { z } from 'zod';

import { setAiGradingMode } from '../../../ee/lib/ai-grading/ai-grading-util.js';
import { extractPageContext } from '../../../lib/client/page-context.js';
import { features } from '../../../lib/features/index.js';

export function createContext({ res }: CreateExpressContextOptions) {
  const pageContext = extractPageContext(res.locals, {
    pageType: 'assessmentQuestion',
    accessType: 'instructor',
  });

  return {
    user: pageContext.authz_data.user,
    authn_user: pageContext.authz_data.authn_user,
    assessment_question: pageContext.assessment_question,
    locals: res.locals,
  };
}

export type TRPCContext = Awaited<ReturnType<typeof createContext>>;

export const t = initTRPC.context<TRPCContext>().create();

const setAiGradingModeMutation = t.procedure
  .input(z.object({ enabled: z.boolean() }))
  .mutation(async (opts) => {
    if (!(await features.enabledFromLocals('ai-grading', opts.ctx.locals))) {
      throw new TRPCError({ message: 'Access denied (feature not available)', code: 'FORBIDDEN' });
    }

    await setAiGradingMode(opts.ctx.assessment_question.id, opts.input.enabled);
  });

export const manualGradingAssessmentQuestionRouter = t.router({
  setAiGradingMode: setAiGradingModeMutation,
});

export type ManualGradingAssessmentQuestionRouter = typeof manualGradingAssessmentQuestionRouter;
