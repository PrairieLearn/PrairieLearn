import { type ErrorRequestHandler, Router } from 'express';
import { z } from 'zod';

import { CourseActionRunSchema } from '@prairielearn/course-agent-types';
import { HttpStatusError } from '@prairielearn/error';
import { logger } from '@prairielearn/logger';

import { CoursePageAuthzDataSchema } from '../../lib/authz-data-lib.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { courseAgentEnabled } from '../lib/course-agent/access.js';
import { CourseActionError } from '../lib/course-agent/actions/action.js';
import { COURSE_AGENT_ACTIONS, courseActionCatalog } from '../lib/course-agent/actions/index.js';

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

// Runs an action as the conversation's user. middlewares/authn.ts has already checked that the
// conversation is in this course and authenticated the request as its user.
router.post(
  '/:action',
  typedAsyncHandler<'course'>(async (req, res) => {
    const body = CourseActionRunSchema.safeParse(req.body);
    if (!body.success) throw new HttpStatusError(400, z.prettifyError(body.error));
    const name = req.params.action;
    if (!Object.hasOwn(COURSE_AGENT_ACTIONS, name)) {
      throw new HttpStatusError(
        404,
        `Unknown action "${name}". Actions: ${Object.keys(COURSE_AGENT_ACTIONS).join(', ')}.`,
      );
    }
    const log = {
      callId: body.data.id,
      conversation: req.header('X-Course-Agent-Conversation'),
      action: name,
      courseId: res.locals.course.id,
      userId: res.locals.authn_user.id,
    };
    try {
      const outcome = await COURSE_AGENT_ACTIONS[name].run(
        {
          course: res.locals.course,
          user: res.locals.authn_user,
          // The agent's requests have no browser session, which extractPageContext would require.
          authz_data: CoursePageAuthzDataSchema.parse(res.locals.authz_data),
        },
        body.data.input,
      );
      // Inputs can name students, so only the action and who ran it are logged.
      logger.info('Course agent action succeeded', log);
      res.send(outcome);
    } catch (error) {
      logger.info('Course agent action failed', {
        ...log,
        refused: error instanceof CourseActionError,
      });
      if (error instanceof CourseActionError) throw new HttpStatusError(400, error.message);
      throw error;
    }
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
