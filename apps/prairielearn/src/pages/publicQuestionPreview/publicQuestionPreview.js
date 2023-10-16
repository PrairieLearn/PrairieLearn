// @ts-check

import { selectQuestion } from '../../models/question';
import { selectCourse } from '../../models/course';
import { IdSchema, UserSchema } from '../../lib/db-types';
import { z } from 'zod'

const ERR = require('async-stacktrace');
const express = require('express');
const async = require('async');
const path = require('path');
const error = require('@prairielearn/error');
const question = require('../../lib/question');
const logPageView = require('../../middlewares/logPageView')(path.basename(__filename, '.js'));
const { processSubmission } = require('../../lib/questionPreview');

const router = express.Router({ mergeParams: true });

// TODO:
// -get navbar out of <main>
// -look at instructorQuestion.test.js, manualgrading.test.ts
// -tests: submitting an answer
// downloading dynamic content (clientfilesquestion/clientfilescourse)


async function setLocals(req, res) {
  res.locals.user = UserSchema.parse(res.locals.authn_user);
  res.locals.authz_data = { user: res.locals.user };
  res.locals.course = await selectCourse({ course_id: req.params.course_id });
  res.locals.question = await selectQuestion({ question_id: req.params.question_id });
  if (!res.locals.question.shared_publicly) {
    throw error.make(404, 'Not Found');
  }
  return;
}

router.post('/', function (req, res, next) {
  setLocals(req, res)
    .then(() => {
      if (req.body.__action === 'grade' || req.body.__action === 'save') {
        processSubmission(req, res, function (err, variant_id) {
          if (ERR(err, next)) return;
          res.redirect(
            res.locals.urlPrefix +
              '/question/' +
              res.locals.question.id +
              '/preview/?variant_id=' +
              variant_id,
          );
        });
      } else if (req.body.__action === 'report_issue') {
        // we don't care about reporting issues for public facing previews
      } else {
        next(
          error.make(400, 'unknown __action: ' + req.body.__action, {
            locals: res.locals,
            body: req.body,
          }),
        );
      }
    })
    .catch((err) => next(err));
});

router.get('/variant/:variant_id/submission/:submission_id', function (req, res, next) {
  setLocals(req, res)
    .then(() => {
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
        },
      );
    })
    .catch((err) => next(err));
});

router.get('/', function (req, res, next) {
  setLocals(req, res)
    .then(() => {
      const variant_seed = req.query.variant_seed ? z.string().parse(req.query.variant_seed) : null;
      const variant_id = req.query.variant_id ? IdSchema.parse(req.query.variant_id) : null;
      return async.series(
        [
          (callback) => {
            // req.query.variant_id might be undefined, which will generate a new variant
            question.getAndRenderVariant(
              variant_id,
              variant_seed,
              res.locals,
              function (err) {
                if (ERR(err, callback)) return;
                callback(null);
              },
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
          question.setRendererHeader(res);
          res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
        },
      );
    })
    .catch((err) => next(err));
});

module.exports = router;
