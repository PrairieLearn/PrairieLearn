import * as trpcExpress from '@trpc/server/adapters/express';
import { Router } from 'express';

import { logger } from '@prairielearn/logger';
import * as Sentry from '@prairielearn/sentry';

import { courseFilesRouter } from './routers/course-files/index.js';
import { createContext } from './trpc.js';

export { courseFilesRouter };
export type CourseFilesRouter = typeof courseFilesRouter;

const router = Router();

router.use(
  '/course_files',
  trpcExpress.createExpressMiddleware({
    router: courseFilesRouter,
    createContext,
    onError: ({ error }) => {
      if (error.code === 'INTERNAL_SERVER_ERROR') {
        Sentry.captureException(error);
        logger.error('tRPC error', error);
      }
    },
  }),
);

export default router;
