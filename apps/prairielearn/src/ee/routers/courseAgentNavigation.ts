import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';

import { NavigationTargetSchema } from '@prairielearn/course-agent-types';
import { HttpStatusError } from '@prairielearn/error';

import { resolveAgentPageUrl } from '../lib/course-agent/pages.js';

const router = Router({ mergeParams: true });

// A POST because the target is a JSON document; it only reads data.
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const target = NavigationTargetSchema.safeParse(req.body);
    if (!target.success) throw new HttpStatusError(400, z.prettifyError(target.error));
    res.send({ url: await resolveAgentPageUrl(res.locals.course, target.data) });
  }),
);

export default router;
