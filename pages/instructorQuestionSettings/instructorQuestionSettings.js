const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();
const async = require('async');
const error = require('../../prairielib/lib/error');
const question = require('../../lib/question');
const sqldb = require('../../prairielib/lib/sql-db');
const sqlLoader = require('../../prairielib/lib/sql-loader');
const fs = require('fs-extra');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const logger = require('../../lib/logger');
const {
  QuestionRenameEditor,
  QuestionDeleteEditor,
  QuestionCopyEditor,
} = require('../../lib/editors');
const config = require('../../lib/config');
const sql = sqlLoader.loadSqlEquiv(__filename);
const { encodePath } = require('../../lib/uri-util');
const { idsEqual } = require('../../lib/id');

router.post('/', function (req, res, next) {
  if (req.body.__action === 'test_once') {
    if (!res.locals.authz_data.has_course_permission_view) {
      return next(error.make(403, 'Access denied (must be a course Viewer)'));
    }
    const count = 1;
    const showDetails = true;
    const assessmentGroupWork = res.locals.assessment ? res.locals.assessment.group_work : false;
    question.startTestQuestion(
      count,
      showDetails,
      res.locals.question,
      assessmentGroupWork,
      res.locals.course_instance,
      res.locals.course,
      res.locals.authn_user.user_id,
      (err, job_sequence_id) => {
        if (ERR(err, next)) return;
        res.redirect(res.locals.urlPrefix + '/jobSequence/' + job_sequence_id);
      }
    );
  } else if (req.body.__action === 'test_100') {
    if (!res.locals.authz_data.has_course_permission_view) {
      return next(error.make(403, 'Access denied (must be a course Viewer)'));
    }
    if (res.locals.question.grading_method !== 'External') {
      const count = 100;
      const showDetails = false;
      const assessmentGroupWork = res.locals.assessment ? res.locals.assessment.group_work : false;
      question.startTestQuestion(
        count,
        showDetails,
        res.locals.question,
        assessmentGroupWork,
        res.locals.course_instance,
        res.locals.course,
        res.locals.authn_user.user_id,
        (err, job_sequence_id) => {
          if (ERR(err, next)) return;
          res.redirect(res.locals.urlPrefix + '/jobSequence/' + job_sequence_id);
        }
      );
    } else {
      next(new Error('Not supported for externally-graded questions'));
    }
  } else if (req.body.__action === 'change_id') {
    debug(`Change qid from ${res.locals.question.qid} to ${req.body.id}`);
    if (!req.body.id) return next(new Error(`Invalid QID (was falsey): ${req.body.id}`));
    if (!/^[-A-Za-z0-9_/]+$/.test(req.body.id)) {
      return next(
        new Error(
          `Invalid QID (was not only letters, numbers, dashes, slashes, and underscores, with no spaces): ${req.body.id}`
        )
      );
    }
    let qid_new;
    try {
      qid_new = path.normalize(req.body.id);
    } catch (err) {
      return next(new Error(`Invalid QID (could not be normalized): ${req.body.id}`));
    }
    if (res.locals.question.qid === qid_new) {
      debug('The new qid is the same as the old qid - do nothing');
      res.redirect(req.originalUrl);
    } else {
      const editor = new QuestionRenameEditor({
        locals: res.locals,
        qid_new: qid_new,
      });
      editor.canEdit((err) => {
        if (ERR(err, next)) return;
        editor.doEdit((err, job_sequence_id) => {
          if (ERR(err, (e) => logger.error('Error in doEdit()', e))) {
            res.redirect(res.locals.urlPrefix + '/edit_error/' + job_sequence_id);
          } else {
            res.redirect(req.originalUrl);
          }
        });
      });
    }
  } else if (req.body.__action === 'copy_question') {
    debug('Copy question');
    if (idsEqual(req.body.to_course_id, res.locals.course.id)) {
      // In this case, we are making a duplicate of this question in the same course
      const editor = new QuestionCopyEditor({
        locals: res.locals,
      });
      editor.canEdit((err) => {
        if (ERR(err, next)) return;
        editor.doEdit((err, job_sequence_id) => {
          if (ERR(err, (e) => logger.error('Error in doEdit()', e))) {
            res.redirect(res.locals.urlPrefix + '/edit_error/' + job_sequence_id);
          } else {
            debug(
              `Get question_id from uuid=${editor.uuid} with course_id=${res.locals.course.id}`
            );
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
      // In this case, we are sending a copy of this question to a different course
      debug(`send copy of question: to_course_id = ${req.body.to_course_id}`);
      if (!res.locals.authz_data.has_course_permission_view) {
        return next(error.make(403, 'Access denied (must be a course Viewer)'));
      }
      let params = {
        from_course_id: res.locals.course.id,
        to_course_id: req.body.to_course_id,
        user_id: res.locals.user.user_id,
        transfer_type: 'CopyQuestion',
        from_filename: path.join(res.locals.course.path, 'questions', res.locals.question.qid),
      };
      async.waterfall(
        [
          (callback) => {
            const f = uuidv4();
            const relDir = path.join(f.slice(0, 3), f.slice(3, 6));
            params.storage_filename = path.join(relDir, f.slice(6));
            if (config.filesRoot == null) return callback(new Error('config.filesRoot is null'));
            fs.copy(
              params.from_filename,
              path.join(config.filesRoot, params.storage_filename),
              { errorOnExist: true },
              (err) => {
                if (ERR(err, callback)) return;
                callback(null);
              }
            );
          },
          (callback) => {
            sqldb.queryOneRow(sql.insert_file_transfer, params, (err, result) => {
              if (ERR(err, callback)) return;
              callback(null, result.rows[0]);
            });
          },
        ],
        (err, results) => {
          if (ERR(err, next)) return;
          res.redirect(
            `${res.locals.plainUrlPrefix}/course/${params.to_course_id}/file_transfer/${results.id}`
          );
        }
      );
    }
  } else if (req.body.__action === 'delete_question') {
    debug('Delete question');
    const editor = new QuestionDeleteEditor({
      locals: res.locals,
    });
    editor.canEdit((err) => {
      if (ERR(err, next)) return;
      editor.doEdit((err, job_sequence_id) => {
        if (ERR(err, (e) => logger.error('Error in doEdit()', e))) {
          res.redirect(res.locals.urlPrefix + '/edit_error/' + job_sequence_id);
        } else {
          res.redirect(res.locals.urlPrefix + '/course_admin/questions');
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

router.get('/', function (req, res, next) {
  async.series(
    [
      (callback) => {
        res.locals.questionGHLink = null;
        if (res.locals.course.repository) {
          const GHfound = res.locals.course.repository.match(
            /^git@github.com:\/?(.+?)(\.git)?\/?$/
          );
          if (GHfound) {
            res.locals.questionGHLink =
              'https://github.com/' +
              GHfound[1] +
              '/tree/master/questions/' +
              res.locals.question.qid;
          }
        } else if (res.locals.course.example_course) {
          res.locals.questionGHLink = `https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/${res.locals.question.qid}`;
        }
        callback(null);
      },
      (callback) => {
        sqldb.queryOneRow(sql.qids, { course_id: res.locals.course.id }, (err, result) => {
          if (ERR(err, callback)) return;
          res.locals.qids = result.rows[0].qids;
          callback(null);
        });
      },
      (callback) => {
        sqldb.query(
          sql.select_assessments_with_question_for_display,
          { question_id: res.locals.question.id },
          (err, result) => {
            if (ERR(err, callback)) return;
            res.locals.a_with_q_for_all_ci = result.rows[0].assessments_from_question_id;
            callback(null);
          }
        );
      },
    ],
    (err) => {
      if (ERR(err, next)) return;
      res.locals.infoPath = encodePath(
        path.join('questions', res.locals.question.qid, 'info.json')
      );
      res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    }
  );
});

module.exports = router;
