const util = require('util');
const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();
const _ = require('lodash');

const error = require('@prairielearn/error');
const assessment = require('../../lib/assessment');
const studentAssessmentInstance = require('../shared/studentAssessmentInstance');
const sqldb = require('@prairielearn/postgres');
var groupAssessmentHelper = require('../../lib/groups');

const sql = sqldb.loadSqlEquiv(__filename);

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
    const requireOpen = true;
    assessment.gradeAssessmentInstance(
      res.locals.assessment_instance.id,
      res.locals.authn_user.user_id,
      requireOpen,
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

router.get('/', function (req, res, next) {
  if (res.locals.assessment.type !== 'Exam') return next();

  var params = {
    assessment_instance_id: res.locals.assessment_instance.id,
    user_id: res.locals.user.user_id,
  };
  sqldb.query(sql.select_instance_questions, params, function (err, result) {
    if (ERR(err, next)) return;
    res.locals.instance_questions = result.rows;

    res.locals.has_manual_grading_question = _.some(
      res.locals.instance_questions,
      (q) => q.max_manual_points || q.manual_points || q.requires_manual_grading
    );
    res.locals.has_auto_grading_question = _.some(
      res.locals.instance_questions,
      (q) => q.max_auto_points || q.auto_points || !q.max_points
    );

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
              hasRoles,
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
              res.locals.hasRoles = hasRoles;
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

module.exports = router;
