import { Router } from 'express';
import { QuestionsPage } from './publicQuestions.html';
import { selectPublicQuestionsForCourse } from '../../models/questions';
import { selectCourse } from '../../models/course';
import asyncHandler = require('express-async-handler');
import { features } from '../../lib/features/index';
import error = require('@prairielearn/error');
const router = Router({ mergeParams: true });

router.get(
  '/',
  asyncHandler(async function (req, res) {
    res.locals.course = await selectCourse({ course_id: req.params.course_id });
    const questionSharingEnabled = await features.enabled('question-sharing', {
      course_id: res.locals.course.id,
      institution_id: res.locals.course.institution_id
    });

    if (!questionSharingEnabled) {
      throw error.make(404, 'Not Found');
    }

    const questions = await selectPublicQuestionsForCourse(res.locals.course.id);
    res.send(
      QuestionsPage({
        questions: questions,
        showAddQuestionButton: false,
        qidPrefix: '@' + res.locals.course.sharing_name + '/',
        resLocals: res.locals,
      }),
    );
  }),
);

export = router;
