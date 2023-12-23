const util = require('util');
const ERR = require('async-stacktrace');
const _ = require('lodash');
const express = require('express');
const router = express.Router();
const async = require('async');

const error = require('@prairielearn/error');
const logPageView = require('../../middlewares/logPageView')('studentInstanceQuestion');
const grading = require('../../lib/grading');
const questionRender = require('../../lib/question-render');
const assessment = require('../../lib/assessment');
const studentInstanceQuestion = require('../shared/studentInstanceQuestion');
const sqldb = require('@prairielearn/postgres');
const { setQuestionCopyTargets } = require('../../lib/copy-question');

function processSubmission(req, res, callback) {
  if (!res.locals.assessment_instance.open) {
    return callback(error.make(400, 'assessment_instance is closed'));
  }
  if (!res.locals.instance_question.open) {
    return callback(error.make(400, 'instance_question is closed'));
  }
  if (!res.locals.authz_result.active) {
    return callback(error.make(400, 'This assessment is not accepting submissions at this time.'));
  }
  if (
    res.locals.assessment.group_config?.has_roles &&
    !res.locals.instance_question.group_role_permissions.can_submit
  ) {
    return callback(
      error.make(
        403,
        'Your current group role does not give you permission to submit to this question.',
      ),
    );
  }
  let variant_id, submitted_answer;
  if (res.locals.question.type === 'Freeform') {
    variant_id = req.body.__variant_id;
    submitted_answer = _.omit(req.body, ['__action', '__csrf_token', '__variant_id']);
  } else {
    if (!req.body.postData) {
      return callback(error.make(400, 'No postData', { locals: res.locals, body: req.body }));
    }
    let postData;
    try {
      postData = JSON.parse(req.body.postData);
    } catch (e) {
      return callback(
        error.make(400, 'JSON parse failed on body.postData', {
          locals: res.locals,
          body: req.body,
        }),
      );
    }
    variant_id = postData.variant ? postData.variant.id : null;
    submitted_answer = postData.submittedAnswer;
  }
  const submission = {
    variant_id: variant_id,
    auth_user_id: res.locals.authn_user.user_id,
    submitted_answer: submitted_answer,
    credit: res.locals.authz_result.credit,
    mode: res.locals.authz_data.mode,
    client_fingerprint_id: res.locals.client_fingerprint_id,
  };
  sqldb.callOneRow(
    'variants_ensure_instance_question',
    [submission.variant_id, res.locals.instance_question.id],
    (err, result) => {
      if (ERR(err, callback)) return;
      const variant = result.rows[0];
      if (req.body.__action === 'grade') {
        const overrideRateLimits = false;
        grading.saveAndGradeSubmission(
          submission,
          variant,
          res.locals.question,
          res.locals.course,
          overrideRateLimits,
          (err) => {
            if (ERR(err, callback)) return;
            callback(null, submission.variant_id);
          },
        );
      } else if (req.body.__action === 'save') {
        grading.saveSubmission(
          submission,
          variant,
          res.locals.question,
          res.locals.course,
          (err) => {
            if (ERR(err, callback)) return;
            callback(null, submission.variant_id);
          },
        );
      } else {
        callback(
          error.make(400, 'unknown __action', {
            locals: res.locals,
            body: req.body,
          }),
        );
      }
    },
  );
}

