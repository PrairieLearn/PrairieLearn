import { createExpressMiddleware } from '@trpc/server/adapters/express';

import { handleTrpcError } from '../../lib/trpc.js';

import { createContext, t } from './init.js';
import { instanceAdminSettingsRouter } from './instance-admin-settings.js';
import { studentLabelsRouter } from './student-labels.js';

export const courseInstanceRouter = t.router({
  instanceAdminSettings: instanceAdminSettingsRouter,
  studentLabels: studentLabelsRouter,
});

export type CourseInstanceRouter = typeof courseInstanceRouter;

export const courseInstanceTrpcRouter = createExpressMiddleware({
  router: courseInstanceRouter,
  createContext,
  onError: handleTrpcError,
});
