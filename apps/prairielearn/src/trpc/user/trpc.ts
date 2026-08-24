import { createExpressMiddleware } from '@trpc/server/adapters/express';

import { handleTrpcError } from '../../lib/trpc.js';

import { createContext, t } from './init.js';
import { userSettingsRouter } from './user-settings.js';

const userRouter = t.router({
  settings: userSettingsRouter,
});

export type UserRouter = typeof userRouter;

export const userTrpcRouter = createExpressMiddleware({
  router: userRouter,
  createContext,
  onError: handleTrpcError,
});
