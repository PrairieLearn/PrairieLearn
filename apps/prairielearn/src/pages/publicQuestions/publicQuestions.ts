import { Router } from 'express';
import util = require('util');
import fs = require('fs-extra');
import { QuestionsPage } from './publicQuestions.html';
import { QuestionsPageDataAnsified, selectQuestionsForCourse } from '../../models/questions';
import asyncHandler = require('express-async-handler');

const router = Router();

router.get(
  '/',
  asyncHandler(async function (req, res) {
    const questions: QuestionsPageDataAnsified[] = await selectQuestionsForCourse(
      res.locals.course.id,
      res.locals.authz_data.course_instances,
    );

    let needToSync = false;
    try {
      await util.promisify(fs.access)(res.locals.course.path);
    } catch (err) {
      if (err.code === 'ENOENT') {
        needToSync = true;
      } else {
        throw err;
      }
    }

    res.send(
      QuestionsPage({
        questions: questions,
        showAddQuestionButton:
          res.locals.authz_data.has_course_permission_edit &&
          !res.locals.course.example_course &&
          !needToSync,
        resLocals: res.locals,
      }),
    );
  }),
);

export default router;
