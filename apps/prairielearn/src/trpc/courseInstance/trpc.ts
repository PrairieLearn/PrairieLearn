import { createExpressMiddleware } from '@trpc/server/adapters/express';

import { handleTrpcError } from '../../lib/trpc.js';

import { createContext, t } from './init.js';
import { instanceAdminSettingsRouter } from './instance-admin-settings.js';
import { qtiImportRouter } from './qti-import.js';
import { studentLabelsRouter } from './student-labels.js';

const courseInstanceRouter = t.router({
  qtiImport: qtiImportRouter,
  instanceAdminSettings: instanceAdminSettingsRouter,
  studentLabels: studentLabelsRouter,
});

export type CourseInstanceRouter = typeof courseInstanceRouter;

export const courseInstanceTrpcRouter = createExpressMiddleware({
  router: courseInstanceRouter,
  createContext,
  onError: handleTrpcError,
});
