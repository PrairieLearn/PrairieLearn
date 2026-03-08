import * as trpcExpress from '@trpc/server/adapters/express';
import { Router } from 'express';

import { handleTrpcError } from '../../lib/trpc.js';

import { createTRPCContext, studentLabelsRouter } from './trpc.js';

const router = Router();

router.use(
  '/student_labels',
  trpcExpress.createExpressMiddleware({
    router: studentLabelsRouter,
    createContext: createTRPCContext,
    onError: handleTrpcError,
  }),
);

export default router;
