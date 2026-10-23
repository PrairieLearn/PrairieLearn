import { createExpressMiddleware } from '@trpc/server/adapters/express';

import { handleTrpcError } from '../../lib/trpc.js';

import { authorizationRouter } from './authorization.js';
import { createContext, t } from './init.js';

const workspaceRouter = t.router({
  authorization: authorizationRouter,
});

export type WorkspaceRouter = typeof workspaceRouter;

export const workspaceTrpcRouter = createExpressMiddleware({
  router: workspaceRouter,
  createContext,
  onError: handleTrpcError,
});
