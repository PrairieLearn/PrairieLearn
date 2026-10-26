import { pipeline } from 'node:stream/promises';

import { Router } from 'express';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import { IdSchema, parseRequestParams } from '@prairielearn/zod';

import { getPrintExportStream, selectPrintExportJob } from '../../lib/print-export-jobs.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { createAuthzMiddleware } from '../../middlewares/authzHelper.js';

const router = Router();
const ParamsSchema = z.object({ jobSequenceId: IdSchema });

router.get(
  '/:jobSequenceId.pdf',
  createAuthzMiddleware({
    oneOfPermissions: ['has_course_permission_preview'],
    unauthorizedUsers: 'block',
  }),
  typedAsyncHandler<'assessment'>(async (req, res) => {
    const { jobSequenceId } = parseRequestParams(req, ParamsSchema);
    const job = await selectPrintExportJob({
      jobSequenceId,
      assessmentId: res.locals.assessment.id,
      authnUserId: res.locals.authn_user.id,
    });
    if (!job?.result) throw new HttpStatusError(404, 'PDF not found or no longer available');
    const stream = await getPrintExportStream(job.result.key);
    res.setHeader('Cache-Control', 'private, no-store');
    res.type('application/pdf');
    res.attachment(job.result.filename);
    await pipeline(stream, res);
  }),
);

export default router;
