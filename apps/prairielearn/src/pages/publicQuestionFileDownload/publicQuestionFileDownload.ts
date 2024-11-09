import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import * as error from '@prairielearn/error';

import { selectCourseById } from '../../models/course.js';
import { selectQuestionById } from '../../models/question.js';

const router = Router({ mergeParams: true });

router.get(
  '/*',
  asyncHandler(async (req, res) => {
    const course = await selectCourseById(req.params.course_id);
    const question = await selectQuestionById(req.params.question_id);

    if (!question.share_source_publicly || course.id !== question.course_id) {
      throw new error.HttpStatusError(404, 'Not Found');
    }
    if (req.query.type) res.type(req.query.type.toString());
    if (req.query.attachment) res.attachment(req.query.attachment.toString());
    res.sendFile(req.params[0], { root: course.path });
  }),
);

export default router;
