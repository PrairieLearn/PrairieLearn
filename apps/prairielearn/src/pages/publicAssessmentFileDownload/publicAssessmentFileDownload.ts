import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { getPaths } from '../../lib/instructorFiles.js';
import { setPublicAssessmentLocals } from '../../lib/publicAssessment.js';

const router = Router({ mergeParams: true });

router.get(
  '/*',
  asyncHandler(async (req, res) => {
    await setPublicAssessmentLocals(req, res);
    // Calling this only to catch illegal paths (e.g., working path outside assessment path)
    getPaths(req.params[0], res.locals);

    if (req.query.type) res.type(req.query.type.toString());
    if (req.query.attachment) res.attachment(req.query.attachment.toString());
    res.sendFile(req.params[0], { root: res.locals.course.path });
  }),
);

export default router;
