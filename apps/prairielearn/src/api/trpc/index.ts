import * as trpcExpress from '@trpc/server/adapters/express';
import { Router } from 'express';

import { handleTrpcError } from '../../lib/trpc.js';

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
    onError: handleTrpcError,
  }),
);

export default router;
