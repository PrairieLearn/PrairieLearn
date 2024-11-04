import * as trpcExpress from '@trpc/server/adapters/express';

import { courseRouter } from './routers/course/index.js';
import { router, createContext } from './trpc.js';

const appRouter = router({
  course: courseRouter,
});

export const middleware = trpcExpress.createExpressMiddleware({
  router: appRouter,
  createContext,
});
