import asyncHandler from 'express-async-handler';

import * as error from '@prairielearn/error';

import { UserSchema } from '../lib/db-types.js';
import { selectOptionalAssessmentById } from '../models/assessment.js';

export default asyncHandler(async (req, res, next) => {
  const assessment = await selectOptionalAssessmentById(req.params.assessment_id);

  if (
    !assessment?.share_source_publicly ||
    assessment.course_instance_id !== res.locals.course_instance.id ||
    assessment.deleted_at != null
  ) {
    throw new error.HttpStatusError(404, 'Not Found');
  }

  res.locals.user = UserSchema.parse(res.locals.authn_user);
  res.locals.authz_data = { user: res.locals.user };
  res.locals.assessment = assessment;
  res.locals.navPage = 'public_assessment';
  next();
});
