import * as trpcExpress from '@trpc/server/adapters/express';

import { logger } from '@prairielearn/logger';
import * as Sentry from '@prairielearn/sentry';

import { courseRouter } from './routers/course/index.js';
import { router, createContext } from './trpc.js';

const appRouter = router({
  course: courseRouter,
});

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
