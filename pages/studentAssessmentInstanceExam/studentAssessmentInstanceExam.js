const util = require('util');
const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();

const error = require('../../prairielib/lib/error');
const assessment = require('../../lib/assessment');
const studentAssessmentInstance = require('../shared/studentAssessmentInstance');
const sqldb = require('../../prairielib/lib/sql-db');
const sqlLoader = require('../../prairielib/lib/sql-loader');

const sql = sqlLoader.loadSqlEquiv(__filename);

router.post('/', function (req, res, next) {
  if (res.locals.assessment.type !== 'Exam') return next();
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
  } else if (['grade', 'finish', 'timeLimitFinish'].includes(req.body.__action)) {
    const overrideGradeRate = false;
    var closeExam;
    if (req.body.__action === 'grade') {
      if (!res.locals.assessment.allow_real_time_grading) {
        next(error.make(403, 'Real-time grading is not allowed for this assessment'));
        return;
      }
      closeExam = false;
    } else if (req.body.__action === 'finish') {
      closeExam = true;
    } else if (req.body.__action === 'timeLimitFinish') {
      // Only close if the timer expired due to time limit, not for access end
      if (!res.locals.assessment_instance_time_limit_expired) {
        return res.redirect(req.originalUrl);
      }
      closeExam = true;
    } else {
      next(
        error.make(400, 'unknown __action', {
          locals: res.locals,
          body: req.body,
        })
      );
    }
    assessment.gradeAssessmentInstance(
      res.locals.assessment_instance.id,
      res.locals.authn_user.user_id,
      closeExam,
      overrideGradeRate,
      function (err) {
        if (ERR(err, next)) return;
        if (req.body.__action === 'timeLimitFinish') {
          res.redirect(req.originalUrl + '?timeLimitExpired=true');
        } else {
          res.redirect(req.originalUrl);
        }
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

router.get('/', function (req, res, next) {
  if (res.locals.assessment.type !== 'Exam') return next();

  var params = { assessment_instance_id: res.locals.assessment_instance.id };
  sqldb.query(sql.select_instance_questions, params, function (err, result) {
    if (ERR(err, next)) return;
    res.locals.instance_questions = result.rows;

    assessment.renderText(
      res.locals.assessment,
      res.locals.urlPrefix,
      function (err, assessment_text_templated) {
        if (ERR(err, next)) return;
        res.locals.assessment_text_templated = assessment_text_templated;

        res.locals.showTimeLimitExpiredModal = req.query.timeLimitExpired === 'true';
        res.locals.savedAnswers = 0;
        res.locals.suspendedSavedAnswers = 0;
        res.locals.instance_questions.forEach((question) => {
          if (question.status === 'saved') {
            if (question.allow_grade_left_ms > 0) {
              res.locals.suspendedSavedAnswers++;
            } else {
              res.locals.savedAnswers++;
            }
          }
        });

        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
      }
    );
  });
});

module.exports = router;
