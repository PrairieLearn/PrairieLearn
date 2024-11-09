import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import * as error from '@prairielearn/error';

import { selectCourseById } from '../../models/course.js';
import { selectQuestionById } from '../../models/question.js';

const router = Router({ mergeParams: true });

async function setLocals(req, res) {
  const course = await selectCourseById(req.params.course_id);
  res.locals.question = await selectQuestionById(req.params.question_id);

  if (!res.locals.question.share_source_publicly || course.id !== res.locals.question.course_id) {
    throw new error.HttpStatusError(404, 'Not Found');
  }
}

router.get(
  '/*',
  asyncHandler(async (req, res) => {
    await setLocals(req, res);
    if (req.query.type) res.type(req.query.type.toString());
    if (req.query.attachment) res.attachment(req.query.attachment.toString());
    res.sendFile(req.params[0], { root: res.locals.course.path });
  }),
);

export default router;
