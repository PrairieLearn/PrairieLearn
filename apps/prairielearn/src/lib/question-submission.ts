import { omit } from 'lodash';
import { type Request, type Response } from 'express';

import * as error from '@prairielearn/error';

import { saveAndGradeSubmission, saveSubmission } from './grading';
import { idsEqual } from './id';
import { selectVariantById } from '../models/variant';
import { type Variant } from './db-types';

export async function validateVariantAgainstQuestion(
  unsafe_variant_id: string,
  question_id: string,
  instance_question_id: string | null = null,
): Promise<Variant> {
  const variant = await selectVariantById(unsafe_variant_id);
  if (variant == null || !idsEqual(variant.question_id, question_id)) {
    throw error.make(
      400,
      `Client-provided variant ID ${unsafe_variant_id} is not valid for question ID ${question_id}.`,
    );
  }
  if (
    instance_question_id != null &&
    (!variant.instance_question_id || !idsEqual(variant.instance_question_id, instance_question_id))
  ) {
    throw error.make(
      400,
      `Client-provided variant ID ${unsafe_variant_id} is not valid for instance question ID ${instance_question_id}.`,
    );
  }
  return variant;
}

export async function processSubmission(
  req: Request,
  res: Response,
  studentSubmission = false,
): Promise<string> {
  let variant_id: string, submitted_answer: Record<string, any>;
  if (res.locals.question.type === 'Freeform') {
    variant_id = req.body.__variant_id;
    submitted_answer = omit(req.body, ['__action', '__csrf_token', '__variant_id']);
  } else {
    if (!req.body.postData) {
      throw error.make(400, 'No postData');
    }
    let postData;
    try {
      postData = JSON.parse(req.body.postData);
    } catch (e) {
      throw error.make(400, 'JSON parse failed on body.postData');
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
    throw error.make(403, 'Cannot submit to a broken variant');
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
    throw error.make(400, `unknown __action: ${req.body.__action}`);
  }
}
