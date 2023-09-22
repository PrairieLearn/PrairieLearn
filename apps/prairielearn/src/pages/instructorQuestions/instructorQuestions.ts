import ERR from 'async-stacktrace';
import { Router } from 'express';
import error = require('@prairielearn/error');
import { logger } from '@prairielearn/logger';
import sqldb = require('@prairielearn/postgres');
import { QuestionAddEditor } from '../../lib/editors';
import fs = require('fs-extra');
import async = require('async');
import { QuestionsPage } from './instructorQuestions.html';
import { selectQuestionsForCourse } from '../../models/questions';

const router = Router();
const sql = sqldb.loadSqlEquiv(__filename);

router.get('/', function (req, res, next) {
  let questions;
  async.series(
    [
      (callback) => {
        fs.access(res.locals.course.path, (err) => {
          if (err) {
            if (err.code === 'ENOENT') {
              res.locals.needToSync = true;
            } else {
              return ERR(err, callback);
            }
          }
          callback(null);
        });
      },
      async () => {
        questions = await selectQuestionsForCourse(
          res.locals.course.id,
          res.locals.authz_data.course_instances,
        );
      },
    ],
    (err) => {
      if (ERR(err, next)) return;
      res.send(
        QuestionsPage({
          questions: questions,
          resLocals: res.locals,
        }),
      );
    },
  );
});

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
    next(
      error.make(400, 'unknown __action: ' + req.body.__action, {
        locals: res.locals,
        body: req.body,
      }),
    );
  }
});

export = router;
