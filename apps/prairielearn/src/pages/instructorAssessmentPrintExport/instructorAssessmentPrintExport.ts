import { pipeline } from 'node:stream/promises';

import { Router } from 'express';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import { IdSchema, parseRequestParams } from '@prairielearn/zod';

import { getPrintExportStream, selectPrintExportJob } from '../../lib/print-export-jobs.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { createAuthzMiddleware } from '../../middlewares/authzHelper.js';
import { requirePrintableAssessments } from '../../middlewares/requirePrintableAssessments.js';

const router = Router();
router.use(requirePrintableAssessments);
const ParamsSchema = z.object({ jobSequenceId: IdSchema, format: z.enum(['pdf', 'docx']) });

router.get(
  '/:jobSequenceId.:format',
  createAuthzMiddleware({
    oneOfPermissions: ['has_course_permission_preview'],
    unauthorizedUsers: 'block',
  }),
  typedAsyncHandler<'assessment'>(async (req, res) => {
    const { jobSequenceId, format } = parseRequestParams(req, ParamsSchema);
    const job = await selectPrintExportJob({
      jobSequenceId,
      assessmentId: res.locals.assessment.id,
      authnUserId: res.locals.authn_user.id,
    });
    if (!job?.result || job.result.format !== format) {
      throw new HttpStatusError(404, 'Export not found or no longer available');
    }
    const stream = await getPrintExportStream(job.result.key);
    res.setHeader('Cache-Control', 'private, no-store');
    res.type(
      format === 'docx'
        ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : 'application/pdf',
    );
    res.attachment(job.result.filename);
    await pipeline(stream, res);
  }),
);

export default router;
