import { timingSafeEqual } from 'node:crypto';

import express, { Router } from 'express';
import { z } from 'zod';

import {
  MAX_REVIEW_BYTES,
  ReviewSnapshotSchema,
  UsageReportSchema,
} from '@prairielearn/course-agent-types';
import { HttpStatusError } from '@prairielearn/error';
import { parseRequest } from '@prairielearn/zod';

import { config } from '../../lib/config.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { approveReviewAutomatically } from '../lib/course-agent/apply-changes.js';
import { recordCourseAgentUsageReport } from '../lib/course-agent/usage.js';

/** Requests from the course agent service, which authenticates with its service token. */
const router = Router();

router.use((req, _res, next) => {
  const supplied = Buffer.from(req.headers.authorization ?? '');
  // Accept every configured token so the Worker's secret can rotate before or after PL's.
  const authorized = (config.courseAgentServiceToken ?? []).some((token) => {
    const expected = Buffer.from(`Bearer ${token}`);
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  });
  if (!authorized) throw new HttpStatusError(401, 'Unauthorized');
  next();
});

// The server's shared body parser skips these routes, so a body is parsed only once the service
// token is accepted. An automatic approval carries the review's files, which need a higher limit.
router.use(express.json({ limit: MAX_REVIEW_BYTES + 1024 * 1024 }));

const UsageRequestSchemas = {
  params: z.strictObject({ agentId: z.uuid() }),
  query: z.strictObject({}),
  body: UsageReportSchema,
};

router.post(
  '/conversations/:agentId/usage',
  typedAsyncHandler<'plain'>(async (req, res) => {
    const { params, body } = parseRequest(req, UsageRequestSchemas);
    // Denials are decisions, not errors: the Worker reads them from a 200 response.
    res.json(await recordCourseAgentUsageReport(params.agentId, body));
  }),
);

const ApproveRequestSchemas = {
  params: z.strictObject({ agentId: z.uuid(), reviewId: z.uuid() }),
  query: z.strictObject({}),
  body: z.strictObject({ snapshot: ReviewSnapshotSchema }),
};

// The conversation approved a review submitted while its owner chose "Always approve", and sends
// the changes to save.
router.post(
  '/conversations/:agentId/reviews/:reviewId/approve',
  typedAsyncHandler<'plain'>(async (req, res) => {
    const { params, body } = parseRequest(req, ApproveRequestSchemas);
    res.json(
      await approveReviewAutomatically(params.agentId, {
        id: params.reviewId,
        snapshot: body.snapshot,
      }),
    );
  }),
);

export default router;
