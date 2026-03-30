import { type inferRouterOutputs } from '@trpc/server';
import { createExpressMiddleware } from '@trpc/server/adapters/express';

import { handleTrpcError } from '../../lib/trpc.js';

import { createContext, t } from './init.js';
import { manualGradingRouter } from './manual-grading.js';

export const instanceQuestionRouter = t.router({
  manualGrading: manualGradingRouter,
});

export type InstanceQuestionRouter = typeof instanceQuestionRouter;

type RouterOutputs = inferRouterOutputs<InstanceQuestionRouter>;
export type RubricQueryData = RouterOutputs['manualGrading']['rubricData'];
export type GradingContextData = RouterOutputs['manualGrading']['gradingContext'];

export const instanceQuestionTrpcRouter = createExpressMiddleware({
  router: instanceQuestionRouter,
  createContext,
  onError: handleTrpcError,
});
