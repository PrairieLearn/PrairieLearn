import { createExpressMiddleware } from '@trpc/server/adapters/express';

import { handleTrpcError } from '../../lib/trpc.js';

import { assessmentModulesRouter } from './assessment-modules.js';
import { courseStaffRouter } from './course-staff.js';
import { createContext, t } from './init.js';
import { questionsRouter } from './questions.js';
import { sharedStateRouter } from './shared-state.js';
import { sharingRouter } from './sharing.js';

const courseRouter = t.router({
  assessmentModules: assessmentModulesRouter,
  courseStaff: courseStaffRouter,
  questions: questionsRouter,
  sharedState: sharedStateRouter,
  sharing: sharingRouter,
});

export type CourseRouter = typeof courseRouter;

export const courseTrpcRouter = createExpressMiddleware({
  router: courseRouter,
  createContext,
  onError: handleTrpcError,
});
