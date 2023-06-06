const ERR = require('async-stacktrace');
const _ = require('lodash');
const express = require('express');
const async = require('async');
const path = require('path');
const { callbackify } = require('util');
const sqldb = require('@prairielearn/postgres');
const error = require('@prairielearn/error');
const question = require('../../lib/question');
const issues = require('../../lib/issues');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const logPageView = require('../../middlewares/logPageView')(path.basename(__filename, '.js'));

const router = express.Router();

function processSubmission(req, res, callback) {
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
        })
      );
    }
    variant_id = postData.variant ? postData.variant.id : null;
    submitted_answer = postData.submittedAnswer;
  }
  const submission = {
    variant_id: variant_id,
    auth_user_id: res.locals.authn_user.user_id,
    submitted_answer: submitted_answer,
  };
  sqldb.callOneRow(
    'variants_ensure_question',
    [submission.variant_id, res.locals.question.id],
    (err, result) => {
      if (ERR(err, callback)) return;
      const variant = result.rows[0];
      if (req.body.__action === 'grade') {
        const overrideRateLimits = true;
        question.saveAndGradeSubmission(
          submission,
          variant,
          res.locals.question,
          res.locals.course,
          overrideRateLimits,
          (err) => {
            if (ERR(err, callback)) return;
            callback(null, submission.variant_id);
          }
        );
      } else if (req.body.__action === 'save') {
        question.saveSubmission(
          submission,
          variant,
          res.locals.question,
          res.locals.course,
          (err) => {
            if (ERR(err, callback)) return;
            callback(null, submission.variant_id);
          }
        );
      } else {
        callback(
          error.make(400, 'unknown __action', {
            locals: res.locals,
            body: req.body,
          })
        );
      }
    }
  );
}

async function processIssue(req, res, callback) {
  const description = req.body.description;
  if (!_.isString(description) || description.length === 0) {
    return callback(error.make(400, 'A description of the issue must be provided'));
  }

  const variantId = req.body.__variant_id;
  await sqldb.callOneRowAsync('variants_ensure_question', [variantId, res.locals.question.id]);
  await issues.insertIssue({
    variantId,
    studentMessage: description,
    instructorMessage: 'instructor-reported issue',
    manuallyReported: true,
    courseCaused: true,
    courseData: _.pick(res.locals, ['variant', 'question', 'course_instance', 'course']),
    systemData: {},
    authnUserId: res.locals.authn_user.user_id,
  });
  return variantId;
}

router.post('/', function (req, res, next) {
  if (req.body.__action === 'grade' || req.body.__action === 'save') {
    processSubmission(req, res, function (err, variant_id) {
      if (ERR(err, next)) return;
      res.redirect(
        res.locals.urlPrefix +
          '/question/' +
          res.locals.question.id +
          '/preview/?variant_id=' +
          variant_id
      );
    });
  } else if (req.body.__action === 'report_issue') {
    callbackify(processIssue)(req, res, function (err, variant_id) {
      if (ERR(err, next)) return;
      res.redirect(
        res.locals.urlPrefix +
          '/question/' +
          res.locals.question.id +
          '/preview/?variant_id=' +
          variant_id
      );
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

router.get('/variant/:variant_id/submission/:submission_id', function (req, res, next) {
  question.renderPanelsForSubmission(
    req.params.submission_id,
    res.locals.question.id,
    null, // instance_question_id,
    req.params.variant_id,
    res.locals.urlPrefix,
    null, // questionContext
    null, // csrfToken
    null, // authorizedEdit
    false, // renderScorePanels
    (err, results) => {
      if (ERR(err, next)) return;
      res.send({ submissionPanel: results.submissionPanel });
    }
  );
});

router.get('/', function (req, res, next) {
  var variant_seed = req.query.variant_seed ? req.query.variant_seed : null;
  debug(`variant_seed ${variant_seed}`);
  async.series(
    [
      (callback) => {
        // req.query.variant_id might be undefined, which will generate a new variant
        question.getAndRenderVariant(
          req.query.variant_id,
          variant_seed,
          res.locals,
          function (err) {
            if (ERR(err, callback)) return;
            callback(null);
          }
        );
      },
      (callback) => {
        logPageView(req, res, (err) => {
          if (ERR(err, next)) return;
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

module.exports = router;
