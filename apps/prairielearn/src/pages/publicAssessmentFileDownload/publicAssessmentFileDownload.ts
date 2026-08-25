import { type Request, type Response, Router } from 'express';
import asyncHandler from 'express-async-handler';

import * as error from '@prairielearn/error';

import { UserSchema } from '../../lib/db-types.js';
import { getPaths } from '../../lib/instructorFiles.js';
import { selectOptionalAssessmentById } from '../../models/assessment.js';

const router = Router({ mergeParams: true });

async function setLocals(req: Request, res: Response) {
  res.locals.user = UserSchema.parse(res.locals.authn_user);
  res.locals.authz_data = { user: res.locals.user };
  const assessment = await selectOptionalAssessmentById(req.params.assessment_id);

  if (
    !assessment?.share_source_publicly ||
    assessment.course_instance_id !== res.locals.course_instance.id
  ) {
    throw new error.HttpStatusError(404, 'Not Found');
  }

  res.locals.assessment = assessment;
}

router.get(
  '/*',
  asyncHandler(async (req, res) => {
    await setLocals(req, res);
    // Calling this only to catch illegal paths (e.g., working path outside assessment path)
    getPaths(req.params[0], res.locals);

    if (req.query.type) res.type(req.query.type.toString());
    if (req.query.attachment) res.attachment(req.query.attachment.toString());
    res.sendFile(req.params[0], { root: res.locals.course.path });
  }),
);

export default router;
