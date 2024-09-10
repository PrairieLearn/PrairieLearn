import { type Request, type Response } from 'express';
import _ from 'lodash';

import { HttpStatusError } from '@prairielearn/error';

import { validateVariantAgainstQuestion } from '../models/variant.js';

import { saveAndGradeSubmission, saveSubmission } from './grading.js';

export async function processSubmission(
  req: Request,
  res: Response,
  studentSubmission = false,
): Promise<string> {
  let variant_id: string, submitted_answer: Record<string, any>;
  if (res.locals.question.type === 'Freeform') {
    variant_id = req.body.__variant_id;
    submitted_answer = _.omit(req.body, ['__action', '__csrf_token', '__variant_id']);
  } else {
    if (!req.body.postData) {
      throw new HttpStatusError(400, 'No postData');
    }
    let postData;
    try {
      postData = JSON.parse(req.body.postData);
    } catch {
      throw new HttpStatusError(400, 'JSON parse failed on body.postData');
    }
    variant_id = postData.variant ? postData.variant.id : null;
    submitted_answer = postData.submittedAnswer;
  }
  const submission = {
    variant_id,
    auth_user_id: res.locals.authn_user.user_id,
    submitted_answer,
    ...(studentSubmission
      ? {
          credit: res.locals.authz_result.credit,
          mode: res.locals.authz_data.mode,
          client_fingerprint_id: res.locals.client_fingerprint_id,
        }
      : {}),
  };
  const variant = await validateVariantAgainstQuestion(
    submission.variant_id,
    res.locals.question.id,
    res.locals.instance_question?.id,
  );

  // This is also checked when we try to save a submission, but if that check
  // fails, it's reported as a 500. We report with a friendlier error message
  // and status code here, which will keep this error from contributing to 5XX
  // monitors.
  //
  // We have a decent chance of hitting this code path if an instructor
  // force-breaks variants, as we could be in a case where the variant wasn't
  // broken when the user loaded the page but it is broken when they submit.
  if (variant.broken_at) {
    throw new HttpStatusError(403, 'Cannot submit to a broken variant');
  }

  if (req.body.__action === 'grade') {
    const overrideRateLimits = !studentSubmission;
    await saveAndGradeSubmission(
      submission,
      variant,
      res.locals.question,
      res.locals.course,
      overrideRateLimits,
    );
    return submission.variant_id;
  } else if (req.body.__action === 'save') {
    await saveSubmission(submission, variant, res.locals.question, res.locals.course);
    return submission.variant_id;
  } else {
    throw new HttpStatusError(400, `unknown __action: ${req.body.__action}`);
  }
}
