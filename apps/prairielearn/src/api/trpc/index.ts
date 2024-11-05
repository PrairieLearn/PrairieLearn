import * as trpcExpress from '@trpc/server/adapters/express';

import { logger } from '@prairielearn/logger';
import * as Sentry from '@prairielearn/sentry';

import { courseRouter } from './routers/course/index.js';
import { router, createContext, t } from './trpc.js';

const appRouter = router({
  course: courseRouter,
});

export type AppRouter = typeof appRouter;

export default trpcExpress.createExpressMiddleware({
  router: appRouter,
  createContext,
  onError: ({ error }) => {
    if (error.code === 'INTERNAL_SERVER_ERROR') {
      Sentry.captureException(error);
      logger.error('tRPC error', error);
    }
  },
});

export const caller = t.createCallerFactory(appRouter)({
  jwt: null,
  bypassJwt: true,
});
