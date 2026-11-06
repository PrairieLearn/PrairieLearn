import { timingSafeEqual } from 'node:crypto';

import { Router } from 'express';
import { z } from 'zod';

import { UsageReportSchema } from '@prairielearn/course-agent-types';
import { HttpStatusError } from '@prairielearn/error';
import { logger } from '@prairielearn/logger';
import * as Sentry from '@prairielearn/sentry';
import { parseRequest } from '@prairielearn/zod';

import { config } from '../../lib/config.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { recordCourseAgentUsageReport } from '../lib/course-agent/budget.js';

const router = Router();
const PostRequestSchemas = {
  params: z.strictObject({ agentId: z.uuid() }),
  query: z.strictObject({}),
  body: UsageReportSchema,
};

router.post(
  '/conversations/:agentId/usage',
  typedAsyncHandler<'plain'>(async (req, res) => {
    try {
      const supplied = Buffer.from(req.headers.authorization ?? '');
      // Accept every configured token so the Worker's secret can rotate before or after PL's.
      const authorized = (config.courseAgentServiceToken ?? []).some((token) => {
        const expected = Buffer.from(`Bearer ${token}`);
        return supplied.length === expected.length && timingSafeEqual(supplied, expected);
      });
      if (!authorized) throw new HttpStatusError(401, 'Unauthorized');
      const { params, body } = parseRequest(req, PostRequestSchemas);
      // Denials are decisions, not errors: the Worker reads them from a 200 response.
      res.json(await recordCourseAgentUsageReport(params.agentId, body));
    } catch (error) {
      const status = error instanceof HttpStatusError ? error.status : 503;
      if (!(error instanceof HttpStatusError)) {
        logger.error('Course agent usage request failed', error);
        Sentry.captureException(error);
      }
      res.status(status).json({
        message: error instanceof HttpStatusError ? error.message : 'Could not record AI usage.',
      });
    }
  }),
);

export default router;
