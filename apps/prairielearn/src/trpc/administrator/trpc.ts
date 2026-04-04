import { createExpressMiddleware } from '@trpc/server/adapters/express';

import { handleTrpcError } from '../../lib/trpc.js';

import { administratorCourseRequestsRouter } from './course-requests.js';
import { administratorCoursesRouter } from './courses.js';
import { createContext, t } from './init.js';
import { administratorInstitutionsRouter } from './institutions.js';

export const administratorRouter = t.router({
  courseRequests: administratorCourseRequestsRouter,
  courses: administratorCoursesRouter,
  institutions: administratorInstitutionsRouter,
});

export type AdministratorRouter = typeof administratorRouter;

export const administratorTrpcRouter = createExpressMiddleware({
  router: administratorRouter,
  createContext,
  onError: handleTrpcError,
});
