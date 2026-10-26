import { createExpressMiddleware } from '@trpc/server/adapters/express';
import type { RequestHandler } from 'express';

import { MAX_PRINT_EXPORT_UPLOAD_BYTES } from '../../lib/client/print-packet.js';
import { config } from '../../lib/config.js';
import { handleTrpcError } from '../../lib/trpc.js';

import { accessControlRouter } from './access-control.js';
import { assessmentGroupsRouter } from './assessment-groups.js';
import { assessmentInstancesRouter } from './assessment-instances.js';
import { assessmentQuestionsRouter } from './assessment-questions.js';
import { assessmentSettingsRouter } from './assessment-settings.js';
import { assessmentUploadsRouter } from './assessment-uploads.js';
import { createContext, t } from './init.js';
import { printableAssessmentExportRouter } from './printable-assessment-export.js';
import { printableAssessmentsRouter } from './printable-assessments.js';

const assessmentRouter = t.router({
  accessControl: accessControlRouter,
  assessmentQuestions: assessmentQuestionsRouter,
  assessmentSettings: assessmentSettingsRouter,
  assessmentGroups: assessmentGroupsRouter,
  assessmentInstances: assessmentInstancesRouter,
  assessmentUploads: assessmentUploadsRouter,
  printableAssessments: printableAssessmentsRouter,
  printableAssessmentExport: printableAssessmentExportRouter,
});

export type AssessmentRouter = typeof assessmentRouter;

const assessmentMiddleware = createExpressMiddleware({
  router: assessmentRouter,
  createContext,
  onError: handleTrpcError,
  // Uploads are sent as `multipart/form-data` bodies; bound them the same way
  // the previous multer-based upload route did.
  maxBodySize: config.fileUploadMaxBytes,
});

const printableAssessmentPdfMiddleware = createExpressMiddleware({
  router: assessmentRouter,
  createContext,
  onError: handleTrpcError,
  maxBodySize: MAX_PRINT_EXPORT_UPLOAD_BYTES,
});

export const assessmentTrpcRouter: RequestHandler = (req, res, next) => {
  const middleware =
    req.path === '/printableAssessmentExport.pdf'
      ? printableAssessmentPdfMiddleware
      : assessmentMiddleware;
  middleware(req, res, next);
};
