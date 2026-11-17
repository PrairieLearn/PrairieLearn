import { createExpressMiddleware } from '@trpc/server/adapters/express';

import { config } from '../../lib/config.js';
import { handleTrpcError } from '../../lib/trpc.js';

import { accessControlRouter } from './access-control.js';
import { assessmentGroupsRouter } from './assessment-groups.js';
import { assessmentInstancesRouter } from './assessment-instances.js';
import { assessmentQuestionsRouter } from './assessment-questions.js';
import { assessmentSettingsRouter } from './assessment-settings.js';
import { assessmentUploadsRouter } from './assessment-uploads.js';
import { createContext, t } from './init.js';

const assessmentRouter = t.router({
  accessControl: accessControlRouter,
  assessmentQuestions: assessmentQuestionsRouter,
  assessmentSettings: assessmentSettingsRouter,
  assessmentGroups: assessmentGroupsRouter,
  assessmentInstances: assessmentInstancesRouter,
  assessmentUploads: assessmentUploadsRouter,
});

export type AssessmentRouter = typeof assessmentRouter;

export const assessmentTrpcRouter = createExpressMiddleware({
  router: assessmentRouter,
  createContext,
  onError: handleTrpcError,
  // Uploads are sent as `multipart/form-data` bodies; bound them the same way
  // the previous multer-based upload route did.
  maxBodySize: config.fileUploadMaxBytes,
});
