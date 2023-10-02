import { Router } from 'express';
// import util = require('util');
// import fs = require('fs-extra');
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

    // TODO: do we actually need this check for the public page? probably not
    // await util.promisify(fs.access)(res.locals.course.path);

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
