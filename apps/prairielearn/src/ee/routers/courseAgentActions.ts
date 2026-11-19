import { type ErrorRequestHandler, Router } from 'express';
import { z } from 'zod';

import { CourseActionRequestSchema } from '@prairielearn/course-agent-types';
import { HttpStatusError } from '@prairielearn/error';

import { typedAsyncHandler } from '../../lib/res-locals.js';
import { courseAgentEnabled } from '../lib/course-agent/access.js';
import { courseActionCatalog } from '../lib/course-agent/actions/index.js';
import { requestCourseAction } from '../lib/course-agent/actions/requests.js';
import { selectOptionalCourseAgentConversationByAgentId } from '../models/course-agent-conversation.js';

const router = Router({ mergeParams: true });

const CATALOG = courseActionCatalog();

router.use(
  typedAsyncHandler<'course'>(async (req, res, next) => {
    if (!(await courseAgentEnabled(res.locals))) {
      throw new HttpStatusError(403, 'The course agent is not enabled for this course and user');
    }
    next();
  }),
);

router.get('/', (req, res) => {
  res.send(CATALOG);
});

// Records a request for the instructor to decide; the course itself does not change here.
router.post(
  '/:action',
  typedAsyncHandler<'course'>(async (req, res) => {
    const body = CourseActionRequestSchema.safeParse(req.body);
    if (!body.success) throw new HttpStatusError(400, z.prettifyError(body.error));
    // middlewares/authn.ts has already checked that this conversation is in this course and
    // authenticated the request as the conversation's user.
    const conversation = await selectOptionalCourseAgentConversationByAgentId(
      z.uuid().parse(req.header('X-Course-Agent-Conversation')),
    );
    if (!conversation) throw new HttpStatusError(403, 'Invalid course agent conversation');
    res.send(
      await requestCourseAction({
        ctx: {
          course: res.locals.course,
          user: res.locals.authn_user,
          is_administrator: res.locals.is_administrator,
          authz_data: res.locals.authz_data,
        },
        conversation,
        id: body.data.id,
        name: req.params.action,
        input: body.data.input,
      }),
    );
  }),
);

/**
 * The course agent shows error messages to the model, so client errors we raise are sent as JSON:
 * their messages explain how to fix the request. Other errors may expose internals, so they go to
 * the default error handler.
 */
router.use(((err, req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }
  if (err instanceof HttpStatusError && err.status < 500) {
    res.status(err.status).send({ message: err.message });
    return;
  }
  next(err);
}) satisfies ErrorRequestHandler);

export default router;
