import { createExpressMiddleware } from '@trpc/server/adapters/express';
import type { RequestHandler } from 'express';

import { MAX_PRINT_EXPORT_UPLOAD_BYTES } from '../../lib/client/printing/print-packet.js';
import { config } from '../../lib/config.js';
import { handleTrpcError } from '../../lib/trpc.js';

import { accessControlRouter } from './access-control.js';
import { assessmentGroupsRouter } from './assessment-groups.js';
import { assessmentInstancesRouter } from './assessment-instances.js';
import { assessmentQuestionsRouter } from './assessment-questions.js';
import { assessmentSettingsRouter } from './assessment-settings.js';
import { assessmentUploadsRouter } from './assessment-uploads.js';
import { createContext, t } from './init.js';
import { printExportsRouter } from './print-exports.js';
import { printFormsRouter } from './print-forms.js';

const assessmentRouter = t.router({
  accessControl: accessControlRouter,
  assessmentQuestions: assessmentQuestionsRouter,
  assessmentSettings: assessmentSettingsRouter,
  assessmentGroups: assessmentGroupsRouter,
  assessmentInstances: assessmentInstancesRouter,
  assessmentUploads: assessmentUploadsRouter,
  printForms: printFormsRouter,
  printExports: printExportsRouter,
});

export type AssessmentRouter = typeof assessmentRouter;

const assessmentMiddleware = createExpressMiddleware({
  router: assessmentRouter,
  createContext,
  onError: handleTrpcError,
  // This module is imported before configuration loads; read the limit per request.
  get maxBodySize() {
    return config.fileUploadMaxBytes;
  },
});

const printExportUploadMiddleware = createExpressMiddleware({
  router: assessmentRouter,
  createContext,
  onError: handleTrpcError,
  maxBodySize: MAX_PRINT_EXPORT_UPLOAD_BYTES,
});

export const assessmentTrpcRouter: RequestHandler = (req, res, next) => {
  const middleware =
    req.path === '/printExports.pdf' || req.path === '/printExports.preflight'
      ? printExportUploadMiddleware
      : assessmentMiddleware;
  middleware(req, res, next);
};
