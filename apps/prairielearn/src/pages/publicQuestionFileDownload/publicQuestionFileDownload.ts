import { type Request, type Response, Router } from 'express';
import asyncHandler from 'express-async-handler';

import * as error from '@prairielearn/error';

import { UserSchema } from '../../lib/db-types.js';
import { idsEqual } from '../../lib/id.js';
import { getPaths } from '../../lib/instructorFiles.js';
import { selectQuestionById } from '../../models/question.js';

const router = Router({ mergeParams: true });

async function setLocals(req: Request, res: Response) {
  res.locals.user = UserSchema.parse(res.locals.authn_user);
  res.locals.authz_data = { user: res.locals.user };
  res.locals.question = await selectQuestionById(req.params.question_id);

  if (
    res.locals.question.deleted_at != null ||
    !res.locals.question.share_source_publicly ||
    !idsEqual(res.locals.question.course_id, res.locals.course.id)
  ) {
    throw new error.HttpStatusError(404, 'Not Found');
  }
}

router.get(
  '/*',
  asyncHandler(async (req, res) => {
    await setLocals(req, res);
    // Calling this only to catch illegal paths (e.g., working path outside question path)
    getPaths(req.params[0], res.locals);

    if (req.query.type) res.type(req.query.type.toString());
    if (req.query.attachment) res.attachment(req.query.attachment.toString());
    res.sendFile(req.params[0], { root: res.locals.course.path });
  }),
);

export default router;
