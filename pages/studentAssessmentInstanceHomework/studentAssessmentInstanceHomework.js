const util = require('util');
const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const _ = require('lodash');

const assessment = require('../../lib/assessment');
const studentAssessmentInstance = require('../shared/studentAssessmentInstance');
const error = require('../../prairielib/lib/error');
const sqldb = require('@prairielearn/postgres');
var groupAssessmentHelper = require('../../lib/groups');

const sql = sqldb.loadSqlEquiv(__filename);

const ensureUpToDate = (locals, callback) => {
  debug('ensureUpToDate()');
  assessment.update(locals.assessment_instance.id, locals.authn_user.user_id, (err, updated) => {
    if (ERR(err, callback)) return;

    debug('updated:', updated);
    if (!updated) return callback(null);

    // we updated the assessment_instance, so reload it

    debug('selecting assessment instance');
    const params = { assessment_instance_id: locals.assessment_instance.id };
    sqldb.queryOneRow(sql.select_assessment_instance, params, (err, result) => {
      if (ERR(err, callback)) return;
      locals.assessment_instance = result.rows[0];
      debug('selected assessment_instance.id:', locals.assessment_instance.id);
      callback(null);
    });
  });
};

router.get('/', function (req, res, next) {
  debug('GET');
  if (res.locals.assessment.type !== 'Homework') return next();
  debug('is Homework');

  ensureUpToDate(res.locals, (err) => {
    if (ERR(err, next)) return;

    debug('selecting questions');
    var params = {
      assessment_instance_id: res.locals.assessment_instance.id,
      user_id: res.locals.user.user_id,
    };
    sqldb.query(sql.get_questions, params, function (err, result) {
      if (ERR(err, next)) return;
      res.locals.questions = result.rows;
      debug('number of questions:', res.locals.questions.length);

      res.locals.has_manual_grading_question = _.some(
        res.locals.questions,
        (q) => q.max_manual_points || q.manual_points || q.requires_manual_grading
      );
      res.locals.has_auto_grading_question = _.some(
        res.locals.questions,
        (q) => q.max_auto_points || q.auto_points || !q.max_points
      );

      debug('rendering assessment text');
      assessment.renderText(
        res.locals.assessment,
        res.locals.urlPrefix,
        function (err, assessment_text_templated) {
          if (ERR(err, next)) return;
          res.locals.assessment_text_templated = assessment_text_templated;
          debug('rendering EJS');
          if (res.locals.assessment.group_work) {
            groupAssessmentHelper.getGroupInfo(
              res.locals.assessment.id,
              res.locals.user.user_id,
              function (
                err,
                groupMember,
                permissions,
                minsize,
                maxsize,
                groupsize,
                needsize,
                group_info,
                join_code,
                start,
                used_join_code
              ) {
                if (ERR(err, next)) return;
                res.locals.permissions = permissions;
                res.locals.minsize = minsize;
                res.locals.maxsize = maxsize;
                res.locals.groupsize = groupsize;
                res.locals.needsize = needsize;
                res.locals.group_info = group_info;
                if (!groupMember) {
                  return next(error.make(403, 'Not a group member', res.locals));
                } else {
                  res.locals.join_code = join_code;
                  res.locals.start = start;
                  res.locals.used_join_code = used_join_code;
                }
                res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
              }
            );
          } else {
            res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
          }
        }
      );
    });
  });
});

router.post('/', function (req, res, next) {
  if (res.locals.assessment.type !== 'Homework') return next();
  if (!res.locals.authz_result.authorized_edit) {
    return next(error.make(403, 'Not authorized', res.locals));
  }

  if (req.body.__action === 'attach_file') {
    util.callbackify(studentAssessmentInstance.processFileUpload)(req, res, function (err) {
      if (ERR(err, next)) return;
      res.redirect(req.originalUrl);
    });
  } else if (req.body.__action === 'attach_text') {
    util.callbackify(studentAssessmentInstance.processTextUpload)(req, res, function (err) {
      if (ERR(err, next)) return;
      res.redirect(req.originalUrl);
    });
  } else if (req.body.__action === 'delete_file') {
    util.callbackify(studentAssessmentInstance.processDeleteFile)(req, res, function (err) {
      if (ERR(err, next)) return;
      res.redirect(req.originalUrl);
    });
  } else if (req.body.__action === 'leave_group') {
    if (!res.locals.authz_result.active) return next(error.make(400, 'Unauthorized request.'));
    groupAssessmentHelper.leaveGroup(
      res.locals.assessment.id,
      res.locals.user.user_id,
      res.locals.authn_user.user_id,
      function (err) {
        if (ERR(err, next)) return;
        res.redirect(
          '/pl/course_instance/' +
            res.locals.course_instance.id +
            '/assessment/' +
            res.locals.assessment.id
        );
      }
    );
  } else {
    next(
      error.make(400, 'unknown __action', {
        locals: res.locals,
        body: req.body,
      })
    );
  }
});

module.exports = router;
