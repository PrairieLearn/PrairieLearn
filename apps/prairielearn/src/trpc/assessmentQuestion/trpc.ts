import { createExpressMiddleware } from '@trpc/server/adapters/express';

import { handleTrpcError } from '../../lib/trpc.js';

import { createContext, t } from './init.js';
import { manualGradingRouter } from './manual-grading.js';

export const assessmentQuestionRouter = t.router({
  manualGrading: manualGradingRouter,
});

export type AssessmentQuestionRouter = typeof assessmentQuestionRouter;

export const assessmentQuestionTrpcRouter = createExpressMiddleware({
  router: assessmentQuestionRouter,
  createContext,
  onError: handleTrpcError,
});
