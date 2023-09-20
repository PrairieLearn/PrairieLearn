// @ts-check
const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();
const error = require('@prairielearn/error');
const path = require('path');
const { logger } = require('@prairielearn/logger');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const sqldb = require('@prairielearn/postgres');
const sql = sqldb.loadSqlEquiv(__filename);
const { QuestionAddEditor } = require('../../lib/editors');
const fs = require('fs-extra');
const async = require('async');
const { QuestionsPage } = require('./instructorQuestions.html');
const { getQuestions } = require('../../models/questions');

router.get('/', function (req, res, next) {
  let questions
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
        questions = await getQuestions(res.locals.course.id, res.locals.authz_data.course_instances);
        res.locals.has_legacy_questions = questions.some((row) => row.display_type !== 'v3');
      },
    ],
    (err) => {
      if (ERR(err, next)) return;
      res.send(
        QuestionsPage({
          questions: questions,
          resLocals: res.locals
        }),
      );
    },
  );
});

router.post('/', (req, res, next) => {
  debug(`Responding to post with action ${req.body.__action}`);
  if (req.body.__action === 'add_question') {
    debug(`Responding to action add_question`);
    const editor = new QuestionAddEditor({
      locals: res.locals,
    });
    editor.canEdit((err) => {
      if (ERR(err, next)) return;
      editor.doEdit((err, job_sequence_id) => {
        if (ERR(err, (e) => logger.error('Error in doEdit()', e))) {
          res.redirect(res.locals.urlPrefix + '/edit_error/' + job_sequence_id);
        } else {
          debug(`Get question_id from uuid=${editor.uuid} with course_id=${res.locals.course.id}`);
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

module.exports = router;
