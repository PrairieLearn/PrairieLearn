import { createExpressMiddleware } from '@trpc/server/adapters/express';

import { config } from '../../lib/config.js';
import { handleTrpcError } from '../../lib/trpc.js';

import { aiDraftFilesRouter } from './ai-draft-files.js';
import { courseStaffRouter } from './course-staff.js';
import { createContext, t } from './init.js';
import { questionsRouter } from './questions.js';
import { sharingRouter } from './sharing.js';

const courseRouter = t.router({
  aiDraftFiles: aiDraftFilesRouter,
  courseStaff: courseStaffRouter,
  questions: questionsRouter,
  sharing: sharingRouter,
});

export type CourseRouter = typeof courseRouter;

export const courseTrpcRouter = createExpressMiddleware({
  router: courseRouter,
  createContext,
  onError: handleTrpcError,
  // Draft file uploads are sent as `multipart/form-data` bodies; bound them the
  // same way the previous multer-based upload route did.
  maxBodySize: config.fileUploadMaxBytes,
});
