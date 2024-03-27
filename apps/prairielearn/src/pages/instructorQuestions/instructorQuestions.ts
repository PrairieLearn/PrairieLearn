import ERR = require('async-stacktrace');
import { Router } from 'express';
import * as error from '@prairielearn/error';
import { logger } from '@prairielearn/logger';
import * as sqldb from '@prairielearn/postgres';
import { QuestionAddEditor } from '../../lib/editors';
import * as fs from 'fs-extra';
import { QuestionsPage } from './instructorQuestions.html';
import { QuestionsPageDataAnsified, selectQuestionsForCourse } from '../../models/questions';
import asyncHandler = require('express-async-handler');
import { selectCourseInstancesWithStaffAccess } from '../../models/course-instances';

const router = Router();
const sql = sqldb.loadSqlEquiv(__filename);

router.get(
  '/',
  asyncHandler(async function (req, res) {
    const courseInstances = await selectCourseInstancesWithStaffAccess({
      course_id: res.locals.course.id,
      user_id: res.locals.user.user_id,
      authn_user_id: res.locals.authn_user.user_id,
      is_administrator: res.locals.is_administrator,
      authn_is_administrator: res.locals.authz_data.authn_is_administrator,
    });

    const questions: QuestionsPageDataAnsified[] = await selectQuestionsForCourse(
      res.locals.course.id,
      courseInstances.map((ci) => ci.id),
    );

    const courseDirExists = await fs.pathExists(res.locals.course.path);
    res.send(
      QuestionsPage({
        questions,
        course_instances: courseInstances,
        showAddQuestionButton:
          res.locals.authz_data.has_course_permission_edit &&
          !res.locals.course.example_course &&
          courseDirExists,
        resLocals: res.locals,
      }),
    );
  }),
);

router.post('/', (req, res, next) => {
  if (req.body.__action === 'add_question') {
    const editor = new QuestionAddEditor({
      locals: res.locals,
    });
    editor.canEdit((err) => {
      if (ERR(err, next)) return;
      editor.doEdit((err, job_sequence_id) => {
        if (ERR(err, (e) => logger.error('Error in doEdit()', e))) {
          res.redirect(res.locals.urlPrefix + '/edit_error/' + job_sequence_id);
        } else {
          sqldb.queryOneRow(
            sql.select_question_id_from_uuid,
            { uuid: editor.uuid, course_id: res.locals.course.id },
            (err, result) => {
              if (ERR(err, next)) return;
              res.redirect(
                res.locals.urlPrefix + '/question/' + result.rows[0].question_id + '/settings',
              );
            },
          );
        }
      });
    });
  } else {
    next(error.make(400, `unknown __action: ${req.body.__action}`));
  }
});

export default router;
