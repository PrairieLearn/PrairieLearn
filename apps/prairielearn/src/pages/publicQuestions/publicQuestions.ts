import { Router } from 'express';
import { QuestionsPage } from './publicQuestions.html';
import { selectPublicQuestionsForCourse } from '../../models/questions';
import asyncHandler = require('express-async-handler');

const router = Router({ mergeParams: true });

router.get(
  '/',
  asyncHandler(async function (req, res) {
    // res.locals.course = await selectCourse({ course_id: req.params.course_id });
    // HARD CODE until we get the public question page merged to master
    res.locals.course = {
      id: 2,
      short_name: 'QA 101',
      title: 'Test Course',
      sharing_name: 'test-course',
    };

    // TODO verify that the course has sharing enabled, if not then 404!

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
