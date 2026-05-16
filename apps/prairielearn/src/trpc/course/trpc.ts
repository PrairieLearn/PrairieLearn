import { createExpressMiddleware } from '@trpc/server/adapters/express';

import { handleTrpcError } from '../../lib/trpc.js';

import { aiDraftFilesRouter } from './ai-draft-files.js';
import { courseStaffRouter } from './course-staff.js';
import { createContext, t } from './init.js';
import { sharingRouter } from './sharing.js';

const courseRouter = t.router({
  aiDraftFiles: aiDraftFilesRouter,
  courseStaff: courseStaffRouter,
  sharing: sharingRouter,
});

export type CourseRouter = typeof courseRouter;

export const courseTrpcRouter = createExpressMiddleware({
  router: courseRouter,
  createContext,
  onError: handleTrpcError,
});
