import { type Request, type Response, Router } from 'express';
import asyncHandler from 'express-async-handler';

import { HttpStatusError } from '@prairielearn/error';

import { UserSchema } from '../../lib/db-types.js';
import { getDynamicFile } from '../../lib/question-variant.js';
import { selectCourseById } from '../../models/course.js';
import { selectQuestionById } from '../../models/question.js';
import { selectOptionalSubmissionById } from '../../models/submission.js';
import { selectAndAuthzVariant } from '../../models/variant.js';

async function generatedFilesHandler(
  req: Request,
  res: Response,
  options: { publicEndpoint: boolean },
) {
  if (options.publicEndpoint) {
    res.locals.course = await selectCourseById(req.params.course_id);
    res.locals.question = await selectQuestionById(req.params.question_id);
    res.locals.user = UserSchema.parse(res.locals.authn_user);

    if (
      !(res.locals.question.share_publicly || res.locals.question.share_source_publicly) ||
      res.locals.course.id !== res.locals.question.course_id
    ) {
      throw new HttpStatusError(404, 'Not Found');
    }
  }

  // For the submission endpoint we select the submission unsafely, but we later
  // rely on the variant authorization to ensure that the user has access to the
  // variant and, by consequence, the submission. If the submission doesn't
  // exist, the `selectAndAuthzVariant` function will handle that as a
  // non-existent variant and throw a 403 error.
  const submission = req.params.unsafe_submission_id
    ? await selectOptionalSubmissionById({ submission_id: req.params.unsafe_submission_id })
    : null;
  const variant = await selectAndAuthzVariant({
    unsafe_variant_id: submission ? submission.variant_id : req.params.unsafe_variant_id,
    variant_course: res.locals.course,
    question_id: res.locals.question.id,
    course_instance_id: res.locals.course_instance?.id,
    instance_question_id: res.locals.instance_question?.id,
    authz_data: res.locals.authz_data,
    authn_user: res.locals.authn_user,
    user: res.locals.user,
    is_administrator: res.locals.is_administrator,
    publicQuestionPreview: options.publicEndpoint,
  });

  const filename = req.params[0];
  const fileData = await getDynamicFile({
    filename,
    variant,
    submission,
    question: res.locals.question,
    variant_course: res.locals.course,
    user_id: res.locals.user.id,
    authn_user_id: res.locals.authn_user.id,
  });
  res.attachment(filename);
  res.send(fileData);
}

export default function (options = { publicEndpoint: false }) {
  const router = Router({ mergeParams: true });
  router.get(
    '/variant/:unsafe_variant_id(\\d+)/*',
    asyncHandler((req, res) => generatedFilesHandler(req, res, options)),
  );
  router.get(
    '/submission/:unsafe_submission_id(\\d+)/*',
    asyncHandler((req, res) => generatedFilesHandler(req, res, options)),
  );
  return router;
}