router.post('/', function (req, res, next) {
  if (res.locals.assessment.type !== 'Exam') return next();

  if (!res.locals.authz_result.authorized_edit) {
    return next(error.make(403, 'Not authorized', res.locals));
  }

  if (req.body.__action === 'grade' || req.body.__action === 'save') {
    if (res.locals.authz_result.time_limit_expired) {
      return next(
        error.make(403, 'time limit is expired, please go back and finish your assessment'),
      );
    }
    if (req.body.__action === 'grade' && !res.locals.assessment.allow_real_time_grading) {
      next(error.make(403, 'Real-time grading is not allowed for this assessment'));
      return;
    }
    processSubmission(req, res, function (err) {
      if (ERR(err, next)) return;
      res.redirect(req.originalUrl);
    });
  } else if (req.body.__action === 'timeLimitFinish') {
    // Only close if the timer expired due to time limit, not for access end
    if (!res.locals.assessment_instance_time_limit_expired) {
      return res.redirect(req.originalUrl);
    }

    const requireOpen = true;
    const closeExam = true;
    const overrideGradeRate = false;
    assessment.gradeAssessmentInstance(
      res.locals.assessment_instance.id,
      res.locals.authn_user.user_id,
      requireOpen,
      closeExam,
      overrideGradeRate,
      function (err) {
        if (ERR(err, next)) return;
        res.redirect(
          res.locals.urlPrefix +
            '/assessment_instance/' +
            res.locals.assessment_instance.id +
            '?timeLimitExpired=true',
        );
      },
    );
  } else if (req.body.__action === 'attach_file') {
    util.callbackify(studentInstanceQuestion.processFileUpload)(
      req,
      res,
      function (err, variant_id) {
        if (ERR(err, next)) return;
        res.redirect(
          res.locals.urlPrefix +
            '/instance_question/' +
            res.locals.instance_question.id +
            '/?variant_id=' +
            variant_id,
        );
      },
    );
  } else if (req.body.__action === 'attach_text') {
    util.callbackify(studentInstanceQuestion.processTextUpload)(
      req,
      res,
      function (err, variant_id) {
        if (ERR(err, next)) return;
        res.redirect(
          res.locals.urlPrefix +
            '/instance_question/' +
            res.locals.instance_question.id +
            '/?variant_id=' +
            variant_id,
        );
      },
    );
  } else if (req.body.__action === 'delete_file') {
    util.callbackify(studentInstanceQuestion.processDeleteFile)(
      req,
      res,
      function (err, variant_id) {
        if (ERR(err, next)) return;
        res.redirect(
          res.locals.urlPrefix +
            '/instance_question/' +
            res.locals.instance_question.id +
            '/?variant_id=' +
            variant_id,
        );
      },
    );
  } else if (req.body.__action === 'report_issue') {
    util.callbackify(studentInstanceQuestion.processIssue)(req, res, function (err, variant_id) {
      if (ERR(err, next)) return;
      res.redirect(
        res.locals.urlPrefix +
          '/instance_question/' +
          res.locals.instance_question.id +
          '/?variant_id=' +
          variant_id,
      );
    });
  } else {
    return next(
      error.make(400, 'unknown __action', {
        locals: res.locals,
        body: req.body,
      }),
    );
  }
});

router.get('/variant/:variant_id/submission/:submission_id', function (req, res, next) {
  questionRender.renderPanelsForSubmission(
    req.params.submission_id,
    res.locals.question.id,
    res.locals.instance_question.id,
    req.params.variant_id,
    res.locals.urlPrefix,
    null, // questionContext
    null, // csrfToken
    null, // authorizedEdit
    false, // renderScorePanels
    (err, results) => {
      if (ERR(err, next)) return;
      res.send({ submissionPanel: results.submissionPanel });
    },
  );
});

router.get('/', function (req, res, next) {
  if (res.locals.assessment.type !== 'Exam') return next();

  async.series(
    [
      (callback) => {
        const variant_id = null;
        questionRender.getAndRenderVariant(variant_id, null, res.locals, (err) => {
          if (ERR(err, callback)) return;
          callback(null);
        });
      },
      (callback) => {
        logPageView(req, res, (err) => {
          if (ERR(err, callback)) return;
          callback(null);
        });
      },
      async () => await setQuestionCopyTargets(res),
    ],
    (err) => {
      if (ERR(err, next)) return;
      questionRender.setRendererHeader(res);
      res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    },
  );
});

module.exports = router;
