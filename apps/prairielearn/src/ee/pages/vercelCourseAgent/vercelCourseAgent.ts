import { Router } from 'express';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import { parseRequestBody } from '@prairielearn/zod';

import { extractPageContext } from '../../../lib/client/page-context.js';
import { typedAsyncHandler } from '../../../lib/res-locals.js';
import { claimConversation } from '../../lib/vercel-course-agent/conversations.js';
import { streamConversation } from '../../lib/vercel-course-agent/stream.js';

const PostBodySchema = z.object({
  conversationId: z.uuid(),
  prompt: z.string().trim().min(1).max(32_000),
});
const router = Router();

// The SDK owns its SSE protocol. Control operations use the course tRPC router.
router.post(
  '/',
  typedAsyncHandler<'course'>(async (req, res) => {
    const { conversationId, prompt } = parseRequestBody(req, PostBodySchema);
    const { course, authn_user: authnUser } = extractPageContext(res.locals, {
      pageType: 'course',
      accessType: 'instructor',
    });
    if (!res.locals.vercel_course_agent_enabled) {
      throw new HttpStatusError(403, 'Course agent is not enabled.');
    }
    const conversation = claimConversation(conversationId, {
      courseId: course.id,
      userId: res.locals.user.id,
      authnUserId: authnUser.id,
    });
    await streamConversation(conversation, prompt, res);
  }),
);

export default router;
