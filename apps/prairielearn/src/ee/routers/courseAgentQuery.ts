import { timingSafeEqual } from 'node:crypto';

import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import { parseRequestBody } from '@prairielearn/zod';

import { config } from '../../lib/config.js';
import { selectCoursePermissionForUser } from '../../models/course-permissions.js';
import { selectCourseById } from '../../models/course.js';
import { selectInstitutionForCourse } from '../../models/institution.js';
import { selectUserById } from '../../models/user.js';
import { courseAgentEnabled } from '../lib/course-agent/access.js';
import {
  CourseAgentQueryError,
  courseAgentQueryAvailable,
  runCourseAgentQuery,
} from '../lib/course-agent/query.js';
import { selectOptionalCourseAgentConversationByAgentConversationId } from '../models/course-agent-conversation.js';

const router = Router();
const BodySchema = z.object({
  conversation_id: z.uuid(),
  query: z.string().min(1).max(100_000),
});

function isServiceRequest(header: string | undefined) {
  const supplied = Buffer.from(header ?? '');
  return (config.courseAgentServiceToken ?? []).some((token) => {
    const expected = Buffer.from(`Bearer ${token}`);
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  });
}

// The course agent service calls this when the agent runs its query tool. The
// user and course come from PL's conversation record, never from the agent.
router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!isServiceRequest(req.headers.authorization)) {
      throw new HttpStatusError(401, 'Unauthorized');
    }
    if (!courseAgentQueryAvailable()) {
      throw new HttpStatusError(503, 'Course data queries are not configured.');
    }
    const body = parseRequestBody(req, BodySchema);
    const conversation = await selectOptionalCourseAgentConversationByAgentConversationId(
      body.conversation_id,
    );
    if (!conversation) throw new HttpStatusError(404, 'Conversation not found.');
    const course = await selectCourseById(conversation.course_id);
    const role = await selectCoursePermissionForUser({
      course_id: course.id,
      user_id: conversation.user_id,
    });
    const enabled = await courseAgentEnabled({
      course,
      institution: await selectInstitutionForCourse({ course_id: course.id }),
      authn_user: await selectUserById(conversation.user_id),
      authz_data: {
        has_course_permission_own: role === 'Owner',
        authn_has_course_permission_own: role === 'Owner',
      },
    });
    if (!enabled) throw new HttpStatusError(403, 'Course data queries require course ownership.');

    try {
      const result = await runCourseAgentQuery({
        user_id: conversation.user_id,
        course_id: course.id,
        query: body.query,
      });
      res.type('application/x-ndjson').send(result);
    } catch (err) {
      if (!(err instanceof CourseAgentQueryError)) throw err;
      res.status(422).type('text/plain').send(err.message);
    }
  }),
);

export default router;
