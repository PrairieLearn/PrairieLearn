import { createExpressMiddleware } from '@trpc/server/adapters/express';

import { handleTrpcError } from '../../lib/trpc.js';

import { courseStaffRouter } from './course-staff.js';
import { createContext, t } from './init.js';

export const courseRouter = t.router({
  courseStaff: courseStaffRouter,
});

export type CourseRouter = typeof courseRouter;

export const courseTrpcRouter = createExpressMiddleware({
  router: courseRouter,
  createContext,
  onError: handleTrpcError,
});
