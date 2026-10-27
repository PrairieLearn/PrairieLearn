import { timingSafeEqual } from 'node:crypto';

import { Router } from 'express';
import { z } from 'zod';

import { type BudgetError, BudgetRequestSchema } from '@prairielearn/course-agent-types';
import { HttpStatusError } from '@prairielearn/error';
import { logger } from '@prairielearn/logger';
import { parseRequest } from '@prairielearn/zod';

import { config } from '../../lib/config.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { applyCourseAgentBudgetRequest } from '../lib/course-agent/budget.js';

const router = Router();
const PostRequestSchemas = {
  params: z.strictObject({ agentId: z.uuid() }),
  query: z.strictObject({}),
  body: BudgetRequestSchema,
};

router.post(
  '/conversations/:agentId/usage',
  typedAsyncHandler<'plain'>(async (req, res) => {
    try {
      const supplied = Buffer.from(req.headers.authorization ?? '');
      const expected = Buffer.from(`Bearer ${config.courseAgentServiceToken ?? ''}`);
      if (
        !config.courseAgentServiceToken ||
        supplied.length !== expected.length ||
        !timingSafeEqual(supplied, expected)
      ) {
        throw new HttpStatusError(401, 'Unauthorized');
      }
      const { params, body } = parseRequest(req, PostRequestSchemas);
      const result = await applyCourseAgentBudgetRequest(params.agentId, body);
      const allocation = result.body.allocation;
      if (allocation.status === 'denied' && allocation.reason === 'hourly_limit') {
        res.setHeader(
          'Retry-After',
          Math.max(0, Math.ceil((Date.parse(allocation.retryAt) - Date.now()) / 1000)),
        );
      }
      res.status(result.status).json(result.body);
    } catch (error) {
      const status = error instanceof HttpStatusError ? error.status : 503;
      const codes: Record<number, BudgetError['error']['code']> = {
        400: 'invalid_request',
        401: 'unauthorized',
        404: 'not_found',
        409: 'report_conflict',
      };
      if (!(error instanceof HttpStatusError)) {
        logger.error('Course agent usage request failed', error);
      }
      res.status(status).json({
        error: {
          code: codes[status] ?? 'unavailable',
          message: error instanceof HttpStatusError ? error.message : 'Could not record AI usage.',
        },
      } satisfies BudgetError);
    }
  }),
);

export default router;
