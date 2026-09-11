import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';

import { CourseAgentUsageCallbackSchema } from '@prairielearn/course-agent-protocol';
import * as error from '@prairielearn/error';
import { getCheckedSignedTokenData } from '@prairielearn/signed-token';
import { parseRequestBody } from '@prairielearn/zod';

import { config } from '../../../lib/config.js';
import { handleCourseAgentUsage } from '../../lib/course-agent/usage.js';

const PostBodySchema = z.object({ token: z.string().max(16000) });
const router = Router();
router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (config.courseAgentRuntime !== 'cloudflare' || !config.courseAgentCapabilitySecret) {
      throw new error.HttpStatusError(503, 'Course agent is unavailable.');
    }
    const { token } = parseRequestBody(req, PostBodySchema);
    const parsed = CourseAgentUsageCallbackSchema.safeParse(
      getCheckedSignedTokenData(token, config.courseAgentCapabilitySecret, { maxAge: 60000 }),
    );
    if (!parsed.success || new Date(parsed.data.expiresAt).getTime() <= Date.now()) {
      throw new error.HttpStatusError(403, 'Invalid course-agent usage authorization.');
    }
    const result = await handleCourseAgentUsage(parsed.data);
    res.status(result.allowed ? 200 : 429).json(result);
  }),
);
export default router;
