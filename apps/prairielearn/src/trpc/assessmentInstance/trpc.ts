import { createExpressMiddleware } from '@trpc/server/adapters/express';

import { handleTrpcError } from '../../lib/trpc.js';

import { examGraceRouter } from './exam-grace.js';
import { createContext, t } from './init.js';

const assessmentInstanceRouter = t.router({ examGrace: examGraceRouter });
export type AssessmentInstanceRouter = typeof assessmentInstanceRouter;

export const assessmentInstanceTrpcRouter = createExpressMiddleware({
  router: assessmentInstanceRouter,
  createContext,
  onError: handleTrpcError,
  maxBodySize: 5 * 1536 * 1024,
});
