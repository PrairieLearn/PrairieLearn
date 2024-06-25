import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import * as error from '@prairielearn/error';

import { features } from '../../lib/features/index.js';
import { selectCourseById } from '../../models/course.js';
import { selectPublicQuestionsForCourse } from '../../models/questions.js';

import { QuestionsPage } from './publicQuestions.html.js';

const router = Router({ mergeParams: true });

router.get(
  '/',
  asyncHandler(async function (req, res) {
    res.locals.course = await selectCourseById(req.params.course_id);
    const questionSharingEnabled = await features.enabled('question-sharing', {
      course_id: res.locals.course.id,
      institution_id: res.locals.course.institution_id,
    });

    if (!questionSharingEnabled) {
      throw new error.HttpStatusError(404, 'Not Found');
    }

    const questions = await selectPublicQuestionsForCourse(res.locals.course.id);
    res.send(
      QuestionsPage({
        questions,
        showAddQuestionButton: false,
        resLocals: res.locals,
      }),
    );
  }),
);

export default router;
