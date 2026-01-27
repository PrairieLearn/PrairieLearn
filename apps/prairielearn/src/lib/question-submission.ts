import { omit } from 'es-toolkit';
import { type Request, type Response } from 'express';

import { HttpStatusError } from '@prairielearn/error';

import { selectAndAuthzVariant } from '../models/variant.js';

import { saveAndGradeSubmission, saveSubmission } from './grading.js';

export async function processSubmission(
  req: Request,
  res: Response,
  options: {
    /** Whether the submission is associated with a student assessment instance.  */
    studentSubmission?: boolean;
    /** Whether this processing is happening on a public question preview route. */
    publicQuestionPreview?: boolean;
  } = {},
): Promise<string> {
  let variant_id: string, submitted_answer: Record<string, any>;
  if (res.locals.question.type === 'Freeform') {
    variant_id = req.body.__variant_id;
    submitted_answer = omit(req.body, ['__action', '__csrf_token', '__variant_id']);
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
    user_id: res.locals.user.id,
    auth_user_id: res.locals.authn_user.id,
    submitted_answer,
    ...(options.studentSubmission
      ? {
          credit: res.locals.authz_result.credit,
          mode: res.locals.authz_data.mode,
          client_fingerprint_id: res.locals.client_fingerprint_id,
        }
      : {}),
  };
  const variant = await selectAndAuthzVariant({
    unsafe_variant_id: submission.variant_id,
    variant_course: res.locals.course,
    question_id: res.locals.question.id,
    course_instance_id: res.locals.course_instance?.id,
    instance_question_id: res.locals.instance_question?.id,
    authz_data: res.locals.authz_data,
    authn_user: res.locals.authn_user,
    user: res.locals.user,
    is_administrator: res.locals.is_administrator,
  });

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
    const ignoreGradeRateLimit = !options.studentSubmission;
    const ignoreRealTimeGradingDisabled = !options.studentSubmission;
    await saveAndGradeSubmission(
      submission,
      variant,
      res.locals.question,
      res.locals.course,
      ignoreGradeRateLimit,
      ignoreRealTimeGradingDisabled,
    );
    return submission.variant_id;
  } else if (req.body.__action === 'save') {
    await saveSubmission(submission, variant, res.locals.question, res.locals.course);
    return submission.variant_id;
  } else {
    throw new HttpStatusError(400, `unknown __action: ${req.body.__action}`);
  }
}
