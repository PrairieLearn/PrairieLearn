const ERR = require('async-stacktrace');
const _ = require('lodash');
const express = require('express');
const router = express.Router();
const async = require('async');
const error = require('../../prairielib/lib/error');
const question = require('../../lib/question');
const sqldb = require('../../prairielib/lib/sql-db');
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const logPageView = require('../../middlewares/logPageView')(path.basename(__filename, '.js'));

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

function processIssue(req, res, callback) {
  const description = req.body.description;
  if (!_.isString(description) || description.length === 0) {
    return callback(new Error('A description of the issue must be provided'));
  }

  const variant_id = req.body.__variant_id;
  sqldb.callOneRow(
    'variants_ensure_question',
    [variant_id, res.locals.question.id],
    (err, _result) => {
      if (ERR(err, callback)) return;

      const course_data = _.pick(res.locals, ['variant', 'question', 'course_instance', 'course']);
      const params = [
        variant_id,
        description, // student message
        'instructor-reported issue', // instructor message
        true, // manually_reported
        true, // course_caused
        course_data,
        {}, // system_data
        res.locals.authn_user.user_id,
      ];
      sqldb.call('issues_insert_for_variant', params, (err) => {
        if (ERR(err, callback)) return;
        callback(null, variant_id);
      });
    }
  );
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
    processIssue(req, res, function (err, variant_id) {
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
