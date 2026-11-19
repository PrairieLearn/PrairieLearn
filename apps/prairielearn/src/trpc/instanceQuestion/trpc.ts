import { createExpressMiddleware } from '@trpc/server/adapters/express';

import { handleTrpcError } from '../../lib/trpc.js';

import { createContext, t } from './init.js';
import { unsavedSubmissionsRouter } from './unsaved-submissions.js';

const instanceQuestionRouter = t.router({
  unsavedSubmissions: unsavedSubmissionsRouter,
});

export type InstanceQuestionRouter = typeof instanceQuestionRouter;

export const instanceQuestionTrpcRouter = createExpressMiddleware({
  router: instanceQuestionRouter,
  createContext,
  responseMeta: () => ({ headers: { 'Cache-Control': 'no-store' } }),
  onError: handleTrpcError,
});
