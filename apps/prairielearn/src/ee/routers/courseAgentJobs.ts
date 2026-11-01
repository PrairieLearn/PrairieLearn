import { timingSafeEqual } from 'node:crypto';

import { Router } from 'express';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import { IdSchema, parseRequestParams } from '@prairielearn/zod';

import { config } from '../../lib/config.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { getReviewJob, getReviewJobOutcome } from '../lib/course-agent/apply-changes.js';
import { selectOptionalCourseAgentConversationByAgentId } from '../models/course-agent-conversation.js';

const router = Router();
const ParamsSchema = z.object({ agentId: z.uuid(), jobSequenceId: IdSchema });

router.get(
  '/conversations/:agentId/jobs/:jobSequenceId/outcome',
  typedAsyncHandler<'plain'>(async (req, res) => {
    const { agentId, jobSequenceId } = parseRequestParams(req, ParamsSchema);
    const expected = Buffer.from(`Bearer ${config.courseAgentServiceToken ?? ''}`);
    const supplied = Buffer.from(req.headers.authorization ?? '');
    if (
      !config.courseAgentServiceToken ||
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    ) {
      throw new HttpStatusError(401, 'Unauthorized');
    }
    const conversation = await selectOptionalCourseAgentConversationByAgentId(agentId);
    if (!conversation) throw new HttpStatusError(404, 'Conversation not found.');
    const sequence = await getReviewJob(conversation, jobSequenceId);
    res.json(getReviewJobOutcome(sequence));
  }),
);

export default router;
