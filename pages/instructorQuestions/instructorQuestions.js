const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();
const error = require('../../prairielib/lib/error');
const path = require('path');
const logger = require('../../lib/logger');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const sqldb = require('../../prairielib/lib/sql-db');
const sqlLoader = require('../../prairielib/lib/sql-loader');
const sql = sqlLoader.loadSqlEquiv(__filename);
const { QuestionAddEditor } = require('../../lib/editors');
const fs = require('fs-extra');
const async = require('async');
const _ = require('lodash');
const { default: AnsiUp } = require('ansi_up');
const ansiUp = new AnsiUp();

router.get('/', function (req, res, next) {
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
      (callback) => {
        const params = {
          course_id: res.locals.course.id,
        };
        sqldb.query(sql.questions, params, function (err, result) {
          if (ERR(err, callback)) return;
          const ci_ids = _.map(res.locals.authz_data.course_instances, (ci) => ci.id);
          res.locals.questions = _.map(result.rows, (row) => {
            if (row.sync_errors) row.sync_errors_ansified = ansiUp.ansi_to_html(row.sync_errors);
            if (row.sync_warnings) {
              row.sync_warnings_ansified = ansiUp.ansi_to_html(row.sync_warnings);
            }
            row.assessments = _.filter(row.assessments, (assessment) =>
              ci_ids.includes(assessment.course_instance_id)
            );
            return row;
          });
          res.locals.has_legacy_questions = _.some(result.rows, (row) => row.display_type !== 'v3');
          callback(null);
        });
      },
    ],
    (err) => {
      if (ERR(err, next)) return;
      res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    }
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
                res.locals.urlPrefix + '/question/' + result.rows[0].question_id + '/settings'
              );
            }
          );
        }
      });
    });
  } else {
    next(
      error.make(400, 'unknown __action: ' + req.body.__action, {
        locals: res.locals,
        body: req.body,
      })
    );
  }
});

module.exports = router;
