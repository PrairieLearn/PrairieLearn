import type { Request, Response } from 'express';

import * as error from '@prairielearn/error';

import { selectOptionalAssessmentById } from '../models/assessment.js';

import { UserSchema } from './db-types.js';

export async function setPublicAssessmentLocals(req: Request, res: Response) {
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
