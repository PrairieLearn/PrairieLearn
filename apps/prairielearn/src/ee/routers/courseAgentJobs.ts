import { timingSafeEqual } from 'node:crypto';

import { Router } from 'express';
import { z } from 'zod';

import { PushSyncResultSchema, SavedJobOutcomeSchema } from '@prairielearn/course-agent-types';
import { HttpStatusError } from '@prairielearn/error';
import { IdSchema, parseRequestParams } from '@prairielearn/zod';

import { config } from '../../lib/config.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { getJobSequence } from '../../lib/server-jobs.js';
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
    const sequence = await getJobSequence(jobSequenceId, conversation.course_id);
    if (
      sequence.type !== 'course_agent_push_sync' ||
      sequence.authn_user_id !== conversation.user_id
    ) {
      throw new HttpStatusError(404, 'Job not found.');
    }
    const job = sequence.jobs[0];
    const running = job.status === 'Running';
    if (!running && job.data.agentConversationId !== agentId) {
      throw new HttpStatusError(404, 'Job not found.');
    }
    const result = PushSyncResultSchema.safeParse(job.data.result);
    res.json(
      SavedJobOutcomeSchema.parse({
        callId: typeof job.data.callId === 'string' ? job.data.callId : null,
        jobSequenceId,
        status: running ? 'running' : result.success ? 'completed' : 'blocked',
        result: result.success ? result.data : null,
        error:
          running || result.success
            ? null
            : typeof job.data.error === 'string'
              ? job.data.error
              : 'Publication was interrupted. Inspect the job before retrying.',
      }),
    );
  }),
);

export default router;
