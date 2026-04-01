import { createExpressMiddleware } from '@trpc/server/adapters/express';

import { handleTrpcError } from '../../lib/trpc.js';

import { accessControlRouter } from './access-control.js';
import { assessmentQuestionsRouter } from './assessment-questions.js';
import { createContext, t } from './init.js';

export const assessmentRouter = t.router({
  accessControl: accessControlRouter,
  assessmentQuestions: assessmentQuestionsRouter,
});

export type AssessmentRouter = typeof assessmentRouter;

export const assessmentTrpcRouter = createExpressMiddleware({
  router: assessmentRouter,
  createContext,
  onError: handleTrpcError,
});
