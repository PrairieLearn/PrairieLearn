import { pipeline } from 'node:stream/promises';

import { Router } from 'express';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import { IdSchema, parseRequestParams } from '@prairielearn/zod';

import { getPrintExportStream, selectPrintExport } from '../../lib/print-exports.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { createAuthzMiddleware } from '../../middlewares/authzHelper.js';
import { requirePrintableAssessments } from '../../middlewares/requirePrintableAssessments.js';

const router = Router();
router.use(requirePrintableAssessments);
const ParamsSchema = z.object({ printExportId: IdSchema });

router.get(
  '/:printExportId',
  createAuthzMiddleware({
    oneOfPermissions: ['has_course_permission_preview'],
    unauthorizedUsers: 'block',
  }),
  typedAsyncHandler<'assessment'>(async (req, res) => {
    const { printExportId } = parseRequestParams(req, ParamsSchema);
    const printExport = await selectPrintExport({
      printExportId,
      assessmentId: res.locals.assessment.id,
      authnUserId: res.locals.authn_user.id,
    });
    if (!printExport?.output_key || printExport.expired) {
      throw new HttpStatusError(404, 'Export not found or no longer available');
    }
    const stream = await getPrintExportStream(printExport.output_key);
    res.setHeader('Cache-Control', 'private, no-store');
    res.type(
      printExport.format === 'docx'
        ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : 'application/pdf',
    );
    res.attachment(printExport.filename);
    await pipeline(stream, res);
  }),
);

export default router;
