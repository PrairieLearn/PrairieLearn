import { createExpressMiddleware } from '@trpc/server/adapters/express';

import { handleTrpcError } from '../../lib/trpc.js';

import { studentLabelsRouter } from './student-labels.js';
import { createContext, t } from './trpc-init.js';

export const courseInstanceRouter = t.router({
  studentLabels: studentLabelsRouter,
});

export type CourseInstanceRouter = typeof courseInstanceRouter;

export const courseInstanceTrpcRouter = createExpressMiddleware({
  router: courseInstanceRouter,
  createContext,
  onError: handleTrpcError,
});
